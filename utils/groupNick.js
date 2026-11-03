import { logger } from 'node-karin';
import { cleanName } from './rankStore.js';
import { resolveGroupBot } from './group.js';
const CACHE_TTL_MS = 30000;
const cache = new Map();
export async function getMemberMap(groupId, bot = null) {
  try {
    const target = await resolveGroupBot(groupId, bot);
    const list = await target?.getGroupMemberList(String(groupId));
    if (!Array.isArray(list) || !list.length) return null;
    return new Map(list.map(member => [String(member.userId), member]));
  } catch (error) {
    logger.debug('[群名片] 获取成员表失败：' + error.message);
    return null;
  }
}
export async function getNickMap(groupId, bot = null) {
  const key = String(bot?.selfId || '') + ':' + String(groupId || '');
  if (!groupId) return null;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.nicks;
  const members = await getMemberMap(groupId, bot);
  if (!members) return null;
  const nicks = new Map();
  for (const [userId, member] of members) {
    const name = cleanName(member.card) || cleanName(member.nick);
    if (name) nicks.set(userId, name);
  }
  cache.set(key, {
    at: Date.now(),
    nicks
  });
  return nicks;
}
export function nickOf(nickMap, qq) {
  return nickMap?.get?.(String(qq)) || '';
}
export function withGroupNick(name, nick, max = 6) {
  const base = String(name || '').trim();
  const label = String(nick || '').trim();
  if (!base || !label || label === base) return base;
  const chars = [...label];
  return `${base}（${chars.length > max ? `${chars.slice(0, max).join('')}…` : label}）`;
}
export function clearNickCache() {
  cache.clear();
}
