/**
 * 命令注册表：`lib/index.js` 构造好的 karin 命令对象放这儿，
 * 由 `karin-apps/index.js` 导出给 karin。
 *
 * ## 为什么要这么绕
 *
 * karin 的注册流程是**两段式**（见 node-karin 的 `app-B7PuXGPG.mjs`）：
 *
 *   1. `await import(插件主入口)` → `await KARIN_PLUGIN_INIT()`   ← 我们在这里构造命令
 *   2. 扫 `karin.apps` 目录，import 每个文件，遍历**模块的导出值**做注册
 *
 * 而 `karin.command()` 本身**不注册**，只返回描述对象。所以「构造」和「被 karin 看到」
 * 必须发生在两个不同的模块里，中间靠这个注册表传递。
 *
 * ## 为什么用可变数组而不是 Map
 *
 * 桥接文件在**模块求值那一刻**就把数组导出去了，之后 karin 遍历的是同一个数组对象。
 * 用 Map 或每次重新赋值的话，导出出去的引用就断了。
 * 好在时序是确定的（第 1 步 await 完才走第 2 步），这里只需保证是同一个数组实例。
 */

/** karin 命令对象（由 loader.js 构造） */
export const commands = []

/** karin 定时任务对象（日报/周报/推送/缓存清理/登录保活） */
export const tasks = []

/** 装载统计，供日志和调试用 */
export const stats = {
  files: 0,
  classes: 0,
  failed: []
}

/** 由 lib/index.js 调用，把构造结果填进来（原地改，不换引用） */
export function fill (result) {
  commands.length = 0
  commands.push(...result.commands)
  tasks.length = 0
  tasks.push(...(result.tasks || []))
  stats.files = result.files
  stats.classes = result.classes
  stats.failed = result.failed
  return commands.length
}

export default { commands, tasks, stats, fill }
