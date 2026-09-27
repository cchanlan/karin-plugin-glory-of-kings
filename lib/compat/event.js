/**
 * 事件适配：把 karin 的 Message 对象包装成云崽（Yunzai）插件期望的 `e`。
 *
 * ## ⚠️ 为什么是「包一层」而不是「就地打补丁」（本模块的核心决策）
 *
 * 最初的做法是在 karin 的 `e` 上 `Object.defineProperty` 直接替换 `e.reply`。
 * **实测行不通**：karin 的 `BaseEvent` 构造函数里用
 * `this.reply = async (elements, options) => {...}` 赋值，但随后被
 * `Object.defineProperty(this, 'reply', { writable: false, configurable: false })`
 * 锁死（`lock.prop` 那套）。实测描述符：
 *   `{ writable: false, configurable: false, enumerable: true }`
 * 于是 `defineProperty` 直接抛 `Cannot redefine property: reply`，
 * 被 try/catch 静默吞掉 → 补丁从未生效。
 *
 * **症状极隐蔽**：出图、按钮这些走原生 reply 的路径全都正常（因为原生 reply
 * 本身就能发段），只有**合并转发**这种「需要改走另一个 API」的路径失效 ——
 * 表现是适配器收到一条 `{title, messages}` 的「未知段」，转发整条丢失。
 *
 * 所以改成：**用 Proxy 包一层**，把 `reply` 换成云崽签名版，其余字段透传。
 * Proxy 只暴露给插件业务代码，karin 自己拿到的仍是原生事件对象。
 *
 * ## 用 Proxy 的代价与对策
 *
 * 1. **实例身份**：`e === this.e` 之类的判断会失效。全仓 grep 确认插件里没有
 *    这种比较（`this.e` 只在 `apps/update.js` 里赋值/读取，不做比较）。
 * 2. **getter 的 this**：karin 的 `e.user_id` / `e.at` 等都是 getter，直接透传
 *    会把 `this` 指向 Proxy，私有字段访问会炸。所以用 `Reflect.get(target, prop, target)`
 *    —— 第三个参数传**原始对象**，保证 getter 内部的 `this` 是对的。
 * 3. **方法绑定**：`e.bot.sendMsg(...)` 这类拿出去单独调用的方法要 bind 到原对象。
 * 4. **写操作**：插件里有一处 `e.msg = ...`（`apps/update.js`），要能写回去。
 */

import { toKarinElements } from './segment.js'
import { FORWARD_MARK } from './common.js'

/** 已包装过的事件（WeakMap：karin 的事件对象用完即弃，不会泄漏） */
const wrapped = new WeakMap()

/** 取发送者的显示名。云崽写 `e.sender.card || e.sender.nickname` */
function senderName (e) {
  const s = e.sender || {}
  return s.card || s.nick || s.name || String(e.userId || e.user_id || '')
}

/**
 * 云崽风格的 `e.reply(msg, quote, data)`。
 *
 * 三处差异：
 *   - 签名：云崽 `(msg, quote:boolean, data:{at,recallMsg})`
 *     vs karin `(elements, {at:boolean, reply:boolean, recallMsg:number})`
 *   - 合并转发：云崽 `e.reply(await common.makeForwardMsg(...))` 能直接发，
 *     karin 的 reply 不收转发节点 → 改走 `bot.sendForwardMsg`
 *   - 返回值：插件里有三处读 `reply()?.message_id`，karin 返回 `{messageId}` →
 *     两个字段都给上
 */
function makeReply (target) {
  // 原生 reply 被锁死了，只能从原型上取：`srcReply` 是内部字段拿不到，
  // 所以用原型上的那个（它就是构造函数里赋的同一个函数）
  const nativeReply = target.reply.bind(target)

  return async function reply (msg = '', quote = false, data = {}) {
    if (!msg) return false

    // 合并转发：改走 sendForwardMsg
    if (msg && typeof msg === 'object' && msg[FORWARD_MARK]) {
      return sendForward(target, msg)
    }

    const elements = toKarinElements(msg)
    if (!elements.length) return false

    const options = {}
    if (quote) options.reply = true
    // 云崽的 data.at 可以是 true（@发送者）或具体 QQ
    if (data.at) {
      const atTarget = data.at === true ? (target.userId || target.user_id) : String(data.at)
      elements.unshift({ type: 'at', targetId: String(atTarget) }, { type: 'text', text: ' ' })
    }
    if (data.recallMsg) options.recallMsg = Number(data.recallMsg) || 0
    if (data.retryCount) options.retryCount = Number(data.retryCount) || 0

    try {
      const res = await nativeReply(elements, options)
      if (!res || typeof res !== 'object') return res
      // 两种字段名都给上，读 message_id 的老代码和读 messageId 的新代码都能用
      return { ...res, message_id: res.message_id ?? res.messageId ?? '' }
    } catch (error) {
      // 云崽的 reply 失败是吞掉返回 false 的（loader 里包了 try），保持同样行为
      const { logger } = await import('node-karin')
      logger.error(`[王者插件] 回复消息失败：${error?.message || error}`)
      return false
    }
  }
}

