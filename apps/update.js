import { isBlockedEvent } from "../utils/blackList.js";
import fs from 'node:fs';
import path from 'node:path';
import { Plugin, updatePkg, checkPkgUpdate, logger } from 'node-karin';
import { PluginName, PluginPath } from '#components';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function formatError(data) {
  if (!data) return '未知错误';
  if (typeof data === 'string') return data;
  const message = data.message || '';
  const stderr = data.stderr ? String(data.stderr) : '';
  const stdout = data.stdout ? String(data.stdout) : '';
  return [message, stderr, stdout].filter(Boolean).join('\n').trim().slice(0, 2000) || String(data);
}

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
    let lastError = '';
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await updatePkg(PluginName);
        if (result.status === 'ok') {
          logger.info('[王者更新] ' + formatError(result.data));
          return e.reply('王者插件已更新，重启 Karin 后生效');
        }
        const detail = formatError(result.data);
        if (detail.includes('无更新')) return e.reply('王者插件已是最新版本');
        lastError = detail;
        logger.error(`[王者更新] 第 ${attempt} 次更新失败：${detail}`);
      } catch (error) {
        lastError = formatError(error);
        logger.error(`[王者更新] 第 ${attempt} 次更新失败：${lastError}`);
      }
      if (attempt === 1) await sleep(2000);
    }
    logger.error('[王者更新] 最终更新失败：' + lastError);
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
