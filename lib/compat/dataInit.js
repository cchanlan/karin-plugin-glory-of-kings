/**
 * 数据目录初始化：预建插件依赖的数据文件。
 *
 * 云崽那边这段逻辑在插件入口 `index.js` 里（`checkAndCreatePaths`）—— 云崽的
 * 加载器会在插件加载后跑它，所以那些文件总是存在。karin 版没有等价入口，
 * 不补的话就会出现「指令命中、插件也执行了，但**一条回复都没有**」这种最难查的
 * 症状：像 `#王者用户统计` 会在 `buildAuthPoolOverviewData()` 里读
 * `data/UserData.yaml`，文件不存在直接 ENOENT 抛出去，而那个调用在 `try` 外面
 * （云崽侧既有的写法），异常一路冒到框架层、被 catch 吞掉，用户只看到没反应。
 *
 * ⚠️ 这里**只建不覆盖**：已存在的文件一个字都不动。用户的数据比什么都重要，
 * 而这段代码每次启动都会跑。
 *
 * ⚠️ 刻意不 import `#components` 拿 PluginData —— 本模块由 `globals.js` 静态引入，
 * 而装全局的窗口正是为了「让 #components 晚点求值」（Config 构造函数用 logger 全局）。
 * 所以按文件位置反推插件根（lib/compat/ 往上三级）。
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PluginPath = path.resolve(fileURLToPath(import.meta.url), '../../..')
const PluginData = path.join(PluginPath, 'data')

/** 目录 → 用 mkdir；文件 → 写一个初始 YAML */
const PATHS = {
  userSettingsDir: path.join(PluginData, 'user_settings'),
  userDataFile: path.join(PluginData, 'UserData.yaml'),
  gameRecordPushFile: path.join(PluginData, 'GameRecordPush.yaml'),
  userSettingsFile: path.join(PluginData, 'user_settings.yaml'),
  gameStatsPushSettingsFile: path.join(PluginData, 'gameStatsPushSettings.yaml')
}

/** 每个文件初次创建时的内容（与云崽入口一致：推送列表要 `{pushList:{}}`，其余空对象） */
const INITIAL = {
  gameRecordPushFile: 'pushList: {}\n'
}

/**
 * 建目录 + 建文件（只补缺失的）。
 * @returns {string[]} 本次新建的键名（已存在的不列）
 */
export function ensureDataFiles () {
  const created = []

  // 先保证 data/ 本身在
  try {
    fs.mkdirSync(PluginData, { recursive: true })
  } catch { /* 建不出来就让后面各自的 mkdir 报错，不在这里拦 */ }

  for (const [key, filePath] of Object.entries(PATHS)) {
    try {
      fs.accessSync(filePath)
      continue   // 已存在，绝不动它
    } catch { /* 不存在，往下建 */ }

    try {
      if (key.endsWith('Dir')) {
        fs.mkdirSync(filePath, { recursive: true })
      } else {
        fs.writeFileSync(filePath, INITIAL[key] ?? '{}\n', 'utf8')
      }
      created.push(key)
    } catch (error) {
      // 单个文件建不出来不该拦住启动 —— 相关指令自己会报错，比整个插件起不来好
      console.error(`[王者插件] 初始化数据文件失败 ${filePath}：${error?.message || error}`)
    }
  }

  return created
}

/**
 * 按绝对路径补建一个缺失的数据文件。给指令执行失败的兜底用。
 *
 * 为什么需要它：`ensureDataFiles` 只在启动时跑一次，而用户可能在运行期删掉
 * `data/` 下的文件（清理磁盘、手抖、或者像开发时清测试数据）。那时指令会抛
 * `ENOENT: no such file or directory, open '.../data/UserData.yaml'` ——
 * 异常被 loader 的 catch 吞掉，**用户看到的是一条回复都没有**，最难查。
 *
 * ⚠️ 只处理 `data/` 目录下的**已知文件**：路径必须落在 PATHS 里，避免变成
 * 「任意路径都能被写」的漏洞。
 *
 * @param {string} filePath 出错时的绝对路径
 * @returns {boolean} 是否真的补建了
 */
export function repairDataFile (filePath) {
  const abs = path.resolve(String(filePath || ''))
  const hit = Object.entries(PATHS).find(([, p]) => path.resolve(p) === abs)
  if (!hit) return false

  const [key, target] = hit
  try {
    if (key.endsWith('Dir')) fs.mkdirSync(target, { recursive: true })
    else {
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, INITIAL[key] ?? '{}\n', 'utf8')
    }
    return true
  } catch {
    return false
  }
}

export default ensureDataFiles
