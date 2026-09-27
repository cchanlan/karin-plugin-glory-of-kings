/**
 * 云崽 `other/update.js` 的兼容实现。
 *
 * 插件里只有 `apps/update.js` 用它，做两件事：拉取更新、看更新日志。
 * 云崽那套 `Update` 类有一大堆 API（getPlugin / getLog / update / getRemoteVersion…），
 * 但插件只用到 `update()` 和 `getLog()`，所以这里只实现这两个 ——
 * **不为没人用的 API 写兼容代码**（少一份将来要跟云崽内核同步的东西）。
 *
 * karin 原生有对应的更新能力（`checkGitPluginUpdate` / `updateGitPlugin`），
 * 直接转发过去，不自己跑 git。
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { checkGitPluginUpdate, updateGitPlugin, logger } from 'node-karin'

/** 插件根目录（本文件在 lib/compat/ 下） */
const PLUGIN_ROOT = path.resolve(fileURLToPath(import.meta.url), '../..')

export class Update {
  constructor (e) {
    this.e = e
    this.reply = e?.reply?.bind?.(e)
  }  /** 插件是否存在。云崽用它判断插件装没装；本插件自己就在，恒真 */
  getPlugin (name) {
    return { name }
  }

  /** 拉取更新。云崽的 `update()` 会把进度回给用户 */
  async update () {
    try {
      const res = await updateGitPlugin(PLUGIN_ROOT)
      if (res?.status === 'ok') {
        await this.reply?.(`✅ 更新完成\n${res.data || ''}`.trim())
      } else {
        await this.reply?.(`更新失败：${res?.data || '未知原因'}`)
      }
      return res
    } catch (error) {
      logger.error(`[王者插件] 更新失败：${error?.message || error}`)
      await this.reply?.(`更新失败：${error?.message || error}`)
      return { status: 'error', data: error }
    }
  }

  /** 更新日志。云崽读的是 CHANGELOG，这里从 git 提交记录里取最近几条 */
  async getLog () {
    try {
      const res = await checkGitPluginUpdate(PLUGIN_ROOT)
      const log = res?.data || ''
      return log || '（没有拿到更新日志）'
    } catch (error) {
      logger.error(`[王者插件] 取更新日志失败：${error?.message || error}`)
      return '（取更新日志失败）'
    }
  }
}

/** apps/update.js 用的是具名导入 `import { update as Update }`，所以要转出这个名字 */
export const update = Update

export default Update
