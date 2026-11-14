# twitch-live-notifier

English | [日本語](README.ja.md)

Posts a message to a Discord channel when a Twitch channel goes live.

It receives the Twitch EventSub `stream.online` event on Cloudflare Workers (Hono) and posts through a Discord webhook:

```
配信開始しました 🎉
https://twitch.tv/<channel>
```

The first line is Japanese for "The stream has started", followed by an emoji picked at random from a list you define.

- Requests from Twitch are verified with their HMAC-SHA256 signature.
- Workers KV suppresses duplicates: a resent event is ignored, and a channel is not announced again within 10 minutes (for example after a reconnect).

## Requirements

- Node.js and npm
- A Cloudflare account (the free plan is enough)
- A Twitch application (Client ID and Client Secret) from the [Twitch Developer Console](https://dev.twitch.tv/console)
- A Discord webhook URL for the channel to post to

## Setup

### 1. Install

```bash
npm install
```

### 2. Deploy

```bash
npm run deploy
```

Note the Worker URL it prints (`https://<name>.<subdomain>.workers.dev`).

You don't need to create the KV namespace yourself. `wrangler.jsonc` has no KV `id`, so on the first deploy Wrangler creates the namespace and binds it to `NOTIFY_KV`. If it asks whether to use an existing namespace or create a new one, choose to create a new one. Later deploys keep using the namespace already bound to the Worker.

If Wrangler writes the KV `id` into `wrangler.jsonc` after deploying, you can discard that change. Deploys keep working without it.

### 3. Set the secrets

```bash
npx wrangler secret put TWITCH_SECRET        # any string of 10-100 characters
npx wrangler secret put DISCORD_WEBHOOK_URL
```

The secrets take effect immediately. You don't need to deploy again.

### 4. Subscribe to `stream.online`

Get an app access token:

```bash
curl -X POST 'https://id.twitch.tv/oauth2/token' \
  -d 'client_id=<CLIENT_ID>&client_secret=<CLIENT_SECRET>&grant_type=client_credentials'
```

Look up the broadcaster's user ID:

```bash
curl 'https://api.twitch.tv/helix/users?login=<LOGIN_NAME>' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Client-Id: <CLIENT_ID>'
```

Create the subscription. `secret` must be the same value as `TWITCH_SECRET`:

```bash
curl -X POST 'https://api.twitch.tv/helix/eventsub/subscriptions' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Client-Id: <CLIENT_ID>' \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "stream.online",
    "version": "1",
    "condition": { "broadcaster_user_id": "<BROADCASTER_ID>" },
    "transport": {
      "method": "webhook",
      "callback": "https://<WORKER_DOMAIN>/twitch/eventsub",
      "secret": "<TWITCH_SECRET>"
    }
  }'
```

The Worker answers Twitch's verification challenge automatically. Check that the subscription status is `enabled`:

```bash
curl 'https://api.twitch.tv/helix/eventsub/subscriptions' \
  -H 'Authorization: Bearer <ACCESS_TOKEN>' \
  -H 'Client-Id: <CLIENT_ID>'
```

## Customizing

| What | Where |
|------|-------|
| Emoji candidates | `EMOJIS` in [src/discord.ts](src/discord.ts) |
| Cooldown before the same channel is announced again (seconds, minimum 60) | `COOLDOWN_SEC` in [src/notify.ts](src/notify.ts) |

Emoji formats:

- Custom emoji: `<:name:ID>`
- Animated emoji: `<a:name:ID>`
- Standard emoji: as is (for example `🎉`)

To find a custom emoji's ID, send `\:emoji_name:` in Discord. Use emoji from the same server as the webhook's channel. Run `npm run deploy` again after editing.

## Local development

Copy `.dev.vars.example` to `.dev.vars`, fill in the values, then start the Worker:

```bash
npm run dev
```

Send a test event with the [Twitch CLI](https://dev.twitch.tv/docs/cli/):

```bash
twitch event trigger stream.online -F http://localhost:8787/twitch/eventsub -s <TWITCH_SECRET>
```

A message should appear in Discord. Sending the event again within 10 minutes posts nothing, because of the cooldown.

Run the tests and the type check:

```bash
npm test
npm run typecheck
```

## Endpoint

`POST /twitch/eventsub`

| Request | Response |
|---------|----------|
| Missing or invalid signature | `403` |
| `webhook_callback_verification` | `200` with the `challenge` value as plain text |
| `notification` for `stream.online` | `204`, then the Discord message is posted in the background |
| Any other `notification`, or `revocation` | `204` |
