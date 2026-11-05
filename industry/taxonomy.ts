// 这个行业的分类体系：类别、标签词表、公司（主体）名录，以及防止张冠李戴的身份词典。
// 模型按这里的词表打标签，主题页（topics.json）按标签归类，筛选栏按类别分组。
// 换行业时：类别的 key 会出现在网址里（/all?category=…），上线后就不要再改；标签和名录可以随时增减。

/**
 * 网页上的类别（筛选栏、卡片角标、RSS 分类订阅）。key 是网址和接口里的身份，上线后不要改。
 * section 是日报里的分节标题（几个类别可以共用一节，按这里的顺序排）；guide 告诉结构抽取模型这一类收什么、
 * 和相邻类别的边界在哪（总的归类原则写在 prompts/structure.md 里）。
 * commentary 标出评论类（教程、观点）：日报写过的事又有评论类的后续报道，只占一行快讯（报道它的信源够多时除外）。
 * 没归上类的资料在日报里放进第一个 key 为 industry 的类别所在的节（没有就放最后一节）。
 * tagColor 是飞书推送卡片里跟在标题后面的这一类小标签的颜色（飞书 text_tag 的颜色名）。
 * feedLabel 是分类 RSS 标题里的名字（不写就用 label）。公开接口、RSS 和 MCP 里要把一类并进另一类发布，写在站点设置里（site/site.ts 的 PUBLIC_CATEGORIES）。
 */
export const CATEGORIES = [
  // ── AI 板块：日报合成「AI 大事」一节 ──────────────────────────────────────
  { key: "ai-models", tagColor: "indigo", label: "模型", feedLabel: "AI 模型", section: "AI 大事", guide: "模型本身的发布、版本、权重开放、能力或价格变化，以及既有榜单上的模型成绩。公布一次跑分不是发布新基准，也不是教程。财报、货币政策和指数调整不属于这一类，归金融板块。" },
  { key: "ai-products", tagColor: "turquoise", label: "产品", feedLabel: "AI 产品", section: "AI 大事", guide: "可使用的 AI 产品、功能、应用、工具、API、平台和工程组件的发布更新。模型厂商发布的推理框架、算子库、硬件适配组件仍是产品，不能因为厂商名归成模型。" },
  { key: "industry", tagColor: "orange", label: "AI 行业", feedLabel: "AI 行业动态", section: "AI 大事", guide: "已发生的 AI 公司经营、融资并购、人事、合作、诉讼、AI 监管政策、真实安全事故及调查进展。新闻由当事人发帖、带有态度，也不因此变成观点。上市公司常规公告、财报、货币政策归金融板块。" },
  { key: "paper", tagColor: "violet", label: "论文", feedLabel: "AI 论文", section: "AI 大事", guide: "以新研究方法、实验设计与发现为核心的论文、技术报告、新基准或研究数据集。系统性红队实验属于研究；既有榜单成绩归模型，真实事故的新闻调查归 AI 行业。" },
  { key: "tip", tagColor: "green", label: "教程", feedLabel: "AI 教程", section: "AI 大事", guide: "读者可以照着使用的 AI 方法、提示词、工具用法、工程实践复盘与技术讲解。重点是可复用的做法；单纯发布工具归产品，只有态度和预测而无做法归观点。", commentary: true },
  { key: "opinion", tagColor: "purple", label: "AI 观点", feedLabel: "AI 观点", section: "AI 大事", guide: "重点是对 AI 行业的解释、判断、主张、预测、评论或访谈观点。讨论股市行情、板块涨跌不归这一类，归「市场观点」。", commentary: true },
  // ── 金融板块：日报合成「金融市场」一节 ──────────────────────────────────
  { key: "finance-policy", tagColor: "red", label: "政策监管", feedLabel: "金融政策与监管", section: "金融市场", guide: "已发生的制度性变化：证监会与交易所规则、货币政策与利率决议、财政与购房贴息、证券执法、会计准则与信息披露要求。只提政策口风、没有正式文件或决议的转述归「市场观点」；AI 模型监管归 AI 行业。" },
  { key: "finance-a", tagColor: "red", label: "A 股", feedLabel: "A 股公告与财报", section: "金融市场", guide: "沪深北上市公司的公告、业绩预告与财报、分红回购、重大合同与停复牌、指数成分与 ETF 份额及大额异动、北向与两融数据。必须有可核对的主体与数字；无来源的「网传」和荐股贴不归这一类。" },
  { key: "finance-us", tagColor: "red", label: "美股", feedLabel: "美股与全球市场", section: "金融市场", guide: "美股公司财报与业绩指引、SEC 披露与执法、美联储决议与官员表态、重大 IPO、AI 产业链资本开支变化、主要指数与商品/汇率的可核实异动。仅翻译外媒标题、无原始披露的不算，归「市场观点」。" },
  { key: "finance-view", tagColor: "orange", label: "市场观点", feedLabel: "市场观点与复盘", section: "金融市场", guide: "对市场、板块或政策的分析、判断、策略、复盘与访谈观点，以及无增量的盘后流水账。重点是作者的解释而非新发生的事实；有正式公告或正式决议的归前面三类。", commentary: true },
] as const satisfies ReadonlyArray<{ key: string; tagColor: string; label: string; feedLabel?: string; section: string; guide: string; commentary?: true }>;

