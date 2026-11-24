import type {
  CustomPlasmidConfig,
  CustomPolymeraseConfig,
  DeletionMode,
  DonorMethod,
  PlasmidCatalogItem,
  PlasmidSystemId,
  PolymeraseCatalogItem,
  PolymeraseName,
  PrimerRole,
  VerificationCategory,
} from "@/types/crispr";

export interface DemoExampleChip {
  id: string;
  label: string;
  sublabel: string;
  badge: string;
  accession: string;
  gene_name: string;
  plasmid_system: PlasmidSystemId;
  deletion_mode: DeletionMode;
  homology_arm_length: number;
  polymerase: PolymeraseName;
  natural_language_prompt: string;
  custom_plasmid?: CustomPlasmidConfig;
}

export const DEFAULT_CUSTOM_PLASMID: CustomPlasmidConfig = {
  name: "pCgCRISPR-Custom",
  cloning_method: "golden_gate_oligo",
  overhang_forward: "TAGT",
  overhang_reverse: "AAAC",
  restriction_enzyme: "BsaI",
  inverse_pcr_scaffold_anchor: "GTTTTAGAGCTAGAAATAGCAAGTTA",
  inverse_pcr_reverse_primer: "ACTAGTATTATACCTAGGACTGAG",
  antibiotics: "Kanamycin (25 ug/mL)",
  curing_note: "37°C 无抗过夜培养消除温敏型编辑质粒，验证抗性敏感后冻存菌种。",
};

export const DEFAULT_CUSTOM_POLYMERASE: CustomPolymeraseConfig = {
  name: "实验室自定义高保真聚合酶",
  vendor: "我的实验室",
  mix_name: "2x Custom High-Fidelity Master Mix",
  extension_sec_per_kb: 20,
  denature_c: 98,
  ext_c: 72,
  anneal_offset_c: -2,
  summary: "用户自定义高保真聚合酶扩增参数",
};

export const DEMO_CHIPS: DemoExampleChip[] = [
  {
    id: "ecoli-lacz",
    label: "大肠杆菌 lacZ",
    sublabel: "pCas/pTargetF",
    badge: "4.64 Mb 全基因组脱靶",
    accession: "NC_000913.3",
    gene_name: "lacZ",
    plasmid_system: "pCas/pTargetF",
    deletion_mode: "auto_safe",
    homology_arm_length: 500,
    polymerase: "KOD One (TOYOBO)",
    natural_language_prompt:
      "帮我用 pCas/pTargetF 敲除大肠杆菌 MG1655 (NC_000913.3) 的 lacZ 基因，使用 KOD One 聚合酶，左右同源臂各 500 bp",
  },
  {
    id: "ecoli-acka",
    label: "大肠杆菌 ackA",
    sublabel: "操纵子 RBS 保护",
    badge: "邻近基因防误伤",
    accession: "NC_000913.3",
    gene_name: "ackA",
    plasmid_system: "pEcCas/pEcgRNA",
    deletion_mode: "auto_safe",
    homology_arm_length: 500,
    polymerase: "Phanta Max (Vazyme)",
    natural_language_prompt:
      "用 pEcCas/pEcgRNA 体系敲除大肠杆菌 MG1655 的 ackA 基因，开启自动操纵子 RBS 安全保护模式，左右同源臂 500 bp",
  },
  {
    id: "bsub-amye",
    label: "枯草芽孢杆菌 amyE",
    sublabel: "pJOE8999",
    badge: "革兰氏阳性单质粒",
    accession: "NC_000964.3",
    gene_name: "amyE",
    plasmid_system: "pJOE8999",
    deletion_mode: "auto_safe",
    homology_arm_length: 600,
    polymerase: "Phanta Flash (Vazyme)",
    natural_language_prompt:
      "使用单质粒 pJOE8999 体系敲除枯草芽孢杆菌 168 (NC_000964.3) 的 amyE 基因，同源臂长度 600 bp",
  },
  {
    id: "cglu-ldha",
    label: "谷氨酸棒状杆菌 ldhA",
    sublabel: "自定义载体",
    badge: "工业发酵高 GC",
    accession: "NC_003450.3",
    gene_name: "ldhA",
    plasmid_system: "custom",
    deletion_mode: "auto_safe",
    homology_arm_length: 600,
    polymerase: "PrimeSTAR GXL (Takara)",
    natural_language_prompt:
      "敲除谷氨酸棒状杆菌 ATCC 13032 (NC_003450.3) 的 ldhA 基因，采用自定义 BsaI Golden Gate 质粒，PrimeSTAR GXL，左右同源臂 600 bp",
    custom_plasmid: {
      ...DEFAULT_CUSTOM_PLASMID,
      name: "pJYS3-Cas9 (谷棒自定义)",
      overhang_forward: "GTTG",
      overhang_reverse: "AAAC",
      restriction_enzyme: "BsaI",
      antibiotics: "Kanamycin (25 ug/mL)",
    },
  },
  {
    id: "ecoli-glda",
    label: "大肠杆菌 gldA",
    sublabel: "pEcCas/pEcgRNA",
    badge: "负链靶点经典",
    accession: "NC_000913.3",
    gene_name: "gldA",
    plasmid_system: "pEcCas/pEcgRNA",
    deletion_mode: "in_frame_scarless",
    homology_arm_length: 500,
    polymerase: "Phanta Max (Vazyme)",
    natural_language_prompt:
      "帮我用 pEcCas/pEcgRNA 对大肠杆菌 MG1655 的负链基因 gldA 做框内无痕敲除，使用 Phanta Max 聚合酶",
  },
];

