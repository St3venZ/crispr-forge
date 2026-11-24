"""Standard Model Context Protocol (MCP) Server for CRISPR-Forge.

Exposes all deterministic prokaryotic CRISPR design, 12-point zero-trust in-silico verification,
dynamic wet-lab pipetting calculation, and SnapGene/Excel export tools to Claude Desktop,
Cursor, Antigravity, or any MCP-compatible AI client.

Run via:
    python -m crispr_forge.agent.mcp_server
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Optional

try:
    from mcp.server.mcpserver import MCPServer as FastMCP
except ImportError:
    from mcp.server.fastmcp import FastMCP  # type: ignore[no-redef]

from crispr_forge.agent.orchestrator import run_knockout_pipeline
from crispr_forge.agent.tools import (
    tool_analyze_locus,
    tool_calculate_wetlab,
    tool_list_catalog,
    tool_verify_design,
)
from crispr_forge.models import (
    CustomPlasmidConfig,
    DeletionMode,
    DesignResponse,
    DonorDesign,
    DonorMethod,
    KnockoutRequest,
    LocusInfo,
    PipettingCalcRequest,
    PlasmidSystemId,
    PolymeraseName,
    SgRNACandidate,
    VerificationPrimersDesign,
)
from crispr_forge.wetlab.exporters import export_artifact

mcp = FastMCP("CRISPR-Forge")


@mcp.tool()
def list_catalog() -> dict:
    """List verified multi-species prokaryotic presets, built-in plasmid systems, and polymerases."""
    return tool_list_catalog()


@mcp.tool()
def analyze_prokaryotic_locus(
    accession: str = "NC_000913.3",
    gene_name: str = "lacZ",
    deletion_mode: DeletionMode = "auto_safe",
) -> dict:
    """Fetch a real prokaryotic genomic locus and detect neighboring gene CDS overlaps and 5' RBS protection zones."""
    locus = tool_analyze_locus(accession=accession, gene_name=gene_name, deletion_mode=deletion_mode)
    return locus.model_dump()


@mcp.tool()
def design_and_verify_knockout(
    accession: str = "NC_000913.3",
    gene_name: str = "lacZ",
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA",
    homology_arm_length: int = 500,
    deletion_mode: DeletionMode = "auto_safe",
    donor_construction_method: DonorMethod = "oe_pcr",
    polymerase: PolymeraseName = "Phanta Max (Vazyme)",
) -> dict:
    """Run full Zero-Trust prokaryotic CRISPR/Cas9 knockout design, 12-point in-silico verification, and self-healing."""
    req = KnockoutRequest(
        accession=accession,
        gene_name=gene_name,
        plasmid_system=plasmid_system,
        homology_arm_length=homology_arm_length,
        deletion_mode=deletion_mode,
        donor_construction_method=donor_construction_method,
        polymerase=polymerase,
        use_llm_agent=False,
    )
    result = run_knockout_pipeline(req, client_id="mcp")
    return result.model_dump()


@mcp.tool()
def verify_custom_knockout_plan(
    locus_json: str,
    selected_sgrna_json: str,
    donor_json: str,
    verification_primers_json: str,
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA",
    min_band_diff_bp: int = 300,
) -> dict:
    """Execute the 12-Point Zero-Trust In Silico Verification Gate on any user/external knockout plan."""
    report = tool_verify_design(
        locus=LocusInfo.model_validate_json(locus_json),
        selected_sgrna=SgRNACandidate.model_validate_json(selected_sgrna_json),
        donor=DonorDesign.model_validate_json(donor_json),
        verification_primers=VerificationPrimersDesign.model_validate_json(verification_primers_json),
        plasmid_system=plasmid_system,
        min_band_diff_bp=min_band_diff_bp,
    )
    return report.model_dump()


@mcp.tool()
def calculate_wetlab_pipetting(
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA",
    la_len_bp: int = 515,
    ra_len_bp: int = 515,
    donor_len_bp: int = 1000,
    wt_amplicon_bp: int = 2400,
    ko_amplicon_bp: int = 1300,
    la_conc_ng_ul: float = 65.0,
    ra_conc_ng_ul: float = 58.0,
    donor_conc_ng_ul: float = 120.0,
    vector_backbone_conc_ng_ul: float = 45.0,
    sgrna_plasmid_conc_ng_ul: float = 150.0,
    oe_pcr_ratio_mode: str = "molar_ratio",
    polymerase: PolymeraseName = "Phanta Max (Vazyme)",
) -> dict:
    """Calculate exact bench pipetting volumes (uL) from measured NanoDrop concentrations, with < 0.5 uL auto-dilution alerts."""
    req = PipettingCalcRequest(
        plasmid_system=plasmid_system,
        la_len_bp=la_len_bp,
        ra_len_bp=ra_len_bp,
        donor_len_bp=donor_len_bp,
        wt_amplicon_bp=wt_amplicon_bp,
        ko_amplicon_bp=ko_amplicon_bp,
        la_conc_ng_ul=la_conc_ng_ul,
        ra_conc_ng_ul=ra_conc_ng_ul,
        donor_conc_ng_ul=donor_conc_ng_ul,
        vector_backbone_conc_ng_ul=vector_backbone_conc_ng_ul,
        sgrna_plasmid_conc_ng_ul=sgrna_plasmid_conc_ng_ul,
        oe_pcr_ratio_mode="volume_ratio" if oe_pcr_ratio_mode == "volume_ratio" else "molar_ratio",
        polymerase=polymerase,
    )
    return tool_calculate_wetlab(req).model_dump()


@mcp.tool()
def export_bench_package(design_json: str, output_dir: str) -> dict:
    """Write SnapGene .gb maps, Sangon/Tsingke .xlsx primer order sheet, Markdown SOP, and ZIP archive to `output_dir`."""
    design = DesignResponse.model_validate(json.loads(design_json))
    out = Path(output_dir)
    out.mkdir(parents=True, exist_ok=True)
    written: list[str] = []
    for fmt in ("gb_wt", "gb_ko", "gb_donor", "gb_plasmid", "primers_xlsx", "sop_md", "bundle_zip"):
        data, _, fname = export_artifact(design, fmt)
        fpath = out / fname
        fpath.write_bytes(data)
        written.append(str(fpath))
    return {"output_dir": str(out), "files": written}


if __name__ == "__main__":
    mcp.run()