/**
 * 这个行业最受关注的一类发布（AI 行业是新模型）：日报报头的“N 个新模型”、改分类后修订已出的报告都按它数。
 * category 是类别，tag 是标签，两者都对上才算；unit 接在数字后面。
 * 没有这样一类的行业设成 null，报头就不显示这个数。
 */
export const RELEASE: { category: string; tag: string; unit: string } | null = { category: "ai-models", tag: "模型发布", unit: "个新模型" };

/** 周报月报的总述可以直接写、不必在报道里找到出处的行业通用词（小写）。站名会自动算进去。 */
export const PLAIN_TERMS: readonly string[] = [
  "ai", "api", "llm", "gpu", "agi", "ceo", "ipo",
  "a股", "美股", "港股", "etf", "sec", "cpi", "ppi", "gdp", "fomc", "qdii", "adr", "eps", "pe", "pb", "roe", "cny", "usd",
];

/**
 * 内容理解一步给每篇资料判的“内容类型”（写在 prompts/content-understanding.md 里，改了类型要同步改那份提示词）。
 * 评分提示词（prompts/selection-score.md）按类型给五个维度不同的权重。
 */
export const ITEM_TYPES = ["model_release", "product_launch", "tool_or_prompt", "research_paper", "industry_event", "opinion_analysis", "tutorial_explainer"] as const;

// ── 标签词表 ────────────────────────────────────────────────────────────────────────────

/** 每篇资料的第一个标签必须是这些“分类标签”之一。 */
export const CATEGORY_TAGS = [
  "产品更新", "模型发布", "论文/研究", "开源/仓库", "教程/实践", "现象/趋势", "大佬观点", "评测/基准", "安全/对齐", "行业动态", "政策/监管",
  "非AI/通用工具", "其他",
  // 金融板块：首标签必须与 category 表达同一重点
  "财报/业绩", "监管/规则", "市场异动", "指数/成分", "货币/利率", "资本开支", "并购/IPO", "分红/回购", "公司公告",
] as const;

/** 可选的主题标签。 */
export const TOPIC_TAGS = [
  "Agent", "编码", "推理", "多模态", "语音", "视频", "图像生成", "RAG", "端侧", "数据/训练", "搜索", "部署/工程", "开源生态", "具身智能", "MCP/工具调用",
  "A 股", "美股", "港股", "美联储", "SEC", "ETF", "半导体", "红利低波", "可转债", "汇率", "利率", "财报", "算力资本开支", "出口管制",
] as const;

/** 可选的实体标签（公司、机构、平台）。 */
export const ENTITY_TAGS = [
  "OpenAI", "Anthropic", "DeepSeek", "DeepMind", "Google", "Meta", "Microsoft", "xAI", "Hugging Face", "GitHub", "arXiv",
  "NVIDIA", "TSMC", "Apple", "Tesla", "Broadcom", "证监会", "上交所", "深交所", "央行", "美联储", "SEC", "东方财富",
] as const;

