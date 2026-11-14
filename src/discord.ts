/**
 * 通知に使う絵文字の候補。毎回この中からランダムに1つ選ぶ。
 *
 * - カスタム絵文字: `<:名前:ID>`
 * - アニメ絵文字:   `<a:名前:ID>`
 * - 通常の絵文字:   そのまま(例: `🎉`)
 *
 * カスタム絵文字のIDは、Discordで `\:絵文字名:` と送信すると確認できる。
 * 絵文字を作り直すとIDが変わるため、その場合はこのリストも更新する。
 */
export const EMOJIS: readonly string[] = [
  '🎉',
  '🔴',
  '📺',
  '🎮',
  '✨',
  // '<:emoji_name:123456789012345678>',
  // '<a:animated_emoji_name:123456789012345678>',
]

/** `EMOJIS` からランダムに1つ選ぶ */
export function pickEmoji(random: () => number = Math.random): string {
  return EMOJIS[Math.floor(random() * EMOJIS.length)]
}

/** 通知メッセージを組み立てる */
export function buildMessage(broadcasterLogin: string, emoji: string): string {
  return `配信開始しました ${emoji}\nhttps://twitch.tv/${broadcasterLogin}`
}

/** Discord Webhook にメッセージを投稿する */
export async function sendDiscordMessage(webhookUrl: string, content: string): Promise<void> {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    throw new Error(`Discord webhook responded with ${res.status}: ${await res.text()}`)
  }
}