export const NL_PROMPT_PILLS: string[] = [
  "用 pCas/pTargetF 敲除大肠杆菌 MG1655 的 lacZ，KOD One，同源臂 500 bp",
  "用 pEcCas/pEcgRNA 安全敲除大肠杆菌 ackA，保护下游 pta 操纵子 RBS",
  "用 pJOE8999 敲除枯草芽孢杆菌 168 的 amyE，左右同源臂 600 bp",
  "用 pEcCas/pEcgRNA 对大肠杆菌 pta 做框内无痕敲除，直接合成 Donor",
];

export const MODEL_STRAINS = [
  {
    accession: "NC_000913.3",
    label: "大肠杆菌 E. coli K-12 MG1655",
    badge: "NC_000913.3 · 全基因组脱靶已索引",
    sampleGenes: ["lacZ", "ackA", "pta", "gldA"],
  },
  {
    accession: "NC_000964.3",
    label: "枯草芽孢杆菌 B. subtilis 168",
    badge: "NC_000964.3 · 预置缓存",
    sampleGenes: ["amyE"],
  },
  {
    accession: "NC_003450.3",
    label: "谷氨酸棒状杆菌 C. glutamicum ATCC 13032",
    badge: "NC_003450.3 · 预置缓存",
    sampleGenes: ["ldhA"],
  },
  {
    accession: "NC_002947.4",
    label: "恶臭假单胞菌 P. putida KT2440",
    badge: "NC_002947.4 · NCBI 实时获取",
    sampleGenes: ["phaC1", "gcd"],
  },
];

export const FALLBACK_PLASMID_CATALOG: PlasmidCatalogItem[] = [
  {
    id: "pEcCas/pEcgRNA",
    display_name: "pEcCas / pEcgRNA (杨晟课题组升级体系)",
    short_label: "pEcCas / pEcgRNA",
    hosts: "大肠杆菌 (E. coli K-12 / BL21 等)",
    reference: "Li et al., Microb Cell Fact 2021",
    cloning_method: "golden_gate_oligo",
    overhangs: "5'-TAGT / 5'-AAAC (BsaI · ccdB 负筛)",
    antibiotics: "Kan (50 μg/mL) + Spec (50 μg/mL)",
    curing_protocol: "鼠李糖消除 pEcgRNA + 5% 蔗糖消除 pEcCas",
  },
  {
    id: "pCas/pTargetF",
    display_name: "pCas / pTargetF (经典反向 PCR 体系)",
    short_label: "pCas / pTargetF",
    hosts: "大肠杆菌 (MG1655 / DH5α / W3110)",
    reference: "Jiang et al., AEM 2015",
    cloning_method: "inverse_pcr",
    overhangs: "全质粒反向 PCR (N20 + Scaffold)",
    antibiotics: "Kan (50 μg/mL, 30°C) + Spec (50 μg/mL)",
    curing_protocol: "IPTG 消除 pTargetF + 37°C 消除 pCas",
  },
  {
    id: "pJOE8999",
    display_name: "pJOE8999 (枯草单质粒一体化体系)",
    short_label: "pJOE8999",
    hosts: "枯草芽孢杆菌 (B. subtilis 168 等)",
    reference: "Altenbuchner, AEM 2016",
    cloning_method: "golden_gate_oligo",
    overhangs: "5'-TACG / 5'-AAAC (BsaI · 蓝白斑)",
    antibiotics: "Kan (E. coli 50 / B. subtilis 5 μg/mL)",
    curing_protocol: "50°C 无抗过夜培养消除温敏质粒",
  },
  {
    id: "custom",
    display_name: "自定义实验室质粒体系 (Universal)",
    short_label: "自定义质粒",
    hosts: "任意原核菌株（谷棒 / 假单胞 / 自建载体）",
    reference: "自定义粘性末端或反向 PCR 锚点",
    cloning_method: "custom",
    overhangs: "支持自定义 BsaI/BbsI/Esp3I 或反向 PCR",
    antibiotics: "自定义抗性标记",
    curing_protocol: "自定义消除流程",
  },
];

