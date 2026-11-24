"""Automatic GenBank (.gb/.gbk) empty vector parser.

Extracts vector name, Type IIS cloning sites (BsaI/BbsI/Esp3I/BsmBI) & exact 4-nt sticky overhangs
or Inverse PCR scaffold anchor, resistance markers from annotations, and real backbone verification
primers via primer3-py.
"""

from __future__ import annotations

import io
import re
from typing import Literal, Optional

from Bio import SeqIO
from Bio.Seq import Seq

from crispr_forge.design.thermo import pick_binding_primer, revcomp
from crispr_forge.models import CustomPlasmidConfig, PlasmidParseResponse
from crispr_forge.plasmids import SPCAS9_GRNA_SCAFFOLD

# Type IIS enzymes: name -> (top_site, bottom_site, offset_top_cut, overhang_len)
# Example BsaI: 5'-GGTCTC(N1)/(N5)-3' -> cut on top strand is +1 after site, overhang is 4 nt [site_end+1 : site_end+5]
TYPE_IIS_SPECS: dict[str, tuple[str, str, int, int]] = {
    "BsaI": ("GGTCTC", "GAGACC", 1, 4),
    "BbsI": ("GAAGAC", "GTCTTC", 2, 4),
    "Esp3I": ("CGTCTC", "GAGACG", 1, 4),
    "BsmBI": ("CGTCTC", "GAGACG", 1, 4),
}

RESISTANCE_PATTERNS: list[tuple[str, str]] = [
    (r"kan|aph\(3|nptii|neomycin", "Kanamycin (50 ug/mL)"),
    (r"spec|aadA|streptomycin", "Spectinomycin (50 ug/mL)"),
    (r"amp|bla|carbenicillin|beta-lactamase", "Ampicillin (100 ug/mL)"),
    (r"chloramphenicol|\bcat\b|\bcmr\b", "Chloramphenicol (25 ug/mL)"),
    (r"tet[ar]|tetracycline", "Tetracycline (15 ug/mL)"),
    (r"gent|aacC1", "Gentamicin (20 ug/mL)"),
    (r"apra|aac\(3", "Apramycin (50 ug/mL)"),
    (r"hyg|hph", "Hygromycin (100 ug/mL)"),
]


def _extract_circular_slice(seq: str, start: int, length: int) -> str:
    n = len(seq)
    if n == 0:
        return ""
    doubled = seq + seq
    s = start % n
    return doubled[s : s + length]


def _detect_antibiotics(record) -> tuple[str, list[str]]:
    found_markers: list[str] = []
    detected_feats: list[str] = []
    for feat in record.features:
        text_parts = []
        for k in ("label", "gene", "product", "note"):
            vals = feat.qualifiers.get(k, [])
            if vals:
                text_parts.extend(str(v) for v in vals)
        joined = " ".join(text_parts)
        low = joined.lower()
        if not low:
            continue
        if feat.type in ("CDS", "promoter", "rep_origin", "misc_RNA", "misc_feature"):
            label = (
                feat.qualifiers.get("label")
                or feat.qualifiers.get("gene")
                or feat.qualifiers.get("product")
                or [""]
            )[0]
            if label and str(label) not in detected_feats and len(detected_feats) < 12:
                detected_feats.append(str(label))
        for pat, ab_label in RESISTANCE_PATTERNS:
            if re.search(pat, low) and ab_label not in found_markers:
                found_markers.append(ab_label)
    ab_str = " + ".join(found_markers) if found_markers else "请按载体说明确认筛选抗性"
    return ab_str, detected_feats


def _find_scaffold_position(seq: str) -> tuple[Optional[int], str]:
    """Locate the conserved SpCas9 gRNA scaffold core on either strand."""
    core = SPCAS9_GRNA_SCAFFOLD[:24]  # GTTTTAGAGCTAGAAATAGCAAGT
    idx = seq.find(core)
    if idx != -1:
        return idx, "+"
    short_core = SPCAS9_GRNA_SCAFFOLD[:18]  # GTTTTAGAGCTAGAAATA
    idx = seq.find(short_core)
    if idx != -1:
        return idx, "+"
    rc = revcomp(seq)
    idx_rc = rc.find(short_core)
    if idx_rc != -1:
        return idx_rc, "-"
    return None, "+"


