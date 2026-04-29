const DEFAULT_MODEL = "gpt-5-mini";

const REPORT_SOURCES = [
  {
    id: "mufg",
    name: "三菱UFJ銀行",
    pageUrl: "https://www.bk.mufg.jp/rept_mkt/gaitame/index.html",
    pdfPattern: /https?:\/\/[^"'<> ]+\.pdf|\/[^"'<> ]+\.pdf/gi,
  },
  {
    id: "smbc",
    name: "三井住友銀行",
    pdfUrl: "https://www2.smbc.co.jp/market/pdf/comment.pdf",
  },
  {
    id: "resona",
    name: "りそな",
    pageUrl: "https://www.resonabank.co.jp/kojin/market/gaitame/",
    pdfPattern: /https?:\/\/[^"'<> ]+\.pdf|\/[^"'<> ]+\.pdf/gi,
  },
  {
    id: "mizuho",
    name: "みずほ銀行",
    pageUrl: "https://www.mizuhobank.co.jp/forex/ma.html",
    pdfPattern: /https?:\/\/[^"'<> ]+\.pdf|\/[^"'<> ]+\.pdf/gi,
  },
];

const NEWS_FEEDS = [
  "https://www.nhk.or.jp/rss/news/cat0.xml",
  "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best",
];

const DEMO_DEFAULT_UNITS = 1000;

function runMorningPdfLegacy() {
  if (!isWeekdayJst_()) return;

  const reports = resolveReportFiles_();
  const analysis = analyzeReportsWithOpenAI_(reports);
  const state = {
    date: Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd"),
    morning: analysis,
    reports,
    updatedAt: new Date().toISOString(),
  };

  PropertiesService.getScriptProperties().setProperty("LATEST_STATE", JSON.stringify(state));

  if (analysis.tradeTarget === "あり") {
    sendTelegram_(
      [
        "M4ミラトレ判定",
        "判定: あり（" + analysis.direction + "）",
        "ブル: " + analysis.bullPercent + "%",
        "ベア: " + analysis.bearPercent + "%",
        "自信指数: " + analysis.confidenceIndex + "%",
        "",
        "根拠:",
        analysis.reasons.map(function (reason) {
          return "・" + reason;
        }).join("\n"),
      ].join("\n")
    );
  } else {
    sendTelegram_(
      [
        "M4ミラトレ判定",
        "判定: なし",
        "ブル: " + analysis.bullPercent + "%",
        "ベア: " + analysis.bearPercent + "%",
        "自信指数: " + analysis.confidenceIndex + "%",
      ].join("\n")
    );
  }
}

function runMorning() {
  runMorningPreview();
}

function runMorningPreview() {
  runM4WebSearch_("暫定チェック", true);
}

function runNoonFinal() {
  runM4WebSearch_("本判定", false);
}

function runM4WebSearch_(label, isPreview) {
  if (!isWeekdayJst_()) return;

  const analysis = getM4WebSearchAnalysis_();
  const state = {
    date: Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd"),
    phase: label,
    morning: analysis,
    updatedAt: new Date().toISOString(),
  };

  PropertiesService.getScriptProperties().setProperty("LATEST_STATE", JSON.stringify(state));
  appendJudgementToSheet_(label, analysis);
  if (!isPreview) {
    handleDemoTradeAfterFinal_(analysis);
  }

  sendTelegram_(
    [
      isPreview ? "M4ミラトレ暫定チェック" : "M4ミラトレ本判定",
      "判定: " + analysis.tradeTarget + "（" + analysis.direction + "）",
      "ブル: " + analysis.bullPercent + "%",
      "ベア: " + analysis.bearPercent + "%",
      "自信指数: " + analysis.confidenceIndex + "%",
      "",
      "根拠:",
      analysis.reasons.map(function (reason) {
        return "・" + reason;
      }).join("\n"),
      "",
      "メモ:",
      (analysis.sourceNotes || []).slice(0, 4).map(function (note) {
        return "・" + note;
      }).join("\n"),
    ].join("\n")
  );
}

function runMorningLiteTest() {
  const sampleReport =
    "本日のドル円は米金利上昇とFRB高官のタカ派発言を背景に底堅い。日銀会合後の植田総裁発言には注意。\n" +
    "本日のドル円のブル（買い）ベア（売り）予想\n" +
    "ブル予想：70%\n" +
    "ベア予想：30%";

  const analysis = normalizeMorningAnalysis_(callOpenAI_(
    [
      {
        type: "input_text",
        text:
          "あなたはプロのFXアナリストです。M4ミラトレ手法に基づき、次の短いテストレポートからJSONで判定してください。\n\n" +
          sampleReport,
      },
    ],
    morningSchema_()
  ));

  sendTelegram_(
    [
      "M4ミラトレ軽量テスト",
      "判定: " + analysis.tradeTarget + "（" + analysis.direction + "）",
      "ブル: " + analysis.bullPercent + "%",
      "ベア: " + analysis.bearPercent + "%",
      "自信指数: " + analysis.confidenceIndex + "%",
    ].join("\n")
  );
}

function runMorningSinglePdfTest() {
  const report = {
    id: "smbc",
    name: "三井住友銀行",
    url: "https://www2.smbc.co.jp/market/pdf/comment.pdf",
    status: "ok",
  };

  const analysis = analyzeReportsWithOpenAI_([report]);
  sendTelegram_(
    [
      "M4ミラトレPDF単体テスト",
      "対象: " + report.name,
      "判定: " + analysis.tradeTarget + "（" + analysis.direction + "）",
      "ブル: " + analysis.bullPercent + "%",
      "ベア: " + analysis.bearPercent + "%",
      "自信指数: " + analysis.confidenceIndex + "%",
      "",
      "根拠:",
      analysis.reasons.map(function (reason) {
        return "・" + reason;
      }).join("\n"),
    ].join("\n")
  );
}

function runMufgPdfTest() {
  runSingleBankTest_("mufg");
}

function runSmbcPdfTest() {
  runSingleBankTest_("smbc");
}

function runResonaPdfTest() {
  runSingleBankTest_("resona");
}

function runMizuhoPdfTest() {
  runSingleBankTest_("mizuho");
}

function runMorningWebSearchTest() {
  const analysis = getM4WebSearchAnalysis_();

  sendTelegram_(
    [
      "M4ミラトレWeb検索テスト",
      "判定: " + analysis.tradeTarget + "（" + analysis.direction + "）",
      "ブル: " + analysis.bullPercent + "%",
      "ベア: " + analysis.bearPercent + "%",
      "自信指数: " + analysis.confidenceIndex + "%",
      "",
      "根拠:",
      analysis.reasons.map(function (reason) {
        return "・" + reason;
      }).join("\n"),
      "",
      "メモ:",
      (analysis.sourceNotes || []).map(function (note) {
        return "・" + note;
      }).join("\n"),
    ].join("\n")
  );
}

function getM4WebSearchAnalysis_() {
  const today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  return normalizeMorningAnalysis_(callOpenAIWithWebSearch_(
    "あなたはプロのFXアナリストです。対象日（JST）" + today + " のメガバンク公式マーケットレポートをWeb検索で確認し、M4ミラトレ判定をJSONで返してください。\n" +
      "対象は次の4つだけです。\n" +
      "1. 三菱UFJ銀行: bk.mufg.jp または market-research.bk.mufg.jp\n" +
      "2. 三井住友銀行: smbc.co.jp または www2.smbc.co.jp\n" +
      "3. りそな銀行/りそなグループ: resonabank.co.jp\n" +
      "4. みずほ銀行: mizuhobank.co.jp\n" +
      "禁止: smbctb.co.jp（SMBC信託銀行）は三井住友銀行ではないので絶対に使わないでください。\n" +
      "必ず上記ドメインの公式ページまたは公式PDFだけを根拠にしてください。\n" +
      "レポート内のドル円ブル・ベア予想、またはブル・ベア分布が読める場合はそれを使ってください。\n" +
      "対象外ドメイン、古すぎる資料、当日/直近のドル円レポートか確認できない資料は使わず、sourceNotesに不採用理由を書いてください。\n" +
      "有効な公式ソースが2行未満なら、bullPercent=50、bearPercent=50、tradeTarget=なし、direction=なしとして、判定保留相当の理由をreasonsに書いてください。\n" +
      "有効な公式ソースが2行以上でもブル・ベアの明確な根拠が弱い場合は、保守的に自信指数35%未満になるよう返してください。\n" +
      "自信指数はGAS側で再計算されるので、bullPercentとbearPercentを最も妥当な総合値で返してください。",
    morningSchema_()
  ));
}

function runSingleBankTest_(sourceId) {
  const reports = resolveReportFiles_();
  const report = reports.filter(function (item) {
    return item.id === sourceId;
  })[0];

  if (!report || report.status !== "ok") {
    sendTelegram_("M4ミラトレ銀行別テスト: " + sourceId + " のPDF取得に失敗しました。\n" + JSON.stringify(report));
    return;
  }

  const analysis = analyzeReportsWithOpenAI_([report]);
  sendTelegram_(
    [
      "M4ミラトレ銀行別PDFテスト",
      "対象: " + report.name,
      "URL: " + report.url,
      "判定: " + analysis.tradeTarget + "（" + analysis.direction + "）",
      "ブル: " + analysis.bullPercent + "%",
      "ベア: " + analysis.bearPercent + "%",
      "自信指数: " + analysis.confidenceIndex + "%",
      "",
      "根拠:",
      analysis.reasons.map(function (reason) {
        return "・" + reason;
      }).join("\n"),
      "",
      "メモ:",
      (analysis.sourceNotes || []).map(function (note) {
        return "・" + note;
      }).join("\n"),
    ].join("\n")
  );
}

function runNoon() {
  runNoonFinal();
}

function runMonitor() {
  if (!isWeekdayJst_()) return;
  const hour = Number(Utilities.formatDate(new Date(), "Asia/Tokyo", "H"));
  if (hour < 9 || hour > 17) return;

  const stateText = PropertiesService.getScriptProperties().getProperty("LATEST_STATE");
  if (!stateText) {
    return;
  }

  const state = JSON.parse(stateText);
  if (!shouldRunRiskMonitor_(state)) return;

  const newsItems = fetchNews_();
  const result = monitorNewsWithOpenAI_(state.morning.reasons, newsItems);
  appendRiskToSheet_(result, newsItems);

  if (result.alert) {
    closeOpenDemoTrades_("緊急アラート");
    sendTelegram_(
      [
        "M4ミラトレ緊急アラート",
        result.reason,
        "",
        "検出:",
        result.matchedSignals.join(", "),
      ].join("\n")
    );
  }
}

function shouldRunRiskMonitor_(state) {
  const morning = state && state.morning ? state.morning : {};
  if (morning.tradeTarget !== "あり") return false;
  return hasOpenDemoTrade_();
}

function runDemoClose() {
  closeOpenDemoTrades_("17:55定時決済");
}

function testNotify() {
  sendTelegram_("M4ミラトレ通知テスト: GASからTelegram通知できています。");
}

function setupSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  let spreadsheetId = props.getProperty("SPREADSHEET_ID");
  let spreadsheet;

  if (spreadsheetId) {
    spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  } else {
    spreadsheet = SpreadsheetApp.create("M4ミラトレ履歴");
    spreadsheetId = spreadsheet.getId();
    props.setProperty("SPREADSHEET_ID", spreadsheetId);
  }

  ensureSheet_(spreadsheet, "判定履歴", [
    "日時",
    "フェーズ",
    "判定",
    "方向",
    "ブル",
    "ベア",
    "自信指数",
    "根拠",
    "メモ",
  ]);
  ensureSheet_(spreadsheet, "ニュース監視", [
    "日時",
    "アラート",
    "判定",
    "理由",
    "検出シグナル",
    "ニュース件数",
  ]);
  ensureSheet_(spreadsheet, "デモトレード", [
    "取引ID",
    "ステータス",
    "方向",
    "エントリー日時",
    "エントリー価格",
    "決済日時",
    "決済価格",
    "pips",
    "損益円",
    "数量USD",
    "決済理由",
    "自信指数",
    "判定日時",
    "根拠",
  ]);

  sendTelegram_("M4ミラトレ: スプレッドシートを設定しました。\n" + spreadsheet.getUrl());
}

function testSpreadsheetWrite() {
  const analysis = {
    tradeTarget: "なし",
    direction: "なし",
    bullPercent: 50,
    bearPercent: 50,
    confidenceIndex: 0,
    reasons: ["スプレッドシート保存テストです。"],
    sourceNotes: ["この行はテストデータです。"],
  };
  appendJudgementToSheet_("保存テスト", analysis);
  sendTelegram_("M4ミラトレ: スプレッドシートへテスト行を書き込みました。");
}

function testRiskSpreadsheetWrite() {
  const result = {
    alert: false,
    decision: "異常なし",
    reason: "ニュース監視シートへの保存テストです。",
    matchedSignals: [],
  };
  appendRiskToSheet_(result, [{ title: "保存テスト", text: "テストニュース", link: "" }]);
  sendTelegram_("M4ミラトレ: ニュース監視シートへテスト行を書き込みました。");
}

function testUsdJpyQuote() {
  const quote = getUsdJpyQuote_();
  sendTelegram_("M4ミラトレ: USD/JPY価格取得テスト\n" + quote.price + "\nsource: " + quote.source);
}

function testDemoTradeOpen() {
  const analysis = {
    tradeTarget: "あり",
    direction: "買い方向",
    bullPercent: 70,
    bearPercent: 30,
    confidenceIndex: 40,
    reasons: ["デモトレード記録テストです。"],
  };
  handleDemoTradeAfterFinal_(analysis);
}

function setupTriggers() {
  deleteTriggers_();
  ScriptApp.newTrigger("runMorning").timeBased().atHour(8).nearMinute(35).everyDays(1).create();
  ScriptApp.newTrigger("runNoon").timeBased().atHour(12).nearMinute(0).everyDays(1).create();
  ScriptApp.newTrigger("runDemoClose").timeBased().atHour(17).nearMinute(55).everyDays(1).create();
  ScriptApp.newTrigger("runMonitor").timeBased().everyMinutes(15).create();
  sendTelegram_("M4ミラトレ: GAS自動実行トリガーを設定しました。");
}

function deleteTriggers() {
  deleteTriggers_();
}

function doGet(e) {
  const callback = e && e.parameter && e.parameter.callback;
  const payload = buildDashboardPayload_();
  const body = callback ? callback + "(" + JSON.stringify(payload) + ");" : JSON.stringify(payload);
  const mimeType = callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON;
  return ContentService.createTextOutput(body).setMimeType(mimeType);
}

function resolveReportFiles_() {
  return REPORT_SOURCES.map(function (source) {
    try {
      const url = source.pdfUrl || findLatestPdfUrl_(source.pageUrl, source.pdfPattern);
      return {
        id: source.id,
        name: source.name,
        url,
        status: "ok",
      };
    } catch (error) {
      return {
        id: source.id,
        name: source.name,
        url: source.pageUrl || source.pdfUrl,
        status: "error",
        error: String(error),
      };
    }
  });
}

function findLatestPdfUrl_(pageUrl, pattern) {
  const response = UrlFetchApp.fetch(pageUrl, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { "User-Agent": "Mozilla/5.0 M4MiratradeGAS/0.1" },
  });
  if (response.getResponseCode() >= 400) {
    throw new Error("page fetch failed: " + response.getResponseCode());
  }

  const html = response.getContentText();
  const matches = html.match(pattern || /https?:\/\/[^"'<> ]+\.pdf|\/[^"'<> ]+\.pdf/gi) || [];
  const filtered = matches
    .map(function (href) {
      return new URL_(href, pageUrl).toString();
    })
    .filter(function (url) {
      return /pdf/i.test(url) && /market|gaitame|forex|ma|comment|distribution|127r|flash|fx/i.test(url);
    });

  if (!filtered.length) {
    throw new Error("PDF link not found");
  }
  return filtered[0];
}

function analyzeReportsWithOpenAI_(reports) {
  const content = [
    {
      type: "input_text",
      text:
        "あなたはプロのFXアナリストです。M4ミラトレ手法に基づき、提供されたメガバンク4行のマーケットレポートから本日のドル円ブル・ベア予想を抽出し、厳密なJSONで返してください。\n" +
        "自信指数は abs(ブル予想 - ベア予想)。35%以上のみトレード対象ありです。\n" +
        "もし一部レポートが古い・不適切・ブルベア分布が読めない場合は、sourceNotesにその理由を書き、読めるソースだけで保守的に判断してください。\n\n" +
        "対象レポート:\n" +
        reports.map(function (report) {
          return "・" + report.name + ": " + report.url + " (" + report.status + ")";
        }).join("\n"),
    },
  ];

  reports.forEach(function (report) {
    if (report.status === "ok" && /\.pdf(\?|$)/i.test(report.url)) {
      content.push(fetchPdfAsInputFile_(report));
    } else {
      content.push({ type: "input_text", text: report.name + " URL: " + report.url + " status: " + report.status });
    }
  });

  return normalizeMorningAnalysis_(callOpenAI_(content, morningSchema_()));
}

function fetchPdfAsInputFile_(report) {
  const response = UrlFetchApp.fetch(report.url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: { "User-Agent": "Mozilla/5.0 M4MiratradeGAS/0.1" },
  });
  if (response.getResponseCode() >= 400) {
    throw new Error(report.name + " PDF fetch failed: " + response.getResponseCode());
  }

  const blob = response.getBlob();
  const bytes = blob.getBytes();
  if (bytes.length > 20 * 1024 * 1024) {
    throw new Error(report.name + " PDF is too large: " + bytes.length + " bytes");
  }

  const base64 = Utilities.base64Encode(bytes);
  return {
    type: "input_file",
    filename: report.id + ".pdf",
    file_data: "data:application/pdf;base64," + base64,
  };
}

function monitorNewsWithOpenAI_(reasons, newsItems) {
  const newsText = newsItems
    .map(function (item) {
      return "【" + item.title + "】\n" + item.text + "\n" + item.link;
    })
    .join("\n\n");

  const content = [
    {
      type: "input_text",
      text:
        "あなたはFXのリスク管理アシスタントです。本日の予想根拠と最新ニュースを比較し、根拠崩壊、為替介入示唆、突発的な地政学リスクや災害があれば緊急アラートを返してください。\n\n" +
        "【本日の予想根拠】\n" +
        reasons.join("\n") +
        "\n\n【最新ニュース】\n" +
        newsText,
    },
  ];

  return callOpenAI_(content, riskSchema_());
}

function callOpenAI_(content, schema) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty("OPENAI_API_KEY");
  const model = props.getProperty("OPENAI_MODEL") || DEFAULT_MODEL;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const payload = {
    model,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: schema.name,
        strict: true,
        schema: schema.schema,
      },
    },
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + apiKey },
  });

  const text = response.getContentText();
  if (response.getResponseCode() >= 400) {
    throw new Error("OpenAI API error " + response.getResponseCode() + ": " + text);
  }

  const data = JSON.parse(text);
  const outputText = data.output_text || findOutputText_(data.output || []);
  if (!outputText) throw new Error("OpenAI output_text not found");
  return JSON.parse(outputText);
}

