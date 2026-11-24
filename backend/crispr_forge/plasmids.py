"""Universal Prokaryotic CRISPR Plasmid System Registry.

Encapsulates cloning overhangs, restriction enzyme exclusion rules, reference
sgRNA expression cassettes for in-silico cloning simulation, colony-PCR verification
primers, and plasmid-specific wet-lab protocols across major bacterial CRISPR systems.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal, Optional

from crispr_forge.models import CustomPlasmidConfig, PlasmidSystemId


# Standard SpCas9 sgRNA structural scaffold (76 nt) + rrnB T1 / poly-T terminator
SPCAS9_GRNA_SCAFFOLD = (
    "GTTTTAGAGCTAGAAATAGCAAGTTAAAATAAGGCTAGTCCGTTATCAACTTGAAAAAGTGGCACCGAGTCGGTGC"
)
J23119_PROMOTER_PREFIX = "TTGACAGCTAGCTCAGTCCTAGGTATAATACTAGT"  # ends with SpeI ACTAGT
TERMINATOR_SUFFIX = "TTTTTTT"

# Type IIS restriction enzyme recognition sequences (5'->3' top strand; revcomp checked automatically)
RESTRICTION_SITES: dict[str, tuple[str, str]] = {
    "BsaI": ("GGTCTC", "GAGACC"),
    "BbsI": ("GAAGAC", "GTCTTC"),
    "Esp3I": ("CGTCTC", "GAGACG"),
    "BsmBI": ("CGTCTC", "GAGACG"),
    "SpeI": ("ACTAGT", "ACTAGT"),
    "SfiI": ("GGCC", "GGCC"),  # handled only if explicitly requested
}


@dataclass(frozen=True)
class PlasmidProfile:
    id: PlasmidSystemId
    display_name: str
    short_label: str
    hosts: str
    reference: str
    cloning_method: Literal["golden_gate_oligo", "inverse_pcr"]
    overhang_forward: str
    overhang_reverse: str
    restriction_enzyme: str  # "none" if no enzyme cut exclusion needed
    inverse_pcr_scaffold_anchor: str
    inverse_pcr_reverse_primer: str
    promoter_upstream_seq: str  # exact sequence directly upstream of N20 in final assembled cassette
    scaffold_downstream_seq: str  # exact sequence directly downstream of N20
    antibiotics: str
    selection_screen: str
    inducer_note: str
    curing_protocol: str
    colony_pcr_backbone_f: str
    colony_pcr_backbone_r: str
    sanger_backbone_f: str


PLASMID_PROFILES: dict[str, PlasmidProfile] = {
    "pEcCas/pEcgRNA": PlasmidProfile(
        id="pEcCas/pEcgRNA",
        display_name="pEcCas / pEcgRNA (杨晟课题组升级体系)",
        short_label="pEcCas / pEcgRNA",
        hosts="大肠杆菌 (E. coli K-12 / BL21 等肠杆菌科)",
        reference="Li et al., Microb Cell Fact 2021 (Addgene #73227 & #166581)",
        cloning_method="golden_gate_oligo",
        overhang_forward="TAGT",
        overhang_reverse="AAAC",
        restriction_enzyme="BsaI",
        inverse_pcr_scaffold_anchor="",
        inverse_pcr_reverse_primer="",
        promoter_upstream_seq=J23119_PROMOTER_PREFIX,  # ends with ...ACTAGT (contains TAGT sticky end)
        scaffold_downstream_seq=SPCAS9_GRNA_SCAFFOLD + TERMINATOR_SUFFIX,
        antibiotics="Kanamycin (50 ug/mL) + Spectinomycin (50 ug/mL)",
        selection_screen="pEcgRNA 内含 ccdB 致死负筛基因，连接正确克隆在 DH5α + Spec 平板几乎零假阳性背景",
        inducer_note="电转前用 10 mM L-阿拉伯糖诱导 λ-Red 重组酶表达 1–2 h",
        curing_protocol="① 10 mM L-鼠李糖 + Kan 培养过夜消除 pEcgRNA；② 涂布含 5% 蔗糖 LB 平板（sacB 反筛）消除 pEcCas。",
        colony_pcr_backbone_f="CGCCGTCATCGTCTGATTCT",
        colony_pcr_backbone_r="GCACCGACTCGGTGCCACTT",
        sanger_backbone_f="TCTGAGCTTCTGCTGATCCG",
    ),
    "pCas/pTargetF": PlasmidProfile(
        id="pCas/pTargetF",
        display_name="pCas / pTargetF (经典全质粒反向 PCR 体系)",
        short_label="pCas / pTargetF",
        hosts="大肠杆菌 (E. coli MG1655 / DH5α / W3110 等)",
        reference="Jiang et al., Appl Environ Microbiol 2015 (Addgene #62225 & #62226)",
        cloning_method="inverse_pcr",
        overhang_forward="",
        overhang_reverse="",
        restriction_enzyme="none",
        inverse_pcr_scaffold_anchor="GTTTTAGAGCTAGAAATAGCAAGTTA",
        inverse_pcr_reverse_primer="ACTAGTATTATACCTAGGACTGAG",
        promoter_upstream_seq=J23119_PROMOTER_PREFIX,
        scaffold_downstream_seq=SPCAS9_GRNA_SCAFFOLD + TERMINATOR_SUFFIX,
        antibiotics="Kanamycin (50 ug/mL, 30°C) + Spectinomycin (50 ug/mL)",
        selection_screen="全质粒反向 PCR 后经 DpnI 消化母本模板并 T4 PNK 磷酸化自连（或无缝自环化），转化 DH5α + Spec",
        inducer_note="全程 30°C 培养防 pCas 丢失；电转前用 10 mM L-阿拉伯糖诱导 λ-Red",
        curing_protocol="① 0.5 mM IPTG + Kan 在 30°C 诱导消除 pTargetF；② 转接无抗 LB 于 37°C 过夜培养消除温敏 pCas。",
        colony_pcr_backbone_f="CTAGCTCAGTCCTAGGTATAATACTAGT",
        colony_pcr_backbone_r="GCACCGACTCGGTGCCACTT",
        sanger_backbone_f="GCAAGGCGATTAAGTTGGGT",
    ),
    "pJOE8999": PlasmidProfile(
        id="pJOE8999",
        display_name="pJOE8999 (枯草芽孢杆菌单质粒一体化体系)",
        short_label="pJOE8999",
        hosts="枯草芽孢杆菌 (Bacillus subtilis 168 等芽孢杆菌)",
        reference="Altenbuchner, Appl Environ Microbiol 2016 (Addgene #71696)",
        cloning_method="golden_gate_oligo",
        overhang_forward="TACG",
        overhang_reverse="AAAC",
        restriction_enzyme="BsaI",
        inverse_pcr_scaffold_anchor="",
        inverse_pcr_reverse_primer="",
        promoter_upstream_seq="TTGACAGCTAGCTCAGTCCTAGGTATAATACG",  # ends with TACG overhang
        scaffold_downstream_seq=SPCAS9_GRNA_SCAFFOLD + TERMINATOR_SUFFIX,
        antibiotics="Kanamycin (E. coli 50 ug/mL; B. subtilis 5 ug/mL)",
        selection_screen="BsaI 替换 lacZα 表达框支持蓝白斑筛选（白斑为阳性）；随后可将 Donor 克隆至同质粒 SfiI 位点",
        inducer_note="转化枯草芽孢杆菌后在含 0.2% D-甘露糖 + 5 ug/mL Kan 平板上 30°C 诱导 Cas9 切割与同源重组",
        curing_protocol="挑取验证阳性单菌落接种于无抗 LB，50°C 摇床过夜培养即可高效消除温敏型 pJOE8999 质粒。",
        colony_pcr_backbone_f="CGATTAAGTTGGGTAACGCC",
        colony_pcr_backbone_r="GCACCGACTCGGTGCCACTT",
        sanger_backbone_f="TGGAATTGTGAGCGGATAAC",
    ),
}


def resolve_plasmid_profile(
    plasmid_system: PlasmidSystemId,
    custom_plasmid: Optional[CustomPlasmidConfig] = None,
) -> PlasmidProfile:
    """Resolve either a built-in lab plasmid system or a user-customized vector configuration."""
    if plasmid_system != "custom" and plasmid_system in PLASMID_PROFILES:
        return PLASMID_PROFILES[plasmid_system]

    cfg = custom_plasmid or CustomPlasmidConfig()
    oh_f = cfg.overhang_forward.strip().upper()
    oh_r = cfg.overhang_reverse.strip().upper()
    enzyme = cfg.restriction_enzyme.strip() if cfg.restriction_enzyme else "none"

    upstream = (
        f"TTGACAGCTAGCTCAGTCCTAGGTATAAT{oh_f}"
        if cfg.cloning_method == "golden_gate_oligo" and oh_f
        else J23119_PROMOTER_PREFIX
    )

    return PlasmidProfile(
        id="custom",
        display_name=f"{cfg.name} (自定义质粒体系)",
        short_label=cfg.name,
        hosts="任意原核生物 / 实验室自定义宿主",
        reference="User Custom Vector Specification",
        cloning_method=cfg.cloning_method,
        overhang_forward=oh_f,
        overhang_reverse=oh_r,
        restriction_enzyme=enzyme,
        inverse_pcr_scaffold_anchor=cfg.inverse_pcr_scaffold_anchor.strip().upper(),
        inverse_pcr_reverse_primer=cfg.inverse_pcr_reverse_primer.strip().upper(),
        promoter_upstream_seq=upstream,
        scaffold_downstream_seq=SPCAS9_GRNA_SCAFFOLD + TERMINATOR_SUFFIX,
        antibiotics=cfg.antibiotics,
        selection_screen="按自定义载体抗性与筛选标记进行阳性克隆验证",
        inducer_note="按自定义载体启动子体系进行诱导表达与电转/转化",
        curing_protocol=cfg.curing_note,
        colony_pcr_backbone_f=(cfg.colony_pcr_backbone_f or "CGCCGTCATCGTCTGATTCT").strip().upper(),
        colony_pcr_backbone_r=(cfg.colony_pcr_backbone_r or "GCACCGACTCGGTGCCACTT").strip().upper(),
        sanger_backbone_f=(cfg.sanger_backbone_f or "TCTGAGCTTCTGCTGATCCG").strip().upper(),
    )


def list_plasmid_catalog() -> list[dict[str, str]]:
    """Return UI-friendly metadata for all supported plasmid systems."""
    items = [
        {
            "id": p.id,
            "display_name": p.display_name,
            "short_label": p.short_label,
            "hosts": p.hosts,
            "reference": p.reference,
            "cloning_method": p.cloning_method,
            "overhangs": (
                f"5'-{p.overhang_forward} / 5'-{p.overhang_reverse} ({p.restriction_enzyme})"
                if p.cloning_method == "golden_gate_oligo"
                else "全质粒反向 PCR (N20 + gRNA Scaffold)"
            ),
            "antibiotics": p.antibiotics,
            "curing_protocol": p.curing_protocol,
        }
        for p in PLASMID_PROFILES.values()
    ]
    items.append(
        {
            "id": "custom",
            "display_name": "自定义实验室质粒体系 (Universal Custom)",
            "short_label": "自定义质粒",
            "hosts": "任意原核菌株（谷棒 / 假单胞 / 乳酸菌 / 自建载体）",
            "reference": "自定义 Golden Gate 粘性末端或反向 PCR 锚点",
            "cloning_method": "custom",
            "overhangs": "支持自定义 BsaI/BbsI/Esp3I 粘性末端或反向 PCR",
            "antibiotics": "自定义抗性标记",
            "curing_protocol": "自定义质粒消除说明",
        }
    )
    return items
