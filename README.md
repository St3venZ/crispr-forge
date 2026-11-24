# CRISPR-Forge — 零信任原核生物基因编辑设计与验证工作台

> **核心理念**：大模型只负责自然语言意图解析、异常修复决策与结果简报，**绝不凭空编造任何 DNA 序列**；所有基因组溯源、脱靶检索、引物热力学、硅片仿真与移液换算全部由确定性代码内核执行，**12 项自动核验通过后才输出可执行交付包**。

---

## 核心特性

### 1. 通用跨底盘支持（不再局限于内置模式菌株）
- **菌株名称模糊检索（内置 + NCBI 实时联网）**：支持中英文输入任意常见或冷门原核菌株名称（如“大肠杆菌”、“BL21”、“枯草芽孢杆菌”、“恶臭假单胞菌”、“链霉菌”等），自动联想官方 RefSeq Accession，无需手动查库。
- **任意底盘全基因组自动按需抓取**：内置缓存大肠杆菌（4.64 Mb）、枯草芽孢杆菌（4.22 Mb）、谷氨酸棒状杆菌（3.28 Mb）三物种完整染色体；输入任意其他 NCBI RefSeq 底盘时自动在线抓取并永久缓存，实现全基因组级脱靶核验。
- **支持本地私有文件上传**：直接拖入 `.gb / .gbk`（自动解析全部注释与邻近基因边界）或无注释纯 `.fasta` 文件（支持自动识别中心区最长编码框或自定义起止坐标）。

### 2. 通用载体体系 + 空白载体 `.gb` 自动识别
- 开箱支持 3 套实验室高频体系（`pEcCas/pEcgRNA`、`pCas/pTargetF`、`pJOE8999`）与通用自定义体系；
- **上传空白载体 `.gb` 自动解析**：面向未收录的自建载体，直接拖入空白图谱文件，后端自动识别克隆策略、酶切粘性末端、抗性标记并生成真实骨架验证引物，支持**一键保存至浏览器本地「我的常用载体库」**长期复用。

### 3. 12 点零信任 *In Silico* 硅片验证与自愈闭环
- 自动执行 12 项确定性代码验证：序列 SHA-256 溯源、邻近基因与 24 bp RBS 保护、克隆酶切位点排雷、全基因组脱靶扫描、质粒组装仿真、同源臂扩增仿真、拼接仿真、同源重组与防二次切割验证、外侧跨位点验证引物防假阳性检查、电泳分辨率校验、热力学审计及合成纯化标注；
- 校验出现阻断项时读取结构化修复提示，自动触发最多 3 轮**自愈重试**，直至核心检查全部通过。

### 4. 实验台零手算交付与可定制科研工作台
- **15 款主流聚合酶可搜索大库 + 自定义聚合酶**：覆盖 Vazyme、TOYOBO、Takara、NEB、TransGen、Yeasen、Thermo 主力高保真与菌落酶，支持自定义品牌/延伸速率/变性与退火偏移，前后端联动精准计算反应程序；
- **实时 NanoDrop 移液计算器**：填入实测浓度后实时换算微升数（支持等摩尔比 / 体积比切换），自动拦截 **`< 0.5 μL` 微量移液误差并给出精确预稀释比例**；
- **交互式可视化与一键交付**：1×–20× 光标锚点平滑缩放/拖拽基因座图谱 + UV 模拟电泳胶图 + 一键导出 4 份带注释 `.gb` 图谱、引物订购 `.xlsx`、打印版 `.md` 文档与 `.zip` 完整实验包；
- **高度自由的界面体验**：首次打开自动弹出交互式**新手使用指引**（顶栏随时可重开），支持 **科学深海钴蓝（浅色）/ 暗室曜石（深色）/ 跟随系统** 三态主题切换，以及 **`84%–120%` 按 `2%` 步进 / `1%` 无级滑块** 的细粒度字号调节。

---

## 系统架构

```mermaid
flowchart TD
    U["用户 / 外部 AI 客户端"] --> UI["Next.js 15 科研工作台 (浅色钴蓝 / 深色曜石)"]
    U --> MCP["MCP Server (stdio)"]
    UI --> API["FastAPI + SSE 进度流 + 免费额度门控"]
    MCP --> REG["确定性生物工具注册表"]
    API --> EXTRA["辅助解析服务 (RefSeq 菌株检索 / 空白载体 .gb 解析)"]
    API --> ORCH["OpenAI 兼容自愈 Agent / 零 Key 确定性引擎"]
    ORCH --> REG
    REG --> K1["多物种基因组溯源 + 自动全基因组缓存"]
    K1 --> K2["靶点筛选 + 载体规则排雷 + 同源臂与验证引物设计"]
    K2 --> V["12 点零信任硅片仿真验证门"]
    V -- "FAIL + repair_hint (最多 3 轮自愈)" --> ORCH
    V -- "PASS" --> W["15+ 聚合酶动态移液计算器 + .gb / .xlsx / .zip 导出"]
```

---

## 完整使用说明

### 入口选择（首次访问会自动弹出交互式指引）
1. **一句话自然语言**：直接在首页输入框描述目标菌株、基因与体系（例如：“用 pJOE8999 敲除枯草芽孢杆菌 amyE，同源臂 600 bp”），点击运行即可。
2. **三步快捷配置**：
   - 在 **菌株检索框** 输入中文/英文菌株名或 RefSeq 编号并点选；或切到上传模式直接拖入本地 `.gb / .fasta`；
   - 填写目标基因名或坐标；
   - 选择内置载体体系，或选「自定义载体」并**拖入空白载体 `.gb` 文件自动解析**并保存到本地载体库。
