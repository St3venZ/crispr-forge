"""SpCas9 sgRNA scanner, plasmid-specific cloning oligo generator, enzyme conflict filter, and scorer."""

from __future__ import annotations

from typing import Optional

from crispr_forge.design.thermo import (
    calc_gc,
    calc_hairpin_dg,
    calc_homodimer_dg,
    calc_tm,
    determine_purification,
    revcomp,
)
from crispr_forge.genome.offtarget_index import scan_off_targets
from crispr_forge.models import (
    CustomPlasmidConfig,
    LocusInfo,
    PlasmidSystemId,
    PrimerSpec,
    SgRNACandidate,
)
from crispr_forge.plasmids import PlasmidProfile, RESTRICTION_SITES, resolve_plasmid_profile


def check_restriction_conflict(
    spacer_20nt: str,
    profile: PlasmidProfile,
) -> tuple[bool, Optional[str]]:
    """
    Check whether the spacer OR its cloning junctions introduce a forbidden Type IIS restriction site
    (e.g., BsaI GGTCTC/GAGACC for pEcgRNA or pJOE8999).
    """
    enzyme = profile.restriction_enzyme
    if not enzyme or enzyme.lower() == "none" or enzyme not in RESTRICTION_SITES:
        return False, None

    fwd_site, rev_site = RESTRICTION_SITES[enzyme]
    spacer = spacer_20nt.upper()

    if fwd_site in spacer or rev_site in spacer:
        return True, f"20-nt Spacer 内部含有 {enzyme} 识别位点 ({fwd_site}/{rev_site})，金门组装会被切碎"

    if profile.cloning_method == "golden_gate_oligo":
        oligo_f = profile.overhang_forward + spacer
        oligo_r = profile.overhang_reverse + revcomp(spacer)
        junction_ctx = (
            profile.promoter_upstream_seq[-6:]
            + spacer
            + profile.scaffold_downstream_seq[:6]
        )
        for label, seq in (
            ("正向克隆 Oligo 边界", oligo_f),
            ("反向克隆 Oligo 边界", oligo_r),
            ("质粒拼接连接区", junction_ctx),
        ):
            if fwd_site in seq or rev_site in seq:
                return True, f"{label} 意外拼出 {enzyme} 识别位点 ({fwd_site}/{rev_site})"

    return False, None


def _score_on_target_base(
    spacer: str,
    pam: str,
    dist_pct: float,
    gc: float,
    hp_dg: float,
    has_poly_t: bool,
    has_enzyme_conflict: bool,
) -> float:
    """Doench Rule Set 2 inspired heuristic on-target score (0-100)."""
    score = 72.0

    # GC content optimal window: 45% - 60%
    if 45.0 <= gc <= 60.0:
        score += 12.0
    elif 35.0 <= gc <= 70.0:
        score += 4.0
    else:
        score -= 22.0

    # Position along ORF: early-to-middle (10% - 65%) is ideal for complete knockout
    if 10.0 <= dist_pct <= 65.0:
        score += 8.0
    elif dist_pct < 10.0 or dist_pct <= 85.0:
        score += 2.0
    else:
        score -= 6.0

    # Position 20 (immediately upstream of PAM): G strongly favored, C/T disfavored
    if spacer[19] == "G":
        score += 6.0
    elif spacer[19] == "C":
        score -= 4.0
    elif spacer[19] == "T":
        score -= 3.0

    # Position 16/17 mild preference
    if spacer[16] == "C":
        score += 2.0

    # PAM NGG: CGG/AGG/TGG slightly better than GGG (homopolymer risk)
    if pam == "GGG":
        score -= 3.0
    elif pam in ("AGG", "TGG", "CGG"):
        score += 2.0

    # Secondary structure / self-folding penalty
    if hp_dg < -4.0:
        score -= abs(hp_dg + 4.0) * 3.5
    elif hp_dg > -1.5:
        score += 3.0

    # Poly-T terminator risk (RNA Pol III / bacterial premature termination)
    if has_poly_t:
        score -= 30.0

    # Homopolymer runs >= 5 nt
    for b in "ACGT":
        if b * 5 in spacer:
            score -= 10.0

    # Cloning restriction enzyme conflict
    if has_enzyme_conflict:
        score -= 55.0

    return round(max(1.0, min(99.5, score)), 1)


def _build_cloning_oligos(spacer_20nt: str, profile: PlasmidProfile) -> tuple[str, str, str]:
    spacer = spacer_20nt.upper()
    if profile.cloning_method == "golden_gate_oligo":
        oligo_f = f"{profile.overhang_forward}{spacer}"
        oligo_r = f"{profile.overhang_reverse}{revcomp(spacer)}"
        note = (
            f"{profile.short_label} ({profile.restriction_enzyme} 金门退火双链): "
            f"F = 5'-{profile.overhang_forward}-[N20]-3', R = 5'-{profile.overhang_reverse}-[rc(N20)]-3'"
        )
        return oligo_f, oligo_r, note

    # inverse_pcr (e.g., pCas/pTargetF)
    oligo_f = f"{spacer}{profile.inverse_pcr_scaffold_anchor}"
    oligo_r = profile.inverse_pcr_reverse_primer
    note = (
        f"{profile.short_label} (全质粒反向 PCR): "
        "F = 5'-[N20]-gRNA_Scaffold-3', R = J23119 通用反向引物（PCR 后 DpnI 消化母本并磷酸化自连）"
    )
    return oligo_f, oligo_r, note


