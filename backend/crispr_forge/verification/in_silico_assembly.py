"""Deterministic In Silico Plasmid Cloning, OE-PCR Stitching, Homologous Recombination, and Re-Cutting Simulator."""

from __future__ import annotations

from crispr_forge.design.sgrna_designer import check_restriction_conflict
from crispr_forge.design.thermo import calc_tm, revcomp
from crispr_forge.models import SgRNACandidate
from crispr_forge.plasmids import PlasmidProfile


def simulate_plasmid_cloning(
    sgrna: SgRNACandidate,
    profile: PlasmidProfile,
) -> tuple[bool, str, str]:
    """
    Simulate sgRNA spacer cloning into the chosen plasmid system:
      - Golden Gate oligo annealing & sticky-end ligation (pEcgRNA, pJOE8999, custom Golden Gate)
      - Inverse PCR whole-plasmid amplification & circularization (pTargetF, custom Inverse PCR)
    Returns (success, assembled_cassette_seq, diagnostic_message).
    """
    spacer = sgrna.spacer_20nt.upper()
    oligo_f = sgrna.cloning_oligo_f.upper()
    oligo_r = sgrna.cloning_oligo_r.upper()

    if len(spacer) != 20 or any(c not in "ACGT" for c in spacer):
        return False, "", f"Spacer 长度 ({len(spacer)}) 或碱基不合法，标准 SpCas9 需要精确 20 nt ACGT。"

    has_enz, enz_detail = check_restriction_conflict(spacer, profile)
    if has_enz:
        return False, "", f"克隆酶切冲突：{enz_detail}"

    if profile.cloning_method == "golden_gate_oligo":
        oh_f = profile.overhang_forward.upper()
        oh_r = profile.overhang_reverse.upper()

        if not oligo_f.startswith(oh_f):
            return (
                False,
                "",
                f"正向 Oligo 5' 粘性末端错误：应以 {oh_f} 开头，实际为 {oligo_f[:len(oh_f)]}",
            )
        if not oligo_r.startswith(oh_r):
            return (
                False,
                "",
                f"反向 Oligo 5' 粘性末端错误：应以 {oh_r} 开头，实际为 {oligo_r[:len(oh_r)]}",
            )

        body_f = oligo_f[len(oh_f) :]
        body_r = oligo_r[len(oh_r) :]
        if body_f != spacer:
            return False, "", "正向 Oligo 克隆体与目标 20-nt Spacer 不一致。"
        if revcomp(body_r) != spacer:
            return (
                False,
                "",
                "退火双链错配：反向 Oligo 去除粘性末端后的反向互补序列与正向 Spacer 不匹配！",
            )

        # Verify sticky end matches upstream promoter suffix (e.g., ...ACTAGT ends with TAGT)
        if oh_f and not profile.promoter_upstream_seq.endswith(oh_f):
            return (
                False,
                "",
                f"载体上游启动子末端与粘性末端 {oh_f} 不兼容。",
            )
        # Verify reverse sticky end matches revcomp of scaffold 5' start (e.g., revcomp(AAAC) == GTTT == scaffold[:4])
        if oh_r and not profile.scaffold_downstream_seq.startswith(revcomp(oh_r)):
            return (
                False,
                "",
                f"反向粘性末端 {oh_r} (互补 {revcomp(oh_r)}) 与 gRNA Scaffold 5' 端 ({profile.scaffold_downstream_seq[:len(oh_r)]}) 不匹配。",
            )

        cassette = profile.promoter_upstream_seq + spacer + profile.scaffold_downstream_seq
        return (
            True,
            cassette,
            f"硅片 {profile.restriction_enzyme} 金门连接成功：5'-{oh_f}/{oh_r} 粘性末端精确互补，"
            f"表达盒总长 {len(cassette)} bp，启动子-N20-Scaffold 完整无移码。",
        )

    # Inverse PCR circularization (e.g., pCas/pTargetF)
    anchor = profile.inverse_pcr_scaffold_anchor.upper()
    if not oligo_f.startswith(spacer):
        return False, "", "反向 PCR 正向引物 5' 端未携带完整的目标 20-nt Spacer。"
    if not oligo_f.endswith(anchor):
        return (
            False,
            "",
            f"反向 PCR 正向引物 3' 端未正确锚定 gRNA Scaffold ({anchor})。",
        )
    if not profile.scaffold_downstream_seq.startswith(anchor[:16]):
        return False, "", "Scaffold 锚定序列与参考 gRNA 骨架不一致。"
    if not oligo_r or len(oligo_r) < 16:
        return False, "", "反向 PCR 通用反向引物缺失或过短。"

    cassette = profile.promoter_upstream_seq + spacer + profile.scaffold_downstream_seq
    return (
        True,
        cassette,
        f"硅片全质粒反向 PCR 环化模拟成功：N20 与 Scaffold 锚点无缝衔接，表达盒总长 {len(cassette)} bp。",
    )


