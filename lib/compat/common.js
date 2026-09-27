/**
 * 云崽 `lib/common/common.js` 的兼容实现。插件里只用到两个方法：
 *   - `common.sleep(ms)` —— 延迟
 *   - `common.makeForwardMsg(e, msg[], title)` —— 拼合并转发
 *
 * `makeForwardMsg` 在云崽里返回一个**转发段**（由适配器生成），插件拿到后直接
 * `e.reply(forwardMsg)`。karin 的等价物是 `common.makeForward(elements, fakeId, fakeName)`
 * 造节点数组 + `bot.sendForwardMsg(contact, nodes)` 发送 —— 但 karin 的节点数组
 * **不能直接塞进 reply**（reply 收的是 elements，不含转发节点）。
 *
 * 所以这里的做法：返回一个带标记的对象，由 event 适配层的 reply 识别并改走
 * `sendForwardMsg`。这样插件侧 `e.reply(forwardMsg)` 的写法不用改。
 */

import { common as karinCommon } from 'node-karin'

/** 延迟。云崽的 sleep 返回 Promise<void> */
export function sleep (ms = 0) {
  return new Promise(resolve => setTimeout(resolve, Number(ms) || 0))
}

/**
 * 合并转发的标记，event 适配层靠它认出该走 sendForwardMsg。
 *
 * ⚠️ **必须是字符串键，不能用 Symbol**。Symbol 的身份只在**同一个模块实例**内成立，
 * 而 karin 的热重载（HMR）会用 `?t=${Date.now()}` 重新 import 模块
 * （`file-DGx4IRpZ.mjs` 的 `importModule`）—— 那会生成**全新的模块实例**，
 * 于是 `common.js` 里的 Symbol 与 `event.js` 里的 Symbol 不再是同一个值，
 * `msg[FORWARD_MARK]` 恒为 undefined，合并转发被当成普通消息段发出去
 * （表现是适配器收到一条 `{title, messages}` 的「未知段」，转发整条丢失）。
 *
 * 实测踩过：隔离测试里 Symbol 判定正常，跑在真实例里就失效。
 * 字符串键没有这个问题 —— 任何实例读到的都是同一个属性名。
 */
export const FORWARD_MARK = '__gokForward'

/**
 * 拼合并转发。
 *
 * @param {object} e 事件（用来定位发送目标；这里不直接用，交给 reply 阶段）
 * @param {Array|string} msg 内容数组
 * @param {string} [dec] 首层小卡片外显文案
 * @returns {object} 带 FORWARD_MARK 的转发描述对象
 */
export function makeForwardMsg (e, msg = [], dec) {
  const list = Array.isArray(msg) ? msg : [msg]
  return {
    [FORWARD_MARK]: true,
    /** 外显文案（karin 的 sendForwardMsg 的 options 里叫 title） */
    title: dec || '',
    messages: list
  }
}

/** 云崽还有这些方法，插件没用到，给个明确的空实现免得将来踩坑 */
export function relpyPrivate () {
  throw new Error('common.relpyPrivate 未在 karin 兼容层实现，请改用 utils/privateMsg.js 的 sendPrivate')
}

export function downFile () {
  throw new Error('common.downFile 未在 karin 兼容层实现')
}

export function mkdirs () {
  throw new Error('common.mkdirs 未在 karin 兼容层实现')
}

/** 透传 karin 自己的 common（absPath / base64 等），便于将来直接用 */
export { karinCommon }

export default { sleep, makeForwardMsg, relpyPrivate, downFile, mkdirs }