/**
 * 发合并转发。内容里的每一段都要过一遍元素转换 —— 云崽的 makeForwardMsg
 * 收到的是原始内容（字符串 / 段对象混着），karin 的节点需要统一元素格式。
 */
async function sendForward (e, forward) {
  const { logger } = await import('node-karin')
  try {
    const nodes = forward.messages.map(m => ({
      message: toKarinElements(m),
      nickname: e.bot?.selfName || '王者插件',
      userId: String(e.selfId || e.self_id || '')
    }))
    const res = await e.bot.sendForwardMsg(
      e.contact,
      nodes,
      forward.title ? { title: forward.title } : undefined
    )
    return { ...res, message_id: res?.message_id ?? res?.messageId ?? '' }
  } catch (error) {
    logger.error(`[王者插件] 发合并转发失败：${error?.message || error}`)
    return false
  }
}

/**
 * 云崽风格的 `e.group` 门面。
 * 插件实际用到：`getMemberMap` / `pickMember` / `recallMsg` / `getMsg` /
 * `getChatHistory` / `sendMsg` / `name`。
 */
function makeGroupFacade (e) {
  const bot = e.bot
  const gid = String(e.groupId || e.group_id || '')
  const facade = {
    get group_id () { return gid },
    get name () { return e.contact?.name || '' },
    get info () { return null },

    /** 云崽返回 Map<qq, 成员>；karin 返回数组，转成 Map 并补齐云崽字段名 */
    async getMemberMap () {
      const list = await bot.getGroupMemberList(gid)
      const map = new Map()
      for (const m of list || []) {
        const uid = String(m.userId)
        map.set(uid, {
          ...m,
          user_id: uid,
          nickname: m.nick,
          is_owner: m.role === 'owner',
          is_admin: m.role === 'admin'
        })
      }
      return map
    },

    async getMemberList () {
      return (await bot.getGroupMemberList(gid)) || []
    },

    /** 取单个成员；云崽取不到返回 null（karin 是抛异常） */
    async pickMember (qq) {
      const uid = String(qq)
      if (!uid) return null
      try {
        const info = await bot.getGroupMemberInfo(gid, uid)
        if (!info) return null
        // 云崽成员对象上 `info` 是同步属性、`getInfo()` 是异步方法，两个都给上
        const normalized = { ...info, user_id: String(info.userId), nickname: info.nick, card: info.card }
        return { ...normalized, info: normalized, getInfo: async () => normalized }
      } catch {
        return null
      }
    },

    async recallMsg (messageId) {
      return bot.recallMsg(e.contact, String(messageId))
    },

    async getMsg (messageId) {
      return bot.getMsg(e.contact, String(messageId))
    },

    async getChatHistory (seq, count = 1) {
      return bot.getHistoryMsg(e.contact, Number(seq) || 0, count)
    },

    async sendMsg (msg) {
      const res = await bot.sendMsg(e.contact, toKarinElements(msg))
      return { ...res, message_id: res?.message_id ?? res?.messageId ?? '' }
    }
  }
  return facade
}

/** 好友场景的门面 */
function makeFriendFacade (e) {
  const bot = e.bot
  const uid = String(e.userId || e.user_id || '')
  return {
    get user_id () { return uid },
    async recallMsg (messageId) {
      return bot.recallMsg(e.contact, String(messageId))
    },
    async getMsg (messageId) {
      return bot.getMsg(e.contact, String(messageId))
    },
    async getChatHistory (seq, count = 1) {
      return bot.getHistoryMsg(e.contact, Number(seq) || 0, count)
    },
    async sendMsg (msg) {
      const res = await bot.sendMsg(e.contact, toKarinElements(msg))
      return { ...res, message_id: res?.message_id ?? res?.messageId ?? '' }
    }
  }
}

/**
 * 包装一个 karin 事件，返回云崽风格的 `e`。同一个原始事件重复调用返回同一个包装。
 *
 * @param {object} target karin 的 Message 实例
 * @returns {object} 云崽风格的事件对象（Proxy）
 */