function callOpenAIWithWebSearch_(inputText, schema) {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty("OPENAI_API_KEY");
  const model = props.getProperty("OPENAI_MODEL") || DEFAULT_MODEL;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not set");

  const payload = {
    model,
    tools: [{ type: "web_search" }],
    tool_choice: "auto",
    input: inputText,
    text: {
      format: {
        type: "json_schema",
        name: schema.name,
        strict: true,
        schema: schema.schema,
      },
    },
  };

  const response = UrlFetchApp.fetch("https://api.openai.com/v1/responses", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
    headers: { Authorization: "Bearer " + apiKey },
  });

  const text = response.getContentText();
  if (response.getResponseCode() >= 400) {
    throw new Error("OpenAI web search error " + response.getResponseCode() + ": " + text);
  }

  const data = JSON.parse(text);
  const outputText = data.output_text || findOutputText_(data.output || []);
  if (!outputText) throw new Error("OpenAI web search output_text not found");
  return JSON.parse(outputText);
}

function normalizeMorningAnalysis_(analysis) {
  const bull = clampPercent_(Number(analysis.bullPercent));
  const bear = clampPercent_(Number(analysis.bearPercent));
  const confidence = Math.abs(bull - bear);
  const tradeTarget = confidence >= 35 ? "あり" : "なし";
  const direction = tradeTarget === "なし" ? "なし" : bull > bear ? "買い方向" : "売り方向";

  analysis.bullPercent = bull;
  analysis.bearPercent = bear;
  analysis.confidenceIndex = confidence;
  analysis.tradeTarget = tradeTarget;
  analysis.direction = direction;
  analysis.sourceNotes = analysis.sourceNotes || [];
  analysis.sourceNotes.push("自信指数とトレード判定はGAS側で再計算済み。");
  return analysis;
}

