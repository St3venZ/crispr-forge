"""Fetch genuine NCBI RefSeq GenBank slices for all 3 model species + NC_000913.3 whole-genome FASTA."""

from __future__ import annotations

import time
from Bio import Entrez, SeqIO

from crispr_forge.config import settings
from crispr_forge.genome.ncbi_client import PRESET_REGISTRY, fetch_locus_from_ncbi


def download_whole_genome_fasta(accession: str = "NC_000913.3") -> None:
    settings.genomes_dir.mkdir(parents=True, exist_ok=True)
    out_path = settings.genomes_dir / f"{accession}.fasta"
    if out_path.exists() and out_path.stat().st_size > 1_000_000:
        print(f"[SKIP] Whole-genome FASTA already cached: {out_path}")
        return

    Entrez.email = settings.ncbi_email or "crispr-forge@example.com"
    if settings.ncbi_api_key:
        Entrez.api_key = settings.ncbi_api_key

    print(f"[FETCH] Downloading whole-genome FASTA for {accession} from NCBI...")
    with Entrez.efetch(db="nuccore", id=accession, rettype="fasta", retmode="text") as handle:
        fasta_text = handle.read()

    out_path.write_text(fasta_text, encoding="utf-8")
    print(f"[OK] Saved {out_path} ({out_path.stat().st_size:,} bytes)")


def main() -> None:
    settings.presets_dir.mkdir(parents=True, exist_ok=True)
    print("=== Fetching Multi-Species Genuine NCBI RefSeq Presets ===")
    for item in PRESET_REGISTRY:
        acc = item["accession"]
        gene = item["gene_name"]
        locus_tag = item["locus_tag"]
        target_path = settings.presets_dir / f"{acc}_{gene}.gb"
        if target_path.exists() and target_path.stat().st_size > 5000:
            print(f"[SKIP] Preset already cached: {target_path.name}")
            continue
        print(f"[FETCH] {acc} :: {gene} / {locus_tag} ({item['organism_cn']})...")
        try:
            record, _ = fetch_locus_from_ncbi(acc, gene, flank_bp=3000)
        except ValueError:
            print(f"  [FALLBACK] Querying NCBI by locus_tag '{locus_tag}'...")
            record, _ = fetch_locus_from_ncbi(acc, locus_tag, flank_bp=3000)
        SeqIO.write(record, str(target_path), "genbank")
        print(f"[OK] Saved {target_path.name} ({target_path.stat().st_size:,} bytes)")
        time.sleep(0.5)

    for wg_acc in ("NC_000913.3", "NC_000964.3", "NC_003450.3"):
        download_whole_genome_fasta(wg_acc)
        time.sleep(0.4)
    print("=== Done! ===")


if __name__ == "__main__":
    main()
