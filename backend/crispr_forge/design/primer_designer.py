"""Cross-site outer colony-PCR verification primers, WT internal control, Sanger, and plasmid primers."""

from __future__ import annotations

from typing import Optional

from crispr_forge.design.thermo import (
    calc_gc,
    calc_hairpin_dg,
    calc_heterodimer_dg,
    calc_homodimer_dg,
    calc_tm,
    determine_purification,
    revcomp,
    score_primer_quality,
)
from crispr_forge.models import (
    CustomPlasmidConfig,
    DonorDesign,
    LocusInfo,
    PlasmidSystemId,
    PrimerSpec,
    VerificationPrimersDesign,
)
from crispr_forge.plasmids import resolve_plasmid_profile


def _scan_window_primers(
    seq: str,
    win_start: int,
    win_end: int,
    strand: str,
    target_tm: float = 60.0,
    min_len: int = 19,
    max_len: int = 25,
    step: int = 4,
) -> list[tuple[float, int, int, str]]:
    """Return top primer candidates (penalty, rel_start, rel_end, sequence_5to3) within [win_start, win_end]."""
    n = len(seq)
    win_start = max(0, win_start)
    win_end = min(n, win_end)
    cands: list[tuple[float, int, int, str]] = []

    for pos in range(win_start, max(win_start + 1, win_end - min_len), step):
        best_local: Optional[tuple[float, int, int, str]] = None
        for length in range(min_len, max_len + 1):
            if pos + length > win_end:
                break
            sub = seq[pos : pos + length]
            if "N" in sub:
                continue
            p_seq = sub if strand == "+" else revcomp(sub)
            # Check uniqueness of 15-bp 3' anchor in the entire locus window
            anchor = p_seq[-15:]
            anchor_rc = revcomp(anchor)
            if seq.count(anchor) + seq.count(anchor_rc) > 1:
                continue
            pen = score_primer_quality(p_seq, target_tm=target_tm)
            if best_local is None or pen < best_local[0]:
                best_local = (pen, pos, pos + length, p_seq)
        if best_local is not None:
            cands.append(best_local)

    cands.sort(key=lambda x: x[0])
    return cands[:18]


def _make_primer(
    name: str,
    role: str,
    seq: str,
    template_source: str,
    notes: str,
    rel_start: Optional[int] = None,
    rel_end: Optional[int] = None,
    strand: Optional[str] = None,
) -> PrimerSpec:
    return PrimerSpec(
        name=name,
        role=role,  # type: ignore[arg-type]
        sequence=seq,
        binding_region=seq,
        overhang_region="",
        length_nt=len(seq),
        tm_binding_c=calc_tm(seq),
        tm_full_c=calc_tm(seq),
        gc_percent=calc_gc(seq),
        hairpin_dg=calc_hairpin_dg(seq),
        homodimer_dg=calc_homodimer_dg(seq),
        purification_method=determine_purification(len(seq)),
        template_source=template_source,
        rel_bind_start=rel_start,
        rel_bind_end=rel_end,
        strand=strand,  # type: ignore[arg-type]
        notes=notes,
    )


