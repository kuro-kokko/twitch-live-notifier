# Twitch購読の設定とテスト通知

Workerのデプロイが終わったあとに、TwitchのEventSub購読を作り、通知が届くことを確認するまでの手順です。

コマンドはすべて **Git Bash** で実行します。最初に値を変数に入れておくので、そのあとのコマンドは書き換えずにコピーして実行できます。

> [!NOTE]
> 変数はターミナルを閉じると消えます。ターミナルを開き直したら、[手順2](#2-値を変数に入れる)から実行し直してください。

## 前提

次の作業が終わっていること。

- `npm run deploy` でWorkerをデプロイした
- `npx wrangler secret put TWITCH_SECRET` と `npx wrangler secret put DISCORD_WEBHOOK_URL` で、シークレットを登録した

## 用語: 2つの「secret」

| 名前 | 用途 | 誰が決めるか |
|------|------|--------------|
| クライアントの秘密(Client Secret) | Twitch APIのアクセストークンを取得するときに使う | Twitchが発行する |
| `TWITCH_SECRET` | Twitchから届く通知の署名を検証するときに使う | 自分で決める(10〜100文字) |

`TWITCH_SECRET` は英数字だけにしておくのが無難です。`"` や `\` を含めると、[手順6](#6-購読を作成する)のJSONが壊れます。

## 1. Twitchでアプリを登録する

ブラウザで操作します。一度登録すれば、やり直すときにこの手順は不要です。

1. [Twitch Developer Console](https://dev.twitch.tv/console) にログインします。アプリの登録には、Twitchアカウントで二段階認証を有効にしておく必要があります。
2. 「アプリケーション」→「アプリケーションを登録」を開き、次のように入力します。
   - **名前**: 任意(例: `my-live-notifier`)。Twitch全体で重複しない名前にします。
   - **OAuthのリダイレクトURL**: `http://localhost`(この用途では使いませんが、入力が必須です)
   - **カテゴリー**: 「Application Integration」など
   - **クライアントタイプ**: 「機密保持」(Confidential)
3. 登録したアプリの「管理」を開き、**クライアントID** と **クライアントの秘密**(「新しい秘密」ボタンで発行)を控えます。

配信者のチャンネル設定やダッシュボードでは、何も設定しません。

## 2. 値を変数に入れる

`'...'` の中を自分の値に書き換えてから実行します。

```bash
CLIENT_ID='Developer Consoleのクライアント ID'
CLIENT_SECRET='Developer Consoleのクライアントの秘密'
TWITCH_SECRET='wrangler secret put で登録したのと同じ文字列'
WORKER_URL='https://twitch-live-notifier.xxxx.workers.dev'
LOGIN='通知したいチャンネルのログイン名'
```

- `WORKER_URL`: `npm run deploy` の出力、またはCloudflareダッシュボードの Workers & Pages → `twitch-live-notifier` に表示されているURLです。末尾に `/` は付けません。
- `LOGIN`: チャンネルURL `https://twitch.tv/xxxx` の `xxxx` の部分です。
- `TWITCH_SECRET`: Cloudflareに登録した値は後から読み出せません。忘れた場合は、新しい値を決めて `npx wrangler secret put TWITCH_SECRET` で登録し直します。

## 3. Workerが動いているか確認する

```bash
curl -i -X POST "$WORKER_URL/twitch/eventsub"
```

`HTTP/1.1 403` が返れば正常です(署名がないので拒否されている)。接続エラーや `404` の場合は、`WORKER_URL` が間違っています。

## 4. トークンと配信者IDを取得する

```bash
TOKEN=$(curl -s -X POST 'https://id.twitch.tv/oauth2/token' \
  -d "client_id=$CLIENT_ID&client_secret=$CLIENT_SECRET&grant_type=client_credentials" \
  | sed -E 's/.*"access_token":"([^"]+)".*/\1/')
echo "$TOKEN"

BROADCASTER_ID=$(curl -s "https://api.twitch.tv/helix/users?login=$LOGIN" \
  -H "Authorization: Bearer $TOKEN" -H "Client-Id: $CLIENT_ID" \
  | sed -E 's/.*"id":"([0-9]+)".*/\1/')
echo "$BROADCASTER_ID"
```

`TOKEN` が英数字30文字ほど、`BROADCASTER_ID` が数字だけになっていれば成功です。JSONやエラー文が表示された場合は、`CLIENT_ID`、`CLIENT_SECRET`、`LOGIN` のどれかが間違っています。

## 5. 既存の購読を確認・削除する

```bash
curl -s 'https://api.twitch.tv/helix/eventsub/subscriptions' \
  -H "Authorization: Bearer $TOKEN" -H "Client-Id: $CLIENT_ID"
```

`"data":[]` なら、購読はありません。[手順6](#6-購読を作成する)に進みます。

購読が表示された場合は、`"id":"xxxxxxxx-..."` の値ごとに次を実行して削除します。`204` が返れば削除できています。

```bash
curl -i -X DELETE 'https://api.twitch.tv/helix/eventsub/subscriptions?id=ここに購読のid' \
  -H "Authorization: Bearer $TOKEN" -H "Client-Id: $CLIENT_ID"
```

次の場合は、既存の購読を必ず削除してから作り直します。

- 購読の作成に失敗した(statusが `enabled` 以外)
- `TWITCH_SECRET` を変更した(購読には作成時のsecretが保存されているため)
- WorkerのURLが変わった

## 6. 購読を作成する

```bash
curl -s -X POST 'https://api.twitch.tv/helix/eventsub/subscriptions' \
  -H "Authorization: Bearer $TOKEN" -H "Client-Id: $CLIENT_ID" \
  -H 'Content-Type: application/json' \
  -d "{\"type\":\"stream.online\",\"version\":\"1\",\"condition\":{\"broadcaster_user_id\":\"$BROADCASTER_ID\"},\"transport\":{\"method\":\"webhook\",\"callback\":\"$WORKER_URL/twitch/eventsub\",\"secret\":\"$TWITCH_SECRET\"}}"
```

作成直後にTwitchから確認用のチャレンジが届き、Workerが自動で応答します。**この時点ではDiscordに何も投稿されません。**

数秒待ってから[手順5](#5-既存の購読を確認削除する)の確認コマンドを実行し、`"status":"enabled"` になっていれば完了です。

| status | 意味 |
|--------|------|
| `enabled` | 有効。配信を始めると通知が届く |
| `webhook_callback_verification_pending` | チャレンジの応答待ち。少し待ってからもう一度確認する |
| `webhook_callback_verification_failed` | チャレンジに失敗した。`WORKER_URL` と `TWITCH_SECRET` を確認し、削除して作り直す |

購読は一度作れば残り続けます。アクセストークンの期限が切れても通知は止まりません。

## 7. テスト通知を送る

### A. Discord Webhookだけを確認する

Worker を通さずに、Webhook URLが正しいかだけを確認します。`DISCORD_WEBHOOK_URL` を変数に入れて実行します。

```bash
DISCORD_WEBHOOK_URL='https://discord.com/api/webhooks/...'
curl -i -H 'Content-Type: application/json' -d '{"content":"テスト"}' "$DISCORD_WEBHOOK_URL"
```

`204` が返り、Discordに「テスト」と投稿されれば、Webhook URLは正しいです。

### B. Twitch CLIで疑似イベントを送る(配信せずに確認)

[Twitch CLI](https://github.com/twitchdev/twitch-cli/releases) をインストールします。Windowsの場合は `twitch-cli_..._Windows_x86_64.zip` をダウンロードして展開し、中の `twitch.exe` があるフォルダで実行します。

```bash
./twitch event trigger stream.online -F "$WORKER_URL/twitch/eventsub" -s "$TWITCH_SECRET"
```

Discordに次のような通知が投稿されれば成功です。疑似イベントなので、チャンネル名はダミー(`testBroadcaster` など)になります。

```
配信開始しました 🎉
https://twitch.tv/testBroadcaster
```

同じ配信者IDのイベントは、10分間は再通知されません(cooldown)。

チャレンジへの応答だけを確認したい場合は、次のコマンドを使います。

```bash
./twitch event verify-subscription stream.online -F "$WORKER_URL/twitch/eventsub" -s "$TWITCH_SECRET"
```

### C. 実際に配信して確認する

購読したチャンネルで配信を始めると、数秒〜1分ほどでDiscordに通知が届きます。本番と同じ流れを確認できる、一番確実な方法です。

## うまくいかないとき

別のターミナルでWorkerのログを表示したまま、テスト通知を送ります。

```bash
npx wrangler tail
```

| ログの様子 | 原因 |
|------------|------|
| リクエストが表示されない | Twitchから届いていない。購読のstatusと `WORKER_URL` を確認する |
| `403` になる | `TWITCH_SECRET` と購読時の `secret` が一致していない。[手順5](#5-既存の購読を確認削除する)から作り直す |
| `Failed to notify stream.online` が出る | Discordへの送信に失敗した。[7-A](#a-discord-webhookだけを確認する)でWebhook URLを確認する |
| `204` だがDiscordに投稿されない | cooldown中の可能性がある。10分待ってから送り直す |

## 設定を変更するとき

| 変更内容 | やること |
|----------|----------|
| Discord Webhook URL | `npx wrangler secret put DISCORD_WEBHOOK_URL` のみ。購読はそのままでよい |
| `TWITCH_SECRET` | `npx wrangler secret put TWITCH_SECRET` のあと、[手順2](#2-値を変数に入れる)から購読を作り直す |
| クライアントの秘密 | 購読はそのままでよい。次にAPIを使うときに新しい値を使う |
| 通知するチャンネル | [手順2](#2-値を変数に入れる)の `LOGIN` を変えて、購読を作り直す |
