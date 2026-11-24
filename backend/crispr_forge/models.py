"""Frozen Pydantic data contracts shared across Genome, Design, Verifier, Wet-Lab, Agent, MCP, and API."""

from __future__ import annotations

from typing import Any, Literal, Optional
from pydantic import BaseModel, Field


PlasmidSystemId = Literal[
    "pEcCas/pEcgRNA",
    "pCas/pTargetF",
    "pJOE8999",
    "custom",
]

PolymeraseName = str

DeletionMode = Literal["auto_safe", "strict_full_orf", "in_frame_scarless"]
DonorMethod = Literal["oe_pcr", "direct_synthesis"]


class CustomPolymeraseConfig(BaseModel):
    name: str = Field(default="实验室自定义高保真聚合酶", description="Custom polymerase name")
    vendor: str = Field(default="Custom Lab", description="Brand / vendor name")
    mix_name: str = Field(default="2x Custom High-Fidelity Master Mix", description="Master mix reagent label")
    extension_sec_per_kb: int = Field(default=30, ge=1, le=180, description="Extension time in seconds per kb")
    denature_c: float = Field(default=98.0, ge=92.0, le=99.0, description="Denaturation temperature in °C")
    ext_c: float = Field(default=72.0, ge=60.0, le=75.0, description="Extension temperature in °C")
    anneal_offset_c: float = Field(
        default=-2.0,
        ge=-8.0,
        le=6.0,
        description="Annealing offset relative to primer Tm (e.g. -2 or +3 for Phusion/Q5)",
    )
    summary: str = Field(default="用户自定义高保真聚合酶参数")


class CustomPlasmidConfig(BaseModel):
    name: str = Field(default="Custom CRISPR Vector", description="Custom plasmid name")
    cloning_method: Literal["golden_gate_oligo", "inverse_pcr"] = "golden_gate_oligo"
    overhang_forward: str = Field(default="TAGT", description="5' forward sticky overhang for Golden Gate oligo")
    overhang_reverse: str = Field(default="AAAC", description="5' reverse sticky overhang for Golden Gate oligo")
    restriction_enzyme: str = Field(
        default="BsaI",
        description="Type IIS enzyme to exclude from spacer & junctions: BsaI, BbsI, Esp3I, BsmBI, or none",
    )
    inverse_pcr_scaffold_anchor: str = Field(
        default="GTTTTAGAGCTAGAAATAGCAAGTTA",
        description="Forward primer 3' binding anchor on gRNA scaffold for Inverse PCR",
    )
    inverse_pcr_reverse_primer: str = Field(
        default="ACTAGTATTATACCTAGGACTGAG",
        description="Universal reverse primer upstream of N20 on J23119 promoter for Inverse PCR",
    )
    antibiotics: str = Field(default="Kanamycin (50 ug/mL) + Spectinomycin (50 ug/mL)")
    curing_note: str = Field(
        default="请依据所用载体的温敏复制子或反筛标记（如 sacB / IPTG / 鼠李糖诱导）依次完成质粒消除。"
    )
    colony_pcr_backbone_f: Optional[str] = Field(
        default=None, description="Optional parsed/custom backbone forward primer for plasmid colony PCR"
    )
    colony_pcr_backbone_r: Optional[str] = Field(
        default=None, description="Optional parsed/custom backbone reverse primer for plasmid colony PCR"
    )
    sanger_backbone_f: Optional[str] = Field(
        default=None, description="Optional parsed/custom Sanger sequencing primer on vector backbone"
    )


class PlasmidParseRequest(BaseModel):
    genbank_content: str = Field(..., min_length=50, description="Raw GenBank (.gb/.gbk) content of empty vector")
    filename: Optional[str] = Field(default=None, description="Optional uploaded filename")


class PlasmidParseResponse(BaseModel):
    config: CustomPlasmidConfig
    vector_length_bp: int
    detected_features: list[str] = Field(default_factory=list)
    detection_notes: list[str] = Field(default_factory=list)
    confidence: Literal["high", "medium", "low"] = "high"


class StrainSearchItem(BaseModel):
    accession: str
    organism: str
    title: str
    length_bp: Optional[int] = None
    is_cached: bool = False
    source: Literal["local_curated", "ncbi_live"] = "local_curated"