/**
 * Full 15-Polymerase Catalog mirroring backend/crispr_forge/wetlab/calculator.py
 */
export const FALLBACK_POLYMERASE_CATALOG: PolymeraseCatalogItem[] = [
  {
    id: "Phanta Max (Vazyme)",
    vendor: "诺唯赞 Vazyme",
    category: "高保真主力",
    mix_name: "2x Phanta Max Master Mix",
    extension_sec_per_kb: 30,
    denature_c: 95,
    ext_c: 72,
    anneal_offset_c: -2,
    tags: ["高保真", "OE-PCR主力", "国产常用"],
    summary: "国内最常用的高保真酶之一，30 s/kb，OE-PCR 与同源臂扩增容错率极高",
  },
  {
    id: "Phanta Flash (Vazyme)",
    vendor: "诺唯赞 Vazyme",
    category: "极速高保真",
    mix_name: "2x Phanta Flash Master Mix",
    extension_sec_per_kb: 5,
    denature_c: 98,
    ext_c: 72,
    anneal_offset_c: -2,
    tags: ["极速 1-5s/kb", "高保真", "诺唯赞"],
    summary: "超快高保真预混液，1-5 s/kb 极速延伸，常规同源臂 30 分钟跑完 PCR",
  },
  {
    id: "Phanta EVO (Vazyme)",
    vendor: "诺唯赞 Vazyme",
    category: "复杂模板/长片段",
    mix_name: "2x Phanta EVO Master Mix",
    extension_sec_per_kb: 15,
    denature_c: 95,
    ext_c: 72,
    anneal_offset_c: -2,
    tags: ["高GC", "长片段", "抗抑制"],
    summary: "增强型高保真酶，15 s/kb，擅长高 GC 基因组与复杂二级结构模板",
  },
  {
    id: "2x Taq Master Mix (Colony PCR)",
    vendor: "诺唯赞 / 通用 Rapid Taq",
    category: "菌落筛选专用",
    mix_name: "2x Rapid Taq Master Mix (含染料)",
    extension_sec_per_kb: 30,
    denature_c: 95,
    ext_c: 72,
    anneal_offset_c: -3,
    tags: ["菌落PCR", "含染料直跑", "经济"],
    summary: "菌落 PCR 筛选专用，15-30 s/kb，反应完直接点样电泳省成本",
  },
  {
    id: "KOD One (TOYOBO)",
    vendor: "东洋纺 TOYOBO",
    category: "极速高保真",
    mix_name: "KOD One PCR Master Mix (2x)",
    extension_sec_per_kb: 5,
    denature_c: 98,
    ext_c: 68,
    anneal_offset_c: -1,
    tags: ["极速 5s/kb", "高GC王者", "菌液兼容"],
    summary: "东洋纺旗舰超快高保真酶，5 s/kb，68°C 延伸，高 GC 与菌液扩增极稳",
  },
  {
    id: "KOD-Plus-Neo (TOYOBO)",
    vendor: "东洋纺 TOYOBO",
    category: "极高保真/长片段",
    mix_name: "KOD-Plus-Neo PCR Mix",
    extension_sec_per_kb: 30,
    denature_c: 98,
    ext_c: 68,
    anneal_offset_c: -2,
    tags: ["超高保真", "长片段", "68°C延伸"],
    summary: "超高保真长片段扩增主力，30 s/kb，适合反向 PCR 扩增全长质粒",
  },
  {
    id: "KOD FX Neo (TOYOBO)",
    vendor: "东洋纺 TOYOBO",
    category: "抗抑制/粗样直扩",
    mix_name: "KOD FX Neo PCR Mix",
    extension_sec_per_kb: 30,
    denature_c: 98,
    ext_c: 68,
    anneal_offset_c: -2,
    tags: ["菌液直扩", "强抗抑制", "高GC"],
    summary: "极强抗抑制能力，可直接以菌落/粗裂解液为模板高保真扩增长片段",
  },
  {
    id: "PrimeSTAR Max (Takara)",
    vendor: "Takara 宝生物",
    category: "极速高保真",
    mix_name: "PrimeSTAR Max Premix (2x)",
    extension_sec_per_kb: 5,
    denature_c: 98,
    ext_c: 72,
    anneal_offset_c: -3,
    tags: ["极速 5s/kb", "Takara经典", "反向PCR"],
    summary: "Takara 经典超快高保真，5 s/kb，适合同源臂、OE-PCR 及全质粒反向 PCR",
  },
  {
    id: "PrimeSTAR GXL (Takara)",
    vendor: "Takara 宝生物",
    category: "高GC/长片段",
    mix_name: "PrimeSTAR GXL DNA Polymerase Mix",
    extension_sec_per_kb: 60,
    denature_c: 98,
    ext_c: 68,
    anneal_offset_c: -2,
    tags: ["超高GC", "超长片段", "高成功率"],
    summary: "攻克高 GC（谷棒/链霉菌）与超长片段的利器，60 s/kb，68°C 延伸",
  },
  {
    id: "PrimeSTAR HS (Takara)",
    vendor: "Takara 宝生物",
    category: "经典高保真",
    mix_name: "PrimeSTAR HS Premix (2x)",
    extension_sec_per_kb: 60,
    denature_c: 98,
    ext_c: 72,
    anneal_offset_c: -3,
    tags: ["热启动", "高特异", "经典"],
    summary: "经典热启动高保真酶，60 s/kb，条带单一特异性极佳",
  },
  {
    id: "Q5 High-Fidelity (NEB)",
    vendor: "NEB",
    category: "顶级保真",
    mix_name: "Q5 High-Fidelity 2x Master Mix",
    extension_sec_per_kb: 30,
    denature_c: 98,
    ext_c: 72,
    anneal_offset_c: 1,
    tags: ["280x保真", "国际标杆", "高GC"],
    summary: "超高保真（~280x Taq），30 s/kb，退火温度按 NEB 规则略高于常规 Tm",
  },
  {
    id: "Phusion High-Fidelity (NEB)",
    vendor: "NEB / Thermo",
    category: "经典高保真",
    mix_name: "Phusion High-Fidelity 2x Master Mix",
    extension_sec_per_kb: 25,
    denature_c: 98,
    ext_c: 72,
    anneal_offset_c: 3,
    tags: ["Tm+3°C", "快速", "经典文献常用"],
    summary: "经典高频文献高保真酶，15-30 s/kb，注意退火温度通常需 Tm + 3°C",
  },
  {
    id: "TransStart FastPfu (TransGen)",
    vendor: "全式金 TransGen",
    category: "国产高保真",
    mix_name: "2x TransStart FastPfu PCR SuperMix",
    extension_sec_per_kb: 25,
    denature_c: 95,
    ext_c: 72,
    anneal_offset_c: -3,
    tags: ["国产主力", "快速Pfu", "性价比高"],
    summary: "国内高校常见高保真 Pfu 酶，20-30 s/kb，常规克隆与拼接性价比极佳",
  },
  {
    id: "Hieff Canace Plus (Yeasen)",
    vendor: "翌圣 Yeasen",
    category: "高保真抗抑制",
    mix_name: "2x Hieff Canace Plus PCR Master Mix",
    extension_sec_per_kb: 20,
    denature_c: 98,
    ext_c: 72,
    anneal_offset_c: -2,
    tags: ["国产高保真", "高GC兼容", "快速"],
    summary: "翌圣主力高保真预混液，15-30 s/kb，兼具高产量与宽退火窗口",
  },
  {
    id: "Platinum SuperFi II (Thermo)",
    vendor: "Thermo Fisher",
    category: "通用 60°C 退火",
    mix_name: "2x Platinum SuperFi II PCR Master Mix",
    extension_sec_per_kb: 25,
    denature_c: 98,
    ext_c: 72,
    anneal_offset_c: 0,
    tags: ["统一60°C退火", "超高保真", "高GC"],
    summary: "Thermo 旗舰超高保真酶，支持统一 60°C 退火，极适合多片段同板扩增",
  },
];

