"""Adversarial Trap Tests: Prove the 12-Point Zero-Trust Gate catches 100% of classic wet-lab disasters."""

from __future__ import annotations

from crispr_forge.agent.orchestrator import run_knockout_pipeline
from crispr_forge.design.thermo import revcomp
from crispr_forge.models import KnockoutRequest, NeighborGene
from crispr_forge.verification.zero_trust_verifier import verify_knockout_design


def _baseline_glda_design():
    req = KnockoutRequest(
        accession="NC_000913.3",
        gene_name="gldA",
        plasmid_system="pEcCas/pEcgRNA",
        use_llm_agent=False,
    )
    return run_knockout_pipeline(req, client_id="pytest-trap")


def test_trap_1_internal_bsai_site_intercepted() -> None:
    """TRAP 1: sgRNA containing an internal BsaI recognition site (GGTCTC) MUST fail CHK_03 and CHK_05."""
    res = _baseline_glda_design()
    bad_spacer = "ACGTACGTGGTCTCACGTAC"  # 20 nt containing BsaI GGTCTC
    bad_sg = res.selected_sgrna.model_copy(
        update={
            "spacer_20nt": bad_spacer,
            "cloning_oligo_f": "TAGT" + bad_spacer,
            "cloning_oligo_r": "AAAC" + revcomp(bad_spacer),
            "has_enzyme_conflict": True,
        }
    )
    report = verify_knockout_design(
        locus=res.locus,
        selected_sgrna=bad_sg,
        donor=res.donor,
        verification_primers=res.verification_primers,
        plasmid_system="pEcCas/pEcgRNA",
    )
    by_id = {c.check_id: c for c in report.checks}
    assert report.overall_status == "FAILED"
    assert by_id["CHK_03_SGRNA_RULES"].status == "FAIL"
    assert by_id["CHK_05_PLASMID_CLONING"].status == "FAIL"
    assert by_id["CHK_03_SGRNA_RULES"].repair_hint == "select_next_sgrna_candidate"


def test_trap_2_cas9_recutting_donor_and_edited_genome_intercepted() -> None:
    """TRAP 2: sgRNA matching a site inside Donor / Edited KO genome MUST fail CHK_08_HR_AND_RECUT."""
    res = _baseline_glda_design()
    # Pick a real 20nt + NGG site located inside the Left Homology Arm (which survives in Donor & KO!)
    la = res.donor.left_arm_seq
    gg_idx = la.find("GG", 25)
    assert gg_idx != -1
    recut_spacer = la[gg_idx - 21 : gg_idx - 1]
    recut_pam = la[gg_idx - 1 : gg_idx + 2]

    bad_sg = res.selected_sgrna.model_copy(
        update={
            "spacer_20nt": recut_spacer,
            "pam": recut_pam,
            "cloning_oligo_f": "TAGT" + recut_spacer,
            "cloning_oligo_r": "AAAC" + revcomp(recut_spacer),
        }
    )
    report = verify_knockout_design(
        locus=res.locus,
        selected_sgrna=bad_sg,
        donor=res.donor,
        verification_primers=res.verification_primers,
        plasmid_system="pEcCas/pEcgRNA",
    )
    by_id = {c.check_id: c for c in report.checks}
    assert report.overall_status == "FAILED"
    assert by_id["CHK_08_HR_AND_RECUT"].status == "FAIL"
    assert "二次切割" in by_id["CHK_08_HR_AND_RECUT"].summary or "Donor" in by_id["CHK_08_HR_AND_RECUT"].summary


def test_trap_3_verification_primer_inside_homology_arm_intercepted() -> None:
    """TRAP 3: Classic rookie/LLM mistake — VF placed INSIDE left homology arm (binds residual Donor!) MUST fail CHK_09."""
    res = _baseline_glda_design()
    inside_la_seq = res.donor.left_arm_seq[120:142]
    bad_vf = res.verification_primers.outer_forward.model_copy(
        update={"sequence": inside_la_seq, "binding_region": inside_la_seq}
    )
    bad_vp = res.verification_primers.model_copy(update={"outer_forward": bad_vf})

    report = verify_knockout_design(
        locus=res.locus,
        selected_sgrna=res.selected_sgrna,
        donor=res.donor,
        verification_primers=bad_vp,
        plasmid_system="pEcCas/pEcgRNA",
    )
    by_id = {c.check_id: c for c in report.checks}
    assert report.overall_status == "FAILED"
    assert by_id["CHK_09_VERIFY_BOUNDARY"].status == "FAIL"
    assert by_id["CHK_09_VERIFY_BOUNDARY"].details["vf_binds_donor"] is True
    assert by_id["CHK_09_VERIFY_BOUNDARY"].repair_hint == "redesign_verify_primers_wider"


def test_trap_4_neighbor_cds_overlap_intrusion_intercepted() -> None:
    """TRAP 4: Deletion region intruding into an overlapping neighboring CDS MUST fail CHK_02_NEIGHBOR_SAFETY."""
    res = _baseline_glda_design()
    overlapping_nb = NeighborGene(
        name="essential_neighborY",
        locus_tag="b9999",
        product="essential neighbor protein",
        strand="+",
        rel_start=res.locus.deletion_rel_end - 18,
        rel_end=res.locus.deletion_rel_end + 600,
        genome_start=res.locus.deletion_genome_end - 18,
        genome_end=res.locus.deletion_genome_end + 600,
        distance_to_target_bp=-18,
        overlaps_target=True,
        overlaps_rbs_zone=True,
    )
    bad_locus = res.locus.model_copy(
        update={"neighbor_genes": res.locus.neighbor_genes + [overlapping_nb]}
    )
    report = verify_knockout_design(
        locus=bad_locus,
        selected_sgrna=res.selected_sgrna,
        donor=res.donor,
        verification_primers=res.verification_primers,
        plasmid_system="pEcCas/pEcgRNA",
    )
    by_id = {c.check_id: c for c in report.checks}
    assert report.overall_status == "FAILED"
    assert by_id["CHK_02_NEIGHBOR_SAFETY"].status == "FAIL"
    assert by_id["CHK_02_NEIGHBOR_SAFETY"].repair_hint == "switch_to_auto_safe_deletion"


def test_trap_5_oligo_reverse_complement_bug_intercepted() -> None:
    """TRAP 5: Classic reverse-complement bug in pEcgRNA bottom oligo MUST fail CHK_05_PLASMID_CLONING."""
    res = _baseline_glda_design()
    # Accidentally put forward spacer instead of reverse complement after AAAC!
    bad_sg = res.selected_sgrna.model_copy(
        update={"cloning_oligo_r": "AAAC" + res.selected_sgrna.spacer_20nt}
    )
    report = verify_knockout_design(
        locus=res.locus,
        selected_sgrna=bad_sg,
        donor=res.donor,
        verification_primers=res.verification_primers,
        plasmid_system="pEcCas/pEcgRNA",
    )
    by_id = {c.check_id: c for c in report.checks}
    assert report.overall_status == "FAILED"
    assert by_id["CHK_05_PLASMID_CLONING"].status == "FAIL"
    assert "错配" in by_id["CHK_05_PLASMID_CLONING"].summary
