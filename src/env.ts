/** Workers のバインディングとシークレット */
export type Bindings = {
  /** 重複防止用の KV namespace */
  NOTIFY_KV: KVNamespace
  /** EventSub 購読時に指定した secret */
  TWITCH_SECRET: string
  /** 通知先チャンネルの Discord Webhook URL */
  DISCORD_WEBHOOK_URL: string
}
