/**
 * 云崽插件装载器：把 `apps/*.js` 里那些 `extends plugin` 的类，
 * 转成 karin 的命令对象。
 *
 * ## 为什么要自己装载，而不是改业务代码
 *
 * 40 个 app、1.3 万行，全是云崽形态：`export class X extends plugin` +
 * `super({ rule: [{ reg, fnc, permission }] })`。逐个改成 `karin.command` 要动
 * 每一处规则，还容易漏（`permission` / 优先级 / 一个类多条规则）。
 * 这里做一个**一次性翻译层**：读类上的 `rule`，逐条构造 karin 命令，
 * 业务代码一个字不动。
 *
 * ## ⚠️ 只构造、不注册 —— 这是本模块最容易踩的坑
 *
 * `karin.command()` **只返回一个描述对象**，没有任何注册副作用
 * （源码 `index.mjs`：`const command = (reg, second, options) => { ... return {type:'fnc', ...} }`）。
 * 真正的注册在 karin 的加载器里：它 import 插件模块，遍历模块的**导出值**，
 * 对每个值调 `pkgCache`（`app-B7PuXGPG.mjs` 的 `for (const key of Object.keys(result))`）。
 *
 * 所以命令对象必须**出现在模块的导出里** —— 这就是 `karin-apps/index.js`
 * 那个桥接文件存在的唯一理由。
 *
 * ## 关键语义对齐
 *
 * 1. **返回值**：云崽里返回 `false` = 继续匹配下一个插件；返回其他（含 undefined）
 *    = 命中并**停止**后续匹配。karin 里反过来：调 `next()` 才是继续。
 *    所以包装时要把「云崽的 false」翻译成 karin 的 `next()` 调用。
 * 2. **`this` 绑定**：云崽的 fnc 里大量用 `this.xxx`（200+ 处），必须绑到插件实例。
 * 3. **`permission`**：云崽的 `'master'`/`'owner'`/`'admin'` 对应 karin 的
 *    `'master'`/`'group.owner'`/`'group.admin'`。不传时两边默认都是「所有人」。
 * 4. **`e`**：注册时用事件适配层打过补丁的 `e`（见 compat/event.js）。
 * 5. **优先级**：karin 1.17.0 的 `priority` 对 command **无效**（它按 `rank` 字段
 *    排序，而 `command()` 只写 `priority` —— `app-B7PuXGPG.mjs` 里
 *    `sortBy(cache.command, ['rank'])`）。实际执行顺序 = 模块导出顺序。
 *    所以顺序由 `buildCommands` 的**显式排序**保证，不能指望 priority。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { karin, logger } from 'node-karin'
import { adaptEvent } from './event.js'
import { repairDataFile } from './dataInit.js'

/** 云崽的权限名 → karin 的权限名 */
const PERMISSION_MAP = {
  master: 'master',
  owner: 'group.owner',
  admin: 'group.admin',
  all: 'all'
}

/**
 * 云崽的 `event` 字段 → karin 的 `event` 参数。
 * 云崽的默认值是 `'message'`（群+私聊都收），karin 的 `'message'` 也是全场景。
 */
const EVENT_MAP = {
  message: 'message',
  'message.group': 'message.group',
  'message.friend': 'message.friend',
  notice: 'notice',
  request: 'request'
}

/**
 * 取模块里要尝试注册的导出值。
 *
 * ⚠️ **default 优先，且必须带上**：云崽 loader 的取法是
 * `moduleExports?.default || moduleExports[Object.keys(moduleExports)[0]]`
 * —— 有 default 就只认 default。本插件里 `apps/shareNotify.js` 正是
 * `export default class ShareNotify`，漏掉它那条「首次安装/更新后问要不要接入
 * 共享库」的提醒就永远不会触发。
 *
 * 与云崽**故意不同**的一点：没有 default 时，这里遍历**全部**具名导出而不是只取
 * 第一个。云崽只取第一个是它的历史缺陷（一个文件里放两个插件类，第二个会被
 * 静默丢掉，见仓库记忆 gok-plugin-index-single-export）；这里靠「实例化后看
 * `rule` 是不是数组」来判定，多出来的辅助函数（如 shareDeploy 的 `probeAdmin`）
 * 构造就失败、自然跳过，所以遍历全部是安全的，还顺手修掉了那个缺陷。
 */
