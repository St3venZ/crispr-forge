"""Homology arm extraction and OE-PCR donor primer designer."""

from __future__ import annotations

from crispr_forge.design.thermo import (
    calc_gc,
    calc_hairpin_dg,
    calc_homodimer_dg,
    calc_tm,
    determine_purification,
    pick_binding_primer,
    revcomp,
)
from crispr_forge.models import DonorDesign, DonorMethod, LocusInfo, PrimerSpec


def design_donor(
    locus: LocusInfo,
    arm_length: int = 500,
    method: DonorMethod = "oe_pcr",
    target_tm: float = 60.0,
    overlap_target_len: int = 28,
    window_shift: int = 0,
) -> DonorDesign:
    """
    Extract exact Left and Right Homology Arms flanking [deletion_rel_start, deletion_rel_end)
    and design thermodynamically balanced OE-PCR junction primers whose amplicons stitch
    with 100% base-pair exactness into `left_arm_seq + right_arm_seq`.
    """
    seq = locus.locus_sequence.upper()
    n = len(seq)
    del_start = locus.deletion_rel_start
    del_end = locus.deletion_rel_end

    # Reserve >= 150 bp outside both arms so outer cross-site verification primers always fit cleanly
    max_la = max(250, del_start - 150)
    max_ra = max(250, (n - del_end) - 150)
    la_len = min(arm_length, max_la)
    ra_len = min(arm_length, max_ra)

    if del_start - la_len < 0 or del_end + ra_len > n:
        raise ValueError(
            f"序列侧翼长度不足，无法提取 {la_len}/{ra_len} bp 同源臂并保留外侧验证引物空间。"
        )

    # Optional small shift applied during self-healing if terminal binding had hairpin/non-specificity
    la_shift = min(max(0, window_shift), max(0, la_len - 250))
    ra_shift = min(max(0, window_shift), max(0, ra_len - 250))

    la_start = del_start - (la_len - la_shift)
    ra_end = del_end + (ra_len - ra_shift)

    left_arm_seq = seq[la_start:del_start]
    right_arm_seq = seq[del_end:ra_end]
    full_donor_seq = left_arm_seq + right_arm_seq

    # Optimize OE-PCR junction overlap length so overlap Tm falls right in 59-64 C
    best_pair = (14, 14)
    best_tm_diff = 1e9
    best_ov_tm = 60.0
    target_ov_tm = max(60.0, target_tm + 1.0)

    min_half = max(10, (overlap_target_len // 2) - 4)
    max_half = min(20, (overlap_target_len // 2) + 5)

    for hl in range(min_half, max_half + 1):
        for hr in range(min_half, max_half + 1):
            if not (22 <= hl + hr <= 38):
                continue
            ov = left_arm_seq[-hl:] + right_arm_seq[:hr]
            tm = calc_tm(ov)
            diff = abs(tm - target_ov_tm) + abs(hl - hr) * 0.25
            if diff < best_tm_diff:
                best_tm_diff = diff
                best_pair = (hl, hr)
                best_ov_tm = tm

    half_l, half_r = best_pair
    overlap_seq = left_arm_seq[-half_l:] + right_arm_seq[:half_r]
    overlap_len = len(overlap_seq)
    overlap_tm_c = round(best_ov_tm, 2)

    if method == "direct_synthesis":
        return DonorDesign(
            method="direct_synthesis",
            left_arm_seq=left_arm_seq,
            right_arm_seq=right_arm_seq,
            left_arm_len=len(left_arm_seq),
            right_arm_len=len(right_arm_seq),
            overlap_seq=overlap_seq,
            overlap_len=overlap_len,
            overlap_tm_c=overlap_tm_c,
            full_donor_seq=full_donor_seq,
            full_donor_len=len(full_donor_seq),
            primers=[],
            la_amplicon_bp=len(left_arm_seq),
            ra_amplicon_bp=len(right_arm_seq),
        )

    # Design 4 OE-PCR primers:
    # 1) LA_F: forward primer at 5' start of left_arm_seq
    la_f_bind = pick_binding_primer(left_arm_seq[:35], from_start=True, target_tm=target_tm)
    # 2) LA_R_ov: 5'-revcomp(right_arm_seq[:half_r]) + revcomp(3' end of left_arm_seq)-3'
    #    Keep total length <= 59 nt whenever possible to avoid unnecessary PAGE cost
    la_r_max_bind = max(18, min(26, 59 - half_r))
    la_r_bind = pick_binding_primer(
        left_arm_seq[-35:], from_start=False, target_tm=target_tm, min_len=18, max_len=la_r_max_bind
    )
    la_r_overhang = revcomp(right_arm_seq[:half_r])
    la_r_full = la_r_overhang + la_r_bind

    # 3) RA_F_ov: 5'-left_arm_seq[-half_l:] + (5' start of right_arm_seq)-3'
    ra_f_max_bind = max(18, min(26, 59 - half_l))
    ra_f_bind = pick_binding_primer(
        right_arm_seq[:35], from_start=True, target_tm=target_tm, min_len=18, max_len=ra_f_max_bind
    )
    ra_f_overhang = left_arm_seq[-half_l:]
    ra_f_full = ra_f_overhang + ra_f_bind

    # 4) RA_R: reverse primer at 3' end of right_arm_seq
    ra_r_bind = pick_binding_primer(right_arm_seq[-35:], from_start=False, target_tm=target_tm)

    g = locus.gene_name
    la_f = PrimerSpec(
        name=f"{g}_LA_F",
        role="donor_left_arm",
        sequence=la_f_bind,
        binding_region=la_f_bind,
        overhang_region="",
        length_nt=len(la_f_bind),
        tm_binding_c=calc_tm(la_f_bind),
        tm_full_c=calc_tm(la_f_bind),
        gc_percent=calc_gc(la_f_bind),
        hairpin_dg=calc_hairpin_dg(la_f_bind),
        homodimer_dg=calc_homodimer_dg(la_f_bind),
        purification_method=determine_purification(len(la_f_bind)),
        template_source="基因组 DNA (兼作 OE-PCR 第二步外侧正向引物)",
        rel_bind_start=la_start,
        rel_bind_end=la_start + len(la_f_bind),
        strand="+",
        notes="扩增左同源臂上游端，同时用于 OE-PCR 拼接全长 Donor",
    )
    la_r = PrimerSpec(
        name=f"{g}_LA_R_ov",
        role="donor_left_arm",
        sequence=la_r_full,
        binding_region=la_r_bind,
        overhang_region=la_r_overhang,
        length_nt=len(la_r_full),
        tm_binding_c=calc_tm(la_r_bind),
        tm_full_c=calc_tm(la_r_full),
        gc_percent=calc_gc(la_r_full),
        hairpin_dg=calc_hairpin_dg(la_r_full),
        homodimer_dg=calc_homodimer_dg(la_r_full),
        purification_method=determine_purification(len(la_r_full)),
        template_source="基因组 DNA",
        rel_bind_start=del_start - len(la_r_bind),
        rel_bind_end=del_start,
        strand="-",
        notes=f"左臂下游引物，5' 携带 {half_r} nt 右臂互补接头 (总重叠 {overlap_len} bp, Tm {overlap_tm_c}°C)",
    )
    ra_f = PrimerSpec(
        name=f"{g}_RA_F_ov",
        role="donor_right_arm",
        sequence=ra_f_full,
        binding_region=ra_f_bind,
        overhang_region=ra_f_overhang,
        length_nt=len(ra_f_full),
        tm_binding_c=calc_tm(ra_f_bind),
        tm_full_c=calc_tm(ra_f_full),
        gc_percent=calc_gc(ra_f_full),
        hairpin_dg=calc_hairpin_dg(ra_f_full),
        homodimer_dg=calc_homodimer_dg(ra_f_full),
        purification_method=determine_purification(len(ra_f_full)),
        template_source="基因组 DNA",
        rel_bind_start=del_end,
        rel_bind_end=del_end + len(ra_f_bind),
        strand="+",
        notes=f"右臂上游引物，5' 携带 {half_l} nt 左臂同源接头 (总重叠 {overlap_len} bp, Tm {overlap_tm_c}°C)",
    )
    ra_r = PrimerSpec(
        name=f"{g}_RA_R",
        role="donor_right_arm",
        sequence=ra_r_bind,
        binding_region=ra_r_bind,
        overhang_region="",
        length_nt=len(ra_r_bind),
        tm_binding_c=calc_tm(ra_r_bind),
        tm_full_c=calc_tm(ra_r_bind),
        gc_percent=calc_gc(ra_r_bind),
        hairpin_dg=calc_hairpin_dg(ra_r_bind),
        homodimer_dg=calc_homodimer_dg(ra_r_bind),
        purification_method=determine_purification(len(ra_r_bind)),
        template_source="基因组 DNA (兼作 OE-PCR 第二步外侧反向引物)",
        rel_bind_start=ra_end - len(ra_r_bind),
        rel_bind_end=ra_end,
        strand="-",
        notes="扩增右同源臂下游端，同时用于 OE-PCR 拼接全长 Donor",
    )

    return DonorDesign(
        method="oe_pcr",
        left_arm_seq=left_arm_seq,
        right_arm_seq=right_arm_seq,
        left_arm_len=len(left_arm_seq),
        right_arm_len=len(right_arm_seq),
        overlap_seq=overlap_seq,
        overlap_len=overlap_len,
        overlap_tm_c=overlap_tm_c,
        full_donor_seq=full_donor_seq,
        full_donor_len=len(full_donor_seq),
        primers=[la_f, la_r, ra_f, ra_r],
        la_amplicon_bp=len(left_arm_seq) + half_r,
        ra_amplicon_bp=len(right_arm_seq) + half_l,
    )