export function adaptEvent (target) {
  if (!target) return target

  const cached = wrapped.get(target)
  if (cached) return cached

  const isGroup = !!target.isGroup
  const reply = makeReply(target)

  // 云崽特有、karin 没有的字段。做成惰性 getter 是为了避免不必要的请求
  // （比如 group 门面每次取都要重新建对象，但只有真用到时才建）。
  const extra = {}

  if (isGroup) {
    let groupFacade = null
    Object.defineProperty(extra, 'group', {
      get () { return (groupFacade ||= makeGroupFacade(target)) },
      configurable: true
    })
  } else {
    let friendFacade = null
    Object.defineProperty(extra, 'friend', {
      get () { return (friendFacade ||= makeFriendFacade(target)) },
      configurable: true
    })
  }

  Object.defineProperty(extra, 'group_name', {
    get () { return target.contact?.name || '' }, configurable: true
  })

  Object.defineProperty(extra, 'nickname', {
    get () { return senderName(target) }, configurable: true
  })

  /**
   * `e.atme`：云崽里「@ 的是机器人自己」。
   * ⚠️ karin 的 `e.at` 是**数组**（所有被 @ 的），云崽的 `e.at` 是单个 QQ。
   * 插件里的用法都是 `e.at && !e.atme` 取第一个被 @ 的人，所以这里把 `e.at`
   * 规整成「第一个非 bot 的 QQ」以对齐云崽语义。
   */
  Object.defineProperty(extra, 'atme', {
    get () {
      const list = Array.isArray(target.at) ? target.at : []
      const selfId = String(target.selfId || target.self_id || '')
      return list.some(q => String(q) === selfId)
    },
    configurable: true
  })

  Object.defineProperty(extra, 'at', {
    get () {
      const list = Array.isArray(target.at) ? target.at : []
      const selfId = String(target.selfId || target.self_id || '')
      const first = list.find(q => String(q) !== selfId)
      return first !== undefined ? String(first) : undefined
    },
    configurable: true
  })

  /** `e.getReply()`：云崽在收到 reply 段时挂的，取被引用消息原文 */
  Object.defineProperty(extra, 'getReply', {
    value: async () => {
      const rid = target.replyId || target.reply_id
      if (!rid) return null
      const facade = isGroup ? extra.group : extra.friend
      return facade?.getMsg?.(rid)
    },
    configurable: true
  })

  /** `e.recall()`：撤回这条消息 */
  Object.defineProperty(extra, 'recall', {
    value: () => {
      const mid = target.messageId || target.message_id
      if (!mid) return null
      return target.bot?.recallMsg?.(target.contact, String(mid))
    },
    configurable: true
  })

  /** 云崽的日志文案（`[群(号), 名片(号)]`） */
  Object.defineProperty(extra, 'logText', {
    get () {
      const uid = String(target.userId || target.user_id || '')
      return isGroup
        ? `[${target.contact?.name || target.groupId}, ${senderName(target)}(${uid})]`
        : `[${senderName(target)}(${uid})]`
    },
    configurable: true
  })

  /**
   * ⚠️ Proxy 的 target 必须是**空 shim**，不能直接包 karin 的事件对象。
   *
   * 原因：karin 把 `reply` 定义成 `writable:false, configurable:false` 的数据属性
   * （见文件头注释）。Proxy 的 invariant 规定 —— 目标对象上的**不可写不可配置**
   * 属性，`get` 陷阱必须原样返回它的值，否则抛
   * `'get' on proxy: property 'reply' is a read-only and non-configurable data property
   *  on the proxy target but the proxy did not return its actual value`。
   * 我们要的恰恰是「返回另一个值」，所以只能包一个干净的对象。
   *
   * 包空对象的代价：`Object.keys(e)` / 展开运算符拿不到 karin 的字段。
   * 全仓 grep 确认插件没有这类用法（`e` 只按名字取字段），所以安全。
   */
  const shim = {}

  const proxy = new Proxy(shim, {
    get (_, prop) {
      if (prop === 'reply') return reply
      if (prop in extra) return Reflect.get(extra, prop, extra)
      // ⚠️ 第三个参数传 target（不是 receiver）：karin 的字段大多是 getter，
      // 内部访问私有字段（#sender / #contact），this 指向 Proxy 会抛
      // 「Cannot read private member」
      return Reflect.get(target, prop, target)
    },
    set (_, prop, value) {
      // 插件里有 `e.msg = ...`（apps/update.js），要能写回原对象
      return Reflect.set(target, prop, value, target)
    },
    has (_, prop) {
      return prop === 'reply' || prop in extra || prop in target
    }
  })

  wrapped.set(target, proxy)
  return proxy
}

export default adaptEvent