function clampPercent_(value) {
  if (!isFinite(value)) return 50;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function fetchNews_() {
  return NEWS_FEEDS.flatMap(function (url) {
    try {
      const xmlText = UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText();
      const xml = XmlService.parse(xmlText);
      const channel = xml.getRootElement().getChild("channel");
      if (!channel) return [];
      return channel.getChildren("item").slice(0, 10).map(function (item) {
        return {
          title: getChildText_(item, "title"),
          text: getChildText_(item, "description").replace(/<[^>]+>/g, " "),
          link: getChildText_(item, "link"),
        };
      });
    } catch (error) {
      return [{ title: "RSS取得エラー", text: String(error), link: url }];
    }
  }).slice(0, 30);
}

function sendTelegram_(message) {
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty("TELEGRAM_BOT_TOKEN");
  const chatId = props.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chatId) throw new Error("TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set");

  const response = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }),
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() >= 400) {
    throw new Error("Telegram error " + response.getResponseCode() + ": " + response.getContentText());
  }
}

function deleteTriggers_() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    ScriptApp.deleteTrigger(trigger);
  });
}

function appendJudgementToSheet_(phase, analysis) {
  const sheet = getHistorySheet_("判定履歴");
  sheet.appendRow([
    Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss"),
    phase,
    analysis.tradeTarget,
    analysis.direction,
    analysis.bullPercent,
    analysis.bearPercent,
    analysis.confidenceIndex,
    (analysis.reasons || []).join("\n"),
    (analysis.sourceNotes || []).join("\n"),
  ]);
}