/** 模型常写的近义词，统一成词表里的写法。 */
export const TAG_SYNONYMS: Readonly<Record<string, string>> = {
  "教程/玩法": "教程/实践", "技巧/最佳实践": "教程/实践", "合作/生态": "行业动态", "融资/收购": "行业动态", "公司动态": "行业动态",
  合作: "行业动态", 生态: "行业动态", 融资: "行业动态", 收购: "行业动态", 投资: "行业动态", 并购: "行业动态",
  政策: "政策/监管", 监管: "政策/监管", 法规: "政策/监管", 安全: "安全/对齐", 对齐: "安全/对齐",
  论文: "论文/研究", 研究: "论文/研究", paper: "论文/研究", papers: "论文/研究",
  "open-source": "开源/仓库", 开源: "开源/仓库", 仓库: "开源/仓库", repo: "开源/仓库",
  教程: "教程/实践", 玩法: "教程/实践", 指南: "教程/实践", 技巧: "教程/实践", 最佳实践: "教程/实践", 实践: "教程/实践",
  产品: "产品更新", 更新: "产品更新", 发布: "模型发布", 模型: "模型发布", 趋势: "现象/趋势", 现象: "现象/趋势", 观点: "大佬观点",
  视频生成: "视频", 非ai: "非AI/通用工具", "non-ai": "非AI/通用工具", 通用工具: "非AI/通用工具", 工程工具: "非AI/通用工具",
  安全扫描: "非AI/通用工具", devops: "非AI/通用工具", 行业: "行业动态", 动态: "行业动态",
  // 金融板块：把模型常写的近义词收进本站词表
  业绩预告: "财报/业绩", 财报: "财报/业绩", 季报: "财报/业绩", 年报: "财报/业绩", 业绩: "财报/业绩", 指引: "财报/业绩",
  新规: "监管/规则", 规则: "监管/规则", 执法: "政策/监管", 处罚: "政策/监管",
  涨停: "市场异动", 跌停: "市场异动", 异动: "市场异动", 大涨: "市场异动", 大跌: "市场异动", 资金流: "市场异动",
  成分股: "指数/成分", 调样: "指数/成分", etf: "指数/成分", ETF: "指数/成分", 份额: "指数/成分",
  降息: "货币/利率", 加息: "货币/利率", 贴息: "货币/利率", 流动性: "货币/利率", 准备金: "货币/利率",
  capex: "资本开支", 算力投入: "资本开支", 数据中心投资: "资本开支",
  上市: "并购/IPO", ipo: "并购/IPO", IPO: "并购/IPO",
  派息: "分红/回购", 增持: "分红/回购", 减持: "分红/回购",
  披露: "公司公告", 停牌: "公司公告", 复牌: "公司公告",
  "a股": "A 股", "a 股": "A 股",
};

// ── 公司与主体 ──────────────────────────────────────────────────────────────────────────

/**
 * 公司主题：id → 显示名、卡片上显示的标签（null 表示只用 entity:<id> 归类）、别名。
 * aliases 给结构抽取模型看；orgNames 是这家公司发消息时开头用的组织名（公司、实验室、团队），
 * 在它自己的主题页上读者知道说的是谁，可以省去；otherNames 是公司的其他称呼（官方账号名、子品牌）。
 * 所有这些名字都用来认出说的是哪家公司，比如把事实的主体对到发布方。
 */
