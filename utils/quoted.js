import { logger } from 'node-karin';
export async function readQuoted(e) {
  if (!e.replyId) return null;
  try {
    return flattenMsg(await e.bot.getMsg(e.contact, e.replyId)) || null;
  } catch (error) {
    logger.debug('[王者] 获取引用消息失败：' + error.message);
    return null;
  }
}
export function flattenMsg(message) {
  if (typeof message === 'string') return message;
  return (message?.elements || []).filter(item => item.type === 'text').map(item => item.text).join('');
}
export function quotedId(e) {
  return e.replyId || '';
}
