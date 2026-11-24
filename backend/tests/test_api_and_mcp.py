"""Integration tests for FastAPI REST + SSE handlers and FastMCP Server tools."""

from __future__ import annotations

from starlette.requests import Request

from crispr_forge.agent.mcp_server import (
    analyze_prokaryotic_locus,
    calculate_wetlab_pipetting,
    design_and_verify_knockout,
    list_catalog,
    mcp,
)
from crispr_forge.api.main import (
    app,
    calculate_wetlab,
    export_file,
    get_catalog,
    get_quota,
    health_check,
    parse_plasmid,
    run_design,
    search_strains,
    verify_custom,
)
from crispr_forge.models import (
    KnockoutRequest,
    PipettingCalcRequest,
    PlasmidParseRequest,
    VerifyCustomRequest,
)


def _dummy_request(path: str = "/api/test") -> Request:
    scope = {
        "type": "http",
        "method": "POST",
        "path": path,
        "headers": [],
        "client": ("127.0.0.1", 12345),
    }
    return Request(scope)


def test_fastapi_routes_registered_and_health_catalog() -> None:
    paths = {r.path for r in app.routes}
    for expected in (
        "/api/health",
        "/api/quota",
        "/api/catalog",
        "/api/design",
        "/api/design/stream",
        "/api/verify",
        "/api/wetlab/calculate",
        "/api/export/{fmt}",
    ):
        assert expected in paths

    h = health_check()
    assert h["status"] == "ok"
    assert h["whole_genome_index_ready"] is True

    q = get_quota(_dummy_request("/api/quota"), x_visitor_id="pytest-vis")
    assert q.remaining_today >= 0

    cat = get_catalog()
    assert len(cat["presets"]) == 6
    assert len(cat["plasmid_systems"]) == 4
    assert len(cat["polymerases"]) == 15
    assert "cached_whole_genomes" in cat


def test_fastapi_design_verify_calculate_export() -> None:
    req = KnockoutRequest(
        accession="NC_000913.3",
        gene_name="lacZ",
        plasmid_system="pCas/pTargetF",
        use_llm_agent=False,
    )
    design = run_design(req, _dummy_request("/api/design"), x_visitor_id="pytest-vis")
    assert design.verification_report.fail_count == 0
    assert len(design.alternative_sgrnas) >= 1

    # Switch to alternative sgRNA and re-verify via /api/verify
    alt_sg = design.alternative_sgrnas[0]
    ver_res = verify_custom(
        VerifyCustomRequest(
            locus=design.locus,
            selected_sgrna=alt_sg,
            donor=design.donor,
            verification_primers=design.verification_primers,
            plasmid_system=design.plasmid_system,
        )
    )
    assert ver_res["verification_report"]["total_checks"] == 12

    # Recalculate wetlab with ultra-high concentration to confirm dilution alert
    wet = calculate_wetlab(
        PipettingCalcRequest(
            plasmid_system="pCas/pTargetF",
            la_conc_ng_ul=500.0,
            ra_conc_ng_ul=500.0,
        )
    )
    assert len(wet.reactions) == 5

    # Export ZIP bundle
    resp = export_file("bundle_zip", design)
    assert resp.media_type == "application/zip"
    assert len(resp.body) > 2000


def test_mcp_server_tools_callable() -> None:
    cat = list_catalog()
    assert len(cat["presets"]) == 6

    loc = analyze_prokaryotic_locus("NC_000913.3", "ackA", "auto_safe")
    assert loc["gene_name"] == "ackA"

    des = design_and_verify_knockout("NC_000964.3", "amyE", "pJOE8999")
    assert des["verification_report"]["fail_count"] == 0

    wet = calculate_wetlab_pipetting(la_conc_ng_ul=450.0)
    assert len(wet["reactions"]) == 5
    assert mcp.name == "CRISPR-Forge"


def test_empty_vector_gb_auto_parser_and_strain_search() -> None:
    import io
    from Bio import SeqIO
    from Bio.Seq import Seq
    from Bio.SeqFeature import FeatureLocation, SeqFeature
    from Bio.SeqRecord import SeqRecord
    from crispr_forge.plasmids import SPCAS9_GRNA_SCAFFOLD

    # Build a synthetic empty Golden Gate BsaI vector with TACG / AAAC overhangs and KanR CDS
    up_backbone = ("ATGCGTACCTGGAATCGGCT" * 16)  # 320 bp
    # Promoter ending in TACG + 1nt spacer + GAGACC (BsaI bottom) + stuffer + GGTCTC (BsaI top) + 1nt + GTTT...scaffold
    stuffer = "CTAG" * 25
    down_backbone = ("CGTACGTTAACCGGATTAGC" * 16)  # 320 bp
    vec_seq = (
        up_backbone
        + "TTGACAGCTAGCTCAGTCCTAGGTATAATACG"
        + "A"
        + "GAGACC"
        + stuffer
        + "GGTCTC"
        + "A"
        + SPCAS9_GRNA_SCAFFOLD
        + "TTTTTTT"
        + down_backbone
    )
    rec = SeqRecord(
        Seq(vec_seq),
        id="pLabTest_BsaI",
        name="pLabTest_BsaI",
        annotations={"molecule_type": "DNA"},
    )
    rec.features.append(
        SeqFeature(
            FeatureLocation(20, 260, strand=1),
            type="CDS",
            qualifiers={"gene": ["kanR"], "product": ["Kanamycin resistance protein"]},
        )
    )
    buf = io.StringIO()
    SeqIO.write(rec, buf, "genbank")

    parsed = parse_plasmid(PlasmidParseRequest(genbank_content=buf.getvalue(), filename="pLabTest_BsaI.gb"))
    assert parsed.confidence == "high"
    assert parsed.config.cloning_method == "golden_gate_oligo"
    assert parsed.config.restriction_enzyme == "BsaI"
    assert parsed.config.overhang_forward == "TACG"
    assert parsed.config.overhang_reverse == "AAAC"
    assert "Kanamycin" in parsed.config.antibiotics
    assert parsed.config.colony_pcr_backbone_f is not None

    # Test fuzzy strain search (Chinese + English)
    res_cn = search_strains(q="假单胞", limit=5)
    assert any(item.accession == "AE015451.2" for item in res_cn)
    res_ec = search_strains(q="MG1655", limit=5)
    assert any(item.accession == "NC_000913.3" and item.is_cached for item in res_ec)
