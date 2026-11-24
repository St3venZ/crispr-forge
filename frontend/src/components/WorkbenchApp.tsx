"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, Beaker, Dna, ShieldCheck, X } from "lucide-react";
import { ApiKeyModal } from "@/components/ApiKeyModal";
import { AuditStepper } from "@/components/AuditStepper";
import { DesignComposer } from "@/components/DesignComposer";
import { ExportBar } from "@/components/ExportBar";
import { LocusVisualizer } from "@/components/LocusVisualizer";
import { PrimerStudio } from "@/components/PrimerStudio";
import { ProductTour } from "@/components/ProductTour";
import { SideOutlineNav } from "@/components/SideOutlineNav";
import { SimulatedGel } from "@/components/SimulatedGel";
import { TopNav } from "@/components/TopNav";
import { VerificationGate } from "@/components/VerificationGate";
import { WetLabWorkbench } from "@/components/WetLabWorkbench";
import {
  fetchCatalog,
  fetchHealth,
  fetchQuota,
  recalculateWetlab,
  reverifyDesign,
  runDesignStream,
} from "@/lib/api";
import { DEMO_CHIPS, FALLBACK_POLYMERASE_CATALOG } from "@/lib/constants";
import {
  applyFontScaleToDocument,
  applyThemeToDocument,
  clampFontScalePct,
  clearByokConfig,
  DEFAULT_FONT_SCALE_PCT,
  EMPTY_BYOK,
  hasSeenOnboarding,
  loadByokConfig,
  loadCustomPolymerases,
  loadFontScalePct,
  loadSidebarCollapsed,
  loadThemeMode,
  markOnboardingSeen,
  saveByokConfig,
  saveCustomPolymerases,
  saveFontScalePct,
  saveSidebarCollapsed,
  saveThemeMode,
} from "@/lib/storage";
import type {
  AuditStep,
  ByokConfig,
  CustomPolymeraseConfig,
  DesignResponse,
  KnockoutRequest,
  PipettingCalcRequest,
  PlasmidCatalogItem,
  PolymeraseCatalogItem,
  PolymeraseName,
  QuotaStatus,
  SgRNACandidate,
  ThemeMode,
} from "@/types/crispr";

