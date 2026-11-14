import { buildMessage, pickEmoji, sendDiscordMessage } from './discord'
import type { Bindings } from './env'

/** 再通知を抑える時間(秒)。KVの仕様上、最短60秒 */
export const COOLDOWN_SEC = 600

/** 処理済みの Message-Id を覚えておく時間(秒) */
const MESSAGE_ID_TTL_SEC = 3600

/** `stream.online` の event のうち、通知に使う項目 */
export type StreamOnlineEvent = {
  broadcaster_user_id: string
  broadcaster_user_login: string
}

/**
 * キーがまだなければ有効期限付きで置いて true を返す。すでにあれば false を返す。
 *
 * KVは書き込みが全体に反映されるまで時間がかかることがあるため、
 * ほぼ同時に届いた重複はすり抜ける可能性がある(この用途では許容する)。
 */
async function claim(kv: KVNamespace, key: string, ttlSec: number): Promise<boolean> {
  if ((await kv.get(key)) !== null) return false
  await kv.put(key, '1', { expirationTtl: ttlSec })
  return true
}

/** 配信開始を Discord に通知する。重複した通知は送らない */
export async function notifyStreamOnline(
  env: Bindings,
  messageId: string,
  event: StreamOnlineEvent,
): Promise<void> {
  // Twitchが再送した同じ通知を二重に処理しない
  if (!(await claim(env.NOTIFY_KV, `msg:${messageId}`, MESSAGE_ID_TTL_SEC))) return

  // 回線の切断・再接続による短時間での再通知をしない
  if (!(await claim(env.NOTIFY_KV, `cooldown:${event.broadcaster_user_id}`, COOLDOWN_SEC))) return

  const message = buildMessage(event.broadcaster_user_login, pickEmoji())
  await sendDiscordMessage(env.DISCORD_WEBHOOK_URL, message)
}
