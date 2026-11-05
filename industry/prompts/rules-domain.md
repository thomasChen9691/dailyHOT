
【AI 与财经双板块翻译规则 — 本平台同时收录 AI 行业与 A 股／美股财经内容，严格遵守】

0. 板块判断：资料核心是模型、产品、论文或 AI 公司经营时按第 1–4 节的 AI 规则；核心是监管、财报、指数、利率或市场披露时按第 5 节的财经规则。交叉题材（芯片出口管制、AI 资本开支）两边规则都要遵守，但不得把 AI 术语硬套到金融语境，也不得把"利好""板块"之类市场词硬套到 AI 论文上。


1. 歧义默认值：以下词在中文有非 AI 歧义，**一律按 AI 含义翻译**：
   - LLM = 大语言模型（绝不译"法学硕士"/"Master of Laws"）
   - Token / tokens = 模型 token（保留英文；绝不译"代币"/"令牌"）
   - Transformer = Transformer 架构（保留英文；不译"变压器"）
   - Diffusion = 扩散模型（AI 生成，不是物理扩散）
   - Agent / Agentic = AI 智能体 / 智能体的（不译"代理人"/"中介"）
   - Alignment = 对齐（AI 安全语境）
   - Inference = 推理（模型生成）
   - Reasoning = 推理（注意：与 inference 都译"推理"，必要时用"链式推理"区分 CoT；reasoning model 指 o1/o3/R1 这类思考型模型）
   - Embedding = 嵌入向量（也可保留英文）
   - Distillation = 知识蒸馏
   - Hallucination = 模型幻觉
   - Fine-tune / Fine-tuning = 微调
   - Pretrain / Pretraining = 预训练
   - Context window = 上下文窗口
   - Prompt = 提示词
   - Skill / Skills = 技能（Claude 等 Agent 框架的能力包，不译"特长"）

2. 以下专有名词**一律保留英文原文**，不翻译不加中文括注：
   - AI 公司：OpenAI / Anthropic / Google DeepMind / xAI / Meta AI / Mistral / DeepSeek / Cohere / HuggingFace（HF）/ Runway / ElevenLabs / Suno / Pika / Midjourney / Perplexity
   - 模型族（举例 + 通用规则）：GPT / Claude / Gemini / Llama / Qwen / Grok / o 系列 / DeepSeek / Mistral / Mixtral / Phi / Sora / Veo / Imagen
     **规则**：任何大模型族名、产品代号一律保留英文
   - 模型版本号（举例 + 通用规则）：GPT-5 / Claude 4.7 / Claude Sonnet 4.6 / Llama 4 / Gemini 3 / o3 / o4 / DeepSeek-V4 / Qwen3.7
     **规则**：版本号一字不改（包括字母数字后缀如 4o / 4.7 / 405B / V4 / R1），绝不"翻译性扩写"（不要把 "405B" 译成 "4050 亿"，不要把 "V4" 译成 "第 4 代"）
   - 技术缩写（举例 + 通用规则）：LLM / RAG / RLHF / DPO / LoRA / QLoRA / PEFT / MoE / CoT / ReAct / KV cache / SOTA / AGI / MCP / ADK / NPU / GPU / TPU
     **规则**：任何 2-5 字母的全大写缩写，默认按 AI/ML 含义保留英文
   - 评测基准（举例 + 通用规则）：MMLU / GPQA / HumanEval / SWE-bench / SWE-bench Verified / AIME / HLE / ARC-AGI / ARC-AGI 2 / MT-Bench / Chatbot Arena / Aider Polyglot / LiveCodeBench
     **规则**：以 -bench / -eval 结尾或全大写的评测名一律保留英文
   - AI 工具/产品：Cursor / Copilot / Codex / Aider / Devin / Cline / Claude Code / Windsurf / Zed / v0 / Bolt / Lovable / Replit Agent
   - Agent 框架：LangChain / LangGraph / LlamaIndex / CrewAI / AutoGen / Pydantic AI / Vercel AI SDK / DSPy
   - 推理/部署：Ollama / vLLM / SGLang / TensorRT / Triton / CUDA / ROCm
   - 通用技术：API / SDK / CLI / IDE / SaaS / CDN / SSO / OAuth / JWT / WebSocket / SSE / gRPC

3. 中国厂商**优先用官方中文品牌名**（首次出现可双标"千问（Qwen3）"，后续选一种保持一致）：
   - 千问（Qwen）/ 文心一言 / 智谱（GLM）/ 月之暗面（Kimi）/ 深度求索（DeepSeek）/ 阶跃星辰（Step）/ 零一万物（Yi）/ 百川 / 豆包（字节）/ 混元（腾讯）/ 可灵（Kling，快手）/ 即梦（Jimeng，字节）/ MiniMax（不译）/ 美团 LongCat / 昆仑万维 Skywork / 面壁 MiniCPM / 华为昇腾 / 寒武纪

4. 代码 / 命令 / URL / 数字单位 **一字不改**保留：
   - 反引号代码 `code` 不翻译
   - 命令如 /code-review、pip install、npm run 不译（不要译"代码审查"）
   - URL 原样
   - 数字+单位：8k context / 175B params / 3.5x speedup / $3 per M tokens / 99.9%
   - 金额、参数量、比例、区间必须保留原文的阿拉伯数字和单位；不要把 $10B-$100B 改写成“数百亿至数千亿美元”等中文数量词

5. 财经板块保留与换算规则：
   - 机构与专有名词：证监会 / 上交所 / 深交所 / 北交所 / 中国人民银行（央行）/ 美联储 / FOMC / SEC / EDGAR / 沪深 300 / 中证 500 / 科创 50 / 标普 500 / 纳斯达克 100 / ETF / IPO / FOMC / CPI / PPI / GDP / ROE / EPS，首次出现可中文全称加英文缩写，后续保持一致；已有官方中文名的不逐字直译。
   - 股票代码与代码后缀一字不改：`600519.SH`、`300750.SZ`、`NVDA`、`AAPL`、`TSM` 保留原样，不写成"六十万零五百一十九"或替换为其他市场代码；A 股用 `.SH` / `.SZ` / `.BJ`，美股用交易所惯用 ticker。
   - 金额、涨跌幅、比例、点位、份额、市值保留原文阿拉伯数字与单位（`¥`、`$`、`%`、`bp`、`亿元`、`亿美元`），不换算、不四舍五入、不写成"数百亿"；`1 个百分点`不等于`1%`，不得互换。
   - 时间：保留原文日期与交易所时区语境；美股财报与美联储声明按美东日期，A 股公告按北京时间，不擅自把"盘后"改写成"当天"或把"美东周三"写成"北京时间周三"。
   - 涨跌表述只写原文能确认的方向与数字，不补写"利好/利空""主力资金""机构看好"等推断；原文没有的证券代码、公司名、指数名不得补。
   - 境内 A 股语境遵循涨红跌绿的中文习惯，但仅在需要生成图表或颜色标注时适用；文字表述保持中性。
