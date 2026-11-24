import { getOrCreateVisitorId } from "@/lib/storage";
import type {
  AuditStep,
  CatalogResponse,
  DesignResponse,
  ExportFormat,
  HealthResponse,
  KnockoutRequest,
  PipettingCalcRequest,
  PlasmidParseResponse,
  QuotaStatus,
  StrainSearchItem,
  VerifyCustomRequest,
  VerifyCustomResponse,
  WetLabProtocol,
  ZeroTrustVerificationReport,
} from "@/types/crispr";

export const API_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_API_BASE) ||
  "http://127.0.0.1:8000";

function buildUrl(path: string): string {
  const base = API_BASE.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

async function parseErrorMessage(res: Response): Promise<string> {
  try {
    const text = await res.text();
    if (!text) return `请求失败 (HTTP ${res.status})`;
    try {
      const json = JSON.parse(text) as { detail?: unknown; message?: string };
      if (typeof json.detail === "string") return json.detail;
      if (Array.isArray(json.detail)) {
        return json.detail
          .map((d) =>
            typeof d === "object" && d && "msg" in d
              ? String((d as { msg: string }).msg)
              : JSON.stringify(d)
          )
          .join("; ");
      }
      if (typeof json.message === "string") return json.message;
    } catch {
      return text.slice(0, 260);
    }
    return `请求失败 (HTTP ${res.status})`;
  } catch {
    return `网络响应解析失败 (HTTP ${res.status})`;
  }
}

export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch(buildUrl("/api/health"), {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as HealthResponse;
}

export async function fetchQuota(
  byokKey?: string,
  byokModel?: string
): Promise<QuotaStatus> {
  const headers: Record<string, string> = {
    "X-Visitor-Id": getOrCreateVisitorId(),
  };
  if (byokKey && byokKey.trim()) {
    headers["X-Byok-Active"] = "1";
    if (byokModel && byokModel.trim()) {
      headers["X-Byok-Model"] = byokModel.trim();
    }
  }
  const res = await fetch(buildUrl("/api/quota"), {
    method: "GET",
    headers,
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as QuotaStatus;
}

export async function fetchCatalog(): Promise<CatalogResponse> {
  const res = await fetch(buildUrl("/api/catalog"), {
    method: "GET",
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as CatalogResponse;
}

export async function parseEmptyPlasmid(
  genbankContent: string,
  filename?: string
): Promise<PlasmidParseResponse> {
  const res = await fetch(buildUrl("/api/plasmids/parse"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      genbank_content: genbankContent,
      filename: filename ?? null,
    }),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as PlasmidParseResponse;
}

export async function searchStrains(
  query: string,
  limit = 8
): Promise<StrainSearchItem[]> {
  const params = new URLSearchParams();
  params.set("q", query.trim());
  params.set("limit", String(limit));
  const res = await fetch(
    buildUrl(`/api/genome/search?${params.toString()}`),
    {
      method: "GET",
      cache: "no-store",
    }
  );
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as StrainSearchItem[];
}

export async function runDesignSync(
  req: KnockoutRequest,
  signal?: AbortSignal
): Promise<DesignResponse> {
  const res = await fetch(buildUrl("/api/design"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Visitor-Id": getOrCreateVisitorId(),
    },
    body: JSON.stringify(req),
    signal,
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as DesignResponse;
}

function isAuditStep(obj: unknown): obj is AuditStep {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "stage" in obj &&
    "tool_name" in obj &&
    "status" in obj
  );
}

function isDesignResponse(obj: unknown): obj is DesignResponse {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "run_id" in obj &&
    "locus" in obj &&
    "verification_report" in obj
  );
}

/**
 * Consume POST /api/design/stream SSE stream with real-time AuditStep callbacks,
 * automatically falling back to POST /api/design if SSE is unavailable.
 */
export async function runDesignStream(
  req: KnockoutRequest,
  onStep: (step: AuditStep) => void,
  onResult: (result: DesignResponse) => void,
  onError: (message: string) => void,
  signal?: AbortSignal
): Promise<void> {
  try {
    const res = await fetch(buildUrl("/api/design/stream"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "text/event-stream",
        "X-Visitor-Id": getOrCreateVisitorId(),
      },
      body: JSON.stringify(req),
      signal,
    });

    if (res.status === 404 || res.status === 405) {
      const result = await runDesignSync(req, signal);
      result.audit_trace.forEach((s) => onStep(s));
      onResult(result);
      return;
    }

    if (!res.ok) {
      throw new Error(await parseErrorMessage(res));
    }

    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const result = (await res.json()) as DesignResponse;
      result.audit_trace.forEach((s) => onStep(s));
      onResult(result);
      return;
    }

    if (!res.body) {
      const result = await runDesignSync(req, signal);
      result.audit_trace.forEach((s) => onStep(s));
      onResult(result);
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let receivedTerminal = false;

    const processEventBlock = (block: string) => {
      const lines = block.split(/\r?\n/);
      let eventType = "message";
      const dataLines: string[] = [];

      for (const rawLine of lines) {
        const line = rawLine.trimEnd();
        if (!line || line.startsWith(":")) continue;
        if (line.startsWith("event:")) {
          eventType = line.slice(6).trim();
        } else if (line.startsWith("data:")) {
          dataLines.push(line.slice(5).trimStart());
        }
      }

      if (dataLines.length === 0) return;
      const payloadStr = dataLines.join("\n").trim();
      if (!payloadStr || payloadStr === "[DONE]") return;

      let parsed: unknown;
      try {
        parsed = JSON.parse(payloadStr);
      } catch {
        return;
      }

      const wrapped = parsed as {
        event?: string;
        type?: string;
        step?: AuditStep;
        result?: DesignResponse;
        data?: unknown;
        error?: string;
        message?: string;
        detail?: string;
      };

      const effectiveType = (
        eventType !== "message"
          ? eventType
          : wrapped.event || wrapped.type || "message"
      ).toLowerCase();

      if (effectiveType === "error") {
        const errMsg =
          wrapped.message ||
          wrapped.error ||
          wrapped.detail ||
          (typeof wrapped.data === "string" ? wrapped.data : "后端流式处理异常");
        receivedTerminal = true;
        onError(errMsg);
        return;
      }

      if (effectiveType === "step" || effectiveType === "audit_step") {
        const candidate = isAuditStep(parsed)
          ? parsed
          : (wrapped.step ?? wrapped.data);
        if (isAuditStep(candidate)) {
          onStep(candidate);
          return;
        }
      }

      if (
        effectiveType === "result" ||
        effectiveType === "complete" ||
        effectiveType === "final"
      ) {
        const candidate = isDesignResponse(parsed)
          ? parsed
          : (wrapped.result ?? wrapped.data);
        if (isDesignResponse(candidate)) {
          receivedTerminal = true;
          onResult(candidate);
          return;
        }
      }

      // Fallback shape-based dispatch
      if (isDesignResponse(parsed)) {
        receivedTerminal = true;
        onResult(parsed);
      } else if (isAuditStep(parsed)) {
        onStep(parsed);
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? "";

      for (const block of parts) {
        processEventBlock(block);
      }
    }

    if (buffer.trim()) {
      processEventBlock(buffer);
    }

    if (!receivedTerminal) {
      const result = await runDesignSync(req, signal);
      onResult(result);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      onError("设计任务已手动中止。");
      return;
    }
    const msg =
      err instanceof Error
        ? err.message
        : "连接设计引擎失败，请确认后端服务 (127.0.0.1:8000) 已启动。";
    onError(msg);
  }
}

export async function reverifyDesign(
  payload: VerifyCustomRequest
): Promise<VerifyCustomResponse> {
  const res = await fetch(buildUrl("/api/verify"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  const raw = (await res.json()) as
    | VerifyCustomResponse
    | ZeroTrustVerificationReport;

  if ("verification_report" in raw) {
    return raw;
  }
  return {
    verification_report: raw,
    all_primers: [],
  };
}

export async function recalculateWetlab(
  req: PipettingCalcRequest
): Promise<WetLabProtocol> {
  const res = await fetch(buildUrl("/api/wetlab/calculate"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  return (await res.json()) as WetLabProtocol;
}

const EXPORT_FALLBACK_FILENAMES: Record<
  ExportFormat,
  (gene: string) => string
> = {
  bundle_zip: (g) => `${g}_CRISPR_Forge_BenchPack.zip`,
  primers_xlsx: (g) => `${g}_primers_order.xlsx`,
  sop_md: (g) => `${g}_wetlab_SOP.md`,
  gb_wt: (g) => `${g}_WT_locus.gb`,
  gb_ko: (g) => `${g}_KO_edited.gb`,
  gb_donor: (g) => `${g}_Donor_DNA.gb`,
  gb_plasmid: (g) => `${g}_sgRNA_cassette.gb`,
};

export async function downloadExport(
  design: DesignResponse,
  fmt: ExportFormat
): Promise<void> {
  const res = await fetch(buildUrl(`/api/export/${fmt}`), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(design),
  });

  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }

  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition") || "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const asciiMatch = disposition.match(/filename="?([^";]+)"?/i);
  const fallbackName = EXPORT_FALLBACK_FILENAMES[fmt](
    design.locus.gene_name || "target"
  );
  const filename = utf8Match
    ? decodeURIComponent(utf8Match[1])
    : asciiMatch
      ? asciiMatch[1]
      : fallbackName;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
}
