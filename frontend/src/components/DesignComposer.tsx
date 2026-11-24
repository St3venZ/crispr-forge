"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  BookmarkPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Database,
  Edit3,
  FileCode2,
  FlaskConical,
  Globe,
  Loader2,
  Play,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  UploadCloud,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { PolymeraseCombobox } from "@/components/PolymeraseCombobox";
import { PrecisionSliderInput } from "@/components/PrecisionSliderInput";
import { StrainSearchCombobox } from "@/components/StrainSearchCombobox";
import { parseEmptyPlasmid } from "@/lib/api";
import {
  DEFAULT_CUSTOM_PLASMID,
  DELETION_MODE_OPTIONS,
  DEMO_CHIPS,
  DONOR_METHOD_OPTIONS,
  FALLBACK_PLASMID_CATALOG,
  MODEL_STRAINS,
  NL_PROMPT_PILLS,
  type DemoExampleChip,
} from "@/lib/constants";
import { loadCustomPlasmids, saveCustomPlasmids } from "@/lib/storage";
import type {
  ByokConfig,
  CloningMethod,
  CustomPlasmidConfig,
  CustomPolymeraseConfig,
  DeletionMode,
  DesignResponse,
  DonorMethod,
  KnockoutRequest,
  PlasmidCatalogItem,
  PlasmidParseResponse,
  PlasmidSystemId,
  PolymeraseCatalogItem,
  PolymeraseName,
} from "@/types/crispr";

interface DesignComposerProps {
  plasmids: PlasmidCatalogItem[];
  polymerases: PolymeraseCatalogItem[];
  customPolymerases: CustomPolymeraseConfig[];
  selectedPolymerase: PolymeraseName;
  selectedCustomPolymerase: CustomPolymeraseConfig | null;
  cachedWholeGenomes: string[];
  byokConfig: ByokConfig;
  design: DesignResponse | null;
  isRunning: boolean;
  onChangePolymerase: (
    name: PolymeraseName,
    customCfg: CustomPolymeraseConfig | null
  ) => void;
  onSaveCustomPolymerase: (cfg: CustomPolymeraseConfig) => void;
  onDeleteCustomPolymerase: (name: string) => void;
  onSubmit: (req: KnockoutRequest) => void;
  onCancel: () => void;
}

type ComposerTab = "nl" | "guided";
type SourceMode = "ncbi" | "upload";

interface UploadedFileState {
  name: string;
  size: number;
  kind: "gb" | "fasta";
  content: string;
}

