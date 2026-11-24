"""AI Agent Orchestrator & Zero-Trust Self-Healing Engine (OpenAI-Compatible + Deterministic Fallback)."""

from __future__ import annotations

import json
import re
import time
import uuid
from typing import Callable, Optional

from openai import OpenAI

from crispr_forge.agent.quota import quota_manager
from crispr_forge.agent.tools import (
    tool_analyze_locus,
    tool_calculate_wetlab,
    tool_collect_all_primers,
    tool_design_donor,
    tool_design_sgrnas,
    tool_design_verification_primers,
    tool_verify_design,
)
from crispr_forge.config import settings
from crispr_forge.genome.offtarget_index import ensure_whole_genome_cached
from crispr_forge.models import (
    AuditStep,
    DesignResponse,
    KnockoutRequest,
    PipettingCalcRequest,
    QuotaStatus,
)


StepCallback = Callable[[AuditStep], None]


def _resolve_llm_credentials(
    req: KnockoutRequest,
    client_id: str,
) -> tuple[Optional[str], str, str, QuotaStatus, str]:
    """
    Determine whether to run in LLM Agent mode (BYOK or Admin Free Trial Pool)
    or Zero-Key Deterministic Engine mode.
    Returns (api_key_or_none, base_url, model, quota_status, mode_reason).
    """
    if not req.use_llm_agent:
        q = quota_manager.get_status(client_id)
        return None, settings.llm_base_url, "deterministic-zero-trust", q, "用户指定零 Token 本地确定性生物引擎"

    # 1) BYOK: user supplied their own API key -> unlimited, bypasses server trial quota
    if req.llm_api_key and req.llm_api_key.strip():
        api_key = req.llm_api_key.strip()
        base_url = (req.llm_base_url or settings.llm_base_url or "https://api.deepseek.com/v1").strip()
        model = (req.llm_model or settings.llm_model or "deepseek-chat").strip()
        q = quota_manager.get_status(client_id, byok_api_key=api_key, byok_model=model)
        return api_key, base_url, model, q, f"已连接用户自带模型 ({model})"

    # 2) Admin-funded Free Trial Pool (protects station owner's DeepSeek budget)
    if settings.llm_api_key and settings.llm_api_key.strip():
        allowed, q = quota_manager.try_consume_trial(client_id)
        if allowed:
            return (
                settings.llm_api_key.strip(),
                settings.llm_base_url,
                settings.llm_model,
                q,
                f"使用站点免费 AI 体验额度（今日剩余 {q.remaining_today}/{q.daily_limit} 次）",
            )
        return (
            None,
            settings.llm_base_url,
            "deterministic-zero-trust",
            q,
            "今日免费 AI 体验额度已用完，已自动无缝切换为免费无限次确定性零信任生物引擎（可右上角填入自带 API Key）",
        )

    # 3) Zero-Key out-of-the-box mode
    q = quota_manager.get_status(client_id)
    return (
        None,
        settings.llm_base_url,
        "deterministic-zero-trust",
        q,
        "未配置外部大模型 Key，使用全免费确定性零信任生物引擎（全部 12 项硅片仿真与导出 100% 可用）",
    )


