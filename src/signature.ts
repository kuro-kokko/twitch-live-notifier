const encoder = new TextEncoder()

/** `sha256=<64桁のhex>` 形式 */
const SIGNATURE_PATTERN = /^sha256=([0-9a-f]{64})$/i

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/**
 * Twitch EventSub の署名を検証する。
 * `HMAC-SHA256(secret, messageId + timestamp + body)` が署名ヘッダーと一致すれば true。
 * 署名の形式が不正な場合も false を返す。
 */
export async function verifyTwitchSignature(
  secret: string,
  messageId: string,
  timestamp: string,
  body: string,
  signatureHeader: string,
): Promise<boolean> {
  const match = SIGNATURE_PATTERN.exec(signatureHeader)
  if (!match) return false

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  return crypto.subtle.verify(
    'HMAC',
    key,
    hexToBytes(match[1]),
    encoder.encode(messageId + timestamp + body),
  )
}
