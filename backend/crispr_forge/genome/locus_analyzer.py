"""Locus parser and neighbor-gene / operon RBS safety analyzer (supports GenBank & unannotated FASTA)."""

from __future__ import annotations

import hashlib
from typing import Literal, Optional

from Bio.Seq import Seq
from Bio.SeqRecord import SeqRecord

from crispr_forge.models import DeletionMode, LocusInfo, NeighborGene


def _feature_names(feat) -> list[str]:
    names: list[str] = []
    for key in ("gene", "locus_tag", "old_locus_tag", "gene_synonym"):
        for val in feat.qualifiers.get(key, []):
            for part in str(val).replace(";", ",").split(","):
                cleaned = part.strip()
                if cleaned:
                    names.append(cleaned)
    return names


def _primary_name(feat) -> str:
    for key in ("gene", "locus_tag"):
        vals = feat.qualifiers.get(key, [])
        if vals:
            return str(vals[0])
    return "unknown_CDS"


def _strand_str(strand_int: Optional[int]) -> Literal["+", "-"]:
    return "-" if strand_int == -1 else "+"


def _detect_central_orf(seq: str, min_flank: int = 600) -> tuple[int, int, Literal["+", "-"]]:
    """Fallback ORF finder for unannotated FASTA when user didn't specify target coordinates."""
    n = len(seq)
    best: Optional[tuple[int, int, Literal["+", "-"]]] = None
    best_len = 0
    start_codons = {"ATG", "GTG", "TTG"}
    stop_codons = {"TAA", "TAG", "TGA"}

    for strand, s in (("+", seq), ("-", str(Seq(seq).reverse_complement()))):
        for frame in range(3):
            i = frame
            while i <= n - 3:
                codon = s[i : i + 3]
                if codon in start_codons:
                    j = i + 3
                    while j <= n - 3:
                        if s[j : j + 3] in stop_codons:
                            orf_len = j + 3 - i
                            if strand == "+":
                                r_start, r_end = i, j + 3
                            else:
                                r_start, r_end = n - (j + 3), n - i
                            if (
                                orf_len > best_len
                                and r_start >= min_flank
                                and (n - r_end) >= min_flank
                            ):
                                best_len = orf_len
                                best = (r_start, r_end, strand)
                            i = j + 3
                            break
                        j += 3
                    else:
                        i += 3
                else:
                    i += 3

    if best is not None and best_len >= 180:
        return best

    # Safe central window fallback if sequence has no standard ORF with enough flanks
    margin = min(max(650, n // 4), n // 2 - 150)
    if margin < 300 or n - 2 * margin < 120:
        raise ValueError(
            f"上传的 FASTA 序列总长仅 {n} bp，不足以容纳目标敲除区、左右同源臂及外侧验证引物。"
            "请提供至少包含目标区及上下游各 ≥ 900 bp 侧翼区的序列。"
        )
    return margin, n - margin, "+"


def analyze_locus(
    record: SeqRecord,
    gene_name: str,
    accession: str,
    slice_genome_start: int,
    source: Literal["ncbi_live", "preset_verified", "user_upload_gb", "user_upload_fasta"],
    deletion_mode: DeletionMode = "auto_safe",
    rbs_guard_bp: int = 24,
    custom_target_start: Optional[int] = None,
    custom_target_end: Optional[int] = None,
) -> LocusInfo:
    """
    Parse target CDS (or user-defined FASTA region) and flanking CDS features.
    Detects:
      1. Direct coding-sequence overlap with neighboring genes
      2. Upstream Shine-Dalgarno RBS proximity (within rbs_guard_bp of a neighbor's start codon)
    Computes safe deletion boundaries according to deletion_mode.
    """
    raw_seq = str(record.seq).upper()
    seq_str = "".join(c if c in "ACGTN" else "N" for c in raw_seq if not c.isspace())
    if len(seq_str) < 1200:
        raise ValueError(
            f"输入序列长度仅 {len(seq_str)} bp，至少需要 1200 bp（以容纳敲除区、同源臂及外侧验证引物）。"
        )

    seq_sha256 = hashlib.sha256(seq_str.encode("utf-8")).hexdigest()

    # Path A: Unannotated FASTA mode
    if source == "user_upload_fasta":
        if custom_target_start is not None and custom_target_end is not None:
            t_start = max(0, custom_target_start - 1)
            t_end = min(len(seq_str), custom_target_end)
            if t_end <= t_start + 30:
                raise ValueError("FASTA 自定义敲除区终点必须大于起点至少 30 bp。")
            t_strand: Literal["+", "-"] = "+"
            note = "用户上传纯 FASTA 序列，采用指定坐标作为目标敲除区间（无注释文件，跳过邻近 CDS 重叠分析）。"
        else:
            t_start, t_end, t_strand = _detect_central_orf(seq_str)
            note = (
                f"用户上传纯 FASTA 序列且未指定坐标，系统自动识别中心区最长 ORF "
                f"({t_start + 1}..{t_end}, {t_end - t_start} bp, {t_strand} 链) 作为目标敲除区。"
            )

        safe_del_start, safe_del_end = t_start, t_end
        if deletion_mode == "in_frame_scarless" and (t_end - t_start) >= 120:
            cand_start = t_start + (9 if t_strand == "+" else 21)
            cand_end = t_end - (21 if t_strand == "+" else 9)
            rem = (cand_end - cand_start) % 3
            cand_end -= rem
            if cand_end - cand_start >= 60:
                safe_del_start, safe_del_end = cand_start, cand_end
                note += " 已启用 Keio 式框内无痕敲除。"

        return LocusInfo(
            accession=record.id or accession or "CUSTOM_FASTA",
            organism="User Uploaded Prokaryotic Sequence (FASTA)",
            gene_name=gene_name or record.id or "target_orf",
            locus_tag="FASTA_CUSTOM",
            product="User-defined knockout locus",
            strand=t_strand,
            genome_start=slice_genome_start + t_start,
            genome_end=slice_genome_start + t_end - 1,
            orf_length_bp=t_end - t_start,
            slice_genome_start=slice_genome_start,
            slice_genome_end=slice_genome_start + len(seq_str) - 1,
            locus_sequence=seq_str,
            target_rel_start=t_start,
            target_rel_end=t_end,
            deletion_rel_start=safe_del_start,
            deletion_rel_end=safe_del_end,
            deletion_genome_start=slice_genome_start + safe_del_start,
            deletion_genome_end=slice_genome_start + safe_del_end - 1,
            deleted_length_bp=safe_del_end - safe_del_start,
            sequence_sha256=seq_sha256,
            source=source,
            neighbor_genes=[],
            safety_adjustment_note=note,
        )

    # Path B: Annotated GenBank mode
    query_lower = gene_name.strip().lower()
    # Build expanded alias set from preset registry (e.g. ldhA -> NCgl2810 on NC_003450.3)
    from crispr_forge.genome.ncbi_client import PRESET_REGISTRY

    match_terms = {query_lower}
    for item in PRESET_REGISTRY:
        if item["accession"].upper() == accession.strip().upper():
            if query_lower in (item["gene_name"].lower(), item["locus_tag"].lower()):
                match_terms.add(item["gene_name"].lower())
                match_terms.add(item["locus_tag"].lower())

    cds_features = [f for f in record.features if f.type == "CDS"]
    target_feat = None
    for feat in cds_features:
        if any(n.lower() in match_terms for n in _feature_names(feat)):
            target_feat = feat
            break

    if target_feat is None:
        for feat in record.features:
            if feat.type == "gene" and any(n.lower() in match_terms for n in _feature_names(feat)):
                target_feat = feat
                break

    # Extra tolerance for common C. glutamicum / B. subtilis synonyms (e.g., ldhA -> ldh)
    if target_feat is None and query_lower.endswith("a") and len(query_lower) >= 4:
        alt_query = query_lower[:-1]
        for feat in cds_features:
            if any(n.lower() == alt_query for n in _feature_names(feat)):
                target_feat = feat
                break

    if target_feat is None:
        available = sorted({_primary_name(f) for f in cds_features})
        raise ValueError(
            f"在 GenBank 窗口中未找到目标基因 '{gene_name}'。可用 CDS 基因列表: {', '.join(available[:15])}"
        )

    t_start = int(target_feat.location.start)
    t_end = int(target_feat.location.end)
    t_strand = _strand_str(target_feat.location.strand)
    resolved_gene = (target_feat.qualifiers.get("gene") or [gene_name])[0]
    locus_tag = (target_feat.qualifiers.get("locus_tag") or [""])[0]
    product = (target_feat.qualifiers.get("product") or ["hypothetical protein"])[0]
    organism = str(record.annotations.get("organism", "Prokaryote"))

    neighbors: list[NeighborGene] = []
    safe_del_start = t_start
    safe_del_end = t_end
    adjustment_reasons: list[str] = []

    for feat in cds_features:
        f_start = int(feat.location.start)
        f_end = int(feat.location.end)
        if f_start == t_start and f_end == t_end:
            continue

        f_strand = _strand_str(feat.location.strand)
        f_name = _primary_name(feat)
        f_locus_tag = (feat.qualifiers.get("locus_tag") or [""])[0]
        f_product = (feat.qualifiers.get("product") or [""])[0]

        if f_end <= t_start:
            dist = t_start - f_end
            overlaps_target = False
        elif f_start >= t_end:
            dist = f_start - t_end
            overlaps_target = False
        else:
            dist = -(min(f_end, t_end) - max(f_start, t_start))
            overlaps_target = True

        # Check 5' Shine-Dalgarno RBS zone of neighboring gene
        if f_strand == "+":
            rbs_start, rbs_end = max(0, f_start - rbs_guard_bp), f_start
        else:
            rbs_start, rbs_end = f_end, min(len(seq_str), f_end + rbs_guard_bp)

        overlaps_rbs = max(t_start, rbs_start) < min(t_end, rbs_end)

        warning_parts: list[str] = []
        if overlaps_target:
            warning_parts.append(f"邻近基因 {f_name} 与目标 ORF 直接重叠 {-dist} bp")
            if deletion_mode == "auto_safe":
                if f_start < t_start < f_end:
                    new_start = min(t_end - 90, f_end + 3)
                    if new_start > safe_del_start:
                        safe_del_start = new_start
                        adjustment_reasons.append(
                            f"左边界自动内缩 {safe_del_start - t_start} bp 以保护重叠基因 {f_name}"
                        )
                elif f_start < t_end < f_end:
                    new_end = max(t_start + 90, f_start - 3)
                    if new_end < safe_del_end:
                        safe_del_end = new_end
                        adjustment_reasons.append(
                            f"右边界自动内缩 {t_end - safe_del_end} bp 以保护重叠基因 {f_name}"
                        )
        elif overlaps_rbs:
            warning_parts.append(
                f"邻近基因 {f_name} ({f_strand}) 的 5' RBS 区 ({rbs_guard_bp} bp) 延伸入目标基因边界"
            )
            if deletion_mode == "auto_safe":
                if rbs_start < t_end <= f_start + rbs_guard_bp and f_strand == "+":
                    new_end = max(t_start + 90, rbs_start)
                    if new_end < safe_del_end:
                        safe_del_end = new_end
                        adjustment_reasons.append(
                            f"右边界自动保留 {t_end - safe_del_end} bp 以保护下游 {f_name} 的 RBS 序列"
                        )
                elif f_end <= t_start + rbs_guard_bp and rbs_end > t_start and f_strand == "-":
                    new_start = min(t_end - 90, rbs_end)
                    if new_start > safe_del_start:
                        safe_del_start = new_start
                        adjustment_reasons.append(
                            f"左边界自动保留 {safe_del_start - t_start} bp 以保护相邻 {f_name} 的 RBS 序列"
                        )
        elif dist <= 80:
            warning_parts.append(
                f"邻近基因 {f_name} 距目标 ORF 仅 {dist} bp（可能位于同一操纵子内，已提示关注极性效应）"
            )

        neighbors.append(
            NeighborGene(
                name=f_name,
                locus_tag=f_locus_tag,
                product=f_product,
                strand=f_strand,
                rel_start=f_start,
                rel_end=f_end,
                genome_start=slice_genome_start + f_start,
                genome_end=slice_genome_start + f_end - 1,
                distance_to_target_bp=dist,
                overlaps_target=overlaps_target,
                overlaps_rbs_zone=overlaps_rbs,
                warning="；".join(warning_parts) if warning_parts else None,
            )
        )

    neighbors.sort(key=lambda g: g.rel_start)

    if deletion_mode == "in_frame_scarless":
        if t_strand == "+":
            cand_start = max(safe_del_start, t_start + 9)
            cand_end = min(safe_del_end, t_end - 21)
        else:
            cand_start = max(safe_del_start, t_start + 21)
            cand_end = min(safe_del_end, t_end - 9)
        rem = (cand_end - cand_start) % 3
        if rem != 0:
            cand_end -= rem
        if cand_end - cand_start >= 60:
            safe_del_start, safe_del_end = cand_start, cand_end
            adjustment_reasons.append(
                "已启用 Keio 式框内无痕敲除（保留 N 端 3 密码子与 C 端 7 密码子，严格保持 3 的倍数防止下游极性效应）"
            )
    elif deletion_mode == "strict_full_orf":
        safe_del_start, safe_del_end = t_start, t_end
    elif deletion_mode == "auto_safe" and (safe_del_start != t_start or safe_del_end != t_end):
        rem = (safe_del_end - safe_del_start) % 3
        if rem != 0 and (safe_del_end - rem - safe_del_start) >= 60:
            safe_del_end -= rem

    return LocusInfo(
        accession=accession,
        organism=organism,
        gene_name=resolved_gene,
        locus_tag=locus_tag,
        product=product,
        strand=t_strand,
        genome_start=slice_genome_start + t_start,
        genome_end=slice_genome_start + t_end - 1,
        orf_length_bp=t_end - t_start,
        slice_genome_start=slice_genome_start,
        slice_genome_end=slice_genome_start + len(seq_str) - 1,
        locus_sequence=seq_str,
        target_rel_start=t_start,
        target_rel_end=t_end,
        deletion_rel_start=safe_del_start,
        deletion_rel_end=safe_del_end,
        deletion_genome_start=slice_genome_start + safe_del_start,
        deletion_genome_end=slice_genome_start + safe_del_end - 1,
        deleted_length_bp=safe_del_end - safe_del_start,
        sequence_sha256=seq_sha256,
        source=source,
        neighbor_genes=neighbors,
        safety_adjustment_note="；".join(adjustment_reasons) if adjustment_reasons else None,
    )
