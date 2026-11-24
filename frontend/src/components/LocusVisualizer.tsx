"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Crosshair,
  Hand,
  MousePointerClick,
  Scissors,
  ShieldCheck,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  DonorDesign,
  LocusInfo,
  PrimerSpec,
  SgRNACandidate,
  VerificationPrimersDesign,
} from "@/types/crispr";

interface LocusVisualizerProps {
  locus: LocusInfo;
  selectedSgRNA: SgRNACandidate;
  donor: DonorDesign;
  verificationPrimers: VerificationPrimersDesign;
}

interface TooltipData {
  title: string;
  badge: string;
  badgeClass: string;
  coords: string;
  lengthLabel: string;
  strand?: string;
  detail?: string;
  seqPreview?: string;
}

const NICE_STEPS = [50, 100, 200, 500, 1000, 2000, 5000];
const MAX_ZOOM = 20;

function formatCoord(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function buildArrowPoints(
  x1: number,
  x2: number,
  y: number,
  height: number,
  strand: "+" | "-"
): string {
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const w = Math.max(right - left, 6);
  const tip = Math.min(12, w * 0.35);
  const top = y;
  const mid = y + height / 2;
  const bottom = y + height;

  if (strand === "+") {
    return `${left},${top} ${right - tip},${top} ${right},${mid} ${right - tip},${bottom} ${left},${bottom}`;
  }
  return `${left + tip},${top} ${right},${top} ${right},${bottom} ${left + tip},${bottom} ${left},${mid}`;
}

export function LocusVisualizer({
  locus,
  selectedSgRNA,
  donor,
  verificationPrimers,
}: LocusVisualizerProps) {
  const seqLen = Math.max(locus.locus_sequence.length, 1);
  const minSpan = Math.max(120, Math.round(seqLen / MAX_ZOOM));

  const [viewport, setViewport] = useState<{ start: number; end: number }>({
    start: 0,
    end: seqLen,
  });
  const [directWheelZoom, setDirectWheelZoom] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hovered, setHovered] = useState<TooltipData | null>(null);

  const svgWrapRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const minimapRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    active: boolean;
    startX: number;
    origStart: number;
    origEnd: number;
  }>({ active: false, startX: 0, origStart: 0, origEnd: seqLen });
  const minimapDragRef = useRef<boolean>(false);

  useEffect(() => {
    setViewport({ start: 0, end: seqLen });
  }, [locus.sequence_sha256, seqLen]);

  const viewStart = Math.max(0, Math.min(seqLen - 1, viewport.start));
  const viewEnd = Math.max(viewStart + 1, Math.min(seqLen, viewport.end));
  const span = Math.max(viewEnd - viewStart, 1);
  const zoomLevel = Number(Math.max(1, seqLen / span).toFixed(2));

  const clampViewport = useCallback(
    (s: number, e: number): { start: number; end: number } => {
      const targetSpan = Math.max(minSpan, Math.min(seqLen, e - s));
      let nextStart = Math.max(0, Math.min(seqLen - targetSpan, s));
      let nextEnd = nextStart + targetSpan;
      if (nextEnd > seqLen) {
        nextEnd = seqLen;
        nextStart = Math.max(0, seqLen - targetSpan);
      }
      return { start: nextStart, end: nextEnd };
    },
    [minSpan, seqLen]
  );

  const zoomAround = useCallback(
    (targetZoom: number, anchorFrac = 0.5) => {
      const clampedZoom = Math.max(1, Math.min(MAX_ZOOM, targetZoom));
      const newSpan = Math.max(minSpan, seqLen / clampedZoom);
      setViewport((prev) => {
        const curSpan = Math.max(prev.end - prev.start, 1);
        const anchorBp = prev.start + anchorFrac * curSpan;
        const nextStart = anchorBp - anchorFrac * newSpan;
        return clampViewport(nextStart, nextStart + newSpan);
      });
    },
    [clampViewport, minSpan, seqLen]
  );

  const laStart = Math.max(0, locus.deletion_rel_start - donor.left_arm_len);
  const laEnd = locus.deletion_rel_start;
  const raStart = locus.deletion_rel_end;
  const raEnd = Math.min(seqLen, locus.deletion_rel_end + donor.right_arm_len);

  const primersBase = useMemo(() => {
    const items: {
      key: string;
      shortLabel: string;
      spec: PrimerSpec;
      relStart: number;
      relEnd: number;
      strand: "+" | "-";
      color: string;
    }[] = [];

    const vf = verificationPrimers.outer_forward;
    const vfStart =
      vf.rel_bind_start ??
      Math.max(20, laStart - verificationPrimers.distance_outside_la_bp);
    const vfEnd = vf.rel_bind_end ?? vfStart + vf.binding_region.length;
    items.push({
      key: "VF",
      shortLabel: "VF (外正)",
      spec: vf,
      relStart: vfStart,
      relEnd: vfEnd,
      strand: vf.strand || "+",
      color: "#6d5dfc",
    });

    const vr = verificationPrimers.outer_reverse;
    const vrEnd =
      vr.rel_bind_end ??
      Math.min(seqLen - 20, raEnd + verificationPrimers.distance_outside_ra_bp);
    const vrStart =
      vr.rel_bind_start ?? Math.max(0, vrEnd - vr.binding_region.length);
    items.push({
      key: "VR",
      shortLabel: "VR (外反)",
      spec: vr,
      relStart: vrStart,
      relEnd: vrEnd,
      strand: vr.strand || "-",
      color: "#6d5dfc",
    });

    if (verificationPrimers.wt_internal_primer) {
      const wt = verificationPrimers.wt_internal_primer;
      const midDel = Math.floor(
        (locus.deletion_rel_start + locus.deletion_rel_end) / 2
      );
      const wtStart = wt.rel_bind_start ?? midDel;
      const wtEnd = wt.rel_bind_end ?? wtStart + wt.binding_region.length;
      items.push({
        key: "WT_int",
        shortLabel: "WT_int",
        spec: wt,
        relStart: wtStart,
        relEnd: wtEnd,
        strand: wt.strand || "-",
        color: "#D97706",
      });
    }

    const sanger = verificationPrimers.sanger_primer;
    const sgStart =
      sanger.rel_bind_start ?? Math.max(10, locus.deletion_rel_start - 260);
    const sgEnd =
      sanger.rel_bind_end ?? sgStart + sanger.binding_region.length;
    items.push({
      key: "Sanger",
      shortLabel: "Sanger",
      spec: sanger,
      relStart: sgStart,
      relEnd: sgEnd,
      strand: sanger.strand || "+",
      color: "#64748B",
    });

    return items;
  }, [
    verificationPrimers,
    laStart,
    raEnd,
    seqLen,
    locus.deletion_rel_start,
    locus.deletion_rel_end,
  ]);

  const handleJumpFull = () => setViewport({ start: 0, end: seqLen });

  const handleJumpDeletion = () => {
    const minNeeded = Math.min(laStart, ...primersBase.map((p) => p.relStart));
    const maxNeeded = Math.max(raEnd, ...primersBase.map((p) => p.relEnd));
    const pad = Math.max(220, Math.round((maxNeeded - minNeeded) * 0.1));
    setViewport(clampViewport(minNeeded - pad, maxNeeded + pad));
  };

  const handleJumpCutSite = () => {
    const halfWindow = Math.max(Math.round(minSpan / 2), 380);
    setViewport(
      clampViewport(
        selectedSgRNA.cut_site_rel - halfWindow,
        selectedSgRNA.cut_site_rel + halfWindow
      )
    );
  };

  useEffect(() => {
    const node = svgWrapRef.current;
    if (!node) return;

    const handleWheel = (e: WheelEvent) => {
      if (!directWheelZoom && !e.ctrlKey && !e.metaKey) return;
      e.preventDefault();

      const rect = node.getBoundingClientRect();
      const relX = (e.clientX - rect.left) / Math.max(rect.width, 1);
      const anchorFrac = Math.max(0.02, Math.min(0.98, relX));
      const factor = e.deltaY < 0 ? 1.28 : 1 / 1.28;

      setViewport((prev) => {
        const curSpan = Math.max(prev.end - prev.start, 1);
        const curZoom = seqLen / curSpan;
        const nextZoom = Math.max(1, Math.min(MAX_ZOOM, curZoom * factor));
        const newSpan = Math.max(minSpan, seqLen / nextZoom);
        const anchorBp = prev.start + anchorFrac * curSpan;
        const nextStart = anchorBp - anchorFrac * newSpan;
        return clampViewport(nextStart, nextStart + newSpan);
      });
    };

    node.addEventListener("wheel", handleWheel, { passive: false });
    return () => node.removeEventListener("wheel", handleWheel);
  }, [directWheelZoom, seqLen, minSpan, clampViewport]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (zoomLevel <= 1.01) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStateRef.current = {
      active: true,
      startX: e.clientX,
      origStart: viewStart,
      origEnd: viewEnd,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragStateRef.current.active || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const plotPx = Math.max(rect.width * 0.9, 1);
    const deltaPx = e.clientX - dragStateRef.current.startX;
    const origSpan =
      dragStateRef.current.origEnd - dragStateRef.current.origStart;
    const deltaBp = -(deltaPx / plotPx) * origSpan;
    setViewport(
      clampViewport(
        dragStateRef.current.origStart + deltaBp,
        dragStateRef.current.origEnd + deltaBp
      )
    );
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragStateRef.current.active) {
      dragStateRef.current.active = false;
      setIsDragging(false);
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    }
  };

  const panFromMinimapClientX = useCallback(
    (clientX: number) => {
      const el = minimapRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const frac = Math.max(
        0,
        Math.min(1, (clientX - rect.left) / Math.max(rect.width, 1))
      );
      const centerBp = frac * seqLen;
      const curSpan = viewEnd - viewStart;
      setViewport(clampViewport(centerBp - curSpan / 2, centerBp + curSpan / 2));
    },
    [seqLen, viewStart, viewEnd, clampViewport]
  );

  const SVG_W = 860;
  const SVG_H = 352;
  const PAD_L = 38;
  const PAD_R = 38;
  const PLOT_W = SVG_W - PAD_L - PAD_R;

  const toX = useCallback(
    (relPos: number) => PAD_L + ((relPos - viewStart) / span) * PLOT_W,
    [viewStart, span, PLOT_W]
  );

  const clampX = useCallback(
    (x: number) => Math.max(PAD_L, Math.min(SVG_W - PAD_R, x)),
    []
  );

  const ticks = useMemo(() => {
    const startGenome = locus.slice_genome_start + viewStart;
    const endGenome = locus.slice_genome_start + viewEnd;
    const roughStep = span / 6;
    const step =
      NICE_STEPS.find((s) => s >= roughStep) ??
      NICE_STEPS[NICE_STEPS.length - 1];

    const firstTick = Math.ceil(startGenome / step) * step;
    const arr: { genome: number; x: number }[] = [];
    for (let g = firstTick; g <= endGenome; g += step) {
      const rel = g - locus.slice_genome_start;
      const x = toX(rel);
      if (x >= PAD_L + 16 && x <= SVG_W - PAD_R - 16) {
        arr.push({ genome: g, x });
      }
    }
    return { step, list: arr };
  }, [locus.slice_genome_start, viewStart, viewEnd, span, toX]);

  const laidOutPrimers = useMemo(() => {
    const visible = primersBase
      .map((p) => {
        const rawCenter = toX((p.relStart + p.relEnd) / 2);
        return {
          ...p,
          centerX: rawCenter,
          inView: rawCenter >= PAD_L - 24 && rawCenter <= SVG_W - PAD_R + 24,
          labelW: Math.max(58, p.shortLabel.length * 8.5 + 16),
        };
      })
      .filter((p) => p.inView)
      .sort((a, b) => a.centerX - b.centerX);

    const rowEnds: number[] = [-9999, -9999, -9999];
    return visible.map((p) => {
      const leftEdge = p.centerX - p.labelW / 2;
      let assignedRow = 0;
      for (let r = 0; r < rowEnds.length; r++) {
        if (leftEdge >= rowEnds[r] + 10) {
          assignedRow = r;
          break;
        }
        assignedRow = r;
      }
      rowEnds[assignedRow] = p.centerX + p.labelW / 2;
      return {
        ...p,
        row: assignedRow,
      };
    });
  }, [primersBase, toX]);

  const preservedMargins = useMemo(() => {
    const blocks: { start: number; end: number; label: string }[] = [];
    if (locus.deletion_rel_start > locus.target_rel_start + 3) {
      blocks.push({
        start: locus.target_rel_start,
        end: locus.deletion_rel_start,
        label: "上游保留安全边界 / RBS 保护区",
      });
    }
    if (locus.deletion_rel_end < locus.target_rel_end - 3) {
      blocks.push({
        start: locus.deletion_rel_end,
        end: locus.target_rel_end,
        label: "下游保留安全边界 / 邻近基因 RBS 保护区",
      });
    }
    return blocks;
  }, [
    locus.target_rel_start,
    locus.target_rel_end,
    locus.deletion_rel_start,
    locus.deletion_rel_end,
  ]);

  const cutX = toX(selectedSgRNA.cut_site_rel);
  const cutInView = cutX >= PAD_L && cutX <= SVG_W - PAD_R;
  const delX1 = clampX(toX(locus.deletion_rel_start));
  const delX2 = clampX(toX(locus.deletion_rel_end));
  const delVisible =
    locus.deletion_rel_end >= viewStart && locus.deletion_rel_start <= viewEnd;
  const targetX1 = clampX(toX(locus.target_rel_start));
  const targetX2 = clampX(toX(locus.target_rel_end));
  const targetVisible =
    locus.target_rel_end >= viewStart && locus.target_rel_start <= viewEnd;
  const laX1 = clampX(toX(laStart));
  const laX2 = clampX(toX(laEnd));
  const laVisible = laEnd >= viewStart && laStart <= viewEnd;
  const raX1 = clampX(toX(raStart));
  const raX2 = clampX(toX(raEnd));
  const raVisible = raEnd >= viewStart && raStart <= viewEnd;

  const delLabelText = `敲除区间 (-${locus.deleted_length_bp.toLocaleString()} bp)`;
  const delPillW = Math.max(146, delLabelText.length * 8.2 + 20);
  const delPillCenter = clampX((delX1 + delX2) / 2);
  const delPillX = Math.max(
    PAD_L,
    Math.min(SVG_W - PAD_R - delPillW, delPillCenter - delPillW / 2)
  );

  const mmTargetL = (locus.target_rel_start / seqLen) * 100;
  const mmTargetW = Math.max(
    1,
    ((locus.target_rel_end - locus.target_rel_start) / seqLen) * 100
  );
  const mmDelL = (locus.deletion_rel_start / seqLen) * 100;
  const mmDelW = Math.max(
    0.8,
    ((locus.deletion_rel_end - locus.deletion_rel_start) / seqLen) * 100
  );
  const mmCutL = (selectedSgRNA.cut_site_rel / seqLen) * 100;
  const mmWinL = (viewStart / seqLen) * 100;
  const mmWinW = Math.max(4, (span / seqLen) * 100);

  return (
    <div className="bio-card flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="neu-divider-b flex flex-wrap items-center justify-between gap-3 px-6 py-4 dark:px-5">
        <div>
          <div className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-[var(--accent-primary)]" />
            <h3 className="font-display text-base text-[var(--text-primary)]">
              交互式可缩放基因组图谱 (Genome Locus Map)
            </h3>
          </div>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            <span className="font-mono-bio font-semibold">
              {locus.accession}
            </span>{" "}
            · {locus.gene_name} ({locus.locus_tag}, {locus.strand} 链,{" "}
            {locus.orf_length_bp.toLocaleString()} bp)
          </p>
        </div>

        {/* Quick Jump Presets */}
        <div className="inline-flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-active={zoomLevel <= 1.05}
            onClick={handleJumpFull}
            className="neu-pill px-3 py-1.5 text-xs font-medium cursor-pointer"
          >
            全景 1×
          </button>
          <button
            type="button"
            onClick={handleJumpDeletion}
            className="neu-pill px-3 py-1.5 text-xs font-medium cursor-pointer"
          >
            聚焦敲除区
          </button>
          <button
            type="button"
            onClick={handleJumpCutSite}
            className="neu-pill px-3 py-1.5 text-xs font-medium text-[#c93232] dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300 cursor-pointer"
          >
            聚焦 Cas9 切点
          </button>
        </div>
      </div>

      {/* Continuous Zoom & Pan Toolbar */}
      <div className="neu-divider-b flex flex-wrap items-center justify-between gap-3 px-6 py-3 dark:bg-[var(--bg-subtle)]/65 dark:px-5 dark:py-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => zoomAround(zoomLevel / 1.4, 0.5)}
            disabled={zoomLevel <= 1.01}
            className="btn-outline flex h-8 w-8 dark:h-7 dark:w-7 items-center justify-center rounded-full dark:rounded-md cursor-pointer"
            title="缩小视野"
            aria-label="缩小视野"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>

          <input
            type="range"
            min={1}
            max={MAX_ZOOM}
            step={0.1}
            value={zoomLevel}
            onChange={(e) => zoomAround(Number(e.target.value), 0.5)}
            style={{
              background: `linear-gradient(to right, var(--accent-primary) 0%, var(--accent-primary) ${((zoomLevel - 1) / (MAX_ZOOM - 1)) * 100}%, var(--border-strong) ${((zoomLevel - 1) / (MAX_ZOOM - 1)) * 100}%, var(--border-strong) 100%)`,
            }}
            className="precision-range w-28 sm:w-36 cursor-pointer"
            aria-label="连续缩放滑块"
          />

          <button
            type="button"
            onClick={() => zoomAround(zoomLevel * 1.4, 0.5)}
            disabled={zoomLevel >= MAX_ZOOM - 0.05}
            className="btn-outline flex h-8 w-8 dark:h-7 dark:w-7 items-center justify-center rounded-full dark:rounded-md cursor-pointer"
            title="放大视野"
            aria-label="放大视野"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>

          <span className="neu-recessed rounded-full dark:rounded-md px-3 py-1 font-mono-bio text-xs font-semibold text-accent">
            {zoomLevel.toFixed(1)}× · {Math.round(span).toLocaleString()} bp
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--text-secondary)]">
          <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer select-none">
            <input
              type="checkbox"
              checked={directWheelZoom}
              onChange={(e) => setDirectWheelZoom(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-[#6d5dfc] dark:accent-sky-400 cursor-pointer"
            />
            <span>滚轮直接缩放</span>
          </label>
          <span className="hidden sm:inline-flex items-center gap-1 text-[var(--text-muted)]">
            <Hand className="h-3.5 w-3.5" />
            {zoomLevel > 1.01 ? "按住拖拽平移" : "Ctrl+滚轮缩放"}
          </span>
        </div>
      </div>

      {/* Interactive SVG Canvas (Recessed Viewport Well in Light Mode) */}
      <div
        ref={svgWrapRef}
        className="relative flex-1 p-4 sm:p-5 dark:bio-grid-bg dark:px-4 dark:py-4"
      >
        <div className="neu-recessed-deep bio-grid-bg w-full overflow-hidden rounded-[20px] p-2 dark:rounded-none dark:border-0 dark:p-0">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            className={`w-full h-auto select-none touch-none ${
              zoomLevel > 1.01
                ? isDragging
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : "cursor-default"
            }`}
            role="img"
            aria-label={`${locus.gene_name} 基因组敲除图谱`}
          >
            <defs>
              <pattern
                id="rbsHatchV3"
                width="8"
                height="8"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <rect width="8" height="8" fill="#FEF3C7" fillOpacity="0.92" />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="8"
                  stroke="#D97706"
                  strokeWidth="2.5"
                />
              </pattern>

              <pattern
                id="delHatchV3"
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-45)"
              >
                <rect width="10" height="10" fill="rgba(225,29,72,0.09)" />
                <line
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="10"
                  stroke="rgba(225,29,72,0.28)"
                  strokeWidth="1.5"
                />
              </pattern>
            </defs>

            {/* TRACK 1: DYNAMIC NICE-TICK RULER */}
            <g>
              <line
                x1={PAD_L}
                y1={30}
                x2={SVG_W - PAD_R}
                y2={30}
                stroke="var(--svg-ruler)"
                strokeWidth="1.3"
              />
              {ticks.list.map((t) => (
                <g key={t.genome}>
                  <line
                    x1={t.x}
                    y1={24}
                    x2={t.x}
                    y2={36}
                    stroke="var(--svg-ruler)"
                    strokeWidth="1.3"
                  />
                  <text
                    x={t.x}
                    y={18}
                    textAnchor="middle"
                    fill="var(--svg-text-muted)"
                    className="font-mono-bio text-[12px] font-medium"
                  >
                    {formatCoord(t.genome)}
                  </text>
                </g>
              ))}
              <text
                x={SVG_W - PAD_R}
                y={49}
                textAnchor="end"
                fill="var(--svg-text-muted)"
                className="font-mono-bio text-[12px]"
              >
                步长 {ticks.step.toLocaleString()} bp · 1-based 真实坐标
              </text>
            </g>

            {/* BACKBONE DNA AXIS */}
            <line
              x1={PAD_L}
              y1={126}
              x2={SVG_W - PAD_R}
              y2={126}
              stroke="var(--svg-axis)"
              strokeWidth="2.6"
              strokeLinecap="round"
            />

            {/* TRACK 2: NEIGHBOR GENES */}
            {locus.neighbor_genes.map((ng, idx) => {
              if (ng.rel_end < viewStart || ng.rel_start > viewEnd) return null;
              const x1 = clampX(toX(ng.rel_start));
              const x2 = clampX(toX(ng.rel_end));
              const w = x2 - x1;
              if (w < 3) return null;

              const isWarn = ng.overlaps_target || ng.overlaps_rbs_zone;
              return (
                <g
                  key={`${ng.name}-${idx}`}
                  className="cursor-pointer transition-opacity hover:opacity-85"
                  onMouseEnter={() =>
                    setHovered({
                      title: `邻近基因 ${ng.name}${ng.locus_tag ? ` (${ng.locus_tag})` : ""}`,
                      badge: isWarn ? "邻近 RBS / 重叠保护" : "侧翼邻近基因",
                      badgeClass: isWarn
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300"
                        : "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
                      coords: `${formatCoord(ng.genome_start)} .. ${formatCoord(ng.genome_end)} bp`,
                      lengthLabel: `${(ng.genome_end - ng.genome_start + 1).toLocaleString()} bp · 距靶点 ${ng.distance_to_target_bp} bp`,
                      strand: `${ng.strand} 链`,
                      detail: ng.warning || ng.product || "侧翼编码基因",
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                >
                  <polygon
                    points={buildArrowPoints(x1, x2, 111, 30, ng.strand)}
                    fill={
                      isWarn
                        ? "var(--svg-warn-fill)"
                        : "var(--svg-neighbor-fill)"
                    }
                    stroke={
                      isWarn
                        ? "var(--svg-warn-stroke)"
                        : "var(--svg-neighbor-stroke)"
                    }
                    strokeWidth="1.4"
                  />
                  {w > 42 && (
                    <text
                      x={(x1 + x2) / 2}
                      y={130}
                      textAnchor="middle"
                      fill={
                        isWarn
                          ? "var(--svg-warn-text)"
                          : "var(--svg-neighbor-text)"
                      }
                      className="font-mono-bio text-[12px] font-semibold pointer-events-none"
                    >
                      {ng.name}
                    </text>
                  )}
                </g>
              );
            })}

            {/* TARGET ORF BLOCK (Cobalt Light / Ice Sky-Blue Dark) */}
            {targetVisible && (
              <g
                className="cursor-pointer transition-opacity hover:opacity-90"
                onMouseEnter={() =>
                  setHovered({
                    title: `目标基因 ${locus.gene_name} (${locus.locus_tag})`,
                    badge: "目标敲除 ORF",
                    badgeClass:
                      "bg-[var(--accent-soft)] text-accent",
                    coords: `${formatCoord(locus.genome_start)} .. ${formatCoord(locus.genome_end)} bp`,
                    lengthLabel: `全长 ${locus.orf_length_bp.toLocaleString()} bp`,
                    strand: `${locus.strand} 链`,
                    detail: locus.product,
                  })
                }
                onMouseLeave={() => setHovered(null)}
              >
                <polygon
                  points={buildArrowPoints(
                    targetX1,
                    targetX2,
                    107,
                    38,
                    locus.strand
                  )}
                  fill="var(--svg-target-fill)"
                  stroke="var(--svg-target-stroke)"
                  strokeWidth="1.5"
                />
                {targetX2 - targetX1 > 60 && (
                  <text
                    x={(targetX1 + targetX2) / 2}
                    y={130}
                    textAnchor="middle"
                    fill="var(--svg-target-text)"
                    className="font-mono-bio text-[13px] font-bold pointer-events-none"
                  >
                    {locus.gene_name} ({locus.strand})
                  </text>
                )}
              </g>
            )}

            {/* PRESERVED SAFE MARGIN / RBS GUARD HATCH */}
            {preservedMargins.map((pm, idx) => {
              if (pm.end < viewStart || pm.start > viewEnd) return null;
              const px1 = clampX(toX(pm.start));
              const px2 = clampX(toX(pm.end));
              const pw = Math.max(px2 - px1, 5);
              return (
                <g
                  key={idx}
                  className="cursor-pointer"
                  onMouseEnter={() =>
                    setHovered({
                      title: pm.label,
                      badge: "RBS 安全保护区",
                      badgeClass:
                        "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300",
                      coords: `${formatCoord(locus.slice_genome_start + pm.start)} .. ${formatCoord(locus.slice_genome_start + pm.end - 1)} bp`,
                      lengthLabel: `保留 ${pm.end - pm.start} bp`,
                      detail:
                        locus.safety_adjustment_note ||
                        "自动保留的末端编码/RBS 保护片段，防止破坏邻近基因表达或移码。",
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                >
                  <rect
                    x={px1}
                    y={106}
                    width={pw}
                    height={40}
                    rx={3}
                    fill="url(#rbsHatchV3)"
                    stroke="#D97706"
                    strokeWidth="1.5"
                  />
                </g>
              );
            })}

            {/* DELETION INTERVAL HIGHLIGHT (Preserved Vivid Rose/Red) */}
            {delVisible && (
              <g
                className="cursor-pointer"
                onMouseEnter={() =>
                  setHovered({
                    title: "实际同源重组敲除区间 (Deletion Interval)",
                    badge: `净缺失 -${locus.deleted_length_bp.toLocaleString()} bp`,
                    badgeClass:
                      "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
                    coords: `${formatCoord(locus.deletion_genome_start)} .. ${formatCoord(locus.deletion_genome_end)} bp`,
                    lengthLabel: `敲除 ${locus.deleted_length_bp.toLocaleString()} bp (占 ORF ${Math.round((locus.deleted_length_bp / Math.max(locus.orf_length_bp, 1)) * 100)}%)`,
                    detail:
                      "敲除后左右同源臂无缝对接，该区间将被彻底删除，原有 sgRNA 靶点与 PAM 一并消除以杜绝 Cas9 二次切割。",
                  })
                }
                onMouseLeave={() => setHovered(null)}
              >
                <rect
                  x={delX1}
                  y={96}
                  width={Math.max(delX2 - delX1, 4)}
                  height={60}
                  rx={6}
                  fill="url(#delHatchV3)"
                  stroke="var(--svg-cut-color)"
                  strokeWidth="1.6"
                  strokeDasharray="6 3"
                />
              </g>
            )}

            {/* CAS9 CUT SITE (Preserved Vivid Coral/Rose, two non-colliding segments) */}
            {cutInView && (
              <g
                className="cursor-pointer"
                onMouseEnter={() =>
                  setHovered({
                    title: `Cas9 切割位点 · ${selectedSgRNA.id}`,
                    badge: `PAM: ${selectedSgRNA.pam} · 评分 ${selectedSgRNA.on_target_score.toFixed(1)}`,
                    badgeClass:
                      "bg-[#ff6b6b]/18 text-[#c93232] dark:bg-rose-500/20 dark:text-rose-300",
                    coords: `基因组第 ${formatCoord(selectedSgRNA.cut_site_genome)} bp`,
                    lengthLabel: `距离 ORF 起始 ${selectedSgRNA.distance_from_orf_start_pct.toFixed(1)}% · GC ${selectedSgRNA.gc_percent.toFixed(1)}%`,
                    strand: `${selectedSgRNA.strand} 链`,
                    seqPreview: `5'-${selectedSgRNA.spacer_20nt}-${selectedSgRNA.pam}-3'`,
                    detail: selectedSgRNA.off_target_summary,
                  })
                }
                onMouseLeave={() => setHovered(null)}
              >
                <line
                  x1={cutX}
                  y1={64}
                  x2={cutX}
                  y2={96}
                  stroke="var(--svg-cut-color)"
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
                <line
                  x1={cutX}
                  y1={105}
                  x2={cutX}
                  y2={176}
                  stroke="var(--svg-cut-color)"
                  strokeWidth="2"
                  strokeDasharray="3 2"
                />
                <circle
                  cx={cutX}
                  cy={56}
                  r={10}
                  fill="var(--svg-cut-color)"
                  stroke="var(--svg-pill-mask)"
                  strokeWidth="2"
                />
                <text
                  x={cutX}
                  y={60}
                  textAnchor="middle"
                  className="fill-white text-[12px] font-bold pointer-events-none"
                >
                  ✂
                </text>
                <rect
                  x={Math.min(Math.max(cutX + 14, PAD_L), SVG_W - PAD_R - 172)}
                  y={45}
                  width={166}
                  height={22}
                  rx={6}
                  fill="var(--svg-cut-pill-fill)"
                  stroke="var(--svg-cut-pill-stroke)"
                  strokeWidth="1.2"
                />
                <text
                  x={
                    Math.min(Math.max(cutX + 14, PAD_L), SVG_W - PAD_R - 172) +
                    83
                  }
                  y={60}
                  textAnchor="middle"
                  fill="var(--svg-cut-pill-text)"
                  className="font-mono-bio text-[12px] font-bold"
                >
                  sgRNA ({selectedSgRNA.strand}) · {selectedSgRNA.pam}
                </text>
              </g>
            )}

            {/* DELETION LABEL PILL ON HIGHER LAYER WITH OPAQUE MASK */}
            {delVisible && (
              <g className="pointer-events-none">
                <rect
                  x={delPillX}
                  y={74}
                  width={delPillW}
                  height={20}
                  rx={10}
                  fill="var(--svg-pill-mask)"
                  stroke="var(--svg-del-label-stroke)"
                  strokeWidth="1.2"
                />
                <text
                  x={delPillX + delPillW / 2}
                  y={88}
                  textAnchor="middle"
                  fill="var(--svg-del-label-text)"
                  className="font-mono-bio text-[12px] font-bold"
                >
                  {delLabelText}
                </text>
              </g>
            )}

            {/* TRACK 4: LEFT & RIGHT HOMOLOGY ARMS (Clean Cobalt / Slate) */}
            {laVisible && (
              <g
                className="cursor-pointer transition-opacity hover:opacity-85"
                onMouseEnter={() =>
                  setHovered({
                    title: "左同源臂 Left Homology Arm (LA)",
                    badge: `${donor.left_arm_len} bp`,
                    badgeClass:
                      "bg-[var(--accent-soft)] text-accent",
                    coords: `${formatCoord(locus.slice_genome_start + laStart)} .. ${formatCoord(locus.slice_genome_start + laEnd - 1)} bp`,
                    lengthLabel: `纯同源臂 ${donor.left_arm_len} bp · OE-PCR 扩增子 ${donor.la_amplicon_bp} bp`,
                    seqPreview: `${donor.left_arm_seq.slice(0, 24)}...${donor.left_arm_seq.slice(-16)}`,
                    detail: `与右同源臂重叠区 ${donor.overlap_len} bp (Tm ${donor.overlap_tm_c.toFixed(1)}°C)`,
                  })
                }
                onMouseLeave={() => setHovered(null)}
              >
                <rect
                  x={laX1}
                  y={182}
                  width={Math.max(laX2 - laX1, 6)}
                  height={22}
                  rx={5}
                  fill="var(--svg-la-fill)"
                  stroke="var(--svg-la-stroke)"
                  strokeWidth="1.5"
                />
                <text
                  x={(laX1 + laX2) / 2}
                  y={197}
                  textAnchor="middle"
                  fill="var(--svg-la-text)"
                  className="font-mono-bio text-[12px] font-bold pointer-events-none"
                >
                  {laX2 - laX1 > 64 ? `LA (${donor.left_arm_len} bp)` : "LA"}
                </text>
              </g>
            )}

            {raVisible && (
              <g
                className="cursor-pointer transition-opacity hover:opacity-85"
                onMouseEnter={() =>
                  setHovered({
                    title: "右同源臂 Right Homology Arm (RA)",
                    badge: `${donor.right_arm_len} bp`,
                    badgeClass:
                      "bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
                    coords: `${formatCoord(locus.slice_genome_start + raStart)} .. ${formatCoord(locus.slice_genome_start + raEnd - 1)} bp`,
                    lengthLabel: `纯同源臂 ${donor.right_arm_len} bp · OE-PCR 扩增子 ${donor.ra_amplicon_bp} bp`,
                    seqPreview: `${donor.right_arm_seq.slice(0, 24)}...${donor.right_arm_seq.slice(-16)}`,
                    detail: `全长无缝 Donor 供体 ${donor.full_donor_len} bp`,
                  })
                }
                onMouseLeave={() => setHovered(null)}
              >
                <rect
                  x={raX1}
                  y={182}
                  width={Math.max(raX2 - raX1, 6)}
                  height={22}
                  rx={5}
                  fill="var(--svg-ra-fill)"
                  stroke="var(--svg-ra-stroke)"
                  strokeWidth="1.5"
                />
                <text
                  x={(raX1 + raX2) / 2}
                  y={197}
                  textAnchor="middle"
                  fill="var(--svg-ra-text)"
                  className="font-mono-bio text-[12px] font-bold pointer-events-none"
                >
                  {raX2 - raX1 > 64 ? `RA (${donor.right_arm_len} bp)` : "RA"}
                </text>
              </g>
            )}

            {laVisible && raVisible && (
              <g className="pointer-events-none">
                <path
                  d={`M ${laX2} 193 Q ${(laX2 + raX1) / 2} 218 ${raX1} 193`}
                  fill="none"
                  stroke="var(--svg-la-stroke)"
                  strokeWidth="1.4"
                  strokeDasharray="4 3"
                />
                <text
                  x={(laX2 + raX1) / 2}
                  y={220}
                  textAnchor="middle"
                  fill="var(--svg-la-text)"
                  className="font-mono-bio text-[12px] font-semibold"
                >
                  同源重组无缝拼接 (Donor {donor.full_donor_len} bp)
                </text>
              </g>
            )}

            {/* TRACK 5: VERIFICATION & SANGER PRIMERS */}
            {(() => {
              const vf = primersBase.find((p) => p.key === "VF");
              const vr = primersBase.find((p) => p.key === "VR");
              if (!vf || !vr) return null;
              const x1 = clampX(toX(vf.relStart));
              const x2 = clampX(toX(vr.relEnd));
              if (x2 - x1 < 20) return null;
              const badgeW = 248;
              const mid = Math.max(
                PAD_L + badgeW / 2,
                Math.min(SVG_W - PAD_R - badgeW / 2, (x1 + x2) / 2)
              );
              return (
                <g className="pointer-events-none">
                  <line
                    x1={x1}
                    y1={248}
                    x2={x2}
                    y2={248}
                    stroke="var(--svg-amp-stroke)"
                    strokeWidth="2"
                  />
                  <rect
                    x={mid - badgeW / 2}
                    y={237}
                    width={badgeW}
                    height={22}
                    rx={11}
                    fill="var(--svg-amp-fill)"
                    stroke="var(--svg-amp-stroke)"
                  />
                  <text
                    x={mid}
                    y={252}
                    textAnchor="middle"
                    fill="var(--svg-amp-text)"
                    className="font-mono-bio text-[12px] font-bold"
                  >
                    菌落 PCR: WT {verificationPrimers.wt_amplicon_bp} bp → KO{" "}
                    {verificationPrimers.ko_amplicon_bp} bp
                  </text>
                </g>
              );
            })()}

            {laidOutPrimers.map((p) => {
              const centerX = clampX(p.centerX);
              const y = 276 + p.row * 30;
              const arrowLen = 24;
              const xStart =
                p.strand === "+"
                  ? centerX - arrowLen / 2
                  : centerX + arrowLen / 2;
              const xEnd =
                p.strand === "+"
                  ? centerX + arrowLen / 2
                  : centerX - arrowLen / 2;

              const strokeColor =
                p.key === "VF" || p.key === "VR"
                  ? "var(--accent-primary)"
                  : p.color;

              return (
                <g
                  key={p.key}
                  className="cursor-pointer"
                  onMouseEnter={() =>
                    setHovered({
                      title: `${p.spec.name} (${p.shortLabel})`,
                      badge: `Tm ${p.spec.tm_binding_c.toFixed(1)}°C · ${p.spec.length_nt} nt`,
                      badgeClass:
                        "bg-[var(--accent-soft)] text-accent",
                      coords: `${formatCoord(locus.slice_genome_start + p.relStart)} .. ${formatCoord(locus.slice_genome_start + p.relEnd)} bp`,
                      lengthLabel: `GC ${p.spec.gc_percent.toFixed(1)}% · 纯化 ${p.spec.purification_method}`,
                      strand: `${p.strand} 链结合`,
                      seqPreview: `5'-${p.spec.sequence}-3'`,
                      detail: p.spec.notes || p.spec.template_source,
                    })
                  }
                  onMouseLeave={() => setHovered(null)}
                >
                  <line
                    x1={xStart}
                    y1={y}
                    x2={xEnd}
                    y2={y}
                    stroke={strokeColor}
                    strokeWidth="3.2"
                    strokeLinecap="round"
                  />
                  <polygon
                    points={
                      p.strand === "+"
                        ? `${xEnd + 5},${y} ${xEnd - 4},${y - 5.5} ${xEnd - 4},${y + 5.5}`
                        : `${xEnd - 5},${y} ${xEnd + 4},${y - 5.5} ${xEnd + 4},${y + 5.5}`
                    }
                    fill={strokeColor}
                  />
                  <text
                    x={centerX}
                    y={y + 18}
                    textAnchor="middle"
                    fill={strokeColor}
                    className="font-mono-bio text-[12px] font-bold"
                  >
                    {p.shortLabel}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Bottom Interactive Minimap Track */}
        <div className="mt-3 space-y-1">
          <div className="flex items-center justify-between text-xs text-[var(--text-muted)]">
            <span className="font-medium inline-flex items-center gap-1">
              <MousePointerClick className="h-3.5 w-3.5" />
              全基因座缩略导航条 (点击或拖拽快速平移)
            </span>
            <span className="font-mono-bio">
              {formatCoord(locus.slice_genome_start + viewStart)} ..{" "}
              {formatCoord(locus.slice_genome_start + viewEnd)} bp
            </span>
          </div>
          <div
            ref={minimapRef}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              minimapDragRef.current = true;
              panFromMinimapClientX(e.clientX);
            }}
            onPointerMove={(e) => {
              if (!minimapDragRef.current) return;
              panFromMinimapClientX(e.clientX);
            }}
            onPointerUp={(e) => {
              minimapDragRef.current = false;
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                e.currentTarget.releasePointerCapture(e.pointerId);
              }
            }}
            className="neu-recessed relative h-6 w-full overflow-hidden rounded-full dark:rounded-md cursor-pointer select-none"
          >
            <div className="absolute inset-x-0 top-1/2 h-[2px] -translate-y-1/2 bg-[var(--border-strong)]" />
            <div
              style={{ left: `${mmTargetL}%`, width: `${mmTargetW}%` }}
              className="absolute top-1.5 bottom-1.5 rounded-xs bg-[#6d5dfc]/85 dark:bg-sky-400/85"
            />
            <div
              style={{ left: `${mmDelL}%`, width: `${mmDelW}%` }}
              className="absolute top-2 bottom-2 rounded-xs bg-[#ff6b6b]/90 dark:bg-rose-600/85"
            />
            <div
              style={{ left: `${mmCutL}%` }}
              className="absolute top-0.5 bottom-0.5 w-[2px] bg-[#ff6b6b] dark:bg-rose-600"
            />
            <div
              style={{
                left: `${mmWinL}%`,
                width: `${Math.min(100 - mmWinL, mmWinW)}%`,
              }}
              className="absolute inset-y-0 rounded-full dark:rounded border-2 border-[var(--accent-primary)] bg-[var(--accent-soft)]"
            />
          </div>
        </div>

        {/* Bottom Inspector HUD */}
        <div className="neu-recessed mt-4 min-h-[72px] rounded-2xl dark:rounded-lg dark:bg-[var(--bg-surface)] px-4 py-3">
          {hovered ? (
            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--text-primary)]">
                    {hovered.title}
                  </span>
                  <span
                    className={`rounded-full dark:rounded-md px-2.5 py-0.5 font-mono-bio text-xs font-medium ${hovered.badgeClass}`}
                  >
                    {hovered.badge}
                  </span>
                  {hovered.strand && (
                    <span className="font-mono-bio text-xs text-[var(--text-muted)]">
                      {hovered.strand}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-[var(--text-secondary)]">
                  <span className="font-mono-bio font-semibold">
                    坐标：{hovered.coords}
                  </span>
                  <span>{hovered.lengthLabel}</span>
                </div>
                {hovered.detail && (
                  <p className="text-xs text-[var(--text-muted)] truncate">
                    {hovered.detail}
                  </p>
                )}
              </div>
              {hovered.seqPreview && (
                <code className="neu-soft-tile shrink-0 px-3 py-1.5 font-mono-bio text-xs text-accent max-w-full overflow-x-auto">
                  {hovered.seqPreview}
                </code>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 py-1 text-xs text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <Scissors className="h-4 w-4 text-[#ff6b6b] dark:text-rose-400 shrink-0" />
                悬停基因、RBS 保护区、LA/RA、Cas9 切点或引物查看精确坐标与序列；支持 1×–20× 无级缩放与拖拽平移
              </span>
              <span className="inline-flex items-center gap-1 font-medium text-accent">
                <ShieldCheck className="h-4 w-4" />
                外侧引物距同源臂外缘 +{verificationPrimers.distance_outside_la_bp} / +
                {verificationPrimers.distance_outside_ra_bp} bp
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Legend Footer */}
      <div className="neu-divider-t flex flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3.5 text-xs text-[var(--text-secondary)] dark:bg-[var(--bg-subtle)]/70 dark:px-5 dark:py-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-xs bg-[#6d5dfc] dark:bg-sky-400" />
          目标基因 ORF
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-xs border border-amber-500 bg-amber-100" />
          RBS / 安全保护区
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-xs border border-dashed border-[#ff6b6b] bg-[#ff6b6b]/15 dark:border-rose-600 dark:bg-rose-500/20" />
          敲除缺失区间
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-xs border border-[#6d5dfc] bg-[#6d5dfc]/15 dark:border-sky-400 dark:bg-sky-500/15" />
          左同源臂 (LA)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-4 rounded-xs border border-[#2ea89f] bg-[#4ecdc4]/20 dark:border-slate-400 dark:bg-slate-400/15" />
          右同源臂 (RA)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full bg-[#ff6b6b] dark:bg-rose-600" />
          Cas9 切点
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-4 rounded-full bg-[#6d5dfc] dark:bg-sky-400" />
          外侧鉴定引物 (VF/VR)
        </span>
      </div>
    </div>
  );
}
