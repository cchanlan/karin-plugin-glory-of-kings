import { isRealBot } from './botAccount.js';
import { getAllBot, getBot, sendMsg, contactGroup, logger } from 'node-karin';

/** 查到的是 Karin 原生 Bot，不制造 pickGroup/pickMember 门面。 */
export async function resolveGroupBot(groupId, preferred = null) {
  if (preferred && typeof preferred.getGroupMemberList === 'function') return preferred;
  const gid = String(groupId || '');
  if (!gid) return null;
  for (const bot of getAllBot()) {
    if (!isRealBot(bot)) continue;
    try {
      if ((await bot.getGroupList()).some(group => String(group.groupId) === gid)) return bot;
    } catch (error) {
      logger.debug('[王者] 获取群列表失败：' + error.message);
    }
  }
  return null;
}
export async function sendGroup(groupId, message, bot = null) {
  const target = await resolveGroupBot(groupId, bot);
  if (!target) return false;
  return sendMsg(target.selfId, contactGroup(String(groupId)), message);
}
export async function resolveMemberName(bot, groupId, userId, fallback = '召唤师') {
  const uid = String(userId || '');
  if (!uid) return fallback;
  const target = bot || (groupId ? await resolveGroupBot(groupId) : null);
  // 官机接口可能只返回 OpenID 占位，不能把它当成昵称。
  const nameOf = (...names) => names.map(name => String(name || '').trim()).find(name => name && name !== uid);
  if (groupId) {
    try {
      const member = await target?.getGroupMemberInfo(String(groupId), uid);
      const name = nameOf(member?.card, member?.nick);
      if (name) return name;
    } catch (error) {
      logger.debug('[王者] 获取群成员昵称失败：' + error.message);
    }
  }
  try {
    // Karin 1.17+ 的标准用户资料接口是 getStrangerInfo，没有 getFriendInfo。
    const user = await target?.getStrangerInfo(uid);
    const name = nameOf(user?.nick);
    if (name) return name;
  } catch (error) {
    logger.debug('[王者] 获取用户昵称失败：' + error.message);
  }
  return nameOf(fallback) || '召唤师';
}
export function registeredBot(selfId) {
  try {
    return getBot(String(selfId));
  } catch {
    return null;
  }
}
