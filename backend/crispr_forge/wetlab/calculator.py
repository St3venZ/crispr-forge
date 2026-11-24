"""Dynamic Wet-Lab Pipetting Calculator, Pre-Dilution Solver, PCR Profiler, and 4-Day Plasmid SOP Engine."""

from __future__ import annotations

import math
from typing import Optional

from crispr_forge.models import (
    CustomPolymeraseConfig,
    PipettingCalcRequest,
    PipettingComponent,
    PolymeraseName,
    ReactionMix,
    TimelineDay,
    WetLabProtocol,
)
from crispr_forge.plasmids import resolve_plasmid_profile


POLYMERASE_SPECS: dict[str, dict] = {
    # --- Vazyme 诺唯赞 ---
    "Phanta Max (Vazyme)": {
        "id": "Phanta Max (Vazyme)",
        "vendor": "诺唯赞 Vazyme",
        "category": "高保真主力",
        "mix_name": "2x Phanta Max Master Mix",
        "extension_sec_per_kb": 30,
        "denature_c": 95,
        "ext_c": 72,
        "anneal_offset_c": -2,
        "tags": ["高保真", "OE-PCR主力", "国产常用"],
        "summary": "国内最常用的高保真酶之一，30 s/kb，OE-PCR 与同源臂扩增容错率极高",
    },
    "Phanta Flash (Vazyme)": {
        "id": "Phanta Flash (Vazyme)",
        "vendor": "诺唯赞 Vazyme",
        "category": "极速高保真",
        "mix_name": "2x Phanta Flash Master Mix",
        "extension_sec_per_kb": 5,
        "denature_c": 98,
        "ext_c": 72,
        "anneal_offset_c": -2,
        "tags": ["极速 1-5s/kb", "高保真", "诺唯赞"],
        "summary": "超快高保真预混液，1-5 s/kb 极速延伸，常规同源臂 30 分钟跑完 PCR",
    },
    "Phanta EVO (Vazyme)": {
        "id": "Phanta EVO (Vazyme)",
        "vendor": "诺唯赞 Vazyme",
        "category": "复杂模板/长片段",
        "mix_name": "2x Phanta EVO Master Mix",
        "extension_sec_per_kb": 15,
        "denature_c": 95,
        "ext_c": 72,
        "anneal_offset_c": -2,
        "tags": ["高GC", "长片段", "抗抑制"],
        "summary": "增强型高保真酶，15 s/kb，擅长高 GC 基因组与复杂二级结构模板",
    },
    "2x Taq Master Mix (Colony PCR)": {
        "id": "2x Taq Master Mix (Colony PCR)",
        "vendor": "诺唯赞 / 通用 Rapid Taq",
        "category": "菌落筛选专用",
        "mix_name": "2x Rapid Taq Master Mix (含染料)",
        "extension_sec_per_kb": 30,
        "denature_c": 95,
        "ext_c": 72,
        "anneal_offset_c": -3,
        "tags": ["菌落PCR", "含染料直跑", "经济"],
        "summary": "菌落 PCR 筛选专用，15-30 s/kb，反应完直接点样电泳省成本",
    },
    # --- TOYOBO 东洋纺 ---
    "KOD One (TOYOBO)": {
        "id": "KOD One (TOYOBO)",
        "vendor": "东洋纺 TOYOBO",
        "category": "极速高保真",
        "mix_name": "KOD One PCR Master Mix (2x)",
        "extension_sec_per_kb": 5,
        "denature_c": 98,
        "ext_c": 68,
        "anneal_offset_c": -1,
        "tags": ["极速 5s/kb", "高GC王者", "菌液兼容"],
        "summary": "东洋纺旗舰超快高保真酶，5 s/kb，68°C 延伸，高 GC 与菌液扩增极稳",
    },
    "KOD-Plus-Neo (TOYOBO)": {
        "id": "KOD-Plus-Neo (TOYOBO)",
        "vendor": "东洋纺 TOYOBO",
        "category": "极高保真/长片段",
        "mix_name": "KOD-Plus-Neo PCR Mix",
        "extension_sec_per_kb": 30,
        "denature_c": 98,
        "ext_c": 68,
        "anneal_offset_c": -2,
        "tags": ["超高保真", "长片段", "68°C延伸"],
        "summary": "超高保真长片段扩增主力，30 s/kb，适合反向 PCR 扩增全长质粒",
    },
    "KOD FX Neo (TOYOBO)": {
        "id": "KOD FX Neo (TOYOBO)",
        "vendor": "东洋纺 TOYOBO",
        "category": "抗抑制/粗样直扩",
        "mix_name": "KOD FX Neo PCR Mix",
        "extension_sec_per_kb": 30,
        "denature_c": 98,
        "ext_c": 68,
        "anneal_offset_c": -2,
        "tags": ["菌液直扩", "强抗抑制", "高GC"],
        "summary": "极强抗抑制能力，可直接以菌落/粗裂解液为模板高保真扩增长片段",
    },
    # --- Takara 宝生物 ---
    "PrimeSTAR Max (Takara)": {
        "id": "PrimeSTAR Max (Takara)",
        "vendor": "Takara 宝生物",
        "category": "极速高保真",
        "mix_name": "PrimeSTAR Max Premix (2x)",
        "extension_sec_per_kb": 5,
        "denature_c": 98,
        "ext_c": 72,
        "anneal_offset_c": -3,
        "tags": ["极速 5s/kb", "Takara经典", "反向PCR"],
        "summary": "Takara 经典超快高保真，5 s/kb，适合同源臂、OE-PCR 及全质粒反向 PCR",
    },
    "PrimeSTAR GXL (Takara)": {
        "id": "PrimeSTAR GXL (Takara)",
        "vendor": "Takara 宝生物",
        "category": "高GC/长片段",
        "mix_name": "PrimeSTAR GXL DNA Polymerase Mix",
        "extension_sec_per_kb": 60,
        "denature_c": 98,
        "ext_c": 68,
        "anneal_offset_c": -2,
        "tags": ["超高GC", "超长片段", "高成功率"],
        "summary": "攻克高 GC（谷棒/链霉菌）与超长片段的利器，60 s/kb，68°C 延伸",
    },
    "PrimeSTAR HS (Takara)": {
        "id": "PrimeSTAR HS (Takara)",
        "vendor": "Takara 宝生物",
        "category": "经典高保真",
        "mix_name": "PrimeSTAR HS Premix (2x)",
        "extension_sec_per_kb": 60,
        "denature_c": 98,
        "ext_c": 72,
        "anneal_offset_c": -3,
        "tags": ["热启动", "高特异", "经典"],
        "summary": "经典热启动高保真酶，60 s/kb，条带单一特异性极佳",
    },
    # --- NEB ---
    "Q5 High-Fidelity (NEB)": {
        "id": "Q5 High-Fidelity (NEB)",
        "vendor": "NEB",
        "category": "顶级保真",
        "mix_name": "Q5 High-Fidelity 2x Master Mix",
        "extension_sec_per_kb": 30,
        "denature_c": 98,
        "ext_c": 72,
        "anneal_offset_c": 1,
        "tags": ["280x保真", "国际标杆", "高GC"],
        "summary": "超高保真（~280x Taq），30 s/kb，退火温度按 NEB 规则略高于常规 Tm",
    },
    "Phusion High-Fidelity (NEB)": {
        "id": "Phusion High-Fidelity (NEB)",
        "vendor": "NEB / Thermo",
        "category": "经典高保真",
        "mix_name": "Phusion High-Fidelity 2x Master Mix",
        "extension_sec_per_kb": 25,
        "denature_c": 98,
        "ext_c": 72,
        "anneal_offset_c": 3,
        "tags": ["Tm+3°C", "快速", "经典文献常用"],
        "summary": "经典高频文献高保真酶，15-30 s/kb，注意退火温度通常需 Tm + 3°C",
    },
    # --- TransGen / Yeasen / Thermo ---
    "TransStart FastPfu (TransGen)": {
        "id": "TransStart FastPfu (TransGen)",
        "vendor": "全式金 TransGen",
        "category": "国产高保真",
        "mix_name": "2x TransStart FastPfu PCR SuperMix",
        "extension_sec_per_kb": 25,
        "denature_c": 95,
        "ext_c": 72,
        "anneal_offset_c": -3,
        "tags": ["国产主力", "快速Pfu", "性价比高"],
        "summary": "国内高校常见高保真 Pfu 酶，20-30 s/kb，常规克隆与拼接性价比极佳",
    },
    "Hieff Canace Plus (Yeasen)": {
        "id": "Hieff Canace Plus (Yeasen)",
        "vendor": "翌圣 Yeasen",
        "category": "高保真抗抑制",
        "mix_name": "2x Hieff Canace Plus PCR Master Mix",
        "extension_sec_per_kb": 20,
        "denature_c": 98,
        "ext_c": 72,
        "anneal_offset_c": -2,
        "tags": ["国产高保真", "高GC兼容", "快速"],
        "summary": "翌圣主力高保真预混液，15-30 s/kb，兼具高产量与宽退火窗口",
    },
    "Platinum SuperFi II (Thermo)": {
        "id": "Platinum SuperFi II (Thermo)",
        "vendor": "Thermo Fisher",
        "category": "通用 60°C 退火",
        "mix_name": "2x Platinum SuperFi II PCR Master Mix",
        "extension_sec_per_kb": 25,
        "denature_c": 98,
        "ext_c": 72,
        "anneal_offset_c": 0,
        "tags": ["统一60°C退火", "超高保真", "高GC"],
        "summary": "Thermo 旗舰超高保真酶，支持统一 60°C 退火，极适合多片段同板扩增",
    },
}


