const watchWords = [
  "為替介入",
  "断固たる措置",
  "過度な変動",
  "日銀",
  "財務省",
  "政府高官",
  "戦争",
  "地政学",
  "災害",
  "緊急会合",
];

const morningPrompt = `あなたはプロのFXアナリストです。提供されたメガバンクのマーケットレポート（テキストデータ）を読み込み、以下の手順で「M4ミラトレ手法」に基づく本日のトレード戦略を出力してください。

【タスク】
1. レポートの最後にある「本日のドル円のブル（買い）ベア（売り）予想」のパーセンテージを抽出してください。
2. ブル予想の数値からベア予想の数値を引き、その差の絶対値（自信指数）を計算してください。
3. 自信指数が「35%以上」であれば「トレード対象：あり」、「35%未満」であれば「トレード対象：なし」と判定してください。
4. レポート内に記載されている「ブルまたはベア予想の根拠（要人発言、経済イベント、ファンダメンタルズなど）」を3つ以内の箇条書きで要約してください。

【出力フォーマット】
■ 本日のM4ミラトレ判定
・ブル予想：〇〇%
・ベア予想：〇〇%
・自信指数（差の絶対値）：〇〇%
・トレード判定：【あり（〇〇方向） / なし】

■ 本日の予想根拠（注目すべきファンダメンタルズ）
・
・
・`;

const riskPrompt = `あなたはFXのリスク管理アシスタントです。
以下の【本日の予想根拠】と、新しく入ってきた【最新ニュース】を比較し、これまでのトレード根拠が崩壊するような緊急事態が発生していないかを判定してください。

【本日の予想根拠】
（※ここにステップ1で出力した予想根拠を自動入力させる）

【最新ニュース】
（※ここに最新のニュースフィードや要人発言を自動入力させる）

【判定条件】
以下のいずれかに該当する場合は「緊急アラート：手動決済を推奨」と出力し、理由を1行で説明してください。該当しない場合は「異常なし」と出力してください。
・【本日の予想根拠】と完全に矛盾する事実や発言が出た場合
・日銀や政府の要人から「為替介入（断固たる措置など）」を示唆する発言が出た場合
・突発的な地政学的リスク（戦争、災害など）が発生した場合`;

const sampleReport = `本日のドル円相場は、米金利の高止まり観測とFRB高官のタカ派発言を背景に底堅い推移を想定する。日本側では当局による円安けん制はあるものの、現時点では具体的な為替介入示唆は限定的。米雇用統計を前にポジション調整には注意したい。

本日のドル円のブル（買い）ベア（売り）予想
ブル予想：68%
ベア予想：32%`;

const state = {
  reasons: [],
  bull: null,
  bear: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function normalizeText(text) {
  return text.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
}

function extractPercent(text, sideWords) {
  const normalized = normalizeText(text);
  const side = sideWords.join("|");
  const lines = normalized.split(/\n/).map((line) => line.trim());
  const lineMatch = lines
    .filter((line) => sideWords.some((word) => line.toLowerCase().includes(word.toLowerCase())))
    .map((line) => line.match(/(\d{1,3})\s*[%％]/))
    .find(Boolean);
  if (lineMatch) return clampPercent(Number(lineMatch[1]));

  const direct = new RegExp(`(?:${side})[^\\n0-9%％]{0,20}(\\d{1,3})(?:\\s*)[%％]`, "i");
  const directMatch = normalized.match(direct);
  if (directMatch) return clampPercent(Number(directMatch[1]));

  const percentMatches = [...normalized.matchAll(/(\d{1,3})\s*[%％]/g)].map((match) => Number(match[1]));
  if (percentMatches.length >= 2) {
    return sideWords.includes("ブル") || sideWords.includes("買い")
      ? clampPercent(percentMatches[0])
      : clampPercent(percentMatches[1]);
  }
  return null;
}

function clampPercent(value) {
  if (Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, value));
}