3. **高级参数与试剂库**：展开高级选项可使用精密数字滑块精确设定同源臂长度、退火温度与条带差，并通过可搜索下拉框选用 15 款内置聚合酶或添加自定义聚合酶。

### 结果核验与实验台联动
- **核验与切换**：顶部展示 12 点验证状态与专家摘要；在靶点列表点击任意备选方案可即时触发后端重验，图谱、电泳与引物表同步刷新。
- **图谱与电泳**：在基因座图谱区域支持 `Ctrl + 滚轮`（或开启滚轮直缩）、左键拖拽平移、底部概览条定位与快捷聚焦；右侧 UV 模拟胶图悬停任意泳道可发射水平分子量准星对照 Marker。
- **移液换算与导出**：在 NanoDrop 区域修改实测浓度，若某组分体积 `< 0.5 μL` 会亮起醒目红色稀释提醒并同步在左侧大纲栏标红计数；最后点底部或侧栏按钮即可一键下载 `.zip` 全套交付包或 `.xlsx` 引物订购表。

### 模型额度与 BYOK 配置
- **零 Key 本地免费运行**：不配置任何大模型 API Key 时，全部确定性计算、12 点校验、移液换算与文件导出均 100% 免费无限次使用；
- **站长免费体验池**：部署者在 `backend/.env` 配置一个 DeepSeek API Key 与 `FREE_TRIAL_DAILY_LIMIT=10`，即可为每位访客提供每日免费 AI 体验次数；
- **访客自带 Key（BYOK）**：点右上角模型设置按钮，一键选择 DeepSeek / 通义千问 / OpenRouter 并填入个人 Key（仅存浏览器本地），解锁无限制 AI 解析与解读。

---

## 量化评测结果（Benchmark）

运行 `backend\.venv\Scripts\python.exe backend\eval\benchmark.py --mode deterministic` 实测结果：

- **跨物种真实任务零阻断通过率**：**100.0%（6/6，全员全基因组脱靶扫描）**
- **经典设计陷阱拦截率**：**100.0%（4/4）**
- **后端自动化测试**：**23 / 23 全部通过**

| 任务 ID | 目标基因 | 载体体系 | 脱靶范围 | 12 点通过 | 阻断项 | 预期条带 WT / KO (bp) | 耗时 (ms) |
| :--- | :--- | :--- | :--- | :---: | :---: | :---: | :---: |
| `T01_Ecoli_lacZ_pTargetF` | `lacZ` | `pCas/pTargetF` | `whole_genome` | 11/12 | **0** | `4495 / 1420` | 1459 |
| `T02_Ecoli_ackA_pEcgRNA` | `ackA` | `pEcCas/pEcgRNA` | `whole_genome` | 12/12 | **0** | `2692 / 1489` | 989 |
| `T03_Ecoli_pta_KeioInFrame` | `pta` | `pEcCas/pEcgRNA` | `whole_genome` | 12/12 | **0** | `3527 / 1412` | 945 |
| `T04_Ecoli_gldA_RevStrand` | `gldA` | `pEcCas/pEcgRNA` | `whole_genome` | 12/12 | **0** | `2440 / 1336` | 960 |
| `T05_Bsubtilis_amyE_pJOE8999` | `amyE` | `pJOE8999` | `whole_genome` | 11/12 | **0** | `3697 / 1717` | 1582 |
| `T06_Cglutamicum_ldhA_Custom` | `ldhA` | `custom` | `whole_genome` | 12/12 | **0** | `2412 / 1467` | 1741 |

---

## 快速启动与一键上线

### 1. Windows 本地一键启动
```powershell
# 可选：配置 DeepSeek 免费体验额度
copy backend\.env.example backend\.env

# 一键启动后端 (8000) + 前端 (3000) 并自动打开浏览器
.\start.ps1
```

### 2. Docker Compose 一条命令部署
```bash
export LLM_API_KEY=sk-your-deepseek-key
export FREE_TRIAL_DAILY_LIMIT=10
docker compose up -d --build
```

### 3. 5 分钟免费公网上线（Vercel + Render）
1. **后端（Render）**：推送到 GitHub 后在 Render 导入 `deploy/render.yaml`，填入 `LLM_API_KEY` 与 `FREE_TRIAL_DAILY_LIMIT=10` 获取 API 地址。
2. **前端（Vercel）**：导入仓库并将 Root Directory 设为 `frontend`，配置 `NEXT_PUBLIC_API_BASE` 为上述后端地址，点击 Deploy 即可获得公网 HTTPS 访问地址。

---

## MCP Server 接入（Claude Desktop / Cursor / Antigravity）

```json
{
  "mcpServers": {
    "crispr-forge": {
      "command": "C:\\Users\\16499\\.gemini\\antigravity\\scratch\\crispr-forge\\backend\\.venv\\Scripts\\python.exe",
      "args": ["-m", "crispr_forge.agent.mcp_server"]
    }
  }
}
```

---

## 开发与测试命令

```powershell
# 运行全量后端测试（含载体 .gb 自动解析、菌株检索、跨物种与陷阱测试）
backend\.venv\Scripts\pytest.exe backend\tests -v

# 运行跨物种与陷阱量化评测
backend\.venv\Scripts\python.exe backend\eval\benchmark.py --mode deterministic

# 前端类型检查与生产构建
cd frontend && npm run build
```
