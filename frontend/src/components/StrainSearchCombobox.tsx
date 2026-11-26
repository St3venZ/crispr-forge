"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Database,
  Globe,
  HardDrive,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { searchStrains } from "@/lib/api";
import { MODEL_STRAINS } from "@/lib/constants";
import type { StrainSearchItem } from "@/types/crispr";

interface StrainSearchComboboxProps {
  accession: string;
  onChangeAccession: (nextAccession: string, matched?: StrainSearchItem) => void;
}

const ACCESSION_LIKE_RE = /^(NC|NZ|CP|AE|BA|BX|AP|LN|LT|LR|CM|U)[A-Z0-9_.-]{4,}$/i;

function buildLocalFallback(query: string): StrainSearchItem[] {
  const q = query.trim().toLowerCase();
  return MODEL_STRAINS.filter(
    (s) =>
      !q ||
      s.label.toLowerCase().includes(q) ||
      s.accession.toLowerCase().includes(q) ||
      s.badge.toLowerCase().includes(q)
  ).map((s) => ({
    accession: s.accession,
    organism: s.label,
    title: s.badge,
    length_bp: s.accession === "NC_000913.3" ? 4641652 : null,
    is_cached: s.accession === "NC_000913.3",
    source: "local_curated",
  }));
}

function formatMb(lengthBp?: number | null): string | null {
  if (!lengthBp || lengthBp <= 0) return null;
  return `${(lengthBp / 1_000_000).toFixed(2)} Mb`;
}

