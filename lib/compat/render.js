/**
 * 出图 shim：把云崽的 `puppeteer.screenshot(name, data)` 接到 karin 的 `render.render()`。
 *
 * ## 为什么必须有一层
 *
 * 两边有三处不兼容：
 *
 * 1. **返回值**：云崽返回的是**已经包好的 `segment.image` 段**（`lib/core/render/index.js`
 *    的 `screenshot()` 里 `return segment.image(img)`），所以插件直接
 *    `e.reply([img, Button.xxx()])` 就能发。karin 的 `render.render()` 返回**裸 base64
 *    字符串**，直接塞进 reply 会当文本发出去（一坨 base64）。
 *
 * 2. **模板定位**：云崽靠 `data.tplFile`（`plugins/GloryOfKings-Plugin/resources/html/X.html`）
 *    + `data._res_path`（`../../../plugins/…/resources/`，**相对 HTML 文件**的路径）
 *    来拼资源地址。karin 会把 HTML 写到 `@karinjs/temp/html/<name>/` 下再截图，
 *    相对路径的基准就变了 —— 所以这里把 `_res_path` **换成绝对 `file://` 地址**，
 *    不管 HTML 落在哪都能引到 CSS/字体/图片。
 *
 * 3. **图片格式**：云崽 `data.imgType` 是 `jpeg`/`png`/`webp`；karin 的同名字段叫 `type`。
 *
 * ## 为什么 tplFile 只取文件名
 *
 * 所有 31 处调用的 tplFile 都是 `plugins/GloryOfKings-Plugin/resources/html/<名字>.html`
 * 这一个形状，取 basename 再拼本插件的 `resources/html/` 就够了 —— 而且这样
 * **插件目录改名也不会坏**（云崽那边写死了 `GloryOfKings-Plugin` 这个目录名）。
 */

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { render, logger } from 'node-karin'
import { segment } from './segment.js'

// ⚠️ 这里**不能** import `#components` 拿 PluginPath：本模块由 globals.js 静态引入，
// 而 globals.js 的作用是「先把全局装好、再让 #components 求值」（Config 的构造
// 函数里会用到 logger 全局）。反过来引会让 #components 提前求值。
// 插件根目录按本文件位置反推（lib/compat/ 往上**三级**才是插件根），
// 和 components/Path.js 是同一套算法，只是层级不同。
const PluginPath = path.resolve(fileURLToPath(import.meta.url), '../../..')
const HTML_DIR = path.join(PluginPath, 'resources', 'html')

/** 模板名 → 绝对路径。找不到时返回空串，由调用方给一句人话 */
function resolveTpl (tplFile) {
  const name = path.basename(String(tplFile || ''))
  if (!name) return ''
  const full = path.join(HTML_DIR, name)
  return fs.existsSync(full) ? full : ''
}

/**
 * `puppeteer.screenshot(name, data)` 的兼容实现。
 *
 * @param {string} name 渲染名（云崽用它定位模板/缓存目录；这里只用于日志和输出目录）
 * @param {object} data 模板数据；其中 `tplFile` / `_res_path` / `imgType` 是元字段
 * @returns {Promise<object|false>} 云崽格式的 `segment.image` 段；失败返回 false
 */
export async function screenshot (name, data = {}) {
  const file = resolveTpl(data.tplFile)
  if (!file) {
    logger.error(`[王者插件] 找不到出图模板：${data.tplFile || '(未提供 tplFile)'}`)
    return false
  }

  // _res_path 换成绝对地址：模板里写的是 `{{_res_path}}css/X.css`，
  // 拼出来就是 `file:///…/resources/css/X.css`，跟 HTML 落在哪无关
  const resPath = pathToFileURL(path.join(PluginPath, 'resources') + path.sep).href

  const { tplFile, _res_path, imgType, ...rest } = data

  try {
    const base64 = await render.render({
      name: String(name || 'gok'),
      file,
      data: { ...rest, _res_path: resPath },
      type: imgType || 'jpeg',
      pageGotoParams: {
        // 和云崽默认一致：等网络空闲。插件模板里有外链图片（头像、英雄图标），
        // 用 'load' 会截到还没加载完的空白
        waitUntil: 'networkidle2',
        timeout: 60000
      }
    })

    if (!base64) return false
    // 返回云崽形状的段：插件会把它和按钮一起塞进数组回复
    return segment.image(`base64://${base64}`)
  } catch (error) {
    logger.error(`[王者插件] 出图失败 ${name}：${error?.message || error}`)
    return false
  }
}

/**
 * `puppeteer.screenshots(name, data)`：分片截图，返回段数组。
 * 云崽那边是 `data.multiPage = true`，karin 侧同名参数。
 */
export async function screenshots (name, data = {}) {
  const file = resolveTpl(data.tplFile)
  if (!file) {
    logger.error(`[王者插件] 找不到出图模板：${data.tplFile || '(未提供 tplFile)'}`)
    return false
  }

  const resPath = pathToFileURL(path.join(PluginPath, 'resources') + path.sep).href
  const { tplFile, _res_path, imgType, ...rest } = data

  try {
    const list = await render.render({
      name: String(name || 'gok'),
      file,
      data: { ...rest, _res_path: resPath },
      type: imgType || 'jpeg',
      multiPage: true,
      pageGotoParams: { waitUntil: 'networkidle2', timeout: 60000 }
    })
    const arr = Array.isArray(list) ? list : [list]
    const out = arr.filter(Boolean).map(b64 => segment.image(`base64://${b64}`))
    return out.length ? out : false
  } catch (error) {
    logger.error(`[王者插件] 分片出图失败 ${name}：${error?.message || error}`)
    return false
  }
}

/** `puppeteer.render(name, data)`：云崽里返回图片路径，这里给 base64（同源不同形） */
export async function renderRaw (name, data = {}) {
  const img = await screenshot(name, data)
  return img ? img.file : false
}

/** `puppeteer.browserInit()`：返回浏览器实例。karin 不暴露，插件那边有兜底，这里给 null */
export async function browserInit () {
  return null
}

export const puppeteer = {
  screenshot,
  screenshots,
  render: renderRaw,
  browserInit,
  /** 云崽的 `puppeteer.getMac()` 之类，插件没用到，统一给 null */
  getMac: () => null,
  createBrowser: () => null
}

export default puppeteer
