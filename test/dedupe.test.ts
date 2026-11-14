import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COOLDOWN_SEC } from '../src/notify'
import {
  createEnv,
  createExecutionContext,
  createFakeKV,
  postEventSub,
  streamOnlinePayload,
} from './helpers'

let fetchMock: ReturnType<typeof vi.fn<() => Promise<Response>>>

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** stream.online を送り、バックグラウンド処理が終わるまで待つ */
async function sendStreamOnline(
  env: ReturnType<typeof createEnv>,
  messageId: string,
  event: Record<string, string> = {},
) {
  const { ctx, settle } = createExecutionContext()
  const res = await postEventSub({
    messageType: 'notification',
    payload: streamOnlinePayload(event),
    messageId,
    env,
    ctx,
  })
  await settle()
  return res
}

describe('重複防止', () => {
  it('COOLDOWN_SEC は600秒', () => {
    expect(COOLDOWN_SEC).toBe(600)
  })

  it('通知するとき msg と cooldown のキーを有効期限付きで置く', async () => {
    const { kv, puts } = createFakeKV()

    await sendStreamOnline(createEnv(kv), 'msg-1')

    expect(puts).toEqual([
      { key: 'msg:msg-1', value: '1', expirationTtl: 3600 },
      { key: 'cooldown:12345', value: '1', expirationTtl: 600 },
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Twitchが同じ Message-Id を再送してきても二重に投稿しない', async () => {
    const { kv, store } = createFakeKV()
    const env = createEnv(kv)

    await sendStreamOnline(env, 'msg-1')
    // cooldown が切れた後に再送が届いた場合でも、Message-Id で弾かれる
    store.delete('cooldown:12345')
    const res = await sendStreamOnline(env, 'msg-1')

    expect(res.status).toBe(204)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cooldown 中は別の Message-Id の配信開始イベントでも再通知しない', async () => {
    const env = createEnv(createFakeKV().kv)

    await sendStreamOnline(env, 'msg-1')
    const res = await sendStreamOnline(env, 'msg-2')

    expect(res.status).toBe(204)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('cooldown が切れた後の配信開始イベントは通知する', async () => {
    const { kv, store } = createFakeKV()
    const env = createEnv(kv)

    await sendStreamOnline(env, 'msg-1')
    store.delete('cooldown:12345') // 有効期限切れを再現
    await sendStreamOnline(env, 'msg-2')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('cooldown は配信者ごとに分かれている', async () => {
    const env = createEnv(createFakeKV().kv)

    await sendStreamOnline(env, 'msg-1')
    await sendStreamOnline(env, 'msg-2', {
      broadcaster_user_id: '67890',
      broadcaster_user_login: 'other_streamer',
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