def resolve_polymerase_spec(
    name: str,
    custom_polymerase: Optional[CustomPolymeraseConfig] = None,
) -> dict:
    """Resolve either one of the 15 built-in lab polymerases or a user-customized polymerase."""
    if custom_polymerase is not None and (name == "custom" or name == custom_polymerase.name or name not in POLYMERASE_SPECS):
        return {
            "id": custom_polymerase.name,
            "vendor": custom_polymerase.vendor,
            "category": "自定义聚合酶",
            "mix_name": custom_polymerase.mix_name or f"2x {custom_polymerase.name} Mix",
            "extension_sec_per_kb": custom_polymerase.extension_sec_per_kb,
            "denature_c": custom_polymerase.denature_c,
            "ext_c": custom_polymerase.ext_c,
            "anneal_offset_c": custom_polymerase.anneal_offset_c,
            "tags": ["自定义", f"{custom_polymerase.extension_sec_per_kb}s/kb"],
            "summary": custom_polymerase.summary,
        }
    if name in POLYMERASE_SPECS:
        return POLYMERASE_SPECS[name]
    # Case-insensitive partial fallback before defaulting to Phanta Max
    low = name.strip().lower()
    for key, spec in POLYMERASE_SPECS.items():
        if low in key.lower():
            return spec
    return POLYMERASE_SPECS["Phanta Max (Vazyme)"]


