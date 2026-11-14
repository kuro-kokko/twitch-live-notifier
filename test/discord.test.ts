import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildMessage, EMOJIS, pickEmoji, sendDiscordMessage } from '../src/discord'
import { TEST_WEBHOOK_URL } from './helpers'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EMOJIS', () => {
  it('候補が1つ以上あり、どれも通常の絵文字かDiscordのカスタム絵文字の書式になっている', () => {
    expect(EMOJIS.length).toBeGreaterThan(0)
    for (const emoji of EMOJIS) {
      const isCustom = /^<a?:\w+:\d+>$/.test(emoji)
      const isUnicode = /^\p{Extended_Pictographic}/u.test(emoji)
      expect(isCustom || isUnicode, emoji).toBe(true)
    }
  })
})

describe('pickEmoji', () => {
  it('乱数に応じてリストの先頭から末尾までを選ぶ', () => {
    expect(pickEmoji(() => 0)).toBe(EMOJIS[0])
    expect(pickEmoji(() => 0.999999)).toBe(EMOJIS[EMOJIS.length - 1])
  })

  it('常にリスト内の絵文字を返す', () => {
    for (let i = 0; i < 200; i++) {
      expect(EMOJIS).toContain(pickEmoji())
    }
  })
})

describe('buildMessage', () => {
  it('「配信開始しました」+ 絵文字 + チャンネルURL を組み立てる', () => {
    expect(buildMessage('cool_streamer', '🎉')).toBe(
      '配信開始しました 🎉\nhttps://twitch.tv/cool_streamer',
    )
  })

  it('カスタム絵文字はそのままの書式で埋め込む', () => {
    expect(buildMessage('cool_streamer', '<a:party:123456789012345678>')).toBe(
      '配信開始しました <a:party:123456789012345678>\nhttps://twitch.tv/cool_streamer',
    )
  })
})

describe('sendDiscordMessage', () => {
  it('Webhook URL に content をJSONでPOSTする', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await sendDiscordMessage(TEST_WEBHOOK_URL, 'hello')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(TEST_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'hello' }),
    })
  })

  it('Discordがエラーを返したら例外を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"Unknown Webhook"}', { status: 404 })),
    )

    await expect(sendDiscordMessage(TEST_WEBHOOK_URL, 'hello')).rejects.toThrow('404')
  })
})
