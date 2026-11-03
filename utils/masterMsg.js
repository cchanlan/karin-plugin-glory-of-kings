import { config, logger } from 'node-karin';
import { Config } from '#components';
import { sendPrivate } from './privateMsg.js';
import { FAKE_ACCOUNT } from './botAccount.js';
export { FAKE_ACCOUNT } from './botAccount.js';
export function listMasterQQ() {
  return [...new Set(config.master().map(String).filter(id => id && !FAKE_ACCOUNT.test(id)))];
}
function pickedTargets() {
  try {
    const raw = Config.getDefOrConfig('config')?.masterNotify;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return list.map(i => String(i ?? '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}
export function resolveMasterTargets() {
  const masters = listMasterQQ();
  if (!masters.length) return [];
  const picked = pickedTargets();
  if (picked.length) {
    // 只发勾中的（按主人列表顺序；勾了但已不在列表里的自然被过滤掉）
    const hit = masters.filter(id => picked.includes(id));
    if (hit.length) return hit;
    logger?.warn?.(`[王者插件] 主人通知收件人里勾的（${picked.join(',')}）都不在主人列表里，本次改发给第一个主人`);
  }
  return [masters[0]];
}
export async function sendMaster(message) {
  const results = await Promise.all(resolveMasterTargets().map(id => sendPrivate(id, message)));
  return results.some(result => result.ok);
}