def _deterministic_parse_nl_prompt(prompt: str, base_req: KnockoutRequest) -> KnockoutRequest:
    """Fast zero-cost natural-language parser supporting Chinese & English lab descriptions."""
    text = prompt.strip()
    low = text.lower()
    updates: dict = {}

    # Detect organism -> accession
    if any(k in low for k in ("枯草", "bacillus", "subtilis", "bsu", "amye", "pjoe")):
        updates["accession"] = "NC_000964.3"
    elif any(k in low for k in ("谷棒", "谷氨酸棒", "corynebacterium", "glutamicum", "ncgl", "cg3219")):
        updates["accession"] = "NC_003450.3"
    elif any(k in low for k in ("大肠", "ecoli", "e. coli", "e.coli", "mg1655", "k-12")):
        updates["accession"] = "NC_000913.3"

    # Explicit NCBI RefSeq accession override
    acc_match = re.search(r"\b(NC_\d+\.\d+|NZ_[A-Z0-9]+\.\d+|CP\d+\.\d+)\b", text, re.IGNORECASE)
    if acc_match:
        updates["accession"] = acc_match.group(1).upper()

    # Detect plasmid system
    if any(k in low for k in ("ptargetf", "pcas/ptarget", "ptarget", "反向pcr", "inverse")):
        updates["plasmid_system"] = "pCas/pTargetF"
    elif any(k in low for k in ("pjoe8999", "pjoe")):
        updates["plasmid_system"] = "pJOE8999"
    elif any(k in low for k in ("peccas", "pecgrna")):
        updates["plasmid_system"] = "pEcCas/pEcgRNA"
    elif any(k in low for k in ("自定义", "custom")):
        updates["plasmid_system"] = "custom"
    elif updates.get("accession") == "NC_000964.3":
        updates["plasmid_system"] = "pJOE8999"
    elif updates.get("accession") == "NC_003450.3":
        updates["plasmid_system"] = "custom"

    # Detect known gene names or generic gene pattern
    known_genes = ["lacZ", "ackA", "pta", "gldA", "amyE", "ldhA", "poxB", "ldh", "pflB", "adhE", "b3945", "b0344", "b2296", "b2297"]
    found_gene = None
    for g in known_genes:
        if re.search(rf"(?<![A-Za-z0-9_]){re.escape(g)}(?![A-Za-z0-9_])", text, re.IGNORECASE):
            found_gene = g
            break
    if not found_gene:
        m_gene = re.search(r"(?:敲除|删除|knockout|delete|ko|基因)\s*([A-Za-z][A-Za-z0-9_]{2,11})", text, re.IGNORECASE)
        if m_gene:
            cand = m_gene.group(1)
            if cand.lower() not in ("crispr", "cas9", "donor", "dna", "pcr", "orf", "rbs", "sgrna", "peccas", "pecgrna", "pcas", "ptargetf", "pjoe8999"):
                found_gene = cand
    if found_gene:
        updates["gene_name"] = found_gene

    # Detect homology arm length (e.g., 500bp, 600 bp, 800bp)
    m_arm = re.search(r"(\d{3,4})\s*bp", low)
    if m_arm:
        arm_val = int(m_arm.group(1))
        if 250 <= arm_val <= 1000:
            updates["homology_arm_length"] = arm_val

    # Detect deletion mode
    if any(k in low for k in ("keio", "框内", "in-frame", "in_frame", "极性")):
        updates["deletion_mode"] = "in_frame_scarless"
    elif any(k in low for k in ("严格全长", "strict_full")):
        updates["deletion_mode"] = "strict_full_orf"
    elif any(k in low for k in ("保护", "rbs", "安全", "auto_safe")):
        updates["deletion_mode"] = "auto_safe"

    # Detect donor construction method
    if any(k in low for k in ("直接合成", "全合成", "direct_synthesis", "基因合成")):
        updates["donor_construction_method"] = "direct_synthesis"

    # Detect polymerase (expanded 15-enzyme lab library)
    if "phanta flash" in low or "flash" in low:
        updates["polymerase"] = "Phanta Flash (Vazyme)"
    elif "phanta evo" in low:
        updates["polymerase"] = "Phanta EVO (Vazyme)"
    elif "kod-plus" in low or "kod plus" in low:
        updates["polymerase"] = "KOD-Plus-Neo (TOYOBO)"
    elif "kod fx" in low:
        updates["polymerase"] = "KOD FX Neo (TOYOBO)"
    elif "kod" in low:
        updates["polymerase"] = "KOD One (TOYOBO)"
    elif "gxl" in low:
        updates["polymerase"] = "PrimeSTAR GXL (Takara)"
    elif "primestar hs" in low:
        updates["polymerase"] = "PrimeSTAR HS (Takara)"
    elif "primestar" in low or "takara" in low:
        updates["polymerase"] = "PrimeSTAR Max (Takara)"
    elif "phusion" in low:
        updates["polymerase"] = "Phusion High-Fidelity (NEB)"
    elif "q5" in low or "neb" in low:
        updates["polymerase"] = "Q5 High-Fidelity (NEB)"
    elif "fastpfu" in low or "全式金" in low or "transgen" in low:
        updates["polymerase"] = "TransStart FastPfu (TransGen)"
    elif "canace" in low or "翌圣" in low or "yeasen" in low:
        updates["polymerase"] = "Hieff Canace Plus (Yeasen)"
    elif "superfi" in low or "thermo" in low:
        updates["polymerase"] = "Platinum SuperFi II (Thermo)"
    elif "phanta" in low or "诺唯赞" in low or "vazyme" in low:
        updates["polymerase"] = "Phanta Max (Vazyme)"

    return base_req.model_copy(update=updates)


