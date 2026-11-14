import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EMOJIS } from '../src/discord'
import {
  createExecutionContext,
  postEventSub,
  streamOnlinePayload,
  TEST_WEBHOOK_URL,
} from './helpers'

type FetchMock = ReturnType<typeof vi.fn<(url: string, init: RequestInit) => Promise<Response>>>

let fetchMock: FetchMock

/** Discord に送られたメッセージ本文の一覧 */
function sentMessages(): string[] {
  return fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body as string).content)
}

beforeEach(() => {
  fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('配信開始の通知', () => {
  it('stream.online を受け取ると Discord に通知を1件投稿する', async () => {
    const { ctx, settle } = createExecutionContext()

    const res = await postEventSub({
      messageType: 'notification',
      payload: streamOnlinePayload(),
      ctx,
    })
    await settle()

    expect(res.status).toBe(204)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe(TEST_WEBHOOK_URL)

    const [firstLine, secondLine, ...rest] = sentMessages()[0].split('\n')
    expect(rest).toEqual([])
    expect(secondLine).toBe('https://twitch.tv/cool_streamer')
    expect(firstLine.startsWith('配信開始しました ')).toBe(true)
    expect(EMOJIS).toContain(firstLine.slice('配信開始しました '.length))
  })

  it('Discordへの送信を待たずにTwitchへ応答する', async () => {
    let finishSend!: () => void
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          finishSend = () => resolve(new Response(null, { status: 204 }))
        }),
    )
    const { ctx, pending, settle } = createExecutionContext()

    // Discordへの送信が終わっていない状態でも応答が返る
    const res = await postEventSub({
      messageType: 'notification',
      payload: streamOnlinePayload(),
      ctx,
    })
    expect(res.status).toBe(204)
    expect(pending).toHaveLength(1)

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    finishSend()
    await settle()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stream.online 以外の notification では通知しない', async () => {
    const { ctx, pending, settle } = createExecutionContext()

    const res = await postEventSub({
      messageType: 'notification',
      payload: {
        subscription: { id: 'sub-2', type: 'channel.update', version: '2' },
        event: {
          broadcaster_user_id: '12345',
          broadcaster_user_login: 'cool_streamer',
          title: 'new title',
          category_name: 'Just Chatting',
        },
      },
      ctx,
    })
    await settle()

    expect(res.status).toBe(204)
    expect(pending).toHaveLength(0)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('revocation では通知しない', async () => {
    const { ctx, settle } = createExecutionContext()

    await postEventSub({
      messageType: 'revocation',
      payload: {
        subscription: { id: 'sub-1', type: 'stream.online', version: '1', status: 'user_removed' },
      },
      ctx,
    })
    await settle()

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('署名が不正なリクエストでは通知しない', async () => {
    const { ctx, settle } = createExecutionContext()

    const res = await postEventSub({
      messageType: 'notification',
      payload: streamOnlinePayload(),
      signature: `sha256=${'0'.repeat(64)}`,
      ctx,
    })
    await settle()

    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Discordへの送信に失敗しても例外を外に漏らさずログに残す', async () => {
    fetchMock.mockResolvedValue(new Response('rate limited', { status: 429 }))
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { ctx, settle } = createExecutionContext()

    const res = await postEventSub({
      messageType: 'notification',
      payload: streamOnlinePayload(),
      ctx,
    })
    await expect(settle()).resolves.toBeDefined()

    expect(res.status).toBe(204)
    expect(errorLog).toHaveBeenCalledTimes(1)
  })
})
