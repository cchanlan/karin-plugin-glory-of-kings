/**
 * 王者插件黑名单：指令与定时推送、群报、排行榜都使用同一份名单。
 * 默认跟随 Karin 全局用户黑名单；订阅数据保留，移出名单后恢复。
 * 指令入口直接检查 isBlockedEvent，不包装事件或插件原型。
 */
import { config as karinConfig } from 'node-karin';
import { Config } from '#components';

/** config.yaml 里存名单的字段 */
const FIELD = 'blackList';
/** config.yaml 里「是否跟随宿主全局黑名单」的开关字段 */
const FOLLOW_FIELD = 'blackListFollowGlobal';

/** ID 一律按字符串比对：官方 Bot 的 user_id 是 appid:openid 形态，不是纯数字 */
const normalize = id => String(id ?? '').trim();
function readCfg() {
  try {
    return Config.getDefOrConfig('config') || {};
  } catch {
    return {};
  }
}

/** 插件自己的黑名单，去重后的字符串数组 */
export function getBlackList() {
  const raw = readCfg()[FIELD];
  const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return [...new Set(arr.map(normalize).filter(Boolean))];
}

/** 是否跟随宿主全局黑名单，缺配置按开着算 */
export function followGlobalBlack() {
  return readCfg()[FOLLOW_FIELD] !== false;
}

/** Karin 原生配置 API 已缓存并监听变化，不另读宿主文件。 */
export function getHostBlackList() {
  try {
    const raw = karinConfig.config()?.user?.disable_list;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return [...new Set(list.map(normalize).filter(Boolean))];
  } catch {
    return [];
  }
}

/**
 * 这个 QQ 是不是被拉黑了。指令和推送两条路都用它。
 * @param {string|number} userId QQ 号（或官方 Bot 的 appid:openid）
 * @returns {boolean}
 */
export function isBlackUser(userId) {
  const id = normalize(userId);
  if (!id) return false;
  if (getBlackList().includes(id)) return true;
  return followGlobalBlack() && getHostBlackList().includes(id);
}

/**
 * 这条消息该不该被无视。
 * 主人永远放行：不然主人一旦被写进（或误写进）名单，连 #王者取消拉黑 都发不出来，
 * 只能去手改配置文件。
 * @param {object} e 消息事件
 * @returns {boolean}
 */
export function isBlockedEvent(e) {
  if (!e) return false;
  if (e.isMaster) return false;
  return isBlackUser(e.userId);
}

/**
 * 加入黑名单。
 * @returns {'ok'|'exists'|'invalid'}
 */
export function addBlackUser(userId) {
  const id = normalize(userId);
  if (!id) return 'invalid';
  const list = getBlackList();
  if (list.includes(id)) return 'exists';
  Config.modify('config', FIELD, [...list, id]);
  return 'ok';
}

/**
 * 移出黑名单。只动插件自己那份名单，宿主的全局名单不碰
 * （那是别的功能在用的，插件无权替用户改）。
 * @returns {'ok'|'absent'|'invalid'}
 */
export function removeBlackUser(userId) {
  const id = normalize(userId);
  if (!id) return 'invalid';
  const list = getBlackList();
  if (!list.includes(id)) return 'absent';
  Config.modify('config', FIELD, list.filter(item => item !== id));
  return 'ok';
}
