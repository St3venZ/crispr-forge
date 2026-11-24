"""End-to-end tests across 3 prokaryotic species, 4 plasmid systems, and unannotated FASTA uploads."""

from __future__ import annotations

import pytest

from crispr_forge.agent.orchestrator import run_knockout_pipeline
from crispr_forge.models import CustomPlasmidConfig, KnockoutRequest


@pytest.mark.parametrize(
    "accession,gene,plasmid_system",
    [
        ("NC_000913.3", "lacZ", "pCas/pTargetF"),
        ("NC_000913.3", "ackA", "pEcCas/pEcgRNA"),
        ("NC_000913.3", "pta", "pEcCas/pEcgRNA"),
        ("NC_000913.3", "gldA", "pEcCas/pEcgRNA"),
        ("NC_000964.3", "amyE", "pJOE8999"),
        ("NC_003450.3", "ldhA", "custom"),
    ],
)
def test_multi_species_and_multi_plasmid_end_to_end(
    accession: str,
    gene: str,
    plasmid_system: str,
) -> None:
    custom_cfg = (
        CustomPlasmidConfig(
            name="pCas9gRNA-Cgl",
            cloning_method="golden_gate_oligo",
            overhang_forward="TAGT",
            overhang_reverse="AAAC",
            restriction_enzyme="BsaI",
            antibiotics="Kanamycin (25 ug/mL)",
        )
        if plasmid_system == "custom"
        else None
    )
    req = KnockoutRequest(
        accession=accession,
        gene_name=gene,
        plasmid_system=plasmid_system,  # type: ignore[arg-type]
        custom_plasmid=custom_cfg,
        use_llm_agent=False,
    )
    res = run_knockout_pipeline(req, client_id="pytest")

    assert res.verification_report.fail_count == 0, [
        (c.check_id, c.summary) for c in res.verification_report.checks if c.status == "FAIL"
    ]
    assert res.verification_report.overall_status in ("CERTIFIED_PASS", "PASS_WITH_WARNINGS")
    assert res.verification_primers.distance_outside_la_bp >= 50
    assert res.verification_primers.distance_outside_ra_bp >= 50
    assert res.verification_primers.band_diff_bp >= 300
    assert len(res.all_primers) >= 9

    # All 3 cached model species (E. coli, B. subtilis, C. glutamicum) must now run whole-genome off-target scanning!
    assert res.selected_sgrna.off_target_scope == "whole_genome"
    assert res.verification_report.passed_count >= 11


def test_keio_in_frame_scarless_and_direct_synthesis() -> None:
    req = KnockoutRequest(
        accession="NC_000913.3",
        gene_name="ackA",
        plasmid_system="pEcCas/pEcgRNA",
        deletion_mode="in_frame_scarless",
        donor_construction_method="direct_synthesis",
        polymerase="KOD One (TOYOBO)",
        use_llm_agent=False,
    )
    res = run_knockout_pipeline(req, client_id="pytest")
    assert res.verification_report.fail_count == 0
    assert res.locus.deleted_length_bp % 3 == 0
    assert res.donor.method == "direct_synthesis"
    assert res.donor.primers == []


def test_raw_unannotated_fasta_upload() -> None:
    # Build a synthetic 3.6 kb prokaryotic locus in raw FASTA (no GenBank annotation!)
    from crispr_forge.genome.ncbi_client import load_preset_record

    rec, _, _ = load_preset_record("NC_000913.3", "gldA")
    raw_seq = str(rec.seq)[:4200]
    fasta_text = f">Custom_Lab_Strain_Contig1\n{raw_seq}\n"

    req = KnockoutRequest(
        accession="CUSTOM",
        gene_name="lab_geneX",
        custom_fasta=fasta_text,
        custom_target_start=1500,
        custom_target_end=2600,
        plasmid_system="pEcCas/pEcgRNA",
        use_llm_agent=False,
    )
    res = run_knockout_pipeline(req, client_id="pytest")
    assert res.locus.source == "user_upload_fasta"
    assert res.verification_report.fail_count == 0
    assert res.verification_primers.band_diff_bp >= 900


def test_natural_language_prompt_parsing() -> None:
    req = KnockoutRequest(
        natural_language_prompt="帮我用 pJOE8999 敲除枯草芽孢杆菌 168 的 amyE 基因，用 KOD One 聚合酶，同源臂 600bp",
        use_llm_agent=False,
    )
    res = run_knockout_pipeline(req, client_id="pytest")
    assert res.locus.accession == "NC_000964.3"
    assert res.locus.gene_name.lower() == "amye"
    assert res.plasmid_system == "pJOE8999"
    assert res.donor.left_arm_len == 600
    assert res.wetlab_protocol.polymerase == "KOD One (TOYOBO)"
    assert res.verification_report.fail_count == 0