def list_polymerase_catalog() -> list[dict]:
    return list(POLYMERASE_SPECS.values())


def pmol_to_ng(pmol: float, length_bp: int) -> float:
    """Convert dsDNA pmol to ng using standard 650 g/mol/bp."""
    return pmol * max(1, length_bp) * 0.65


def ng_to_pmol(ng: float, length_bp: int) -> float:
    return ng / (max(1, length_bp) * 0.65)


def _format_ext_time(length_bp: int, sec_per_kb: int, min_sec: int = 10) -> str:
    secs = max(min_sec, math.ceil((length_bp / 1000.0) * sec_per_kb))
    if secs >= 60:
        mins, rem = divmod(secs, 60)
        return f"{mins} min {rem} s" if rem else f"{mins} min"
    return f"{secs} s"


def _pipette_with_dilution(
    mass_ng: float,
    conc_ng_ul: float,
    reagent_label: str,
) -> tuple[float, Optional[str]]:
    """
    Compute exact pipetting volume (uL).
    If raw volume < 0.5 uL (unreliable on standard P2/P10 pipettes), automatically solves a
    clean pre-dilution factor (1:5 / 1:10 / 1:20 / 1:50 / 1:100) and returns the diluted pipetting volume!
    """
    raw_ul = mass_ng / max(0.01, conc_ng_ul)
    if raw_ul >= 0.5:
        return round(raw_ul, 2), None

    chosen_df = 10
    for df in (5, 10, 20, 50, 100):
        if raw_ul * df >= 1.0:
            chosen_df = df
            break
    else:
        chosen_df = 100

    diluted_ul = round(raw_ul * chosen_df, 2)
    stock_part = 2 if chosen_df <= 20 else 1
    water_part = stock_part * (chosen_df - 1)
    alert = (
        f"原液仅需 {raw_ul:.2f} μL（< 0.5 μL 移液误差极大）！请对 {reagent_label} 先做 1:{chosen_df} 预稀释"
        f"（取 {stock_part} μL 原液 + {water_part} μL ddH2O 混匀），再吸取 {diluted_ul:.2f} μL 稀释液加入体系。"
    )
    return diluted_ul, alert


