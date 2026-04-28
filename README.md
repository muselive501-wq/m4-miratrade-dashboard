# M4ミラトレ 自動化ダッシュボード

メガバンク4行の公開レポート取得、AI解析、日中ニュース監視、通知、履歴保存を行うローカルWebアプリです。

## 起動

```powershell
npm install
Copy-Item .env.example .env
npm start
```

ブラウザで `http://localhost:3000` を開きます。

## PCを切っても動かす場合

Railwayなどのクラウドに置くと、PCを閉じていてもスケジュール実行とTelegram通知が動きます。

Railwayに設定する環境変数:

```env
OPENAI_API_KEY=sk-proj_xxx
OPENAI_MODEL=gpt-5-mini
ENABLE_SCHEDULER=true
TIMEZONE=Asia/Tokyo
MORNING_CRON=35 8 * * 1-5
NOON_CRON=0 12 * * 1-5
MONITOR_CRON=*/15 9-17 * * 1-5
NOTIFY_WEBHOOK_TYPE=telegram
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=123456789
```

## APIキー設定

`.env` に OpenAI APIキーを入れます。

```env
OPENAI_API_KEY=sk-proj_xxx
OPENAI_MODEL=gpt-5-mini
```

OpenAIキーが未設定でも手入力の簡易判定はできますが、4行レポートの完全自動解析は誤抽出防止のため停止します。

## スケジュール

JSTで以下を自動実行します。

- 平日 8:35: 朝レポート取得とAI解析
- 平日 12:00: 昼確認用に再取得とAI解析
- 平日 9:00-17:59: 15分ごとにRSSニュース監視

変更する場合は `.env` の `MORNING_CRON`、`NOON_CRON`、`MONITOR_CRON` を編集します。

## 通知

Telegram、Discord、Slackのいずれかを設定できます。

### Telegram

```env
NOTIFY_WEBHOOK_TYPE=telegram
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=123456789
```

BotFatherでBotを作成し、Botに `/start` を送ったあと、`http://localhost:3000/api/telegram-updates` を開くと `chat_id` を確認できます。

### Discord

```env
NOTIFY_WEBHOOK_URL=https://discord.com/api/webhooks/...
NOTIFY_WEBHOOK_TYPE=discord
```

Slackの場合:

```env
NOTIFY_WEBHOOK_TYPE=slack
```

## レポート取得先

`config/sources.json` を編集します。銀行側に公式APIは見当たらないため、公開HTMLまたはPDFを取得して解析します。

## ニュース取得先

`config/news-feeds.json` にRSSを追加できます。為替ニュースのRSSや有料ニュースAPIを使う場合はここを差し替えます。

## 手動実行

```powershell
npm run run:morning
npm run run:monitor
```

## 保存データ

最新状態は `data/latest.json`、履歴は `data/history.json` に保存されます。

## 注意

このアプリは検証補助ツールです。投資判断と損益責任は利用者本人に帰属します。
