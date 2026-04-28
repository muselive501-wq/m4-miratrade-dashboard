const apiUrl = window.M4_API_URL || localStorage.getItem("M4_API_URL") || "";

const $ = (selector) => document.querySelector(selector);

function splitLines(value) {
  return String(value || "")
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function renderList(selector, items) {
  const list = $(selector);
  list.innerHTML = items.length ? items.map((item) => `<li>${escapeHtml(item)}</li>`).join("") : "<li>データなし</li>";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const table = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return table[char];
  });
}

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const callback = `m4Callback_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const separator = url.includes("?") ? "&" : "?";

    window[callback] = (data) => {
      delete window[callback];
      script.remove();
      resolve(data);
    };

    script.onerror = () => {
      delete window[callback];
      script.remove();
      reject(new Error("GAS APIを読み込めませんでした。"));
    };

    script.src = `${url}${separator}callback=${callback}`;
    document.body.appendChild(script);
  });
}

function decisionClass(row) {
  if (!row) return "hold";
  if (row["方向"] === "買い方向") return "buy";
  if (row["方向"] === "売り方向") return "sell";
  return "hold";
}

function renderDashboard(data) {
  if (!data.ok) {
    $("#decision").textContent = "取得エラー";
    $("#updatedAt").textContent = data.error || "データを取得できませんでした。";
    $("#syncState").textContent = "取得失敗";
    return;
  }

  const latest = data.latestJudgement || {};
  const cls = decisionClass(latest);
  const confidence = Number(latest["自信指数"] || 0);
  const bull = Number(latest["ブル"] || 0);
  const bear = Number(latest["ベア"] || 0);
  const confidenceColor = cls === "buy" ? "#0c8d6d" : cls === "sell" ? "#c54d4d" : "#5b6677";

  $("#decision").className = cls;
  $("#decision").textContent = latest["判定"] ? `${latest["判定"]}（${latest["方向"] || "なし"}）` : "データなし";
  $("#updatedAt").textContent = latest["日時"] ? `最終更新: ${latest["日時"]}` : `API更新: ${data.updatedAt}`;
  $("#confidence").textContent = latest["自信指数"] || "--";
  $("#bull").textContent = latest["ブル"] ? `${latest["ブル"]}%` : "--%";
  $("#bear").textContent = latest["ベア"] ? `${latest["ベア"]}%` : "--%";
  $("#direction").textContent = latest["方向"] || "--";
  $("#phase").textContent = latest["フェーズ"] || "--";
  $("#syncState").textContent = "同期済み";
  document.documentElement.style.setProperty("--confidence", Math.max(0, Math.min(100, confidence)));
  document.documentElement.style.setProperty("--confidence-color", confidenceColor);
  document.documentElement.style.setProperty("--bull-width", `${Math.max(0, Math.min(100, bull))}%`);
  document.documentElement.style.setProperty("--bear-width", `${Math.max(0, Math.min(100, bear))}%`);

  renderList("#reasons", splitLines(latest["根拠"]));
  renderList("#notes", splitLines(latest["メモ"]));
  renderJudgementRows(data.judgementHistory || []);
  renderRiskRows(data.riskHistory || []);
  drawMarketCanvas(cls, bull, bear, confidence);
}

function renderJudgementRows(rows) {
  $("#judgementRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `<tr>
            <td>${escapeHtml(row["日時"])}</td>
            <td>${escapeHtml(row["フェーズ"])}</td>
            <td>${escapeHtml(row["判定"])}</td>
            <td>${escapeHtml(row["方向"])}</td>
            <td>${escapeHtml(row["自信指数"])}%</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="5">履歴なし</td></tr>`;
}

function renderRiskRows(rows) {
  $("#riskRows").innerHTML = rows.length
    ? rows
        .map(
          (row) => `<tr>
            <td>${escapeHtml(row["日時"])}</td>
            <td>${escapeHtml(row["アラート"])}</td>
            <td>${escapeHtml(row["理由"])}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="3">履歴なし</td></tr>`;
}

async function loadDashboard() {
  if (!apiUrl) {
    $("#decision").textContent = "API未設定";
    $("#updatedAt").textContent = "public/config.js にGAS WebアプリURLを入れてください。";
    $("#syncState").textContent = "API未設定";
    return;
  }

  $("#refreshButton").disabled = true;
  $("#refreshButton").textContent = "更新中";
  $("#syncState").textContent = "同期中";
  try {
    const data = await jsonp(apiUrl);
    renderDashboard(data);
  } catch (error) {
    $("#decision").textContent = "取得エラー";
    $("#updatedAt").textContent = error.message;
    $("#syncState").textContent = "取得失敗";
  } finally {
    $("#refreshButton").disabled = false;
    $("#refreshButton").textContent = "更新";
  }
}

function drawMarketCanvas(cls = "hold", bull = 50, bear = 50, confidence = 0) {
  const canvas = $("#marketCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const base = cls === "buy" ? "#0c8d6d" : cls === "sell" ? "#c54d4d" : "#5b6677";

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfe";
  ctx.fillRect(0, 0, width, height);

  for (let x = 0; x <= width; x += 48) {
    ctx.strokeStyle = "#edf2f7";
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }

  for (let y = 28; y <= height; y += 38) {
    ctx.strokeStyle = "#edf2f7";
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  const points = Array.from({ length: 24 }, (_, index) => {
    const x = 22 + index * ((width - 44) / 23);
    const bias = (bull - bear) * 0.42;
    const wave = Math.sin(index * 0.56) * 22 + Math.cos(index * 0.21) * 14;
    const drift = (index - 12) * (cls === "hold" ? 0.15 : cls === "buy" ? -0.85 : 0.85);
    const y = height * 0.55 - wave - bias * 0.24 + drift;
    return { x, y };
  });

  const gradient = ctx.createLinearGradient(0, 30, width, height - 26);
  gradient.addColorStop(0, "#0c8d6d");
  gradient.addColorStop(0.5, "#255edb");
  gradient.addColorStop(1, "#c54d4d");

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

  const last = points[points.length - 1];
  ctx.fillStyle = base;
  ctx.beginPath();
  ctx.arc(last.x, last.y, Math.max(5, confidence / 10), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#17202c";
  ctx.font = "800 20px Segoe UI, sans-serif";
  ctx.fillText("USD/JPY Bias", 22, 34);
  ctx.fillStyle = "#667287";
  ctx.font = "14px Segoe UI, sans-serif";
  ctx.fillText("Bull / Bear confidence monitor", 22, 56);
}

$("#refreshButton").addEventListener("click", loadDashboard);
drawMarketCanvas();
loadDashboard();
