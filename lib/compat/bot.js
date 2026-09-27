/**
 * `Bot` 门面：把云崽（Yunzai）的全局 `Bot` 补成插件依赖的样子。
 *
 * ## 为什么需要它
 *
 * 插件里有 42 处 `Bot.xxx`，全是不 import 直接用全局的（云崽把 `Bot` 挂在
 * `globalThis` 上）。karin 里等价物分散在 `karin`（账号遍历/联系人构造）和
 * 各适配器实例上，字段名也都不一样。逐个改业务代码要动十几处、还容易漏，
 * 所以这里造一个门面挂在 `globalThis.Bot` 上。
 *
 * ## 与 karin 原生 `Bot` 的关系
 *
 * karin 自己**也导出一个叫 `Bot` 的东西**（`node-karin` 的 `Bot` 就是 `karin`，
 * 是个 EventEmitter，见 `dist/index.d.ts` 里的 `declare const Bot`）。那是模块级
 * 导出，不是全局；插件里裸写的 `Bot` 在 karin 下会直接 `ReferenceError`。
 * 所以这里挂全局**不会**覆盖任何东西 —— 但为了将来兼容，门面会把 karin 的
 * `karin` 对象上的方法转发过去（见 Proxy 那段），保证 `Bot.on(...)` 这类
 * 事件订阅写法也能用。
 *
 * ## 云崽字段 → karin 的映射
 *
 * | 云崽 | karin | 说明 |
 * |---|---|---|
 * | `Bot.uin` | `karin.getBotAll()[0].selfId` | 当前机器人 QQ |
 * | `Bot.gl` | `Map<groupId, GroupInfo>` | 群列表（云崽是 Map） |
 * | `Bot.gml` | `Map<groupId, Map<userId, member>>` | 群成员缓存 |
 * | `Bot.pickGroup(id)` | 包出来的群门面 | 见 makeGroup |
 * | `Bot.pickFriend(id)` | 包出来的好友门面 | 见 makeFriend |
 * | `Bot.sendMasterMsg(msg, uin, retry)` | 逐个主人私聊 | karin 没有这个 API |
 * | `Bot[uin]` | 同 pickGroup 的宿主 | 云崽按 uin 索引 bot |
 */

import { karin, segment as karinSegment, logger } from 'node-karin'
import { toKarinElements } from './segment.js'

/** 把 ID 规整成 karin 要的字符串；空值给空串 */
const sid = (v) => String(v ?? '').trim()

/** 取全部已连接的 bot 实例 */
function allBots () {
  try {
    return karin.getBotAll() || []
  } catch {
    return []
  }
}

/** 取「当前」bot：优先事件上带的，否则第一个已连接的 */
export function currentBot (e) {
  if (e?.bot) return e.bot
  const list = allBots()
  return list[0] || null
}

/**
 * 群门面。云崽那边 `e.group` / `Bot.pickGroup()` 拿到的是适配器的群对象，
 * 插件实际用到的方法见 utils/adapter.js 和 utils/groupIndex.js：
 * `pickMember` / `getMemberMap` / `recallMsg` / `getMsg` / `name` / `getInfo`。
 */
function makeGroup (groupId, bot = null) {
  const gid = sid(groupId)
  const host = bot || currentBot()

  const facade = {
    get group_id () { return gid },
    get name () { return facade.__name || '' },
    __name: '',

    async getInfo () {
      try {
        const info = await host.getGroupInfo(gid)
        if (info?.groupName) facade.__name = info.groupName
        return info
      } catch (error) {
        logger.debug(`[王者] 取群信息失败 ${gid}: ${error?.message || error}`)
        return null
      }
    },

    /** 云崽的群名挂在 `group.name` 上；karin 要额外请求，这里做一次缓存 */
    async fetchName () {
      if (facade.__name) return facade.__name
      await facade.getInfo()
      return facade.__name
    },

    /** 云崽返回 Map<qq, 成员>，成员上带 nickname/card */
    async getMemberMap () {
      try {
        const list = await host.getGroupMemberList(gid)
        const map = new Map()
        for (const m of list || []) {
          const uid = sid(m.userId)
          map.set(uid, {
            ...m,
            user_id: uid,
            nickname: m.nick,
            card: m.card,
            is_owner: m.role === 'owner',
            is_admin: m.role === 'admin'
          })
        }
        return map
      } catch (error) {
        logger.debug(`[王者] 取群成员表失败 ${gid}: ${error?.message || error}`)
        return new Map()
      }
    },

    async pickMember (userId) {
      const uid = sid(userId)
      if (!uid) return null
      try {
        const info = await host.getGroupMemberInfo(gid, uid)
        if (!info) return null
        // 云崽成员对象上 `info` 是同步属性、`getInfo()` 是异步方法，两个都给上
        const normalized = {
          ...info,
          user_id: sid(info.userId),
          nickname: info.nick,
          card: info.card
        }
        return { ...normalized, info: normalized, getInfo: async () => normalized }
      } catch (error) {
        logger.debug(`[王者] 取群成员失败 ${gid}/${uid}: ${error?.message || error}`)
        return null
      }
    },

    async recallMsg (messageId) {
      return host.recallMsg({ scene: 'group', peer: gid, name: facade.__name }, sid(messageId))
    },

    async getMsg (messageId) {
      return host.getMsg({ scene: 'group', peer: gid, name: facade.__name }, sid(messageId))
    },

    async getChatHistory (seq, count = 1) {
      return host.getHistoryMsg({ scene: 'group', peer: gid, name: facade.__name }, Number(seq) || 0, count)
    },

    async sendMsg (msg, quote) {
      const contact = { scene: 'group', peer: gid, name: facade.__name }
      const elements = toKarinElements(msg)
      if (quote && typeof quote === 'string') elements.unshift({ type: 'reply', messageId: quote })
      const res = await host.sendMsg(contact, elements)
      return { ...res, message_id: res?.message_id ?? res?.messageId ?? '' }
    },

    /** 部分适配器有；没有就让调用方走 sendMsg */
    async sendFile (file, name) {
      const contact = { scene: 'group', peer: gid, name: facade.__name }
      const res = await host.sendMsg(contact, [karinSegment.file(`file://${file}`, { name })])
      return { ...res, message_id: res?.message_id ?? res?.messageId ?? '' }
    }
  }

  return facade
}

