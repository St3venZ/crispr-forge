"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Archive,
  Check,
  ChevronUp,
  Dna,
  FileSpreadsheet,
  FileText,
  Loader2,
} from "lucide-react";
import { downloadExport } from "@/lib/api";
import type { DesignResponse, ExportFormat } from "@/types/crispr";

interface ExportBarProps {
  design: DesignResponse;
}

const SNAPGENE_ITEMS: { fmt: ExportFormat; label: string; desc: string }[] = [
  {
    fmt: "gb_wt",
    label: "野生型基因座 (WT .gb)",
    desc: "含靶基因与邻近基因完整注释",
  },
  {
    fmt: "gb_ko",
    label: "敲除后基因座 (KO .gb)",
    desc: "模拟编辑后无缝序列与校验引物",
  },
  {
    fmt: "gb_donor",
    label: "Donor 同源模板 (.gb)",
    desc: "左右同源臂与重叠拼接位点",
  },
  {
    fmt: "gb_plasmid",
    label: "sgRNA 重组质粒 (.gb)",
    desc: "含插入 N20 的 sgRNA 表达盒",
  },
];

export function ExportBar({ design }: ExportBarProps) {
  const [loadingFmt, setLoadingFmt] = useState<ExportFormat | null>(null);
  const [doneFmt, setDoneFmt] = useState<ExportFormat | null>(null);
  const [gbMenuOpen, setGbMenuOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setGbMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const handleDownload = async (fmt: ExportFormat) => {
    setErrorMsg(null);
    setLoadingFmt(fmt);
    setGbMenuOpen(false);
    try {
      await downloadExport(design, fmt);
      setDoneFmt(fmt);
      window.setTimeout(() => {
        setDoneFmt((prev) => (prev === fmt ? null : prev));
      }, 2200);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "导出失败，请检查后端服务状态。"
      );
    } finally {
      setLoadingFmt(null);
    }
  };

  return (
    <div data-tour="export-bar" className="sticky bottom-4 z-30 pt-2">
      <div className="neu-popover px-5 py-3.5 sm:px-6">
        {errorMsg && (
          <div className="neu-alert-coral mb-3 flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-coral">
            <AlertCircle className="h-4 w-4 shrink-0 text-[#ff6b6b]" />
            <span>{errorMsg}</span>
          </div>
        )}

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2.5 text-sm text-[var(--text-secondary)] shrink-0">
            <span className="neu-recessed inline-flex items-center rounded-full px-3 py-1 font-mono-bio text-sm font-semibold text-accent whitespace-nowrap">
              Δ{design.locus.gene_name}
            </span>
            <span className="font-mono-bio text-xs font-medium text-[var(--text-muted)] whitespace-nowrap">
              {design.plasmid_system}
            </span>
            <span className="hidden 2xl:inline text-[var(--border-strong)]">
              |
            </span>
            <span className="hidden 2xl:inline text-xs text-[var(--text-muted)]">
              一键导出 SnapGene 注释图谱、引物订购单与可打印实验室 SOP
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Primary ZIP bundle — Raised Tactile Blurple Extrusion (Day & Night) */}
            <button
              type="button"
              disabled={loadingFmt !== null}
              onClick={() => handleDownload("bundle_zip")}
              className="btn-primary inline-flex items-center gap-1.5 whitespace-nowrap px-4 py-2 text-xs sm:text-sm font-semibold cursor-pointer"
            >
              {loadingFmt === "bundle_zip" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : doneFmt === "bundle_zip" ? (
                <Check className="h-4 w-4" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
              <span>完整实验包 (.zip)</span>
            </button>

            {/* Excel Primers Order */}
            <button
              type="button"
              disabled={loadingFmt !== null}
              onClick={() => handleDownload("primers_xlsx")}
              className="btn-outline inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-xs sm:text-sm font-medium cursor-pointer"
            >
              {loadingFmt === "primers_xlsx" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : doneFmt === "primers_xlsx" ? (
                <Check className="h-4 w-4 text-mint" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 text-[var(--accent-primary)]" />
              )}
              <span>引物订购单 (.xlsx)</span>
            </button>

            {/* SnapGene .gb Upward Dropdown */}
            <div ref={dropdownRef} className="relative">
              <button
                type="button"
                disabled={loadingFmt !== null}
                onClick={() => setGbMenuOpen((v) => !v)}
                className="btn-outline inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-xs sm:text-sm font-medium cursor-pointer"
              >
                <Dna className="h-4 w-4 text-[var(--accent-primary)]" />
                <span>SnapGene 图谱 (.gb)</span>
                <ChevronUp
                  className={`h-4 w-4 transition-transform ${
                    gbMenuOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {gbMenuOpen && (
                <div className="neu-popover absolute bottom-full right-0 mb-3 w-72 overflow-hidden p-2">
                  <div className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)]">
                    选择 SnapGene GenBank 图谱
                  </div>
                  {SNAPGENE_ITEMS.map((item) => (
                    <button
                      key={item.fmt}
                      type="button"
                      onClick={() => handleDownload(item.fmt)}
                      className="bg-hover-tint flex w-full flex-col items-start rounded-2xl px-3 py-2 text-left transition cursor-pointer"
                    >
                      <span className="text-sm font-medium text-[var(--text-primary)]">
                        {item.label}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {item.desc}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Printable SOP (.md) */}
            <button
              type="button"
              disabled={loadingFmt !== null}
              onClick={() => handleDownload("sop_md")}
              className="btn-outline inline-flex items-center gap-1.5 whitespace-nowrap px-3.5 py-2 text-xs sm:text-sm font-medium cursor-pointer"
            >
              {loadingFmt === "sop_md" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : doneFmt === "sop_md" ? (
                <Check className="h-4 w-4 text-mint" />
              ) : (
                <FileText className="h-4 w-4 text-[var(--accent-primary)]" />
              )}
              <span>打印版 SOP (.md)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
