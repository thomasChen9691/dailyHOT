// 枫泽观潮 · 一键启停与环境自检（零依赖，Node 24 原生运行）
//   ./up            自检 → 自动补环境 → 起站 → 等健康 → 巡检 → 打印地址
//   ./up check      只自检，不改任何东西
//   ./up ports      只读扫描本机 compose 端口台账（~/github、~/Projects）
//   ./up rebuild    强制重建镜像（改了 site/、industry/、modules/、Dockerfile 后用）
//   ./up down       停站（保留数据卷）
//   ./up status     容器状态 + 健康
//   ./up logs       worker 日志（Ctrl-C 退出）
//   ./up smoke      只巡检页面与机器出口
//   ./up ingest     反哺入站（地址与 token 从 .env 派生，不硬编码端口）
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const HOME = os.homedir();
const tty = !!process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = paint(32), yellow = paint(33), red = paint(31), dim = paint(2), bold = paint(1);

const REQUIRED = [
  "SITE_URL", "ADMIN_PASSWORD", "SESSION_SECRET", "IMG_PROXY_SIGN_SECRET",
  "POSTGRES_PASSWORD", "INGEST_TOKEN", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL",
];
const SCAN_DIRS = [path.join(HOME, "github"), path.join(HOME, "Projects")];
const SCAN_MAX_DEPTH = 4;
const SKIP_DIRS = new Set(["node_modules", ".git", "build", "dist", ".venv", "venv", "__pycache__"]);

function run(bin, args) {
  return spawnSync(bin, args, { cwd: ROOT, encoding: "utf8" });
}
function passthrough(bin, args) {
  return spawnSync(bin, args, { cwd: ROOT, stdio: "inherit" });
}
const good = (r) => r.status === 0 && !r.error;
const text = (r) => (r.stdout ?? "").trim();
const shortPath = (f) => (f.startsWith(HOME) ? "~/" + path.relative(HOME, f) : f);

/** Tool shells often inject Node 22; native TS scripts (smoke.ts) need >= 24. */
function pickNode() {
  for (const bin of ["/usr/local/bin/node", process.execPath]) {
    const r = run(bin, ["--version"]);
    const version = text(r);
    if (good(r) && Number(version.replace(/^v/, "").split(".")[0]) >= 24) return { bin, version };
  }
  return { bin: process.execPath, version: `v${process.versions.node}` };
}

function readEnv() {
  const map = {};
  if (!existsSync(".env")) return map;
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const hit = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (hit) map[hit[1]] = hit[2].trim();
  }
  return map;
}

/** PORT may be "3100", "127.0.0.1:3100", "[::1]:3100" or "${VAR}:3100". Only the host port matters here. */
function hostPort(value) {
  const raw = String(value ?? "").trim();
  const withBind = /^.*:(\d{1,5})$/.exec(raw);
  const n = Number(withBind ? withBind[1] : raw);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : 3000;
}

const ENV = readEnv();
const PORT = hostPort(ENV.PORT);
const BASE = `http://localhost:${PORT}`;
let SITE_PORT = null;
try {
  const url = new URL(ENV.SITE_URL || BASE);
  SITE_PORT = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
} catch { /* malformed SITE_URL: reported by check() */ }

/** Top-level compose project name (no leading whitespace, so volume `name:` keys do not match). */
function composeName() {
  try {
    const hit = /^name:\s*["']?([\w-]+)["']?\s*$/m.exec(readFileSync("docker-compose.yml", "utf8"));
    return hit ? hit[1] : path.basename(ROOT).toLowerCase();
  } catch { return path.basename(ROOT).toLowerCase(); }
}

/** All compose files under the two scan roots. Read-only, bounded depth, skips dependency dirs. */
function composeFiles() {
  const files = [];
  function walk(dir, depth) {
    if (depth > SCAN_MAX_DEPTH || !existsSync(dir)) return;
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name.startsWith(".") || SKIP_DIRS.has(e.name)) continue;
        walk(full, depth + 1);
      } else if (e.isFile() && /^(docker-)?compose([.-][\w.-]+)?\.ya?ml$/.test(e.name)) {
        files.push(full);
      }
    }
  }
  for (const dir of SCAN_DIRS) walk(dir, 0);
  return [...new Set(files)].sort();
}

