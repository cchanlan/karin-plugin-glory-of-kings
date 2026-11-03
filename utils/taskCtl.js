import { logger } from 'node-karin';

/** 只重排本插件的原生任务，不操作其它插件或框架加载器。 */
export async function rescheduleOwnTask(task, cron) {
  const next = String(cron || '').trim();
  try {
    if (!task?.schedule) return false;
    if (!next) {
      task.schedule.cancel();
      task.cron = '';
      return true;
    }
    const ok = task.schedule.reschedule(next);
    if (ok) task.cron = next;
    return Boolean(ok);
  } catch (error) {
    logger.warn('[王者签到] 重排任务失败：' + error.message);
    return false;
  }
}
export function isCronOn(cron) {
  return Boolean(String(cron || '').trim());
}
