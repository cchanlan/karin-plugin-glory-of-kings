/**
 * karin 侧的桥接文件 —— **本目录是 `package.json` 里 `karin.apps` 指向的唯一目录**。
 *
 * ## 它为什么必须存在
 *
 * karin 只认「模块导出里的命令对象」：它 import 本文件，遍历 `Object.keys(导出)`，
 * 对每个值调 `pkgCache`。而我们的 103 条命令是在 `KARIN_PLUGIN_INIT()` 里
 * 从 `apps/*.js` 的云崽插件类**动态构造**出来的，没法写成静态的具名导出。
 *
 * 所以流程是：
 *   1. karin `await import(插件主入口)` → `await KARIN_PLUGIN_INIT()`
 *      → 装全局 + 扫 apps + 构造命令 → 填进 `lib/compat/registry.js`
 *   2. karin 再 import **本文件**，这里把注册表里的数组原样导出
 *
 * karin 的 `pkgCache` 对数组导出是支持的（`app-B7PuXGPG.mjs`：
 * `for (const val of Array.isArray(data) ? data : [data]) cacheHandler(val, key)`），
 * 所以一个具名导出的数组就够了。
 *
 * ## 为什么 `karin.apps` 不能直接指向 `lib/`
 *
 * 试过：指向 `lib/` 时 karin 会把 `lib/compat/` 下的类也当插件扫，于是报
 * 「your-plugin plugin.rule 不能为空」「plugin.name 不能为空」——
 * 那些是我们的兼容层内部类（Plugin / Update），不是 karin 插件。
 * 把 apps 收窄到本目录，扫到的就只剩这一份桥接。
 *
 * ⚠️ 本文件**不能有别的导出**（尤其别导 default）：
 * karin 会对每个导出值尝试注册，导出无关的东西只会刷错误日志。
 * 也别在这里 import `lib/compat/` 之外的东西 —— 这里的求值时机在
 * 全局安装**之后**，安全；但保持最小依赖更容易推理。
 */

import { commands, tasks } from '../lib/compat/registry.js'

/** 103 条云崽指令（构造于 KARIN_PLUGIN_INIT） */
export const gokCommands = commands

/** 定时任务（日报/周报/月报、战绩推送、缓存清理、营地登录保活） */
export const gokTasks = tasks