export const ENTITIES: Record<string, { name: string; displayTag: string | null; aliases: string[]; orgNames?: string[]; otherNames?: string[] }> = {
  "world-labs": { name: "World Labs", displayTag: null, aliases: ["World Labs"] },
  "thinking-machines": { name: "Thinking Machines Lab", displayTag: null, aliases: ["Thinking Machines"] },
  amd: { name: "AMD", displayTag: null, aliases: ["AMD", "Advanced Micro Devices"] },
  openai: { name: "OpenAI", displayTag: "OpenAI", aliases: ["OpenAI", "ChatGPT", "Sora", "Codex", "GPT"], orgNames: ["OpenAI"], otherNames: ["OpenAI Developers"] },
  anthropic: { name: "Anthropic", displayTag: "Anthropic", aliases: ["Anthropic", "Claude"], orgNames: ["Anthropic"], otherNames: ["Claude Code"] },
  google: { name: "Google", displayTag: "Google", aliases: ["Google", "DeepMind", "Gemini", "谷歌"], orgNames: ["Google DeepMind", "Google Research", "Google", "DeepMind", "谷歌"], otherNames: ["Google AI", "Google Labs", "Google Cloud"] },
  deepseek: { name: "DeepSeek", displayTag: "DeepSeek", aliases: ["DeepSeek", "深度求索"], orgNames: ["DeepSeek", "深度求索"] },
  qwen: { name: "千问 Qwen", displayTag: null, aliases: ["Qwen", "通义", "阿里"], orgNames: ["通义千问", "通义实验室", "阿里巴巴", "阿里云", "阿里", "Qwen Team", "Qwen", "Alibaba"], otherNames: ["千问", "千问APP", "Alibaba Cloud"] },
  kimi: { name: "月之暗面 / Kimi", displayTag: null, aliases: ["Kimi", "月之暗面", "Moonshot", "Kimi / 月之暗面"], orgNames: ["Moonshot AI", "月之暗面", "Kimi"] },
  minimax: { name: "MiniMax", displayTag: null, aliases: ["MiniMax", "海螺"], orgNames: ["MiniMax", "稀宇科技"] },
  zhipu: { name: "智谱 GLM", displayTag: null, aliases: ["智谱", "GLM", "Z.ai"], orgNames: ["智谱AI", "智谱", "Zhipu AI", "Z.ai"], otherNames: ["Zhipu"] },
  xai: { name: "xAI", displayTag: "xAI", aliases: ["xAI", "Grok"], orgNames: ["SpaceX Super Intelligence", "SpaceXAI", "SpaceXSI", "xAI"], otherNames: ["Grok Bot"] },
  meta: { name: "Meta", displayTag: "Meta", aliases: ["Meta", "Llama"], orgNames: ["Meta Superintelligence Labs", "Meta AI", "Meta"], otherNames: ["AI at Meta", "Muse"] },
  microsoft: { name: "Microsoft", displayTag: "Microsoft", aliases: ["Microsoft", "微软", "Copilot"], orgNames: ["Microsoft Research", "Microsoft AI", "Microsoft", "微软"] },
  nvidia: { name: "NVIDIA", displayTag: null, aliases: ["NVIDIA", "英伟达"], orgNames: ["NVIDIA", "英伟达"] },
  "hugging-face": { name: "Hugging Face", displayTag: "Hugging Face", aliases: ["Hugging Face"], orgNames: ["Hugging Face", "HuggingFace"] },
  cursor: { name: "Cursor", displayTag: null, aliases: ["Cursor", "Anysphere"], orgNames: ["Cursor"] },
  openrouter: { name: "OpenRouter", displayTag: null, aliases: ["OpenRouter"], orgNames: ["OpenRouter"] },
  // ── 金融板块主体：id 与身份词典、topics.json 的 entityId 保持一致 ───────
  csrc: { name: "中国证监会", displayTag: "证监会", aliases: ["证监会", "中国证监会", "CSRC"], orgNames: ["中国证券监督管理委员会", "证监会", "CSRC"] },
  sse: { name: "上海证券交易所", displayTag: "上交所", aliases: ["上交所", "上海证券交易所", "SSE"], orgNames: ["上海证券交易所", "上交所"] },
  szse: { name: "深圳证券交易所", displayTag: "深交所", aliases: ["深交所", "深圳证券交易所", "SZSE"], orgNames: ["深圳证券交易所", "深交所"] },
  pboc: { name: "中国人民银行", displayTag: "央行", aliases: ["央行", "人民银行", "PBOC"], orgNames: ["中国人民银行", "央行"] },
  fed: { name: "美联储", displayTag: "美联储", aliases: ["美联储", "Fed", "Federal Reserve", "FOMC"], orgNames: ["Federal Reserve", "美联储", "FOMC"] },
  sec: { name: "美国 SEC", displayTag: "SEC", aliases: ["SEC", "美国证券交易委员会"], orgNames: ["U.S. Securities and Exchange Commission", "SEC"] },
  tsmc: { name: "台积电 TSMC", displayTag: "TSMC", aliases: ["台积电", "TSMC", "Taiwan Semiconductor"], orgNames: ["台积电", "TSMC"] },
  apple: { name: "Apple", displayTag: "Apple", aliases: ["Apple", "苹果", "AAPL"], orgNames: ["Apple", "苹果公司"] },
  tesla: { name: "Tesla", displayTag: "Tesla", aliases: ["Tesla", "特斯拉", "TSLA"], orgNames: ["Tesla", "特斯拉"] },
  broadcom: { name: "Broadcom", displayTag: "Broadcom", aliases: ["Broadcom", "博通", "AVGO"], orgNames: ["Broadcom", "博通"] },
};

