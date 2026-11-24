"""FastAPI Backend serving REST endpoints, real-time SSE audit streams, Quota Gate, and Binary Exporters."""

from __future__ import annotations

import asyncio
import json
from typing import Optional

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse

from crispr_forge import __version__
from crispr_forge.agent.orchestrator import run_knockout_pipeline
from crispr_forge.agent.quota import quota_manager
from crispr_forge.agent.tools import (
    tool_calculate_wetlab,
    tool_collect_all_primers,
    tool_list_catalog,
    tool_verify_design,
)
from crispr_forge.config import settings
from crispr_forge.genome.ncbi_client import search_prokaryotic_strains
from crispr_forge.genome.offtarget_index import (
    is_whole_genome_index_available,
    list_cached_whole_genomes,
)
from crispr_forge.models import (
    AuditStep,
    DesignResponse,
    KnockoutRequest,
    PipettingCalcRequest,
    PlasmidParseRequest,
    PlasmidParseResponse,
    QuotaStatus,
    StrainSearchItem,
    VerifyCustomRequest,
    WetLabProtocol,
    ZeroTrustVerificationReport,
)
from crispr_forge.plasmid_parser import parse_empty_vector_genbank
from crispr_forge.wetlab.exporters import export_artifact

app = FastAPI(
    title="CRISPR-Forge API",
    version=__version__,
    description="Zero-Trust Prokaryotic CRISPR/Cas9 Automated Design, In Silico Verification & Wet-Lab Execution API",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _client_id(request: Request, x_visitor_id: Optional[str] = None) -> str:
    if x_visitor_id and x_visitor_id.strip():
        return f"vis:{x_visitor_id.strip()[:48]}"
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return f"ip:{forwarded.split(',')[0].strip()}"
    host = request.client.host if request.client else "unknown"
    return f"ip:{host}"


@app.get("/api/health")
def health_check() -> dict:
    cached = list_cached_whole_genomes()
    return {
        "status": "ok",
        "version": __version__,
        "llm_admin_configured": bool(settings.llm_api_key and settings.llm_api_key.strip()),
        "free_trial_daily_limit": settings.free_trial_daily_limit,
        "default_model": settings.llm_model,
        "whole_genome_index_ready": len(cached) > 0,
        "cached_whole_genomes": cached,
        "auto_fetch_whole_genome_supported": True,
    }


@app.get("/api/quota", response_model=QuotaStatus)
def get_quota(
    request: Request,
    x_visitor_id: Optional[str] = Header(default=None),
    x_byok_active: Optional[str] = Header(default=None),
    x_byok_model: Optional[str] = Header(default=None),
) -> QuotaStatus:
    cid = _client_id(request, x_visitor_id)
    return quota_manager.get_status(
        client_id=cid,
        byok_api_key="byok" if x_byok_active == "1" else None,
        byok_model=x_byok_model,
    )


@app.get("/api/catalog")
def get_catalog() -> dict:
    return tool_list_catalog()


@app.get("/api/presets")
def get_presets() -> list[dict]:
    return tool_list_catalog()["presets"]


@app.get("/api/genome/search", response_model=list[StrainSearchItem])
def search_strains(q: str = "", limit: int = 8) -> list[StrainSearchItem]:
    """Fuzzy search prokaryotic RefSeq chromosomes (curated multi-species + live NCBI Entrez)."""
    items = search_prokaryotic_strains(query=q, limit=min(max(limit, 1), 15))
    return [StrainSearchItem(**it) for it in items]


@app.post("/api/plasmids/parse", response_model=PlasmidParseResponse)
def parse_plasmid(req: PlasmidParseRequest) -> PlasmidParseResponse:
    """Auto-parse an uploaded empty vector GenBank (.gb/.gbk) to extract overhangs, markers & backbone primers."""
    try:
        return parse_empty_vector_genbank(req.genbank_content, filename=req.filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/design", response_model=DesignResponse)
def run_design(
    req: KnockoutRequest,
    request: Request,
    x_visitor_id: Optional[str] = Header(default=None),
) -> DesignResponse:
    cid = _client_id(request, x_visitor_id)
    try:
        return run_knockout_pipeline(req, client_id=cid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"设计引擎执行异常: {exc}") from exc


@app.post("/api/design/stream")
async def run_design_stream(
    req: KnockoutRequest,
    request: Request,
    x_visitor_id: Optional[str] = Header(default=None),
) -> StreamingResponse:
    """Server-Sent Events endpoint pushing live AuditSteps and the final DesignResponse."""
    cid = _client_id(request, x_visitor_id)
    queue: asyncio.Queue[tuple[str, dict]] = asyncio.Queue()
    loop = asyncio.get_running_loop()

    def on_step(step: AuditStep) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, ("step", step.model_dump()))

    def worker() -> None:
        try:
            result = run_knockout_pipeline(req, client_id=cid, on_step=on_step)
            loop.call_soon_threadsafe(queue.put_nowait, ("result", result.model_dump()))
        except Exception as exc:
            loop.call_soon_threadsafe(queue.put_nowait, ("error", {"message": str(exc)}))
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, ("done", {}))

    async def event_generator():
        task = asyncio.create_task(asyncio.to_thread(worker))
        try:
            while True:
                event_type, payload = await queue.get()
                if event_type == "done":
                    break
                data_str = json.dumps(payload, ensure_ascii=False)
                yield f"event: {event_type}\ndata: {data_str}\n\n"
        finally:
            await task

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/verify")
def verify_custom(req: VerifyCustomRequest) -> dict:
    """Re-run the 12-Point Zero-Trust Gate (e.g. when the user switches to an alternative sgRNA in UI)."""
    try:
        report: ZeroTrustVerificationReport = tool_verify_design(
            locus=req.locus,
            selected_sgrna=req.selected_sgrna,
            donor=req.donor,
            verification_primers=req.verification_primers,
            plasmid_system=req.plasmid_system,
            custom_plasmid=req.custom_plasmid,
            min_band_diff_bp=req.min_band_diff_bp,
        )
        updated_primers = tool_collect_all_primers(
            locus=req.locus,
            selected_sgrna=req.selected_sgrna,
            donor=req.donor,
            verification_primers=req.verification_primers,
            plasmid_system=req.plasmid_system,
            custom_plasmid=req.custom_plasmid,
        )
        return {
            "verification_report": report.model_dump(),
            "all_primers": [p.model_dump() for p in updated_primers],
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/wetlab/calculate", response_model=WetLabProtocol)
def calculate_wetlab(req: PipettingCalcRequest) -> WetLabProtocol:
    try:
        return tool_calculate_wetlab(req)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/export/{fmt}")
def export_file(fmt: str, design: DesignResponse) -> Response:
    try:
        data, media_type, filename = export_artifact(design, fmt)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )
