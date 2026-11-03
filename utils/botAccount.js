/** 调试账号不参与业务消息发送；判据集中维护。 */
export const FAKE_ACCOUNT = /^(stdin|console|mock|sandbox)/i;
export function isRealBot(bot) {
  return Boolean(bot?.selfId) && !FAKE_ACCOUNT.test(String(bot.selfId));
}