/**
 * 身份词典：摘要和标题里出现的公司，必须在原文里也出现过，否则退回原标题、丢掉摘要（防止模型张冠李戴）。
 * 行业没有这个问题时可以留空数组。
 */
export const IDENTITY_LEXICON: ReadonlyArray<{ id: string; name: string; patterns: RegExp[] }> = [
  { id: "openai", name: "OpenAI", patterns: [/openai|chatgpt|\bgpt-?[o\d]|\bsora\b|\bcodex\b/i] },
  { id: "anthropic", name: "Anthropic", patterns: [/anthropic|\bclaude\b/i, /\b(?:opus|sonnet|haiku)\s*\d+(?:[.\-]\d+)*\b/i, /\bfable\s*\d+(?:[.\-]\d+)*\b|\bmythos\b/i] },
  { id: "google", name: "Google / Gemini", patterns: [/google|deepmind|\bgemini\b|notebooklm|\bveo\s?\d|\bAlphaFold\b|\bAMIE\b/i] },
  { id: "deepseek", name: "DeepSeek", patterns: [/deepseek|深度求索/i] },
  { id: "xai", name: "xAI / Grok", patterns: [/\bxai\b|\bgrok\b/i] },
  { id: "meta", name: "Meta / Llama", patterns: [/\bMeta\b/, /\bmeta\s?ai\b|\bllama\b/i] },
  { id: "microsoft", name: "Microsoft / Copilot", patterns: [/microsoft|copilot|微软/i] },
  { id: "nvidia", name: "NVIDIA", patterns: [/nvidia|英伟达|\bnemotron\b|\bnemo\b|\bblackwell\b|\brubin(?:\s+ultra)?\b|\bcuda\b/i] },
  { id: "qwen", name: "千问 Qwen", patterns: [/\bqwen|通义|千问/i] },
  { id: "hugging-face", name: "Hugging Face", patterns: [/hugging\s?face/i] },
  { id: "cursor", name: "Cursor", patterns: [/\bCursor\b/] },
  { id: "kimi", name: "月之暗面 / Kimi", patterns: [/\bkimi\b|月之暗面|\bmoonshot\s?ai\b/i] },
  { id: "openrouter", name: "OpenRouter", patterns: [/openrouter/i] },
  { id: "minimax", name: "MiniMax", patterns: [/minimax/i] },
  { id: "zhipu", name: "智谱 GLM", patterns: [/智谱|\bglm-?[4-9]/i] },
  { id: "hunyuan", name: "腾讯混元", patterns: [/混元|hunyuan/i] },
  { id: "doubao", name: "字节豆包", patterns: [/豆包|doubao|字节跳动|bytedance/i] },
  { id: "mistral", name: "Mistral", patterns: [/mistral/i] },
  { id: "perplexity", name: "Perplexity", patterns: [/\bPerplexity\b/] },
  { id: "runway", name: "Runway", patterns: [/\brunway\b/i] },
  { id: "suno", name: "Suno", patterns: [/\bsuno\b/i] },
  { id: "midjourney", name: "Midjourney", patterns: [/midjourney/i] },
  { id: "stability-ai", name: "Stability AI", patterns: [/stability\s?ai/i] },
  { id: "elevenlabs", name: "ElevenLabs", patterns: [/eleven\s?labs/i] },
  { id: "vllm", name: "vLLM", patterns: [/\bvllm\b/i] },
  { id: "ollama", name: "Ollama", patterns: [/\bollama\b/i] },
  { id: "windsurf", name: "Windsurf", patterns: [/windsurf/i] },
  { id: "devin", name: "Devin", patterns: [/\bdevin\b/i] },
  { id: "manus", name: "Manus", patterns: [/\bmanus\b/i] },
  { id: "apple", name: "Apple", patterns: [/\bapple\s?(intelligence|silicon|ai)\b|苹果(智能|\s?AI)/i, /\bApple\b|\bAAPL\b|苹果公司/i] },
  { id: "amazon", name: "Amazon / AWS", patterns: [/amazon|\baws\b|亚马逊/i] },
  { id: "baidu", name: "百度文心", patterns: [/百度|baidu|文心|\bernie\s?bot\b/i] },
  // ── 金融板块：主体 id 与 ENTITIES 一致；只用于防误认、没有主题页的用独立 id ──
  { id: "csrc", name: "中国证监会", patterns: [/证监会|中国证券监督管理委员会|\bCSRC\b/i] },
  { id: "sse", name: "上交所", patterns: [/上海证券交易所|上交所|\bSSE\b/i] },
  { id: "szse", name: "深交所", patterns: [/深圳证券交易所|深交所|\bSZSE\b/i] },
  { id: "pboc", name: "中国人民银行", patterns: [/中国人民银行|人民银行|央行|\bPBOC\b/i] },
  { id: "fed", name: "美联储", patterns: [/美联储|联邦储备|Federal Reserve|\bFOMC\b|\bthe Fed\b/i] },
  { id: "sec", name: "美国 SEC", patterns: [/美国证券交易委员会|\bSEC\b/i] },
  { id: "tsmc", name: "台积电", patterns: [/台积电|\bTSMC\b|Taiwan Semiconductor|\bTSM\b/i] },
  { id: "tesla", name: "特斯拉", patterns: [/特斯拉|\bTesla\b|\bTSLA\b/i] },
  { id: "broadcom", name: "博通", patterns: [/博通|\bBroadcom\b|\bAVGO\b/i] },
  { id: "moutai", name: "贵州茅台", patterns: [/贵州茅台|600519/i] },
  { id: "catl", name: "宁德时代", patterns: [/宁德时代|300750/i] },
  { id: "innolight", name: "中际旭创", patterns: [/中际旭创|300308/i] },
  { id: "stock-code", name: "A 股证券代码", patterns: [/\b\d{6}\.(?:SH|SZ|BJ)\b/i] },
];

