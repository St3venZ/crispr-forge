"""Fast Whole-Genome & Locus-Window SpCas9 Off-Target Scanner (12-bp Seed + NGG PAM).

Builds an in-memory 12-bp seed hash table for cached full bacterial genomes (e.g. NC_000913.3, 4.64 Mb)
in ~1-2s and answers exact-seed and 1-2 distal mismatch off-target queries in milliseconds with zero
external binary dependencies. Gracefully falls back to locus-window scanning with explicit scope reporting.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
import re
from typing import Literal, Optional

from Bio import Entrez
from Bio.Seq import Seq

from crispr_forge.config import settings


@dataclass(frozen=True)
class OffTargetResult:
    scope: Literal["whole_genome", "locus_window"]
    exact_seed_hits: int
    distal_1_2mm_hits: int
    summary: str


class WholeGenomeSeedIndex:
    """12-bp seed (positions 8..20 of spacer) + NGG PAM hash index for a full genome."""

    def __init__(self, accession: str, seq: str) -> None:
        self.accession = accession
        self.seq = seq.upper()
        self.genome_len = len(self.seq)
        # seed_12nt -> list of full 20-nt spacers occurring at NGG PAM sites on + or - strand
        self._index: dict[str, list[str]] = defaultdict(list)
        self._build()

    def _build(self) -> None:
        s = self.seq
        n = self.genome_len
        idx = self._index

        # Forward strand: spacer[i-20:i] followed by NGG at s[i:i+3] (s[i+1:i+3] == "GG")
        pos = s.find("GG", 21)
        while pos != -1:
            spacer_start = pos - 21
            if spacer_start >= 0:
                spacer = s[spacer_start : pos - 1]
                if "N" not in spacer:
                    idx[spacer[8:]].append(spacer)
            pos = s.find("GG", pos + 1)

        # Reverse strand: CCN at s[i:i+3] (s[i:i+2] == "CC") corresponds to NGG on reverse strand
        # Spacer on '-' strand is revcomp(s[i+3 : i+23])
        rc_table = str.maketrans("ACGTN", "TGCAN")
        pos = s.find("CC", 0, n - 22)
        while pos != -1:
            raw = s[pos + 3 : pos + 23]
            if len(raw) == 20 and "N" not in raw:
                spacer = raw.translate(rc_table)[::-1]
                idx[spacer[8:]].append(spacer)
            pos = s.find("CC", pos + 1, n - 22)

    def query(self, spacer_20nt: str) -> OffTargetResult:
        spacer = spacer_20nt.upper()
        seed = spacer[8:]
        candidates = self._index.get(seed, [])

        # Count occurrences excluding the single intended on-target site
        exact_total = 0
        distal_1_2mm = 0
        for cand in candidates:
            if cand == spacer:
                exact_total += 1
            else:
                mm = sum(1 for a, b in zip(spacer[:8], cand[:8]) if a != b)
                if mm <= 2:
                    distal_1_2mm += 1

        off_exact = max(0, exact_total - 1)
        off_seed_other = max(0, len(candidates) - exact_total)

        if off_exact == 0 and distal_1_2mm == 0 and off_seed_other == 0:
            summary = f"全基因组 ({self.accession}, {self.genome_len / 1e6:.2f} Mb) 12-bp Seed+NGG 零脱靶"
        else:
            summary = (
                f"全基因组 ({self.accession}) 检出 {off_exact} 个完全相同位点、"
                f"{distal_1_2mm} 个远端 1-2 错配高危位点（同 Seed 共 {off_seed_other} 处）"
            )
        return OffTargetResult(
            scope="whole_genome",
            exact_seed_hits=off_exact + distal_1_2mm,
            distal_1_2mm_hits=distal_1_2mm,
            summary=summary,
        )


_INDEX_CACHE: dict[str, WholeGenomeSeedIndex] = {}


def _find_genome_fasta(accession: str) -> Optional[Path]:
    acc_clean = accession.strip().upper()
    candidates = [
        settings.genomes_dir / f"{acc_clean}.fasta",
        settings.genomes_dir / f"{acc_clean}.fa",
        settings.genomes_dir / f"{acc_clean}.fna",
    ]
    for path in candidates:
        if path.exists():
            return path
    return None


def is_whole_genome_index_available(accession: str = "NC_000913.3") -> bool:
    return _find_genome_fasta(accession) is not None


def list_cached_whole_genomes() -> list[str]:
    """Return RefSeq accessions whose full bacterial genomes are cached locally for instant off-target scanning."""
    if not settings.genomes_dir.exists():
        return []
    found: list[str] = []
    for ext in ("*.fasta", "*.fa", "*.fna"):
        for p in sorted(settings.genomes_dir.glob(ext)):
            if p.stat().st_size > 100_000:
                found.append(p.stem)
    return sorted(set(found))


def is_ncbi_genome_accession(accession: str) -> bool:
    acc = accession.strip().upper()
    return bool(re.match(r"^(NC_\d+|NZ_[A-Z0-9]+|CP\d+|AE\d+|BA\d+|AL\d+|BX\d+|U\d+)(\.\d+)?$", acc))


def ensure_whole_genome_cached(
    accession: str,
    allow_remote_fetch: bool = True,
) -> tuple[bool, str]:
    """
    Autonomous On-Demand Whole-Genome Grabber:
      1. If `data/genomes/{accession}.fasta` is already cached locally -> instant reuse.
      2. Else if `allow_remote_fetch` and `accession` is a valid NCBI nucleotide accession ->
         live-fetches the complete prokaryotic chromosome FASTA from NCBI Entrez, verifies length,
         caches it permanently on disk, and pre-warms the 12-bp Seed+NGG hash index!
      3. Gracefully falls back with a transparent reason if offline or non-NCBI sequence.
    Returns (is_whole_genome_ready, status_message).
    """
    acc_clean = accession.strip().upper()
    existing = _find_genome_fasta(acc_clean)
    if existing is not None:
        idx = get_whole_genome_index(acc_clean)
        if idx is not None:
            return (
                True,
                f"已命中本地全基因组脱靶索引：{acc_clean} ({idx.genome_len / 1e6:.2f} Mb)",
            )

    if not allow_remote_fetch or not is_ncbi_genome_accession(acc_clean):
        return (
            False,
            f"当前输入 ({acc_clean}) 为本地/非标准 RefSeq 染色体，已降级为基因座窗口级脱靶扫描",
        )

    try:
        Entrez.email = settings.ncbi_email or "crispr-forge@example.com"
        if settings.ncbi_api_key:
            Entrez.api_key = settings.ncbi_api_key

        # Guard: check sequence length via esummary before downloading (bacterial chromosomes are <= 15 Mb)
        with Entrez.esummary(db="nuccore", id=acc_clean) as handle:
            summary = Entrez.read(handle)
        seq_len = int(summary[0].get("Length", 0)) if summary else 0
        if seq_len <= 0 or seq_len > 16_000_000:
            return (
                False,
                f"目标序列 {acc_clean} 长度 ({seq_len:,} bp) 超出单条细菌染色体自动抓取范围，降级为窗口级扫描",
            )

        settings.genomes_dir.mkdir(parents=True, exist_ok=True)
        out_path = settings.genomes_dir / f"{acc_clean}.fasta"
        with Entrez.efetch(db="nuccore", id=acc_clean, rettype="fasta", retmode="text") as handle:
            fasta_text = handle.read()

        if len(fasta_text) < 50_000:
            return False, f"NCBI 返回的 {acc_clean} 序列过短，降级为窗口级脱靶扫描"

        out_path.write_text(fasta_text, encoding="utf-8")
        idx = get_whole_genome_index(acc_clean)
        if idx is not None:
            return (
                True,
                f"已从 NCBI 自动实时抓取并永久缓存 {acc_clean} 全基因组 ({idx.genome_len / 1e6:.2f} Mb)，开启真·全基因组脱靶审计",
            )
    except Exception as exc:
        return (
            False,
            f"自动在线抓取 {acc_clean} 全基因组未成功 ({type(exc).__name__})，已安全降级为局部窗口级脱靶扫描",
        )

    return False, f"无法为 {acc_clean} 构建全基因组索引，降级为窗口级脱靶扫描"


def get_whole_genome_index(accession: str) -> Optional[WholeGenomeSeedIndex]:
    acc_clean = accession.strip().upper()
    if acc_clean in _INDEX_CACHE:
        return _INDEX_CACHE[acc_clean]
    fasta_path = _find_genome_fasta(acc_clean)
    if fasta_path is None:
        return None

    lines: list[str] = []
    with fasta_path.open("r", encoding="utf-8") as fh:
        for line in fh:
            if not line.startswith(">"):
                lines.append(line.strip().upper())
    seq = "".join(lines)
    if len(seq) < 50_000:
        return None
    index = WholeGenomeSeedIndex(acc_clean, seq)
    _INDEX_CACHE[acc_clean] = index
    return index


def scan_off_targets(
    spacer_20nt: str,
    accession: str,
    locus_sequence: str,
) -> OffTargetResult:
    """
    Scan for off-target SpCas9 sites (12-bp seed + NGG PAM).
    Uses cached Whole-Genome Index when available; otherwise scans the full extracted locus window
    and explicitly flags scope='locus_window'.
    """
    wg_index = get_whole_genome_index(accession)
    if wg_index is not None:
        return wg_index.query(spacer_20nt)

    # Fallback: Locus-window scan (both strands)
    spacer = spacer_20nt.upper()
    seed = spacer[8:]
    seq = locus_sequence.upper()
    rc_seq = str(Seq(seq).reverse_complement())

    exact_total = 0
    distal_1_2mm = 0
    seed_other = 0

    for strand_seq in (seq, rc_seq):
        pos = strand_seq.find("GG", 21)
        while pos != -1:
            cand = strand_seq[pos - 21 : pos - 1]
            if len(cand) == 20 and cand[8:] == seed:
                if cand == spacer:
                    exact_total += 1
                else:
                    mm = sum(1 for a, b in zip(spacer[:8], cand[:8]) if a != b)
                    if mm <= 2:
                        distal_1_2mm += 1
                    else:
                        seed_other += 1
            pos = strand_seq.find("GG", pos + 1)

    off_exact = max(0, exact_total - 1)
    if off_exact == 0 and distal_1_2mm == 0:
        summary = (
            f"局部基因座窗口 ({len(seq)} bp) 12-bp Seed+NGG 零脱靶"
            "（提示：未缓存该菌株全基因组，建议必要时补充全基因组比对）"
        )
    else:
        summary = (
            f"局部窗口检出 {off_exact} 个完全重复位点与 {distal_1_2mm} 个 1-2 错配位点"
            f"（另 {seed_other} 处远端多错配 Seed 匹配）"
        )
    return OffTargetResult(
        scope="locus_window",
        exact_seed_hits=off_exact + distal_1_2mm,
        distal_1_2mm_hits=distal_1_2mm,
        summary=summary,
    )
