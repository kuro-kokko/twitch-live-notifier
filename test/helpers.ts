import app from '../src/index'
import type { Bindings } from '../src/env'

const encoder = new TextEncoder()

export const TEST_SECRET = 'test-secret-1234567890'
export const TEST_WEBHOOK_URL = 'https://discord.test/api/webhooks/1/token'

/** Twitch と同じ方法で署名ヘッダーの値(`sha256=<hex>`)を作る */
export async function sign(
  secret: string,
  messageId: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(messageId + timestamp + body))
  const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `sha256=${hex}`
}

/** get / put だけを持つ、メモリ上の KV の代用品 */
export function createFakeKV() {
  const store = new Map<string, string>()
  const puts: { key: string; value: string; expirationTtl?: number }[] = []
  const kv = {
    async get(key: string) {
      return store.get(key) ?? null
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }) {
      store.set(key, value)
      puts.push({ key, value, expirationTtl: options?.expirationTtl })
    },
  }
  return { kv: kv as unknown as KVNamespace, store, puts }
}

/** `waitUntil` に渡された処理を後から待てる ExecutionContext の代用品 */
export function createExecutionContext() {
  const pending: Promise<unknown>[] = []
  const ctx = {
    waitUntil(promise: Promise<unknown>) {
      pending.push(promise)
    },
    passThroughOnException() {},
    props: {},
  }
  return {
    ctx: ctx as unknown as ExecutionContext,
    pending,
    /** バックグラウンド処理がすべて終わるまで待つ */
    settle: () => Promise.all(pending),
  }
}

export function createEnv(kv: KVNamespace = createFakeKV().kv): Bindings {
  return {
    NOTIFY_KV: kv,
    TWITCH_SECRET: TEST_SECRET,
    DISCORD_WEBHOOK_URL: TEST_WEBHOOK_URL,
  }
}

type PostOptions = {
  messageType: string
  payload: unknown
  messageId?: string
  timestamp?: string
  /** 署名ヘッダーを差し替える(改ざんのテスト用)。null でヘッダーを付けない */
  signature?: string | null
  env?: Bindings
  ctx?: ExecutionContext
}

/** 署名付きの EventSub リクエストを `/twitch/eventsub` に送る */
export async function postEventSub(options: PostOptions): Promise<Response> {
  const {
    messageType,
    payload,
    messageId = 'msg-1',
    timestamp = '2026-11-14T00:00:00.000Z',
    env = createEnv(),
    ctx = createExecutionContext().ctx,
  } = options
  const body = JSON.stringify(payload)
  const signature =
    options.signature === undefined
      ? await sign(env.TWITCH_SECRET, messageId, timestamp, body)
      : options.signature

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Twitch-Eventsub-Message-Id': messageId,
    'Twitch-Eventsub-Message-Timestamp': timestamp,
    'Twitch-Eventsub-Message-Type': messageType,
  }
  if (signature !== null) headers['Twitch-Eventsub-Message-Signature'] = signature

  return app.request('/twitch/eventsub', { method: 'POST', headers, body }, env, ctx)
}

export function streamOnlinePayload(overrides: Record<string, string> = {}) {
  return {
    subscription: { id: 'sub-1', type: 'stream.online', version: '1' },
    event: {
      id: '9001',
      broadcaster_user_id: '12345',
      broadcaster_user_login: 'cool_streamer',
      broadcaster_user_name: 'Cool_Streamer',
      type: 'live',
      started_at: '2026-11-14T00:00:00Z',
      ...overrides,
    },
  }
}