def design_sgrnas(
    locus: LocusInfo,
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA",
    custom_plasmid: Optional[CustomPlasmidConfig] = None,
    top_k: int = 5,
) -> list[SgRNACandidate]:
    """
    Scan all SpCas9 NGG targets inside the planned deletion region on both strands,
    filter cloning enzyme conflicts, scan off-targets, and rank top candidates.
    """
    profile = resolve_plasmid_profile(plasmid_system, custom_plasmid)
    seq = locus.locus_sequence.upper()
    del_start = locus.deletion_rel_start
    del_end = locus.deletion_rel_end
    orf_len = max(1, locus.orf_length_bp)

    raw_candidates: list[dict] = []

    # Scan forward strand: spacer = seq[i-20:i], PAM = seq[i:i+3] where seq[i+1:i+3] == "GG"
    for i in range(max(20, del_start + 3), min(len(seq) - 2, del_end)):
        if seq[i + 1 : i + 3] == "GG":
            spacer = seq[i - 20 : i]
            pam = seq[i : i + 3]
            cut_rel = i - 3
            # Require spacer & cut site inside deletion zone so edited genome removes target completely!
            if (i - 20) >= del_start and (i + 3) <= del_end and "N" not in spacer:
                if locus.strand == "+":
                    dist_pct = 100.0 * (cut_rel - locus.target_rel_start) / orf_len
                else:
                    dist_pct = 100.0 * (locus.target_rel_end - cut_rel) / orf_len
                dist_pct = round(max(0.0, min(100.0, dist_pct)), 1)

                gc = calc_gc(spacer)
                hp_dg = calc_hairpin_dg(spacer)
                has_poly_t = "TTTT" in spacer
                has_enz, enz_detail = check_restriction_conflict(spacer, profile)
                base_score = _score_on_target_base(
                    spacer, pam, dist_pct, gc, hp_dg, has_poly_t, has_enz
                )
                raw_candidates.append(
                    {
                        "spacer": spacer,
                        "pam": pam,
                        "strand": "+",
                        "cut_rel": cut_rel,
                        "dist_pct": dist_pct,
                        "gc": gc,
                        "hp_dg": hp_dg,
                        "has_poly_t": has_poly_t,
                        "has_enz": has_enz,
                        "enz_detail": enz_detail,
                        "base_score": base_score,
                    }
                )

    # Scan reverse strand: CCN at seq[i:i+3] (seq[i:i+2] == "CC"), spacer = revcomp(seq[i+3:i+23])
    for i in range(max(0, del_start), min(len(seq) - 23, del_end - 23)):
        if seq[i : i + 2] == "CC":
            pam = revcomp(seq[i : i + 3])
            spacer = revcomp(seq[i + 3 : i + 23])
            cut_rel = i + 6  # 3 bp upstream of PAM on reverse strand
            if i >= del_start and (i + 23) <= del_end and "N" not in spacer:
                if locus.strand == "+":
                    dist_pct = 100.0 * (cut_rel - locus.target_rel_start) / orf_len
                else:
                    dist_pct = 100.0 * (locus.target_rel_end - cut_rel) / orf_len
                dist_pct = round(max(0.0, min(100.0, dist_pct)), 1)

                gc = calc_gc(spacer)
                hp_dg = calc_hairpin_dg(spacer)
                has_poly_t = "TTTT" in spacer
                has_enz, enz_detail = check_restriction_conflict(spacer, profile)
                base_score = _score_on_target_base(
                    spacer, pam, dist_pct, gc, hp_dg, has_poly_t, has_enz
                )
                raw_candidates.append(
                    {
                        "spacer": spacer,
                        "pam": pam,
                        "strand": "-",
                        "cut_rel": cut_rel,
                        "dist_pct": dist_pct,
                        "gc": gc,
                        "hp_dg": hp_dg,
                        "has_poly_t": has_poly_t,
                        "has_enz": has_enz,
                        "enz_detail": enz_detail,
                        "base_score": base_score,
                    }
                )

    if not raw_candidates:
        raise ValueError(
            f"在敲除区间 [{del_start}..{del_end}] 内未找到任何合法的 SpCas9 (NGG) 靶点。"
        )

    # Pre-sort by base_score and run off-target scanning on top 40 unique spacers for high speed
    raw_candidates.sort(key=lambda x: x["base_score"], reverse=True)
    shortlist = raw_candidates[: max(40, top_k * 4)]

    scored: list[tuple[float, SgRNACandidate]] = []
    seen_spacers: set[str] = set()
    for item in shortlist:
        sp = item["spacer"]
        if sp in seen_spacers:
            continue
        seen_spacers.add(sp)

        ot = scan_off_targets(sp, locus.accession, seq)
        final_score = item["base_score"] - (ot.exact_seed_hits * 35.0)
        final_score = round(max(1.0, min(99.5, final_score)), 1)

        oligo_f, oligo_r, oligo_note = _build_cloning_oligos(sp, profile)
        cand = SgRNACandidate(
            rank=0,
            id="",
            spacer_20nt=sp,
            pam=item["pam"],
            strand=item["strand"],
            cut_site_rel=item["cut_rel"],
            cut_site_genome=locus.slice_genome_start + item["cut_rel"],
            distance_from_orf_start_pct=item["dist_pct"],
            gc_percent=item["gc"],
            on_target_score=final_score,
            self_complementarity_dg=item["hp_dg"],
            has_poly_t=item["has_poly_t"],
            has_enzyme_conflict=item["has_enz"],
            enzyme_conflict_detail=item["enz_detail"],
            off_target_scope=ot.scope,
            off_target_hits_seed=ot.exact_seed_hits,
            off_target_hits_1_2mm=ot.distal_1_2mm_hits,
            off_target_summary=ot.summary,
            plasmid_system=plasmid_system,
            cloning_method=profile.cloning_method,
            cloning_oligo_f=oligo_f,
            cloning_oligo_r=oligo_r,
            cloning_oligo_note=oligo_note,
            selected=False,
        )
        # Prioritize zero off-target & zero enzyme conflict & no poly-T first, then score
        sort_key = (
            0 if (not cand.has_enzyme_conflict and cand.off_target_hits_seed == 0 and not cand.has_poly_t) else 1,
            -cand.on_target_score,
        )
        scored.append((sort_key, cand))

    scored.sort(key=lambda x: x[0])
    top_candidates = [c for _, c in scored[:top_k]]
    for idx, c in enumerate(top_candidates, start=1):
        c.rank = idx
        c.id = f"sgRNA_{idx}"
        c.selected = idx == 1

    return top_candidates