class KnockoutRequest(BaseModel):
    accession: str = Field(
        default="NC_000913.3",
        description="NCBI RefSeq accession (e.g. NC_000913.3, NC_000964.3, NC_003450.3)",
    )
    gene_name: str = Field(
        default="lacZ",
        description="Target gene symbol or locus tag (e.g. lacZ, ackA, pta, gldA, amyE, ldhA)",
    )
    custom_genbank: Optional[str] = Field(
        default=None,
        description="Optional raw GenBank (.gb/.gbk) file content uploaded by user",
    )
    custom_fasta: Optional[str] = Field(
        default=None,
        description="Optional raw FASTA (.fasta/.fa) file content uploaded by user",
    )
    custom_target_start: Optional[int] = Field(
        default=None,
        ge=1,
        description="1-based start coordinate inside custom_fasta when no CDS annotation is present",
    )
    custom_target_end: Optional[int] = Field(
        default=None,
        ge=2,
        description="1-based inclusive end coordinate inside custom_fasta when no CDS annotation is present",
    )
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA"
    custom_plasmid: Optional[CustomPlasmidConfig] = None
    homology_arm_length: int = Field(default=500, ge=250, le=1000)
    deletion_mode: DeletionMode = "auto_safe"
    donor_construction_method: DonorMethod = "oe_pcr"
    polymerase: PolymeraseName = "Phanta Max (Vazyme)"
    custom_polymerase: Optional[CustomPolymeraseConfig] = None
    auto_fetch_whole_genome: bool = Field(
        default=True,
        description="Automatically fetch & cache full NCBI bacterial chromosome FASTA for whole-genome off-target scanning",
    )
    target_tm: float = Field(default=60.0, ge=54.0, le=66.0)
    min_band_diff_bp: int = Field(default=300, ge=100, le=1500)
    top_sgrna_count: int = Field(default=5, ge=1, le=10)
    # AI Agent & BYOK runtime options
    use_llm_agent: bool = True
    llm_api_key: Optional[str] = None
    llm_base_url: Optional[str] = None
    llm_model: Optional[str] = None
    natural_language_prompt: Optional[str] = None


class NeighborGene(BaseModel):
    name: str
    locus_tag: str = ""
    product: str = ""
    strand: Literal["+", "-"]
    rel_start: int
    rel_end: int
    genome_start: int
    genome_end: int
    distance_to_target_bp: int
    overlaps_target: bool = False
    overlaps_rbs_zone: bool = False
    warning: Optional[str] = None


class LocusInfo(BaseModel):
    accession: str
    organism: str
    gene_name: str
    locus_tag: str
    product: str
    strand: Literal["+", "-"]
    genome_start: int  # 1-based inclusive
    genome_end: int  # 1-based inclusive
    orf_length_bp: int
    slice_genome_start: int  # 1-based inclusive start of extracted window
    slice_genome_end: int  # 1-based inclusive end of extracted window
    locus_sequence: str
    target_rel_start: int  # 0-based start within locus_sequence
    target_rel_end: int  # 0-based exclusive end within locus_sequence
    deletion_rel_start: int
    deletion_rel_end: int
    deletion_genome_start: int
    deletion_genome_end: int
    deleted_length_bp: int
    sequence_sha256: str
    source: Literal["ncbi_live", "preset_verified", "user_upload_gb", "user_upload_fasta"]
    neighbor_genes: list[NeighborGene] = Field(default_factory=list)
    safety_adjustment_note: Optional[str] = None


class SgRNACandidate(BaseModel):
    rank: int
    id: str
    spacer_20nt: str
    pam: str
    strand: Literal["+", "-"]
    cut_site_rel: int
    cut_site_genome: int
    distance_from_orf_start_pct: float
    gc_percent: float
    on_target_score: float
    self_complementarity_dg: float
    has_poly_t: bool
    has_enzyme_conflict: bool = False
    enzyme_conflict_detail: Optional[str] = None
    off_target_scope: Literal["whole_genome", "locus_window"] = "locus_window"
    off_target_hits_seed: int = 0
    off_target_hits_1_2mm: int = 0
    off_target_summary: str = ""
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA"
    cloning_method: Literal["golden_gate_oligo", "inverse_pcr"] = "golden_gate_oligo"
    cloning_oligo_f: str
    cloning_oligo_r: str
    cloning_oligo_note: str = ""
    selected: bool = False


class PrimerSpec(BaseModel):
    name: str
    role: Literal[
        "sgRNA_cloning",
        "donor_left_arm",
        "donor_right_arm",
        "verify_outer",
        "verify_wt_internal",
        "sanger_seq",
        "plasmid_verify",
    ]
    sequence: str
    binding_region: str
    overhang_region: str = ""
    length_nt: int
    tm_binding_c: float
    tm_full_c: float
    gc_percent: float
    hairpin_dg: float
    homodimer_dg: float
    purification_method: Literal["DSL/OPC", "PAGE", "HPLC"] = "DSL/OPC"
    template_source: str = ""
    rel_bind_start: Optional[int] = None
    rel_bind_end: Optional[int] = None
    strand: Optional[Literal["+", "-"]] = None
    notes: str = ""


class DonorDesign(BaseModel):
    method: DonorMethod
    left_arm_seq: str
    right_arm_seq: str
    left_arm_len: int
    right_arm_len: int
    overlap_seq: str
    overlap_len: int
    overlap_tm_c: float
    full_donor_seq: str
    full_donor_len: int
    primers: list[PrimerSpec]
    la_amplicon_bp: int
    ra_amplicon_bp: int


class VerificationPrimersDesign(BaseModel):
    outer_forward: PrimerSpec
    outer_reverse: PrimerSpec
    wt_internal_primer: Optional[PrimerSpec] = None
    sanger_primer: PrimerSpec
    plasmid_verify_primers: list[PrimerSpec]
    wt_amplicon_bp: int
    ko_amplicon_bp: int
    band_diff_bp: int
    distance_outside_la_bp: int
    distance_outside_ra_bp: int


