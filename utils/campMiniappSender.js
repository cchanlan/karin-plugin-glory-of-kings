import { segment, sendMsg, logger } from 'node-karin';
import { isRealBot } from './botAccount.js';
import { isConfirmedReceipt } from './privateMsg.js';
import { sendMiniappWithDiagnostics } from './campMiniappDiag.js';

export function sendCampMiniapp(event) {
  return sendMiniappWithDiagnostics(event, {
    framework: 'Karin', logger: () => logger,
    describe: e => ({
      adapter: String(e.bot?.adapter?.name || e.bot?.adapterName || 'Karin native'),
      botId: e.selfId || e.bot?.selfId, target: e.contact?.peer || e.groupId || e.userId,
      user: e.userId, capabilities: { nativeJson: typeof segment.json === 'function', nativeSend: typeof sendMsg === 'function', realBot: isRealBot(e.bot) }
    }),
    route: (e, cardJson) => {
      if (!isRealBot(e.bot) || !e.contact || typeof segment.json !== 'function') return { name: 'karin_native', dataShape: 'native-json/data', reason: 'missing_native_json_or_contact' };
      // JSON is a standalone native message. Never introduce Yunzai globals or OneBot raw envelopes here.
      return { name: 'karin_native_json', dataShape: 'native-json/data', send: () => sendMsg(e.selfId || e.bot.selfId, e.contact, [segment.json(cardJson)]) };
    },
    version: e => ({ app: String(e.bot?.adapter?.name || e.bot?.adapterName || 'Karin native'), version: String(e.bot?.adapter?.version || 'unknown') }),
    confirm: isConfirmedReceipt
  });
}