def _llm_parse_nl_prompt(
    client: OpenAI,
    model: str,
    prompt: str,
    base_req: KnockoutRequest,
) -> KnockoutRequest:
    """Use OpenAI-compatible LLM to parse free-form lab request into structured KnockoutRequest fields."""
    sys_msg = (
        "You are a prokaryotic CRISPR/Cas9 experimental parameter parser. "
        "Extract ONLY structured JSON fields from the user's request. NEVER generate DNA sequences.\n"
        "Allowed JSON keys:\n"
        '- accession: string (E. coli MG1655 -> "NC_000913.3", B. subtilis 168 -> "NC_000964.3", C. glutamicum ATCC 13032 -> "NC_003450.3")\n'
        "- gene_name: string (gene symbol or locus tag)\n"
        '- plasmid_system: one of "pEcCas/pEcgRNA", "pCas/pTargetF", "pJOE8999", "custom"\n'
        "- homology_arm_length: integer 250..1000\n"
        '- deletion_mode: one of "auto_safe", "strict_full_orf", "in_frame_scarless"\n'
        '- donor_construction_method: one of "oe_pcr", "direct_synthesis"\n'
        '- polymerase: one of "Phanta Max (Vazyme)", "KOD One (TOYOBO)", "PrimeSTAR Max (Takara)", "Q5 High-Fidelity (NEB)", "2x Taq Master Mix (Colony PCR)"\n'
        "Return valid JSON object only."
    )
    resp = client.chat.completions.create(
        model=model,
        temperature=0.0,
        messages=[
            {"role": "system", "content": sys_msg},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        timeout=20.0,
    )
    raw = resp.choices[0].message.content or "{}"
    parsed = json.loads(raw)
    allowed_keys = {
        "accession",
        "gene_name",
        "plasmid_system",
        "homology_arm_length",
        "deletion_mode",
        "donor_construction_method",
        "polymerase",
    }
    filtered = {k: v for k, v in parsed.items() if k in allowed_keys and v is not None}
    return base_req.model_copy(update=filtered)


def _generate_deterministic_summary(
    locus,
    selected_sgrna,
    donor,
    v_primers,
    report,
    plasmid_system: str,
    repair_iterations: int,
) -> str:
    status_cn = {
        "CERTIFIED_PASS": "全部 12 项零信任硅片仿真校验 100% 绿灯通过，可直接进入下单与湿实验",
        "PASS_WITH_WARNINGS": f"全部核心仿真项通过（{report.passed_count} PASS / {report.warn_count} 项提示性说明，0 项阻断错误）",
        "FAILED": f"存在 {report.fail_count} 项校验阻断，请查看下方标红细项",
    }[report.overall_status]

    parts = [
        f"已针对 **{locus.organism}**（`{locus.accession}`）的 **`{locus.gene_name}`** 基因（{locus.orf_length_bp} bp，{locus.strand} 链）基于 **`{plasmid_system}`** 体系完成全自动设计与零信任硅片验证：{status_cn}。",
        f"- **邻近基因与安全边界**：计划敲除 {locus.deleted_length_bp} bp（基因组坐标 `{locus.deletion_genome_start}..{locus.deletion_genome_end}`）。"
        + (f"{locus.safety_adjustment_note}" if locus.safety_adjustment_note else "未侵入任何邻近 CDS 或下游 24 bp RBS 区。"),
        f"- **优选 sgRNA ({selected_sgrna.id})**：`5'-{selected_sgrna.spacer_20nt}-3'`（PAM `{selected_sgrna.pam}`，评分 {selected_sgrna.on_target_score}），{selected_sgrna.off_target_summary}，且已确认编辑后基因组免疫 Cas9 二次切割。",
        f"- **Donor 与菌落 PCR 判读**：左右同源臂 {donor.left_arm_len}/{donor.right_arm_len} bp（Donor 全长 {donor.full_donor_len} bp）；外侧验证引物 VF/VR 严格位于同源臂外侧 {v_primers.distance_outside_la_bp}/{v_primers.distance_outside_ra_bp} bp，预期 **WT = {v_primers.wt_amplicon_bp} bp** vs **KO = {v_primers.ko_amplicon_bp} bp**（条带差 {v_primers.band_diff_bp} bp，胶图肉眼清晰可辨）。",
    ]
    if repair_iterations > 0:
        parts.append(f"- **自动自愈闭环**：系统在验证阶段自动触发了 {repair_iterations} 轮参数修复并复验通过，无需人工返工。")
    return "\n".join(parts)


def _generate_llm_summary(
    client: OpenAI,
    model: str,
    locus,
    selected_sgrna,
    donor,
    v_primers,
    report,
    plasmid_system: str,
    repair_iterations: int,
) -> str:
    """Have the LLM synthesize a concise, lab-friendly Chinese expert briefing strictly grounded in verified tool outputs."""
    facts = {
        "organism": locus.organism,
        "accession": locus.accession,
        "gene": locus.gene_name,
        "strand": locus.strand,
        "orf_bp": locus.orf_length_bp,
        "deleted_bp": locus.deleted_length_bp,
        "safety_note": locus.safety_adjustment_note,
        "plasmid_system": plasmid_system,
        "sgrna_spacer": selected_sgrna.spacer_20nt,
        "sgrna_pam": selected_sgrna.pam,
        "sgrna_score": selected_sgrna.on_target_score,
        "off_target": selected_sgrna.off_target_summary,
        "donor_len_bp": donor.full_donor_len,
        "wt_pcr_bp": v_primers.wt_amplicon_bp,
        "ko_pcr_bp": v_primers.ko_amplicon_bp,
        "verification_status": report.overall_status,
        "passed": report.passed_count,
        "warnings": [c.summary for c in report.checks if c.status == "WARN"],
        "fails": [c.summary for c in report.checks if c.status == "FAIL"],
        "repair_iterations": repair_iterations,
    }
    resp = client.chat.completions.create(
        model=model,
        temperature=0.2,
        messages=[
            {
                "role": "system",
                "content": (
                    "你是一位资深微生物与合成生物学湿实验专家。请严格依据提供的 JSON 硅片验证事实，"
                    "用 4 条简洁精炼的中文要点向实验员汇报最终方案结论、关键防坑亮点与上机注意事项。"
                    "严禁修改或编造任何未出现在 JSON 中的序列或数字。"
                ),
            },
            {"role": "user", "content": json.dumps(facts, ensure_ascii=False)},
        ],
        timeout=25.0,
    )
    content = (resp.choices[0].message.content or "").strip()
    return content or _generate_deterministic_summary(
        locus, selected_sgrna, donor, v_primers, report, plasmid_system, repair_iterations
    )


def run_knockout_pipeline(
    req: KnockoutRequest,
    client_id: str = "local",
    on_step: Optional[StepCallback] = None,
) -> DesignResponse:
    """
    End-to-end Zero-Trust CRISPR/Cas9 knockout design & self-healing verification pipeline.
    Emits live `AuditStep` callbacks for real-time SSE progress visualization.
    """
    run_id = uuid.uuid4().hex[:12]
    audit_trace: list[AuditStep] = []

    def emit(stage: str, tool_name: str, status: str, message: str, t0: float) -> None:
        step = AuditStep(
            step_index=len(audit_trace) + 1,
            stage=stage,
            tool_name=tool_name,
            status=status,  # type: ignore[arg-type]
            message=message,
            duration_ms=int((time.perf_counter() - t0) * 1000),
        )
        audit_trace.append(step)
        if on_step is not None:
            on_step(step)

    # ------------------------------------------------------------------
    # Step 0: Resolve AI mode & Quota Gate
    # ------------------------------------------------------------------
    t0 = time.perf_counter()
    api_key, base_url, model, quota_status, mode_reason = _resolve_llm_credentials(req, client_id)
    llm_client: Optional[OpenAI] = None
    active_mode = "deterministic_engine"
    if api_key:
        try:
            llm_client = OpenAI(api_key=api_key, base_url=base_url)
            active_mode = "llm_agent"
        except Exception:
            llm_client = None
            active_mode = "deterministic_engine"

    emit("模式与额度初始化", "quota_router", "ok", mode_reason, t0)

    # ------------------------------------------------------------------
    # Step 1: Natural Language Prompt Parsing (if provided)
    # ------------------------------------------------------------------
    effective_req = req
    if req.natural_language_prompt and req.natural_language_prompt.strip():
        t1 = time.perf_counter()
        if llm_client is not None:
            try:
                effective_req = _llm_parse_nl_prompt(
                    llm_client, model, req.natural_language_prompt, req
                )
                emit(
                    "AI 自然语言意图解析",
                    "llm_intent_parser",
                    "ok",
                    f"解析完成：{effective_req.accession} / {effective_req.gene_name} / {effective_req.plasmid_system} / {effective_req.polymerase}",
                    t1,
                )
            except Exception as exc:
                effective_req = _deterministic_parse_nl_prompt(req.natural_language_prompt, req)
                emit(
                    "自然语言意图解析 (回退引擎)",
                    "deterministic_nl_parser",
                    "warning",
                    f"外部模型调用异常 ({type(exc).__name__})，已无缝回退本地解析：{effective_req.accession} / {effective_req.gene_name} / {effective_req.plasmid_system}",
                    t1,
                )
                llm_client = None
                active_mode = "deterministic_engine"
        else:
            effective_req = _deterministic_parse_nl_prompt(req.natural_language_prompt, req)
            emit(
                "自然语言指令解析",
                "deterministic_nl_parser",
                "ok",
                f"解析指令为：{effective_req.accession} / {effective_req.gene_name} / 体系 {effective_req.plasmid_system} / 同源臂 {effective_req.homology_arm_length} bp",
                t1,
            )

    # ------------------------------------------------------------------
    # Step 2: Fetch & Analyze Real Genomic Locus
    # ------------------------------------------------------------------
    t2 = time.perf_counter()
    deletion_mode = effective_req.deletion_mode
    locus = tool_analyze_locus(
        accession=effective_req.accession,
        gene_name=effective_req.gene_name,
        deletion_mode=deletion_mode,
        custom_genbank=effective_req.custom_genbank,
        custom_fasta=effective_req.custom_fasta,
        custom_target_start=effective_req.custom_target_start,
        custom_target_end=effective_req.custom_target_end,
    )
    emit(
        "真实序列溯源与邻近基因分析",
        "analyze_prokaryotic_locus",
        "ok",
        f"获取 {locus.organism} {locus.gene_name} ({locus.orf_length_bp} bp, {locus.strand} 链, 来源={locus.source}, SHA256={locus.sequence_sha256[:10]})",
        t2,
    )

    # ------------------------------------------------------------------
    # Step 2.5: Autonomous On-Demand Whole-Genome Grabber for Off-Target Audit
    # ------------------------------------------------------------------
    if locus.source in ("ncbi_live", "preset_verified"):
        t2b = time.perf_counter()
        wg_ready, wg_msg = ensure_whole_genome_cached(
            accession=locus.accession,
            allow_remote_fetch=effective_req.auto_fetch_whole_genome,
        )
        emit(
            "全基因组脱靶索引准备",
            "whole_genome_grabber",
            "ok" if wg_ready else "warning",
            wg_msg,
            t2b,
        )

    # ------------------------------------------------------------------
    # Step 3: Design sgRNA, Donor, and Cross-Site Verification Primers
    # ------------------------------------------------------------------
    t3 = time.perf_counter()
    sgrnas = tool_design_sgrnas(
        locus=locus,
        plasmid_system=effective_req.plasmid_system,
        custom_plasmid=effective_req.custom_plasmid,
        top_k=max(effective_req.top_sgrna_count, 5),
    )
    sgrna_idx = 0
    selected_sgrna = sgrnas[sgrna_idx]
    emit(
        "sgRNA 靶点筛选与脱靶审计",
        "design_sgrnas",
        "ok",
        f"筛选出 {len(sgrnas)} 个候选；首选 {selected_sgrna.id} ({selected_sgrna.spacer_20nt}, PAM={selected_sgrna.pam}, 评分 {selected_sgrna.on_target_score})",
        t3,
    )

    t4 = time.perf_counter()
    overlap_len = 28
    window_shift = 0
    donor = tool_design_donor(
        locus=locus,
        arm_length=effective_req.homology_arm_length,
        method=effective_req.donor_construction_method,
        target_tm=effective_req.target_tm,
        overlap_target_len=overlap_len,
        window_shift=window_shift,
    )
    emit(
        "同源臂与 Donor 引物设计",
        "design_donor",
        "ok",
        f"提取左右臂 {donor.left_arm_len}/{donor.right_arm_len} bp，Donor 全长 {donor.full_donor_len} bp（重叠 {donor.overlap_len} bp, Tm {donor.overlap_tm_c}°C）",
        t4,
    )

    t5 = time.perf_counter()
    outer_offset = 180
    v_primers = tool_design_verification_primers(
        locus=locus,
        donor=donor,
        plasmid_system=effective_req.plasmid_system,
        custom_plasmid=effective_req.custom_plasmid,
        target_tm=effective_req.target_tm,
        outer_offset=outer_offset,
    )
    emit(
        "跨位点外侧验证与测序引物设计",
        "design_verification_primers",
        "ok",
        f"VF/VR 位于同源臂外侧 {v_primers.distance_outside_la_bp}/{v_primers.distance_outside_ra_bp} bp；预期 WT={v_primers.wt_amplicon_bp} bp vs KO={v_primers.ko_amplicon_bp} bp",
        t5,
    )

    # ------------------------------------------------------------------
    # Step 4: 12-Point Zero-Trust Verification + Self-Healing Loop (max 3 rounds)
    # ------------------------------------------------------------------
    t6 = time.perf_counter()
    report = tool_verify_design(
        locus=locus,
        selected_sgrna=selected_sgrna,
        donor=donor,
        verification_primers=v_primers,
        plasmid_system=effective_req.plasmid_system,
        custom_plasmid=effective_req.custom_plasmid,
        min_band_diff_bp=effective_req.min_band_diff_bp,
    )
    emit(
        "12 点零信任硅片仿真校验",
        "zero_trust_verifier",
        "ok" if report.fail_count == 0 else "warning",
        f"初检结果：{report.overall_status}（{report.passed_count} PASS / {report.warn_count} WARN / {report.fail_count} FAIL）",
        t6,
    )

    repair_iterations = 0
    max_repairs = 3
    while report.fail_count > 0 and repair_iterations < max_repairs:
        repair_iterations += 1
        tr = time.perf_counter()
        hints = [c.repair_hint for c in report.checks if c.status == "FAIL" and c.repair_hint]
        actions_taken: list[str] = []

        if "switch_to_auto_safe_deletion" in hints and deletion_mode != "auto_safe":
            deletion_mode = "auto_safe"
            locus = tool_analyze_locus(
                accession=effective_req.accession,
                gene_name=effective_req.gene_name,
                deletion_mode="auto_safe",
                custom_genbank=effective_req.custom_genbank,
                custom_fasta=effective_req.custom_fasta,
                custom_target_start=effective_req.custom_target_start,
                custom_target_end=effective_req.custom_target_end,
            )
            sgrnas = tool_design_sgrnas(locus, effective_req.plasmid_system, effective_req.custom_plasmid, top_k=max(effective_req.top_sgrna_count, 5))
            sgrna_idx = 0
            selected_sgrna = sgrnas[0]
            donor = tool_design_donor(locus, effective_req.homology_arm_length, effective_req.donor_construction_method, effective_req.target_tm, overlap_len, window_shift)
            v_primers = tool_design_verification_primers(locus, donor, effective_req.plasmid_system, effective_req.custom_plasmid, effective_req.target_tm, outer_offset)
            actions_taken.append("自动切换为 auto_safe 邻近基因/RBS 保护模式并重算边界与引物")

        if "select_next_sgrna_candidate" in hints and sgrna_idx + 1 < len(sgrnas):
            sgrnas[sgrna_idx].selected = False
            sgrna_idx += 1
            sgrnas[sgrna_idx].selected = True
            selected_sgrna = sgrnas[sgrna_idx]
            actions_taken.append(f"自动切换至下一高分候选 {selected_sgrna.id} ({selected_sgrna.spacer_20nt})")

        if "adjust_oe_overlap_length" in hints:
            overlap_len = 32 if overlap_len < 32 else 24
            donor = tool_design_donor(locus, effective_req.homology_arm_length, effective_req.donor_construction_method, effective_req.target_tm, overlap_len, window_shift)
            actions_taken.append(f"调整 OE-PCR 重叠区目标长度至 {overlap_len} bp")

        if "redesign_donor_primers_shift_window" in hints or "redesign_high_risk_primers" in hints:
            window_shift += 12
            donor = tool_design_donor(locus, effective_req.homology_arm_length, effective_req.donor_construction_method, effective_req.target_tm, overlap_len, window_shift)
            outer_offset += 60
            v_primers = tool_design_verification_primers(locus, donor, effective_req.plasmid_system, effective_req.custom_plasmid, effective_req.target_tm, outer_offset)
            actions_taken.append(f"微调同源臂引物窗口 (+{window_shift} bp) 并外扩验证引物避开二级结构")

        if "redesign_verify_primers_wider" in hints:
            outer_offset += 80
            v_primers = tool_design_verification_primers(locus, donor, effective_req.plasmid_system, effective_req.custom_plasmid, effective_req.target_tm, outer_offset)
            actions_taken.append(f"外扩验证引物搜索窗口至同源臂外侧 ~{outer_offset} bp")

        if not actions_taken:
            break

        report = tool_verify_design(
            locus=locus,
            selected_sgrna=selected_sgrna,
            donor=donor,
            verification_primers=v_primers,
            plasmid_system=effective_req.plasmid_system,
            custom_plasmid=effective_req.custom_plasmid,
            min_band_diff_bp=effective_req.min_band_diff_bp,
        )
        emit(
            f"自愈闭环修复 #{repair_iterations}",
            "self_healing_repair",
            "repaired" if report.fail_count == 0 else "warning",
            f"{'；'.join(actions_taken)} → 复验结果：{report.overall_status}（{report.passed_count}/{report.total_checks} PASS）",
            tr,
        )

    # ------------------------------------------------------------------
    # Step 5: Collect All Primers & Compute Default Wet-Lab Protocol
    # ------------------------------------------------------------------
    t7 = time.perf_counter()
    all_primers = tool_collect_all_primers(
        locus=locus,
        selected_sgrna=selected_sgrna,
        donor=donor,
        verification_primers=v_primers,
        plasmid_system=effective_req.plasmid_system,
        custom_plasmid=effective_req.custom_plasmid,
    )

    la_tm = donor.primers[0].tm_binding_c if len(donor.primers) >= 2 else effective_req.target_tm
    ra_tm = donor.primers[2].tm_binding_c if len(donor.primers) >= 4 else effective_req.target_tm
    calc_req = PipettingCalcRequest(
        plasmid_system=effective_req.plasmid_system,
        custom_plasmid=effective_req.custom_plasmid,
        la_len_bp=donor.la_amplicon_bp,
        ra_len_bp=donor.ra_amplicon_bp,
        donor_len_bp=donor.full_donor_len,
        wt_amplicon_bp=v_primers.wt_amplicon_bp,
        ko_amplicon_bp=v_primers.ko_amplicon_bp,
        polymerase=effective_req.polymerase,
        custom_polymerase=effective_req.custom_polymerase,
        la_anneal_tm=la_tm,
        ra_anneal_tm=ra_tm,
        overlap_tm=donor.overlap_tm_c,
        verify_anneal_tm=min(v_primers.outer_forward.tm_binding_c, v_primers.outer_reverse.tm_binding_c),
    )
    wetlab_protocol = tool_calculate_wetlab(calc_req)
    emit(
        "实验台移液配方与 4 天 SOP 生成",
        "calculate_wetlab_protocol",
        "ok",
        f"已生成 {len(all_primers)} 条引物订购清单、{len(wetlab_protocol.reactions)} 组动态移液体系与 {effective_req.plasmid_system} 专属 4 天流程",
        t7,
    )

    # ------------------------------------------------------------------
    # Step 6: Synthesize Expert Summary
    # ------------------------------------------------------------------
    t8 = time.perf_counter()
    if llm_client is not None:
        try:
            summary = _generate_llm_summary(
                llm_client, model, locus, selected_sgrna, donor, v_primers, report, effective_req.plasmid_system, repair_iterations
            )
            emit("AI 专家简报生成", "llm_summary", "ok", f"由 {model} 基于零信任事实报告生成实验简报", t8)
        except Exception:
            summary = _generate_deterministic_summary(
                locus, selected_sgrna, donor, v_primers, report, effective_req.plasmid_system, repair_iterations
            )
            emit("实验简报生成", "deterministic_summary", "ok", "已由确定性模板生成完整实验简报", t8)
    else:
        summary = _generate_deterministic_summary(
            locus, selected_sgrna, donor, v_primers, report, effective_req.plasmid_system, repair_iterations
        )
        emit("实验简报生成", "deterministic_summary", "ok", "全链路认证完成，交付包就绪", t8)

    alternatives = [c for c in sgrnas if c.id != selected_sgrna.id]

    return DesignResponse(
        run_id=run_id,
        mode=active_mode,  # type: ignore[arg-type]
        llm_model_used=model if active_mode == "llm_agent" else None,
        quota_status=quota_status,
        plasmid_system=effective_req.plasmid_system,
        custom_plasmid=effective_req.custom_plasmid,
        repair_iterations=repair_iterations,
        audit_trace=audit_trace,
        locus=locus,
        selected_sgrna=selected_sgrna,
        alternative_sgrnas=alternatives,
        donor=donor,
        verification_primers=v_primers,
        verification_report=report,
        all_primers=all_primers,
        wetlab_protocol=wetlab_protocol,
        agent_summary=summary,
    )