class VerificationCheck(BaseModel):
    check_id: str
    name: str
    plain_explanation: str = ""
    category: Literal[
        "Provenance",
        "Genomics",
        "sgRNA",
        "InSilicoPCR",
        "InSilicoAssembly",
        "ReCutting",
        "Thermodynamics",
        "Synthesis",
    ]
    status: Literal["PASS", "WARN", "FAIL"]
    summary: str
    details: dict[str, Any] = Field(default_factory=dict)
    repair_hint: Optional[str] = None


class GelLane(BaseModel):
    lane_name: str
    label: str
    bands_bp: list[int]
    expected_note: str
    highlight: bool = False


class ZeroTrustVerificationReport(BaseModel):
    overall_status: Literal["CERTIFIED_PASS", "PASS_WITH_WARNINGS", "FAILED"]
    passed_count: int
    warn_count: int
    fail_count: int
    total_checks: int
    checks: list[VerificationCheck]
    edited_locus_sequence: str
    edited_locus_sha256: str
    plasmid_assembled_cassette: str
    in_silico_gel_lanes: list[GelLane]


class PipettingComponent(BaseModel):
    reagent: str
    stock_conc: str
    volume_ul: float
    final_amount: str
    dilution_alert: Optional[str] = None


class ReactionMix(BaseModel):
    title: str
    subtitle: str = ""
    total_volume_ul: float
    components: list[PipettingComponent]
    thermocycler_program: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class TimelineDay(BaseModel):
    day: str
    title: str
    steps: list[str]
    checkpoint: str


class WetLabProtocol(BaseModel):
    plasmid_system: PlasmidSystemId
    polymerase: PolymeraseName
    custom_polymerase: Optional[CustomPolymeraseConfig] = None
    reactions: list[ReactionMix]
    timeline: list[TimelineDay]
    colony_pcr_interpretation: dict[str, str]


class PipettingCalcRequest(BaseModel):
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA"
    custom_plasmid: Optional[CustomPlasmidConfig] = None
    la_len_bp: int = 515
    ra_len_bp: int = 515
    donor_len_bp: int = 1000
    wt_amplicon_bp: int = 2400
    ko_amplicon_bp: int = 1300
    la_conc_ng_ul: float = Field(default=65.0, gt=0.1, le=5000.0)
    ra_conc_ng_ul: float = Field(default=58.0, gt=0.1, le=5000.0)
    donor_conc_ng_ul: float = Field(default=120.0, gt=0.1, le=5000.0)
    vector_backbone_conc_ng_ul: float = Field(default=45.0, gt=0.1, le=5000.0)
    sgrna_plasmid_conc_ng_ul: float = Field(default=150.0, gt=0.1, le=5000.0)
    oe_pcr_ratio_mode: Literal["molar_ratio", "volume_ratio"] = "molar_ratio"
    oe_pcr_target_pmol_each: float = Field(default=0.05, gt=0.005, le=1.0)
    volume_ratio_la_ul: float = Field(default=1.0, ge=0.5, le=10.0)
    volume_ratio_ra_ul: float = Field(default=1.0, ge=0.5, le=10.0)
    electroporation_donor_ng: float = Field(default=400.0, ge=100.0, le=2000.0)
    electroporation_plasmid_ng: float = Field(default=100.0, ge=50.0, le=500.0)
    polymerase: PolymeraseName = "Phanta Max (Vazyme)"
    custom_polymerase: Optional[CustomPolymeraseConfig] = None
    la_anneal_tm: float = 60.0
    ra_anneal_tm: float = 60.0
    overlap_tm: float = 60.0
    verify_anneal_tm: float = 59.0


class VerifyCustomRequest(BaseModel):
    locus: LocusInfo
    selected_sgrna: SgRNACandidate
    donor: DonorDesign
    verification_primers: VerificationPrimersDesign
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA"
    custom_plasmid: Optional[CustomPlasmidConfig] = None
    min_band_diff_bp: int = 300


class QuotaStatus(BaseModel):
    free_trial_enabled: bool
    daily_limit: int
    used_today: int
    remaining_today: int
    using_byok: bool = False
    active_model: str = "deterministic-zero-trust"


class AuditStep(BaseModel):
    step_index: int
    stage: str
    tool_name: str
    status: Literal["ok", "repaired", "warning", "error"]
    message: str
    duration_ms: int


class DesignResponse(BaseModel):
    run_id: str
    mode: Literal["llm_agent", "deterministic_engine"]
    llm_model_used: Optional[str] = None
    quota_status: Optional[QuotaStatus] = None
    plasmid_system: PlasmidSystemId
    custom_plasmid: Optional[CustomPlasmidConfig] = None
    repair_iterations: int
    audit_trace: list[AuditStep]
    locus: LocusInfo
    selected_sgrna: SgRNACandidate
    alternative_sgrnas: list[SgRNACandidate]
    donor: DonorDesign
    verification_primers: VerificationPrimersDesign
    verification_report: ZeroTrustVerificationReport
    all_primers: list[PrimerSpec]
    wetlab_protocol: WetLabProtocol
    agent_summary: str
