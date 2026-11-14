const encoder = new TextEncoder()

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