/** Parse `ports:` entries of the form [bind:]HOST:CONTAINER. Variable-only hosts are skipped. */
const PORT_LINE = /^\s*-\s*["']?(?:([\w.\-[\]:]+|\$\{[^}]+\}):)?(\d{2,5}):(\d{2,5})["']?/;
function declaredPorts() {
  const rows = [];
  const files = composeFiles();
  for (const file of files) {
    let inPorts = false, indent = -1;
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/^\s*#/.test(line)) return;
      const head = /^(\s*)ports:\s*(?:#.*)?$/.exec(line);
      if (head) { inPorts = true; indent = head[1].length; return; }
      if (!inPorts) return;
      if (line.trim()) {
        const cur = /^(\s*)\S/.exec(line);
        if (cur && cur[1].length <= indent) { inPorts = false; return; }
      }
      const hit = PORT_LINE.exec(line);
      if (hit) rows.push({ port: Number(hit[2]), target: Number(hit[3]), file, line: i + 1 });
    });
  }
  return { files, rows };
}

/** Host ports currently published by running containers: port -> container name. */
function runningPorts() {
  const map = new Map();
  const ps = run("docker", ["ps", "--format", "{{.Names}}\t{{.Ports}}"]);
  if (!good(ps)) return map;
  for (const line of text(ps).split("\n")) {
    const [name, ports] = line.split("\t");
    if (!ports) continue;
    for (const hit of ports.matchAll(/(\d{2,5})->\d{2,5}\/tcp/g)) map.set(Number(hit[1]), name);
  }
  return map;
}

/** Compose labels: spot containers of this project started from another directory, or leftovers from a renamed project. */
function projectContainers() {
  const rows = [];
  const fmt = '{{.Names}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.project.working_dir"}}';
  const ps = run("docker", ["ps", "-a", "--format", fmt]);
  if (!good(ps)) return rows;
  for (const line of text(ps).split("\n")) {
    const [name, project, wd] = line.split("\t");
    if (project) rows.push({ name, project, wd: wd ? path.resolve(wd) : "" });
  }
  return rows;
}