function extractReasons(text, bull, bear) {
  const keywords = [
    "発言",
    "FRB",
    "FOMC",
    "日銀",
    "財務省",
    "金利",
    "雇用",
    "CPI",
    "インフレ",
    "介入",
    "米",
    "日本",
    "地政学",
    "リスク",
    "イベント",
    "指標",
  ];
  const sentences = normalizeText(text)
    .replace(/\r/g, "")
    .split(/[。\n]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/ブル|ベア|予想[:：]?\s*\d{1,3}\s*%/.test(line));

  const scored = sentences
    .map((line, index) => ({
      line,
      score: keywords.reduce((sum, word) => sum + (line.includes(word) ? 1 : 0), 0) + Math.max(0, 3 - index) * 0.05,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((item) => item.line);

  if (scored.length) return scored;
  if (bull !== null && bear !== null) {
    const direction = bull > bear ? "ブル優勢" : "ベア優勢";
    return [`レポート末尾のブル・ベア予想では${direction}。本文から根拠を手動確認してください。`];
  }
  return ["根拠を自動抽出できませんでした。レポート本文の要因部分を確認してください。"];
}

function analyzeReport() {
  const text = $("#reportText").value.trim();
  const bull = extractPercent(text, ["ブル", "買い", "Bull"]);
  const bear = extractPercent(text, ["ベア", "売り", "Bear"]);
  const judgementBox = $("#judgementBox");

  judgementBox.className = "judgement";

  if (!text || bull === null || bear === null) {
    $("#tradeDecision").textContent = "抽出不可";
    $("#decisionHint").textContent = "ブル予想とベア予想の%表記を確認してください。";
    $("#bullValue").textContent = bull === null ? "--%" : `${bull}%`;
    $("#bearValue").textContent = bear === null ? "--%" : `${bear}%`;
    $("#confidenceValue").textContent = "--%";
    $("#reasonList").innerHTML = "<li>数値を抽出できたあとに根拠を表示します。</li>";
    return;
  }

  const confidence = Math.abs(bull - bear);
  const isTrade = confidence >= 35;
  const direction = bull > bear ? "買い方向" : "売り方向";
  const reasons = extractReasons(text, bull, bear);

  state.bull = bull;
  state.bear = bear;
  state.reasons = reasons;

  $("#bullValue").textContent = `${bull}%`;
  $("#bearValue").textContent = `${bear}%`;
  $("#confidenceValue").textContent = `${confidence}%`;
  $("#tradeDecision").textContent = isTrade ? `あり（${direction}）` : "なし";
  $("#decisionHint").textContent = isTrade
    ? `自信指数が35%以上です。${direction}の検証対象として扱えます。`
    : "自信指数が35%未満です。今日は見送り判定です。";
  judgementBox.classList.add(isTrade ? (bull > bear ? "trade-buy" : "trade-sell") : "no-trade");
  renderReasons(reasons);
}

async function autoAnalyzeReport() {
  setBusy("#autoAnalyzeReport", true, "取得中");
  try {
    const result = await apiPost("/api/analyze", {});
    applyMorningResult(result);
    $("#decisionHint").textContent = `${result.reportsChecked ?? 0}件のレポートを取得。解析モード: ${result.mode || "unknown"}`;
  } catch (error) {
    $("#tradeDecision").textContent = "自動解析失敗";
    $("#decisionHint").textContent = error.message;
  } finally {
    setBusy("#autoAnalyzeReport", false, "自動取得＆AI解析");
  }
}

function applyMorningResult(result) {
  const judgementBox = $("#judgementBox");
  const isTrade = result.tradeTarget === "あり";
  const isBuy = result.direction === "買い方向";
  state.bull = result.bullPercent;
  state.bear = result.bearPercent;
  state.reasons = result.reasons || [];

  judgementBox.className = "judgement";
  judgementBox.classList.add(isTrade ? (isBuy ? "trade-buy" : "trade-sell") : "no-trade");
  $("#bullValue").textContent = `${result.bullPercent}%`;
  $("#bearValue").textContent = `${result.bearPercent}%`;
  $("#confidenceValue").textContent = `${result.confidenceIndex}%`;
  $("#tradeDecision").textContent = isTrade ? `あり（${result.direction}）` : "なし";
  renderReasons(state.reasons.length ? state.reasons : ["AI解析結果に根拠が含まれていません。"]);
}

function renderReasons(reasons) {
  $("#reasonList").innerHTML = reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("");
}

function checkNews() {
  const reasons = $("#todayReasons").value.trim();
  const news = $("#newsText").value.trim();
  const normalizedNews = normalizeText(news);
  const alertBox = $("#alertBox");
  alertBox.className = "alert-box";

  if (!reasons || !news) {
    alertBox.classList.add("normal");
    $("#alertDecision").textContent = "未入力";
    $("#alertReason").textContent = "本日の予想根拠と最新ニュースの両方を入力してください。";
    return;
  }

  const hit = watchWords.find((word) => normalizedNews.includes(word));
  const contradiction = detectContradiction(reasons, normalizedNews);

  if (hit || contradiction) {
    alertBox.classList.add("danger");
    $("#alertDecision").textContent = "緊急アラート：手動決済を推奨";
    $("#alertReason").textContent = hit
      ? `警戒ワード「${hit}」を検出しました。ニュース内容を確認してください。`
      : "朝の根拠と逆方向の材料が出ています。トレード前提の崩れを確認してください。";
    return;
  }

  alertBox.classList.add("normal");
  $("#alertDecision").textContent = "異常なし";
  $("#alertReason").textContent = "強制警戒ワードや明確な逆方向材料は検出されていません。";
}

async function autoCheckNews() {
  setBusy("#autoCheckNews", true, "監視中");
  try {
    const reasons = $("#todayReasons").value.trim();
    const result = await apiPost("/api/monitor", { reasons: reasons || undefined });
    applyRiskResult(result);
  } catch (error) {
    $("#alertBox").className = "alert-box danger";
    $("#alertDecision").textContent = "自動監視失敗";
    $("#alertReason").textContent = error.message;
  } finally {
    setBusy("#autoCheckNews", false, "RSS自動監視");
  }
}

function applyRiskResult(result) {
  const alertBox = $("#alertBox");
  alertBox.className = "alert-box";
  alertBox.classList.add(result.alert ? "danger" : "normal");
  $("#alertDecision").textContent = result.decision;
  $("#alertReason").textContent = `${result.reason} 解析モード: ${result.mode || "unknown"}`;
}

function detectContradiction(reasons, news) {
  const reasonText = normalizeText(reasons);
  const buyBias = /米金利.*(高|上昇)|タカ派|ドル高|円安|利上げ/.test(reasonText);
  const sellBias = /米金利.*(低|低下)|ハト派|ドル安|円高|利下げ/.test(reasonText);
  const buyBreak = /米金利.*(低|低下)|ハト派|ドル安|円高|利下げ/.test(news);
  const sellBreak = /米金利.*(高|上昇)|タカ派|ドル高|円安|利上げ/.test(news);
  return (buyBias && buyBreak) || (sellBias && sellBreak);
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => {
    const table = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return table[char];
  });
}

function saveReasonsToNews() {
  const text = state.reasons.length
    ? state.reasons.map((reason) => `・${reason}`).join("\n")
    : [...$("#reasonList").querySelectorAll("li")].map((li) => `・${li.textContent}`).join("\n");
  $("#todayReasons").value = text;
  activatePanel("newsPanel");
}

function activatePanel(panelId) {
  $$(".tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.panel === panelId));
  $$(".panel").forEach((panel) => panel.classList.toggle("is-active", panel.id === panelId));
}

async function copyPrompt(id) {
  const text = $(`#${id}`).textContent;
  await navigator.clipboard.writeText(text);
}

async function refreshStatus() {
  try {
    const status = await apiGet("/api/status");
    const latest = status.latest || {};
    $("#automationStatus").textContent = status.openaiConfigured
      ? "OpenAI API接続設定あり。スケジュール監視も利用できます。"
      : "OpenAI APIキー未設定。ローカル抽出で動作します。";

    if (latest.morning) {
      applyMorningResult(latest.morning);
      $("#decisionHint").textContent = `保存済み最新判定: ${latest.updatedAt || ""}`;
    }
    if (latest.risk) {
      applyRiskResult(latest.risk);
    }
  } catch {
    $("#automationStatus").textContent = "自動化サーバー未起動。npm start で起動してください。";
  }
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function apiGet(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function setBusy(selector, busy, label) {
  const button = $(selector);
  button.disabled = busy;
  button.textContent = label;
}

async function testNotification() {
  setBusy("#testNotify", true, "送信中");
  try {
    await apiPost("/api/test-notify", {});
    $("#automationStatus").textContent = "通知テストを送信しました。Discordを確認してください。";
  } catch (error) {
    $("#automationStatus").textContent = `通知テストに失敗しました: ${error.message}`;
  } finally {
    setBusy("#testNotify", false, "通知テスト");
  }
}

function renderWatchWords() {
  $("#watchChips").innerHTML = watchWords.map((word) => `<span>${word}</span>`).join("");
}

function updateClock() {
  const now = new Date();
  $("#reportClock").textContent = now.toLocaleString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
  });
}

function drawMarketCanvas() {
  const canvas = $("#marketCanvas");
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  for (let x = 0; x < width; x += 64) {
    ctx.strokeStyle = "#edf1f6";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 40; y < height; y += 56) {
    ctx.strokeStyle = "#edf1f6";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const points = Array.from({ length: 34 }, (_, index) => {
    const x = 36 + index * ((width - 72) / 33);
    const wave = Math.sin(index * 0.48) * 42 + Math.cos(index * 0.19) * 28;
    const y = height * 0.53 - wave - index * 1.7;
    return { x, y };
  });

  const gradient = ctx.createLinearGradient(0, 70, width, 280);
  gradient.addColorStop(0, "#0f8b6f");
  gradient.addColorStop(0.55, "#2c64d8");
  gradient.addColorStop(1, "#c14343");

  ctx.lineWidth = 5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = gradient;
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.stroke();

  points.slice(-7).forEach((point, index) => {
    ctx.fillStyle = index % 2 ? "#c14343" : "#0f8b6f";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 5, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.fillStyle = "#1d2430";
  ctx.font = "700 24px Segoe UI, sans-serif";
  ctx.fillText("USD/JPY Bias Monitor", 34, 54);
  ctx.fillStyle = "#647084";
  ctx.font = "16px Segoe UI, sans-serif";
  ctx.fillText("Bull / Bear confidence threshold: 35%", 34, 82);
}

function init() {
  $("#morningPrompt").textContent = morningPrompt;
  $("#riskPrompt").textContent = riskPrompt;
  renderWatchWords();
  drawMarketCanvas();
  updateClock();
  setInterval(updateClock, 30_000);

  $$(".tab").forEach((tab) => tab.addEventListener("click", () => activatePanel(tab.dataset.panel)));
  $("#analyzeReport").addEventListener("click", analyzeReport);
  $("#autoAnalyzeReport").addEventListener("click", autoAnalyzeReport);
  $("#clearReport").addEventListener("click", () => {
    $("#reportText").value = "";
    analyzeReport();
  });
  $("#loadSample").addEventListener("click", () => {
    $("#reportText").value = sampleReport;
    analyzeReport();
  });
  $("#saveReasons").addEventListener("click", saveReasonsToNews);
  $("#checkNews").addEventListener("click", checkNews);
  $("#autoCheckNews").addEventListener("click", autoCheckNews);
  $("#clearNews").addEventListener("click", () => {
    $("#todayReasons").value = "";
    $("#newsText").value = "";
    checkNews();
  });
  $$(".copy").forEach((button) => button.addEventListener("click", () => copyPrompt(button.dataset.copy)));
  $("#refreshStatus").addEventListener("click", refreshStatus);
  $("#testNotify").addEventListener("click", testNotification);
  refreshStatus();
}

init();