function exportsOf (mod) {
  if (mod.default !== undefined) return [mod.default]
  return Object.keys(mod).map(k => mod[k])
}

/** 递归收集目录下所有 .js 文件（同步：装载在启动路径上，开销可忽略） */
function collectFiles (dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(full, out)
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full)
  }
  return out
}

/**
 * 从插件实例上收集定时任务，构造成 karin 的 task 对象。
 *
 * 云崽的 `this.task` 有两种形态（全仓都有实例）：
 *   - **对象**：`{ name, cron, fnc, log }` —— cacheManager / skinNews / gameRecordPush
 *   - **数组**：上面那种对象组成的数组 —— battleReport / groupReport / campRenew
 * 还有第三种「关闭态」：`{ name:'', fnc:'', cron:'' }`（配置里没配 cron 时），
 * 云崽 loader 靠「cron 和 fnc 都有值」来过滤，这里照做。
 *
 * ⚠️ **`fnc` 里的 `this` 必须绑到插件实例**：`campRenew` / `battleReport` 用的是
 * `() => this.renew(...)` 箭头函数（已捕获），但 `cacheManager` 用
 * `() => runClean('定时')` 引的是模块级函数 —— 两种都能跑。为保险统一 `bind`。
 *
 * @returns {object[]} karin task 对象
 */
function buildTasks (instance, file) {
  const raw = instance.task
  if (!raw) return []

  const list = Array.isArray(raw) ? raw : [raw]
  const out = []

  for (const t of list) {
    if (!t || typeof t !== 'object') continue
    const { name, cron, fnc, log } = t
    // 云崽 loader 的判据：cron 和 fnc 都有值才收集（配置留空 = 关掉这一路）
    if (!name || !cron || typeof fnc !== 'function') continue

    out.push(karin.task(
      String(name),
      String(cron),
      async () => {
        try {
          return await fnc.call(instance)
        } catch (error) {
          logger.error(`[王者插件] 定时任务「${name}」执行出错：${error?.message || error}`)
          logger.debug(error?.stack || String(error))
          return false
        }
      },
      { name: instance.name || path.basename(file), log: log !== false }
    ))
  }

  return out
}

/**
 * 试实例化一个导出值，是插件类就把它的规则构造成 karin 命令对象。
 *
 * ⚠️ **只实例化一次**：云崽的 `rule` 是**实例属性**（基类构造函数里
 * `this.rule = rule`），不在原型上，没法靠 `value.prototype.rule` 提前判断。
 * 而实例化有副作用（CacheManager / battleReport 读配置，shareNotify 起定时器），
 * 试探一次再正式一次会让副作用跑两遍 —— shareNotify 的文件头注释专门写了
 * 「不能放 constructor，因为 loader 会对同一个类 new 两次」，那是云崽的既有行为；
 * 我们不该再制造第三个。
 *
 * @returns {{commands: object[], tasks: object[], name: string, priority: number, count: number}}
 */
