import { buildMessage, pickEmoji, sendDiscordMessage } from './discord'
import type { Bindings } from './env'

/** `stream.online` の event のうち、通知に使う項目 */
export type StreamOnlineEvent = {
  broadcaster_user_id: string
  broadcaster_user_login: string
}

/** 配信開始を Discord に通知する */
export async function notifyStreamOnline(env: Bindings, event: StreamOnlineEvent): Promise<void> {
  const message = buildMessage(event.broadcaster_user_login, pickEmoji())
  await sendDiscordMessage(env.DISCORD_WEBHOOK_URL, message)
}