/** 这些域名上的文章，发布方就是对应的公司（托管平台如 GitHub、arXiv 不算）。 */
export const PUBLISHER_DOMAINS: ReadonlyArray<{ entityId: string; domains: readonly string[] }> = [
  { entityId: "openai", domains: ["openai.com"] },
  { entityId: "anthropic", domains: ["anthropic.com", "claude.com"] },
  { entityId: "google", domains: ["deepmind.google", "ai.google", "blog.google"] },
  { entityId: "deepseek", domains: ["deepseek.com"] },
  { entityId: "xai", domains: ["x.ai"] },
  { entityId: "meta", domains: ["ai.meta.com"] },
  { entityId: "microsoft", domains: ["microsoft.com"] },
  { entityId: "nvidia", domains: ["nvidia.com"] },
  { entityId: "qwen", domains: ["qwen.ai"] },
  { entityId: "cursor", domains: ["cursor.com"] },
  { entityId: "openrouter", domains: ["openrouter.ai"] },
  // 金融一手披露站点：entityId 与 ENTITIES、IDENTITY_LEXICON 一致
  { entityId: "csrc", domains: ["csrc.gov.cn"] },
  { entityId: "sse", domains: ["sse.com.cn"] },
  { entityId: "szse", domains: ["szse.cn"] },
  { entityId: "pboc", domains: ["pbc.gov.cn"] },
  { entityId: "fed", domains: ["federalreserve.gov"] },
  { entityId: "sec", domains: ["sec.gov"] },
];

/** 原文里的这些写法也算提到了对应公司。 */
export const IDENTITY_CONTEXT_ALIASES: ReadonlyArray<{ entityId: string; pattern: RegExp }> = [
  { entityId: "meta", pattern: /@AIatMeta\b/i },
  { entityId: "zhipu", pattern: /\bZhipu(?:\s+AI\b|['’]s\b)/i },
];
