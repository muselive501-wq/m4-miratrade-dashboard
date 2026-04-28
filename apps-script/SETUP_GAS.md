# GAS版 M4ミラトレ通知設定

GAS版は、PCを切っていてもGoogle側で動く通知係です。Telegramに判定結果を送ります。

## 1. Apps Scriptを作る

1. ブラウザで `https://script.google.com/` を開く
2. `新しいプロジェクト` を押す
3. 左上のプロジェクト名を `M4ミラトレ通知` に変更する
4. `コード.gs` の中身を全部消す
5. このフォルダの `apps-script/Code.gs` の中身を全部コピーして貼る
6. 保存する

## 2. スクリプトプロパティを入れる

1. Apps Script画面の左側にある歯車アイコン `プロジェクトの設定` を押す
2. 下の方にある `スクリプト プロパティ` を探す
3. `スクリプト プロパティを追加` を押す
4. 次の4つを追加する

```text
OPENAI_API_KEY
OPENAI_MODEL
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

値は以下のように入れます。

```text
OPENAI_API_KEY      あなたのOpenAI APIキー
OPENAI_MODEL        gpt-5-mini
TELEGRAM_BOT_TOKEN  Telegram BotFatherでもらったToken
TELEGRAM_CHAT_ID    すでに取得済みのChat ID
```

## 3. Telegram通知テスト

1. 上部の関数選択で `testNotify` を選ぶ
2. 実行ボタンを押す
3. 初回だけGoogleの承認画面が出るので許可する
4. Telegramに `GASからTelegram通知できています` と届けば成功

## 4. 朝レポート解析テスト

1. 関数選択で `runMorning` を選ぶ
2. 実行ボタンを押す
3. TelegramにM4ミラトレ判定が届くか確認する

## 5. 自動実行を設定

1. 関数選択で `setupTriggers` を選ぶ
2. 実行する
3. Telegramに `GAS自動実行トリガーを設定しました` と届けばOK

設定される自動実行:

- 平日 8:35ごろ: 朝レポート解析
- 平日 12:00ごろ: 昼の再解析
- 平日 9:00〜17:59: 15分ごとにニュース監視

GASの時刻トリガーは厳密に秒単位ではなく、数分ずれることがあります。

## 6. 止めたいとき

関数選択で `deleteTriggers` を選んで実行すると、自動実行を止められます。

## 注意

銀行側のレポートURLやPDF配置が変わると、取得先の調整が必要になる場合があります。
