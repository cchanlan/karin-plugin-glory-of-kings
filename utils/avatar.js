import { logger } from 'node-karin';
import { resolveGroupBot } from './group.js';
const QQ_NUMBER = /^\d{5,12}$/;
export function isQQNumber(id) {
  return QQ_NUMBER.test(String(id ?? '').trim());
}
export function qlogoUrl(userId, size = 100) {
  return isQQNumber(userId) ? `https://q1.qlogo.cn/g?b=qq&s=${size}&nk=${userId}` : '';
}
export function groupQlogoUrl(groupId, size = 100) {
  const gid = String(groupId ?? '').trim();
  return isQQNumber(gid) ? `https://p.qlogo.cn/gh/${gid}/${gid}/${size}` : '';
}
export async function getGroupAvatar(groupId, bot = null, size = 100) {
  try {
    const target = await resolveGroupBot(groupId, bot);
    const url = await target?.getGroupAvatarUrl(String(groupId), [0, 40, 100, 140].includes(size) ? size : 0);
    if (url) return url;
  } catch (error) {
    logger.debug('[头像] 获取群头像失败：' + error.message);
  }
  return groupQlogoUrl(groupId, size);
}
export async function getUserAvatar(e, userId, size = 100) {
  try {
    const url = await e.bot.getAvatarUrl(String(userId), [0, 40, 100, 140].includes(size) ? size : 0);
    if (url) return url;
  } catch (error) {
    logger.debug('[头像] 获取用户头像失败：' + error.message);
  }
  return (String(e.userId) === String(userId) ? e.sender?.avatar : '') || qlogoUrl(userId, size);
}
