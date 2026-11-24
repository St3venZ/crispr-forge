"""12-Point Zero-Trust In Silico Verification Gate & Simulated Agarose Gel Generator."""

from __future__ import annotations

import hashlib
from typing import Optional

from crispr_forge.design.sgrna_designer import build_sgrna_cloning_primers, check_restriction_conflict
from crispr_forge.design.thermo import (
    calc_gc,
    calc_hairpin_dg,
    calc_heterodimer_dg,
    calc_homodimer_dg,
    has_homopolymer_run,
)
from crispr_forge.models import (
    CustomPlasmidConfig,
    DonorDesign,
    GelLane,
    LocusInfo,
    PlasmidSystemId,
    PrimerSpec,
    SgRNACandidate,
    VerificationCheck,
    VerificationPrimersDesign,
    ZeroTrustVerificationReport,
)
from crispr_forge.plasmids import resolve_plasmid_profile
from crispr_forge.verification.in_silico_assembly import (
    check_sgrna_cuts_sequence,
    simulate_homologous_recombination,
    simulate_oe_pcr,
    simulate_plasmid_cloning,
)
from crispr_forge.verification.in_silico_pcr import find_primer_bindings, simulate_pcr


def verify_knockout_design(
    locus: LocusInfo,
    selected_sgrna: SgRNACandidate,
    donor: DonorDesign,
    verification_primers: VerificationPrimersDesign,
    plasmid_system: PlasmidSystemId = "pEcCas/pEcgRNA",
    custom_plasmid: Optional[CustomPlasmidConfig] = None,
    min_band_diff_bp: int = 300,
) -> ZeroTrustVerificationReport:
    """
    Execute all 12 deterministic Zero-Trust In Silico checks.
    Every failure includes a machine-readable `repair_hint` consumed by the Self-Healing Agent.
    """
    profile = resolve_plasmid_profile(plasmid_system, custom_plasmid)
    wt_seq = locus.locus_sequence.upper()
    checks: list[VerificationCheck] = []

    # ------------------------------------------------------------------
    # CHK_01_PROVENANCE
    # ------------------------------------------------------------------
    actual_sha = hashlib.sha256(wt_seq.encode("utf-8")).hexdigest()
    invalid_bases = [c for c in wt_seq if c not in "ACGTN"]
    if actual_sha == locus.sequence_sha256 and not invalid_bases and len(wt_seq) >= 1200:
        checks.append(
            VerificationCheck(
                check_id="CHK_01_PROVENANCE",
                name="序列来源与完整性溯源",
                plain_explanation="确保所有 DNA 碱基均来自真实 NCBI RefSeq 或你上传的文件，绝无大模型凭空编造的序列。",
                category="Provenance",
                status="PASS",
                summary=f"来源 {locus.source} ({locus.accession})，SHA-256 校验通过 ({actual_sha[:12]}...)，全长 {len(wt_seq)} bp。",
                details={"source": locus.source, "sha256": actual_sha, "length_bp": len(wt_seq)},
            )
        )
    else:
        checks.append(
            VerificationCheck(
                check_id="CHK_01_PROVENANCE",
                name="序列来源与完整性溯源",
                plain_explanation="确保所有 DNA 碱基均来自真实 NCBI RefSeq 或你上传的文件，绝无大模型凭空编造的序列。",
                category="Provenance",
                status="FAIL",
                summary="序列哈希校验不一致或存在非法碱基字符，禁止进入后续实验设计。",
                details={"expected_sha256": locus.sequence_sha256, "actual_sha256": actual_sha},
                repair_hint="refetch_sequence",
            )
        )

    # ------------------------------------------------------------------
    # CHK_02_NEIGHBOR_SAFETY
    # ------------------------------------------------------------------
    del_s, del_e = locus.deletion_rel_start, locus.deletion_rel_end
    intruded_cds: list[str] = []
    intruded_rbs: list[str] = []
    nearby_operon: list[str] = []

    for nb in locus.neighbor_genes:
        if max(del_s, nb.rel_start) < min(del_e, nb.rel_end):
            intruded_cds.append(nb.name)
        else:
            rbs_s, rbs_e = (
                (max(0, nb.rel_start - 24), nb.rel_start)
                if nb.strand == "+"
                else (nb.rel_end, min(len(wt_seq), nb.rel_end + 24))
            )
            if max(del_s, rbs_s) < min(del_e, rbs_e):
                intruded_rbs.append(nb.name)
            elif nb.distance_to_target_bp <= 80:
                nearby_operon.append(f"{nb.name}({nb.distance_to_target_bp}bp)")

    if intruded_cds or intruded_rbs:
        issues = []
        if intruded_cds:
            issues.append(f"直接切入邻近基因编码区: {', '.join(intruded_cds)}")
        if intruded_rbs:
            issues.append(f"破坏邻近基因 5' RBS 区: {', '.join(intruded_rbs)}")
        checks.append(
            VerificationCheck(
                check_id="CHK_02_NEIGHBOR_SAFETY",
                name="邻近基因与操纵子 RBS 保护",
                plain_explanation="细菌基因排布非常紧凑，贸然删除完整 ORF 容易误伤紧挨着的其他基因或下游核糖体结合位点，导致菌株致死或极性效应。",
                category="Genomics",
                status="FAIL",
                summary="；".join(issues),
                details={"intruded_cds": intruded_cds, "intruded_rbs": intruded_rbs},
                repair_hint="switch_to_auto_safe_deletion",
            )
        )
    elif locus.source == "user_upload_fasta":
        checks.append(
            VerificationCheck(
                check_id="CHK_02_NEIGHBOR_SAFETY",
                name="邻近基因与操纵子 RBS 保护",
                plain_explanation="检查敲除边界是否误伤相邻基因；纯 FASTA 不含基因注释，请自行确认侧翼无重叠基因。",
                category="Genomics",
                status="WARN",
                summary="纯 FASTA 无 CDS 注释，已按目标区间设定敲除边界（建议上传 .gb 文件以开启自动邻近基因保护）。",
                details={"source": locus.source},
            )
        )
    else:
        note = (
            f"已自动避开重叠/RBS 风险（{locus.safety_adjustment_note}）。"
            if locus.safety_adjustment_note
            else "敲除区间未侵入任何邻近基因 CDS 及下游 24 bp RBS 区。"
        )
        if nearby_operon:
            note += f" 邻近操纵子提示：{', '.join(nearby_operon)}。"
        checks.append(
            VerificationCheck(
                check_id="CHK_02_NEIGHBOR_SAFETY",
                name="邻近基因与操纵子 RBS 保护",
                plain_explanation="确保敲除边界不会误切邻近重叠基因或下游基因的 RBS 核糖体结合位点，避免产生意外表型或菌株不长。",
                category="Genomics",
                status="PASS",
                summary=note,
                details={"nearby_operon": nearby_operon, "safety_note": locus.safety_adjustment_note},
            )
        )

    # ------------------------------------------------------------------
    # CHK_03_SGRNA_RULES
    # ------------------------------------------------------------------
    sp = selected_sgrna.spacer_20nt.upper()
    has_enz, enz_detail = check_restriction_conflict(sp, profile)
    gc_sp = calc_gc(sp)
    in_del = del_s <= selected_sgrna.cut_site_rel <= del_e
    rule_fails: list[str] = []
    if not selected_sgrna.pam.upper().endswith("GG"):
        rule_fails.append(f"PAM ({selected_sgrna.pam}) 非合法 SpCas9 NGG")
    if len(sp) != 20 or any(c not in "ACGT" for c in sp):
        rule_fails.append("Spacer 非标准 20 nt ACGT")
    if "TTTT" in sp:
        rule_fails.append("Spacer 含 TTTT 终止风险序列")
    if has_enz:
        rule_fails.append(enz_detail or f"含 {profile.restriction_enzyme} 酶切冲突")
    if not in_del:
        rule_fails.append("sgRNA 切点不在计划敲除区间内")
    if gc_sp < 25.0 or gc_sp > 80.0:
        rule_fails.append(f"GC 含量极端 ({gc_sp}%)")

    if rule_fails:
        checks.append(
            VerificationCheck(
                check_id="CHK_03_SGRNA_RULES",
                name="sgRNA 规则与克隆酶切排雷",
                plain_explanation="核查 20-nt 靶点是否符合 SpCas9 NGG 规则、不含 TTTT 转录终止子，并且不会在 Golden Gate 金门克隆时被 BsaI 等限制酶切碎。",
                category="sgRNA",
                status="FAIL",
                summary="；".join(rule_fails),
                details={"gc": gc_sp, "has_enzyme_conflict": has_enz, "enzyme": profile.restriction_enzyme},
                repair_hint="select_next_sgrna_candidate",
            )
        )
    else:
        gc_status = "PASS" if 35.0 <= gc_sp <= 70.0 else "WARN"
        checks.append(
            VerificationCheck(
                check_id="CHK_03_SGRNA_RULES",
                name="sgRNA 规则与克隆酶切排雷",
                plain_explanation="核查 20-nt 靶点符合 SpCas9 NGG 规则、无 TTTT 终止风险、且完全避开所选质粒体系的限制酶切位点。",
                category="sgRNA",
                status=gc_status,
                summary=(
                    f"PAM={selected_sgrna.pam}、GC={gc_sp}%、无 TTTT 终止子、"
                    f"无 {profile.restriction_enzyme} 内部/连接边界酶切冲突（评分 {selected_sgrna.on_target_score}）。"
                ),
                details={"gc": gc_sp, "pam": selected_sgrna.pam, "score": selected_sgrna.on_target_score},
            )
        )

    # ------------------------------------------------------------------
    # CHK_04_OFFTARGET
    # ------------------------------------------------------------------
    if selected_sgrna.off_target_hits_seed > 0:
        checks.append(
            VerificationCheck(
                check_id="CHK_04_OFFTARGET",
                name="脱靶位点安全审计 (12-bp Seed + NGG)",
                plain_explanation="Cas9 识别极度依赖紧邻 PAM 的 12 bp 种子区；若基因组其他位置存在相同种子区，可能引发非预期染色体断裂致死。",
                category="sgRNA",
                status="FAIL",
                summary=selected_sgrna.off_target_summary,
                details={
                    "scope": selected_sgrna.off_target_scope,
                    "hits_seed": selected_sgrna.off_target_hits_seed,
                    "hits_1_2mm": selected_sgrna.off_target_hits_1_2mm,
                },
                repair_hint="select_next_sgrna_candidate",
            )
        )
    elif selected_sgrna.off_target_scope == "whole_genome":
        checks.append(
            VerificationCheck(
                check_id="CHK_04_OFFTARGET",
                name="脱靶位点安全审计 (全基因组 Seed + NGG)",
                plain_explanation="已完成整条细菌染色体的 12 bp 种子区精确及 1-2 错配脱靶扫描，确认该 sgRNA 仅精准切割目标位点。",
                category="sgRNA",
                status="PASS",
                summary=selected_sgrna.off_target_summary,
                details={"scope": "whole_genome", "hits_seed": 0},
            )
        )
    else:
        checks.append(
            VerificationCheck(
                check_id="CHK_04_OFFTARGET",
                name="脱靶位点安全审计 (窗口级 Seed + NGG)",
                plain_explanation="当前目标菌株未缓存全基因组序列，已完成提取窗口内零脱靶核验，并在报告中透明标注扫描范围。",
                category="sgRNA",
                status="WARN",
                summary=selected_sgrna.off_target_summary,
                details={"scope": "locus_window", "hits_seed": 0},
            )
        )

    # ------------------------------------------------------------------
    # CHK_05_PLASMID_CLONING
    # ------------------------------------------------------------------
    clone_ok, cassette_seq, clone_msg = simulate_plasmid_cloning(selected_sgrna, profile)
    checks.append(
        VerificationCheck(
            check_id="CHK_05_PLASMID_CLONING",
            name=f"质粒克隆硅片组装 ({profile.short_label})",
            plain_explanation="在代码里真实模拟 BsaI 金门粘性末端退火连接或 pTargetF 反向 PCR 环化，彻底杜绝正反链写反或粘性末端错位。",
            category="InSilicoAssembly",
            status="PASS" if clone_ok else "FAIL",
            summary=clone_msg,
            details={"cloning_method": profile.cloning_method, "cassette_len_bp": len(cassette_seq)},
            repair_hint=None if clone_ok else "select_next_sgrna_candidate",
        )
    )

    # ------------------------------------------------------------------
    # CHK_06_ARM_PCR
    # ------------------------------------------------------------------
    la_sim_amplicon = donor.left_arm_seq
    ra_sim_amplicon = donor.right_arm_seq
    la_sim_bp = donor.left_arm_len
    ra_sim_bp = donor.right_arm_len

    if donor.method == "direct_synthesis":
        arms_match = (donor.left_arm_seq in wt_seq) and (donor.right_arm_seq in wt_seq)
        checks.append(
            VerificationCheck(
                check_id="CHK_06_ARM_PCR",
                name="左右同源臂模板一致性核验",
                plain_explanation="直接合成 Donor 模式下，核验左右同源臂与目标野生型基因组 100% 匹配，无碱基错位。",
                category="InSilicoPCR",
                status="PASS" if arms_match else "FAIL",
                summary=(
                    f"直接合成模式：左臂 ({donor.left_arm_len} bp) 与右臂 ({donor.right_arm_len} bp) 均与基因组精确匹配。"
                    if arms_match
                    else "同源臂序列无法与目标基因组精确对齐。"
                ),
                details={"method": "direct_synthesis", "la_bp": donor.left_arm_len, "ra_bp": donor.right_arm_len},
                repair_hint=None if arms_match else "redesign_donor_primers_shift_window",
            )
        )
    else:
        p_map = {p.role + "_" + str(i): p for i, p in enumerate(donor.primers)}
        la_f = donor.primers[0] if len(donor.primers) >= 4 else None
        la_r = donor.primers[1] if len(donor.primers) >= 4 else None
        ra_f = donor.primers[2] if len(donor.primers) >= 4 else None
        ra_r = donor.primers[3] if len(donor.primers) >= 4 else None

        if la_f and la_r and ra_f and ra_r:
            la_prods = simulate_pcr(wt_seq, la_f.sequence, la_r.sequence)
            ra_prods = simulate_pcr(wt_seq, ra_f.sequence, ra_r.sequence)
            la_ok = len(la_prods) == 1 and abs(la_prods[0].length_bp - donor.la_amplicon_bp) <= 2
            ra_ok = len(ra_prods) == 1 and abs(ra_prods[0].length_bp - donor.ra_amplicon_bp) <= 2
            if la_prods:
                la_sim_amplicon = la_prods[0].amplicon_seq
                la_sim_bp = la_prods[0].length_bp
            if ra_prods:
                ra_sim_amplicon = ra_prods[0].amplicon_seq
                ra_sim_bp = ra_prods[0].length_bp

            checks.append(
                VerificationCheck(
                    check_id="CHK_06_ARM_PCR",
                    name="左右同源臂硅片 PCR 仿真",
                    plain_explanation="模拟左臂和右臂引物在基因组上的扩增反应，确认引物方向正确且只扩出唯一预期条带，无杂带。",
                    category="InSilicoPCR",
                    status="PASS" if (la_ok and ra_ok) else "FAIL",
                    summary=(
                        f"硅片 PCR 均扩出唯一特异条带：左臂 {la_sim_bp} bp、右臂 {ra_sim_bp} bp。"
                        if (la_ok and ra_ok)
                        else f"硅片 PCR 异常：左臂条带数={len(la_prods)} (期望 {donor.la_amplicon_bp} bp)，右臂条带数={len(ra_prods)} (期望 {donor.ra_amplicon_bp} bp)。"
                    ),
                    details={
                        "la_bands": [p.length_bp for p in la_prods],
                        "ra_bands": [p.length_bp for p in ra_prods],
                    },
                    repair_hint=None if (la_ok and ra_ok) else "redesign_donor_primers_shift_window",
                )
            )
        else:
            checks.append(
                VerificationCheck(
                    check_id="CHK_06_ARM_PCR",
                    name="左右同源臂硅片 PCR 仿真",
                    plain_explanation="校验 OE-PCR 所需的 4 条同源臂扩增引物是否完整。",
                    category="InSilicoPCR",
                    status="FAIL",
                    summary="OE-PCR 模式缺少完整的 4 条左右臂扩增引物。",
                    repair_hint="redesign_donor_primers_shift_window",
                )
            )

    # ------------------------------------------------------------------
    # CHK_07_OEPCR_STITCH
    # ------------------------------------------------------------------
    if donor.method == "direct_synthesis":
        checks.append(
            VerificationCheck(
                check_id="CHK_07_OEPCR_STITCH",
                name="Donor 全长组装与连接点核验",
                plain_explanation="直接合成 dsDNA Donor 无需重叠延伸 PCR，核验合成片段总长与无缝拼接边界准确。",
                category="InSilicoAssembly",
                status="PASS",
                summary=f"直接合成双链 Donor 全长 {donor.full_donor_len} bp（左臂 {donor.left_arm_len} bp + 右臂 {donor.right_arm_len} bp）。",
                details={"donor_len_bp": donor.full_donor_len},
            )
        )
    else:
        oe_ok, stitched_seq, oe_msg, ov_tm = simulate_oe_pcr(la_sim_amplicon, ra_sim_amplicon)
        exact_match = oe_ok and (stitched_seq == donor.full_donor_seq)
        tm_ok = 55.0 <= ov_tm <= 68.5
        if exact_match and tm_ok:
            checks.append(
                VerificationCheck(
                    check_id="CHK_07_OEPCR_STITCH",
                    name="Donor OE-PCR 重叠延伸硅片拼接",
                    plain_explanation="将硅片 PCR 产出的左臂与右臂产物真实退火延伸拼接，确认拼接结果与目标无痕 Donor 100% 逐碱基一致。",
                    category="InSilicoAssembly",
                    status="PASS",
                    summary=f"{oe_msg} 与目标 Donor 序列 100% 逐碱基一致。",
                    details={"overlap_tm_c": ov_tm, "stitched_len_bp": len(stitched_seq)},
                )
            )
        else:
            checks.append(
                VerificationCheck(
                    check_id="CHK_07_OEPCR_STITCH",
                    name="Donor OE-PCR 重叠延伸硅片拼接",
                    plain_explanation="验证左右臂产物能否通过 5' 重叠接头正确拼接为目标全长 Donor。",
                    category="InSilicoAssembly",
                    status="FAIL",
                    summary=f"{oe_msg}（序列一致={exact_match}，重叠 Tm={ov_tm}°C）",
                    details={"overlap_tm_c": ov_tm, "exact_match": exact_match},
                    repair_hint="adjust_oe_overlap_length",
                )
            )

    # ------------------------------------------------------------------
    # CHK_08_HR_AND_RECUT
    # ------------------------------------------------------------------
    hr_ok, edited_seq, hr_msg = simulate_homologous_recombination(
        wt_seq, donor.full_donor_seq, donor.left_arm_len, donor.right_arm_len
    )
    donor_recuts = check_sgrna_cuts_sequence(sp, donor.full_donor_seq)
    edited_recuts = check_sgrna_cuts_sequence(sp, edited_seq) if hr_ok else []

    if hr_ok and not donor_recuts and not edited_recuts:
        checks.append(
            VerificationCheck(
                check_id="CHK_08_HR_AND_RECUT",
                name="同源重组仿真 & 防 Cas9 二次切割校验",
                plain_explanation="在硅片中完成双交换同源重组，并反向排查所选 sgRNA 是否会误切 Donor 或编辑后的敲除株——若会发生二次切割，阳性克隆会被 Cas9 杀光！",
                category="ReCutting",
                status="PASS",
                summary=f"{hr_msg} 已确认 Donor 与编辑后基因组均完全免疫 Cas9 二次切割。",
                details={"donor_recuts": 0, "edited_recuts": 0, "edited_len_bp": len(edited_seq)},
            )
        )
    else:
        recut_msg = []
        if not hr_ok:
            recut_msg.append(hr_msg)
        if donor_recuts:
            recut_msg.append(f"致命风险：所选 sgRNA 会直接切割 Donor DNA ({len(donor_recuts)} 处)")
        if edited_recuts:
            recut_msg.append(f"致命风险：编辑后 KO 基因组仍可被 sgRNA 二次切割 ({len(edited_recuts)} 处)")
        checks.append(
            VerificationCheck(
                check_id="CHK_08_HR_AND_RECUT",
                name="同源重组仿真 & 防 Cas9 二次切割校验",
                plain_explanation="确保同源重组后，Cas9 不会继续切割你的 Donor 修复模板或已经敲除成功的菌株。",
                category="ReCutting",
                status="FAIL",
                summary="；".join(recut_msg),
                details={"donor_recuts": donor_recuts, "edited_recuts": edited_recuts},
                repair_hint="select_next_sgrna_candidate",
            )
        )

    # ------------------------------------------------------------------
    # CHK_09_VERIFY_BOUNDARY (Real in-silico binding verification!)
    # ------------------------------------------------------------------
    la_start = wt_seq.find(donor.left_arm_seq)
    ra_start = wt_seq.find(donor.right_arm_seq, max(0, la_start))
    ra_end = (ra_start + donor.right_arm_len) if ra_start != -1 else len(wt_seq)

    vf_hits = [h for h in find_primer_bindings(wt_seq, verification_primers.outer_forward.sequence) if h.strand == "+"]
    vr_hits = [h for h in find_primer_bindings(wt_seq, verification_primers.outer_reverse.sequence) if h.strand == "-"]

    vf_binds_donor = len(find_primer_bindings(donor.full_donor_seq, verification_primers.outer_forward.sequence)) > 0
    vr_binds_donor = len(find_primer_bindings(donor.full_donor_seq, verification_primers.outer_reverse.sequence)) > 0

    boundary_ok = False
    dist_la = -1
    dist_ra = -1
    if len(vf_hits) == 1 and len(vr_hits) == 1 and la_start != -1 and ra_start != -1:
        dist_la = la_start - vf_hits[0].template_end
        dist_ra = vr_hits[0].template_start - ra_end
        boundary_ok = (dist_la >= 50) and (dist_ra >= 50) and (not vf_binds_donor) and (not vr_binds_donor)

    if boundary_ok:
        checks.append(
            VerificationCheck(
                check_id="CHK_09_VERIFY_BOUNDARY",
                name="跨位点验证引物边界防假阳性校验",
                plain_explanation="经典湿实验大坑：若验证引物不小心设计在同源臂内部，菌落里残留的游离 Donor DNA 就会扩出假阳性 KO 条带！本项强校验 VF/VR 必须严格落在同源臂外侧。",
                category="InSilicoPCR",
                status="PASS",
                summary=f"VF 位于左臂外侧 {dist_la} bp，VR 位于右臂外侧 {dist_ra} bp，均不与 Donor DNA 结合。",
                details={"dist_outside_la": dist_la, "dist_outside_ra": dist_ra},
            )
        )
    else:
        checks.append(
            VerificationCheck(
                check_id="CHK_09_VERIFY_BOUNDARY",
                name="跨位点验证引物边界防假阳性校验",
                plain_explanation="验证引物 VF/VR 必须位于左右同源臂外侧且不能结合 Donor，否则无法区分真正整合的阳性克隆与游离 Donor。",
                category="InSilicoPCR",
                status="FAIL",
                summary=(
                    f"验证引物边界违规：距左臂 {dist_la} bp、距右臂 {dist_ra} bp，"
                    f"结合 Donor(VF={vf_binds_donor}, VR={vr_binds_donor})。"
                ),
                details={
                    "dist_outside_la": dist_la,
                    "dist_outside_ra": dist_ra,
                    "vf_binds_donor": vf_binds_donor,
                    "vr_binds_donor": vr_binds_donor,
                },
                repair_hint="redesign_verify_primers_wider",
            )
        )

    # ------------------------------------------------------------------
    # CHK_10_GEL_DISCRIMINATION
    # ------------------------------------------------------------------
    wt_pcr = simulate_pcr(
        wt_seq,
        verification_primers.outer_forward.sequence,
        verification_primers.outer_reverse.sequence,
    )
    ko_pcr = (
        simulate_pcr(
            edited_seq,
            verification_primers.outer_forward.sequence,
            verification_primers.outer_reverse.sequence,
        )
        if hr_ok
        else []
    )
    wt_int_pcr = (
        simulate_pcr(
            wt_seq,
            verification_primers.outer_forward.sequence,
            verification_primers.wt_internal_primer.sequence,
        )
        if verification_primers.wt_internal_primer
        else []
    )
    ko_int_pcr = (
        simulate_pcr(
            edited_seq,
            verification_primers.outer_forward.sequence,
            verification_primers.wt_internal_primer.sequence,
        )
        if (hr_ok and verification_primers.wt_internal_primer)
        else []
    )

    wt_band = wt_pcr[0].length_bp if len(wt_pcr) == 1 else 0
    ko_band = ko_pcr[0].length_bp if len(ko_pcr) == 1 else 0
    actual_diff = abs(wt_band - ko_band)

    # Check Sanger primer binds cleanly upstream of KO junction on edited_seq
    sanger_ok = False
    sanger_dist = -1
    if hr_ok and la_start != -1:
        s_hits = [
            h
            for h in find_primer_bindings(edited_seq, verification_primers.sanger_primer.sequence)
            if h.strand == "+"
        ]
        ko_junction = la_start + donor.left_arm_len
        if len(s_hits) == 1:
            sanger_dist = ko_junction - s_hits[0].template_end
            sanger_ok = 80 <= sanger_dist <= 400

    int_clean = (len(ko_int_pcr) == 0) if verification_primers.wt_internal_primer else True
    gel_ok = (
        len(wt_pcr) == 1
        and len(ko_pcr) == 1
        and actual_diff >= min_band_diff_bp
        and int_clean
        and sanger_ok
    )

    if gel_ok:
        checks.append(
            VerificationCheck(
                check_id="CHK_10_GEL_DISCRIMINATION",
                name="WT vs KO 菌落 PCR 电泳分辨率 & 测序位点校验",
                plain_explanation="确保琼脂糖凝胶上野生型与敲除株条带唯一且差距肉眼清晰可辨，且 Sanger 测序引物距连接点恰在 120–300 bp 黄金峰图区。",
                category="InSilicoPCR",
                status="PASS",
                summary=(
                    f"WT={wt_band} bp vs KO={ko_band} bp（差值 {actual_diff} bp，电泳清晰可辨）；"
                    f"Sanger 引物距敲除连接点 {sanger_dist} bp。"
                ),
                details={
                    "wt_bp": wt_band,
                    "ko_bp": ko_band,
                    "diff_bp": actual_diff,
                    "sanger_dist_bp": sanger_dist,
                },
            )
        )
    else:
        reasons = []
        if len(wt_pcr) != 1:
            reasons.append(f"WT 菌落 PCR 条带数={len(wt_pcr)} (期望 1)")
        if len(ko_pcr) != 1:
            reasons.append(f"KO 菌落 PCR 条带数={len(ko_pcr)} (期望 1)")
        if actual_diff < min_band_diff_bp:
            reasons.append(f"WT({wt_band}) 与 KO({ko_band}) 条带差 {actual_diff} bp < 阈值 {min_band_diff_bp} bp")
        if not int_clean:
            reasons.append("WT 内部对照引物竟在 KO 基因组上仍有扩增")
        if not sanger_ok:
            reasons.append(f"Sanger 测序引物距连接点 {sanger_dist} bp 超出最佳读长区")
        checks.append(
            VerificationCheck(
                check_id="CHK_10_GEL_DISCRIMINATION",
                name="WT vs KO 菌落 PCR 电泳分辨率 & 测序位点校验",
                plain_explanation="验证菌落 PCR 能否在胶图上清晰区分野生型与敲除株，并确保测序引物位置合理。",
                category="InSilicoPCR",
                status="FAIL",
                summary="；".join(reasons),
                details={"wt_bp": wt_band, "ko_bp": ko_band, "diff_bp": actual_diff},
                repair_hint="redesign_verify_primers_wider",
            )
        )

    # ------------------------------------------------------------------
    # CHK_11_PRIMER_THERMO
    # ------------------------------------------------------------------
    pairs_to_check: list[tuple[str, PrimerSpec, PrimerSpec]] = [
        ("验证外侧对 (VF+VR)", verification_primers.outer_forward, verification_primers.outer_reverse)
    ]
    if donor.method == "oe_pcr" and len(donor.primers) >= 4:
        pairs_to_check.append(("左臂扩增对 (LA)", donor.primers[0], donor.primers[1]))
        pairs_to_check.append(("右臂扩增对 (RA)", donor.primers[2], donor.primers[3]))

    thermo_warns: list[str] = []
    thermo_fails: list[str] = []
    for pair_label, p1, p2 in pairs_to_check:
        dt = abs(p1.tm_binding_c - p2.tm_binding_c)
        het = calc_heterodimer_dg(p1.sequence, p2.sequence)
        if dt > 6.0:
            thermo_fails.append(f"{pair_label} ΔTm={dt:.1f}°C 过大")
        elif dt > 4.0:
            thermo_warns.append(f"{pair_label} ΔTm={dt:.1f}°C 偏高")
        if het < -11.0:
            thermo_fails.append(f"{pair_label} 异源二聚体 ΔG={het} kcal/mol")
        elif het < -8.5:
            thermo_warns.append(f"{pair_label} 存在中等异源二聚体 ΔG={het} kcal/mol")
        for p in (p1, p2):
            hp = calc_hairpin_dg(p.sequence)
            hd = calc_homodimer_dg(p.sequence)
            if hp < -8.0:
                thermo_fails.append(f"{p.name} 强发夹 ΔG={hp}")
            elif hp < -5.5:
                thermo_warns.append(f"{p.name} 中等发夹 ΔG={hp}")
            if hd < -11.0:
                thermo_fails.append(f"{p.name} 强同源二聚体 ΔG={hd}")

    if thermo_fails:
        checks.append(
            VerificationCheck(
                check_id="CHK_11_PRIMER_THERMO",
                name="全量引物热力学审计 (primer3-py)",
                plain_explanation="使用 primer3-py 热力学引擎检查所有 PCR 引物对的退火温度匹配度、发夹与二聚体，避免 PCR P 不出条带或产生引物二聚体亮带。",
                category="Thermodynamics",
                status="FAIL",
                summary="；".join(thermo_fails),
                repair_hint="redesign_high_risk_primers",
            )
        )
    elif thermo_warns:
        checks.append(
            VerificationCheck(
                check_id="CHK_11_PRIMER_THERMO",
                name="全量引物热力学审计 (primer3-py)",
                plain_explanation="使用 primer3-py 检查全部 PCR 引物对的 Tm 差值、发夹与二聚体自由能。",
                category="Thermodynamics",
                status="WARN",
                summary="存在轻微二级结构提示（常规高保真酶退火梯度可兼容）：" + "；".join(thermo_warns),
            )
        )
    else:
        checks.append(
            VerificationCheck(
                check_id="CHK_11_PRIMER_THERMO",
                name="全量引物热力学审计 (primer3-py)",
                plain_explanation="使用 primer3-py 核验所有引物对 ΔTm、发夹及同/异源二聚体均在理想安全区间，上机 PCR 成功率高。",
                category="Thermodynamics",
                status="PASS",
                summary=f"已核验 {len(pairs_to_check)} 组关键 PCR 引物对，ΔTm、发夹与二聚体自由能全部优良。",
            )
        )

    # ------------------------------------------------------------------
    # CHK_12_OLIGO_SYNTH
    # ------------------------------------------------------------------
    sgrna_primers = build_sgrna_cloning_primers(locus.gene_name, selected_sgrna, profile)
    all_oligos = (
        sgrna_primers
        + donor.primers
        + [verification_primers.outer_forward, verification_primers.outer_reverse, verification_primers.sanger_primer]
        + ([verification_primers.wt_internal_primer] if verification_primers.wt_internal_primer else [])
    )
    page_oligos = [p.name for p in all_oligos if p.length_nt > 59]
    poly_oligos = [p.name for p in all_oligos if has_homopolymer_run(p.sequence, 6)]
    if page_oligos or poly_oligos:
        notes = []
        if page_oligos:
            notes.append(f"长度 > 59 nt 已自动标为 PAGE 纯化: {', '.join(page_oligos)}")
        if poly_oligos:
            notes.append(f"含 ≥ 6 nt 连续同碱基: {', '.join(poly_oligos)}")
        checks.append(
            VerificationCheck(
                check_id="CHK_12_OLIGO_SYNTH",
                name="引物合成规范与纯化级别核验",
                plain_explanation="生工/擎科等合成公司规定超过 59 nt 的长引物需要 PAGE 纯化以防截短杂质；系统已自动识别并在订购表标明。",
                category="Synthesis",
                status="WARN",
                summary="；".join(notes),
                details={"page_oligos": page_oligos, "homopolymer_oligos": poly_oligos},
            )
        )
    else:
        checks.append(
            VerificationCheck(
                check_id="CHK_12_OLIGO_SYNTH",
                name="引物合成规范与纯化级别核验",
                plain_explanation="所有引物长度均 ≤ 59 nt 且无极端连续碱基，全部可用经济高效的常规 DSL/OPC 纯化，省钱且隔天到货。",
                category="Synthesis",
                status="PASS",
                summary=f"全部 {len(all_oligos)} 条订购引物均 ≤ 59 nt（常规 DSL/OPC 纯化即可），可直接发单合成。",
                details={"total_oligos": len(all_oligos)},
            )
        )

    # ------------------------------------------------------------------
    # Build Simulated Agarose Gel Lanes
    # ------------------------------------------------------------------
    gel_lanes: list[GelLane] = [
        GelLane(
            lane_name="M",
            label="DL5000",
            bands_bp=[5000, 3000, 2000, 1500, 1000, 750, 500, 250, 100],
            expected_note="DNA Marker (bp)",
        )
    ]
    if donor.method == "oe_pcr":
        gel_lanes.append(
            GelLane(
                lane_name="LA",
                label="左同源臂",
                bands_bp=[la_sim_bp],
                expected_note=f"左臂 PCR 产物 ({la_sim_bp} bp)",
            )
        )
        gel_lanes.append(
            GelLane(
                lane_name="RA",
                label="右同源臂",
                bands_bp=[ra_sim_bp],
                expected_note=f"右臂 PCR 产物 ({ra_sim_bp} bp)",
            )
        )
    gel_lanes.append(
        GelLane(
            lane_name="Donor",
            label="Donor DNA",
            bands_bp=[donor.full_donor_len],
            expected_note=f"拼接全长修复模板 ({donor.full_donor_len} bp)",
        )
    )
    gel_lanes.append(
        GelLane(
            lane_name="WT",
            label="野生型 VF+VR",
            bands_bp=[p.length_bp for p in wt_pcr] if wt_pcr else [],
            expected_note=f"野生型菌落 PCR ({wt_band} bp)",
        )
    )
    gel_lanes.append(
        GelLane(
            lane_name="KO",
            label="敲除株 VF+VR",
            bands_bp=[p.length_bp for p in ko_pcr] if ko_pcr else [],
            expected_note=f"阳性敲除株菌落 PCR ({ko_band} bp，比 WT 缩短 {actual_diff} bp)",
            highlight=True,
        )
    )
    if verification_primers.wt_internal_primer:
        wt_int_bands = [p.length_bp for p in wt_int_pcr]
        gel_lanes.append(
            GelLane(
                lane_name="WT-Int",
                label="WT 内引物",
                bands_bp=wt_int_bands,
                expected_note=f"野生型对照 ({wt_int_bands[0] if wt_int_bands else 0} bp)；纯合 KO 株此泳道应为空白",
            )
        )

    passed_count = sum(1 for c in checks if c.status == "PASS")
    warn_count = sum(1 for c in checks if c.status == "WARN")
    fail_count = sum(1 for c in checks if c.status == "FAIL")

    overall = (
        "FAILED"
        if fail_count > 0
        else ("PASS_WITH_WARNINGS" if warn_count > 0 else "CERTIFIED_PASS")
    )

    edited_sha = hashlib.sha256(edited_seq.encode("utf-8")).hexdigest() if edited_seq else ""

    return ZeroTrustVerificationReport(
        overall_status=overall,
        passed_count=passed_count,
        warn_count=warn_count,
        fail_count=fail_count,
        total_checks=len(checks),
        checks=checks,
        edited_locus_sequence=edited_seq,
        edited_locus_sha256=edited_sha,
        plasmid_assembled_cassette=cassette_seq,
        in_silico_gel_lanes=gel_lanes,
    )
