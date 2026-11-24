"""Unified Deterministic Bio-Tool Registry shared by both the AI Agent Orchestrator and FastMCP Server."""

from __future__ import annotations

from typing import Optional

from crispr_forge.design.donor_designer import design_donor
from crispr_forge.design.primer_designer import design_verification_primers
from crispr_forge.design.sgrna_designer import build_sgrna_cloning_primers, design_sgrnas
from crispr_forge.genome.locus_analyzer import analyze_locus
from crispr_forge.genome.ncbi_client import get_locus_record, list_available_presets
from crispr_forge.genome.offtarget_index import (
    is_whole_genome_index_available,
    list_cached_whole_genomes,
)
from crispr_forge.models import (
    CustomPlasmidConfig,
    DeletionMode,
    DesignResponse,
    DonorDesign,
    DonorMethod,
    LocusInfo,
    PipettingCalcRequest,
    PlasmidSystemId,
    PrimerSpec,
    SgRNACandidate,
    VerificationPrimersDesign,
    WetLabProtocol,
    ZeroTrustVerificationReport,
)
from crispr_forge.plasmids import list_plasmid_catalog, resolve_plasmid_profile
from crispr_forge.verification.zero_trust_verifier import verify_knockout_design
from crispr_forge.wetlab.calculator import calculate_wetlab_protocol, list_polymerase_catalog


def tool_list_catalog() -> dict:
    """Return full universal catalog: presets, plasmid systems, 15+ polymerases, and cached whole genomes."""
    return {
        "presets": list_available_presets(),
        "plasmid_systems": list_plasmid_catalog(),
        "polymerases": list_polymerase_catalog(),
        "whole_genome_index_ready": is_whole_genome_index_available("NC_000913.3"),
        "cached_whole_genomes": list_cached_whole_genomes(),
    }


def tool_analyze_locus(
    accession: str = "NC_000913.3",
    gene_name: str = "lacZ",
    deletion_mode: DeletionMode = "auto_safe",
    custom_genbank: Optional[str] = None,
    custom_fasta: Optional[str] = None,
    custom_target_start: Optional[int] = None,
    custom_target_end: Optional[int] = None,
) -> LocusInfo:
    record, slice_start, resolved_gene, source = get_locus_record(
        accession=accession,
        gene_name=gene_name,
        custom_genbank=custom_genbank,
        custom_fasta=custom_fasta,
    )
    return analyze_locus(
        record=record,
        gene_name=resolved_gene,
        accession=accession,
        slice_genome_start=slice_start,
        source=source,
        deletion_mode=deletion_mode,
        custom_target_start=custom_target_start,
        custom_target_end=custom_target_end,
    )


def tool_design_sgrnas(
    locus: LocusInfo,
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA",
    custom_plasmid: Optional[CustomPlasmidConfig] = None,
    top_k: int = 5,
) -> list[SgRNACandidate]:
    return design_sgrnas(
        locus=locus,
        plasmid_system=plasmid_system,
        custom_plasmid=custom_plasmid,
        top_k=top_k,
    )


def tool_design_donor(
    locus: LocusInfo,
    arm_length: int = 500,
    method: DonorMethod = "oe_pcr",
    target_tm: float = 60.0,
    overlap_target_len: int = 28,
    window_shift: int = 0,
) -> DonorDesign:
    return design_donor(
        locus=locus,
        arm_length=arm_length,
        method=method,
        target_tm=target_tm,
        overlap_target_len=overlap_target_len,
        window_shift=window_shift,
    )


def tool_design_verification_primers(
    locus: LocusInfo,
    donor: DonorDesign,
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA",
    custom_plasmid: Optional[CustomPlasmidConfig] = None,
    target_tm: float = 60.0,
    outer_offset: int = 180,
) -> VerificationPrimersDesign:
    return design_verification_primers(
        locus=locus,
        donor=donor,
        plasmid_system=plasmid_system,
        custom_plasmid=custom_plasmid,
        target_tm=target_tm,
        outer_offset=outer_offset,
    )


def tool_verify_design(
    locus: LocusInfo,
    selected_sgrna: SgRNACandidate,
    donor: DonorDesign,
    verification_primers: VerificationPrimersDesign,
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA",
    custom_plasmid: Optional[CustomPlasmidConfig] = None,
    min_band_diff_bp: int = 300,
) -> ZeroTrustVerificationReport:
    return verify_knockout_design(
        locus=locus,
        selected_sgrna=selected_sgrna,
        donor=donor,
        verification_primers=verification_primers,
        plasmid_system=plasmid_system,
        custom_plasmid=custom_plasmid,
        min_band_diff_bp=min_band_diff_bp,
    )


def tool_collect_all_primers(
    locus: LocusInfo,
    selected_sgrna: SgRNACandidate,
    donor: DonorDesign,
    verification_primers: VerificationPrimersDesign,
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA",
    custom_plasmid: Optional[CustomPlasmidConfig] = None,
) -> list[PrimerSpec]:
    profile = resolve_plasmid_profile(plasmid_system, custom_plasmid)
    sgrna_primers = build_sgrna_cloning_primers(locus.gene_name, selected_sgrna, profile)
    all_p: list[PrimerSpec] = []
    all_p.extend(sgrna_primers)
    all_p.extend(donor.primers)
    all_p.append(verification_primers.outer_forward)
    all_p.append(verification_primers.outer_reverse)
    if verification_primers.wt_internal_primer:
        all_p.append(verification_primers.wt_internal_primer)
    all_p.append(verification_primers.sanger_primer)
    all_p.extend(verification_primers.plasmid_verify_primers)
    return all_p


def tool_calculate_wetlab(req: PipettingCalcRequest) -> WetLabProtocol:
    return calculate_wetlab_protocol(req)
