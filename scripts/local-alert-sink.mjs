#!/usr/bin/env node
// 本地告警接收端（开发/演练用）：让站内告警在 Mac 上可见，不经过飞书。
//
// 站点把告警发到 FEISHU_ALERT_WEBHOOK_URL，payload 是飞书自定义机器人的文本格式
// { msg_type: "text", content: { text } }。这里接收、落盘、弹 macOS 通知，并回 {"code":0}
// —— sendWebhook 只有看到 code=0 才判为 sent，回别的会被记成 unknown。
//
// 用法：
//   node scripts/local-alert-sink.mjs            # 默认 0.0.0.0:38765
//   PORT=38766 node scripts/local-alert-sink.mjs
// 容器内地址（OrbStack）：http://host.docker.internal:<PORT>/alert
//
// 端点：
//   POST /alert   收告警（也接受 {"text": "..."} 或纯文本）
//   GET  /        最近 20 条（纯文本，方便 curl / 浏览器看）
//   GET  /health  存活探测
import { createServer } from "node:http";
import { appendFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, ".workbuddy", "alerts");
const PORT = Number(process.env.PORT ?? 38765);
const HOST = process.env.HOST ?? "0.0.0.0";
const NOTIFY = process.env.ALERT_SINK_NOTIFY !== "false";

const day = () => new Date().toISOString().slice(0, 10);
const recent = [];

/** 从飞书文本卡片、{text} 或原始文本里取出正文。 */
function extractText(raw) {
  if (!raw) return "";
  try {
    const json = JSON.parse(raw);
    const content = json?.content;
    if (typeof content === "string") return content;
    if (content && typeof content.text === "string") return content.text;
    if (typeof json.text === "string") return json.text;
    return JSON.stringify(json);
  } catch {
    return raw;
  }
}

/** 弹一条 macOS 通知；标题取首行，正文取其后两行。失败不影响落盘。 */
function notify(text) {
  if (!NOTIFY) return;
  const [title, ...rest] = text.split("\n");
  const body = rest.filter(Boolean).slice(0, 3).join(" / ").slice(0, 200);
  const script = `display notification ${JSON.stringify(body)} with title ${JSON.stringify(title.slice(0, 80))} sound name "Glass"`;
  execFile("osascript", ["-e", script], (error) => {
    if (error) console.error(JSON.stringify({ level: "warn", msg: "osascript notification failed", error: String(error.message) }));
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "GET" && url.pathname === "/health") {
    return json(res, 200, { ok: true, port: PORT, received: recent.length });
  }

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "content-type": "text/plain; charset=utf-8" });
    return res.end(recent.length ? recent.slice(-20).map((x) => `${x.at}  ${x.text}`).join("\n\n") : "(暂无告警)\n");
  }

  if (req.method !== "POST" || url.pathname !== "/alert") {
    return json(res, 404, { code: 404, msg: "not found" });
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = extractText(Buffer.concat(chunks).toString("utf8").trim());
  if (!text) return json(res, 400, { code: 400, msg: "empty text" });

  const entry = { at: new Date().toISOString(), from: req.socket.remoteAddress, text };
  recent.push(entry);
  if (recent.length > 200) recent.shift();

  console.log(JSON.stringify({ level: "info", msg: "alert received", at: entry.at, from: entry.from, head: text.split("\n")[0] }));
  notify(text);
  await mkdir(DIR, { recursive: true });
  await appendFile(path.join(DIR, `${day()}.jsonl`), `${JSON.stringify(entry)}\n`, "utf8");

  // sendWebhook 要求 code===0 才认为 sent。
  return json(res, 200, { code: 0, msg: "ok" });
});

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

server.listen(PORT, HOST, () => {
  console.log(JSON.stringify({ level: "info", msg: "local alert sink listening", url: `http://${HOST}:${PORT}/alert`, dir: DIR, notify: NOTIFY }));
});

// 昨日记录可直接在 / 之外用 cat .workbuddy/alerts/<date>.jsonl 查。
process.on("SIGINT", () => server.close(() => process.exit(0)));
