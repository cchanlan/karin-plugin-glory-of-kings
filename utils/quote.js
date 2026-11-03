import { Config } from '#components';

/**
 * 回复时是否引用触发指令那条消息，对应锅巴开关 config.quoteReply。
 * 改配置即时生效（Config 有文件监听会清缓存），读不到配置时按旧行为引用。
 * @returns {boolean} 传给 e.reply 的第二个参数
 */
export function shouldQuote() {
  try {
    return Config.getDefOrConfig('config')?.quoteReply !== false;
  } catch {
    return true;
  }
}
