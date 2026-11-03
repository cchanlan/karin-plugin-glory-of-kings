import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { segment } from 'node-karin';
export function resourceUrl(value) {
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return 'base64://' + Buffer.from(value).toString('base64');
  const text = String(value || '');
  if (/^(?:https?|file|base64):\/\//i.test(text)) return text;
  if (text.startsWith('data:')) return 'base64://' + text.slice(text.indexOf(',') + 1);
  return pathToFileURL(path.resolve(text)).href;
}
export async function sendForward(e, title, messages) {
  const nodes = messages.map(message => ({
    userId: e.selfId,
    nickname: e.bot.selfName || '王者插件',
    message: (Array.isArray(message) ? message : [message]).map(item => typeof item === 'string' ? segment.text(item) : item)
  }));
  return e.bot.sendForwardMsg(e.contact, nodes, {
    title
  });
}

/** 仅好友/私信会话，群和群临时会话均不发送账号数据。 */
export function isPrivateEvent(e) {
  return Boolean(e.isPrivate || e.isFriend || e.isDirect) && !e.isGroup && !e.isGuild && !e.isGroupTemp;
}