def simulate_oe_pcr(
    la_amplicon: str,
    ra_amplicon: str,
    min_overlap: int = 15,
    max_overlap: int = 80,
) -> tuple[bool, str, str, float]:
    """
    Simulate Overlap Extension PCR stitching of Left Arm amplicon + Right Arm amplicon.
    Returns (success, stitched_sequence, message, overlap_tm_c).
    """
    la = la_amplicon.upper()
    ra = ra_amplicon.upper()
    upper = min(max_overlap, len(la), len(ra))

    matched_len = 0
    for k in range(upper, min_overlap - 1, -1):
        if la[-k:] == ra[:k]:
            matched_len = k
            break

    if matched_len == 0:
        return (
            False,
            "",
            f"硅片 OE-PCR 失败：左臂扩增产物 3' 端与右臂扩增产物 5' 端不存在 ≥ {min_overlap} bp 精确同源重叠区。",
            0.0,
        )

    overlap_seq = la[-matched_len:]
    ov_tm = calc_tm(overlap_seq)
    stitched = la + ra[matched_len:]
    return (
        True,
        stitched,
        f"硅片 OE-PCR 拼接成功：检测到 {matched_len} bp 精确重叠区 (Tm = {ov_tm}°C)，拼接产物 {len(stitched)} bp。",
        ov_tm,
    )


def simulate_homologous_recombination(
    wt_locus: str,
    donor_seq: str,
    left_arm_len: int,
    right_arm_len: int,
) -> tuple[bool, str, str]:
    """
    Simulate double-crossover homologous recombination of `donor_seq` into `wt_locus`.
    Returns (success, edited_locus_sequence, diagnostic_message).
    """
    wt = wt_locus.upper()
    donor = donor_seq.upper()
    la = donor[:left_arm_len]
    ra = donor[-right_arm_len:]

    la_idx = wt.find(la)
    if la_idx == -1:
        return False, "", "同源重组失败：Donor 左同源臂无法在野生型基因座上精确匹配。"
    if wt.count(la) > 1:
        return False, "", "同源重组风险：左同源臂在基因座窗口内存在多处完全重复匹配。"

    ra_idx = wt.find(ra, la_idx + left_arm_len)
    if ra_idx == -1:
        return False, "", "同源重组失败：Donor 右同源臂无法在左同源臂下游精确匹配。"
    if wt.count(ra) > 1:
        return False, "", "同源重组风险：右同源臂在基因座窗口内存在多处完全重复匹配。"

    edited = wt[:la_idx] + donor + wt[ra_idx + right_arm_len :]
    deleted_bp = len(wt) - len(edited)
    return (
        True,
        edited,
        f"硅片双交换同源重组成功：精确敲除 {deleted_bp} bp（编辑前 {len(wt)} bp → 编辑后 {len(edited)} bp）。",
    )


def check_sgrna_cuts_sequence(spacer_20nt: str, sequence: str) -> list[dict]:
    """
    Verify whether SpCas9 guided by `spacer_20nt` could cleave `sequence` (both strands).
    Flags any NGG PAM preceded by an exact 12-bp seed match with <= 2 distal mismatches.
    """
    spacer = spacer_20nt.upper()
    seed = spacer[8:]
    seq = sequence.upper()
    rc_seq = revcomp(seq)
    hits: list[dict] = []

    for strand, s in (("+", seq), ("-", rc_seq)):
        pos = s.find("GG", 21)
        while pos != -1:
            cand = s[pos - 21 : pos - 1]
            pam = s[pos - 1 : pos + 2]
            if len(cand) == 20 and cand[8:] == seed:
                distal_mm = sum(1 for a, b in zip(spacer[:8], cand[:8]) if a != b)
                if distal_mm <= 2:
                    hits.append(
                        {
                            "strand": strand,
                            "pos": pos - 21 if strand == "+" else len(seq) - (pos + 2),
                            "matched_spacer": cand,
                            "pam": pam,
                            "distal_mismatches": distal_mm,
                        }
                    )
            pos = s.find("GG", pos + 1)

    return hits
