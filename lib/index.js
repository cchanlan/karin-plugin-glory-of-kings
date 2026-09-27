/**
 * 插件入口（karin）。
 *
 * ## 这个文件干两件事
 *
 * 1. **装云崽全局**（`plugin` / `segment` / `Bot` / `puppeteer` …）—— 见 `compat/globals.js`
 * 2. **扫 `apps/` 构造 karin 命令**，填进注册表 —— 见 `compat/loader.js`
 *
 * ## 为什么全用动态 import
 *
 * karin 加载插件时会先 `await import(主入口)`，再调 `KARIN_PLUGIN_INIT()`，
 * **最后**才扫 `karin.apps` 目录（见 node-karin 的 `app-B7PuXGPG.mjs`）。
 * 这个顺序正好给了我们一个「装全局」的窗口：apps 里的 `extends plugin` 和
 * `logger.xxx` 都要等那个窗口之后才求值。
 *
 * 所以本文件**不能有静态 import** —— 静态 import 会在 `import(主入口)` 那一刻
 * 就求值整条依赖链，而 `#components`（Config 的构造函数里用了 `logger` 全局）
 * 正好在链上。全部动态 import 才能保证「先装全局，再碰组件」。
 *
 * ## 命令是怎么被 karin 看到的
 *
 * `karin.command()` 只构造对象、**不注册**；注册是 karin 遍历 `karin.apps`
 * 目录下模块的**导出值**时做的。所以这里构造完要填进 `compat/registry.js`，
 * 再由 `karin-apps/index.js` 导出给 karin。详见那两个文件的注释。
 */

/** karin 的插件初始化钩子：在 apps 目录被扫描**之前**、且被 await */
export async function KARIN_PLUGIN_INIT () {
  const { installGlobals } = await import('./compat/globals.js')
  const { buildCommands } = await import('./compat/loader.js')
  const { fill } = await import('./compat/registry.js')
  const { logger } = await import('node-karin')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')

  const globals = installGlobals()
  logger.debug(`[王者插件] 云崽全局已就绪：注入 ${globals.installed.join('/') || '无'}，复用 ${globals.reused.join('/') || '无'}`)

  // apps 目录在**插件根**（不是 lib/ 下）——和云崽的目录结构保持一致，
  // 这样 apps 里那些 `../utils/xxx.js` 的相对 import 一个字都不用改
  const root = path.resolve(fileURLToPath(import.meta.url), '..', '..')
  const appsDir = path.join(root, 'apps')

  const result = await buildCommands(appsDir)
  fill(result)

  const summary = `模块 ${result.files} 个 · 插件类 ${result.classes} 个 · 指令 ${result.commands.length} 条 · 定时任务 ${result.tasks.length} 个`
  if (result.failed.length) {
    logger.error(`[王者插件] 加载完成（有失败）：${summary} · 失败：${result.failed.join(', ')}`)
  } else {
    logger.info(`[王者插件] 加载完成：${summary}`)
  }

  return result
}

/** 兼容：karin 某些版本用这个钩子名 */
export const init = KARIN_PLUGIN_INIT

export default { KARIN_PLUGIN_INIT }
