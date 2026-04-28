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
    return;
  }

  const latest = data.latestJudgement || {};
  const cls = decisionClass(latest);

  $("#decision").className = cls;
  $("#decision").textContent = latest["判定"] ? `${latest["判定"]}（${latest["方向"] || "なし"}）` : "データなし";
  $("#updatedAt").textContent = latest["日時"] ? `最終更新: ${latest["日時"]}` : `API更新: ${data.updatedAt}`;
  $("#confidence").textContent = latest["自信指数"] || "--";
  $("#bull").textContent = latest["ブル"] ? `${latest["ブル"]}%` : "--%";
  $("#bear").textContent = latest["ベア"] ? `${latest["ベア"]}%` : "--%";
  $("#direction").textContent = latest["方向"] || "--";
  $("#phase").textContent = latest["フェーズ"] || "--";

  renderList("#reasons", splitLines(latest["根拠"]));
  renderList("#notes", splitLines(latest["メモ"]));
  renderJudgementRows(data.judgementHistory || []);
  renderRiskRows(data.riskHistory || []);
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
    return;
  }

  $("#refreshButton").disabled = true;
  $("#refreshButton").textContent = "更新中";
  try {
    const data = await jsonp(apiUrl);
    renderDashboard(data);
  } catch (error) {
    $("#decision").textContent = "取得エラー";
    $("#updatedAt").textContent = error.message;
  } finally {
    $("#refreshButton").disabled = false;
    $("#refreshButton").textContent = "更新";
  }
}

$("#refreshButton").addEventListener("click", loadDashboard);
loadDashboard();