function appendRiskToSheet_(result, newsItems) {
  const sheet = getHistorySheet_("ニュース監視");
  sheet.appendRow([
    Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss"),
    result.alert ? "あり" : "なし",
    result.decision,
    result.reason,
    (result.matchedSignals || []).join(", "),
    newsItems.length,
  ]);
}

function handleDemoTradeAfterFinal_(analysis) {
  if (analysis.tradeTarget !== "あり") return;
  if (hasOpenDemoTrade_()) return;
  if (hasDemoTradeForToday_()) return;

  const quote = getUsdJpyQuote_();
  const units = getDemoUnits_();
  const nowText = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  const tradeId = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyyMMdd-HHmmss");
  const sheet = getHistorySheet_("デモトレード");

  sheet.appendRow([
    tradeId,
    "OPEN",
    analysis.direction,
    nowText,
    quote.price,
    "",
    "",
    "",
    "",
    units,
    "",
    analysis.confidenceIndex,
    nowText,
    (analysis.reasons || []).join("\n"),
  ]);

  sendTelegram_(
    [
      "M4ミラトレ デモエントリー",
      "方向: " + analysis.direction,
      "価格: " + quote.price,
      "数量: " + units + " USD",
      "自信指数: " + analysis.confidenceIndex + "%",
    ].join("\n")
  );
}