/** Read-only environment report. Returns { rows, blocking, env, dockerUp, needsNetwork, needsChmod }. */
function check() {
  const rows = [];
  const add = (level, label, detail, fix) => rows.push({ level, label, detail, fix });
  let env = {}, dockerUp = false, needsNetwork = false, needsChmod = false;

  const node = pickNode();
  const major = Number(node.version.replace(/^v/, "").split(".")[0]);
  if (major >= 24) add("ok", "Node", node.version);
  else add("bad", "Node", `${node.version}，需要 >= 24`, "安装 Node 24，或把 /usr/local/bin 放到 PATH 前面");

  const docker = run("docker", ["info", "--format", "{{.ServerVersion}}"]);
  dockerUp = good(docker) && !!text(docker);
  if (!dockerUp) add("bad", "Docker", "未启动或不可用", "打开 Docker Desktop 后重试");
  else add("ok", "Docker", `Server ${text(docker)}`);

  if (dockerUp) {
    const config = run("docker", ["compose", "config", "-q"]);
    if (good(config)) add("ok", "compose", "配置有效");
    else add("bad", "compose", (config.stderr ?? "配置错误").split("\n")[0], "检查 docker-compose.yml");
  }

  if (!existsSync(".env")) {
    add("bad", ".env", "不存在", "cp .env.example .env 后填密钥；或 node scripts/init-env.ts --llm-key <key>");
  } else {
    try {
      env = readEnv();
      const mode = statSync(".env").mode & 0o777;
      needsChmod = mode !== 0o600;
      add(needsChmod ? "warn" : "ok", ".env", `${Object.keys(env).length} 个变量 / 权限 ${mode.toString(8)}`,
        needsChmod ? "启动时自动 chmod 600" : null);

      const missing = REQUIRED.filter((k) => !env[k]);
      if (missing.length) add("bad", "必需配置", `缺 ${missing.join(", ")}`, "在 .env 里补齐这些键");
      else add("ok", "必需配置", `${REQUIRED.length}/${REQUIRED.length} 已填`);

      if (env.LLM_MODEL === "free-auto") add("bad", "模型", "free-auto 会触发 400", "改成 deepseek-v4-pro-0813");
      else if (env.LLM_MODEL) add("ok", "模型", "固定模型");
      if (env.COLLECT_ENABLED === "false") add("warn", "采集", "关闭会连带停正文 worker", "跑内容链路时设为 true");
      if (env.MODEL_CALLS_ENABLED === "false") add("warn", "模型调用", "关闭，反哺内容不会分析", "跑内容链路时设为 true");

      if (SITE_PORT !== null && SITE_PORT !== PORT) {
        add("bad", "端口一致", `PORT=${PORT} 但 SITE_URL 指向 ${SITE_PORT}`,
          "两个值必须一致，否则 sitemap / RSS / llms.txt 的链接会指向旧端口");
      } else if (SITE_PORT !== null) {
        add("ok", "端口一致", `PORT 与 SITE_URL 均为 ${PORT}`);
      }
    } catch (error) {
      add("bad", ".env", `读取失败：${error.message}`, "确认文件可读");
    }
  }

  if (dockerUp) {
    const net = run("docker", ["network", "inspect", "rag-net", "--format", "{{.Name}}"]);
    needsNetwork = !good(net) || !text(net);
    if (needsNetwork) add("warn", "rag-net", "不存在，启动时自动创建", "或手动 docker network create rag-net");
    else add("ok", "rag-net", "已存在");

    const relay = run("docker", ["ps", "--filter", "name=new-api", "--format", "{{.Names}}"]);
    if (good(relay) && text(relay)) add("ok", "LLM 网关", "容器在运行");
    else add("warn", "LLM 网关", "未运行，模型调用会失败", "启动网关容器（网页仍可访问）");

    const project = composeName();
    const containers = projectContainers();
    const foreign = containers.find((c) => c.project === project && c.wd && c.wd !== ROOT);
    const stale = containers.find((c) => c.project !== project && c.wd === ROOT);
    if (foreign) add("bad", "同名 project", `${project} 已被 ${foreign.name} 占用（来自其他目录）`,
      `先在该目录停站：cd ${foreign.wd} && docker compose down`);
    else if (stale) add("bad", "旧 project 残留", `${stale.name} 仍属于 project ${stale.project}`,
      `先清理：docker compose -p ${stale.project} down`);
    else add("ok", "project", `${project} 无重名占用`);
  }

  const port = run("lsof", ["-nP", `-iTCP:${PORT}`, "-sTCP:LISTEN", "-t"]);
  const occupied = !port.error && good(port) && !!text(port);
  const health = run("curl", ["-fsS", "-o", "/dev/null", "-w", "%{http_code}", `${BASE}/api/health`]);
  const ours = good(health) && text(health) === "200";
  if (occupied && ours) add("ok", `端口 ${PORT}`, "本站监听中（health 200）");
  else if (occupied) add("bad", `端口 ${PORT}`, "被其他程序占用",
    `lsof -nP -iTCP:${PORT} 查到后关掉，或改 .env 的 PORT + SITE_URL`);
  else add("ok", `端口 ${PORT}`, "空闲");

  if (dockerUp) {
    const clashes = declaredPorts().rows.filter((d) => d.port === PORT && !d.file.startsWith(ROOT));
    if (clashes.length) add("warn", "端口台账", `${clashes.length} 个其他 compose 也声明了 ${PORT}`,
      "./up ports 看来源；同时启动会冲突");
  }

  const blocking = rows.filter((r) => r.level === "bad").length;
  const warnings = rows.filter((r) => r.level === "warn").length;
  return { rows, blocking, warnings, env, dockerUp, needsNetwork, needsChmod };
}

