"""Thermodynamic calculations powered by primer3-py and sequence helpers."""

from __future__ import annotations

from typing import Literal

import primer3
from Bio.Seq import Seq


def revcomp(seq: str) -> str:
    return str(Seq(seq.upper()).reverse_complement())


def calc_gc(seq: str) -> float:
    s = seq.upper()
    if not s:
        return 0.0
    gc = sum(1 for c in s if c in ("G", "C"))
    return round(100.0 * gc / len(s), 2)


def calc_tm(seq: str) -> float:
    s = seq.upper()
    if len(s) < 6:
        return 0.0
    # primer3 calc_tm supports up to 60 bp accurately; for longer oligos use 60-bp slice or nearest-neighbor
    if len(s) <= 60:
        return round(float(primer3.calc_tm(s, mv_conc=50.0, dv_conc=1.5, dntp_conc=0.6, dna_conc=250.0)), 2)
    # Long-oligo empirical approximation (SantaLucia-adjusted)
    gc_frac = calc_gc(s) / 100.0
    return round(81.5 + 16.6 * (-1.301) + 41.0 * gc_frac - (600.0 / len(s)), 2)


def calc_hairpin_dg(seq: str) -> float:
    """Return hairpin Gibbs free energy in kcal/mol (negative = stronger secondary structure)."""
    s = seq.upper()
    if len(s) < 8:
        return 0.0
    if len(s) > 60:
        # Evaluate both 3' end (most critical for PCR) and 5' end, return worst
        dg1 = primer3.calc_hairpin(s[-60:], mv_conc=50.0, dv_conc=1.5, dntp_conc=0.6).dg / 1000.0
        dg2 = primer3.calc_hairpin(s[:60], mv_conc=50.0, dv_conc=1.5, dntp_conc=0.6).dg / 1000.0
        return round(min(dg1, dg2), 2)
    res = primer3.calc_hairpin(s, mv_conc=50.0, dv_conc=1.5, dntp_conc=0.6)
    return round(res.dg / 1000.0, 2)


def calc_homodimer_dg(seq: str) -> float:
    """Return homodimer Gibbs free energy in kcal/mol."""
    s = seq.upper()
    if len(s) < 8:
        return 0.0
    target = s[-60:] if len(s) > 60 else s
    res = primer3.calc_homodimer(target, mv_conc=50.0, dv_conc=1.5, dntp_conc=0.6)
    return round(res.dg / 1000.0, 2)


def calc_heterodimer_dg(seq1: str, seq2: str) -> float:
    """Return heterodimer Gibbs free energy in kcal/mol."""
    s1 = seq1.upper()[-60:]
    s2 = seq2.upper()[-60:]
    if len(s1) < 8 or len(s2) < 8:
        return 0.0
    res = primer3.calc_heterodimer(s1, s2, mv_conc=50.0, dv_conc=1.5, dntp_conc=0.6)
    return round(res.dg / 1000.0, 2)


def has_homopolymer_run(seq: str, max_run: int = 5) -> bool:
    s = seq.upper()
    for base in "ACGT":
        if base * max_run in s:
            return True
    return False


def determine_purification(length_nt: int) -> Literal["DSL/OPC", "PAGE", "HPLC"]:
    return "PAGE" if length_nt > 59 else "DSL/OPC"


def score_primer_quality(seq: str, target_tm: float = 60.0) -> float:
    """Lower penalty score is better (used to optimize binding region length/position)."""
    tm = calc_tm(seq)
    gc = calc_gc(seq)
    hp = calc_hairpin_dg(seq)
    hd = calc_homodimer_dg(seq)

    penalty = abs(tm - target_tm) * 2.5
    if gc < 40.0:
        penalty += (40.0 - gc) * 0.8
    elif gc > 62.0:
        penalty += (gc - 62.0) * 0.8

    if hp < -3.0:
        penalty += abs(hp + 3.0) * 3.0
    if hd < -6.0:
        penalty += abs(hd + 6.0) * 2.5

    # Prefer 1-2 G/C in the last 3 bases (3' GC clamp), penalize >3 G/C in last 5 bases
    last5_gc = sum(1 for c in seq[-5:] if c in ("G", "C"))
    if last5_gc == 0:
        penalty += 3.0
    elif last5_gc >= 4:
        penalty += 4.0

    if seq[-1] in ("G", "C"):
        penalty -= 0.6

    if has_homopolymer_run(seq, 5):
        penalty += 8.0
    if "N" in seq:
        penalty += 100.0

    return round(penalty, 3)


def pick_binding_primer(
    template_slice: str,
    from_start: bool,
    target_tm: float = 60.0,
    min_len: int = 18,
    max_len: int = 28,
) -> str:
    """
    Choose optimal primer binding core anchored at the 5' start (forward, from_start=True)
    or 3' end (reverse complement, from_start=False) of `template_slice`.
    Always returns the primer sequence in 5'->3' orientation.
    """
    s = template_slice.upper()
    best_seq = ""
    best_penalty = 1e9

    upper = min(max_len, len(s))
    for length in range(min_len, upper + 1):
        cand = s[:length] if from_start else revcomp(s[-length:])
        pen = score_primer_quality(cand, target_tm=target_tm)
        if pen < best_penalty:
            best_penalty = pen
            best_seq = cand

    if not best_seq:
        length = min(20, len(s))
        best_seq = s[:length] if from_start else revcomp(s[-length:])
    return best_seq
