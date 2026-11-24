import type {
  ByokConfig,
  CustomPlasmidConfig,
  CustomPolymeraseConfig,
  ThemeMode,
} from "@/types/crispr";

const BYOK_STORAGE_KEY = "crispr_forge_byok_v1";
const VISITOR_ID_KEY = "crispr_forge_visitor_id_v1";
const THEME_STORAGE_KEY = "crispr_forge_theme";
const FONT_SCALE_PCT_KEY = "crispr_forge_font_scale_pct";
const LEGACY_FONT_SCALE_KEY = "crispr_forge_font_scale";
const SIDEBAR_COLLAPSED_KEY = "crispr_forge_sidebar_collapsed";
const CUSTOM_POLYMERASES_KEY = "crispr_forge_custom_polymerases";
const CUSTOM_PLASMIDS_KEY = "crispr_forge_custom_plasmids";
const LEGACY_CUSTOM_PLASMIDS_KEY = "crispr_forge_custom_plasmids_v1";
const ONBOARDING_SEEN_KEY = "crispr_forge_onboarding_seen_v1";

export const MIN_FONT_SCALE_PCT = 84;
export const MAX_FONT_SCALE_PCT = 120;
export const DEFAULT_FONT_SCALE_PCT = 100;

export const EMPTY_BYOK: ByokConfig = {
  apiKey: "",
  baseUrl: "https://api.deepseek.com/v1",
  model: "deepseek-chat",
  providerId: "deepseek",
};

export function clampFontScalePct(pct: number): number {
  if (!Number.isFinite(pct)) return DEFAULT_FONT_SCALE_PCT;
  return Math.max(
    MIN_FONT_SCALE_PCT,
    Math.min(MAX_FONT_SCALE_PCT, Math.round(pct))
  );
}

export function getOrCreateVisitorId(): string {
  if (typeof window === "undefined") return "ssr";
  try {
    const existing = window.localStorage.getItem(VISITOR_ID_KEY);
    if (existing && existing.trim()) return existing;
    const generated =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    window.localStorage.setItem(VISITOR_ID_KEY, generated);
    return generated;
  } catch {
    return "anon";
  }
}

export function loadByokConfig(): ByokConfig {
  if (typeof window === "undefined") return EMPTY_BYOK;
  try {
    const raw = window.localStorage.getItem(BYOK_STORAGE_KEY);
    if (!raw) return EMPTY_BYOK;
    const parsed = JSON.parse(raw) as Partial<ByokConfig>;
    return {
      apiKey: typeof parsed.apiKey === "string" ? parsed.apiKey : "",
      baseUrl:
        typeof parsed.baseUrl === "string" && parsed.baseUrl.trim()
          ? parsed.baseUrl
          : EMPTY_BYOK.baseUrl,
      model:
        typeof parsed.model === "string" && parsed.model.trim()
          ? parsed.model
          : EMPTY_BYOK.model,
      providerId:
        typeof parsed.providerId === "string" ? parsed.providerId : "deepseek",
    };
  } catch {
    return EMPTY_BYOK;
  }
}

export function saveByokConfig(cfg: ByokConfig): void {
  if (typeof window === "undefined") return;
  try {
    if (!cfg.apiKey.trim()) {
      window.localStorage.removeItem(BYOK_STORAGE_KEY);
    } else {
      window.localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(cfg));
    }
  } catch {
    // ignore
  }
}

export function clearByokConfig(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BYOK_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function loadThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // ignore
  }
  return "system";
}

export function saveThemeMode(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

export function applyThemeToDocument(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  const root = document.documentElement;
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : mode;
  root.setAttribute("data-theme", resolved);
  if (resolved === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function loadFontScalePct(): number {
  if (typeof window === "undefined") return DEFAULT_FONT_SCALE_PCT;
  try {
    const rawPct = window.localStorage.getItem(FONT_SCALE_PCT_KEY);
    if (rawPct !== null) {
      const parsed = parseInt(rawPct, 10);
      if (!Number.isNaN(parsed)) return clampFontScalePct(parsed);
    }
    // Seamless migration from v2 3-step scale
    const legacy = window.localStorage.getItem(LEGACY_FONT_SCALE_KEY);
    if (legacy === "compact") return 92;
    if (legacy === "large") return 112;
  } catch {
    // ignore
  }
  return DEFAULT_FONT_SCALE_PCT;
}

export function saveFontScalePct(pct: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      FONT_SCALE_PCT_KEY,
      String(clampFontScalePct(pct))
    );
  } catch {
    // ignore
  }
}

export function applyFontScaleToDocument(pct: number): void {
  if (typeof window === "undefined") return;
  const clamped = clampFontScalePct(pct);
  document.documentElement.style.fontSize = `${((16 * clamped) / 100).toFixed(2)}px`;
}

export function loadSidebarCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
  } catch {
    // ignore
  }
}

export function loadCustomPolymerases(): CustomPolymeraseConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CUSTOM_POLYMERASES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CustomPolymeraseConfig =>
        Boolean(item) &&
        typeof item.name === "string" &&
        item.name.trim().length > 0
    );
  } catch {
    return [];
  }
}

export function saveCustomPolymerases(list: CustomPolymeraseConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_POLYMERASES_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function loadCustomPlasmids(): CustomPlasmidConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw =
      window.localStorage.getItem(CUSTOM_PLASMIDS_KEY) ??
      window.localStorage.getItem(LEGACY_CUSTOM_PLASMIDS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CustomPlasmidConfig =>
        Boolean(item) &&
        typeof item.name === "string" &&
        item.name.trim().length > 0
    );
  } catch {
    return [];
  }
}

export function saveCustomPlasmids(list: CustomPlasmidConfig[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CUSTOM_PLASMIDS_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function hasSeenOnboarding(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(ONBOARDING_SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function markOnboardingSeen(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ONBOARDING_SEEN_KEY, "1");
  } catch {
    // ignore
  }
}