/** Terminal columns: CJK glyphs are double width; ANSI colour codes must not count. */
const visible = (s) => s.replace(/\x1b\[[0-9;]*m/g, "");
const columns = (s) => [...visible(s)].reduce((n, ch) => n + (/[\u2E80-\uFFFF]/.test(ch) ? 2 : 1), 0);
const pad = (s, width) => s + " ".repeat(Math.max(0, width - columns(s)));

function printCheck(report) {
  console.log(bold("枫泽观潮 · 环境自检"));
  for (const r of report.rows) {
    const mark = r.level === "ok" ? green("✓") : r.level === "warn" ? yellow("!") : red("✗");
    console.log(`  ${mark} ${pad(r.label, 16)} ${r.detail}`);
    if (r.fix && r.level !== "ok") console.log(`      ${dim("→ " + r.fix)}`);
  }
  const summary = report.blocking
    ? red(`${report.blocking} 项阻塞，先修复再启动`)
    : green("环境就绪，可以启动");
  console.log(`  ${summary}${report.warnings ? ` · ${yellow(`${report.warnings} 项提醒`)}` : ""}\n`);
}

/** Read-only port ledger across both compose roots. Never reads .env values or starts containers. */
function ports() {
  const { files, rows } = declaredPorts();
  const running = runningPorts();
  const byPort = new Map();
  const entry = (p) => {
    if (!byPort.has(p)) byPort.set(p, { port: p, sources: [], targets: new Set() });
    return byPort.get(p);
  };
  for (const d of rows) {
    const e = entry(d.port);
    e.sources.push(`${shortPath(d.file)}:${d.line}`);
    e.targets.add(d.target);
  }
  for (const p of running.keys()) entry(p);

  console.log(bold(`枫泽观潮 · 端口台账（只读）`));
  console.log(dim(`  扫描目录：${SCAN_DIRS.map(shortPath).join("  ")}`));
  console.log(dim(`  本站：.env PORT=${PORT} → ${BASE}（compose 兜底 3000，CI 无 .env 时用 3000）\n`));
  console.log(`  ${pad("端口", 8)}${pad("状态", 12)}来源`);
  const list = [...byPort.values()].sort((a, b) => a.port - b.port);
  for (const e of list) {
    const isOurs = e.port === PORT;
    const live = running.get(e.port);
    const state = isOurs ? green("← 本站") : live ? yellow("运行中") : dim("仅声明");
    const where = e.sources.length
      ? `${e.sources[0]}${e.sources.length > 1 ? dim(`  (+${e.sources.length - 1})`) : ""}`
      : dim("-");
    const liveBy = live && !isOurs ? dim(`  [运行: ${live}]`) : "";
    console.log(`  ${pad(String(e.port), 8)}${pad(state, 12)}${where}${liveBy}`);
  }
  const clashes = rows.filter((d) => d.port === PORT && !d.file.startsWith(ROOT));
  console.log(`\n  扫描 ${files.length} 个 compose，声明 ${rows.length} 条映射，运行中 ${running.size} 个宿主机端口。`);
  if (clashes.length) {
    console.log(red(`  ⚠ ${clashes.length} 个其他 compose 也声明了 ${PORT}：`));
    for (const c of clashes) console.log(red(`      ${shortPath(c.file)}:${c.line}`));
  } else {
    console.log(green(`  ✓ 没有其他 compose 声明 ${PORT}，本站端口无冲突。`));
  }
  console.log(dim("  仅读取 ports: 声明与运行中容器，不读 .env 值、不启动任何容器、不写文件。\n"));
}

async function healthy(seconds = 3) {
  const deadline = Date.now() + seconds * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        const body = await res.json();
        if (body.ok === true && body.db === "ok") return true;
      }
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
  return false;
}

function smoke() {
  return passthrough(pickNode().bin, ["scripts/smoke.ts", "--base", BASE]);
}

