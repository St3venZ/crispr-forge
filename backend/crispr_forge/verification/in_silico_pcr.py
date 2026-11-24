"""Deterministic In Silico PCR simulator supporting 5' primer overhangs and off-target band detection."""

from __future__ import annotations

from dataclasses import dataclass

from crispr_forge.design.thermo import revcomp


@dataclass(frozen=True)
class BindingHit:
    strand: str  # "+" or "-"
    template_start: int  # 0-based start of matched anchor on + strand
    template_end: int  # 0-based exclusive end of matched anchor on + strand
    anchor_len: int
    mismatches: int


@dataclass(frozen=True)
class PCRProduct:
    template_start: int
    template_end: int
    length_bp: int
    amplicon_seq: str
    fwd_mismatches: int
    rev_mismatches: int


def find_primer_bindings(
    template: str,
    primer: str,
    min_3p_anchor: int = 16,
    exact_3p_tail: int = 12,
    max_anchor_mismatches: int = 1,
) -> list[BindingHit]:
    """
    Locate all biologically plausible binding sites of `primer` (5'->3') on both strands of `template`.
    Requires exact match across the terminal 3' `exact_3p_tail` bases (critical for Taq/Phanta polymerase
    extension) and at most `max_anchor_mismatches` in the preceding anchor bases.
    Supports primers carrying arbitrary 5' overhangs (e.g., OE-PCR tails).
    """
    t = template.upper()
    p = primer.upper()
    anchor_len = min(len(p), min_3p_anchor)
    tail_len = min(anchor_len, exact_3p_tail)
    anchor = p[-anchor_len:]
    tail = anchor[-tail_len:]
    prefix_len = anchor_len - tail_len
    hits: list[BindingHit] = []

    # 1) Forward strand bindings (+): 3' end of primer aligns to the right
    pos = t.find(tail)
    while pos != -1:
        a_start = pos - prefix_len
        a_end = pos + tail_len
        if a_start >= 0:
            sub = t[a_start:a_end]
            mm = sum(1 for a, b in zip(sub, anchor) if a != b)
            if mm <= max_anchor_mismatches:
                hits.append(BindingHit("+", a_start, a_end, anchor_len, mm))
        pos = t.find(tail, pos + 1)

    # 2) Reverse strand bindings (-): primer binds reverse complement of + strand
    rc_anchor = revcomp(anchor)
    rc_tail = rc_anchor[:tail_len]  # 3' end of reverse primer sits at the LEFT on + strand!
    pos = t.find(rc_tail)
    while pos != -1:
        a_start = pos
        a_end = pos + anchor_len
        if a_end <= len(t):
            sub = t[a_start:a_end]
            mm = sum(1 for a, b in zip(sub, rc_anchor) if a != b)
            if mm <= max_anchor_mismatches:
                hits.append(BindingHit("-", a_start, a_end, anchor_len, mm))
        pos = t.find(rc_tail, pos + 1)

    return hits


def _extend_exact_match_left(template: str, primer: str, hit: BindingHit) -> int:
    """Compute how many bases of `primer` match the template continuously leftward from its 3' end."""
    t = template.upper()
    p = primer.upper()
    matched = hit.anchor_len
    p_idx = len(p) - matched - 1
    t_idx = hit.template_start - 1
    while p_idx >= 0 and t_idx >= 0 and p[p_idx] == t[t_idx]:
        matched += 1
        p_idx -= 1
        t_idx -= 1
    return matched


def _extend_exact_match_right_rev(template: str, primer: str, hit: BindingHit) -> int:
    """For a '-' strand primer, compute continuous match rightward on template from 3' end."""
    t = template.upper()
    rc_p = revcomp(primer.upper())
    matched = hit.anchor_len
    p_idx = matched
    t_idx = hit.template_end
    while p_idx < len(rc_p) and t_idx < len(t) and rc_p[p_idx] == t[t_idx]:
        matched += 1
        p_idx += 1
        t_idx += 1
    return matched


