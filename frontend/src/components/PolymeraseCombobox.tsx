"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  FlaskConical,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import {
  DEFAULT_CUSTOM_POLYMERASE,
  FALLBACK_POLYMERASE_CATALOG,
} from "@/lib/constants";
import type {
  CustomPolymeraseConfig,
  PolymeraseCatalogItem,
} from "@/types/crispr";

interface PolymeraseComboboxProps {
  polymerases: PolymeraseCatalogItem[];
  customPolymerases: CustomPolymeraseConfig[];
  value: string;
  customValue?: CustomPolymeraseConfig | null;
  onChange: (name: string, customCfg: CustomPolymeraseConfig | null) => void;
  onSaveCustom: (cfg: CustomPolymeraseConfig) => void;
  onDeleteCustom: (name: string) => void;
  compact?: boolean;
}

export function PolymeraseCombobox({
  polymerases,
  customPolymerases,
  value,
  customValue,
  onChange,
  onSaveCustom,
  onDeleteCustom,
  compact = false,
}: PolymeraseComboboxProps) {
  const catalog =
    polymerases.length > 0 ? polymerases : FALLBACK_POLYMERASE_CATALOG;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [draft, setDraft] = useState<CustomPolymeraseConfig>(
    DEFAULT_CUSTOM_POLYMERASE
  );

  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  useEffect(() => {
    if (open && !showCustomForm) {
      window.setTimeout(() => searchRef.current?.focus(), 40);
    }
  }, [open, showCustomForm]);

  const activeSpec = useMemo(() => {
    const customMatch =
      customPolymerases.find((c) => c.name === value) ||
      (customValue && customValue.name === value ? customValue : null);
    if (customMatch) {
      return {
        id: customMatch.name,
        vendor: customMatch.vendor,
        category: "自定义聚合酶",
        extension_sec_per_kb: customMatch.extension_sec_per_kb,
        denature_c: customMatch.denature_c,
        ext_c: customMatch.ext_c,
        anneal_offset_c: customMatch.anneal_offset_c,
        summary: customMatch.summary,
        isCustom: true,
      };
    }
    const builtIn = catalog.find((p) => p.id === value) || catalog[0];
    return {
      ...builtIn,
      isCustom: false,
    };
  }, [catalog, customPolymerases, value, customValue]);

  const normQuery = query.trim().toLowerCase();

  const filteredCustom = useMemo(() => {
    if (!normQuery) return customPolymerases;
    return customPolymerases.filter((c) =>
      `${c.name} ${c.vendor} ${c.mix_name} ${c.summary} 自定义`
        .toLowerCase()
        .includes(normQuery)
    );
  }, [customPolymerases, normQuery]);

  const groupedBuiltIn = useMemo(() => {
    const filtered = normQuery
      ? catalog.filter((item) =>
          `${item.id} ${item.vendor} ${item.category} ${item.mix_name} ${item.tags.join(" ")} ${item.summary}`
            .toLowerCase()
            .includes(normQuery)
        )
      : catalog;

    const groups = new Map<string, PolymeraseCatalogItem[]>();
    for (const item of filtered) {
      const list = groups.get(item.vendor) || [];
      list.push(item);
      groups.set(item.vendor, list);
    }
    return Array.from(groups.entries());
  }, [catalog, normQuery]);

  const handleCreateCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedName = draft.name.trim();
    if (!cleanedName) return;
    const finalCfg: CustomPolymeraseConfig = {
      ...draft,
      name: cleanedName,
      vendor: draft.vendor.trim() || "Custom Lab",
      mix_name: draft.mix_name.trim() || `2x ${cleanedName} Master Mix`,
      summary:
        draft.summary.trim() ||
        `${draft.extension_sec_per_kb} s/kb · ${draft.denature_c}°C/${draft.ext_c}°C`,
    };
    onSaveCustom(finalCfg);
    onChange(finalCfg.name, finalCfg);
    setShowCustomForm(false);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-left transition hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-soft)] cursor-pointer ${
          compact ? "px-3 py-2" : "px-3.5 py-2.5"
        }`}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <FlaskConical className="h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
            <span className="truncate text-sm font-semibold text-[var(--text-primary)]">
              {activeSpec.id}
            </span>
            {activeSpec.isCustom && (
              <span className="rounded border border-[var(--accent-border)] bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-sky-300">
                自定义
              </span>
            )}
          </div>
          {!compact && (
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>{activeSpec.vendor}</span>
              <span>·</span>
              <span className="font-mono-bio font-semibold text-blue-700 dark:text-sky-300">
                {activeSpec.extension_sec_per_kb} s/kb
              </span>
              <span>·</span>
              <span className="font-mono-bio">
                {activeSpec.denature_c}°C / {activeSpec.ext_c}°C
              </span>
            </div>
          )}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--text-muted)] transition-transform ${
            open ? "rotate-180 text-[var(--accent-primary)]" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 min-w-[320px] max-w-[480px] overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface-elevated)] shadow-2xl dark:shadow-black/60">
          {!showCustomForm ? (
            <>
              <div className="border-b border-[var(--border-hairline)] p-3">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜索酶名、品牌、极速、高GC、诺唯赞、KOD、Q5..."
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] py-2 pl-9 pr-8 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                  />
                  {query && (
                    <button
                      type="button"
                      onClick={() => setQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto p-2 space-y-3">
                {filteredCustom.length > 0 && (
                  <div className="space-y-1">
                    <div className="px-2.5 py-1 text-xs font-bold text-blue-700 dark:text-sky-300 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5" />
                      我的自定义聚合酶 ({filteredCustom.length})
                    </div>
                    {filteredCustom.map((cfg) => {
                      const isSelected = value === cfg.name;
                      return (
                        <div
                          key={cfg.name}
                          onClick={() => {
                            onChange(cfg.name, cfg);
                            setOpen(false);
                          }}
                          className={`group flex items-start justify-between gap-2 rounded-lg px-3 py-2.5 transition cursor-pointer ${
                            isSelected
                              ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent-border)]"
                              : "hover:bg-[var(--bg-subtle)]"
                          }`}
                        >
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-[var(--text-primary)]">
                                {cfg.name}
                              </span>
                              <span className="rounded border border-[var(--accent-border)] bg-[var(--accent-soft)] px-1.5 py-0.5 font-mono-bio text-xs font-semibold text-blue-700 dark:text-sky-300">
                                {cfg.extension_sec_per_kb} s/kb
                              </span>
                              <span className="font-mono-bio text-xs text-[var(--text-muted)]">
                                {cfg.denature_c}°C / {cfg.ext_c}°C
                              </span>
                            </div>
                            <p className="text-xs text-[var(--text-muted)]">
                              {cfg.vendor} · 退火偏移{" "}
                              {cfg.anneal_offset_c >= 0
                                ? `+${cfg.anneal_offset_c}`
                                : cfg.anneal_offset_c}
                              °C
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {isSelected && (
                              <Check className="h-4 w-4 text-[var(--accent-primary)]" />
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onDeleteCustom(cfg.name);
                                if (isSelected) {
                                  onChange(catalog[0].id, null);
                                }
                              }}
                              className="rounded-md p-1 text-[var(--text-muted)] hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15 dark:hover:text-rose-400 cursor-pointer"
                              title="删除此自定义聚合酶"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {groupedBuiltIn.map(([vendor, items]) => (
                  <div key={vendor} className="space-y-1">
                    <div className="px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-[var(--text-muted)]">
                      {vendor}
                    </div>
                    {items.map((item) => {
                      const isSelected = value === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            onChange(item.id, null);
                            setOpen(false);
                          }}
                          className={`flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2.5 text-left transition cursor-pointer ${
                            isSelected
                              ? "bg-[var(--accent-soft)] ring-1 ring-[var(--accent-border)]"
                              : "hover:bg-[var(--bg-subtle)]"
                          }`}
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-[var(--text-primary)]">
                                {item.id}
                              </span>
                              <span className="rounded border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-1.5 py-0.5 font-mono-bio text-xs font-semibold text-blue-700 dark:text-sky-300">
                                {item.extension_sec_per_kb} s/kb
                              </span>
                              <span className="font-mono-bio text-xs text-[var(--text-muted)]">
                                {item.denature_c}°C / {item.ext_c}°C
                              </span>
                            </div>
                            <p className="text-xs leading-snug text-[var(--text-muted)]">
                              {item.summary}
                            </p>
                          </div>
                          {isSelected && (
                            <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}

                {groupedBuiltIn.length === 0 && filteredCustom.length === 0 && (
                  <div className="py-6 text-center text-sm text-[var(--text-muted)]">
                    未找到匹配的聚合酶，点击下方按钮自定义您的实验室酶参数
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)]/70 p-2.5">
                <button
                  type="button"
                  onClick={() => {
                    setDraft({ ...DEFAULT_CUSTOM_POLYMERASE });
                    setShowCustomForm(true);
                  }}
                  className="btn-outline flex w-full items-center justify-center gap-2 rounded-lg border-dashed px-3 py-2 text-sm font-semibold text-blue-700 dark:text-sky-300 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  自定义实验室聚合酶 (自动同步 PCR 程序)
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={handleCreateCustom} className="p-4 space-y-3.5">
              <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-2.5">
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  新增自定义实验室聚合酶
                </span>
                <button
                  type="button"
                  onClick={() => setShowCustomForm(false)}
                  className="rounded-lg p-1 text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                    聚合酶名称 *
                  </label>
                  <input
                    type="text"
                    required
                    value={draft.name}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    placeholder="如 ApexHF HS Master Mix"
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                    品牌 / 厂商
                  </label>
                  <input
                    type="text"
                    value={draft.vendor}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, vendor: e.target.value }))
                    }
                    placeholder="如 艾科瑞 / 诺唯赞 / 自制"
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-1.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:bg-[var(--bg-surface)] focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                    延伸速度 (s/kb)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={180}
                    value={draft.extension_sec_per_kb}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        extension_sec_per_kb: Number(e.target.value) || 30,
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono-bio text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                    变性 (°C)
                  </label>
                  <input
                    type="number"
                    min={92}
                    max={99}
                    step={0.5}
                    value={draft.denature_c}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        denature_c: Number(e.target.value) || 98,
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono-bio text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                    延伸 (°C)
                  </label>
                  <input
                    type="number"
                    min={60}
                    max={75}
                    step={0.5}
                    value={draft.ext_c}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        ext_c: Number(e.target.value) || 72,
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono-bio text-sm text-[var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-secondary)]">
                    退火偏移 (°C)
                  </label>
                  <input
                    type="number"
                    min={-8}
                    max={6}
                    step={0.5}
                    value={draft.anneal_offset_c}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        anneal_offset_c: Number(e.target.value),
                      }))
                    }
                    className="w-full rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1.5 font-mono-bio text-sm text-[var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCustomForm(false)}
                  className="btn-outline rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  返回列表
                </button>
                <button
                  type="submit"
                  className="btn-primary inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-xs font-semibold cursor-pointer"
                >
                  <Check className="h-3.5 w-3.5" />
                  保存并使用
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