function buildFromClass (value, file) {
  const empty = { commands: [], tasks: [], name: '', priority: 5000, count: 0 }
  if (typeof value !== 'function') return empty

  let instance
  try {
    instance = new value()
  } catch {
    // 不是类、或构造需要参数 —— 当作「不是插件类」静默跳过
    return empty
  }

  // 云崽插件的判据：实例上有 rule 数组（哪怕空数组）
  if (!instance || !Array.isArray(instance.rule)) return empty

  const commands = []
  const priority = instance.priority ?? 5000

  for (const rule of instance.rule) {
    const { reg, fnc, permission, event, log } = rule
    if (!reg || !fnc) continue

    // fnc 可以是方法名（云崽常规写法），也可以是函数
    const methodName = typeof fnc === 'function' ? (fnc.name || 'fnc') : String(fnc)

    commands.push(karin.command(
      reg instanceof RegExp ? reg : new RegExp(reg),
      async (e, next) => {
        // 把 karin 事件包成云崽风格的 e（reply 签名不同、缺 group/friend 门面等），
        // 业务代码拿到的必须是包装后的那个 —— 详见 compat/event.js 顶部注释
        const yunzaiE = adaptEvent(e)

        const handler = instance[methodName]
        if (typeof handler !== 'function') {
          logger.error(`[王者插件] ${instance.name} 上找不到方法 ${methodName}（${file}）`)
          return true
        }

        try {
          const result = await handler.call(instance, yunzaiE)
          // 云崽：返回 false = 继续匹配下一个插件
          if (result === false) {
            next?.()
            return false
          }
          return true
        } catch (error) {
          // 数据文件被运行期删掉时自愈一次再重试。`ensureDataFiles` 只在启动时跑，
          // 用户清磁盘 / 手抖删了 data/ 下的文件之后，指令会抛 ENOENT 而**一条回复
          // 都没有** —— 异常被这里的 catch 吞掉，是最难查的一类症状。
          // 只对 data/ 下的已知文件补建（见 dataInit.js 的 repairDataFile），
          // 且**只重试一次**，避免真出错时无限循环。
          if (error?.code === 'ENOENT' && error?.path && repairDataFile(error.path)) {
            logger.warn(`[王者插件] ${instance.name} · ${methodName} 缺数据文件，已补建并重试：${error.path}`)
            try {
              const retry = await handler.call(instance, yunzaiE)
              if (retry === false) {
                next?.()
                return false
              }
              return true
            } catch (retryError) {
              error = retryError
            }
          }

          // 云崽 loader 是 catch 住并记 error 日志、不让异常冒出去的。
          // 这里保持一致：一条指令出错不能把 karin 的派发流程炸掉。
          logger.error(`[王者插件] ${instance.name} · ${methodName} 执行出错：${error?.message || error}`)
          logger.debug(error?.stack || String(error))
          return true
        }
      },
      {
        name: instance.name || methodName,
        event: EVENT_MAP[event] || 'message',
        priority,
        permission: PERMISSION_MAP[permission] || 'all',
        log: log !== false
      }
    ))
  }

  return {
    commands,
    tasks: buildTasks(instance, file),
    name: instance.name || path.basename(file),
    priority,
    count: commands.length
  }
}

/**
 * 扫描 apps 目录，构造出全部 karin 命令对象。
 *
 * **顺序**：按 `priority` 升序（云崽的语义是数值小的先跑）。之所以要在这里
 * 显式排序而不是交给 karin，是因为 karin 1.17.0 的 priority 对 command 无效
 * （见文件头注释），执行顺序实际就是数组顺序 —— 也就是导出顺序。
 *
 * 同优先级内保持**文件名顺序**（readdirSync 的天然顺序），和云崽按目录扫描的
 * 行为一致，避免「同一优先级的指令互相抢」时结果随机。
 *
 * @param {string} dir apps 目录的绝对路径
 * @returns {Promise<{commands: object[], files: number, classes: number, failed: string[]}>}
 */
export async function buildCommands (dir) {
  const stats = { commands: [], tasks: [], files: 0, classes: 0, failed: [] }
  const files = collectFiles(dir).sort()

  for (const file of files) {
    stats.files++
    let mod
    try {
      mod = await import(pathToFileURL(file).href)
    } catch (error) {
      // 单个文件 import 失败不影响其他文件 —— 和云崽 loader 的行为一致
      stats.failed.push(path.basename(file))
      logger.error(`[王者插件] 加载模块失败 ${path.basename(file)}：${error?.message || error}`)
      logger.debug(error?.stack || String(error))
      continue
    }

    for (const value of exportsOf(mod)) {
      const built = buildFromClass(value, file)
      if (built.count > 0) {
        stats.classes++
        // 记下来源，排序时用得上（同优先级按文件顺序）
        for (const cmd of built.commands) {
          stats.commands.push({ cmd, priority: built.priority, file: path.basename(file) })
        }
      }
      // 定时任务单独收：有的插件类（如只跑 cron 的）可能没有 rule
      stats.tasks.push(...built.tasks)
    }
  }

  // 按 priority 升序稳定排序，再剥掉包装
  stats.commands.sort((a, b) => a.priority - b.priority)
  const ordered = stats.commands.map(x => x.cmd)
  stats.commands = ordered
  return stats
}

export default buildCommands