/** 好友门面 */
function makeFriend (userId, bot = null) {
  const uid = sid(userId)
  const host = bot || currentBot()

  const facade = {
    get user_id () { return uid },

    async getInfo () {
      // karin 没有 getFriendInfo，好友信息走 getStrangerInfo（对好友同样可用）
      try {
        return await host.getStrangerInfo(uid)
      } catch (error) {
        logger.debug(`[王者] 取好友信息失败 ${uid}: ${error?.message || error}`)
        return null
      }
    },

    async recallMsg (messageId) {
      return host.recallMsg({ scene: 'friend', peer: uid, name: '' }, sid(messageId))
    },

    async getMsg (messageId) {
      return host.getMsg({ scene: 'friend', peer: uid, name: '' }, sid(messageId))
    },

    async getChatHistory (seq, count = 1) {
      return host.getHistoryMsg({ scene: 'friend', peer: uid, name: '' }, Number(seq) || 0, count)
    },

    async sendMsg (msg, quote) {
      const contact = { scene: 'friend', peer: uid, name: '' }
      const elements = toKarinElements(msg)
      if (quote && typeof quote === 'string') elements.unshift({ type: 'reply', messageId: quote })
      const res = await host.sendMsg(contact, elements)
      return { ...res, message_id: res?.message_id ?? res?.messageId ?? '' }
    },

    async sendFile (file, name) {
      const contact = { scene: 'friend', peer: uid, name: '' }
      const res = await host.sendMsg(contact, [karinSegment.file(`file://${file}`, { name })])
      return { ...res, message_id: res?.message_id ?? res?.messageId ?? '' }
    }
  }

  return facade
}

/**
 * 群列表 / 群成员缓存，模拟云崽的 `Bot.gl` 与 `Bot.gml`。
 *
 * ⚠️ 两者**必须是 Map**：`utils/groupIndex.js` 直接 `groupMap.size`、
 * `groupMap[Symbol.iterator]`、`host.gml?.get?.(groupId)`。换成普通对象会在
 * `.size` 那一步静默拿到 undefined，于是「群列表为空」→ 索引不刷新 →
 * `#谁在打游戏` 报「本群没人」。
 *
 * 数据是**懒加载**的：云崽的 gml 是适配器随消息实时维护的缓存，karin 没有等价的
 * 东西，所以这里按需请求 karin 的 getGroupList / getGroupMemberList 并做短时缓存。
 * 缓存 TTL 取 60 秒 —— 索引重建本身就有节流，够用且不会打爆适配器。
 */
const GL_TTL = 60 * 1000
let glCache = { at: 0, data: new Map() }
const gmlCache = new Map() // groupId -> { at, data }

function buildGl (bot) {
  const now = Date.now()
  if (now - glCache.at < GL_TTL && glCache.data.size) return glCache.data

  const host = bot || currentBot()
  if (!host) return glCache.data

  // karin 的 getGroupList 是异步的，而云崽的 Bot.gl 是同步属性。
  // 门面用「上次请求的结果」顶上，首次调用返回空 Map 并触发一次后台刷新。
  if (!glCache.loading) {
    glCache.loading = true
    Promise.resolve()
      .then(() => host.getGroupList?.())
      .then(list => {
        const map = new Map()
        for (const g of list || []) {
          map.set(sid(g.groupId), { ...g, group_id: sid(g.groupId), group_name: g.groupName })
        }
        glCache = { at: Date.now(), data: map, loading: false }
      })
      .catch(error => {
        logger.debug(`[王者] 取群列表失败: ${error?.message || error}`)
        glCache.loading = false
      })
  }

  return glCache.data
}