/** Fix what is safe to fix, then start. Idempotent: an already-running site is not rebuilt. */
async function up(rebuild = false) {
  const report = check();
  printCheck(report);
  if (report.blocking) {
    console.log(red("已中止，未改动任何环境。修好上面标 ✗ 的项再跑 ./up\n"));
    process.exit(1);
  }
  if (report.needsChmod) {
    chmodSync(".env", 0o600);
    console.log("→ .env 权限已改为 600");
  }
  if (report.needsNetwork) {
    const created = run("docker", ["network", "create", "rag-net"]);
    if (!good(created)) {
      console.log(red(`✗ 创建 rag-net 失败：${(created.stderr ?? "").trim()}`));
      process.exit(1);
    }
    console.log("→ 已创建 rag-net 网络");
  }

  const alreadyUp = await healthy(3);
  if (alreadyUp && !rebuild) {
    console.log("→ 站点已在运行，跳过构建");
  } else {
    const args = ["compose", "up", "-d", "--build"];
    if (rebuild) args.push("--force-recreate");
    console.log(rebuild ? "→ 强制重建镜像并起站（约 3 分钟）…" : "→ 构建并起站（约 3 分钟）…");
    const started = passthrough("docker", args);
    if (!good(started)) {
      console.log(red("\n✗ 起站失败。看日志：./up logs\n"));
      process.exit(1);
    }
  }

  console.log("→ 等待 /api/health …");
  const start = Date.now();
  const ready = await healthy(180);
  if (!ready) {
    console.log(red("✗ 180 秒内未就绪。看日志：./up logs\n"));
    process.exit(1);
  }
  console.log(green(`✓ 健康（${Math.round((Date.now() - start) / 1000)}s）`));

  console.log("→ 巡检页面与机器出口 …");
  const result = smoke();
  if (!good(result)) {
    console.log(red("\n✗ 巡检有失败项，见上方输出\n"));
    process.exit(1);
  }
  console.log(`\n${bold(green(`✓ 站点就绪  ${BASE}`))}`);
  console.log(dim("  ./up status    ./up logs    ./up smoke    ./up ports    ./up down    ./up rebuild\n"));
}

function status() {
  const ps = passthrough("docker", ["compose", "ps"]);
  if (!good(ps)) process.exit(1);
  return healthy(2).then((ok) => {
    console.log(ok ? green(`✓ ${BASE}/api/health 正常`) : yellow(`! ${BASE} 未就绪`));
  });
}

/** Minimal RFC 4180 reader: quoted commas, escaped quotes and embedded newlines. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

/** The 09:15 brief CSV uses section,category,content,reason,link. */
function csvItems(text) {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name) => head.indexOf(name);
  if (col("content") < 0 || col("link") < 0) throw new Error("CSV 需要 content 与 link 两列");
  const now = new Date().toISOString();
  return rows.slice(1).map((r) => {
    const content = (r[col("content")] ?? "").trim();
    const link = (r[col("link")] ?? "").trim();
    if (!content || !link) return null;
    return {
      title: content.split(/\r?\n/)[0].slice(0, 160),
      url: link,
      publishedAt: now,
      author: "枫泽观潮 · 每日要闻反哺",
      raw: {
        text: [content, (r[col("reason")] ?? "").trim()].filter(Boolean).join("\n\n"),
        section: (r[col("section")] ?? "").trim(),
        category: (r[col("category")] ?? "").trim(),
      },
    };
  }).filter(Boolean);
}

/**
 * Push collected items into the site. The endpoint and token always come from .env,
 * so changing PORT never breaks an automation that calls `./up ingest`.
 *   ./up ingest                     print the current target and payload example
 *   ./up ingest payload.json        JSON body {sourceId, sourceName, items[]}
 *   ./up ingest daily_brief.csv     the 09:15 CSV format
 *   ./up ingest -                   read JSON from stdin
 */
