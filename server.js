import "dotenv/config";
import express from "express";
import cron from "node-cron";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyzeMorningReport, monitorNewsRisk } from "./src/ai.js";
import { fetchAllReports } from "./src/reports.js";
import { fetchNewsItems } from "./src/news.js";
import { readHistory, readLatestState, writeHistory, writeLatestState } from "./src/storage.js";
import { getTelegramUpdates, notify } from "./src/notify.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const port = Number(process.env.PORT || 3000);
const timezone = process.env.TIMEZONE || "Asia/Tokyo";

app.use(express.json({ limit: "20mb" }));
app.use(express.static(__dirname));

app.get("/api/status", async (_req, res) => {
  res.json({
    ok: true,
    scheduler: process.env.ENABLE_SCHEDULER !== "false",
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    latest: await readLatestState(),
  });
});

app.get("/api/history", async (_req, res) => {
  res.json(await readHistory());
});

app.post("/api/analyze", async (req, res) => {
  try {
    const result = await runMorningAnalysis(req.body?.text);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/monitor", async (req, res) => {
  try {
    const result = await runRiskMonitor(req.body?.newsText, req.body?.reasons);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/run-all", async (_req, res) => {
  try {
    const morning = await runMorningAnalysis();
    const monitor = await runRiskMonitor(undefined, morning.reasons);
    res.json({ morning, monitor });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/test-notify", async (_req, res) => {
  try {
    const result = await notify("M4ミラトレ通知テスト: 通知設定に成功しました。");
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/telegram-updates", async (_req, res) => {
  try {
    const updates = await getTelegramUpdates();
    res.json({
      ok: true,
      chats: updates
        .map((update) => update.message?.chat || update.channel_post?.chat || update.my_chat_member?.chat)
        .filter(Boolean)
        .map((chat) => ({ id: chat.id, type: chat.type, title: chat.title, username: chat.username, first_name: chat.first_name }))
        .filter((chat, index, self) => self.findIndex((item) => item.id === chat.id) === index),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function runMorningAnalysis(overrideText) {
  const reports = overrideText
    ? [{ id: "manual", name: "手動入力", url: null, text: overrideText, fetchedAt: new Date().toISOString() }]
    : await fetchAllReports();

  const text = reports.map((report) => `【${report.name}】\n${report.text}`).join("\n\n---\n\n");
  const analysis = await analyzeMorningReport(text, reports);
  const latest = {
    ...(await readLatestState()),
    date: new Date().toISOString().slice(0, 10),
    morning: analysis,
    reports,
    updatedAt: new Date().toISOString(),
  };

  await writeLatestState(latest);
  await writeHistory({ type: "morning", ...analysis, createdAt: new Date().toISOString() });

  if (analysis.tradeTarget === "あり") {
    await notify(`M4ミラトレ判定: ${analysis.tradeTarget}（${analysis.direction}） 自信指数 ${analysis.confidenceIndex}%`);
  }

  return analysis;
}

async function runRiskMonitor(overrideNewsText, overrideReasons) {
  const latest = await readLatestState();
  const reasons = overrideReasons || latest?.morning?.reasons || [];
  const newsItems = overrideNewsText
    ? [{ title: "手動入力ニュース", content: overrideNewsText, link: null, publishedAt: new Date().toISOString() }]
    : await fetchNewsItems();

  const newsText = newsItems
    .map((item) => `【${item.title}】\n${item.content || ""}\n${item.link || ""}`)
    .join("\n\n");
  const result = await monitorNewsRisk(reasons, newsText, newsItems);

  const next = {
    ...latest,
    risk: result,
    latestNews: newsItems.slice(0, 20),
    updatedAt: new Date().toISOString(),
  };
  await writeLatestState(next);
  await writeHistory({ type: "risk", ...result, createdAt: new Date().toISOString() });

  if (result.alert) {
    await notify(`M4ミラトレ緊急アラート: ${result.reason}`);
  }

  return result;
}

function scheduleJobs() {
  if (process.env.ENABLE_SCHEDULER === "false") return;

  cron.schedule(process.env.MORNING_CRON || "35 8 * * 1-5", () => runMorningAnalysis().catch(console.error), {
    timezone,
  });
  cron.schedule(process.env.NOON_CRON || "0 12 * * 1-5", () => runMorningAnalysis().catch(console.error), {
    timezone,
  });
  cron.schedule(process.env.MONITOR_CRON || "*/15 9-17 * * 1-5", () => runRiskMonitor().catch(console.error), {
    timezone,
  });
}

const onceArg = process.argv[2] === "--once" ? process.argv[3] : null;
if (onceArg === "morning") {
  runMorningAnalysis().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  });
} else if (onceArg === "monitor") {
  runRiskMonitor().then((result) => {
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  });
} else {
  scheduleJobs();
  app.listen(port, () => {
    console.log(`M4ミラトレ automation server: http://localhost:${port}`);
    console.log(`Static files: ${join(__dirname, "index.html")}`);
  });
}
