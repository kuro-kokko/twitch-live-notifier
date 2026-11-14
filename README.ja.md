# twitch-live-notifier

[English](README.md) | 日本語

Twitchチャンネルで配信が始まったら、Discordのチャンネルに通知を投稿します。

Twitch EventSubの `stream.online` をCloudflare Workers(Hono)で受け取り、DiscordのWebhookで投稿します。

```
配信開始しました 🎉
https://twitch.tv/<チャンネル>
```

絵文字は、あらかじめ決めたリストから毎回ランダムに選ばれます。

- Twitchからのリクエストは署名(HMAC-SHA256)で検証します。
- Workers KVで重複を防ぎます。再送された同じイベントは無視し、同じチャンネルは10分間は再通知しません(回線の再接続など)。

## 必要なもの

- Node.js と npm
- Cloudflareアカウント(無料プランで動きます)
- [Twitch Developer Console](https://dev.twitch.tv/console) で登録したアプリ(Client ID と Client Secret)
- 通知先チャンネルのDiscord Webhook URL

## セットアップ

### 1. インストール

```bash
npm install
```

### 2. KV namespaceを作る

```bash
npx wrangler kv namespace create NOTIFY_KV
```

表示された `id` を、`wrangler.jsonc` の `REPLACE_WITH_KV_NAMESPACE_ID` と置き換えます。

### 3. シークレットを登録する

```bash
npx wrangler secret put TWITCH_SECRET        # 10〜100文字の任意の文字列
npx wrangler secret put DISCORD_WEBHOOK_URL
```

### 4. デプロイする

```bash
npm run deploy
```

表示されたWorkerのURL(`https://<名前>.<サブドメイン>.workers.dev`)を控えます。

### 5. `stream.online` を購読する

アプリアクセストークンを取得します。

```bash
curl -X POST 'https://id.twitch.tv/oauth2/token' \
  -d 'client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&grant_type=client_credentials'
```

配信者のユーザーIDを調べます。

```bash
curl 'https://api.twitch.tv/helix/users?login=<ログイン名>' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Client-Id: <CLIENT_ID>'
```

購読を作成します。`secret` には `TWITCH_SECRET` と同じ値を指定します。

```bash
curl -X POST 'https://api.twitch.tv/helix/eventsub/subscriptions' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Client-Id: <CLIENT_ID>' \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "stream.online",
    "version": "1",
    "condition": { "broadcaster_user_id": "<配信者ID>" },
    "transport": {
      "method": "webhook",
      "callback": "https://<Workerのドメイン>/twitch/eventsub",
      "secret": "<TWITCH_SECRET>"
    }
  }'
```

Twitchからの確認用チャレンジにはWorkerが自動で応答します。購読のstatusが `enabled` になったことを確認します。

```bash
curl 'https://api.twitch.tv/helix/eventsub/subscriptions' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Client-Id: <CLIENT_ID>'
```

## カスタマイズ

| 内容 | 場所 |
|------|------|
| 絵文字の候補 | [src/discord.ts](src/discord.ts) の `EMOJIS` |
| 同じチャンネルを再通知しない時間(秒、最短60) | [src/notify.ts](src/notify.ts) の `COOLDOWN_SEC` |

絵文字の書式:

- カスタム絵文字: `<:名前:ID>`
- アニメ絵文字: `<a:名前:ID>`
- 通常の絵文字: そのまま(例: `🎉`)

カスタム絵文字のIDは、Discordで `\:絵文字名:` と送信すると確認できます。絵文字は通知先チャンネルと同じサーバーのものを使ってください。編集したら、もう一度 `npm run deploy` を実行します。

## ローカル開発

`.dev.vars.example` を `.dev.vars` にコピーして値を設定し、Workerを起動します。

```bash
npm run dev
```

[Twitch CLI](https://dev.twitch.tv/docs/cli/) でテスト用のイベントを送ります。

```bash
twitch event trigger stream.online -F http://localhost:8787/twitch/eventsub -s <TWITCH_SECRET>
```

Discordにメッセージが投稿されます。10分以内にもう一度送っても、cooldownによって投稿されません。

テストと型チェックを実行します。

```bash
npm test
npm run typecheck
```

## エンドポイント

`POST /twitch/eventsub`

| リクエスト | 応答 |
|------------|------|
| 署名がない、または不正 | `403` |
| `webhook_callback_verification` | `200`、`challenge` の値をtext/plainで返す |
| `stream.online` の `notification` | `204`、その後バックグラウンドでDiscordに投稿する |
| それ以外の `notification`、`revocation` | `204` |
