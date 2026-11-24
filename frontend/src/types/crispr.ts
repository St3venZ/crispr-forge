/**
 * Exact TypeScript contracts mirroring backend/crispr_forge/models.py (v2)
 */

export type PlasmidSystemId =
  | "pEcCas/pEcgRNA"
  | "pCas/pTargetF"
  | "pJOE8999"
  | "custom";

export type PolymeraseName = string;

export type DeletionMode = "auto_safe" | "strict_full_orf" | "in_frame_scarless";
export type DonorMethod = "oe_pcr" | "direct_synthesis";
export type CloningMethod = "golden_gate_oligo" | "inverse_pcr";

export type ThemeMode = "light" | "dark" | "system";
export type FontScalePct = number;

export interface CustomPolymeraseConfig {
  name: string;
  vendor: string;
  mix_name: string;
  extension_sec_per_kb: number;
  denature_c: number;
  ext_c: number;
  anneal_offset_c: number;
  summary: string;
}

export interface PolymeraseCatalogItem {
  id: string;
  vendor: string;
  category: string;
  mix_name: string;
  extension_sec_per_kb: number;
  denature_c: number;
  ext_c: number;
  anneal_offset_c: number;
  tags: string[];
  summary: string;
  is_custom?: boolean;
}

export interface CustomPlasmidConfig {
  name: string;
  cloning_method: CloningMethod;
  overhang_forward: string;
  overhang_reverse: string;
  restriction_enzyme: string;
  inverse_pcr_scaffold_anchor: string;
  inverse_pcr_reverse_primer: string;
  antibiotics: string;
  curing_note: string;
  colony_pcr_backbone_f?: string | null;
  colony_pcr_backbone_r?: string | null;
  sanger_backbone_f?: string | null;
}

export interface PlasmidParseResponse {
  config: CustomPlasmidConfig;
  vector_length_bp: number;
  detected_features: string[];
  detection_notes: string[];
  confidence: "high" | "medium" | "low";
}

export interface StrainSearchItem {
  accession: string;
  organism: string;
  title: string;
  length_bp?: number | null;
  is_cached: boolean;
  source: "local_curated" | "ncbi_live";
}

export interface KnockoutRequest {
  accession: string;
  gene_name: string;
  custom_genbank?: string | null;
  custom_fasta?: string | null;
  custom_target_start?: number | null;
  custom_target_end?: number | null;
  plasmid_system: PlasmidSystemId;
  custom_plasmid?: CustomPlasmidConfig | null;
  homology_arm_length: number;
  deletion_mode: DeletionMode;
  donor_construction_method: DonorMethod;
  polymerase: PolymeraseName;
  custom_polymerase?: CustomPolymeraseConfig | null;
  auto_fetch_whole_genome?: boolean;
  target_tm: number;
  min_band_diff_bp: number;
  top_sgrna_count: number;
  use_llm_agent: boolean;
  llm_api_key?: string | null;
  llm_base_url?: string | null;
  llm_model?: string | null;
  natural_language_prompt?: string | null;
}

export interface NeighborGene {
  name: string;
  locus_tag: string;
  product: string;
  strand: "+" | "-";
  rel_start: number;
  rel_end: number;
  genome_start: number;
  genome_end: number;
  distance_to_target_bp: number;
  overlaps_target: boolean;
  overlaps_rbs_zone: boolean;
  warning?: string | null;
}

export interface LocusInfo {
  accession: string;
  organism: string;
  gene_name: string;
  locus_tag: string;
  product: string;
  strand: "+" | "-";
  genome_start: number;
  genome_end: number;
  orf_length_bp: number;
  slice_genome_start: number;
  slice_genome_end: number;
  locus_sequence: string;
  target_rel_start: number;
  target_rel_end: number;
  deletion_rel_start: number;
  deletion_rel_end: number;
  deletion_genome_start: number;
  deletion_genome_end: number;
  deleted_length_bp: number;
  sequence_sha256: string;
  source: "ncbi_live" | "preset_verified" | "user_upload_gb" | "user_upload_fasta";
  neighbor_genes: NeighborGene[];
  safety_adjustment_note?: string | null;
}