async function ingest(file, dry = false) {
  const env = readEnv();
  const token = env.INGEST_TOKEN ?? "";
  const endpoint = `${(env.SITE_URL || BASE).replace(/\/+$/, "")}/api/ingest/items`;
  if (!file) {
    console.log(bold("枫泽观潮 · 反哺入站"));
    console.log(`  目标地址  ${green(endpoint)}`);
    console.log(`  鉴权      .env 的 INGEST_TOKEN（${token.length >= 16 ? green("已配置") : red("未配置或短于 16 位")}）`);
    console.log(`  用法      ./up ingest <payload.json | daily_brief.csv | ->   （加 --dry-run 只解析不发送）`);
    console.log(dim("  地址由 .env 的 SITE_URL 派生；换端口只改 .env 的 PORT + SITE_URL，自动化不用改。\n"));
    return;
  }
  if (token.length < 16) {
    console.log(red("✗ INGEST_TOKEN 未配置或短于 16 位，接口会返回 401"));
    process.exit(1);
  }
  let payload;
  try {
    const raw = file === "-" ? readFileSync(0, "utf8") : readFileSync(path.resolve(ROOT, file), "utf8");
    payload = /\.csv$/i.test(file)
      ? { sourceId: "external-fengze-daily", sourceName: "枫泽观潮 · 每日要闻反哺", items: csvItems(raw) }
      : JSON.parse(raw);
  } catch (error) {
    console.log(red(`✗ 读取 / 解析失败：${error.message}`));
    process.exit(1);
  }
  if (!payload || !Array.isArray(payload.items) || !payload.items.length) {
    console.log(red("✗ payload 需要非空 items[]（CSV 需有 content 与 link 两列且有数据行）"));
    process.exit(1);
  }
  if (dry) {
    console.log(yellow(`→ 试运行（不发送）：${payload.items.length} 条，目标 ${endpoint}`));
    const first = payload.items[0];
    console.log(dim(`  sourceId=${payload.sourceId ?? "(未指定)"}  首条 title=${String(first.title ?? "").slice(0, 60)}  url=${String(first.url ?? "").slice(0, 80)}`));
    return;
  }
  console.log(`→ 反哺 ${payload.items.length} 条到 ${endpoint}`);
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.text();
    console.log(`  HTTP ${res.status}  ${body.slice(0, 300)}`);
    if (!res.ok) process.exit(1);
    const result = JSON.parse(body);
    console.log(green(`✓ 反哺完成：收到 ${payload.items.length} 条，新建 ${result.created} 条`));
  } catch (error) {
    console.log(red(`✗ 请求失败：${error.message}（先跑 ./up status 确认站点在跑）`));
    process.exit(1);
  }
}

function help() {
  console.log(`${bold("枫泽观潮 · 一键命令")}
  ${green("./up")}          自检 → 自动补环境 → 起站 → 等健康 → 巡检 → 打印地址
  ${green("./up check")}    只确认环境，不改任何东西
  ${green("./up ports")}    只读扫描本机 compose 端口台账（${SCAN_DIRS.map(shortPath).join(" / ")}）
  ${green("./up rebuild")}  强制重建镜像（改了 site/ industry/ modules/ Dockerfile 后用）
  ${green("./up down")}     停站，数据卷保留
  ${green("./up status")}   容器状态 + 健康检查
  ${green("./up logs")}     worker 日志（Ctrl-C 退出）
  ${green("./up smoke")}    只巡检页面与机器出口
  ${green("./up ingest")}   反哺入站：./up ingest <file.csv|json>，不带参数看当前地址

  站点：${BASE}    后台：${BASE}/admin    板块：${BASE}/ai  ${BASE}/finance
  反哺：${BASE}/api/ingest/items（地址随 .env 自动变，别在自动化里写死）
  端口：.env 的 PORT 与 SITE_URL 必须一致，改完 ./up down && ./up
  手册：docs/sop.md
`);
}

const cmd = (process.argv[2] ?? "up").toLowerCase();
switch (cmd) {
  case "up":
  case "start":
    await up(false);
    break;
  case "rebuild":
    await up(true);
    break;
  case "check":
  case "env": {
    const report = check();
    printCheck(report);
    if (report.blocking) process.exit(1);
    break;
  }
  case "ports":
  case "port":
    ports();
    break;
  case "down":
  case "stop":
    console.log("→ 停站（db / data 数据卷保留）…");
    if (!good(passthrough("docker", ["compose", "down"]))) process.exit(1);
    console.log(green("✓ 已停止"));
    break;
  case "status":
  case "ps":
    await status();
    break;
  case "logs":
    if (!good(passthrough("docker", ["compose", "logs", "-f", "--tail", "100", "worker"]))) process.exit(1);
    break;
  case "smoke":
    if (!good(smoke())) process.exit(1);
    break;
  case "ingest":
  case "push": {
    const args = process.argv.slice(3);
    await ingest(args.find((a) => !a.startsWith("--")), args.includes("--dry-run"));
    break;
  }
  case "help":
  case "-h":
  case "--help":
    help();
    break;
  default:
    console.log(red(`未知命令：${cmd}`));
    help();
    process.exit(1);
}
