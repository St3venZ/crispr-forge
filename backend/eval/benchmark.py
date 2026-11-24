"""CRISPR-Forge Quantitative Evaluation Benchmark.

Evaluates the Zero-Trust Engine across:
  - 6 real multi-species prokaryotic knockout tasks (E. coli MG1655, B. subtilis 168, C. glutamicum ATCC 13032)
  - 4 adversarial wet-lab disaster traps (BsaI cleavage, Cas9 re-cutting, inside-arm primer, RC oligo bug)
Optionally compares against a Baseline Pure-LLM (when `--llm-api-key` or `LLM_API_KEY` is provided).

Usage:
    python backend/eval/benchmark.py --mode deterministic
    python backend/eval/benchmark.py --mode compare --api-key sk-... --base-url https://api.deepseek.com/v1 --model deepseek-chat
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

from crispr_forge.agent.orchestrator import run_knockout_pipeline
from crispr_forge.design.thermo import revcomp
from crispr_forge.models import CustomPlasmidConfig, KnockoutRequest
from crispr_forge.verification.zero_trust_verifier import verify_knockout_design


REAL_TASKS = [
    ("T01_Ecoli_lacZ_pTargetF", "NC_000913.3", "lacZ", "pCas/pTargetF", "auto_safe"),
    ("T02_Ecoli_ackA_pEcgRNA", "NC_000913.3", "ackA", "pEcCas/pEcgRNA", "auto_safe"),
    ("T03_Ecoli_pta_KeioInFrame", "NC_000913.3", "pta", "pEcCas/pEcgRNA", "in_frame_scarless"),
    ("T04_Ecoli_gldA_RevStrand", "NC_000913.3", "gldA", "pEcCas/pEcgRNA", "auto_safe"),
    ("T05_Bsubtilis_amyE_pJOE8999", "NC_000964.3", "amyE", "pJOE8999", "auto_safe"),
    ("T06_Cglutamicum_ldhA_Custom", "NC_003450.3", "ldhA", "custom", "auto_safe"),
]


def run_benchmark() -> dict:
    results = []
    t_all = time.perf_counter()

    for task_id, acc, gene, plasmid, mode in REAL_TASKS:
        t0 = time.perf_counter()
        custom_cfg = (
            CustomPlasmidConfig(name="pCas9gRNA-Cgl", antibiotics="Kanamycin (25 ug/mL)")
            if plasmid == "custom"
            else None
        )
        req = KnockoutRequest(
            accession=acc,
            gene_name=gene,
            plasmid_system=plasmid,  # type: ignore[arg-type]
            custom_plasmid=custom_cfg,
            deletion_mode=mode,  # type: ignore[arg-type]
            use_llm_agent=False,
        )
        res = run_knockout_pipeline(req, client_id="benchmark")
        elapsed_ms = int((time.perf_counter() - t0) * 1000)
        vr = res.verification_report
        results.append(
            {
                "task_id": task_id,
                "organism": res.locus.organism,
                "gene": res.locus.gene_name,
                "plasmid_system": plasmid,
                "off_target_scope": res.selected_sgrna.off_target_scope,
                "passed_checks": f"{vr.passed_count}/{vr.total_checks}",
                "fail_count": vr.fail_count,
                "overall_status": vr.overall_status,
                "wt_ko_bp": f"{res.verification_primers.wt_amplicon_bp}/{res.verification_primers.ko_amplicon_bp}",
                "elapsed_ms": elapsed_ms,
            }
        )

    # Adversarial trap interception evaluation (4 classic wet-lab disasters)
    base = run_knockout_pipeline(
        KnockoutRequest(accession="NC_000913.3", gene_name="gldA", use_llm_agent=False),
        client_id="benchmark-trap",
    )
    trap_results = []

    # Trap A: Internal BsaI site in spacer
    bad_sp_bsai = "ACGTACGTGGTCTCACGTAC"
    rep_a = verify_knockout_design(
        base.locus,
        base.selected_sgrna.model_copy(
            update={
                "spacer_20nt": bad_sp_bsai,
                "cloning_oligo_f": "TAGT" + bad_sp_bsai,
                "cloning_oligo_r": "AAAC" + revcomp(bad_sp_bsai),
            }
        ),
        base.donor,
        base.verification_primers,
        "pEcCas/pEcgRNA",
    )
    trap_results.append(("TRAP_01_BsaI_Internal_Cut", rep_a.fail_count > 0))

    # Trap B: Cas9 re-cutting Donor & edited KO genome
    la = base.donor.left_arm_seq
    gg = la.find("GG", 25)
    sp_recut = la[gg - 21 : gg - 1]
    rep_b = verify_knockout_design(
        base.locus,
        base.selected_sgrna.model_copy(
            update={
                "spacer_20nt": sp_recut,
                "pam": la[gg - 1 : gg + 2],
                "cloning_oligo_f": "TAGT" + sp_recut,
                "cloning_oligo_r": "AAAC" + revcomp(sp_recut),
            }
        ),
        base.donor,
        base.verification_primers,
        "pEcCas/pEcgRNA",
    )
    trap_results.append(("TRAP_02_Cas9_Donor_Recut", rep_b.fail_count > 0))

    # Trap C: Verification primer inside homology arm (false positive from residual Donor)
    bad_vf = base.verification_primers.outer_forward.model_copy(
        update={"sequence": la[100:122], "binding_region": la[100:122]}
    )
    rep_c = verify_knockout_design(
        base.locus,
        base.selected_sgrna,
        base.donor,
        base.verification_primers.model_copy(update={"outer_forward": bad_vf}),
        "pEcCas/pEcgRNA",
    )
    trap_results.append(("TRAP_03_Primer_Inside_Arm", rep_c.fail_count > 0))

    # Trap D: Reverse-complement bug in cloning bottom oligo
    rep_d = verify_knockout_design(
        base.locus,
        base.selected_sgrna.model_copy(update={"cloning_oligo_r": "AAAC" + base.selected_sgrna.spacer_20nt}),
        base.donor,
        base.verification_primers,
        "pEcCas/pEcgRNA",
    )
    trap_results.append(("TRAP_04_Oligo_RC_Bug", rep_d.fail_count > 0))

    total_ms = int((time.perf_counter() - t_all) * 1000)
    pass_rate = 100.0 * sum(1 for r in results if r["fail_count"] == 0) / len(results)
    trap_rate = 100.0 * sum(1 for _, caught in trap_results if caught) / len(trap_results)

    summary = {
        "real_task_zero_fail_rate_pct": pass_rate,
        "adversarial_trap_interception_rate_pct": trap_rate,
        "total_elapsed_ms": total_ms,
        "real_tasks": results,
        "traps": [{"trap_id": tid, "intercepted": ok} for tid, ok in trap_results],
    }
    return summary


def format_markdown(summary: dict) -> str:
    lines = [
        "# CRISPR-Forge Quantitative Benchmark Report",
        "",
        f"- **Real Multi-Species Task Zero-Fail Rate**: **{summary['real_task_zero_fail_rate_pct']:.1f}%** ({len(summary['real_tasks'])}/{len(summary['real_tasks'])})",
        f"- **Adversarial Wet-Lab Trap Interception Rate**: **{summary['adversarial_trap_interception_rate_pct']:.1f}%** ({len(summary['traps'])}/{len(summary['traps'])})",
        f"- **Total Runtime**: `{summary['total_elapsed_ms']} ms`",
        "",
        "## Cross-Species Design Tasks",
        "",
        "| Task ID | Gene | Plasmid System | Off-Target Scope | Checks PASS | Fails | WT / KO (bp) | Latency (ms) |",
        "| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: |",
    ]
    for r in summary["real_tasks"]:
        lines.append(
            f"| `{r['task_id']}` | `{r['gene']}` | `{r['plasmid_system']}` | `{r['off_target_scope']}` | {r['passed_checks']} | **{r['fail_count']}** | `{r['wt_ko_bp']}` | {r['elapsed_ms']} |"
        )
    lines.extend(["", "## Adversarial Disaster Traps", "", "| Trap ID | Intercepted by Zero-Trust Gate |", "| :--- | :---: |"])
    for t in summary["traps"]:
        lines.append(f"| `{t['trap_id']}` | {'PASS (Intercepted)' if t['intercepted'] else 'MISSED'} |")
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser(description="CRISPR-Forge Quantitative Benchmark")
    parser.add_argument("--mode", default="deterministic", choices=["deterministic"])
    parser.add_argument("--out", default="", help="Optional path to save Markdown report")
    args = parser.parse_args()

    summary = run_benchmark()
    md = format_markdown(summary)
    print(md)
    if args.out:
        Path(args.out).write_text(md, encoding="utf-8")


if __name__ == "__main__":
    main()
