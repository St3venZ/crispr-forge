"""Multi-species NCBI Entrez GenBank fetcher, verified presets, and GenBank/FASTA upload parser."""

from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Literal, Optional

from Bio import Entrez, SeqIO
from Bio.SeqRecord import SeqRecord

from crispr_forge.config import settings
from crispr_forge.genome.offtarget_index import list_cached_whole_genomes

# Curated popular prokaryotic model strains (supports Chinese + English instant fuzzy search!)
CURATED_STRAINS: list[dict] = [
    {
        "accession": "NC_000913.3",
        "organism": "Escherichia coli str. K-12 substr. MG1655",
        "title": "大肠杆菌 K-12 MG1655 完整参考染色体",
        "aliases": "大肠杆菌 ecoli e.coli mg1655 k12 k-12",
        "length_bp": 4641652,
    },
    {
        "accession": "NC_012971.2",
        "organism": "Escherichia coli B str. REL606",
        "title": "大肠杆菌 B 株 REL606（BL21 近源参考）",
        "aliases": "大肠杆菌 bl21 rel606 ecoli b",
        "length_bp": 4629812,
    },
    {
        "accession": "CP001509.3",
        "organism": "Escherichia coli BL21(DE3)",
        "title": "大肠杆菌 BL21(DE3) 蛋白表达常用宿主",
        "aliases": "大肠杆菌 bl21 de3 表达宿主",
        "length_bp": 4558953,
    },
    {
        "accession": "NC_000964.3",
        "organism": "Bacillus subtilis subsp. subtilis str. 168",
        "title": "枯草芽孢杆菌 168 完整参考染色体",
        "aliases": "枯草芽孢杆菌 枯草 bacillus subtilis 168",
        "length_bp": 4215606,
    },
    {
        "accession": "NC_003450.3",
        "organism": "Corynebacterium glutamicum ATCC 13032",
        "title": "谷氨酸棒状杆菌 ATCC 13032 完整参考染色体",
        "aliases": "谷氨酸棒状杆菌 谷棒 corynebacterium glutamicum 13032",
        "length_bp": 3282708,
    },
    {
        "accession": "AE015451.2",
        "organism": "Pseudomonas putida KT2440",
        "title": "恶臭假单胞菌 KT2440 合成生物学底盘",
        "aliases": "恶臭假单胞菌 假单胞 pseudomonas putida kt2440",
        "length_bp": 6181863,
    },
    {
        "accession": "NC_003888.3",
        "organism": "Streptomyces coelicolor A3(2)",
        "title": "天蓝色链霉菌 A3(2) 模式放线菌底盘",
        "aliases": "链霉菌 streptomyces coelicolor",
        "length_bp": 8667507,
    },
    {
        "accession": "NC_004567.2",
        "organism": "Lactiplantibacillus plantarum WCFS1",
        "title": "植物乳杆菌 WCFS1 乳酸菌模式底盘",
        "aliases": "乳酸菌 植物乳杆菌 lactobacillus lactiplantibacillus plantarum",
        "length_bp": 3308273,
    },
    {
        "accession": "NC_002971.4",
        "organism": "Vibrio natriegens ATCC 14048 (Chr 1)",
        "title": "需钠弧菌（超快生长底盘）参考染色体",
        "aliases": "需钠弧菌 vibrio natriegens",
        "length_bp": 3248023,
    },
]

