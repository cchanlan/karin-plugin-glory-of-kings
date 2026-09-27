/**
 * 云崽插件基类的兼容实现。
 *
 * 云崽的 `plugin` 是**全局注入**的（`lib/plugins/plugin.js` 里 `globalThis.plugin ||= plugin`），
 * 插件的 `apps/*.js` 全是 `export class X extends plugin`，不 import。karin 没有
 * 这个东西，所以要在加载 apps 之前把同名全局挂上。
 *
 * 只实现插件**真正用到**的那部分（全仓 grep 的结果）：构造器、`this.e`、`this.reply`。
 * 上下文（setContext / awaitContext）那套在 40 个 app 里一次都没用，不实现 ——
 * 少一份将来要跟着云崽内核改的代码。
 */

/** 云崽默认优先级；插件显式写了 priority 的以插件为准 */
const DEFAULT_PRIORITY = 5000

export class Plugin {
  constructor (options = {}) {
    const {
      name = 'your-plugin',
      dsc = '无',
      handler,
      namespace,
      event = 'message',
      priority = DEFAULT_PRIORITY,
      task = { name: '', fnc: '', cron: '' },
      rule = []
    } = options

    this.name = name
    this.dsc = dsc
    this.event = event
    this.priority = priority
    this.task = task
    this.rule = rule

    if (handler) {
      this.handler = handler
      this.namespace = namespace || ''
    }
  }

  /** 插件加载时调用；返回 "return" 表示跳过加载（云崽语义） */
  async init () {
    if (typeof this.onLoad === 'function') return this.onLoad()
    return undefined
  }

  /**
   * 回复消息。云崽签名 `(msg, quote, data)` —— 这里的 `this.e` 已经被
   * event 适配层打上了兼容版 `reply`，直接转发即可。
   */
  reply (msg = '', quote = false, data = {}) {
    if (!this.e?.reply || !msg) return false
    return this.e.reply(msg, quote, data)
  }
}

/** 挂到全局，供 `extends plugin` 用 */
export function installPluginGlobal () {
  if (!globalThis.plugin) globalThis.plugin = Plugin
  return globalThis.plugin
}

export default Plugin
