"use client";

import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Compass,
  Loader2,
  Play,
  X,
} from "lucide-react";

interface ProductTourProps {
  open: boolean;
  hasDesign: boolean;
  isRunningDemo: boolean;
  demoError?: string | null;
  onClose: (dontShowAgain: boolean) => void;
  onRunDemoExample: () => void;
}

type Placement = "top" | "bottom" | "left" | "right" | "floating";

interface TourStepConfig {
  id: string;
  target: string;
  fallbackTarget?: string;
  title: string;
  description: string;
  preferredPlacement: Exclude<Placement, "floating">;
  requiresDesign: boolean;
  scrollStrategy: "top" | "center" | "start" | "none";
}

interface SpotlightRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface PopoverGeometry {
  left: number;
  top: number;
  placement: Placement;
  arrowOffset: number;
}

const TOUR_STEPS: TourStepConfig[] = [
  {
    id: "demo-chips",
    target: "demo-chips",
    fallbackTarget: "composer-panel",
    title: "一键运行内置经典示例",
    description:
      "欢迎使用 CRISPR-Forge！点这里任意内置示例即可 1 秒跑通全流程。点下方「自动运行示例并继续」，我直接带你用库里的经典例子演练一遍！",
    preferredPlacement: "bottom",
    requiresDesign: false,
    scrollStrategy: "top",
  },
  {
    id: "composer-panel",
    target: "composer-panel",
    title: "单行摘要与全局检索 / 上传",
    description:
      "结果生成后顶部表单自动收成单行摘要。随时点右侧「修改参数 / 新建设计」展开，即可用中英文模糊搜索任意新库条目，或拖入本地文件自动解析。",
    preferredPlacement: "bottom",
    requiresDesign: true,
    scrollStrategy: "top",
  },
  {
    id: "sidebar-nav",
    target: "sidebar-nav",
    title: "左侧大纲栏与实时徽标",
    description:
      "左侧大纲栏可一键直达任意模块，并实时汇总核验通过数、条带差以及红色警戒提醒数，底部可随时折叠腾出更大视野。",
    preferredPlacement: "right",
    requiresDesign: true,
    scrollStrategy: "none",
  },
  {
    id: "verification-gate",
    target: "verification-gate",
    title: "12 项确定性仿真核验",
    description:
      "这里展示 12 项确定性仿真核验结果。点开任意卡片都能看到大白话说明，零阻断即代表方案已经过完整校验。",
    preferredPlacement: "bottom",
    requiresDesign: true,
    scrollStrategy: "start",
  },
  {
    id: "visuals-section",
    target: "visuals-section",
    title: "动态缩放图谱与模拟电泳",
    description:
      "左侧图谱支持滚轮/滑块 1×–20× 平滑缩放与拖拽平移；右侧模拟胶图悬停任意泳道会自动对齐左侧标尺。",
    preferredPlacement: "top",
    requiresDesign: true,
    scrollStrategy: "start",
  },
  {
    id: "wetlab-section",
    target: "wetlab-section",
    title: "动态浓度移液与红色稀释预警",
    description:
      "在这里填实测浓度会实时重算加样体积；一旦出现微量误差风险，会亮起醒目的红色稀释提醒。右侧下拉框还内置了 15 款常用酶并支持自定义。",
    preferredPlacement: "top",
    requiresDesign: true,
    scrollStrategy: "start",
  },
  {
    id: "top-controls",
    target: "top-controls",
    title: "精调字号、主题切换与一键交付",
    description:
      "最后，顶栏可按 1%–2% 精调字号、自由切换浅色新拟物/深色曜石主题或绑定自己的模型 Key；页面底部可一键打包下载全部交付文件！",
    preferredPlacement: "bottom",
    requiresDesign: false,
    scrollStrategy: "none",
  },
];