function buildGml (groupId) {
  const gid = sid(groupId)
  const hit = gmlCache.get(gid)
  const now = Date.now()
  if (hit && now - hit.at < GL_TTL) return hit.data
  if (hit?.loading) return hit.data

  const host = currentBot()
  if (!host) return new Map()

  const entry = { at: hit?.at || 0, data: hit?.data || new Map(), loading: true }
  gmlCache.set(gid, entry)

  Promise.resolve()
    .then(() => host.getGroupMemberList?.(gid))
    .then(list => {
      const map = new Map()
      for (const m of list || []) {
        const uid = sid(m.userId)
        map.set(uid, { ...m, user_id: uid, nickname: m.nick, card: m.card })
      }
      gmlCache.set(gid, { at: Date.now(), data: map, loading: false })
    })
    .catch(error => {
      logger.debug(`[王者] 取群 ${gid} 成员表失败: ${error?.message || error}`)
      gmlCache.set(gid, { at: entry.at, data: entry.data, loading: false })
    })

  return entry.data
}

/**
 * 构造 `globalThis.Bot`。
 *
 * 除了上面那些云崽字段，还把 karin 的 `karin` 对象整个转发过来 —— 这样
 * `Bot.on('message', ...)`、`Bot.getBotAll()` 这类 karin 原生写法也不会挂。
 * 用 Proxy 而不是 `Object.assign`：karin 的方法挂在原型链上，assign 抓不到。
 */
export function installBotGlobal () {
  if (globalThis.Bot && globalThis.Bot.__gokCompat) return globalThis.Bot

  const facade = {
    __gokCompat: true,

    /** 当前机器人 QQ。云崽是 `Bot.uin`，多账号时是数组 */
    get uin () {
      const list = allBots()
      return list.length > 1 ? list.map(b => b.selfId) : (list[0]?.selfId || '')
    },

    /** 全部账号 id */
    get uins () {
      return allBots().map(b => b.selfId)
    },

    /** 云崽的群列表 Map */
    get gl () {
      return buildGl()
    },

    /** 云崽的群成员缓存 Map<groupId, Map<userId, member>> */
    get gml () {
      const outer = new Map()
      for (const gid of buildGl().keys()) outer.set(gid, buildGml(gid))
      return outer
    },

    pickGroup (groupId, bot = null) {
      const gid = sid(groupId)
      if (!gid) return null
      return makeGroup(gid, bot)
    },

    pickFriend (userId, bot = null) {
      const uid = sid(userId)
      if (!uid) return null
      return makeFriend(uid, bot)
    },

    pickMember (groupId, userId, bot = null) {
      return makeGroup(groupId, bot).pickMember(userId)
    },

    /**
     * 私聊主人。云崽签名 `(msg, uin, retry)`，返回值是
     * `{ [botId]: { [userId]: Promise } }` —— 插件里（utils/masterMsg.js）
     * 会把这两层值都 allSettled 一遍来判断「有没有人真收到」，所以**必须返回
     * 真 promise**，不能返回 undefined。
     */
    async sendMasterMsg (msg, uin, retryCount = 0) {
      const masters = (() => {
        try {
          return karin.master?.() || []
        } catch {
          return []
        }
      })()
      if (!masters.length) return {}

      const out = {}
      for (const bot of allBots()) {
        const botId = bot.selfId
        out[botId] = {}
        for (const uid of masters) {
          out[botId][uid] = bot.sendMsg(
            { scene: 'friend', peer: sid(uid), name: '' },
            toKarinElements(msg),
            retryCount
          ).catch(error => {
            logger.debug(`[王者] 私聊主人 ${uid} 失败: ${error?.message || error}`)
            return null
          })
        }
      }
      return out
    },

    /** 取某个账号的 bot 实例（云崽按 uin 索引） */
    getBot (uin) {
      const id = sid(uin)
      return allBots().find(b => sid(b.selfId) === id) || null
    }
  }

  // 用 Proxy 转发 karin 原生的东西（on / getBotAll / …），门面自己有的优先
  const proxy = new Proxy(facade, {
    get (target, prop) {
      if (prop in target) return Reflect.get(target, prop)
      const value = karin[prop]
      return typeof value === 'function' ? value.bind(karin) : value
    },
    has (target, prop) {
      return prop in target || prop in karin
    }
  })

  globalThis.Bot = proxy
  return proxy
}

export { makeGroup, makeFriend }
export default installBotGlobal
