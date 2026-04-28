const defaultModel = process.env.OPENAI_MODEL || "gpt-5-mini";

const morningSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    bullPercent: { type: "integer", minimum: 0, maximum: 100 },
    bearPercent: { type: "integer", minimum: 0, maximum: 100 },
    confidenceIndex: { type: "integer", minimum: 0, maximum: 100 },
    tradeTarget: { type: "string", enum: ["あり", "なし"] },
    direction: { type: "string", enum: ["買い方向", "売り方向", "なし"] },
    reasons: { type: "array", items: { type: "string" }, maxItems: 3 },
    sourceNotes: { type: "array", items: { type: "string" }, maxItems: 4 },
  },
  required: ["bullPercent", "bearPercent", "confidenceIndex", "tradeTarget", "direction", "reasons", "sourceNotes"],
};

const riskSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    alert: { type: "boolean" },
    decision: { type: "string", enum: ["緊急アラート：手動決済を推奨", "異常なし"] },
    reason: { type: "string" },
    matchedSignals: { type: "array", items: { type: "string" }, maxItems: 6 },
  },
  required: ["alert", "decision", "reason", "matchedSignals"],
};

export async function analyzeMorningReport(text, reports) {
  const fallback = heuristicMorning(text);
  if (!process.env.OPENAI_API_KEY) {
    if (reports.length > 1) {
      return {
        bullPercent: 50,
        bearPercent: 50,
        confidenceIndex: 0,
        tradeTarget: "なし",
        direction: "なし",
        reasons: ["完全自動取得ではOpenAI APIキー設定後に判定します。誤抽出防止のためローカル判定は停止中です。"],
        sourceNotes: ["OPENAI_API_KEYを.envに設定してください。"],
        mode: "needs_openai_key",
        reportsChecked: reports.length,
      };
    }
    return { ...fallback, mode: "heuristic", reportsChecked: reports.length };
  }

  return callStructured({
    schemaName: "m4_morning_report",
    schema: morningSchema,
    instructions:
      "あなたはプロのFXアナリストです。M4ミラトレ手法に基づき、提供されたメガバンクのマーケットレポートから本日のドル円ブル・ベア予想を抽出し、厳密なJSONで返してください。自信指数はabs(ブル-ベア)。35%以上のみトレード対象ありです。",
    input: `レポート本文:\n${text}`,
    fallback: { ...fallback, mode: "fallback_after_ai_error", reportsChecked: reports.length },
  }).then((result) => ({ ...result, mode: "openai", reportsChecked: reports.length }));
}

export async function monitorNewsRisk(reasons, newsText) {
  const fallback = heuristicRisk(reasons, newsText);
  if (!process.env.OPENAI_API_KEY) {
    return { ...fallback, mode: "heuristic" };
  }

  return callStructured({
    schemaName: "m4_risk_monitor",
    schema: riskSchema,
    instructions:
      "あなたはFXのリスク管理アシスタントです。本日の予想根拠と最新ニュースを比較し、根拠崩壊、為替介入示唆、突発的な地政学リスクや災害があれば緊急アラートを返してください。過剰反応を避け、理由は1行で簡潔に。",
    input: `【本日の予想根拠】\n${Array.isArray(reasons) ? reasons.join("\n") : reasons}\n\n【最新ニュース】\n${newsText}`,
    fallback,
  }).then((result) => ({ ...result, mode: "openai" }));
}

async function callStructured({ schemaName, schema, instructions, input, fallback }) {
  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: defaultModel,
        instructions,
        input,
        text: {
          format: {
            type: "json_schema",
            name: schemaName,
            strict: true,
            schema,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const outputText =
      data.output_text ||
      data.output?.flatMap((item) => item.content || []).find((content) => content.type === "output_text")?.text;
    if (!outputText) throw new Error("OpenAI response had no output_text");
    return JSON.parse(outputText);
  } catch (error) {
    console.error(error);
    return fallback;
  }
}

function heuristicMorning(text) {
  const normalized = text.replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0));
  const bull = extractPercent(normalized, ["ブル", "買い", "Bull"]) ?? 50;
  const bear = extractPercent(normalized, ["ベア", "売り", "Bear"]) ?? 50;
  const confidenceIndex = Math.abs(bull - bear);
  const tradeTarget = confidenceIndex >= 35 ? "あり" : "なし";
  const direction = tradeTarget === "なし" ? "なし" : bull > bear ? "買い方向" : "売り方向";

  return {
    bullPercent: bull,
    bearPercent: bear,
    confidenceIndex,
    tradeTarget,
    direction,
    reasons: extractReasons(normalized),
    sourceNotes: ["OpenAI API未設定または失敗時のローカル抽出です。"],
  };
}

function heuristicRisk(reasons, newsText) {
  const watchWords = ["為替介入", "断固たる措置", "過度な変動", "日銀", "財務省", "政府高官", "戦争", "地政学", "災害"];
  const matchedSignals = watchWords.filter((word) => newsText.includes(word));
  const alert = matchedSignals.length > 0;
  return {
    alert,
    decision: alert ? "緊急アラート：手動決済を推奨" : "異常なし",
    reason: alert ? `警戒シグナル「${matchedSignals[0]}」を検出。` : "強制警戒ワードや明確な根拠崩壊は検出されていません。",
    matchedSignals,
    reasonsChecked: Array.isArray(reasons) ? reasons.length : 1,
  };
}

function extractPercent(text, sideWords) {
  const lines = text.split(/\n/).map((line) => line.trim());
  const lineMatch = lines
    .filter((line) => sideWords.some((word) => line.toLowerCase().includes(word.toLowerCase())))
    .map((line) => line.match(/(\d{1,3})\s*[%％]/))
    .find(Boolean);
  if (lineMatch) return validPercent(Number(lineMatch[1]));

  const direct = new RegExp(`(?:${sideWords.join("|")})[^\\n0-9%％]{0,20}(\\d{1,3})(?:\\s*)[%％]`, "i");
  const directMatch = text.match(direct);
  return directMatch ? validPercent(Number(directMatch[1])) : null;
}

function validPercent(value) {
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

function extractReasons(text) {
  const keywords = ["発言", "FRB", "FOMC", "日銀", "財務省", "金利", "雇用", "CPI", "インフレ", "介入", "地政学", "指標"];
  return text
    .split(/[。\n]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => keywords.some((keyword) => line.includes(keyword)))
    .slice(0, 3);
}