const SPOTLIGHT_PAD = 8;
const POPOVER_GAP = 14;
const VIEWPORT_MARGIN = 12;
const TOP_NAV_SAFE_Y = 60;
const DEFAULT_CARD_WIDTH = 352;
const DEFAULT_CARD_HEIGHT = 240;

function findVisibleAnchor(
  target: string,
  fallbackTarget?: string
): HTMLElement | null {
  const keys = fallbackTarget ? [target, fallbackTarget] : [target];
  for (const key of keys) {
    const nodes = document.querySelectorAll<HTMLElement>(`[data-tour="${key}"]`);
    for (const el of Array.from(nodes)) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      return el;
    }
  }
  return null;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function computeSpotlightRect(
  el: HTMLElement,
  stepId: string
): SpotlightRect | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const minTop = stepId === "top-controls" ? 4 : TOP_NAV_SAFE_Y;
  const maxBottom = vh - 10;

  const left = clamp(rect.left - SPOTLIGHT_PAD, 4, vw - 24);
  const right = clamp(rect.right + SPOTLIGHT_PAD, left + 20, vw - 4);
  const top = clamp(rect.top - SPOTLIGHT_PAD, minTop, maxBottom - 24);
  const bottom = clamp(rect.bottom + SPOTLIGHT_PAD, top + 24, maxBottom);

  return {
    left,
    top,
    width: Math.max(24, right - left),
    height: Math.max(24, bottom - top),
  };
}

function computePopoverGeometry(
  spot: SpotlightRect | null,
  preferred: Exclude<Placement, "floating">,
  cardWidth: number,
  cardHeight: number,
  stepId: string
): PopoverGeometry {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const effW = Math.min(cardWidth, vw - VIEWPORT_MARGIN * 2);
  const effH = Math.min(cardHeight, vh - VIEWPORT_MARGIN * 2);
  const minY = stepId === "top-controls" ? 58 : TOP_NAV_SAFE_Y + 4;

  if (!spot) {
    return {
      left: Math.round((vw - effW) / 2),
      top: Math.round((vh - effH) / 2),
      placement: "floating",
      arrowOffset: effW / 2,
    };
  }

  const spotRight = spot.left + spot.width;
  const spotBottom = spot.top + spot.height;
  const spotCenterX = spot.left + spot.width / 2;
  const spotCenterY = spot.top + spot.height / 2;

  const spaceBelow = vh - VIEWPORT_MARGIN - spotBottom;
  const spaceAbove = spot.top - minY;
  const spaceRight = vw - VIEWPORT_MARGIN - spotRight;
  const spaceLeft = spot.left - VIEWPORT_MARGIN;

  const orderMap: Record<
    Exclude<Placement, "floating">,
    Array<Exclude<Placement, "floating">>
  > = {
    bottom: ["bottom", "top", "right", "left"],
    top: ["top", "bottom", "right", "left"],
    right: ["right", "bottom", "top", "left"],
    left: ["left", "right", "bottom", "top"],
  };

  // On narrow viewports where sidebar becomes a horizontal top strip, prefer bottom
  const effectivePreferred: Exclude<Placement, "floating"> =
    stepId === "sidebar-nav" && spot.width > spot.height * 2
      ? "bottom"
      : preferred;

  const candidates = orderMap[effectivePreferred];

  for (const side of candidates) {
    if (side === "bottom" && spaceBelow >= effH + POPOVER_GAP) {
      const left = clamp(
        spotCenterX - effW / 2,
        VIEWPORT_MARGIN,
        vw - effW - VIEWPORT_MARGIN
      );
      const top = spotBottom + POPOVER_GAP;
      const arrowOffset = clamp(spotCenterX - left, 24, effW - 24);
      return { left: Math.round(left), top: Math.round(top), placement: "bottom", arrowOffset };
    }

    if (side === "top" && spaceAbove >= effH + POPOVER_GAP) {
      const left = clamp(
        spotCenterX - effW / 2,
        VIEWPORT_MARGIN,
        vw - effW - VIEWPORT_MARGIN
      );
      const top = spot.top - POPOVER_GAP - effH;
      const arrowOffset = clamp(spotCenterX - left, 24, effW - 24);
      return { left: Math.round(left), top: Math.round(top), placement: "top", arrowOffset };
    }

    if (side === "right" && spaceRight >= effW + POPOVER_GAP) {
      const left = spotRight + POPOVER_GAP;
      const preferredTop =
        stepId === "sidebar-nav" ? Math.min(spot.top + 88, spotCenterY - effH / 2) : spotCenterY - effH / 2;
      const top = clamp(preferredTop, minY, vh - effH - VIEWPORT_MARGIN);
      const arrowOffset = clamp(
        (stepId === "sidebar-nav" ? spot.top + 130 : spotCenterY) - top,
        24,
        effH - 24
      );
      return { left: Math.round(left), top: Math.round(top), placement: "right", arrowOffset };
    }

    if (side === "left" && spaceLeft >= effW + POPOVER_GAP) {
      const left = spot.left - POPOVER_GAP - effW;
      const top = clamp(spotCenterY - effH / 2, minY, vh - effH - VIEWPORT_MARGIN);
      const arrowOffset = clamp(spotCenterY - top, 24, effH - 24);
      return { left: Math.round(left), top: Math.round(top), placement: "left", arrowOffset };
    }
  }

  // Fallback for tall full-viewport sections: dock cleanly in bottom-right corner inside viewport
  return {
    left: Math.round(clamp(vw - effW - 24, VIEWPORT_MARGIN, vw - effW - VIEWPORT_MARGIN)),
    top: Math.round(clamp(vh - effH - 24, minY, vh - effH - VIEWPORT_MARGIN)),
    placement: "floating",
    arrowOffset: effW / 2,
  };
}