# Multi-species curated presets: (accession, canonical_gene) -> metadata
PRESET_REGISTRY: list[dict[str, str]] = [
    {
        "accession": "NC_000913.3",
        "gene_name": "lacZ",
        "locus_tag": "b0344",
        "organism": "Escherichia coli str. K-12 substr. MG1655",
        "organism_cn": "大肠杆菌 MG1655",
        "recommended_plasmid": "pCas/pTargetF",
        "tag": "经典蓝白斑靶点",
        "description": "β-半乳糖苷酶基因，经典原核敲除与蓝白斑筛选模型（支持全基因组 4.64 Mb 脱靶扫描）",
    },
    {
        "accession": "NC_000913.3",
        "gene_name": "ackA",
        "locus_tag": "b2296",
        "organism": "Escherichia coli str. K-12 substr. MG1655",
        "organism_cn": "大肠杆菌 MG1655",
        "recommended_plasmid": "pEcCas/pEcgRNA",
        "tag": "邻近操纵子保护",
        "description": "乙酸激酶基因，紧邻同操纵子下游 pta，适合展示邻近基因 RBS 保护与无痕敲除",
    },
    {
        "accession": "NC_000913.3",
        "gene_name": "pta",
        "locus_tag": "b2297",
        "organism": "Escherichia coli str. K-12 substr. MG1655",
        "organism_cn": "大肠杆菌 MG1655",
        "recommended_plasmid": "pEcCas/pEcgRNA",
        "tag": "乙酸途径改造",
        "description": "磷酸乙酰转移酶基因，工业代谢工程降乙酸副产物高频敲除靶点",
    },
    {
        "accession": "NC_000913.3",
        "gene_name": "gldA",
        "locus_tag": "b3945",
        "organism": "Escherichia coli str. K-12 substr. MG1655",
        "organism_cn": "大肠杆菌 MG1655",
        "recommended_plasmid": "pEcCas/pEcgRNA",
        "tag": "负链经典靶点",
        "description": "甘油脱氢酶基因（负链 CDS），典型 1.1 kb 靶点全自动验证示例",
    },
    {
        "accession": "NC_000964.3",
        "gene_name": "amyE",
        "locus_tag": "BSU_03040",
        "organism": "Bacillus subtilis subsp. subtilis str. 168",
        "organism_cn": "枯草芽孢杆菌 168",
        "recommended_plasmid": "pJOE8999",
        "tag": "革兰氏阳性菌",
        "description": "α-淀粉酶基因，枯草芽孢杆菌最经典的单质粒 pJOE8999 敲除与整合位点",
    },
    {
        "accession": "NC_003450.3",
        "gene_name": "ldhA",
        "locus_tag": "NCgl2810",
        "organism": "Corynebacterium glutamicum ATCC 13032",
        "organism_cn": "谷氨酸棒状杆菌 ATCC 13032",
        "recommended_plasmid": "custom",
        "tag": "工业氨基酸发酵菌",
        "description": "乳酸脱氢酶基因，氨基酸发酵降乳酸副产物经典靶点（高 GC + 自定义体系）",
    },
]

# Fast alias lookup: (accession_upper, alias_lower) -> canonical_gene_name
PRESET_ALIAS_MAP: dict[tuple[str, str], str] = {}
for _item in PRESET_REGISTRY:
    _acc = _item["accession"].upper()
    _gene = _item["gene_name"]
    PRESET_ALIAS_MAP[(_acc, _gene.lower())] = _gene
    PRESET_ALIAS_MAP[(_acc, _item["locus_tag"].lower())] = _gene
# Extra common synonyms for ldhA in C. glutamicum (cg3219 / ldh)
PRESET_ALIAS_MAP[("NC_003450.3", "cg3219")] = "ldhA"
PRESET_ALIAS_MAP[("NC_003450.3", "ldh")] = "ldhA"
PRESET_ALIAS_MAP[("NC_000964.3", "bsu03040")] = "amyE"


def _configure_entrez() -> None:
    Entrez.email = settings.ncbi_email or "crispr-forge@example.com"
    if settings.ncbi_api_key:
        Entrez.api_key = settings.ncbi_api_key


def _extract_slice_start(record: SeqRecord) -> int:
    """Recover original 1-based genome start coordinate stored in GenBank metadata."""
    comment = str(record.annotations.get("comment", ""))
    match = re.search(r"CRISPR_FORGE_SLICE_START=(\d+)", comment)
    if match:
        return int(match.group(1))
    for field in (record.description, comment):
        m2 = re.search(r"REGION:\s*(\d+)\.\.(\d+)", field)
        if m2:
            return int(m2.group(1))
    return 1


def list_available_presets() -> list[dict[str, str]]:
    """Return metadata of verified local GenBank presets currently cached on disk."""
    available: list[dict[str, str]] = []
    for item in PRESET_REGISTRY:
        path = settings.presets_dir / f"{item['accession']}_{item['gene_name']}.gb"
        if path.exists():
            available.append(item)
    return available


def load_preset_record(accession: str, gene_name: str) -> Optional[tuple[SeqRecord, int, str]]:
    """Load a verified cached GenBank locus slice if available."""
    norm_acc = accession.strip().upper()
    norm_gene = PRESET_ALIAS_MAP.get((norm_acc, gene_name.strip().lower()))
    if norm_gene:
        preset_path = settings.presets_dir / f"{norm_acc}_{norm_gene}.gb"
        if preset_path.exists():
            record = SeqIO.read(str(preset_path), "genbank")
            slice_start = _extract_slice_start(record)
            return record, slice_start, norm_gene
    return None