def design_verification_primers(
    locus: LocusInfo,
    donor: DonorDesign,
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA",
    custom_plasmid: Optional[CustomPlasmidConfig] = None,
    target_tm: float = 60.0,
    outer_offset: int = 180,
) -> VerificationPrimersDesign:
    """
    Design:
      1. Cross-site outer verification pair (VF/VR) STRICTLY OUTSIDE left & right homology arms
         (eliminating false positives from residual unintegrated donor DNA).
      2. Optional WT-specific internal reverse primer inside deleted region (WT+, KO- confirmation).
      3. Sanger sequencing primer positioned 160-240 bp upstream of the scarless knockout junction.
      4. Plasmid-system-specific colony PCR & sequencing primers for sgRNA vector confirmation.
    """
    seq = locus.locus_sequence.upper()
    n = len(seq)
    la_start = locus.deletion_rel_start - donor.left_arm_len
    ra_end = locus.deletion_rel_end + donor.right_arm_len

    # Enforce >= 85 bp outside LA and RA whenever flanking window permits
    min_margin = 85
    vf_end_limit = max(35, la_start - min_margin)
    vf_start_limit = max(0, la_start - outer_offset - 220)
    if vf_end_limit - vf_start_limit < 40:
        vf_start_limit = max(0, vf_end_limit - 120)

    vr_start_limit = min(n - 35, ra_end + min_margin)
    vr_end_limit = min(n, ra_end + outer_offset + 220)
    if vr_end_limit - vr_start_limit < 40:
        vr_end_limit = min(n, vr_start_limit + 120)

    vf_cands = _scan_window_primers(seq, vf_start_limit, vf_end_limit, "+", target_tm=target_tm)
    vr_cands = _scan_window_primers(seq, vr_start_limit, vr_end_limit, "-", target_tm=target_tm)

    # Relax uniqueness slightly if repetitive region returned empty
    if not vf_cands:
        vf_sub = seq[max(0, vf_end_limit - 22) : vf_end_limit]
        vf_cands = [(10.0, max(0, vf_end_limit - 22), vf_end_limit, vf_sub)]
    if not vr_cands:
        vr_sub = revcomp(seq[vr_start_limit : min(n, vr_start_limit + 22)])
        vr_cands = [(10.0, vr_start_limit, min(n, vr_start_limit + 22), vr_sub)]

    # Jointly select the best (VF, VR) pair minimizing delta-Tm & heterodimer
    best_pair = None
    best_pair_score = 1e9
    for pen_f, fs, fe, f_seq in vf_cands:
        tm_f = calc_tm(f_seq)
        for pen_r, rs, re, r_seq in vr_cands:
            tm_r = calc_tm(r_seq)
            het = calc_heterodimer_dg(f_seq, r_seq)
            dt = abs(tm_f - tm_r)
            het_pen = abs(het + 6.0) * 3.0 if het < -6.0 else 0.0
            total = pen_f + pen_r + dt * 3.0 + het_pen
            if total < best_pair_score:
                best_pair_score = total
                best_pair = ((fs, fe, f_seq), (rs, re, r_seq))

    assert best_pair is not None
    (vf_s, vf_e, vf_seq), (vr_s, vr_e, vr_seq) = best_pair
    g = locus.gene_name

    dist_out_la = max(0, la_start - vf_e)
    dist_out_ra = max(0, vr_s - ra_end)
    wt_bp = vr_e - vf_s
    ko_bp = wt_bp - locus.deleted_length_bp
    band_diff = abs(wt_bp - ko_bp)

    outer_f = _make_primer(
        name=f"{g}_VF",
        role="verify_outer",
        seq=vf_seq,
        template_source="菌落基因组 (严禁与 Donor 结合)",
        notes=f"跨位点外侧上游验证引物，位于左同源臂外侧 {dist_out_la} bp（杜绝游离 Donor 假阳性）",
        rel_start=vf_s,
        rel_end=vf_e,
        strand="+",
    )
    outer_r = _make_primer(
        name=f"{g}_VR",
        role="verify_outer",
        seq=vr_seq,
        template_source="菌落基因组 (严禁与 Donor 结合)",
        notes=f"跨位点外侧下游验证引物，位于右同源臂外侧 {dist_out_ra} bp（WT={wt_bp} bp / KO={ko_bp} bp）",
        rel_start=vr_s,
        rel_end=vr_e,
        strand="-",
    )

    # WT-specific internal reverse primer inside deleted region
    wt_internal: Optional[PrimerSpec] = None
    if locus.deleted_length_bp >= 240:
        int_start = locus.deletion_rel_start + 120
        int_end = min(locus.deletion_rel_end - 30, locus.deletion_rel_start + 700)
        if int_end - int_start >= 40:
            int_cands = _scan_window_primers(seq, int_start, int_end, "-", target_tm=calc_tm(vf_seq))
            if int_cands:
                _, is_, ie_, iseq = int_cands[0]
                wt_int_bp = ie_ - vf_s
                wt_internal = _make_primer(
                    name=f"{g}_WT_int_R",
                    role="verify_wt_internal",
                    seq=iseq,
                    template_source="野生型对照菌落基因组",
                    notes=f"ORF 内部特异反向引物（配 {g}_VF：野生型扩出 {wt_int_bp} bp，纯合敲除株应无任何条带）",
                    rel_start=is_,
                    rel_end=ie_,
                    strand="-",
                )

    # Sanger sequencing primer positioned ~170-240 bp upstream of scarless KO junction
    seq_win_start = max(0, locus.deletion_rel_start - 260)
    seq_win_end = max(seq_win_start + 40, locus.deletion_rel_start - 150)
    seq_cands = _scan_window_primers(seq, seq_win_start, seq_win_end, "+", target_tm=59.5, step=3)
    if seq_cands:
        _, ss, se, sseq = seq_cands[0]
    else:
        ss = max(0, locus.deletion_rel_start - 200)
        se = ss + 20
        sseq = seq[ss:se]

    dist_to_junc = locus.deletion_rel_start - se
    sanger_primer = _make_primer(
        name=f"{g}_Seq_F",
        role="sanger_seq",
        seq=sseq,
        template_source="KO 菌落 PCR 回收产物",
        notes=f"Sanger 测序正向引物，位于敲除连接点上游 {dist_to_junc} bp（确保连接处峰图处于高 Q 值区）",
        rel_start=ss,
        rel_end=se,
        strand="+",
    )

    # Plasmid-specific colony PCR & Sanger sequencing primers
    profile = resolve_plasmid_profile(plasmid_system, custom_plasmid)
    tag = profile.short_label.replace(" ", "").replace("/", "_")
    plasmid_primers = [
        _make_primer(
            name=f"{tag}_ColPCR_F",
            role="plasmid_verify",
            seq=profile.colony_pcr_backbone_f,
            template_source=profile.short_label,
            notes=f"{profile.short_label} 质粒骨架菌落 PCR 正向引物",
        ),
        _make_primer(
            name=f"{tag}_ColPCR_R",
            role="plasmid_verify",
            seq=profile.colony_pcr_backbone_r,
            template_source=profile.short_label,
            notes=f"{profile.short_label} sgRNA 骨架通用反向引物",
        ),
        _make_primer(
            name=f"{tag}_Seq_F",
            role="plasmid_verify",
            seq=profile.sanger_backbone_f,
            template_source=profile.short_label,
            notes=f"{profile.short_label} 重组质粒 N20 序列 Sanger 测序确认引物",
        ),
    ]

    return VerificationPrimersDesign(
        outer_forward=outer_f,
        outer_reverse=outer_r,
        wt_internal_primer=wt_internal,
        sanger_primer=sanger_primer,
        plasmid_verify_primers=plasmid_primers,
        wt_amplicon_bp=wt_bp,
        ko_amplicon_bp=ko_bp,
        band_diff_bp=band_diff,
        distance_outside_la_bp=dist_out_la,
        distance_outside_ra_bp=dist_out_ra,
    )
