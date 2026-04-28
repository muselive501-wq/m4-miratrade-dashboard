export async function notify(message) {
  const type = process.env.NOTIFY_WEBHOOK_TYPE || "discord";
  if (type === "telegram") {
    return notifyTelegram(message);
  }

  const url = process.env.NOTIFY_WEBHOOK_URL;
  if (!url) return { skipped: true };
  const body = type === "slack" ? { text: message } : { content: message };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Notification failed ${response.status}: ${await response.text()}`);
  }

  return { ok: true };
}

export async function getTelegramUpdates() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const response = await fetch(`https://api.telegram.org/bot${token}/getUpdates`);
  if (!response.ok) {
    throw new Error(`Telegram getUpdates failed ${response.status}: ${await response.text()}`);
  }
  const data = await response.json();
  return data.result || [];
}

async function notifyTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { skipped: true, reason: "telegram_not_configured" };

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram notification failed ${response.status}: ${await response.text()}`);
  }

  return { ok: true };
}