function closeOpenDemoTrades_(reason) {
  const sheet = getHistorySheet_("デモトレード");
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return;

  const headers = values[0].map(String);
  const index = headerIndex_(headers);
  const quote = getUsdJpyQuote_();
  const nowText = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss");
  let closedCount = 0;
  let messageLines = [];

  for (let row = 1; row < values.length; row++) {
    if (String(values[row][index["ステータス"]]) !== "OPEN") continue;

    const direction = String(values[row][index["方向"]]);
    const entryPrice = Number(values[row][index["エントリー価格"]]);
    const units = Number(values[row][index["数量USD"]] || getDemoUnits_());
    const diff = direction === "買い方向" ? quote.price - entryPrice : entryPrice - quote.price;
    const pips = round_(diff / 0.01, 1);
    const pnl = Math.round(diff * units);
    const sheetRow = row + 1;

    sheet.getRange(sheetRow, index["ステータス"] + 1).setValue("CLOSED");
    sheet.getRange(sheetRow, index["決済日時"] + 1).setValue(nowText);
    sheet.getRange(sheetRow, index["決済価格"] + 1).setValue(quote.price);
    sheet.getRange(sheetRow, index["pips"] + 1).setValue(pips);
    sheet.getRange(sheetRow, index["損益円"] + 1).setValue(pnl);
    sheet.getRange(sheetRow, index["決済理由"] + 1).setValue(reason);

    closedCount++;
    messageLines.push("方向: " + direction + " / " + pips + "pips / " + pnl + "円");
  }

  if (closedCount) {
    sendTelegram_(
      [
        "M4ミラトレ デモ決済",
        "理由: " + reason,
        "決済価格: " + quote.price,
        messageLines.join("\n"),
      ].join("\n")
    );
  }
}

