"""Tests for dynamic pipetting < 0.5 uL pre-dilution solver, molar/volume modes, exporters, and quota gate."""

from __future__ import annotations

import io
import zipfile
from pathlib import Path

from Bio import SeqIO
from openpyxl import load_workbook

from crispr_forge.agent.orchestrator import run_knockout_pipeline
from crispr_forge.agent.quota import QuotaManager
from crispr_forge.config import settings
from crispr_forge.models import CustomPolymeraseConfig, KnockoutRequest, PipettingCalcRequest
from crispr_forge.wetlab.calculator import calculate_wetlab_protocol, list_polymerase_catalog
from crispr_forge.wetlab.exporters import export_artifact


def test_pipetting_auto_dilution_triggers_below_half_microliter() -> None:
    """High NanoDrop concentrations (e.g. 480 ng/uL) must trigger < 0.5 uL pre-dilution alerts."""
    req = PipettingCalcRequest(
        plasmid_system="pEcCas/pEcgRNA",
        la_len_bp=515,
        ra_len_bp=515,
        la_conc_ng_ul=480.0,
        ra_conc_ng_ul=520.0,
        vector_backbone_conc_ng_ul=350.0,
        oe_pcr_ratio_mode="molar_ratio",
        oe_pcr_target_pmol_each=0.05,
    )
    proto = calculate_wetlab_protocol(req)
    alerts = [
        comp.dilution_alert
        for rxn in proto.reactions
        for comp in rxn.components
        if comp.dilution_alert
    ]
    assert len(alerts) >= 3
    assert any("1:10" in a or "1:20" in a or "1:5" in a for a in alerts)
    # Every actual pipetted DNA volume after dilution must now be safely >= 0.5 uL!
    for rxn in proto.reactions:
        for comp in rxn.components:
            if comp.dilution_alert:
                assert comp.volume_ul >= 0.5


def test_volume_ratio_mode_imbalance_warning() -> None:
    req = PipettingCalcRequest(
        plasmid_system="pCas/pTargetF",
        la_conc_ng_ul=220.0,
        ra_conc_ng_ul=20.0,
        oe_pcr_ratio_mode="volume_ratio",
        volume_ratio_la_ul=2.0,
        volume_ratio_ra_ul=1.0,
    )
    proto = calculate_wetlab_protocol(req)
    oe_rxn = proto.reactions[2]
    assert any(c.dilution_alert and "摩尔比失衡" in c.dilution_alert for c in oe_rxn.components)


def test_all_exporters_roundtrip_valid() -> None:
    design = run_knockout_pipeline(
        KnockoutRequest(accession="NC_000913.3", gene_name="gldA", use_llm_agent=False),
        client_id="pytest-export",
    )

    # 1. All 4 GenBank maps must parse cleanly back through Biopython SeqIO
    for fmt in ("gb_wt", "gb_ko", "gb_donor", "gb_plasmid"):
        raw, mime, fname = export_artifact(design, fmt)
        assert fname.endswith(".gb")
        rec = SeqIO.read(io.StringIO(raw.decode("utf-8")), "genbank")
        assert len(rec.seq) > 80
        assert len(rec.features) >= 3

    # 2. Excel primer order sheet must load cleanly with openpyxl
    xlsx_bytes, _, fname = export_artifact(design, "primers_xlsx")
    assert fname.endswith(".xlsx")
    wb = load_workbook(io.BytesIO(xlsx_bytes))
    assert "引物订购单" in wb.sheetnames
    assert "零信任验证摘要" in wb.sheetnames
    assert wb["引物订购单"].max_row == len(design.all_primers) + 1

    # 3. Markdown SOP & ZIP bundle
    sop_bytes, _, _ = export_artifact(design, "sop_md")
    assert "CRISPR-Forge" in sop_bytes.decode("utf-8")

    zip_bytes, _, _ = export_artifact(design, "bundle_zip")
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        names = zf.namelist()
        assert len(names) == 7
        assert any(n.endswith("_primers_order.xlsx") for n in names)
        assert any(n.endswith("_KO_edited_locus.gb") for n in names)


def test_quota_manager_daily_limit_and_byok_bypass(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(settings, "llm_api_key", "sk-test-admin-key")
    monkeypatch.setattr(settings, "free_trial_daily_limit", 2)

    qm = QuotaManager(db_path=tmp_path / "quota.json")
    s0 = qm.get_status("vis:alice")
    assert s0.free_trial_enabled is True
    assert s0.remaining_today == 2

    ok1, s1 = qm.try_consume_trial("vis:alice")
    ok2, s2 = qm.try_consume_trial("vis:alice")
    ok3, s3 = qm.try_consume_trial("vis:alice")
    assert (ok1, ok2, ok3) == (True, True, False)
    assert s3.remaining_today == 0

    # BYOK must still show active regardless of exhausted trial quota
    s_byok = qm.get_status("vis:alice", byok_api_key="sk-user-own", byok_model="qwen-plus")
    assert s_byok.using_byok is True
    assert s_byok.active_model == "qwen-plus"


def test_15_polymerase_library_and_custom_polymerase_calculation() -> None:
    catalog = list_polymerase_catalog()
    assert len(catalog) == 15

    # Test built-in Phusion (Tm + 3°C)
    req_phusion = PipettingCalcRequest(
        polymerase="Phusion High-Fidelity (NEB)",
        la_anneal_tm=60.0,
        ra_anneal_tm=60.0,
    )
    proto_phusion = calculate_wetlab_protocol(req_phusion)
    assert proto_phusion.polymerase == "Phusion High-Fidelity (NEB)"
    assert any("63.0°C" in line for line in proto_phusion.reactions[1].thermocycler_program)

    # Test completely custom lab polymerase
    custom_poly = CustomPolymeraseConfig(
        name="LabSuperPfu-X",
        vendor="In-House Lab",
        mix_name="2x LabSuperPfu-X Mix",
        extension_sec_per_kb=10,
        denature_c=97.0,
        ext_c=68.0,
        anneal_offset_c=0.0,
    )
    req_custom = PipettingCalcRequest(
        polymerase="custom",
        custom_polymerase=custom_poly,
        la_len_bp=2000,
        ra_len_bp=2000,
        la_anneal_tm=61.0,
        ra_anneal_tm=61.0,
    )
    proto_custom = calculate_wetlab_protocol(req_custom)
    assert proto_custom.polymerase == "LabSuperPfu-X"
    arm_rxn = proto_custom.reactions[1]
    assert arm_rxn.components[0].reagent == "2x LabSuperPfu-X Mix"
    assert any("68.0°C 20 s" in line for line in arm_rxn.thermocycler_program)