export function ProductTour({
  open,
  hasDesign,
  isRunningDemo,
  demoError,
  onClose,
  onRunDemoExample,
}: ProductTourProps) {
  const maskId = useId();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const prevOpenRef = useRef(false);
  const prevHasDesignRef = useRef(hasDesign);
  const prevRunningRef = useRef(isRunningDemo);

  const [stepIdx, setStepIdx] = useState(0);
  const [dontShowAgain, setDontShowAgain] = useState(true);
  const [waitingForDemo, setWaitingForDemo] = useState(false);
  const [spotRect, setSpotRect] = useState<SpotlightRect | null>(null);
  const [popoverGeom, setPopoverGeom] = useState<PopoverGeometry>({
    left: 24,
    top: 84,
    placement: "floating",
    arrowOffset: 176,
  });

  const currentStep = TOUR_STEPS[stepIdx] ?? TOUR_STEPS[0];

  // Reset to Step 1 whenever tour re-opens
  useEffect(() => {
    if (open && !prevOpenRef.current) {
      setStepIdx(0);
      setWaitingForDemo(false);
    }
    prevOpenRef.current = open;
  }, [open]);

  // Auto-advance from Step 1 -> Step 2 once demo design finishes generating
  useEffect(() => {
    if (!open) {
      prevHasDesignRef.current = hasDesign;
      prevRunningRef.current = isRunningDemo;
      return;
    }

    const demoJustFinishedWithDesign =
      stepIdx === 0 &&
      hasDesign &&
      !isRunningDemo &&
      (waitingForDemo || !prevHasDesignRef.current);

    if (demoJustFinishedWithDesign) {
      const timer = window.setTimeout(() => {
        setWaitingForDemo(false);
        setStepIdx(1);
      }, 280);
      prevHasDesignRef.current = hasDesign;
      prevRunningRef.current = isRunningDemo;
      return () => window.clearTimeout(timer);
    }

    // If demo run failed/aborted while waiting, unlock button so user isn't stuck
    if (waitingForDemo && prevRunningRef.current && !isRunningDemo && !hasDesign) {
      setWaitingForDemo(false);
    }

    prevHasDesignRef.current = hasDesign;
    prevRunningRef.current = isRunningDemo;
  }, [open, stepIdx, hasDesign, isRunningDemo, waitingForDemo]);

  const measureAndPosition = useCallback(() => {
    if (!open) return;
    const step = TOUR_STEPS[stepIdx] ?? TOUR_STEPS[0];
    const el = findVisibleAnchor(step.target, step.fallbackTarget);
    const nextSpot = el ? computeSpotlightRect(el, step.id) : null;
    const cardW = cardRef.current?.offsetWidth || DEFAULT_CARD_WIDTH;
    const cardH = cardRef.current?.offsetHeight || DEFAULT_CARD_HEIGHT;
    const nextGeom = computePopoverGeometry(
      nextSpot,
      step.preferredPlacement,
      cardW,
      cardH,
      step.id
    );

    setSpotRect(nextSpot);
    setPopoverGeom(nextGeom);
  }, [open, stepIdx]);

  // Scroll target element smoothly into view whenever active step changes
  useEffect(() => {
    if (!open) return;
    const step = TOUR_STEPS[stepIdx] ?? TOUR_STEPS[0];
    const el = findVisibleAnchor(step.target, step.fallbackTarget);

    if (el) {
      if (step.scrollStrategy === "top") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else if (step.scrollStrategy === "start") {
        const rect = el.getBoundingClientRect();
        const targetTop = Math.max(0, window.scrollY + rect.top - 78);
        window.scrollTo({ top: targetTop, behavior: "smooth" });
      } else if (step.scrollStrategy === "center") {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }

    // Continuously track smooth-scroll settlement for ~650ms
    let rafId = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      measureAndPosition();
      if (now - startedAt < 650) {
        rafId = window.requestAnimationFrame(tick);
      }
    };
    rafId = window.requestAnimationFrame(tick);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [open, stepIdx, hasDesign, measureAndPosition]);

  // Re-measure on scroll, resize, DOM mutations, and card size changes
  useLayoutEffect(() => {
    if (!open) return;
    measureAndPosition();

    let rafPending = false;
    const scheduleMeasure = () => {
      if (rafPending) return;
      rafPending = true;
      window.requestAnimationFrame(() => {
        rafPending = false;
        measureAndPosition();
      });
    };

    window.addEventListener("scroll", scheduleMeasure, true);
    window.addEventListener("resize", scheduleMeasure);

    const observer = new MutationObserver(scheduleMeasure);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "data-tour"],
    });

    return () => {
      window.removeEventListener("scroll", scheduleMeasure, true);
      window.removeEventListener("resize", scheduleMeasure);
      observer.disconnect();
    };
  }, [open, measureAndPosition]);

  // Escape key to dismiss tour
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose(dontShowAgain);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, dontShowAgain, onClose]);

  if (!open) return null;

  const isFirst = stepIdx === 0;
  const isLast = stepIdx === TOUR_STEPS.length - 1;
  const isStep1Loading = isFirst && (waitingForDemo || isRunningDemo);

  const handlePrimaryAction = () => {
    if (isFirst) {
      if (hasDesign) {
        setStepIdx(1);
        return;
      }
      if (isRunningDemo || waitingForDemo) return;
      setWaitingForDemo(true);
      onRunDemoExample();
      return;
    }

    if (isLast) {
      onClose(dontShowAgain);
      return;
    }

    setStepIdx((prev) => Math.min(TOUR_STEPS.length - 1, prev + 1));
  };

  const handlePrev = () => {
    if (stepIdx <= 0 || isStep1Loading) return;
    setStepIdx((prev) => Math.max(0, prev - 1));
  };

  const handleSelectDot = (idx: number) => {
    if (isStep1Loading) return;
    const targetStep = TOUR_STEPS[idx];
    if (!targetStep) return;
    if (targetStep.requiresDesign && !hasDesign) return;
    setStepIdx(idx);
  };

  const arrowBaseClass =
    "pointer-events-none absolute h-3 w-3 rotate-45 bg-[#e0e5ec] dark:h-2.5 dark:w-2.5 dark:border-[var(--border-strong)] dark:bg-[var(--bg-surface)]";

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`CRISPR-Forge 新手引导 · 步骤 ${stepIdx + 1} / ${TOUR_STEPS.length}`}
      className="fixed inset-0 z-[90] pointer-events-none"
    >
      {/* Full-viewport dimmed backdrop with crisp rounded-rectangle SVG spotlight cutout */}
      <svg
        className="fixed inset-0 h-full w-full pointer-events-none"
        aria-hidden="true"
      >
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotRect && (
              <rect
                x={spotRect.left}
                y={spotRect.top}
                width={spotRect.width}
                height={spotRect.height}
                rx={10}
                ry={10}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(2, 6, 23, 0.58)"
          mask={`url(#${maskId})`}
        />
      </svg>

      {/* Four subtle click shields outside the spotlight cutout (keeps highlighted element interactive) */}
      {spotRect ? (
        <>
          <div
            className="fixed left-0 top-0 right-0 pointer-events-auto"
            style={{ height: Math.max(0, spotRect.top) }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="fixed left-0 bottom-0 right-0 pointer-events-auto"
            style={{ top: spotRect.top + spotRect.height }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="fixed left-0 pointer-events-auto"
            style={{
              top: spotRect.top,
              height: spotRect.height,
              width: Math.max(0, spotRect.left),
            }}
            onClick={(e) => e.stopPropagation()}
          />
          <div
            className="fixed right-0 pointer-events-auto"
            style={{
              top: spotRect.top,
              height: spotRect.height,
              left: spotRect.left + spotRect.width,
            }}
            onClick={(e) => e.stopPropagation()}
          />
        </>
      ) : (
        <div
          className="fixed inset-0 pointer-events-auto"
          onClick={(e) => e.stopPropagation()}
        />
      )}

      {/* Spotlight highlight ring */}
      {spotRect && (
        <div
          aria-hidden="true"
          className="fixed pointer-events-none rounded-[10px]"
          style={{
            left: spotRect.left,
            top: spotRect.top,
            width: spotRect.width,
            height: spotRect.height,
            border: "2px solid var(--accent-primary)",
            boxShadow:
              "0 0 0 4px var(--accent-soft), 0 12px 32px -8px rgba(2, 6, 23, 0.45)",
          }}
        />
      )}

      {/* Anchored Floating Tooltip Card */}
      <div
        ref={cardRef}
        className="neu-popover fixed z-[95] pointer-events-auto w-[360px] max-w-[calc(100vw-24px)] text-[var(--text-primary)] dark:border-[var(--border-strong)] dark:bg-[var(--bg-surface)]"
        style={{
          left: popoverGeom.left,
          top: popoverGeom.top,
        }}
      >
        {/* Directional Pointer Arrow */}
        {popoverGeom.placement === "bottom" && (
          <span
            aria-hidden="true"
            className={`${arrowBaseClass} -top-[6px] dark:border-l dark:border-t`}
            style={{ left: popoverGeom.arrowOffset - 5 }}
          />
        )}
        {popoverGeom.placement === "top" && (
          <span
            aria-hidden="true"
            className={`${arrowBaseClass} -bottom-[6px] dark:border-r dark:border-b`}
            style={{ left: popoverGeom.arrowOffset - 5 }}
          />
        )}
        {popoverGeom.placement === "right" && (
          <span
            aria-hidden="true"
            className={`${arrowBaseClass} -left-[6px] dark:border-l dark:border-b`}
            style={{ top: popoverGeom.arrowOffset - 5 }}
          />
        )}
        {popoverGeom.placement === "left" && (
          <span
            aria-hidden="true"
            className={`${arrowBaseClass} -right-[6px] dark:border-r dark:border-t`}
            style={{ top: popoverGeom.arrowOffset - 5 }}
          />
        )}

        {/* Header */}
        <div className="neu-divider-b flex items-center justify-between gap-2 px-5 py-3.5">
          <div className="neu-recessed inline-flex items-center gap-1.5 rounded-full dark:rounded-md px-2.5 py-1 text-xs font-semibold text-accent font-mono-bio">
            <Compass className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            <span>
              步骤 {stepIdx + 1} / {TOUR_STEPS.length}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onClose(dontShowAgain)}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)] cursor-pointer"
            aria-label="跳过引导"
          >
            <span>跳过</span>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-3 px-5 py-4">
          <h3 className="font-display text-base text-[var(--text-primary)] dark:text-sm">
            {currentStep.title}
          </h3>
          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {currentStep.description}
          </p>

          {isStep1Loading && (
            <div className="neu-recessed flex items-center gap-2 rounded-2xl dark:rounded-lg px-3.5 py-2.5 text-xs font-medium text-accent">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--accent-primary)]" />
              <span>正在运行内置经典示例，结果生成后将自动跳转至步骤 2…</span>
            </div>
          )}

          {isFirst && !isStep1Loading && demoError && (
            <div className="neu-alert-coral px-3.5 py-2 text-xs font-medium text-[#c93232] dark:text-rose-200">
              示例运行未完成：{demoError}
            </div>
          )}

          {/* Step Progress Dots */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-1.5" role="tablist" aria-label="引导进度">
              {TOUR_STEPS.map((s, idx) => {
                const isActive = idx === stepIdx;
                const locked = s.requiresDesign && !hasDesign;
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={locked || isStep1Loading}
                    onClick={() => handleSelectDot(idx)}
                    title={`步骤 ${idx + 1}：${s.title}${locked ? "（运行示例后解锁）" : ""}`}
                    aria-label={`跳到步骤 ${idx + 1}`}
                    className={`h-2 rounded-full transition-all ${
                      isActive
                        ? "w-5 bg-[var(--accent-primary)]"
                        : locked
                        ? "w-2 bg-[#c5cbd4] dark:bg-[var(--border-hairline)] opacity-55 cursor-not-allowed"
                        : "w-2 bg-[#aeb5c0] dark:bg-[var(--border-strong)] hover:bg-[var(--accent-primary)]/70 cursor-pointer"
                    }`}
                  />
                );
              })}
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] select-none cursor-pointer">
              <input
                type="checkbox"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="h-3.5 w-3.5 rounded accent-[var(--accent-primary)] cursor-pointer"
              />
              <span>不再自动弹出</span>
            </label>
          </div>
        </div>

        {/* Action Footer */}
        <div className="neu-divider-t flex items-center justify-between gap-2 px-5 py-3.5 dark:bg-[var(--bg-subtle)]/65 dark:rounded-b-xl">
          {!isFirst ? (
            <button
              type="button"
              onClick={handlePrev}
              disabled={isStep1Loading}
              className="btn-outline inline-flex items-center gap-1 px-3.5 py-2 text-xs font-medium cursor-pointer disabled:opacity-50"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              上一步
            </button>
          ) : (
            <span className="text-xs text-[var(--text-muted)]">
              按 <kbd className="neu-recessed rounded-md px-1.5 py-0.5 font-mono-bio text-xs">Esc</kbd> 随时退出
            </span>
          )}

          <button
            type="button"
            onClick={handlePrimaryAction}
            disabled={isStep1Loading}
            className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold cursor-pointer disabled:opacity-75 disabled:cursor-wait"
          >
            {isFirst ? (
              isStep1Loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  示例运行中...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  自动运行示例并继续
                </>
              )
            ) : isLast ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                完成引导
              </>
            ) : (
              <>
                下一步
                <ArrowRight className="h-3.5 w-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
