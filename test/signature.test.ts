import { describe, expect, it } from 'vitest'
import { verifyTwitchSignature } from '../src/signature'
import { sign } from './helpers'

const SECRET = 'test-secret-1234567890'
const MESSAGE_ID = 'msg-1'
const TIMESTAMP = '2026-11-14T00:00:00.000Z'
const BODY = '{"hello":"world"}'

describe('verifyTwitchSignature', () => {
  it('正しい署名を受け入れる', async () => {
    const signature = await sign(SECRET, MESSAGE_ID, TIMESTAMP, BODY)
    expect(await verifyTwitchSignature(SECRET, MESSAGE_ID, TIMESTAMP, BODY, signature)).toBe(true)
  })

  it('bodyが改ざんされていたら拒否する', async () => {
    const signature = await sign(SECRET, MESSAGE_ID, TIMESTAMP, BODY)
    expect(
      await verifyTwitchSignature(SECRET, MESSAGE_ID, TIMESTAMP, '{"hello":"evil"}', signature),
    ).toBe(false)
  })

  it('Message-Idやタイムスタンプが違えば拒否する', async () => {
    const signature = await sign(SECRET, MESSAGE_ID, TIMESTAMP, BODY)
    expect(await verifyTwitchSignature(SECRET, 'msg-2', TIMESTAMP, BODY, signature)).toBe(false)
    expect(
      await verifyTwitchSignature(SECRET, MESSAGE_ID, '2026-11-14T00:00:01.000Z', BODY, signature),
    ).toBe(false)
  })

  it('secretが違えば拒否する', async () => {
    const signature = await sign('another-secret-1234567890', MESSAGE_ID, TIMESTAMP, BODY)
    expect(await verifyTwitchSignature(SECRET, MESSAGE_ID, TIMESTAMP, BODY, signature)).toBe(false)
  })

  it.each([
    ['空文字', ''],
    ['プレフィックスなし', 'a'.repeat(64)],
    ['別のアルゴリズム', `sha1=${'a'.repeat(64)}`],
    ['桁数不足', 'sha256=abcd'],
    ['hex以外の文字', `sha256=${'z'.repeat(64)}`],
  ])('形式が不正な署名を拒否する: %s', async (_name, signature) => {
    expect(await verifyTwitchSignature(SECRET, MESSAGE_ID, TIMESTAMP, BODY, signature)).toBe(false)
  })
})