export function DesignComposer({
  plasmids,
  polymerases,
  customPolymerases,
  selectedPolymerase,
  selectedCustomPolymerase,
  cachedWholeGenomes,
  byokConfig,
  design,
  isRunning,
  onChangePolymerase,
  onSaveCustomPolymerase,
  onDeleteCustomPolymerase,
  onSubmit,
  onCancel,
}: DesignComposerProps) {
  const plasmidList =
    plasmids.length > 0 ? plasmids : FALLBACK_PLASMID_CATALOG;

  const [composerExpanded, setComposerExpanded] = useState(true);
  const lastRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (design && !isRunning && design.run_id !== lastRunIdRef.current) {
      lastRunIdRef.current = design.run_id;
      setComposerExpanded(false);
    }
  }, [design, isRunning]);

  const [activeTab, setActiveTab] = useState<ComposerTab>("nl");
  const [activeChipId, setActiveChipId] = useState<string | null>(null);

  const [nlPrompt, setNlPrompt] = useState<string>(
    "帮我用 pCas/pTargetF 敲除大肠杆菌 MG1655 的 lacZ 基因，用 KOD One，左右同源臂 500 bp"
  );

  const [sourceMode, setSourceMode] = useState<SourceMode>("ncbi");
  const [accession, setAccession] = useState<string>("NC_000913.3");
  const [geneName, setGeneName] = useState<string>("lacZ");
  const [uploadedFile, setUploadedFile] = useState<UploadedFileState | null>(
    null
  );
  const [isDragging, setIsDragging] = useState(false);
  const [fastaStart, setFastaStart] = useState<string>("");
  const [fastaEnd, setFastaEnd] = useState<string>("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [plasmidSystem, setPlasmidSystem] =
    useState<PlasmidSystemId>("pEcCas/pEcgRNA");
  const [customPlasmid, setCustomPlasmid] = useState<CustomPlasmidConfig>(
    DEFAULT_CUSTOM_PLASMID
  );

  // Saved Custom Vector Library & Empty Vector .gb Auto-Parser state
  const [savedCustomPlasmids, setSavedCustomPlasmids] = useState<
    CustomPlasmidConfig[]
  >([]);
  const [plasmidDragging, setPlasmidDragging] = useState(false);
  const [plasmidParsing, setPlasmidParsing] = useState(false);
  const [plasmidParseResult, setPlasmidParseResult] =
    useState<PlasmidParseResponse | null>(null);
  const [plasmidParseError, setPlasmidParseError] = useState<string | null>(
    null
  );
  const [plasmidSavedToast, setPlasmidSavedToast] = useState(false);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const [homologyArmLength, setHomologyArmLength] = useState<number>(500);
  const [deletionMode, setDeletionMode] = useState<DeletionMode>("auto_safe");
  const [donorMethod, setDonorMethod] = useState<DonorMethod>("oe_pcr");
  const [autoFetchWholeGenome, setAutoFetchWholeGenome] =
    useState<boolean>(true);
  const [targetTm, setTargetTm] = useState<number>(60.0);
  const [minBandDiff, setMinBandDiff] = useState<number>(300);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const plasmidGbInputRef = useRef<HTMLInputElement | null>(null);

  // Hydrate saved custom vector library from browser localStorage
  useEffect(() => {
    setSavedCustomPlasmids(loadCustomPlasmids());
  }, []);

  const handleParsePlasmidGbFile = (file: File) => {
    setPlasmidParseError(null);
    const lower = file.name.toLowerCase();
    if (
      !lower.endsWith(".gb") &&
      !lower.endsWith(".gbk") &&
      !lower.endsWith(".genbank")
    ) {
      setPlasmidParseError(
        "请上传 SnapGene / Benchling 导出的空白载体 GenBank (.gb / .gbk) 文件。"
      );
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setPlasmidParseError(
        "载体图谱文件超过 10 MB 限制，请确认是否为标准质粒 .gb 文件。"
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (!text.trim()) {
        setPlasmidParseError("读取到的 .gb 文件内容为空。");
        return;
      }
      setPlasmidParsing(true);
      try {
        const parsed = await parseEmptyPlasmid(text, file.name);
        setCustomPlasmid(parsed.config);
        setPlasmidParseResult(parsed);
      } catch (err) {
        setPlasmidParseError(
          err instanceof Error
            ? err.message
            : "解析空白载体 .gb 失败，请检查文件是否为标准 GenBank 格式。"
        );
      } finally {
        setPlasmidParsing(false);
      }
    };
    reader.onerror = () => {
      setPlasmidParseError("读取本地 .gb 文件失败，请重试。");
    };
    reader.readAsText(file);
  };

  const handleSaveCurrentCustomPlasmid = () => {
    const trimmedName = customPlasmid.name.trim() || "Custom CRISPR Vector";
    const toSave: CustomPlasmidConfig = {
      ...customPlasmid,
      name: trimmedName,
    };
    setCustomPlasmid(toSave);
    setSavedCustomPlasmids((prev) => {
      const next = [
        toSave,
        ...prev.filter(
          (p) => p.name.trim().toLowerCase() !== trimmedName.toLowerCase()
        ),
      ];
      saveCustomPlasmids(next);
      return next;
    });
    setPlasmidSavedToast(true);
    window.setTimeout(() => setPlasmidSavedToast(false), 2000);
  };

  const handleDeleteSavedPlasmid = (name: string) => {
    setSavedCustomPlasmids((prev) => {
      const next = prev.filter((p) => p.name !== name);
      saveCustomPlasmids(next);
      return next;
    });
  };

  const attachByok = (req: KnockoutRequest): KnockoutRequest => {
    if (byokConfig.apiKey.trim()) {
      return {
        ...req,
        llm_api_key: byokConfig.apiKey.trim(),
        llm_base_url: byokConfig.baseUrl.trim() || undefined,
        llm_model: byokConfig.model.trim() || undefined,
      };
    }
    return req;
  };

  const handleRunDemoChip = (chip: DemoExampleChip) => {
    setActiveChipId(chip.id);
    setAccession(chip.accession);
    setGeneName(chip.gene_name);
    setPlasmidSystem(chip.plasmid_system);
    setDeletionMode(chip.deletion_mode);
    setHomologyArmLength(chip.homology_arm_length);
    onChangePolymerase(chip.polymerase, null);
    setNlPrompt(chip.natural_language_prompt);
    setSourceMode("ncbi");
    setUploadedFile(null);
    if (chip.custom_plasmid) {
      setCustomPlasmid(chip.custom_plasmid);
    }

    const req: KnockoutRequest = attachByok({
      accession: chip.accession,
      gene_name: chip.gene_name,
      plasmid_system: chip.plasmid_system,
      custom_plasmid:
        chip.plasmid_system === "custom"
          ? chip.custom_plasmid || customPlasmid
          : null,
      homology_arm_length: chip.homology_arm_length,
      deletion_mode: chip.deletion_mode,
      donor_construction_method: donorMethod,
      polymerase: chip.polymerase,
      custom_polymerase: null,
      auto_fetch_whole_genome: autoFetchWholeGenome,
      target_tm: targetTm,
      min_band_diff_bp: minBandDiff,
      top_sgrna_count: 5,
      use_llm_agent: true,
      natural_language_prompt:
        activeTab === "nl" ? chip.natural_language_prompt : null,
    });
    onSubmit(req);
  };

  const handleFileRead = (file: File) => {
    setUploadError(null);
    const lower = file.name.toLowerCase();
    const isGb =
      lower.endsWith(".gb") ||
      lower.endsWith(".gbk") ||
      lower.endsWith(".genbank");
    const isFasta =
      lower.endsWith(".fasta") ||
      lower.endsWith(".fa") ||
      lower.endsWith(".fna") ||
      lower.endsWith(".seq") ||
      lower.endsWith(".txt");

    if (!isGb && !isFasta) {
      setUploadError(
        "仅支持 .gb / .gbk GenBank 注释文件或 .fasta / .fa 核酸序列文件。"
      );
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      setUploadError(
        "单个文件超过 15 MB 限制，建议截取目标基因上下游 ±5 kb 窗口上传。"
      );
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      if (!text.trim()) {
        setUploadError("读取到空文件，请确认文件内容有效。");
        return;
      }
      const detectedKind: "gb" | "fasta" =
        isGb || text.trimStart().startsWith("LOCUS") ? "gb" : "fasta";
      setUploadedFile({
        name: file.name,
        size: file.size,
        kind: detectedKind,
        content: text,
      });
      setSourceMode("upload");
    };
    reader.onerror = () => {
      setUploadError("读取本地文件失败，请重试。");
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileRead(file);
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveChipId(null);

    if (activeTab === "nl") {
      const cleanedPrompt = nlPrompt.trim();
      if (!cleanedPrompt) return;
      const req: KnockoutRequest = attachByok({
        accession: accession.trim() || "NC_000913.3",
        gene_name: geneName.trim() || "lacZ",
        plasmid_system: plasmidSystem,
        custom_plasmid: plasmidSystem === "custom" ? customPlasmid : null,
        homology_arm_length: homologyArmLength,
        deletion_mode: deletionMode,
        donor_construction_method: donorMethod,
        polymerase: selectedPolymerase,
        custom_polymerase: selectedCustomPolymerase,
        auto_fetch_whole_genome: autoFetchWholeGenome,
        target_tm: targetTm,
        min_band_diff_bp: minBandDiff,
        top_sgrna_count: 5,
        use_llm_agent: true,
        natural_language_prompt: cleanedPrompt,
      });
      onSubmit(req);
      return;
    }

    if (sourceMode === "upload" && !uploadedFile) {
      setUploadError(
        "请先拖拽或选择一个 .gb / .gbk / .fasta 文件，或切回 NCBI 模式菌株。"
      );
      return;
    }

    const parsedStart = fastaStart.trim() ? parseInt(fastaStart, 10) : null;
    const parsedEnd = fastaEnd.trim() ? parseInt(fastaEnd, 10) : null;

    const req: KnockoutRequest = attachByok({
      accession:
        sourceMode === "upload"
          ? uploadedFile?.name.replace(/\.[^.]+$/, "") || "USER_UPLOAD"
          : accession.trim() || "NC_000913.3",
      gene_name: geneName.trim() || "target_gene",
      custom_genbank:
        sourceMode === "upload" && uploadedFile?.kind === "gb"
          ? uploadedFile.content
          : null,
      custom_fasta:
        sourceMode === "upload" && uploadedFile?.kind === "fasta"
          ? uploadedFile.content
          : null,
      custom_target_start:
        sourceMode === "upload" && uploadedFile?.kind === "fasta" && parsedStart
          ? parsedStart
          : null,
      custom_target_end:
        sourceMode === "upload" && uploadedFile?.kind === "fasta" && parsedEnd
          ? parsedEnd
          : null,
      plasmid_system: plasmidSystem,
      custom_plasmid: plasmidSystem === "custom" ? customPlasmid : null,
      homology_arm_length: homologyArmLength,
      deletion_mode: deletionMode,
      donor_construction_method: donorMethod,
      polymerase: selectedPolymerase,
      custom_polymerase: selectedCustomPolymerase,
      auto_fetch_whole_genome: autoFetchWholeGenome,
      target_tm: targetTm,
      min_band_diff_bp: minBandDiff,
      top_sgrna_count: 5,
      use_llm_agent: true,
      natural_language_prompt: null,
    });

    onSubmit(req);
  };

  const selectedStrain = MODEL_STRAINS.find(
    (s) => s.accession.toUpperCase() === accession.trim().toUpperCase()
  );

  // 4A: Collapsed Active Recipe Summary Bar when design exists
  if (design && !composerExpanded && !isRunning) {
    return (
      <section id="section-composer" className="scroll-mt-20">
        <div
          data-tour="composer-panel"
          className="bio-card flex flex-wrap md:flex-nowrap items-center justify-between gap-3 px-5 py-3.5"
        >
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <span className="neu-recessed inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-[var(--accent-primary)]">
              <FlaskConical className="h-4 w-4" />
            </span>

            <div className="flex flex-wrap xl:flex-nowrap items-center gap-x-2.5 gap-y-1 text-sm min-w-0">
              <span
                className="font-semibold text-[var(--text-primary)] truncate max-w-[165px] 2xl:max-w-[260px]"
                title={design.locus.organism}
              >
                {design.locus.organism}
              </span>
              <span className="neu-recessed rounded-full px-2.5 py-0.5 font-mono-bio text-xs font-semibold text-accent whitespace-nowrap shrink-0">
                Δ{design.locus.gene_name}
              </span>
              <span className="font-mono-bio text-xs font-medium text-[var(--text-secondary)] whitespace-nowrap shrink-0">
                {design.plasmid_system}
              </span>
              <span className="hidden sm:inline font-mono-bio text-xs text-[var(--text-muted)] whitespace-nowrap shrink-0">
                同源臂 {design.donor.left_arm_len}/{design.donor.right_arm_len} bp
              </span>
              <span className="hidden 2xl:inline text-xs font-medium text-[var(--text-muted)] truncate max-w-[180px]">
                {design.wetlab_protocol.polymerase}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setComposerExpanded(true)}
            className="btn-outline inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 px-4 py-2 text-xs font-medium cursor-pointer"
          >
            <Edit3 className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            修改参数 / 新建设计
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="section-composer" className="space-y-7 scroll-mt-20">
      {/* Warm Human Editorial Header */}
      {!design ? (
        <div className="text-center max-w-3xl mx-auto space-y-3 pt-2">
          <div className="neu-recessed inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-medium text-[var(--text-secondary)]">
            <FlaskConical className="h-3.5 w-3.5 text-[var(--accent-primary)]" />
            <span>
              大肠杆菌 · 枯草芽孢杆菌 · 谷氨酸棒状杆菌及任意自定义原核菌株
            </span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl lg:text-[2.35rem] leading-tight text-[var(--text-primary)]">
            零信任原核 CRISPR/Cas9 全自动设计工作台
          </h1>
          <p className="text-base leading-relaxed text-[var(--text-secondary)]">
            从真实 RefSeq / 本地序列到 12 点硅片仿真校验与实验台移液表，告别假高效与手工核对
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-[var(--text-primary)]">
            新建设计或调整实验参数
          </h2>
          <button
            type="button"
            onClick={() => setComposerExpanded(false)}
            className="btn-outline inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium cursor-pointer"
          >
            <ChevronUp className="h-4 w-4" />
            收起配置面板
          </button>
        </div>
      )}

      {/* 1-Click Multi-Species Instant Demo Chips */}
      <div data-tour="demo-chips" className="space-y-3 rounded-2xl p-1">
        <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--text-muted)]">
          <Zap className="h-3.5 w-3.5 text-amber-500" />
          <span>一键运行多物种经典实例（免配置即刻体验 12 点硅片验证与模拟电泳）：</span>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {DEMO_CHIPS.map((chip) => {
            const isActive = activeChipId === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                disabled={isRunning}
                data-active={isActive}
                onClick={() => handleRunDemoChip(chip)}
                className="neu-pill inline-flex items-center gap-2 px-4 py-2 text-sm cursor-pointer disabled:opacity-55 disabled:cursor-not-allowed"
              >
                <span className="font-medium text-[var(--text-primary)]">
                  {chip.label}
                </span>
                <span className="text-[var(--border-strong)]">·</span>
                <span className="font-mono-bio text-xs font-medium text-accent">
                  {chip.sublabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Tactile Neumorphic Composer Card (24px radius, 28-32px padding) */}
      <div
        data-tour="composer-panel"
        className="bio-card overflow-hidden"
      >
        {/* Dual-Tab Switcher */}
        <div className="neu-divider-b flex flex-wrap items-center justify-between gap-4 px-6 py-4 sm:px-8">
          <div className="neu-recessed inline-flex rounded-full p-1.5 gap-1">
            <button
              type="button"
              onClick={() => setActiveTab("nl")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition cursor-pointer ${
                activeTab === "nl"
                  ? "neu-seg-active"
                  : "rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Sparkles className="h-4 w-4 text-[var(--accent-primary)]" />
              一句话智能设计 (AI 模式)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("guided")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition cursor-pointer ${
                activeTab === "guided"
                  ? "neu-seg-active"
                  : "rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4 text-[var(--accent-primary)]" />
              3 步快捷配置 / 上传序列
            </button>
          </div>

          <div className="hidden md:flex items-center gap-2 text-xs font-medium text-[var(--text-muted)]">
            <span className="inline-block h-2 w-2 rounded-full bg-[#4ecdc4]" />
            <span>所有序列均来自真实 GenBank / 上传文件，零 LLM 幻觉拼凑</span>
          </div>
        </div>

        <form onSubmit={handleFormSubmit} className="p-6 sm:p-8 space-y-6">
          {activeTab === "nl" ? (
            /* TAB A: Natural Language Omnibox */
            <div className="space-y-4">
              <textarea
                rows={3}
                value={nlPrompt}
                onChange={(e) => setNlPrompt(e.target.value)}
                placeholder="例：帮我用 pCas/pTargetF 敲除大肠杆菌 MG1655 的 lacZ 基因，用 KOD One，左右同源臂 500 bp"
                className="neu-input w-full resize-none p-4 text-[0.95rem] leading-relaxed"
              />
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-xs font-medium text-[var(--text-muted)]">
                  快速填入示例：
                </span>
                {NL_PROMPT_PILLS.map((pill, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setNlPrompt(pill)}
                    className="neu-pill px-3 py-1.5 text-xs font-medium cursor-pointer"
                  >
                    {pill}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* TAB B: 3-Step Guided Configuration & File Upload */
            <div className="space-y-8">
              {/* Step 1: Strain / Sequence Source */}
              <div className="space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2.5 text-sm font-semibold text-[var(--text-primary)]">
                    <span className="neu-recessed flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-accent font-mono-bio">
                      1
                    </span>
                    菌株与基因组序列来源
                  </label>

                  <div className="neu-recessed inline-flex rounded-full p-1 gap-1 text-xs font-medium">
                    <button
                      type="button"
                      onClick={() => setSourceMode("ncbi")}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 transition cursor-pointer ${
                        sourceMode === "ncbi"
                          ? "neu-seg-active"
                          : "rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <Database className="h-3.5 w-3.5" />
                      模式菌株 / NCBI Accession
                    </button>
                    <button
                      type="button"
                      onClick={() => setSourceMode("upload")}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 transition cursor-pointer ${
                        sourceMode === "upload"
                          ? "neu-seg-active"
                          : "rounded-full text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      <UploadCloud className="h-3.5 w-3.5" />
                      上传本地 .gb / .fasta
                    </button>
                  </div>
                </div>

                {sourceMode === "ncbi" ? (
                  <div data-tour="strain-search">
                    <StrainSearchCombobox
                      accession={accession}
                      onChangeAccession={(nextAcc) => {
                        setAccession(nextAcc);
                        const matchedPreset = MODEL_STRAINS.find(
                          (s) =>
                            s.accession.toUpperCase() ===
                            nextAcc.trim().toUpperCase()
                        );
                        if (
                          matchedPreset &&
                          matchedPreset.sampleGenes.length > 0
                        ) {
                          setGeneName(matchedPreset.sampleGenes[0]);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsDragging(true);
                      }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`neu-recessed flex flex-col items-center justify-center rounded-[20px] p-6 text-center transition cursor-pointer ${
                        isDragging
                          ? "ring-2 ring-[var(--accent-primary)]"
                          : uploadedFile
                            ? "ring-1 ring-[var(--accent-border)]"
                            : ""
                      }`}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".gb,.gbk,.genbank,.fasta,.fa,.fna,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileRead(file);
                        }}
                      />

                      {uploadedFile ? (
                        <div className="flex w-full items-center justify-between gap-3 px-2">
                          <div className="flex items-center gap-3 text-left min-w-0">
                            <div className="neu-pill flex h-10 w-10 shrink-0 items-center justify-center text-[var(--accent-primary)]">
                              <FileCode2 className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                                {uploadedFile.name}
                              </p>
                              <p className="text-xs text-[var(--text-muted)]">
                                {uploadedFile.kind === "gb"
                                  ? "GenBank 注释文件（自动解析 CDS 与邻近基因）"
                                  : "FASTA 纯核酸序列（可指定 1-based 目标区间）"}{" "}
                                · {(uploadedFile.size / 1024).toFixed(1)} KB
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setUploadedFile(null);
                              setFastaStart("");
                              setFastaEnd("");
                            }}
                            className="rounded-full p-1.5 text-[var(--text-muted)] hover:text-[#c93232] dark:hover:text-rose-400 cursor-pointer"
                            title="移除已上传文件"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <UploadCloud className="h-7 w-7 text-[var(--accent-primary)] mb-2" />
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            拖拽或点击上传本地{" "}
                            <span className="font-mono-bio text-accent">
                              .gb / .gbk
                            </span>{" "}
                            或{" "}
                            <span className="font-mono-bio text-accent">
                              .fasta / .fa
                            </span>{" "}
                            文件
                          </p>
                          <p className="mt-1 text-xs text-[var(--text-muted)]">
                            支持 SnapGene / Benchling 导出的注释文件，或任意自测菌株 Contig 序列
                          </p>
                        </>
                      )}
                    </div>

                    {uploadError && (
                      <p className="text-sm font-medium text-[#c93232] dark:text-rose-400">
                        {uploadError}
                      </p>
                    )}

                    {uploadedFile?.kind === "fasta" && (
                      <div className="neu-recessed grid grid-cols-1 gap-4 rounded-[18px] p-4 sm:grid-cols-2 dark:rounded-lg dark:border-amber-500/35 dark:bg-amber-500/10">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-amber-800 dark:text-amber-200">
                            目标基因起点 (1-based，可选)
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={fastaStart}
                            onChange={(e) => setFastaStart(e.target.value)}
                            placeholder="留空则自动识别最长 ORF"
                            className="neu-input w-full px-3.5 py-2 font-mono-bio text-sm"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-amber-800 dark:text-amber-200">
                            目标基因终点 (1-based 含，可选)
                          </label>
                          <input
                            type="number"
                            min={2}
                            value={fastaEnd}
                            onChange={(e) => setFastaEnd(e.target.value)}
                            placeholder="例：3200"
                            className="neu-input w-full px-3.5 py-2 font-mono-bio text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 2: Target Gene / Locus Tag */}
              <div className="space-y-3">
                <label className="flex items-center gap-2.5 text-sm font-semibold text-[var(--text-primary)]">
                  <span className="neu-recessed flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-accent font-mono-bio">
                    2
                  </span>
                  目标基因名 / Locus Tag
                </label>
                <div className="flex flex-wrap items-center gap-3.5">
                  <input
                    type="text"
                    value={geneName}
                    onChange={(e) => setGeneName(e.target.value)}
                    placeholder="如 lacZ, ackA, b0344, amyE, ldhA"
                    className="neu-input w-full sm:w-72 px-4 py-3 font-mono-bio text-sm font-medium"
                  />
                  {sourceMode === "ncbi" && selectedStrain && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-medium text-[var(--text-muted)]">
                        常用靶点：
                      </span>
                      {selectedStrain.sampleGenes.map((g) => (
                        <button
                          key={g}
                          type="button"
                          data-active={geneName.toLowerCase() === g.toLowerCase()}
                          onClick={() => setGeneName(g)}
                          className="neu-pill px-3 py-1.5 font-mono-bio text-xs font-medium cursor-pointer"
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Step 3: 2x2 Tactile Plasmid System Visual Selector (>= 24px gap, Day & Night) */}
              <div className="space-y-4">
                <label className="flex items-center gap-2.5 text-sm font-semibold text-[var(--text-primary)]">
                  <span className="neu-recessed flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold text-accent font-mono-bio">
                    3
                  </span>
                  CRISPR 质粒体系（自动适配粘性末端 / 反向 PCR 与消除流程）
                </label>

                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {plasmidList.map((p) => {
                    const active = plasmidSystem === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        data-selected={active}
                        onClick={() => setPlasmidSystem(p.id)}
                        className="neu-card-interactive flex flex-col justify-between p-5 text-left cursor-pointer"
                      >
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`text-sm font-semibold ${
                                active ? "text-accent" : "text-[var(--text-primary)]"
                              }`}
                            >
                              {p.short_label}
                            </span>
                            <div className="flex items-center gap-2">
                              {p.id === "custom" && (
                                <Wrench className="h-4 w-4 text-[var(--accent-primary)] shrink-0" />
                              )}
                              <span
                                className="h-2.5 w-2.5 rounded-full transition"
                                style={{
                                  backgroundColor: active
                                    ? "var(--accent-primary)"
                                    : "var(--neu-dot-off)",
                                  boxShadow: active
                                    ? "0 0 8px var(--accent-primary)"
                                    : "none",
                                }}
                              />
                            </div>
                          </div>
                          <p className="text-xs leading-relaxed text-[var(--text-muted)] line-clamp-2">
                            {p.hosts}
                          </p>
                        </div>
                        <div className="mt-4 pt-1">
                          <span className="neu-recessed inline-block rounded-full px-3 py-1 font-mono-bio text-xs text-accent">
                            {p.overhangs}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Plasmid Smooth Drawer + Blank .gb Auto-Parser + Saved Lab Vector Library */}
                {plasmidSystem === "custom" && (
                  <div className="neu-recessed rounded-[20px] p-5 space-y-5">
                    {/* Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                        <Wrench className="h-4 w-4 text-[var(--accent-primary)]" />
                        自定义实验室载体规格
                      </span>
                      <div className="neu-recessed inline-flex rounded-full p-1 gap-1 text-xs font-medium">
                        {(
                          [
                            ["golden_gate_oligo", "Golden Gate 退火 Oligo"],
                            ["inverse_pcr", "全质粒反向 PCR"],
                          ] as [CloningMethod, string][]
                        ).map(([method, label]) => (
                          <button
                            key={method}
                            type="button"
                            onClick={() =>
                              setCustomPlasmid((prev) => ({
                                ...prev,
                                cloning_method: method,
                              }))
                            }
                            className={`px-3.5 py-1.5 transition cursor-pointer ${
                              customPlasmid.cloning_method === method
                                ? "neu-seg-active"
                                : "rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Saved Custom Vector Library (我的常用载体) */}
                    {savedCustomPlasmids.length > 0 && (
                      <div className="neu-soft-tile space-y-2.5 p-4">
                        <div className="flex items-center justify-between text-xs font-semibold text-[var(--text-secondary)]">
                          <span>
                            我的常用载体 ({savedCustomPlasmids.length})
                          </span>
                          <span className="font-normal text-[var(--text-muted)]">
                            1 键载入，永久保存在本机浏览器
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                          {savedCustomPlasmids.map((vec) => {
                            const isActive =
                              customPlasmid.name.trim().toLowerCase() ===
                              vec.name.trim().toLowerCase();
                            return (
                              <div
                                key={vec.name}
                                data-active={isActive}
                                className="neu-pill inline-flex items-center overflow-hidden text-xs"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    setCustomPlasmid(vec);
                                    setPlasmidParseResult(null);
                                    setPlasmidParseError(null);
                                  }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium cursor-pointer"
                                >
                                  <span>{vec.name}</span>
                                  <span className="font-mono-bio text-xs text-[var(--text-muted)]">
                                    {vec.cloning_method === "golden_gate_oligo"
                                      ? vec.restriction_enzyme || "GG"
                                      : "反向PCR"}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDeleteSavedPlasmid(vec.name)
                                  }
                                  className="px-2 py-1.5 text-[var(--text-muted)] hover:text-[#c93232] dark:border-l dark:border-[var(--border-hairline)] dark:hover:bg-rose-500/15 dark:hover:text-rose-400 cursor-pointer"
                                  title={`删除已保存载体 ${vec.name}`}
                                  aria-label={`删除已保存载体 ${vec.name}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Empty Vector .gb Auto-Parser Upload / Drop Bar */}
                    <div className="space-y-3">
                      <div
                        onDragOver={(e) => {
                          e.preventDefault();
                          setPlasmidDragging(true);
                        }}
                        onDragLeave={() => setPlasmidDragging(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setPlasmidDragging(false);
                          const f = e.dataTransfer.files?.[0];
                          if (f) handleParsePlasmidGbFile(f);
                        }}
                        onClick={() => plasmidGbInputRef.current?.click()}
                        className={`neu-soft-tile flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 transition cursor-pointer dark:border-2 dark:border-dashed ${
                          plasmidDragging
                            ? "ring-2 ring-[var(--accent-primary)] dark:border-[var(--accent-primary)] dark:bg-[var(--accent-soft)]"
                            : "dark:border-[var(--border-strong)] dark:bg-[var(--bg-surface)] dark:hover:border-[var(--accent-primary)]"
                        }`}
                      >
                        <input
                          ref={plasmidGbInputRef}
                          type="file"
                          accept=".gb,.gbk,.genbank"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleParsePlasmidGbFile(f);
                            e.target.value = "";
                          }}
                        />

                        <div className="flex items-center gap-3 min-w-0">
                          <div className="neu-recessed flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl dark:rounded-lg text-[var(--accent-primary)]">
                            {plasmidParsing ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileCode2 className="h-4 w-4" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)]">
                              {plasmidParsing
                                ? "正在解析空白载体图谱与骨架验证引物..."
                                : "上传空白载体图谱 (.gb / .gbk) 自动解析"}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">
                              自动识别 SpCas9 gRNA Scaffold、粘性末端/反向 PCR 锚点、抗性标记与真实菌落验证/测序引物
                            </p>
                          </div>
                        </div>

                        <span className="btn-outline shrink-0 px-3.5 py-1.5 text-xs font-medium">
                          选择 .gb / .gbk
                        </span>
                      </div>

                      {plasmidParseError && (
                        <div className="neu-alert-coral px-4 py-2.5 text-xs font-medium text-[#c93232] dark:text-rose-200">
                          {plasmidParseError}
                        </div>
                      )}

                      {plasmidParseResult && (
                        <div className="neu-soft-tile border-l-[4px] border-l-[#4ecdc4] dark:border-l-emerald-600 px-4 py-3 space-y-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-[#1c7c75] dark:text-emerald-400 shrink-0" />
                            <span className="text-xs font-semibold text-[var(--text-primary)]">
                              空白载体图谱自动解析完成
                            </span>
                            <span className="neu-recessed rounded-full dark:rounded px-2.5 py-0.5 font-mono-bio text-xs font-medium text-[var(--text-secondary)]">
                              {plasmidParseResult.vector_length_bp.toLocaleString()}{" "}
                              bp
                            </span>
                            <span
                              className={`rounded-full dark:rounded px-2.5 py-0.5 text-xs font-medium ${
                                plasmidParseResult.confidence === "high"
                                  ? "bg-[#4ecdc4]/20 text-[#1a7871] dark:border dark:border-emerald-500/35 dark:bg-emerald-500/10 dark:text-emerald-300"
                                  : plasmidParseResult.confidence === "medium"
                                    ? "bg-amber-500/15 text-amber-800 dark:border dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300"
                                    : "bg-[#ff6b6b]/18 text-[#c93232] dark:border dark:border-rose-500/40 dark:bg-rose-500/15 dark:text-rose-300"
                              }`}
                            >
                              {plasmidParseResult.confidence === "high"
                                ? "高置信度"
                                : plasmidParseResult.confidence === "medium"
                                  ? "中等置信度"
                                  : "请人工复核"}
                            </span>
                            {plasmidParseResult.detected_features.map((feat) => (
                              <span
                                key={feat}
                                className="neu-recessed rounded-full dark:rounded px-2.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]"
                              >
                                {feat}
                              </span>
                            ))}
                          </div>
                          {plasmidParseResult.detection_notes.length > 0 && (
                            <ul className="space-y-1 pl-4 text-xs leading-relaxed text-[var(--text-secondary)] list-disc">
                              {plasmidParseResult.detection_notes.map(
                                (note, idx) => (
                                  <li key={idx}>{note}</li>
                                )
                              )}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                          质粒名称
                        </label>
                        <input
                          type="text"
                          value={customPlasmid.name}
                          onChange={(e) =>
                            setCustomPlasmid((p) => ({
                              ...p,
                              name: e.target.value,
                            }))
                          }
                          className="neu-input w-full px-3.5 py-2.5 text-sm"
                        />
                      </div>

                      {customPlasmid.cloning_method === "golden_gate_oligo" ? (
                        <>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                              正向 / 反向 5&apos; 粘性末端
                            </label>
                            <div className="grid grid-cols-2 gap-2.5">
                              <input
                                type="text"
                                value={customPlasmid.overhang_forward}
                                onChange={(e) =>
                                  setCustomPlasmid((p) => ({
                                    ...p,
                                    overhang_forward:
                                      e.target.value.toUpperCase(),
                                  }))
                                }
                                placeholder="TAGT"
                                className="neu-input w-full px-3 py-2.5 font-mono-bio text-sm uppercase"
                              />
                              <input
                                type="text"
                                value={customPlasmid.overhang_reverse}
                                onChange={(e) =>
                                  setCustomPlasmid((p) => ({
                                    ...p,
                                    overhang_reverse:
                                      e.target.value.toUpperCase(),
                                  }))
                                }
                                placeholder="AAAC"
                                className="neu-input w-full px-3 py-2.5 font-mono-bio text-sm uppercase"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                              排除的 Type IIS 内切酶
                            </label>
                            <select
                              value={customPlasmid.restriction_enzyme}
                              onChange={(e) =>
                                setCustomPlasmid((p) => ({
                                  ...p,
                                  restriction_enzyme: e.target.value,
                                }))
                              }
                              className="neu-input w-full px-3.5 py-2.5 font-mono-bio text-sm"
                            >
                              <option value="BsaI">BsaI (GGTCTC)</option>
                              <option value="BbsI">BbsI (GAAGAC)</option>
                              <option value="Esp3I">Esp3I (CGTCTC)</option>
                              <option value="BsmBI">BsmBI (CGTCTC)</option>
                              <option value="none">不排除内切酶</option>
                            </select>
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                              正向引物 3&apos; Scaffold 锚点序列
                            </label>
                            <input
                              type="text"
                              value={customPlasmid.inverse_pcr_scaffold_anchor}
                              onChange={(e) =>
                                setCustomPlasmid((p) => ({
                                  ...p,
                                  inverse_pcr_scaffold_anchor:
                                    e.target.value.toUpperCase(),
                                }))
                              }
                              className="neu-input w-full px-3 py-2.5 font-mono-bio text-sm uppercase"
                            />
                          </div>
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                              通用反向引物序列 (5&apos;→3&apos;)
                            </label>
                            <input
                              type="text"
                              value={customPlasmid.inverse_pcr_reverse_primer}
                              onChange={(e) =>
                                setCustomPlasmid((p) => ({
                                  ...p,
                                  inverse_pcr_reverse_primer:
                                    e.target.value.toUpperCase(),
                                }))
                              }
                              className="neu-input w-full px-3 py-2.5 font-mono-bio text-sm uppercase"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                          筛选抗性标记
                        </label>
                        <input
                          type="text"
                          value={customPlasmid.antibiotics}
                          onChange={(e) =>
                            setCustomPlasmid((p) => ({
                              ...p,
                              antibiotics: e.target.value,
                            }))
                          }
                          className="neu-input w-full px-3.5 py-2.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">
                          质粒消除说明 (写入 SOP)
                        </label>
                        <input
                          type="text"
                          value={customPlasmid.curing_note}
                          onChange={(e) =>
                            setCustomPlasmid((p) => ({
                              ...p,
                              curing_note: e.target.value,
                            }))
                          }
                          className="neu-input w-full px-3.5 py-2.5 text-sm"
                        />
                      </div>
                    </div>

                    {/* Auto-Parsed Real Backbone Verification & Sanger Primers (shown when present) */}
                    {(customPlasmid.colony_pcr_backbone_f ||
                      customPlasmid.colony_pcr_backbone_r ||
                      customPlasmid.sanger_backbone_f) && (
                      <div className="neu-soft-tile grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                            骨架菌落 PCR 上游引物
                          </label>
                          <input
                            type="text"
                            value={customPlasmid.colony_pcr_backbone_f || ""}
                            onChange={(e) =>
                              setCustomPlasmid((p) => ({
                                ...p,
                                colony_pcr_backbone_f:
                                  e.target.value.toUpperCase() || null,
                              }))
                            }
                            className="neu-input w-full px-3 py-2 font-mono-bio text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                            骨架菌落 PCR 下游引物
                          </label>
                          <input
                            type="text"
                            value={customPlasmid.colony_pcr_backbone_r || ""}
                            onChange={(e) =>
                              setCustomPlasmid((p) => ({
                                ...p,
                                colony_pcr_backbone_r:
                                  e.target.value.toUpperCase() || null,
                              }))
                            }
                            className="neu-input w-full px-3 py-2 font-mono-bio text-xs"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs font-medium text-[var(--text-muted)]">
                            骨架 Sanger 测序引物
                          </label>
                          <input
                            type="text"
                            value={customPlasmid.sanger_backbone_f || ""}
                            onChange={(e) =>
                              setCustomPlasmid((p) => ({
                                ...p,
                                sanger_backbone_f:
                                  e.target.value.toUpperCase() || null,
                              }))
                            }
                            className="neu-input w-full px-3 py-2 font-mono-bio text-xs"
                          />
                        </div>
                      </div>
                    )}

                    {/* Save to Lab Vector Library Footer */}
                    <div className="neu-divider-t flex flex-wrap items-center justify-between gap-2 pt-3.5">
                      <span className="text-xs text-[var(--text-muted)]">
                        保存后下次无需重复上传或手动填写粘性末端与骨架引物
                      </span>
                      <button
                        type="button"
                        onClick={handleSaveCurrentCustomPlasmid}
                        className="btn-outline inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-accent cursor-pointer"
                      >
                        {plasmidSavedToast ? (
                          <>
                            <Check className="h-3.5 w-3.5 text-[#1c7c75] dark:text-emerald-400" />
                            已保存至我的载体库
                          </>
                        ) : (
                          <>
                            <BookmarkPlus className="h-3.5 w-3.5" />
                            保存至我的载体库
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Collapsible Advanced Experimental Parameters */}
          <div className="neu-recessed rounded-[20px]">
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex w-full items-center justify-between px-5 py-3.5 text-sm font-medium text-[var(--text-primary)] cursor-pointer"
            >
              <span className="inline-flex flex-wrap items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-[var(--accent-primary)]" />
                <span>高级实验参数与聚合酶选择</span>
                <span className="hidden sm:inline font-normal text-xs text-[var(--text-muted)]">
                  （同源臂 {homologyArmLength} bp · {selectedPolymerase} · Tm{" "}
                  {targetTm.toFixed(1)}°C ·{" "}
                  {autoFetchWholeGenome ? "自动全基因组脱靶" : "仅局部窗口"}）
                </span>
              </span>
              {showAdvanced ? (
                <ChevronUp className="h-4 w-4 text-[var(--text-muted)]" />
              ) : (
                <ChevronDown className="h-4 w-4 text-[var(--text-muted)]" />
              )}
            </button>

            {showAdvanced && (
              <div className="neu-divider-t space-y-6 p-5 sm:p-6">
                {/* Row 1 */}
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[var(--text-primary)]">
                      高保真 DNA 聚合酶（15 款内置 + 自定义）
                    </label>
                    <PolymeraseCombobox
                      polymerases={polymerases}
                      customPolymerases={customPolymerases}
                      value={selectedPolymerase}
                      customValue={selectedCustomPolymerase}
                      onChange={onChangePolymerase}
                      onSaveCustom={onSaveCustomPolymerase}
                      onDeleteCustom={onDeleteCustomPolymerase}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[var(--text-primary)]">
                      敲除边界策略
                    </label>
                    <select
                      value={deletionMode}
                      onChange={(e) =>
                        setDeletionMode(e.target.value as DeletionMode)
                      }
                      className="neu-input w-full px-4 py-3 text-sm"
                    >
                      {DELETION_MODE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-[var(--text-muted)]">
                      {
                        DELETION_MODE_OPTIONS.find(
                          (o) => o.value === deletionMode
                        )?.desc
                      }
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-[var(--text-primary)]">
                      Donor 供体构建方式
                    </label>
                    <select
                      value={donorMethod}
                      onChange={(e) =>
                        setDonorMethod(e.target.value as DonorMethod)
                      }
                      className="neu-input w-full px-4 py-3 text-sm"
                    >
                      {DONOR_METHOD_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-[var(--text-muted)]">
                      {
                        DONOR_METHOD_OPTIONS.find(
                          (o) => o.value === donorMethod
                        )?.desc
                      }
                    </p>
                  </div>
                </div>

                {/* Row 2: Precision Sliders */}
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                  <PrecisionSliderInput
                    label="单侧同源臂长度"
                    value={homologyArmLength}
                    min={250}
                    max={1000}
                    step={50}
                    unit="bp"
                    presets={[300, 500, 750, 1000]}
                    onChange={setHomologyArmLength}
                  />
                  <PrecisionSliderInput
                    label="目标引物退火 Tm"
                    value={targetTm}
                    min={54}
                    max={66}
                    step={0.5}
                    decimals={1}
                    unit="°C"
                    presets={[58, 60, 62]}
                    onChange={setTargetTm}
                  />
                  <PrecisionSliderInput
                    label="菌落 PCR 最小条带差"
                    value={minBandDiff}
                    min={100}
                    max={1500}
                    step={50}
                    unit="bp"
                    presets={[200, 300, 500, 1000]}
                    onChange={setMinBandDiff}
                  />
                </div>

                {/* Row 3: Autonomous Whole-Genome Off-Target Indexing Toggle */}
                <div className="neu-soft-tile flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]" />
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          自动按需抓取全基因组脱靶索引 (auto_fetch_whole_genome)
                        </span>
                        {cachedWholeGenomes.length > 0 && (
                          <span className="neu-recessed rounded-full px-2.5 py-0.5 font-mono-bio text-xs font-medium text-accent">
                            本地已缓存 {cachedWholeGenomes.length} 株完整染色体
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)]">
                        开启后，针对任意新输入 NCBI 菌株将自动拉取并永久缓存完整细菌染色体 FASTA，实现全基因组零盲区 NGG/NAG 脱靶扫描。
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoFetchWholeGenome}
                    onClick={() => setAutoFetchWholeGenome((v) => !v)}
                    className="neu-recessed relative inline-flex h-7 w-13 shrink-0 items-center rounded-full p-1 transition cursor-pointer"
                  >
                    <span
                      className="inline-block h-5 w-5 transform rounded-full transition-all duration-200"
                      style={{
                        transform: autoFetchWholeGenome
                          ? "translateX(24px)"
                          : "translateX(0px)",
                        backgroundColor: autoFetchWholeGenome
                          ? "var(--accent-primary)"
                          : "var(--bg-surface)",
                        boxShadow: autoFetchWholeGenome
                          ? "var(--neu-knob-on-shadow)"
                          : "var(--neu-knob-off-shadow)",
                      }}
                    />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <div className="text-xs text-[var(--text-muted)]">
              {activeTab === "nl"
                ? "自动解析菌株/基因/载体/聚合酶 → 确定性生信工具 → 12 点硅片校验与自动自愈"
                : "直接进入确定性生信设计管线，自动完成邻近基因保护与 12 点零信任验证"}
            </div>

            <div className="flex items-center gap-3">
              {isRunning && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="neu-badge-coral inline-flex items-center gap-1.5 rounded-2xl px-4 py-2.5 text-sm font-medium transition cursor-pointer"
                >
                  <Square className="h-4 w-4 fill-current" />
                  停止
                </button>
              )}

              <button
                type="submit"
                disabled={isRunning}
                className="btn-primary inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold cursor-pointer"
              >
                {isRunning ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在执行零信任硅片设计...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 fill-current" />
                    启动零信任全自动设计
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
}