def _build_timeline(req: PipettingCalcRequest, profile) -> list[TimelineDay]:
    sys_id = req.plasmid_system
    wt_bp = req.wt_amplicon_bp
    ko_bp = req.ko_amplicon_bp

    if sys_id == "pEcCas/pEcgRNA":
        return [
            TimelineDay(
                day="Day 1",
                title="pEcgRNA-N20 组装 & OE-PCR 制备 Donor",
                steps=[
                    "将合成的 sgRNA 正反向 Oligo 退火成双链，稀释 1:200 后与 BsaI 酶切的 pEcgRNA 骨架连接，转化 DH5α 涂 Spec (50 μg/mL) 平板（ccdB 负筛几乎零假阳性）。",
                    "同步以野生型基因组为模板扩增左右同源臂（LA/RA），胶回收后测定 NanoDrop 浓度并按上方 OE-PCR 配方拼接全长 Donor 并纯化。",
                ],
                checkpoint="获得高纯度全长 Donor（建议浓度 ≥ 80 ng/μL）及 Spec 抗性单菌落。",
            ),
            TimelineDay(
                day="Day 2",
                title="质粒确认 & λ-Red 诱导共电转",
                steps=[
                    "挑取 2–3 个 pEcgRNA-N20 菌落做菌落 PCR / 测序并提质粒。",
                    "将已含 pEcCas (KanR) 的宿主菌接种于 LB+Kan，OD600≈0.2 时加入 10 mM L-阿拉伯糖 37°C 诱导 λ-Red 表达 1–2 h，制备电转感受态。",
                    f"将 {req.electroporation_plasmid_ng:.0f} ng pEcgRNA-N20 与 {req.electroporation_donor_ng:.0f} ng Donor 混合电转（1.8 kV / 1 mm 电转杯），SOC 复苏 1 h 后涂布 Kan+Spec 双抗平板，37°C 过夜。",
                ],
                checkpoint="Kan+Spec 双抗平板长出单菌落（阴性对照不加 Donor 应几乎无菌落）。",
            ),
            TimelineDay(
                day="Day 3",
                title="跨位点菌落 PCR 筛选 & Sanger 测序确认",
                steps=[
                    f"挑取 8–12 个单菌落，用外侧验证引物 VF+VR 进行菌落 PCR（野生型 {wt_bp} bp，敲除阳性株 {ko_bp} bp，清晰区分）。",
                    "对条带正确的阳性克隆同时可用 WT 内部对照引物复核无野生型混杂，并取 VF+VR 产物送 Sanger 测序确认无痕连接点。",
                ],
                checkpoint="Sanger 峰图与硅片预测 KO 序列 100% 吻合。",
            ),
            TimelineDay(
                day="Day 4",
                title="两步法依次消除 pEcgRNA 与 pEcCas",
                steps=[
                    "消除 pEcgRNA：将阳性克隆接入含 Kan (50 μg/mL) + 10 mM L-鼠李糖的 LB 中 37°C 培养过夜，划线分离后点板验证 Spec 敏感。",
                    "消除 pEcCas：将 Spec 敏感克隆接入无抗 LB 培养 4–6 h，稀释涂布含 5% 蔗糖的 LB 平板（sacB 反筛），挑单菌落点板验证 Kan 敏感，甘油保种！",
                ],
                checkpoint="获得无任何外源质粒与抗性标记的洁净无痕敲除工程菌。",
            ),
        ]

    if sys_id == "pCas/pTargetF":
        return [
            TimelineDay(
                day="Day 1",
                title="pTargetF 反向 PCR 替换 N20 & Donor OE-PCR",
                steps=[
                    "以 pTargetF 为模板用反向 PCR 引物全质粒扩增，37°C DpnI 消化母本模板 1 h 后经 T4 PNK 磷酸化自连（或无缝自环化），转化 DH5α 涂 Spec (50 μg/mL) 平板。",
                    "同步扩增左右同源臂并完成两步法 OE-PCR 拼接与柱纯化，测 NanoDrop 浓度。",
                ],
                checkpoint="获得测序正确的 pTargetF-N20 质粒与全长 Donor DNA。",
            ),
            TimelineDay(
                day="Day 2",
                title="30°C 诱导 λ-Red & 共电转编辑",
                steps=[
                    "含温敏型 pCas (KanR) 的宿主菌务必全程 30°C 培养！OD600≈0.2 时加 10 mM L-阿拉伯糖诱导 λ-Red 1–2 h 并制冰浴电转感受态。",
                    f"共电转 {req.electroporation_plasmid_ng:.0f} ng pTargetF-N20 与 {req.electroporation_donor_ng:.0f} ng Donor，30°C 复苏 1.5 h 后涂布 Kan+Spec 双抗平板，30°C 培养 18–24 h。",
                ],
                checkpoint="30°C Kan+Spec 双抗平板长出单菌落。",
            ),
            TimelineDay(
                day="Day 3",
                title="跨位点菌落 PCR 鉴定 & Sanger 测序",
                steps=[
                    f"挑取 8–12 个单菌落，用外侧 VF+VR 进行菌落 PCR（WT={wt_bp} bp vs KO={ko_bp} bp），并送测序验证敲除连接点。",
                ],
                checkpoint="确认纯合无痕敲除阳性菌株。",
            ),
            TimelineDay(
                day="Day 4",
                title="IPTG 消 pTargetF & 37°C 温敏消 pCas",
                steps=[
                    "消除 pTargetF：阳性菌接种于含 Kan (50 μg/mL) + 0.5 mM IPTG 的 LB 中 30°C 培养 8–16 h，划线验证 Spec 敏感。",
                    "消除 pCas：将 Spec 敏感菌转接无抗 LB，于 37°C 摇床过夜培养，划线挑单菌落验证 Kan 敏感后保种！",
                ],
                checkpoint="双抗均敏感的干净无痕敲除株建库完成。",
            ),
        ]

    if sys_id == "pJOE8999":
        return [
            TimelineDay(
                day="Day 1",
                title="pJOE8999 BsaI 蓝白斑克隆 N20 & 插入 Donor",
                steps=[
                    "退火 sgRNA 正反向 Oligo（5'-TACG / 5'-AAAC），经 BsaI 金门组装替换 pJOE8999 的 lacZα 片段，转化 DH5α 涂布 Kan (50 μg/mL) + X-gal/IPTG 平板挑白斑测序。",
                    "将 OE-PCR 拼接的 Donor DNA（两端可附加 SfiI 位点或无缝克隆接头）克隆至 pJOE8999-N20 载体，提多聚体/高浓度质粒。",
                ],
                checkpoint="获得同时携带 sgRNA 与 Donor 的一体化重组质粒 pJOE8999-N20-Donor。",
            ),
            TimelineDay(
                day="Day 2",
                title="枯草芽孢杆菌转化 & 甘露糖诱导编辑",
                steps=[
                    "采用 Spizizen 自然感受态法或电转法将一体化质粒转入枯草芽孢杆菌宿主。",
                    "涂布含 Kan (5 μg/mL) + 0.2% D-甘露糖的 LB 平板，30°C 培养 24–36 h 诱导 Cas9 表达与同源重组。",
                ],
                checkpoint="0.2% D-甘露糖 + Kan 平板长出单菌落。",
            ),
            TimelineDay(
                day="Day 3",
                title="跨位点菌落 PCR 筛选 & 测序确认",
                steps=[
                    f"菌落先经 98°C 裂解 10 min（革兰氏阳性菌细胞壁较厚），再用外侧 VF+VR 执行菌落 PCR（WT={wt_bp} bp vs KO={ko_bp} bp），阳性产物送 Sanger 测序。",
                ],
                checkpoint="测序确认目标基因精准无痕敲除。",
            ),
            TimelineDay(
                day="Day 4",
                title="50°C 高温一步消除温敏型 pJOE8999",
                steps=[
                    "将阳性菌株接种于无抗 LB 中，50°C 摇床过夜培养 12–16 h 促使温敏质粒丢失。",
                    "划线无抗平板后分别点种 Kan (5 μg/mL) 与无抗平板，挑选 Kan 敏感株甘油保种！",
                ],
                checkpoint="单步高温消除质粒，获得无抗干净工程菌。",
            ),
        ]

    # Custom universal system
    return [
        TimelineDay(
            day="Day 1",
            title=f"{profile.short_label} sgRNA 载体构建 & Donor 制备",
            steps=[
                f"按自定义载体克隆模式（{profile.cloning_method}）构建重组 sgRNA 质粒并测序确认 N20 序列。",
                "扩增左右同源臂，按上方 OE-PCR 配方拼接并柱纯化全长 Donor DNA。",
            ],
            checkpoint="质粒测序无误且 Donor 条带单一、浓度达标。",
        ),
        TimelineDay(
            day="Day 2",
            title="转化宿主菌与抗性筛选",
            steps=[
                profile.inducer_note,
                f"转化后涂布筛选平板（{profile.antibiotics}）。",
            ],
            checkpoint="抗性平板长出单菌落。",
        ),
        TimelineDay(
            day="Day 3",
            title="跨位点菌落 PCR & Sanger 测序确认",
            steps=[
                f"使用严格位于同源臂外侧的 VF+VR 筛选阳性菌落（WT={wt_bp} bp vs KO={ko_bp} bp），并送 Sanger 测序复核无痕连接点。",
            ],
            checkpoint="Sanger 峰图确认纯合敲除。",
        ),
        TimelineDay(
            day="Day 4",
            title="质粒消除与菌株保种",
            steps=[profile.curing_protocol, "点板验证抗性完全丢失后甘油管 -80°C 保种。"],
            checkpoint="获得洁净无抗目标敲除株。",
        ),
    ]