export const DELETION_MODE_OPTIONS: {
  value: DeletionMode;
  label: string;
  desc: string;
}[] = [
  {
    value: "auto_safe",
    label: "自动安全保护 (推荐)",
    desc: "自动避让邻近同操纵子基因的 RBS/重叠区，防止极性效应",
  },
  {
    value: "in_frame_scarless",
    label: "框内无痕敲除",
    desc: "保留起止密码子阅读框（3 的倍数），最小化下游翻译干扰",
  },
  {
    value: "strict_full_orf",
    label: "严格全长 ORF 敲除",
    desc: "完整删除起始至终止密码子全部编码序列",
  },
];

export const DONOR_METHOD_OPTIONS: {
  value: DonorMethod;
  label: string;
  desc: string;
}[] = [
  {
    value: "oe_pcr",
    label: "OE-PCR 重叠延伸拼接 (推荐)",
    desc: "分别扩增左右同源臂并经重叠区拼接，成本低、次日可用",
  },
  {
    value: "direct_synthesis",
    label: "直接全基因合成 Donor",
    desc: "省去两步 PCR 胶回收，直接下单合成双链 DNA 片段",
  },
];

export interface ByokProviderPreset {
  id: string;
  name: string;
  badge: string;
  baseUrl: string;
  defaultModel: string;
  placeholder: string;
  hint: string;
}