function hasOpenDemoTrade_() {
  const rows = readDemoTradeRows_();
  return rows.some(function (row) {
    return row["ステータス"] === "OPEN";
  });
}

function hasDemoTradeForToday_() {
  const today = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy-MM-dd");
  const rows = readDemoTradeRows_();
  return rows.some(function (row) {
    return String(row["エントリー日時"] || "").indexOf(today) === 0;
  });
}

function readDemoTradeRows_() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) return [];
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  return readSheetObjects_(spreadsheet, "デモトレード");
}

function getDemoUnits_() {
  const units = Number(PropertiesService.getScriptProperties().getProperty("DEMO_TRADE_UNITS") || DEMO_DEFAULT_UNITS);
  return isFinite(units) && units > 0 ? units : DEMO_DEFAULT_UNITS;
}

function getUsdJpyQuote_() {
  const props = PropertiesService.getScriptProperties();
  const alphaKey = props.getProperty("ALPHA_VANTAGE_API_KEY");
  if (alphaKey) {
    const url = "https://www.alphavantage.co/query?function=CURRENCY_EXCHANGE_RATE&from_currency=USD&to_currency=JPY&apikey=" + encodeURIComponent(alphaKey);
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const data = JSON.parse(response.getContentText());
    const rate = data["Realtime Currency Exchange Rate"] && data["Realtime Currency Exchange Rate"]["5. Exchange Rate"];
    if (rate) return { price: round_(Number(rate), 3), source: "Alpha Vantage" };
  }

  const yahooUrl = "https://query1.finance.yahoo.com/v8/finance/chart/JPY=X?interval=1m&range=1d";
  const yahooResponse = UrlFetchApp.fetch(yahooUrl, { muteHttpExceptions: true });
  const yahooData = JSON.parse(yahooResponse.getContentText());
  const result = yahooData.chart && yahooData.chart.result && yahooData.chart.result[0];
  const price = result && result.meta && result.meta.regularMarketPrice;
  if (!price) throw new Error("USD/JPY quote not available");
  return { price: round_(Number(price), 3), source: "Yahoo Finance chart" };
}