export interface SgRNACandidate {
  rank: number;
  id: string;
  spacer_20nt: string;
  pam: string;
  strand: "+" | "-";
  cut_site_rel: number;
  cut_site_genome: number;
  distance_from_orf_start_pct: number;
  gc_percent: number;
  on_target_score: number;
  self_complementarity_dg: number;
  has_poly_t: boolean;
  has_enzyme_conflict: boolean;
  enzyme_conflict_detail?: string | null;
  off_target_scope: "whole_genome" | "locus_window";
  off_target_hits_seed: number;
  off_target_hits_1_2mm: number;
  off_target_summary: string;
  plasmid_system: PlasmidSystemId;
  cloning_method: CloningMethod;
  cloning_oligo_f: string;
  cloning_oligo_r: string;
  cloning_oligo_note: string;
  selected: boolean;
}

export type PrimerRole =
  | "sgRNA_cloning"
  | "donor_left_arm"
  | "donor_right_arm"
  | "verify_outer"
  | "verify_wt_internal"
  | "sanger_seq"
  | "plasmid_verify";

export interface PrimerSpec {
  name: string;
  role: PrimerRole;
  sequence: string;
  binding_region: string;
  overhang_region: string;
  length_nt: number;
  tm_binding_c: number;
  tm_full_c: number;
  gc_percent: number;
  hairpin_dg: number;
  homodimer_dg: number;
  purification_method: "DSL/OPC" | "PAGE" | "HPLC";
  template_source: string;
  rel_bind_start?: number | null;
  rel_bind_end?: number | null;
  strand?: "+" | "-" | null;
  notes: string;
}

export interface DonorDesign {
  method: DonorMethod;
  left_arm_seq: string;
  right_arm_seq: string;
  left_arm_len: number;
  right_arm_len: number;
  overlap_seq: string;
  overlap_len: number;
  overlap_tm_c: number;
  full_donor_seq: string;
  full_donor_len: number;
  primers: PrimerSpec[];
  la_amplicon_bp: number;
  ra_amplicon_bp: number;
}

export interface VerificationPrimersDesign {
  outer_forward: PrimerSpec;
  outer_reverse: PrimerSpec;
  wt_internal_primer?: PrimerSpec | null;
  sanger_primer: PrimerSpec;
  plasmid_verify_primers: PrimerSpec[];
  wt_amplicon_bp: number;
  ko_amplicon_bp: number;
  band_diff_bp: number;
  distance_outside_la_bp: number;
  distance_outside_ra_bp: number;
}

export type VerificationCategory =
  | "Provenance"
  | "Genomics"
  | "sgRNA"
  | "InSilicoPCR"
  | "InSilicoAssembly"
  | "ReCutting"
  | "Thermodynamics"
  | "Synthesis";

export interface VerificationCheck {
  check_id: string;
  name: string;
  plain_explanation: string;
  category: VerificationCategory;
  status: "PASS" | "WARN" | "FAIL";
  summary: string;
  details: Record<string, unknown>;
  repair_hint?: string | null;
}

export interface GelLane {
  lane_name: string;
  label: string;
  bands_bp: number[];
  expected_note: string;
  highlight: boolean;
}

export interface ZeroTrustVerificationReport {
  overall_status: "CERTIFIED_PASS" | "PASS_WITH_WARNINGS" | "FAILED";
  passed_count: number;
  warn_count: number;
  fail_count: number;
  total_checks: number;
  checks: VerificationCheck[];
  edited_locus_sequence: string;
  edited_locus_sha256: string;
  plasmid_assembled_cassette: string;
  in_silico_gel_lanes: GelLane[];
}

export interface PipettingComponent {
  reagent: string;
  stock_conc: string;
  volume_ul: number;
  final_amount: string;
  dilution_alert?: string | null;
}

export interface ReactionMix {
  title: string;
  subtitle: string;
  total_volume_ul: number;
  components: PipettingComponent[];
  thermocycler_program: string[];
  notes: string[];
}

export interface TimelineDay {
  day: string;
  title: string;
  steps: string[];
  checkpoint: string;
}

export interface WetLabProtocol {
  plasmid_system: PlasmidSystemId;
  polymerase: PolymeraseName;
  custom_polymerase?: CustomPolymeraseConfig | null;
  reactions: ReactionMix[];
  timeline: TimelineDay[];
  colony_pcr_interpretation: Record<string, string>;
}

