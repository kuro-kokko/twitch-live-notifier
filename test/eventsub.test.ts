import { describe, expect, it } from 'vitest'
import app from '../src/index'
import { postEventSub, streamOnlinePayload } from './helpers'

describe('POST /twitch/eventsub', () => {
  describe('署名の検証', () => {
    it('署名が一致しなければ403を返す', async () => {
      const res = await postEventSub({
        messageType: 'notification',
        payload: streamOnlinePayload(),
        signature: `sha256=${'0'.repeat(64)}`,
      })
      expect(res.status).toBe(403)
    })

    it('署名の形式が不正なら403を返す', async () => {
      const res = await postEventSub({
        messageType: 'notification',
        payload: streamOnlinePayload(),
        signature: 'not-a-signature',
      })
      expect(res.status).toBe(403)
    })

    it('署名ヘッダーがなければ403を返す', async () => {
      const res = await postEventSub({
        messageType: 'notification',
        payload: streamOnlinePayload(),
        signature: null,
      })
      expect(res.status).toBe(403)
    })
  })

  describe('Message-Type による分岐', () => {
    it('webhook_callback_verification には challenge をそのまま text/plain で返す', async () => {
      const res = await postEventSub({
        messageType: 'webhook_callback_verification',
        payload: {
          challenge: 'pogchamp-kappa-360noscope-vohiyo',
          subscription: { id: 'sub-1', type: 'stream.online', version: '1' },
        },
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('Content-Type')).toContain('text/plain')
      expect(await res.text()).toBe('pogchamp-kappa-360noscope-vohiyo')
    })

    it('notification には204を返す', async () => {
      const res = await postEventSub({
        messageType: 'notification',
        payload: streamOnlinePayload(),
      })
      expect(res.status).toBe(204)
      expect(await res.text()).toBe('')
    })

    it('revocation には204を返す', async () => {
      const res = await postEventSub({
        messageType: 'revocation',
        payload: {
          subscription: {
            id: 'sub-1',
            type: 'stream.online',
            version: '1',
            status: 'authorization_revoked',
          },
        },
      })
      expect(res.status).toBe(204)
    })
  })

  it('他のパスやメソッドには応答しない', async () => {
    expect((await app.request('/twitch/eventsub')).status).toBe(404)
    expect((await app.request('/', { method: 'POST' })).status).toBe(404)
  })
})