def build_sgrna_cloning_primers(
    gene_name: str,
    sgrna: SgRNACandidate,
    profile: PlasmidProfile,
) -> list[PrimerSpec]:
    """Convert selected sgRNA cloning oligos into standardized PrimerSpec rows for ordering & verification."""
    if profile.cloning_method == "golden_gate_oligo":
        oh_f = profile.overhang_forward
        oh_r = profile.overhang_reverse
        bind_f = sgrna.spacer_20nt
        bind_r = revcomp(sgrna.spacer_20nt)
        f_name = f"{gene_name}_sgRNA_F"
        r_name = f"{gene_name}_sgRNA_R"
        f_note = f"{profile.short_label} {profile.restriction_enzyme} 金门退火正向 Oligo (5'-{oh_f}-N20)"
        r_note = f"{profile.short_label} {profile.restriction_enzyme} 金门退火反向 Oligo (5'-{oh_r}-rc(N20))"
    else:
        oh_f = sgrna.spacer_20nt
        bind_f = profile.inverse_pcr_scaffold_anchor
        oh_r = ""
        bind_r = sgrna.cloning_oligo_r
        f_name = f"{gene_name}_pTarget_InvF"
        r_name = f"{gene_name}_pTarget_InvR"
        f_note = f"{profile.short_label} 全质粒反向 PCR 正向引物 (5'-N20-Scaffold)"
        r_note = f"{profile.short_label} 全质粒反向 PCR 通用反向引物 (J23119 端)"

    p_f = PrimerSpec(
        name=f_name,
        role="sgRNA_cloning",
        sequence=sgrna.cloning_oligo_f,
        binding_region=bind_f,
        overhang_region=oh_f,
        length_nt=len(sgrna.cloning_oligo_f),
        tm_binding_c=calc_tm(bind_f),
        tm_full_c=calc_tm(sgrna.cloning_oligo_f),
        gc_percent=calc_gc(sgrna.cloning_oligo_f),
        hairpin_dg=calc_hairpin_dg(sgrna.cloning_oligo_f),
        homodimer_dg=calc_homodimer_dg(sgrna.cloning_oligo_f),
        purification_method=determine_purification(len(sgrna.cloning_oligo_f)),
        template_source=profile.short_label,
        notes=f_note,
    )
    p_r = PrimerSpec(
        name=r_name,
        role="sgRNA_cloning",
        sequence=sgrna.cloning_oligo_r,
        binding_region=bind_r,
        overhang_region=oh_r,
        length_nt=len(sgrna.cloning_oligo_r),
        tm_binding_c=calc_tm(bind_r),
        tm_full_c=calc_tm(sgrna.cloning_oligo_r),
        gc_percent=calc_gc(sgrna.cloning_oligo_r),
        hairpin_dg=calc_hairpin_dg(sgrna.cloning_oligo_r),
        homodimer_dg=calc_homodimer_dg(sgrna.cloning_oligo_r),
        purification_method=determine_purification(len(sgrna.cloning_oligo_r)),
        template_source=profile.short_label,
        notes=r_note,
    )
    return [p_f, p_r]
