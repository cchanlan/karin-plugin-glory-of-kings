/**
 * 云崽全局注入：`plugin` / `segment` / `Bot` / `logger` / `common` / `puppeteer`。
 *
 * 插件的 40 个 apps 与 56 个 utils 里有大量**裸写**的全局（不 import）：
 *   `plugin` 50 处、`segment` 56 处、`logger` 318 处、`Bot` 42 处。
 * 云崽把它们挂在 `globalThis` 上，karin 没有 —— 不补上就是启动即
 * `ReferenceError: plugin is not defined`。
 *
 * ## 为什么 logger 要单独处理
 *
 * karin **确实**挂了 `globalThis.logger`（`terminalManager-BZKhAGPp.mjs` 里
 * `global.logger = logger`），所以理论上不用管。但插件里用了 `logger.mark`
 * （34 处）—— karin 的 logger 是 log4js 实例，**有 mark**（`LoggerLevel` 里
 * 列了 `'mark'`）。两边对得上，直接复用 karin 的即可，不要覆盖。
 *
 * ## 为什么不覆盖已存在的全局
 *
 * karin 的 `logger` 是真全局且行为正确；`Bot` 在 karin 里**只是模块导出**
 * （`const Bot = karin`），不在全局 —— 所以 `Bot` 是我们自己装的。
 * 一律「有就不动」最安全：将来 karin 补了某个全局，我们自动让位。
 */

import { logger, segment as karinSegment, common as karinCommon } from 'node-karin'
import { segment } from './segment.js'
import { installBotGlobal } from './bot.js'
import { installPluginGlobal } from './plugin.js'
import { puppeteer } from './render.js'
import { ensureDataFiles } from './dataInit.js'
import * as gokCommon from './common.js'

/**
 * 注入全部云崽全局。幂等。
 * @returns {{installed: string[], reused: string[]}} 装了哪些、复用了哪些
 */
export function installGlobals () {
  const installed = []
  const reused = []

  const set = (name, value) => {
    if (globalThis[name] === undefined) {
      globalThis[name] = value
      installed.push(name)
    } else {
      reused.push(name)
    }
  }

  // 插件基类：apps 里 `extends plugin` 靠它
  set('plugin', installPluginGlobal())

  // 消息段：用适配版（云崽字段名），不是 karin 原生那个
  set('segment', segment)

  // logger：karin 已经挂了真全局，这里只在缺失时补（正常走 reused 分支）
  set('logger', logger)

  // Bot 门面：karin 没有全局 Bot，这个是必须装的
  const botInstalled = globalThis.Bot === undefined
  installBotGlobal()
  ;(botInstalled ? installed : reused).push('Bot')

  // common：云崽的 lib/common/common.js
  set('common', gokCommon)

  // puppeteer：云崽的 lib/puppeteer/puppeteer.js（出图）
  set('puppeteer', puppeteer)

  // 数据文件预建（云崽靠入口 index.js 的 checkAndCreatePaths，karin 没那一步）。
  // 不做的话「文件不存在 → 指令抛异常 → 用户看到零回复」，是最难查的一类症状。
  const created = ensureDataFiles()
  if (created.length) installed.push(`data:${created.length}`)

  return { installed, reused }
}

/** 插件侧可读的 karin 原生对象（避免各处重复 import） */
export { karinSegment, karinCommon }
export default installGlobals
