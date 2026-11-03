import { isBlockedEvent } from "../utils/blackList.js";
import fs from 'node:fs';
import path from 'node:path';
import { Plugin, updatePkg, checkPkgUpdate, logger } from 'node-karin';
import { PluginName, PluginPath } from '#components';
export class GloryOfKingsUpdate extends Plugin {
  constructor() {
    super({
      name: '王者插件_更新',
      desc: '更新 npm 插件',
      event: 'message',
      priority: 5010,
      rule: [{
        reg: '^#*(王者|农药)(插件)?(强制)?更新$',
        fnc: 'update',
        permission: 'master'
      }, {
        reg: '^#*(王者|农药)(插件)?更新(日志|记录)$',
        fnc: 'update_log',
        permission: 'master'
      }]
    });
  }
  async update(e) {
    if (isBlockedEvent(e)) return true;
    if (e.at.length && !e.atBot) return;
    try {
      const result = await updatePkg(PluginName);
      if (result.status === 'ok') return e.reply('王者插件已更新');
      logger.error('[王者更新] ' + String(result.data));
    } catch (error) {
      logger.error('[王者更新] ' + error.message);
    }
    return e.reply('更新失败，请稍后重试');
  }
  async update_log(e) {
    if (isBlockedEvent(e)) return true;
    try {
      const result = await checkPkgUpdate(PluginName);
      if (result.status === 'error') logger.error('[王者更新] ' + result.error.message);
      const log = fs.readFileSync(path.join(PluginPath, 'CHANGELOG.md'), 'utf8');
      return e.reply(log);
    } catch (error) {
      logger.error('[王者更新] 读取更新日志失败：' + error.message);
      return e.reply('暂时无法获取更新日志，请稍后重试');
    }
  }
}
