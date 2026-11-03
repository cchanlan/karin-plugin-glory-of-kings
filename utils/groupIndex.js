import path from 'node:path';
import { getAllBot, logger } from 'node-karin';
import { readYamlFile, writeYamlFile } from './yamlUtils.js';
import { PluginData } from '#components';
import { getMemberMap } from './groupNick.js';
const INDEX_FILE = path.join(PluginData, 'GroupIndex.yaml');
let index = null;
function cleanId(value) {
  const text = String(value ?? '').trim();
  return text || '';
}
function readCurrentBindings() {
  const userData = readYamlFile(path.join(PluginData, 'UserData.yaml')) || {};
  const map = new Map();
  for (const [qq, info] of Object.entries(userData)) {
    const ids = info?.ids;
    if (!Array.isArray(ids)) continue;
    const current = Number(info?.current ?? 0);
    const campId = cleanId(ids[current]);
    // 纯数字才算：UserData 里有非数字脏数据（有人把自己的用户名当营地号存过），
    // 那种号发到营地接口只会报错，不能进索引
    if (!campId || !/^\d+$/.test(campId)) continue;
    map.set(cleanId(qq), campId);
  }
  return map;
}
export function membersOfGroup(groupId) {
  const gid = cleanId(groupId);
  if (!gid) return [];
  const entry = getGroupIndex().groups?.[gid];
  return Array.isArray(entry?.members) ? entry.members : [];
}
export function groupsOfMember(qq) {
  const uid = cleanId(qq);
  if (!uid) return [];
  const {
    groups
  } = getGroupIndex();
  const out = [];
  for (const [gid, entry] of Object.entries(groups || {})) {
    if (Array.isArray(entry?.members) && entry.members.includes(uid)) out.push(gid);
  }
  return out;
}
export function isIndexReady() {
  return Object.keys(getGroupIndex().groups || {}).length > 0;
}
export function resetGroupIndexCache() {
  index = null;
}
export function getGroupIndex() {
  if (index) return index;
  try {
    const saved = readYamlFile(INDEX_FILE);
    if (saved?.groups && typeof saved.groups === 'object') return index = saved;
  } catch {/* 无缓存时不凭空判断退群 */}
  return {
    updatedAt: 0,
    groups: {}
  };
}
export async function refreshGroupIndex(bot = null) {
  const bindings = readCurrentBindings();
  const previous = getGroupIndex();
  const groups = {
    ...previous.groups
  };
  let scanned = 0;
  for (const current of bot ? [bot] : getAllBot()) {
    if (/^(console|mock|sandbox)/i.test(String(current.selfId))) continue;
    let list;
    try {
      list = await current.getGroupList();
    } catch {
      continue;
    }
    for (const group of list || []) {
      const gid = String(group.groupId);
      const members = await getMemberMap(gid, current);
      if (!members?.size) continue;
      groups[gid] = {
        name: group.name || '',
        members: [...members.keys()].filter(id => bindings.has(id)).sort()
      };
      scanned++;
    }
  }
  if (!scanned) return {
    ok: false,
    groups: 0,
    members: 0,
    reason: 'no-member-list'
  };
  index = {
    updatedAt: Date.now(),
    groups
  };
  try {
    writeYamlFile(INDEX_FILE, index);
  } catch (error) {
    logger.debug('[王者索引] 落盘失败：' + error.message);
  }
  return {
    ok: true,
    groups: scanned,
    members: Object.values(groups).reduce((sum, group) => sum + group.members.length, 0)
  };
}
export async function detectLeftGroups(entries) {
  const gone = {},
    lists = new Map();
  let known = false;
  for (const {
    qq,
    groups
  } of entries || []) {
    for (const groupId of groups || []) {
      const gid = String(groupId);
      if (!lists.has(gid)) lists.set(gid, await getMemberMap(gid));
      const members = lists.get(gid);
      if (!members?.size) continue;
      known = true;
      if (!members.has(String(qq))) (gone[String(qq)] ||= []).push(gid);
    }
  }
  return {
    ok: known,
    gone,
    reason: known ? undefined : 'no-member-list'
  };
}
