/**
 * 消息段适配：把云崽（Yunzai）风格的 segment 映射到 karin 的元素格式。
 *
 * 插件里有 42 处 `segment.xxx`，其中 26 处是 button。两边差异集中在两处：
 *
 *   1. **@ 的目标字段名不同**：云崽 `{ type:'at', qq }`，karin `{ type:'at', targetId }`。
 *   2. **按钮的「行为」表达方式不同**：
 *      - 云崽靠**字段名**区分行为：`{ text, callback:'#指令' }` 是点击即发，
 *        `{ text, input:'#指令' }` 是填进输入框等用户补参数。
 *      - karin 靠 **action.type** 区分（见 node-karin 的 `karinToQQBot`）：
 *        `callback:true` → type 1（回调）；`type:2` → 指令按钮（插入输入框）；
 *        `enter:true` → 点击后直接发送。
 *      另外云崽的 `segment.button(...行)` 是**变长参数**（每个参数一行），
 *      karin 多行要用 `{ type:'keyboard', rows:[[...]] }`。
 *
 * 其余元素（image / face / record / video / file / reply）两边字段基本同名，
 * 直接透传 —— 但**不能原样返回 karin 的对象**：调用方会把这些段拼进数组再
 * `e.reply([...])`，中间可能被业务代码读字段（如 `seg.file`），保持云崽的
 * 字段名才能让 `utils/` 里那些拼消息的代码继续工作。
 */

/** 云崽的 `{text, callback, input}` → karin 的 KarinButton */
function toKarinButton (btn = {}) {
  const { text = '', callback, input, link, show, style, tips, admin, list, role } = btn
  const out = { text: String(text) }

  if (link) {
    out.link = String(link)
  } else if (callback) {
    // 云崽的 callback 值是「点击后要发的指令」，karin 要的是 callback:true + data
    out.callback = true
    out.data = String(callback)
  } else if (input) {
    // 云崽的 input 值是「填进输入框的文本」→ karin 的指令按钮（type 2）
    out.type = 2
    out.data = String(input)
  } else {
    out.type = 2
    out.data = String(text)
  }

  // 这些是可选的呈现/权限字段，两边语义一致，有就带上
  if (show !== undefined) out.show = String(show)
  if (style !== undefined) out.style = style
  if (tips !== undefined) out.tips = String(tips)
  if (admin !== undefined) out.admin = admin
  if (list !== undefined) out.list = list
  if (role !== undefined) out.role = role

  return out
}

/** karin 的 KarinButton → 云崽的 `{text, callback|input}`（供少数要读回按钮的场景） */
function fromKarinButton (btn = {}) {
  const out = { text: btn.text || '' }
  if (btn.link) out.link = btn.link
  else if (btn.callback) out.callback = btn.data
  else out.input = btn.data
  return out
}

export const segment = {
  /** 文本。云崽那边通常直接用字符串，这里补上以便 `segment.text(...)` 也能用 */
  text: (text = '') => ({ type: 'text', text: String(text) }),

  /** 图片。两边都是 `{type:'image', file, name}`，透传即可 */
  image: (file, name) => ({ type: 'image', file, name }),

  /** @ 某人。云崽写 `qq`，karin 写 `targetId` */
  at: (qq, name) => ({ type: 'at', qq: String(qq), name }),

  face: (id) => ({ type: 'face', id: Number(id) }),

  record: (file, name) => ({ type: 'record', file, name }),

  video: (file, name) => ({ type: 'video', file, name }),

  file: (file, name) => ({ type: 'file', file, name }),

  reply: (id, text, qq, time, seq) => ({ type: 'reply', id: String(id), text, qq, time, seq }),

  /**
   * 按钮。云崽的**变长参数**每个是一行，产出云崽格式 `{type:'button', data:[行...]}`。
   *
   * ⚠️ 这里刻意**不**直接产出 karin 的 keyboard：业务代码会把按钮段存下来再读字段
   * （`Button.xxx()` 的返回值会被塞进数组、甚至拼进别的结构），保持云崽字段名
   * 才能让那些读 `.callback` 的地方继续工作。转 karin 格式统一在发送前做
   * （见 `toKarinElements`）。
   */
  button: (...rows) => {
    // 兼容 `segment.button([...], [...])`（云崽写法）和 `segment.button([[..],[..]])`（二维数组写法）
    const list = rows.length === 1 && Array.isArray(rows[0]) && Array.isArray(rows[0][0])
      ? rows[0]
      : rows
    return { type: 'button', data: list.map(row => (Array.isArray(row) ? row : [row])) }
  },

  /** 原样转发（云崽的 raw 段） */
  raw: (data) => ({ type: 'raw', data }),

  custom: (type, data) => ({ type, ...data })
}

/**
 * 把云崽风格的段（或段的数组）转成 karin 能发的元素。
 *
 * 之所以要单独走一遍而不是在 `segment.*` 里直接产出 karin 格式：
 * 业务代码经常把段**存下来**再读字段（例如把 image 段塞进数组里后续取 `.file`），
 * 若一开始就产出 karin 格式，那些读 `.qq` 的地方会拿到 undefined。
 * 所以约定是：`segment.*` 产出**云崽格式**，只在真正发送前用这个函数过一遍。
 */
export function toKarinElements (msg) {
  if (msg == null) return []
  const list = Array.isArray(msg) ? msg.flat(Infinity) : [msg]

  const out = []
  for (const item of list) {
    if (item == null || item === '') continue
    if (typeof item === 'string' || typeof item === 'number') {
      out.push({ type: 'text', text: String(item) })
      continue
    }
    if (typeof item !== 'object') continue

    switch (item.type) {
      case 'at':
        // karin 的 at 只认 targetId；`all` 是全体
        out.push({ type: 'at', targetId: String(item.qq ?? item.targetId ?? ''), name: item.name })
        break
      case 'button': {
        // 云崽格式的 button（data 是行数组）→ karin 的 keyboard
        const rows = Array.isArray(item.data) ? item.data : [item.data]
        out.push({ type: 'keyboard', rows: rows.map(r => (Array.isArray(r) ? r : [r]).map(toKarinButton)) })
        break
      }
      case 'keyboard':
        // 已经是 karin 格式；里面的按钮若还是云崽字段，过一遍转换（幂等）
        out.push({ type: 'keyboard', rows: (item.rows || []).map(r => r.map(toKarinButton)) })
        break
      case 'reply':
        // 云崽的 reply 段带 id；karin 只认 messageId
        out.push({ type: 'reply', messageId: String(item.id ?? item.messageId ?? '') })
        break
      default:
        // image / face / record / video / file / text / raw / markdown … 字段同名，透传
        out.push({ ...item })
    }
  }
  return out
}

export { toKarinButton, fromKarinButton }
export default segment
