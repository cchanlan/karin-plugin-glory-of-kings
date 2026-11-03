import { isRealBot } from './botAccount.js';
import { getAllBot, sendMsg, contactFriend, contactGroupTemp, logger } from 'node-karin';

/** 仅凭原生发送回执确认；私信失败绝不改发群消息。 */
export async function sendPrivate(userId, message, {
  bot,
  groupId
} = {}) {
  const target = String(userId || '').trim();
  if (!target) return {
    ok: false,
    reason: 'no_target'
  };
  const bots = bot ? [bot] : getAllBot().filter(isRealBot);
  let reason = 'no_bot';
  for (const current of bots) {
    const contacts = [contactFriend(target)];
    if (groupId) contacts.push(contactGroupTemp(String(groupId), target));
    for (const contact of contacts) {
      try {
        const result = await sendMsg(current.selfId, contact, message);
        if (result?.messageId) return {
          ok: true,
          via: contact.scene,
          messageId: result.messageId
        };
        reason = 'unconfirmed_receipt';
      } catch (error) {
        reason = error.message;
      }
    }
  }
  logger.debug('[王者] 私信未送达：' + reason);
  return {
    ok: false,
    reason
  };
}