export interface PipettingCalcRequest {
  plasmid_system: PlasmidSystemId;
  custom_plasmid?: CustomPlasmidConfig | null;
  la_len_bp: number;
  ra_len_bp: number;
  donor_len_bp: number;
  wt_amplicon_bp: number;
  ko_amplicon_bp: number;
  la_conc_ng_ul: number;
  ra_conc_ng_ul: number;
  donor_conc_ng_ul: number;
  vector_backbone_conc_ng_ul: number;
  sgrna_plasmid_conc_ng_ul: number;
  oe_pcr_ratio_mode: "molar_ratio" | "volume_ratio";
  oe_pcr_target_pmol_each: number;
  volume_ratio_la_ul: number;
  volume_ratio_ra_ul: number;
  electroporation_donor_ng: number;
  electroporation_plasmid_ng: number;
  polymerase: PolymeraseName;
  custom_polymerase?: CustomPolymeraseConfig | null;
  la_anneal_tm: number;
  ra_anneal_tm: number;
  overlap_tm: number;
  verify_anneal_tm: number;
}

export interface VerifyCustomRequest {
  locus: LocusInfo;
  selected_sgrna: SgRNACandidate;
  donor: DonorDesign;
  verification_primers: VerificationPrimersDesign;
  plasmid_system: PlasmidSystemId;
  custom_plasmid?: CustomPlasmidConfig | null;
  min_band_diff_bp: number;
}

export interface QuotaStatus {
  free_trial_enabled: boolean;
  daily_limit: number;
  used_today: number;
  remaining_today: number;
  using_byok: boolean;
  active_model: string;
}

export interface AuditStep {
  step_index: number;
  stage: string;
  tool_name: string;
  status: "ok" | "repaired" | "warning" | "error";
  message: string;
  duration_ms: number;
}

export interface DesignResponse {
  run_id: string;
  mode: "llm_agent" | "deterministic_engine";
  llm_model_used?: string | null;
  quota_status?: QuotaStatus | null;
  plasmid_system: PlasmidSystemId;
  custom_plasmid?: CustomPlasmidConfig | null;
  repair_iterations: number;
  audit_trace: AuditStep[];
  locus: LocusInfo;
  selected_sgrna: SgRNACandidate;
  alternative_sgrnas: SgRNACandidate[];
  donor: DonorDesign;
  verification_primers: VerificationPrimersDesign;
  verification_report: ZeroTrustVerificationReport;
  all_primers: PrimerSpec[];
  wetlab_protocol: WetLabProtocol;
  agent_summary: string;
}

// --- Frontend helper & Catalog types ---

export interface PlasmidCatalogItem {
  id: PlasmidSystemId;
  display_name: string;
  short_label: string;
  hosts: string;
  reference: string;
  cloning_method: string;
  overhangs: string;
  antibiotics: string;
  curing_protocol: string;
}

export interface PresetCatalogItem {
  accession: string;
  gene_name: string;
  locus_tag: string;
  organism: string;
  organism_cn: string;
  recommended_plasmid: PlasmidSystemId;
  tag: string;
  description: string;
}

export interface CatalogResponse {
  presets: PresetCatalogItem[];
  plasmid_systems: PlasmidCatalogItem[];
  plasmids?: PlasmidCatalogItem[];
  polymerases?: PolymeraseCatalogItem[];
  whole_genome_index_ready?: boolean;
  cached_whole_genomes?: string[];
}

export interface HealthResponse {
  status: string;
  version?: string;
  llm_admin_configured?: boolean;
  free_trial_daily_limit?: number;
  default_model?: string;
  whole_genome_index_ready?: boolean;
  cached_whole_genomes?: string[];
  auto_fetch_whole_genome_supported?: boolean;
  [key: string]: unknown;
}

export interface ByokConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  providerId: string;
}

export interface VerifyCustomResponse {
  verification_report: ZeroTrustVerificationReport;
  all_primers: PrimerSpec[];
}

export type ExportFormat =
  | "bundle_zip"
  | "primers_xlsx"
  | "sop_md"
  | "gb_wt"
  | "gb_ko"
  | "gb_donor"
  | "gb_plasmid";