export function StrainSearchCombobox({
  accession,
  onChangeAccession,
}: StrainSearchComboboxProps) {
  const [query, setQuery] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<StrainSearchItem[]>(() =>
    buildLocalFallback("")
  );
  const [isLoading, setIsLoading] = useState(false);
  const [selectedLabel, setSelectedLabel] = useState<string>("");

  const boxRef = useRef<HTMLDivElement | null>(null);

  // Sync display label if parent changes accession externally (e.g., clicking a demo chip)
  useEffect(() => {
    const known = MODEL_STRAINS.find(
      (s) => s.accession.toUpperCase() === accession.trim().toUpperCase()
    );
    if (known) {
      setSelectedLabel(known.label);
    }
  }, [accession]);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onOutside);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  // Debounced (320ms) live call to GET /api/genome/search?q=...&limit=8
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const trimmed = query.trim();

    if (!trimmed) {
      setResults(buildLocalFallback(""));
    }

    const timer = window.setTimeout(async () => {
      setIsLoading(true);
      try {
        const items = await searchStrains(trimmed, 8);
        if (!cancelled) {
          setResults(items.length > 0 ? items : buildLocalFallback(trimmed));
        }
      } catch {
        if (!cancelled) {
          setResults(buildLocalFallback(trimmed));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, open]);

  const trimmedQuery = query.trim();
  const looksLikeRawAccession = useMemo(
    () =>
      ACCESSION_LIKE_RE.test(trimmedQuery) &&
      !results.some(
        (r) => r.accession.toUpperCase() === trimmedQuery.toUpperCase()
      ),
    [trimmedQuery, results]
  );

  const handleSelectItem = (item: StrainSearchItem) => {
    onChangeAccession(item.accession, item);
    setSelectedLabel(item.organism);
    setQuery("");
    setOpen(false);
  };

  const handleUseRawAccession = () => {
    if (!trimmedQuery) return;
    onChangeAccession(trimmedQuery.toUpperCase());
    setSelectedLabel("");
    setQuery("");
    setOpen(false);
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
      {/* Live Searchable RefSeq Strain Combobox */}
      <div ref={boxRef} className="relative md:col-span-8">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <input
            type="text"
            value={query}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              const nextVal = e.target.value;
              setQuery(nextVal);
              setOpen(true);
              // Direct raw RefSeq paste support
              if (ACCESSION_LIKE_RE.test(nextVal.trim())) {
                onChangeAccession(nextVal.trim());
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmedQuery) {
                e.preventDefault();
                if (looksLikeRawAccession) {
                  handleUseRawAccession();
                } else if (results.length > 0) {
                  handleSelectItem(results[0]);
                }
              }
            }}
            placeholder={
              selectedLabel
                ? `当前已选：${selectedLabel}（点击输入中文/英文菌名或编号重新检索）`
                : "搜菌株中英文名（如 大肠杆菌 / BL21 / 假单胞 / Streptomyces）或粘贴 NC_/NZ_ 编号..."
            }
            className="neu-input w-full py-3 pl-10 pr-9 text-sm"
          />

          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-primary)]" />
            )}
            {query && !isLoading && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setOpen(true);
                }}
                className="rounded-full p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                aria-label="清空菌株搜索词"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Dropdown Candidates Panel */}
        {open && (
          <div className="neu-popover absolute left-0 right-0 z-40 mt-2.5 overflow-hidden">
            <div className="neu-divider-b flex items-center justify-between px-4 py-2.5 text-xs text-[var(--text-muted)] dark:bg-[var(--bg-subtle)]/75">
              <span className="inline-flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
                {isLoading
                  ? "正在检索本地精选底盘与 NCBI RefSeq 基因组..."
                  : trimmedQuery
                    ? `匹配到 ${results.length} 个原核 RefSeq 候选底盘`
                    : "常用原核底盘（支持直接输入任意中/英文菌名实时查 NCBI）"}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="font-medium hover:text-[var(--text-primary)] cursor-pointer"
              >
                关闭
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto divide-y divide-[var(--border-hairline)]/60">
              {/* Direct raw accession quick-apply option */}
              {looksLikeRawAccession && (
                <button
                  type="button"
                  onClick={handleUseRawAccession}
                  className="flex w-full items-center justify-between gap-2 bg-[var(--accent-soft)] px-4 py-2.5 text-left text-xs font-medium text-accent hover:opacity-90 cursor-pointer"
                >
                  <span>
                    直接使用输入的 RefSeq 编号：
                    <code className="ml-1 font-mono-bio font-semibold">
                      {trimmedQuery.toUpperCase()}
                    </code>
                  </span>
                  <span className="neu-pill px-2.5 py-0.5 text-xs">
                    回车应用
                  </span>
                </button>
              )}

              {results.length === 0 && !isLoading ? (
                <div className="px-4 py-5 text-center text-xs text-[var(--text-muted)]">
                  未检索到匹配菌株，请尝试英文属名（如{" "}
                  <code className="font-mono-bio">Pseudomonas putida</code>）或在右侧直接输入 RefSeq 编号。
                </div>
              ) : (
                results.map((item) => {
                  const isSelected =
                    item.accession.toUpperCase() ===
                    accession.trim().toUpperCase();
                  const mb = formatMb(item.length_bp);
                  return (
                    <button
                      key={`${item.source}-${item.accession}`}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition cursor-pointer ${
                        isSelected
                          ? "bg-[var(--accent-soft)]"
                          : "hover:bg-white/40 dark:hover:bg-[var(--bg-subtle)]"
                      }`}
                    >
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="neu-recessed rounded-full dark:rounded px-2 py-0.5 font-mono-bio text-xs font-bold text-accent">
                            {item.accession}
                          </span>
                          <span className="text-sm font-bold text-[var(--text-primary)] truncate">
                            {item.organism}
                          </span>
                          {mb && (
                            <span className="font-mono-bio text-xs text-[var(--text-muted)]">
                              {mb}
                            </span>
                          )}
                        </div>
                        {item.title && (
                          <p className="truncate text-xs text-[var(--text-muted)]">
                            {item.title}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                        {item.is_cached ? (
                          <span className="inline-flex items-center gap-1 rounded-full dark:rounded bg-[#4ecdc4]/20 px-2.5 py-0.5 text-xs font-medium text-[#1a7871] dark:border dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-300">
                            <HardDrive className="h-3 w-3" />
                            本地已缓存
                          </span>
                        ) : item.source === "ncbi_live" ? (
                          <span className="inline-flex items-center gap-1 rounded-full dark:rounded bg-[var(--accent-soft)] px-2.5 py-0.5 text-xs font-medium text-accent dark:border dark:border-[var(--accent-border)]">
                            <Globe className="h-3 w-3" />
                            NCBI 实时抓取
                          </span>
                        ) : (
                          <span className="neu-recessed inline-flex items-center gap-1 rounded-full dark:rounded px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]">
                            <Globe className="h-3 w-3" />
                            NCBI 实时抓取
                          </span>
                        )}
                        {isSelected && (
                          <Check className="h-4 w-4 text-[var(--accent-primary)]" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Direct Raw RefSeq Accession Override Input */}
      <div className="md:col-span-4">
        <input
          type="text"
          value={accession}
          onChange={(e) => {
            onChangeAccession(e.target.value);
            setSelectedLabel("");
          }}
          placeholder="RefSeq 编号，如 NC_000913.3"
          aria-label="直接输入 RefSeq Accession 编号"
          className="neu-input w-full px-4 py-3 font-mono-bio text-sm font-medium"
        />
      </div>
    </div>
  );
}