function headerIndex_(headers) {
  const result = {};
  headers.forEach(function (header, index) {
    result[header] = index;
  });
  return result;
}

function round_(value, decimals) {
  const scale = Math.pow(10, decimals);
  return Math.round(value * scale) / scale;
}

function getHistorySheet_(name) {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) {
    setupSpreadsheet();
  }
  const spreadsheet = SpreadsheetApp.openById(props.getProperty("SPREADSHEET_ID"));
  return spreadsheet.getSheetByName(name);
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

function buildDashboardPayload_() {
  try {
    const props = PropertiesService.getScriptProperties();
    const spreadsheetId = props.getProperty("SPREADSHEET_ID");
    if (!spreadsheetId) {
      return {
        ok: false,
        error: "SPREADSHEET_ID is not set. Run setupSpreadsheet first.",
        updatedAt: new Date().toISOString(),
      };
    }

    const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
    const judgementHistory = readSheetObjects_(spreadsheet, "判定履歴").reverse();
    const riskHistory = readSheetObjects_(spreadsheet, "ニュース監視").reverse();
    const demoTrades = readSheetObjects_(spreadsheet, "デモトレード").reverse();
    const latestFinal = judgementHistory.filter(function (row) {
      return row["フェーズ"] === "本判定";
    })[0];

    return {
      ok: true,
      updatedAt: new Date().toISOString(),
      spreadsheetUrl: spreadsheet.getUrl(),
      latestJudgement: latestFinal || judgementHistory[0] || null,
      judgementHistory: judgementHistory.slice(0, 30),
      latestRisk: riskHistory[0] || null,
      riskHistory: riskHistory.slice(0, 30),
      demoStats: buildDemoStats_(demoTrades),
      demoTrades: demoTrades.slice(0, 30),
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error),
      updatedAt: new Date().toISOString(),
    };
  }
}