def parse_custom_genbank(gb_text: str) -> tuple[SeqRecord, int]:
    """Parse user-uploaded GenBank text."""
    record = SeqIO.read(io.StringIO(gb_text.strip()), "genbank")
    return record, _extract_slice_start(record)


def parse_custom_fasta(fasta_text: str) -> SeqRecord:
    """Parse user-uploaded FASTA text (also tolerates raw nucleotide sequence without '>' header)."""
    cleaned = fasta_text.strip()
    if not cleaned:
        raise ValueError("上传的 FASTA 序列为空。")
    if not cleaned.startswith(">"):
        cleaned = ">User_Uploaded_Sequence\n" + cleaned
    records = list(SeqIO.parse(io.StringIO(cleaned), "fasta"))
    if not records:
        raise ValueError("无法解析 FASTA 序列，请检查文件格式。")
    return records[0]


def fetch_locus_from_ncbi(
    accession: str,
    gene_name: str,
    flank_bp: int = 3000,
) -> tuple[SeqRecord, int]:
    """
    Fetch an annotated GenBank window (±flank_bp around target gene) live from NCBI Entrez.
    Never asks an LLM to recall sequences from memory.
    """
    _configure_entrez()
    acc_clean = accession.strip()
    acc_base = acc_clean.split(".")[0]

    gene_start: Optional[int] = None
    gene_end: Optional[int] = None

    # Query NCBI Gene database scoped to the target nucleotide accession
    search_terms = [
        f'({gene_name}[Gene Name] OR {gene_name}[Locus Tag]) AND "{acc_clean}"[Nucleotide Accession]',
        f'({gene_name}[Gene Name] OR {gene_name}[Locus Tag]) AND "{acc_base}"[Text Word]',
        f'{gene_name}[All Fields] AND "{acc_base}"[Text Word]',
    ]
    for term in search_terms:
        with Entrez.esearch(db="gene", term=term, retmax=10) as handle:
            search_res = Entrez.read(handle)
        id_list = search_res.get("IdList", [])
        if not id_list:
            continue
        with Entrez.esummary(db="gene", id=",".join(id_list)) as handle:
            summary = Entrez.read(handle)
        docs = summary.get("DocumentSummarySet", {}).get("DocumentSummary", [])
        target_low = gene_name.strip().lower()
        # Sort docs so exact Name or OtherAliases match comes strictly before loose matches!
        def _doc_rank(d) -> int:
            name_val = str(d.get("Name", "")).strip().lower()
            aliases = [a.strip().lower() for a in str(d.get("OtherAliases", "")).split(",")]
            if name_val == target_low:
                return 0
            if target_low in aliases:
                return 1
            return 2

        docs_sorted = sorted(docs, key=_doc_rank)
        for doc in docs_sorted:
            if _doc_rank(doc) == 2 and len(docs_sorted) > 1:
                continue
            for ginfo in doc.get("GenomicInfo", []):
                chr_acc = str(ginfo.get("ChrAccVer", ""))
                if chr_acc.upper().startswith(acc_base.upper()):
                    s = int(ginfo["ChrStart"]) + 1  # esummary ChrStart is 0-based
                    e = int(ginfo["ChrStop"]) + 1
                    gene_start, gene_end = min(s, e), max(s, e)
                    break
            if gene_start is not None:
                break
        if gene_start is not None:
            break

    if gene_start is None or gene_end is None:
        raise ValueError(
            f"无法在 NCBI Gene 数据库中定位 {acc_clean} 上的基因 '{gene_name}'。"
            "请确认基因名/Locus Tag 与 RefSeq Accession 匹配，或直接上传本地 GenBank (.gb) / FASTA 文件。"
        )

    slice_start = max(1, gene_start - flank_bp)
    slice_end = gene_end + flank_bp

    with Entrez.efetch(
        db="nuccore",
        id=acc_clean,
        rettype="gbwithparts",
        retmode="text",
        seq_start=slice_start,
        seq_stop=slice_end,
    ) as handle:
        gb_text = handle.read()

    record = SeqIO.read(io.StringIO(gb_text), "genbank")
    existing_comment = str(record.annotations.get("comment", "")).strip()
    tag = f"CRISPR_FORGE_SLICE_START={slice_start}; SOURCE_ACCESSION={acc_clean}"
    record.annotations["comment"] = f"{tag}\n{existing_comment}".strip()
    return record, slice_start


