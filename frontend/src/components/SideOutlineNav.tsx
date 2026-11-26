"use client";

import React, { useEffect, useState } from "react";
import {
  Activity,
  Archive,
  Beaker,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Dna,
  Loader2,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { downloadExport } from "@/lib/api";
import type { AuditStep, DesignResponse } from "@/types/crispr";

interface SideOutlineNavProps {
  design: DesignResponse | null;
  liveSteps: AuditStep[];
  isRunning: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: string;
  num: string;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  enabled: boolean;
  badge?: string;
  badgeTone?: "emerald" | "amber" | "rose" | "accent" | "neutral";
}

export function SideOutlineNav({
  design,
  liveSteps,
  isRunning,
  collapsed,
  onToggleCollapse,
}: SideOutlineNavProps) {
  const [activeId, setActiveId] = useState<string>("section-composer");
  const [downloadingZip, setDownloadingZip] = useState(false);

  // Preserve live Rose !N dilution alert pill on 06 NanoDrop
  const dilutionAlertCount = design
    ? design.wetlab_protocol.reactions.reduce(
        (acc, rxn) =>
          acc +
          rxn.components.filter(
            (c) =>
              Boolean(c.dilution_alert) || (c.volume_ul > 0 && c.volume_ul < 0.5)
          ).length,
        0
      )
    : 0;

  const hasSteps = isRunning || liveSteps.length > 0;
  const hasRepairs =
    (design?.repair_iterations ?? 0) > 0 ||
    liveSteps.some((s) => s.status === "repaired");

  const items: NavItem[] = [
    {
      id: "section-composer",
      num: "01",
      label: "设计配置",
      shortLabel: "配置",
      icon: SlidersHorizontal,
      enabled: true,
      badge: design ? design.locus.gene_name : undefined,
      badgeTone: "neutral",
    },
    {
      id: "section-audit",
      num: "02",
      label: "审计追踪",
      shortLabel: "审计",
      icon: Activity,
      enabled: hasSteps,
      badge: hasRepairs
        ? "自愈"
        : liveSteps.length > 0
          ? `${liveSteps.length}步`
          : undefined,
      badgeTone: hasRepairs ? "accent" : "neutral",
    },
    {
      id: "section-verification",
      num: "03",
      label: "12点零信任认证",
      shortLabel: "12点认证",
      icon: ShieldCheck,
      enabled: Boolean(design),
      badge: design
        ? `${design.verification_report.passed_count}/${design.verification_report.total_checks}`
        : undefined,
      badgeTone: design
        ? design.verification_report.overall_status === "CERTIFIED_PASS"
          ? "emerald"
          : design.verification_report.overall_status === "PASS_WITH_WARNINGS"
            ? "amber"
            : "rose"
        : "neutral",
    },
    {
      id: "section-visuals",
      num: "04",
      label: "基因座与电泳",
      shortLabel: "图谱/电泳",
      icon: Crosshair,
      enabled: Boolean(design),
      badge: design
        ? `Δ${design.verification_primers.band_diff_bp}`
        : undefined,
      badgeTone: "neutral",
    },
    {
      id: "section-primers",
      num: "05",
      label: "sgRNA与引物",
      shortLabel: "引物表",
      icon: Dna,
      enabled: Boolean(design),
      badge: design ? `${design.all_primers.length}` : undefined,
      badgeTone: "neutral",
    },
    {
      id: "section-wetlab",
      num: "06",
      label: "NanoDrop移液",
      shortLabel: "移液表",
      icon: Beaker,
      enabled: Boolean(design),
      badge:
        dilutionAlertCount > 0
          ? `!${dilutionAlertCount}`
          : design
            ? `${design.wetlab_protocol.reactions.length}管`
            : undefined,
      badgeTone: dilutionAlertCount > 0 ? "rose" : "neutral",
    },
    {
      id: "section-timeline",
      num: "07",
      label: "4天实验路线",
      shortLabel: "4天SOP",
      icon: CalendarDays,
      enabled: Boolean(design),
      badge: design ? "4天" : undefined,
      badgeTone: "neutral",
    },
  ];

  // Scroll-Spy via IntersectionObserver
  useEffect(() => {
    const enabledIds = items.filter((it) => it.enabled).map((it) => it.id);
    if (enabledIds.length === 0) return;

    const elements = enabledIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => Boolean(el));

    if (elements.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0 && visible[0].target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      {
        rootMargin: "-80px 0px -58% 0px",
        threshold: [0.05, 0.25],
      }
    );

    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(design), hasSteps]);

  const jumpTo = (id: string) => {
    setActiveId(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  const handleQuickZip = async () => {
    if (!design || downloadingZip) return;
    setDownloadingZip(true);
    try {
      await downloadExport(design, "bundle_zip");
    } finally {
      setDownloadingZip(false);
    }
  };

  const badgeClass = (tone: NavItem["badgeTone"]) => {
    switch (tone) {
      case "emerald":
        return "rounded-full bg-[var(--mint-soft)] text-mint";
      case "amber":
        return "rounded-full bg-amber-500/15 text-amber-800 dark:text-amber-300";
      case "rose":
        return "neu-badge-coral rounded-full font-semibold";
      case "accent":
        return "rounded-full bg-[var(--accent-soft)] text-accent";
      default:
        return "neu-recessed rounded-full text-[var(--text-muted)]";
    }
  };

  return (
    <>
      {/* Desktop Sticky Left Navigation Rail (lg+) */}
      <aside
        data-tour="sidebar-nav"
        className={`neu-sidebar hidden lg:flex shrink-0 flex-col sticky top-[62px] h-[calc(100vh-62px)] transition-[width] duration-200 ${
          collapsed ? "w-[68px]" : "w-[260px]"
        }`}
        aria-label="工作台大纲导航"
      >
        <div className="flex-1 overflow-y-auto px-3 py-5 space-y-2">
          {!collapsed && (
            <div className="px-3 pb-2 text-xs font-bold text-[var(--text-muted)]">
              工作台大纲
            </div>
          )}

          {items.map((item) => {
            const Icon = item.icon;
            const isActive = activeId === item.id;
            return (
              <button
                key={item.id}
                type="button"
                disabled={!item.enabled}
                onClick={() => jumpTo(item.id)}
                title={`${item.num} ${item.label}${item.badge ? ` (${item.badge})` : ""}`}
                className={`group relative flex w-full items-center gap-2.5 rounded-2xl px-3 py-2.5 text-left transition cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                  isActive
                    ? "neu-recessed text-accent"
                    : "text-[var(--text-secondary)] bg-hover-tint hover:text-[var(--text-primary)]"
                } ${collapsed ? "justify-center" : "justify-between"}`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      isActive
                        ? "text-[var(--accent-primary)]"
                        : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
                    }`}
                  />
                  {!collapsed && (
                    <div className="flex items-baseline gap-1.5 min-w-0">
                      <span className="font-mono-bio text-xs font-semibold text-[var(--text-muted)]">
                        {item.num}
                      </span>
                      <span
                        className={`truncate text-sm ${
                          isActive ? "font-bold" : "font-semibold"
                        }`}
                      >
                        {item.label}
                      </span>
                    </div>
                  )}
                </div>

                {!collapsed && item.badge && (
                  <span
                    className={`shrink-0 px-2 py-0.5 font-mono-bio text-xs leading-none ${badgeClass(
                      item.badgeTone
                    )}`}
                  >
                    {item.badge}
                  </span>
                )}

                {collapsed && item.badgeTone === "rose" && item.badge && (
                  <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#ff6b6b] ring-2 ring-[var(--bg-rail)]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom Actions: Primary .zip CTA + Collapse */}
        <div className="neu-divider-t p-3 space-y-2.5">
          {design && (
            <button
              type="button"
              disabled={downloadingZip}
              onClick={handleQuickZip}
              title="一键下载完整实验包 (.zip)"
              className="btn-primary flex w-full items-center justify-center gap-2 px-3 py-2.5 text-sm font-bold cursor-pointer"
            >
              {downloadingZip ? (
                <Loader2 className="h-4 w-4 animate-spin shrink-0" />
              ) : (
                <Archive className="h-4 w-4 shrink-0" />
              )}
              {!collapsed && <span>一键下载 .zip</span>}
            </button>
          )}

          <button
            type="button"
            onClick={onToggleCollapse}
            title={collapsed ? "展开侧边栏" : "收起侧边栏"}
            className="btn-outline flex w-full items-center justify-center gap-2 px-3 py-2 text-xs font-medium cursor-pointer"
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4" />
                <span>收起侧边栏</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile / Tablet Sticky Horizontal Rail (< lg) */}
      <div
        data-tour="sidebar-nav"
        className="neu-topbar lg:hidden sticky top-[62px] z-30"
      >
        <div className="flex items-center gap-2.5 overflow-x-auto px-4 py-2.5">
          {items
            .filter((it) => it.enabled)
            .map((item) => {
              const isActive = activeId === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-active={isActive}
                  onClick={() => jumpTo(item.id)}
                  className="neu-pill inline-flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium cursor-pointer"
                >
                  <span className="font-mono-bio opacity-65">{item.num}</span>
                  <span>{item.shortLabel}</span>
                  {item.badge && (
                    <span
                      className={`px-1.5 py-0.5 font-mono-bio text-xs leading-none ${badgeClass(
                        item.badgeTone
                      )}`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
        </div>
      </div>
    </>
  );
}