function buildDemoStats_(trades) {
  const closed = trades.filter(function (trade) {
    return trade["ステータス"] === "CLOSED";
  });
  const wins = closed.filter(function (trade) {
    return Number(trade["損益円"] || 0) > 0;
  }).length;
  const losses = closed.filter(function (trade) {
    return Number(trade["損益円"] || 0) < 0;
  }).length;
  const totalPnl = closed.reduce(function (sum, trade) {
    return sum + Number(trade["損益円"] || 0);
  }, 0);
  const totalPips = closed.reduce(function (sum, trade) {
    return sum + Number(trade["pips"] || 0);
  }, 0);
  const openTrade = trades.filter(function (trade) {
    return trade["ステータス"] === "OPEN";
  })[0] || null;

  return {
    totalTrades: closed.length,
    wins: wins,
    losses: losses,
    winRate: closed.length ? round_((wins / closed.length) * 100, 1) : 0,
    totalPnl: Math.round(totalPnl),
    totalPips: round_(totalPips, 1),
    openTrade: openTrade,
  };
}

function readSheetObjects_(spreadsheet, sheetName) {
  const sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet || sheet.getLastRow() < 2) return [];

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (header) {
    return String(header);
  });

  return values.slice(1).filter(function (row) {
    return row.some(function (cell) {
      return cell !== "";
    });
  }).map(function (row) {
    const item = {};
    headers.forEach(function (header, index) {
      const value = row[index];
      item[header] = value instanceof Date
        ? Utilities.formatDate(value, "Asia/Tokyo", "yyyy-MM-dd HH:mm:ss")
        : String(value == null ? "" : value);
    });
    return item;
  });
}

function isWeekdayJst_() {
  const day = Number(Utilities.formatDate(new Date(), "Asia/Tokyo", "u"));
  return day >= 1 && day <= 5;
}

function getChildText_(element, childName) {
  const child = element.getChild(childName);
  return child ? child.getText() : "";
}

function findOutputText_(output) {
  for (let i = 0; i < output.length; i++) {
    const content = output[i].content || [];
    for (let j = 0; j < content.length; j++) {
      if (content[j].type === "output_text") return content[j].text;
    }
  }
  return "";
}

function morningSchema_() {
  return {
    name: "m4_morning_report",
    schema: {
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
    },
  };
}

function riskSchema_() {
  return {
    name: "m4_risk_monitor",
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        alert: { type: "boolean" },
        decision: { type: "string", enum: ["緊急アラート：手動決済を推奨", "異常なし"] },
        reason: { type: "string" },
        matchedSignals: { type: "array", items: { type: "string" }, maxItems: 6 },
      },
      required: ["alert", "decision", "reason", "matchedSignals"],
    },
  };
}

function URL_(href, baseUrl) {
  if (/^https?:\/\//i.test(href)) return { toString: function () { return href; } };
  const base = baseUrl.match(/^(https?:\/\/[^/]+)(\/.*)?$/);
  if (!base) throw new Error("invalid base URL");
  if (href.indexOf("/") === 0) return { toString: function () { return base[1] + href; } };
  const dir = baseUrl.replace(/[^/]*$/, "");
  return { toString: function () { return dir + href; } };
}