export const BYOK_PROVIDERS: ByokProviderPreset[] = [
  {
    id: "deepseek",
    name: "DeepSeek",
    badge: "高性价比推荐",
    baseUrl: "https://api.deepseek.com/v1",
    defaultModel: "deepseek-chat",
    placeholder: "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
    hint: "DeepSeek V3 推理自然语言实验指令极快，单次调用成本低至几厘钱",
  },
  {
    id: "qwen",
    name: "通义千问 Qwen",
    badge: "国内直连稳定",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen-plus",
    placeholder: "sk-xxxxxxxxxxxxxxxxxxxxxxxx",
    hint: "阿里云百炼 OpenAI 兼容接口，中文分子生物学术语理解极佳",
  },
  {
    id: "openrouter",
    name: "OpenRouter",
    badge: "多模型聚合",
    baseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-3.5-sonnet",
    placeholder: "sk-or-v1-xxxxxxxxxxxxxxxxxxxx",
    hint: "支持自由切换 Claude / GPT-4o / Gemini 等国际模型",
  },
  {
    id: "custom",
    name: "自定义 OpenAI 兼容",
    badge: "本地 Ollama / 私有部署",
    baseUrl: "http://localhost:11434/v1",
    defaultModel: "qwen2.5:14b",
    placeholder: "输入 Key（本地 Ollama 可填 ollama）",
    hint: "兼容 vLLM / Ollama / OneAPI / 实验室私有网关",
  },
];

export const PRIMER_ROLE_META: Record<
  PrimerRole,
  { label: string; shortLabel: string; colorClass: string }
> = {
  sgRNA_cloning: {
    label: "sgRNA 克隆引物 / Oligo",
    shortLabel: "sgRNA 克隆",
    colorClass:
      "bg-[var(--accent-soft)] text-accent",
  },
  donor_left_arm: {
    label: "左同源臂 (LA) 扩增",
    shortLabel: "左同源臂 LA",
    colorClass:
      "bg-[var(--accent-soft)] text-accent",
  },
  donor_right_arm: {
    label: "右同源臂 (RA) 扩增",
    shortLabel: "右同源臂 RA",
    colorClass:
      "bg-[var(--mint-soft)] text-mint",
  },
  verify_outer: {
    label: "菌落 PCR 外侧鉴定引物",
    shortLabel: "外侧鉴定 VF/VR",
    colorClass:
      "bg-[var(--accent-soft)] text-accent",
  },
  verify_wt_internal: {
    label: "野生型内部排假阴性引物",
    shortLabel: "WT 内引物",
    colorClass:
      "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  sanger_seq: {
    label: "Sanger 测序确认引物",
    shortLabel: "Sanger 测序",
    colorClass:
      "neu-recessed text-[var(--text-primary)]",
  },
  plasmid_verify: {
    label: "sgRNA 质粒构建验证引物",
    shortLabel: "质粒验证",
    colorClass:
      "neu-recessed text-[var(--text-secondary)]",
  },
};

export const CATEGORY_LABELS: Record<VerificationCategory, string> = {
  Provenance: "序列溯源",
  Genomics: "基因组安全",
  sgRNA: "sgRNA 靶向",
  InSilicoPCR: "硅片 PCR 仿真",
  InSilicoAssembly: "硅片组装",
  ReCutting: "防二次切割",
  Thermodynamics: "热力学检查",
  Synthesis: "合成与纯化",
};

export const COLONY_PCR_KEY_LABELS: Record<string, string> = {
  wild_type_band: "野生型对照条带 (WT)",
  knockout_positive_band: "阳性敲除克隆条带 (KO 阳性)",
  wt_internal_control: "WT 内引物排混杂复核",
  sanger_confirmation: "Sanger 测序无痕确认",
};
