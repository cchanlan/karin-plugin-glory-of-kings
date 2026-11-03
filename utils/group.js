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
  try {
    const target = await resolveGroupBot(groupId, bot);
    const member = await target?.getGroupMemberInfo(String(groupId), String(userId));
    return String(member?.card || member?.nick || fallback);
  } catch (error) {
    logger.debug('[王者] 获取群成员昵称失败：' + error.message);
    return fallback;
  }
}
export function registeredBot(selfId) {
  try {
    return getBot(String(selfId));
  } catch {
    return null;
  }
}