def parse_empty_vector_genbank(
    gb_text: str,
    filename: Optional[str] = None,
) -> PlasmidParseResponse:
    """
    Parse an uploaded empty vector GenBank file and infer:
      - Cloning strategy (Golden Gate Type IIS overhangs vs Inverse PCR scaffold anchor)
      - Antibiotic resistance markers
      - Real upstream/downstream backbone colony-PCR & sequencing primers
    """
    try:
        record = SeqIO.read(io.StringIO(gb_text.strip()), "genbank")
    except Exception as exc:
        raise ValueError(f"无法解析 GenBank 文件，请确认为标准 .gb/.gbk 格式 ({exc})") from exc

    raw_seq = str(record.seq).upper()
    seq = "".join(c for c in raw_seq if c in "ACGTN")
    if len(seq) < 120:
        raise ValueError(f"载体序列长度仅 {len(seq)} bp，过短无法作为质粒图谱解析。")

    notes: list[str] = []
    antibiotics, detected_feats = _detect_antibiotics(record)

    # Infer vector display name
    vec_name = record.name if record.name and record.name.lower() not in ("exported", "unknown", ".") else ""
    if not vec_name and filename:
        vec_name = re.sub(r"\.(gb|gbk|genbank)$", "", filename, flags=re.IGNORECASE)
    if not vec_name:
        vec_name = "Custom_Vector"

    # Orient sequence so gRNA scaffold sits on forward (+) strand
    scaf_pos, scaf_strand = _find_scaffold_position(seq)
    oriented_seq = seq if scaf_strand == "+" else revcomp(seq)
    if scaf_strand == "-":
        notes.append("检测到 gRNA Scaffold 位于负链，已自动按转录正链方向对齐解析。")

    # Default fallbacks
    cloning_method: Literal["golden_gate_oligo", "inverse_pcr"] = "golden_gate_oligo"
    oh_f = "TAGT"
    oh_r = "AAAC"
    enzyme_name = "BsaI"
    inv_anchor = SPCAS9_GRNA_SCAFFOLD[:26]
    inv_rev = "ACTAGTATTATACCTAGGACTGAG"
    confidence: Literal["high", "medium", "low"] = "medium"

    if scaf_pos is not None:
        notes.append(f"定位到标准 SpCas9 gRNA Scaffold（坐标 {scaf_pos + 1} bp）。")
        # Check for flanking Type IIS enzyme sites upstream of scaffold (within 2200 bp, e.g., ccdB or lacZa stuffer!)
        found_gg = False
        window_up = min(2400, len(oriented_seq) - 80)
        # Extract linear context ending at scaffold + 60 bp
        ctx_start = scaf_pos - window_up
        ctx = _extract_circular_slice(oriented_seq, ctx_start, window_up + 60)
        scaf_in_ctx = window_up

        for enz, (top_site, bot_site, offset, ov_len) in TYPE_IIS_SPECS.items():
            # Downstream-facing site near scaffold: bottom-strand recognition (bot_site) cuts LEFT of site,
            # leaving sticky overhang right at the 5' start of scaffold (GTTT -> revcomp AAAC)!
            # Upstream-facing site: top-strand recognition (top_site) cuts RIGHT of site, leaving 4-nt overhang.
            # Search right-hand cut site within [scaf_in_ctx - 16, scaf_in_ctx + 12]
            top_hits = [m.start() for m in re.finditer(top_site, ctx)]
            bot_hits = [m.start() for m in re.finditer(bot_site, ctx)]

            # Case 1: Opposing pair flanking a stuffer (e.g., ...[OH_F] [bot_site] ...stuffer... [top_site] [OH_R/GTTT]...)
            # Remember: BsaI top_site GGTCTC cuts +1..+5 downstream; bot_site GAGACC cuts -5..-1 upstream!
            # In pEcgRNA/pJOE8999 stuffer cassette:
            #   Upstream Promoter + OH_F(4nt) + N1 + GAGACC (bot_site) ---[ccdB/lacZ]--- GGTCTC (top_site) + N1 + GTTT(scaffold)
            valid_right = [p for p in top_hits if scaf_in_ctx - 20 <= p <= scaf_in_ctx + 2]
            valid_left = [p for p in bot_hits if p < scaf_in_ctx - 6]
            if valid_right and valid_left:
                r_pos = valid_right[-1]
                # Pick closest upstream bot_site before r_pos
                l_cands = [p for p in valid_left if p < r_pos]
                if l_cands:
                    l_pos = l_cands[-1]
                    # Top overhang sits immediately upstream of bot_site: [l_pos - offset - ov_len : l_pos - offset]
                    cand_oh_f = ctx[l_pos - offset - ov_len : l_pos - offset]
                    # Right overhang on top strand sits at [r_pos + len(top_site) + offset : +ov_len], reverse oligo gets revcomp!
                    r_ov_top = ctx[r_pos + len(top_site) + offset : r_pos + len(top_site) + offset + ov_len]
                    cand_oh_r = revcomp(r_ov_top) if len(r_ov_top) == ov_len else "AAAC"
                    if len(cand_oh_f) == ov_len and len(cand_oh_r) == ov_len:
                        cloning_method = "golden_gate_oligo"
                        enzyme_name = enz
                        oh_f = cand_oh_f
                        oh_r = cand_oh_r
                        found_gg = True
                        confidence = "high"
                        notes.append(
                            f"自动识别出双 {enz} 金门克隆盒（间距 {r_pos - l_pos} bp），"
                            f"推导出精确 5' 粘性末端：正向 `{oh_f}` / 反向 `{oh_r}`。"
                        )
                        break

        if not found_gg:
            # No flanking Type IIS pair found -> Inverse PCR strategy (like pTargetF!)
            cloning_method = "inverse_pcr"
            enzyme_name = "none"
            oh_f = ""
            oh_r = ""
            inv_anchor = _extract_circular_slice(oriented_seq, scaf_pos, 26)
            # Upstream of the existing 20-nt spacer (positions scaf_pos - 46 .. scaf_pos - 20)
            up_prom = _extract_circular_slice(oriented_seq, scaf_pos - 52, 32)
            inv_rev = pick_binding_primer(up_prom, from_start=False, target_tm=60.0, min_len=20, max_len=26)
            confidence = "high"
            notes.append(
                "未检测到成对 Type IIS 替换框，自动匹配为【全质粒反向 PCR 策略】，"
                "已提取真实 Scaffold 锚点与上游启动子反向引物。"
            )

        # Design real backbone verification primers (~160-260 bp upstream/downstream of scaffold)
        if len(oriented_seq) >= 600:
            up_zone = _extract_circular_slice(oriented_seq, scaf_pos - 260, 80)
            down_zone = _extract_circular_slice(oriented_seq, scaf_pos + 130, 80)
            col_f = pick_binding_primer(up_zone, from_start=True, target_tm=59.5, min_len=19, max_len=24)
            col_r = pick_binding_primer(down_zone, from_start=False, target_tm=59.5, min_len=19, max_len=24)
            seq_zone = _extract_circular_slice(oriented_seq, scaf_pos - 210, 50)
            sanger_f = pick_binding_primer(seq_zone, from_start=True, target_tm=59.0, min_len=19, max_len=23)
            notes.append("已基于上传载体真实骨架序列自动生成菌落 PCR 与测序验证引物。")
        else:
            col_f, col_r, sanger_f = None, None, None
    else:
        confidence = "low"
        col_f, col_r, sanger_f = None, None, None
        notes.append(
            "未在图谱中匹配到标准 SpCas9 Scaffold 序列，已保留通用 Golden Gate 默认配置，请核对粘性末端后保存。"
        )

    cfg = CustomPlasmidConfig(
        name=vec_name,
        cloning_method=cloning_method,
        overhang_forward=oh_f,
        overhang_reverse=oh_r,
        restriction_enzyme=enzyme_name,
        inverse_pcr_scaffold_anchor=inv_anchor,
        inverse_pcr_reverse_primer=inv_rev,
        antibiotics=antibiotics,
        curing_note=f"载体 {vec_name}（{len(seq):,} bp）自定义筛选与消除方案，抗性标记：{antibiotics}。",
        colony_pcr_backbone_f=col_f,
        colony_pcr_backbone_r=col_r,
        sanger_backbone_f=sanger_f,
    )
    return PlasmidParseResponse(
        config=cfg,
        vector_length_bp=len(seq),
        detected_features=detected_feats,
        detection_notes=notes,
        confidence=confidence,
    )