def fetch_and_save_preset(accession: str, gene_name: str, flank_bp: int = 3000) -> Path:
    """Fetch a genuine GenBank locus slice from NCBI and store it in data/presets."""
    settings.presets_dir.mkdir(parents=True, exist_ok=True)
    record, _ = fetch_locus_from_ncbi(accession, gene_name, flank_bp=flank_bp)
    out_path = settings.presets_dir / f"{accession}_{gene_name}.gb"
    SeqIO.write(record, str(out_path), "genbank")
    return out_path


def search_prokaryotic_strains(query: str, limit: int = 8) -> list[dict]:
    """
    Fuzzy-search prokaryotic RefSeq chromosomes combining instant curated model strains
    (Chinese + English) with live NCBI Entrez nuccore search for any unlisted chassis.
    """
    q = query.strip()
    cached_set = {c.upper() for c in list_cached_whole_genomes()}
    results: list[dict] = []
    seen_acc: set[str] = set()

    q_low = q.lower()
    for item in CURATED_STRAINS:
        haystack = f"{item['accession']} {item['organism']} {item['title']} {item['aliases']}".lower()
        if not q_low or q_low in haystack or all(tok in haystack for tok in q_low.split()):
            acc = item["accession"]
            seen_acc.add(acc.upper())
            results.append(
                {
                    "accession": acc,
                    "organism": item["organism"],
                    "title": item["title"],
                    "length_bp": item["length_bp"],
                    "is_cached": acc.upper() in cached_set,
                    "source": "local_curated",
                }
            )

    # Live NCBI RefSeq nuccore search only for ASCII/Latin queries (>= 3 chars) with fast timeout
    is_ascii = all(ord(ch) < 128 for ch in q)
    if is_ascii and len(q) >= 3 and len(results) < limit:
        import socket

        prev_timeout = socket.getdefaulttimeout()
        try:
            socket.setdefaulttimeout(4.0)
            _configure_entrez()
            term = f'({q}[Organism] OR {q}[Title] OR {q}[Accession]) AND ("complete genome"[Title] OR "chromosome"[Title]) AND srcdb_refseq[PROP]'
            with Entrez.esearch(db="nuccore", term=term, retmax=max(5, limit - len(results))) as handle:
                sr = Entrez.read(handle)
            ids = sr.get("IdList", [])
            if ids:
                with Entrez.esummary(db="nuccore", id=",".join(ids)) as handle:
                    summaries = Entrez.read(handle)
                for doc in summaries:
                    acc = str(doc.get("AccessionVersion") or doc.get("Caption") or "").strip()
                    if not acc or acc.upper() in seen_acc:
                        continue
                    title = str(doc.get("Title", "")).strip()
                    length = int(doc.get("Length", 0)) or None
                    if length and length < 300_000:
                        continue
                    org = title.split(",")[0].strip() if title else acc
                    seen_acc.add(acc.upper())
                    results.append(
                        {
                            "accession": acc,
                            "organism": org,
                            "title": title,
                            "length_bp": length,
                            "is_cached": acc.upper() in cached_set,
                            "source": "ncbi_live",
                        }
                    )
        except Exception:
            pass
        finally:
            socket.setdefaulttimeout(prev_timeout)

    return results[:limit]


def get_locus_record(
    accession: str,
    gene_name: str,
    custom_genbank: Optional[str] = None,
    custom_fasta: Optional[str] = None,
) -> tuple[
    SeqRecord,
    int,
    str,
    Literal["ncbi_live", "preset_verified", "user_upload_gb", "user_upload_fasta"],
]:
    """
    Unified entry point returning (SeqRecord, slice_genome_start, resolved_gene_name, source).
    Priority:
      1. User-uploaded GenBank file
      2. User-uploaded raw FASTA file
      3. Verified cached local GenBank preset (authentic RefSeq slices)
      4. Live NCBI Entrez download
    """
    if custom_genbank and custom_genbank.strip():
        record, slice_start = parse_custom_genbank(custom_genbank)
        return record, slice_start, gene_name, "user_upload_gb"

    if custom_fasta and custom_fasta.strip():
        record = parse_custom_fasta(custom_fasta)
        return record, 1, gene_name or record.id or "target_region", "user_upload_fasta"

    preset = load_preset_record(accession, gene_name)
    if preset is not None:
        record, slice_start, resolved_gene = preset
        return record, slice_start, resolved_gene, "preset_verified"

    record, slice_start = fetch_locus_from_ncbi(accession, gene_name)
    return record, slice_start, gene_name, "ncbi_live"