def calculate_wetlab_protocol(req: PipettingCalcRequest) -> WetLabProtocol:
    """
    Compute bench-ready pipetting volumes from real measured NanoDrop concentrations,
    with automatic < 0.5 uL pre-dilution alerts, polymerase-specific PCR thermocycler settings,
    and plasmid-system-adapted 4-day wet-lab timeline.
    """
    profile = resolve_plasmid_profile(req.plasmid_system, req.custom_plasmid)
    poly = resolve_polymerase_spec(req.polymerase, req.custom_polymerase)
    reactions: list[ReactionMix] = []

    # ------------------------------------------------------------------
    # Reaction 1: sgRNA Plasmid Construction
    # ------------------------------------------------------------------
    if profile.cloning_method == "golden_gate_oligo":
        vec_ul, vec_alert = _pipette_with_dilution(
            50.0, req.vector_backbone_conc_ng_ul, f"{profile.restriction_enzyme} 线性化载体"
        )
        water_lig = round(max(0.0, 10.0 - vec_ul - 1.0 - 1.0 - 1.0), 2)
        reactions.append(
            ReactionMix(
                title=f"1. sgRNA 质粒 {profile.restriction_enzyme} 金门/连接体系 ({profile.short_label})",
                subtitle="先将 100 μM F/R Oligo 各 1 μL + 10x T4 Buffer 2 μL + ddH2O 16 μL 退火后 1:200 稀释，再配制下表连接体系",
                total_volume_ul=10.0,
                components=[
                    PipettingComponent(
                        reagent=f"{profile.restriction_enzyme} 线性化载体骨架",
                        stock_conc=f"{req.vector_backbone_conc_ng_ul} ng/μL",
                        volume_ul=vec_ul,
                        final_amount="50 ng",
                        dilution_alert=vec_alert,
                    ),
                    PipettingComponent(
                        reagent="退火双链 sgRNA Oligo (1:200 稀释液)",
                        stock_conc="25 nM",
                        volume_ul=1.0,
                        final_amount="25 fmol",
                    ),
                    PipettingComponent(
                        reagent="10x T4 DNA Ligase Buffer",
                        stock_conc="10x",
                        volume_ul=1.0,
                        final_amount="1x",
                    ),
                    PipettingComponent(
                        reagent="T4 DNA Ligase (若一步法另加 0.5 μL BsaI)",
                        stock_conc="400 U/μL",
                        volume_ul=1.0,
                        final_amount="400 U",
                    ),
                    PipettingComponent(
                        reagent="无菌 ddH2O (补足至 10 μL)",
                        stock_conc="-",
                        volume_ul=water_lig,
                        final_amount="补足",
                    ),
                ],
                thermocycler_program=[
                    "Oligo 退火：95°C 5 min → 以 -0.1°C/s 缓慢降至 20°C → 16°C 保存",
                    "连接反应：22°C 孵育 1 h（或 16°C 过夜）→ 80°C 灭活 10 min",
                ],
                notes=[profile.selection_screen],
            )
        )
    else:
        tmpl_ul, tmpl_alert = _pipette_with_dilution(
            10.0, req.vector_backbone_conc_ng_ul, f"{profile.short_label} 模板质粒"
        )
        inv_ext = _format_ext_time(2500, poly["extension_sec_per_kb"], min_sec=15)
        water_inv = round(max(0.0, 50.0 - 25.0 - 2.0 - 2.0 - tmpl_ul), 2)
        reactions.append(
            ReactionMix(
                title=f"1. 全质粒反向 PCR 替换 N20 体系 ({profile.short_label})",
                subtitle="使用 N20-Scaffold 正向引物 + J23119 通用反向引物全质粒扩增",
                total_volume_ul=50.0,
                components=[
                    PipettingComponent(
                        reagent=poly["mix_name"],
                        stock_conc="2x",
                        volume_ul=25.0,
                        final_amount="1x",
                    ),
                    PipettingComponent(
                        reagent="反向 PCR 正向引物 (5'-N20-Scaffold)",
                        stock_conc="10 μM",
                        volume_ul=2.0,
                        final_amount="0.4 μM",
                    ),
                    PipettingComponent(
                        reagent="反向 PCR 通用反向引物",
                        stock_conc="10 μM",
                        volume_ul=2.0,
                        final_amount="0.4 μM",
                    ),
                    PipettingComponent(
                        reagent="原始 sgRNA 模板质粒",
                        stock_conc=f"{req.vector_backbone_conc_ng_ul} ng/μL",
                        volume_ul=tmpl_ul,
                        final_amount="10 ng",
                        dilution_alert=tmpl_alert,
                    ),
                    PipettingComponent(
                        reagent="无菌 ddH2O",
                        stock_conc="-",
                        volume_ul=water_inv,
                        final_amount="补足至 50 μL",
                    ),
                ],
                thermocycler_program=[
                    f"预变性：{poly['denature_c']}°C 3 min",
                    f"30 循环：{poly['denature_c']}°C 15 s → 58°C 15 s → {poly['ext_c']}°C {inv_ext}",
                    f"终延伸：{poly['ext_c']}°C 5 min → 4°C 保存",
                    "后处理：加 1 μL DpnI 于 37°C 消化母本模板 1 h → 柱纯化 → T4 PNK 磷酸化 + T4 Ligase 室温自连 1 h",
                ],
                notes=[profile.selection_screen],
            )
        )

    # ------------------------------------------------------------------
    # Reaction 2: Left & Right Homology Arm PCR (50 uL each)
    # ------------------------------------------------------------------
    arm_anneal = round(min(req.la_anneal_tm, req.ra_anneal_tm) + poly["anneal_offset_c"], 1)
    arm_ext = _format_ext_time(max(req.la_len_bp, req.ra_len_bp), poly["extension_sec_per_kb"], min_sec=10)
    reactions.append(
        ReactionMix(
            title="2. 左右同源臂 PCR 扩增体系 (LA / RA 各配 1 管)",
            subtitle=f"以宿主野生型基因组 DNA 为模板，分别扩增左臂 ({req.la_len_bp} bp) 与右臂 ({req.ra_len_bp} bp)",
            total_volume_ul=50.0,
            components=[
                PipettingComponent(reagent=poly["mix_name"], stock_conc="2x", volume_ul=25.0, final_amount="1x"),
                PipettingComponent(reagent="上游引物 (LA_F 或 RA_F_ov)", stock_conc="10 μM", volume_ul=2.0, final_amount="0.4 μM"),
                PipettingComponent(reagent="下游引物 (LA_R_ov 或 RA_R)", stock_conc="10 μM", volume_ul=2.0, final_amount="0.4 μM"),
                PipettingComponent(reagent="宿主野生型基因组 DNA", stock_conc="~50 ng/μL", volume_ul=1.0, final_amount="50 ng"),
                PipettingComponent(reagent="无菌 ddH2O", stock_conc="-", volume_ul=20.0, final_amount="补足至 50 μL"),
            ],
            thermocycler_program=[
                f"预变性：{poly['denature_c']}°C 3 min",
                f"32 循环：{poly['denature_c']}°C 15 s → {arm_anneal}°C 15 s → {poly['ext_c']}°C {arm_ext}",
                f"终延伸：{poly['ext_c']}°C 5 min → 4°C 保存",
            ],
            notes=[
                "胶回收纯化 LA 与 RA 产物后，请将 NanoDrop 实测浓度填入上方输入框，系统将自动精算下一步 OE-PCR 移液微升数。",
            ],
        )
    )

    # ------------------------------------------------------------------
    # Reaction 3: OE-PCR Stitching (Molar Ratio OR Volume Ratio!)
    # ------------------------------------------------------------------
    if req.oe_pcr_ratio_mode == "molar_ratio":
        la_mass_ng = pmol_to_ng(req.oe_pcr_target_pmol_each, req.la_len_bp)
        ra_mass_ng = pmol_to_ng(req.oe_pcr_target_pmol_each, req.ra_len_bp)
        la_ul, la_alert = _pipette_with_dilution(la_mass_ng, req.la_conc_ng_ul, "左同源臂回收产物 (LA)")
        ra_ul, ra_alert = _pipette_with_dilution(ra_mass_ng, req.ra_conc_ng_ul, "右同源臂回收产物 (RA)")
        la_final = f"{la_mass_ng:.1f} ng ({req.oe_pcr_target_pmol_each:.3f} pmol)"
        ra_final = f"{ra_mass_ng:.1f} ng ({req.oe_pcr_target_pmol_each:.3f} pmol)"
        ratio_note = f"当前为【等摩尔比模式】：LA 与 RA 严格按 1:1 摩尔比（各 {req.oe_pcr_target_pmol_each} pmol）投料，拼接效率最稳。"
    else:
        la_ul = round(req.volume_ratio_la_ul, 2)
        ra_ul = round(req.volume_ratio_ra_ul, 2)
        la_mass_ng = la_ul * req.la_conc_ng_ul
        ra_mass_ng = ra_ul * req.ra_conc_ng_ul
        la_pmol = ng_to_pmol(la_mass_ng, req.la_len_bp)
        ra_pmol = ng_to_pmol(ra_mass_ng, req.ra_len_bp)
        imbalance = max(la_pmol, ra_pmol) / max(1e-6, min(la_pmol, ra_pmol))
        la_alert = None
        ra_alert = None
        if imbalance > 3.0:
            imbalance_msg = (
                f"当前体积比导致 LA:RA 实际摩尔比失衡达 {la_pmol / max(1e-6, ra_pmol):.1f}:1（超过 3:1），"
                "建议微调投料体积或一键切回「等摩尔比模式」以防单链过剩。"
            )
            if la_pmol > ra_pmol:
                la_alert = imbalance_msg
            else:
                ra_alert = imbalance_msg
        la_final = f"{la_mass_ng:.1f} ng ({la_pmol:.3f} pmol)"
        ra_final = f"{ra_mass_ng:.1f} ng ({ra_pmol:.3f} pmol)"
        ratio_note = f"当前为【体积比模式】：按 LA {la_ul} μL : RA {ra_ul} μL 投料（实际摩尔比 {la_pmol / max(1e-6, ra_pmol):.2f}:1）。"

    water_oe = round(max(0.0, 50.0 - 25.0 - la_ul - ra_ul - 2.0 - 2.0), 2)
    oe_anneal = round(req.overlap_tm - 1.0, 1)
    oe_ext = _format_ext_time(req.donor_len_bp, poly["extension_sec_per_kb"], min_sec=15)

    reactions.append(
        ReactionMix(
            title="3. Donor OE-PCR 两步法无缝拼接体系 (50 μL)",
            subtitle=f"将左臂 + 右臂无缝拼接为 {req.donor_len_bp} bp 全长 Donor DNA",
            total_volume_ul=50.0,
            components=[
                PipettingComponent(reagent=poly["mix_name"], stock_conc="2x", volume_ul=25.0, final_amount="1x"),
                PipettingComponent(
                    reagent="纯化左同源臂 (LA)",
                    stock_conc=f"{req.la_conc_ng_ul} ng/μL",
                    volume_ul=la_ul,
                    final_amount=la_final,
                    dilution_alert=la_alert,
                ),
                PipettingComponent(
                    reagent="纯化右同源臂 (RA)",
                    stock_conc=f"{req.ra_conc_ng_ul} ng/μL",
                    volume_ul=ra_ul,
                    final_amount=ra_final,
                    dilution_alert=ra_alert,
                ),
                PipettingComponent(
                    reagent="外侧正向引物 LA_F (Step 2 补加)",
                    stock_conc="10 μM",
                    volume_ul=2.0,
                    final_amount="0.4 μM",
                ),
                PipettingComponent(
                    reagent="外侧反向引物 RA_R (Step 2 补加)",
                    stock_conc="10 μM",
                    volume_ul=2.0,
                    final_amount="0.4 μM",
                ),
                PipettingComponent(reagent="无菌 ddH2O", stock_conc="-", volume_ul=water_oe, final_amount="补足至 50 μL"),
            ],
            thermocycler_program=[
                f"Step 1 (不加外侧引物，先做 46 μL 预混体系)：{poly['denature_c']}°C 3 min → 10 循环 [{poly['denature_c']}°C 15 s → {oe_anneal}°C 20 s → {poly['ext_c']}°C {oe_ext}]",
                f"Step 2 (暂停加入 2 μL LA_F + 2 μL RA_R)：25 循环 [{poly['denature_c']}°C 15 s → {arm_anneal}°C 15 s → {poly['ext_c']}°C {oe_ext}] → {poly['ext_c']}°C 5 min",
            ],
            notes=[
                ratio_note,
                "胶回收全长 Donor 条带时建议最后用 20–30 μL 预热去离子水洗脱，以提高电转浓度。",
            ],
        )
    )

    # ------------------------------------------------------------------
    # Reaction 4: Electroporation / Co-Transformation DNA Mix
    # ------------------------------------------------------------------
    donor_ul, donor_alert = _pipette_with_dilution(
        req.electroporation_donor_ng, req.donor_conc_ng_ul, "全长 Donor DNA"
    )
    plasmid_ul, plasmid_alert = _pipette_with_dilution(
        req.electroporation_plasmid_ng, req.sgrna_plasmid_conc_ng_ul, f"{profile.short_label} sgRNA 质粒"
    )
    total_dna_ul = round(donor_ul + plasmid_ul, 2)
    ep_notes = [
        f"将上述 {total_dna_ul} μL DNA 混液加入 50–100 μL 冰浴电转感受态中轻柔混匀，冰浴 2 min 后转入预冷 1 mm 电转杯。",
        profile.inducer_note,
    ]
    if total_dna_ul > 10.0:
        ep_notes.insert(
            0,
            f"⚠️ 预警：当前 DNA 总加样体积达 {total_dna_ul} μL（超过推荐上限 10 μL），可能降低转化/电转效率或引发电击打火！建议对 Donor 进行浓缩或乙醇沉淀重悬。",
        )

    reactions.append(
        ReactionMix(
            title="4. 共电转 / 转化 DNA 投料配比",
            subtitle=f"按实测浓度精准配制 {req.electroporation_donor_ng:.0f} ng Donor + {req.electroporation_plasmid_ng:.0f} ng sgRNA 质粒",
            total_volume_ul=total_dna_ul,
            components=[
                PipettingComponent(
                    reagent="纯化全长 Donor DNA",
                    stock_conc=f"{req.donor_conc_ng_ul} ng/μL",
                    volume_ul=donor_ul,
                    final_amount=f"{req.electroporation_donor_ng:.0f} ng",
                    dilution_alert=donor_alert,
                ),
                PipettingComponent(
                    reagent=f"{profile.short_label} 重组 sgRNA 质粒",
                    stock_conc=f"{req.sgrna_plasmid_conc_ng_ul} ng/μL",
                    volume_ul=plasmid_ul,
                    final_amount=f"{req.electroporation_plasmid_ng:.0f} ng",
                    dilution_alert=plasmid_alert,
                ),
            ],
            thermocycler_program=["电转参数参考 (E. coli 1 mm 杯)：1.8 kV, 25 μF, 200 Ω → 立刻加入 1 mL 预温 SOC/LB 复苏 1–1.5 h"],
            notes=ep_notes,
        )
    )

    # ------------------------------------------------------------------
    # Reaction 5: Cross-Site Colony PCR Screening (20 uL)
    # ------------------------------------------------------------------
    taq = POLYMERASE_SPECS["2x Taq Master Mix (Colony PCR)"]
    col_anneal = round(req.verify_anneal_tm - 3.0, 1)
    # Extend based on WT amplicon (longer!) so wild-type controls never produce false negatives
    col_ext = _format_ext_time(max(req.wt_amplicon_bp, req.ko_amplicon_bp), taq["extension_sec_per_kb"], min_sec=30)

    reactions.append(
        ReactionMix(
            title="5. 跨位点菌落 PCR 筛选体系 (20 μL/单菌落)",
            subtitle="延伸时间已按较长的野生型条带足额计算，杜绝野生型扩不出导致的假阴性误判",
            total_volume_ul=20.0,
            components=[
                PipettingComponent(reagent=taq["mix_name"], stock_conc="2x", volume_ul=10.0, final_amount="1x"),
                PipettingComponent(reagent="外侧验证上游引物 VF", stock_conc="10 μM", volume_ul=0.8, final_amount="0.4 μM"),
                PipettingComponent(reagent="外侧验证下游引物 VR", stock_conc="10 μM", volume_ul=0.8, final_amount="0.4 μM"),
                PipettingComponent(reagent="单菌落悬液 (先点备份板)", stock_conc="1 μL 菌液", volume_ul=1.0, final_amount="模板"),
                PipettingComponent(reagent="无菌 ddH2O", stock_conc="-", volume_ul=7.4, final_amount="补足至 20 μL"),
            ],
            thermocycler_program=[
                "菌体裂解：95°C 5 min（革兰氏阳性菌如枯草建议先 98°C 煮沸裂解 10 min）",
                f"30 循环：95°C 15 s → {col_anneal}°C 15 s → 72°C {col_ext}",
                "终延伸：72°C 5 min → 1% 琼脂糖凝胶电泳鉴定",
            ],
            notes=[
                f"强烈建议同时设置 1 管野生型菌株作为阳性对照（预期 {req.wt_amplicon_bp} bp），肉眼直接对比阳性敲除株（预期 {req.ko_amplicon_bp} bp）。",
            ],
        )
    )

    interpretation = {
        "wild_type_band": f"{req.wt_amplicon_bp} bp（未敲除野生型，或混杂克隆出现双带）",
        "knockout_positive_band": f"{req.ko_amplicon_bp} bp（目标基因已精准敲除，比 WT 缩短 {abs(req.wt_amplicon_bp - req.ko_amplicon_bp)} bp）",
        "wt_internal_control": "使用 VF + WT_int_R 复核时：野生型亮带明显，纯合阳性敲除株应完全无条带（排除野生型混杂）。",
        "sanger_confirmation": "切胶回收或柱纯化 KO 条带（{ko} bp），使用配套 Seq_F 引物测序验证无痕连接点。".format(
            ko=req.ko_amplicon_bp
        ),
    }

    return WetLabProtocol(
        plasmid_system=req.plasmid_system,
        polymerase=poly["id"],
        custom_polymerase=req.custom_polymerase,
        reactions=reactions,
        timeline=_build_timeline(req, profile),
        colony_pcr_interpretation=interpretation,
    )