export function WorkbenchApp() {
  const [themeMode, setThemeMode] = useState<ThemeMode>("system");
  const [fontScalePct, setFontScalePct] = useState<number>(
    DEFAULT_FONT_SCALE_PCT
  );
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);

  const [byokConfig, setByokConfig] = useState<ByokConfig>(EMPTY_BYOK);
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [guideModalOpen, setGuideModalOpen] = useState(false);

  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [quota, setQuota] = useState<QuotaStatus | null>(null);
  const [plasmids, setPlasmids] = useState<PlasmidCatalogItem[]>([]);
  const [polymerases, setPolymerases] = useState<PolymeraseCatalogItem[]>(
    FALLBACK_POLYMERASE_CATALOG
  );
  const [cachedWholeGenomes, setCachedWholeGenomes] = useState<string[]>([]);

  const [customPolymerases, setCustomPolymerases] = useState<
    CustomPolymeraseConfig[]
  >([]);
  const [selectedPolymerase, setSelectedPolymerase] = useState<PolymeraseName>(
    "Phanta Max (Vazyme)"
  );
  const [selectedCustomPolymerase, setSelectedCustomPolymerase] =
    useState<CustomPolymeraseConfig | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [liveSteps, setLiveSteps] = useState<AuditStep[]>([]);
  const [design, setDesign] = useState<DesignResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isReverifying, setIsReverifying] = useState(false);
  const [reverifyingId, setReverifyingId] = useState<string | null>(null);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const resultAnchorRef = useRef<HTMLDivElement | null>(null);
  const tourOpenRef = useRef(false);

  useEffect(() => {
    tourOpenRef.current = guideModalOpen;
  }, [guideModalOpen]);

  const refreshQuota = useCallback(async (cfg: ByokConfig) => {
    try {
      const q = await fetchQuota(cfg.apiKey, cfg.model);
      setQuota(q);
    } catch {
      // Backend offline handled via health check
    }
  }, []);

  useEffect(() => {
    const savedTheme = loadThemeMode();
    const savedScalePct = loadFontScalePct();
    const savedCollapsed = loadSidebarCollapsed();
    const savedCustomPolys = loadCustomPolymerases();
    const loadedByok = loadByokConfig();

    setThemeMode(savedTheme);
    setFontScalePct(savedScalePct);
    setSidebarCollapsed(savedCollapsed);
    setCustomPolymerases(savedCustomPolys);
    setByokConfig(loadedByok);

    applyThemeToDocument(savedTheme);
    applyFontScaleToDocument(savedScalePct);

    if (!hasSeenOnboarding()) {
      setGuideModalOpen(true);
    }

    fetchHealth()
      .then((h) => {
        setBackendOnline(true);
        if (Array.isArray(h.cached_whole_genomes)) {
          setCachedWholeGenomes(h.cached_whole_genomes);
        }
      })
      .catch(() => setBackendOnline(false));

    fetchCatalog()
      .then((cat) => {
        const plasmidList = cat.plasmid_systems ?? cat.plasmids ?? [];
        if (Array.isArray(plasmidList) && plasmidList.length > 0) {
          setPlasmids(plasmidList);
        }
        if (Array.isArray(cat.polymerases) && cat.polymerases.length > 0) {
          setPolymerases(cat.polymerases);
        }
        if (Array.isArray(cat.cached_whole_genomes)) {
          setCachedWholeGenomes(cat.cached_whole_genomes);
        }
      })
      .catch(() => {
        // Fallbacks built into constants
      });

    refreshQuota(loadedByok);
  }, [refreshQuota]);

  useEffect(() => {
    if (themeMode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => applyThemeToDocument("system");
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, [themeMode]);

  const handleChangeTheme = (mode: ThemeMode) => {
    setThemeMode(mode);
    saveThemeMode(mode);
    applyThemeToDocument(mode);
  };

  const handleChangeFontScalePct = (pct: number) => {
    const clamped = clampFontScalePct(pct);
    setFontScalePct(clamped);
    saveFontScalePct(clamped);
    applyFontScaleToDocument(clamped);
  };

  const handleToggleSidebar = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      saveSidebarCollapsed(next);
      return next;
    });
  };

  const handleChangePolymerase = useCallback(
    (name: PolymeraseName, customCfg: CustomPolymeraseConfig | null) => {
      setSelectedPolymerase(name);
      setSelectedCustomPolymerase(customCfg);
    },
    []
  );

  const handleSaveCustomPolymerase = useCallback(
    (cfg: CustomPolymeraseConfig) => {
      setCustomPolymerases((prev) => {
        const next = [cfg, ...prev.filter((p) => p.name !== cfg.name)];
        saveCustomPolymerases(next);
        return next;
      });
    },
    []
  );

  const handleDeleteCustomPolymerase = useCallback((name: string) => {
    setCustomPolymerases((prev) => {
      const next = prev.filter((p) => p.name !== name);
      saveCustomPolymerases(next);
      return next;
    });
  }, []);

  const handleSaveByok = (cfg: ByokConfig) => {
    setByokConfig(cfg);
    saveByokConfig(cfg);
    refreshQuota(cfg);
  };

  const handleClearByok = () => {
    setByokConfig(EMPTY_BYOK);
    clearByokConfig();
    refreshQuota(EMPTY_BYOK);
  };

  const handleCancelRun = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsRunning(false);
  };

  const handleSubmitDesign = async (req: KnockoutRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setErrorMsg(null);
    setIsRunning(true);
    setLiveSteps([]);

    await runDesignStream(
      req,
      (step) => {
        setLiveSteps((prev) => {
          const exists = prev.some(
            (s) =>
              s.step_index === step.step_index && s.tool_name === step.tool_name
          );
          if (exists) return prev;
          return [...prev, step];
        });
      },
      (result) => {
        setDesign(result);
        setLiveSteps(result.audit_trace);
        setIsRunning(false);
        setBackendOnline(true);

        setSelectedPolymerase(result.wetlab_protocol.polymerase);
        setSelectedCustomPolymerase(
          result.wetlab_protocol.custom_polymerase ?? null
        );

        if (result.quota_status) {
          setQuota(result.quota_status);
        } else {
          refreshQuota(byokConfig);
        }

        fetchHealth()
          .then((h) => {
            if (Array.isArray(h.cached_whole_genomes)) {
              setCachedWholeGenomes(h.cached_whole_genomes);
            }
          })
          .catch(() => {});

        if (!tourOpenRef.current) {
          window.setTimeout(() => {
            resultAnchorRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 120);
        }
      },
      (msg) => {
        setErrorMsg(msg);
        setIsRunning(false);
      },
      controller.signal
    );
  };

  const handleSelectSgRNA = async (candidate: SgRNACandidate) => {
    if (!design || candidate.id === design.selected_sgrna.id) return;
    setErrorMsg(null);
    setIsReverifying(true);
    setReverifyingId(candidate.id);

    try {
      const updatedSelected: SgRNACandidate = { ...candidate, selected: true };
      const allPool = [design.selected_sgrna, ...design.alternative_sgrnas];
      const updatedAlts = allPool
        .filter((s) => s.id !== candidate.id)
        .map((s) => ({ ...s, selected: false }))
        .sort((a, b) => a.rank - b.rank);

      const res = await reverifyDesign({
        locus: design.locus,
        selected_sgrna: updatedSelected,
        donor: design.donor,
        verification_primers: design.verification_primers,
        plasmid_system: design.plasmid_system,
        custom_plasmid: design.custom_plasmid ?? null,
        min_band_diff_bp: 300,
      });

      setDesign((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          selected_sgrna: updatedSelected,
          alternative_sgrnas: updatedAlts,
          verification_report: res.verification_report,
          all_primers:
            res.all_primers && res.all_primers.length > 0
              ? res.all_primers
              : prev.all_primers,
        };
      });
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : "切换 sgRNA 即时重验失败。"
      );
    } finally {
      setIsReverifying(false);
      setReverifyingId(null);
    }
  };

  const handleRecalculateWetlab = useCallback(
    async (req: PipettingCalcRequest) => {
      setIsRecalculating(true);
      try {
        const updatedProtocol = await recalculateWetlab(req);
        setDesign((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            wetlab_protocol: updatedProtocol,
          };
        });
      } catch (err) {
        setErrorMsg(
          err instanceof Error ? err.message : "湿实验移液表重新计算失败。"
        );
      } finally {
        setIsRecalculating(false);
      }
    },
    []
  );

  const handleCloseGuide = useCallback((dontShowAgain: boolean) => {
    if (dontShowAgain) {
      markOnboardingSeen();
    }
    setGuideModalOpen(false);
  }, []);

  const handleRunDemoForTour = () => {
    const chip = DEMO_CHIPS[0];
    if (!chip) return;
    setSelectedPolymerase(chip.polymerase);
    setSelectedCustomPolymerase(null);
    const req: KnockoutRequest = {
      accession: chip.accession,
      gene_name: chip.gene_name,
      plasmid_system: chip.plasmid_system,
      custom_plasmid: null,
      homology_arm_length: chip.homology_arm_length,
      deletion_mode: chip.deletion_mode,
      donor_construction_method: "oe_pcr",
      polymerase: chip.polymerase,
      custom_polymerase: null,
      auto_fetch_whole_genome: true,
      target_tm: 60.0,
      min_band_diff_bp: 300,
      top_sgrna_count: 5,
      use_llm_agent: true,
      natural_language_prompt: chip.natural_language_prompt,
      ...(byokConfig.apiKey.trim()
        ? {
            llm_api_key: byokConfig.apiKey.trim(),
            llm_base_url: byokConfig.baseUrl.trim() || undefined,
            llm_model: byokConfig.model.trim() || undefined,
          }
        : {}),
    };
    handleSubmitDesign(req);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <TopNav
        quota={quota}
        byokConfig={byokConfig}
        backendOnline={backendOnline}
        themeMode={themeMode}
        fontScalePct={fontScalePct}
        onChangeTheme={handleChangeTheme}
        onChangeFontScalePct={handleChangeFontScalePct}
        onOpenApiKeyModal={() => setApiModalOpen(true)}
        onOpenGuideModal={() => setGuideModalOpen(true)}
      />

      {/* Persistent Collapsible Left Sidebar + Fluid Main Canvas */}
      <div className="flex flex-1 flex-col lg:flex-row min-w-0">
        <SideOutlineNav
          design={design}
          liveSteps={liveSteps}
          isRunning={isRunning}
          collapsed={sidebarCollapsed}
          onToggleCollapse={handleToggleSidebar}
        />

        <div className="flex flex-1 flex-col min-w-0">
          <main className="mx-auto w-full max-w-[1440px] flex-1 space-y-9 px-5 py-8 sm:px-7 lg:px-10 pb-20">
            {/* 01 Composer */}
            <DesignComposer
              plasmids={plasmids}
              polymerases={polymerases}
              customPolymerases={customPolymerases}
              selectedPolymerase={selectedPolymerase}
              selectedCustomPolymerase={selectedCustomPolymerase}
              cachedWholeGenomes={cachedWholeGenomes}
              byokConfig={byokConfig}
              design={design}
              isRunning={isRunning}
              onChangePolymerase={handleChangePolymerase}
              onSaveCustomPolymerase={handleSaveCustomPolymerase}
              onDeleteCustomPolymerase={handleDeleteCustomPolymerase}
              onSubmit={handleSubmitDesign}
              onCancel={handleCancelRun}
            />

            {/* Preserved Vivid Coral (Light) / Rose (Dark) Error Alert Banner */}
            {errorMsg && (
              <div className="neu-alert-coral flex items-start justify-between gap-3 px-5 py-4 text-sm">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[#ff6b6b] dark:text-rose-400" />
                  <div className="space-y-0.5">
                    <p className="font-semibold text-[#c93232] dark:font-bold dark:text-rose-100">
                      请求未能完成
                    </p>
                    <p className="leading-relaxed text-[var(--text-primary)] dark:text-rose-200">
                      {errorMsg}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMsg(null)}
                  className="rounded-xl p-1.5 text-[#c93232] hover:bg-[#ff6b6b]/15 dark:rounded-md dark:text-rose-300 dark:hover:bg-rose-500/20 cursor-pointer"
                  aria-label="关闭错误提示"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* 02 Real-Time SSE Audit Stepper */}
            <AuditStepper
              steps={liveSteps}
              isRunning={isRunning}
              repairIterations={design?.repair_iterations}
              mode={design?.mode}
              llmModelUsed={design?.llm_model_used}
            />

            {/* Results Workbench */}
            {design ? (
              <div ref={resultAnchorRef} className="space-y-9 scroll-mt-20">
                {/* 03 12-Point Zero-Trust Shield Certificate */}
                <VerificationGate
                  report={design.verification_report}
                  locus={design.locus}
                  selectedSgRNA={design.selected_sgrna}
                  agentSummary={design.agent_summary}
                  repairIterations={design.repair_iterations}
                  isReverifying={isReverifying}
                />

                {/* 04 Dual Visual Centerpiece */}
                <section
                  id="section-visuals"
                  data-tour="visuals-section"
                  className="grid grid-cols-1 gap-8 xl:grid-cols-12 scroll-mt-20 items-stretch"
                >
                  <div className="xl:col-span-7">
                    <LocusVisualizer
                      locus={design.locus}
                      selectedSgRNA={design.selected_sgrna}
                      donor={design.donor}
                      verificationPrimers={design.verification_primers}
                    />
                  </div>
                  <div className="xl:col-span-5">
                    <SimulatedGel
                      lanes={design.verification_report.in_silico_gel_lanes}
                      verificationPrimers={design.verification_primers}
                    />
                  </div>
                </section>

                {/* 05 sgRNA Selector & Full Primer Studio */}
                <PrimerStudio
                  selectedSgRNA={design.selected_sgrna}
                  alternativeSgRNAs={design.alternative_sgrnas}
                  allPrimers={design.all_primers}
                  isReverifying={isReverifying}
                  reverifyingId={reverifyingId}
                  onSelectSgRNA={handleSelectSgRNA}
                />

                {/* 06 NanoDrop Pipetting & 07 4-Day Timeline */}
                <WetLabWorkbench
                  protocol={design.wetlab_protocol}
                  plasmidSystem={design.plasmid_system}
                  customPlasmid={design.custom_plasmid}
                  polymerases={polymerases}
                  customPolymerases={customPolymerases}
                  selectedPolymerase={selectedPolymerase}
                  selectedCustomPolymerase={selectedCustomPolymerase}
                  donor={design.donor}
                  verificationPrimers={design.verification_primers}
                  isRecalculating={isRecalculating}
                  onChangePolymerase={handleChangePolymerase}
                  onSaveCustomPolymerase={handleSaveCustomPolymerase}
                  onDeleteCustomPolymerase={handleDeleteCustomPolymerase}
                  onRecalculate={handleRecalculateWetlab}
                />

                {/* Sticky 1-Click Export Toolbar */}
                <ExportBar design={design} />
              </div>
            ) : (
              !isRunning && (
                /* Clean 3-Pillar Overview — Generous 28px gap for Neumorphic dual shadows */
                <section className="grid grid-cols-1 gap-7 md:grid-cols-3 pt-2">
                  <div className="bio-card p-6 sm:p-7 space-y-3">
                    <div className="neu-recessed flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--accent-primary)] dark:h-9 dark:w-9 dark:rounded-lg">
                      <Dna className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-lg text-[var(--text-primary)] dark:text-base">
                      真实 RefSeq / 本地序列零幻觉溯源
                    </h3>
                    <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                      严禁模型凭记忆编造 DNA。自动解析 NCBI RefSeq 或上传的{" "}
                      <code className="font-mono-bio text-accent">
                        .gb/.fasta
                      </code>
                      ，绑定 SHA-256 指纹并按需拉取全基因组染色体索引。
                    </p>
                  </div>

                  <div className="bio-card p-6 sm:p-7 space-y-3">
                    <div className="neu-recessed flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--accent-primary)] dark:h-9 dark:w-9 dark:rounded-lg">
                      <ShieldCheck className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-lg text-[var(--text-primary)] dark:text-base">
                      12 点硅片 PCR / 组装校验与自愈
                    </h3>
                    <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                      模拟 BsaI/反向 PCR 质粒构建、LA/RA/OE-PCR 扩增、同源重组防 Cas9 二次切割与外侧菌落 PCR 假阳性拦截，异常自动修复重验。
                    </p>
                  </div>

                  <div className="bio-card p-6 sm:p-7 space-y-3">
                    <div className="neu-recessed flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--accent-primary)] dark:h-9 dark:w-9 dark:rounded-lg">
                      <Beaker className="h-5 w-5" />
                    </div>
                    <h3 className="font-display text-lg text-[var(--text-primary)] dark:text-base">
                      15 款聚合酶 + NanoDrop 移液与一键出包
                    </h3>
                    <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                      内置 15 款主流高保真酶及自定义聚合酶，自动生成引物 Excel、4 份 SnapGene 图谱、4 天 SOP 及{" "}
                      <span className="font-mono-bio font-semibold text-[#c93232] dark:font-bold dark:text-rose-400">
                        &lt; 0.5 μL
                      </span>{" "}
                      预稀释警报。
                    </p>
                  </div>
                </section>
              )
            )}
          </main>

          <footer className="neu-divider-t bg-[var(--bg-canvas)] dark:bg-[var(--bg-surface)] py-6 text-center text-xs text-[var(--text-muted)]">
            <div className="mx-auto max-w-[1440px] px-4">
              CRISPR-Forge · 零信任原核 CRISPR/Cas9 全自动设计与硅片验证平台 · 核心确定性生信引擎永久开源免费
            </div>
          </footer>
        </div>
      </div>

      <ApiKeyModal
        open={apiModalOpen}
        config={byokConfig}
        quota={quota}
        onClose={() => setApiModalOpen(false)}
        onSave={handleSaveByok}
        onClear={handleClearByok}
      />

      <ProductTour
        open={guideModalOpen}
        hasDesign={Boolean(design)}
        isRunningDemo={isRunning}
        demoError={errorMsg}
        onClose={handleCloseGuide}
        onRunDemoExample={handleRunDemoForTour}
      />
    </div>
  );
}