def simulate_pcr(
    template: str,
    fwd_primer: str,
    rev_primer: str,
    min_3p_anchor: int = 16,
    max_product_bp: int = 12000,
) -> list[PCRProduct]:
    """
    Simulate double-stranded PCR amplification on `template` with `fwd_primer` and `rev_primer`.
    Accurately incorporates 5' overhangs of both primers into the predicted amplicon sequence.
    """
    t = template.upper()
    f = fwd_primer.upper()
    r = rev_primer.upper()

    f_hits = [h for h in find_primer_bindings(t, f, min_3p_anchor=min_3p_anchor) if h.strand == "+"]
    r_hits = [h for h in find_primer_bindings(t, r, min_3p_anchor=min_3p_anchor) if h.strand == "-"]

    # Also allow swapped orientation (rev binds +, fwd binds -) in case of unexpected mispriming
    f_rev_hits = [h for h in find_primer_bindings(t, f, min_3p_anchor=min_3p_anchor) if h.strand == "-"]
    r_fwd_hits = [h for h in find_primer_bindings(t, r, min_3p_anchor=min_3p_anchor) if h.strand == "+"]

    products: list[PCRProduct] = []

    def _assemble_pair(
        left_primer: str,
        left_hit: BindingHit,
        right_primer: str,
        right_hit: BindingHit,
    ) -> None:
        if right_hit.template_start < left_hit.template_end:
            return
        # Left primer binds on + strand ending at left_hit.template_end
        left_matched = _extend_exact_match_left(t, left_primer, left_hit)
        left_t_start = left_hit.template_end - left_matched
        # Right primer binds on - strand starting at right_hit.template_start
        right_matched = _extend_exact_match_right_rev(t, right_primer, right_hit)
        right_t_end = right_hit.template_start + right_matched

        internal = t[left_hit.template_end : right_hit.template_start]
        # Full amplicon = left_primer (5' overhang + binding) + internal + revcomp(right_primer)
        # Wait: anchor bases of left_primer end at left_hit.template_end, and anchor bases of
        # revcomp(right_primer) start at right_hit.template_start — so we must NOT duplicate
        # any extra matched bases beyond anchor_len!
        left_trim = left_primer[: len(left_primer) - left_hit.anchor_len]
        left_core = left_primer[-left_hit.anchor_len :]
        rc_right = revcomp(right_primer)
        right_core = rc_right[: right_hit.anchor_len]
        right_tail = rc_right[right_hit.anchor_len :]

        amplicon = left_trim + left_core + internal + right_core + right_tail
        # Account for the fact that left_trim/right_tail may partly overlap template if matched > anchor_len
        # Actually, because `internal` starts strictly AFTER `left_hit.template_end` and ends strictly
        # BEFORE `right_hit.template_start`, `left_primer` ends at `left_hit.template_end` and `rc_right`
        # starts at `right_hit.template_start`! So `left_primer + internal + rc_right` is ALWAYS exact!
        amplicon = left_primer + internal + rc_right
        if 40 <= len(amplicon) <= max_product_bp:
            products.append(
                PCRProduct(
                    template_start=left_t_start,
                    template_end=right_t_end,
                    length_bp=len(amplicon),
                    amplicon_seq=amplicon,
                    fwd_mismatches=left_hit.mismatches,
                    rev_mismatches=right_hit.mismatches,
                )
            )

    for fh in f_hits:
        for rh in r_hits:
            _assemble_pair(f, fh, r, rh)
    for rh in r_fwd_hits:
        for fh in f_rev_hits:
            _assemble_pair(r, rh, f, fh)

    # Deduplicate identical coordinates
    dedup: dict[tuple[int, int, int], PCRProduct] = {}
    for prod in products:
        key = (prod.template_start, prod.template_end, prod.length_bp)
        if key not in dedup:
            dedup[key] = prod
    return sorted(dedup.values(), key=lambda p: p.length_bp)
