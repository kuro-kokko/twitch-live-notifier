import { Hono } from 'hono'
import type { Bindings } from './env'
import { notifyStreamOnline, type StreamOnlineEvent } from './notify'
import { verifyTwitchSignature } from './signature'

type EventSubNotification = {
  subscription: { type: string }
  event: StreamOnlineEvent
}

const app = new Hono<{ Bindings: Bindings }>()

app.post('/twitch/eventsub', async (c) => {
  const messageId = c.req.header('Twitch-Eventsub-Message-Id')
  const timestamp = c.req.header('Twitch-Eventsub-Message-Timestamp')
  const signature = c.req.header('Twitch-Eventsub-Message-Signature')
  const messageType = c.req.header('Twitch-Eventsub-Message-Type')

  // 署名は生のbodyに対して計算されるため、パースせず文字列のまま受け取る
  const body = await c.req.text()

  if (
    !messageId ||
    !timestamp ||
    !signature ||
    !(await verifyTwitchSignature(c.env.TWITCH_SECRET, messageId, timestamp, body, signature))
  ) {
    return c.text('Forbidden', 403)
  }

  if (messageType === 'webhook_callback_verification') {
    const { challenge } = JSON.parse(body) as { challenge: string }
    return c.text(challenge, 200)
  }

  if (messageType === 'notification') {
    const payload = JSON.parse(body) as EventSubNotification
    if (payload.subscription.type === 'stream.online') {
      // Twitchには先に応答し、重複チェックと通知は応答後にバックグラウンドで行う
      c.executionCtx.waitUntil(
        notifyStreamOnline(c.env, messageId, payload.event).catch((err) => {
          console.error('Failed to notify stream.online', err)
        }),
      )
    }
  }

  // notification / revocation
  return c.body(null, 204)
})

export default app
