// 枫泽观潮 · 一键启停与环境自检（零依赖，Node 24 原生运行）
//   ./up            自检 → 自动补环境 → 起站 → 等健康 → 巡检 → 打印地址
//   ./up check      只自检，不改任何东西
//   ./up rebuild    强制重建镜像（改了 site/、industry/、modules/、Dockerfile 后用）
//   ./up down       停站（保留数据卷）
//   ./up status     容器状态 + 健康
//   ./up logs       worker 日志（Ctrl-C 退出）
//   ./up smoke      只巡检页面与机器出口
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(ROOT);
const BASE = "http://localhost:3000";
const tty = !!process.stdout.isTTY;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const green = paint(32), yellow = paint(33), red = paint(31), dim = paint(2), bold = paint(1);

const REQUIRED = [
  "SITE_URL", "ADMIN_PASSWORD", "SESSION_SECRET", "IMG_PROXY_SIGN_SECRET",
  "POSTGRES_PASSWORD", "INGEST_TOKEN", "LLM_BASE_URL", "LLM_API_KEY", "LLM_MODEL",
];

function run(bin, args) {
  return spawnSync(bin, args, { cwd: ROOT, encoding: "utf8" });
}
function passthrough(bin, args) {
  return spawnSync(bin, args, { cwd: ROOT, stdio: "inherit" });
}
const good = (r) => r.status === 0 && !r.error;
const text = (r) => (r.stdout ?? "").trim();

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
  for (const line of readFileSync(".env", "utf8").split(/\r?\n/)) {
    const hit = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (hit) map[hit[1]] = hit[2].trim();
  }
  return map;
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
    if (good(relay) && text(relay)) add("ok", "new-api", "容器在运行");
    else add("warn", "new-api", "未运行，模型调用会失败", "启动 new-api 容器（网页仍可访问）");
  }

  const port = run("lsof", ["-nP", "-iTCP:3000", "-sTCP:LISTEN", "-t"]);
  const occupied = !port.error && good(port) && !!text(port);
  const health = run("curl", ["-fsS", "-o", "/dev/null", "-w", "%{http_code}", `${BASE}/api/health`]);
  const ours = good(health) && text(health) === "200";
  if (occupied && ours) add("ok", "端口 3000", "本站监听中（health 200）");
  else if (occupied) add("warn", "端口 3000", "被其他程序占用", "lsof -nP -iTCP:3000 查到后关掉，或改 .env 的 PORT");
  else add("ok", "端口 3000", "空闲");

  const blocking = rows.filter((r) => r.level === "bad").length;
  const warnings = rows.filter((r) => r.level === "warn").length;
  return { rows, blocking, warnings, env, dockerUp, needsNetwork, needsChmod };
}

/** Terminal columns: CJK glyphs are double width, so String.padEnd misaligns Chinese labels. */
const columns = (s) => [...s].reduce((n, ch) => n + (/[\u2E80-\uFFFF]/.test(ch) ? 2 : 1), 0);
const pad = (s, width) => s + " ".repeat(Math.max(0, width - columns(s)));

function printCheck(report) {
  console.log(bold("枫泽观潮 · 环境自检"));
  for (const r of report.rows) {
    const mark = r.level === "ok" ? green("✓") : r.level === "warn" ? yellow("!") : red("✗");
    console.log(`  ${mark} ${pad(r.label, 14)} ${r.detail}`);
    if (r.fix && r.level !== "ok") console.log(`      ${dim("→ " + r.fix)}`);
  }
  const summary = report.blocking
    ? red(`${report.blocking} 项阻塞，先修复再启动`)
    : green("环境就绪，可以启动");
  console.log(`  ${summary}${report.warnings ? ` · ${yellow(`${report.warnings} 项提醒`)}` : ""}\n`);
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
  console.log(dim("  ./up status    ./up logs    ./up smoke    ./up down    ./up rebuild\n"));
}

function status() {
  const ps = passthrough("docker", ["compose", "ps"]);
  if (!good(ps)) process.exit(1);
  return healthy(2).then((ok) => {
    console.log(ok ? green(`✓ ${BASE}/api/health 正常`) : yellow(`! ${BASE} 未就绪`));
  });
}

function help() {
  console.log(`${bold("枫泽观潮 · 一键命令")}
  ${green("./up")}          自检 → 自动补环境 → 起站 → 等健康 → 巡检 → 打印地址
  ${green("./up check")}    只确认环境，不改任何东西
  ${green("./up rebuild")}  强制重建镜像（改了 site/ industry/ modules/ Dockerfile 后用）
  ${green("./up down")}     停站，数据卷保留
  ${green("./up status")}   容器状态 + 健康检查
  ${green("./up logs")}     worker 日志（Ctrl-C 退出）
  ${green("./up smoke")}    只巡检页面与机器出口

  站点：${BASE}    后台：${BASE}/admin    板块：${BASE}/ai  ${BASE}/finance
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
