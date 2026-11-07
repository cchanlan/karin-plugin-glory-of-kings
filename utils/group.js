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

/**
 * 私聊签到报告失败时，随机选一个能确认号主在场的共同群。
 * 只使用 Karin 1.17+ 原生接口，不依赖云崽 gl/gml 或旧的落盘群索引。
 * 本分支仅在 Linux 下用原生接口桩验证，未接真实 Karin/QQ 或 Windows 宿主。
 */
export async function randomCommonGroup(userId, preferred = null) {
  const uid = String(userId ?? '').trim();
  if (!uid) return null;
  const bots = (preferred ? [preferred] : getAllBot()).filter(isRealBot);
  const candidates = [];
  const seen = new Set();
  for (const bot of bots) {
    if (typeof bot.getGroupList !== 'function' || typeof bot.getGroupMemberList !== 'function') continue;
    try {
      const groups = await bot.getGroupList();
      if (!Array.isArray(groups)) continue;
      for (const group of groups) {
        const groupId = String(group?.groupId ?? '').trim();
        const key = String(bot.selfId) + ':' + groupId;
        if (!groupId || group?.guild || seen.has(key)) continue;
        seen.add(key);
        candidates.push({ bot, groupId });
      }
    } catch (error) {
      logger.warn(`[签到回报] 获取群列表失败：${error?.message || error}`);
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const { bot, groupId } of candidates) {
    try {
      // refresh=true：共同群关系由当前成员表确认，不拿旧缓存认已经退群的人。
      const members = await bot.getGroupMemberList(groupId, true);
      if (!Array.isArray(members) || !members.some(member => String(member?.userId ?? '') === uid)) continue;
      return { groupId, botId: String(bot.selfId) };
    } catch (error) {
      logger.debug(`[签到回报] 查询共同群 ${groupId} 失败：${error?.message || error}`);
    }
  }
  return null;
}
