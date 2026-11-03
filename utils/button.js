import { segment } from "node-karin";
/**
 * 官方 QQ Bot 按钮
 *
 * segment.button(...行) 每个参数是一行，行内是按钮数组。
 * - callback: 点击后直接以该文本触发指令
 * - input:    点击后把文本填进输入框，等用户补参数再发
 * 非 QQBot 适配器（OneBot 等）会自动忽略 button 段，不影响其他平台。
 *
 * 注意：callback 里的指令必须能被 apps 里的 reg 命中，
 * 带参数的指令（营地ID/英雄名等）一律用 input。
 */
export default class Button {
  /** 帮助面板 */
  static help() {
    return segment.keyboard([[{
      text: '绑定营地',
      data: '#绑定营地',
      enter: false
    }, {
      text: '我的ID',
      data: '#营地ID',
      enter: true
    }], [{
      text: '王者主页',
      data: '#王者主页',
      enter: true
    }, {
      text: '查询战绩',
      data: '#查询战绩',
      enter: true
    }, {
      text: '王者对比',
      data: '#王者对比 ',
      enter: false
    }], [{
      text: '查英雄战绩',
      data: '#查战绩',
      enter: false
    }, {
      text: '常用英雄',
      data: '#常用英雄',
      enter: true
    }, {
      text: '称号墙',
      data: '#称号墙',
      enter: true
    }], [{
      text: '英雄梯度',
      data: '#英雄梯度',
      enter: true
    }, {
      text: '查战力',
      data: '#查战力',
      enter: false
    }, {
      text: '皮肤墙',
      data: '#皮肤墙',
      enter: true
    }, {
      text: '缺皮肤',
      data: '#缺皮肤',
      enter: true
    }], [{
      text: '排位排名',
      data: '#排位排名',
      enter: true
    }, {
      text: '巅峰排名',
      data: '#巅峰排名',
      enter: true
    }, {
      text: '巅峰趋势',
      data: '#巅峰趋势',
      enter: true
    }]]);
  }

  /** 未绑定营地ID时的引导 */
  static bind() {
    return segment.keyboard([[{
      text: '绑定营地',
      data: '#绑定营地',
      enter: false
    },
    // ⚠️ 原来这里 callback 的是 `#获取营地ID`，那条指令已删（新用户记不住第二条）。
    //    现在裸发 `#绑定营地`（不带 ID）就会出那张「营地ID从哪看」的教程图，
    //    所以这里直接 callback 它 —— 和左边那颗的区别是：左边把文本填进输入框等用户补 ID，
    //    这颗点下去立刻出教程。
    {
      text: '怎么获取ID',
      data: '#绑定营地',
      enter: true
    }]]);
  }

  /** 账号管理（#营地ID 等场景） */
  static account(ids = []) {
    const rows = [];
    // 已绑定多个账号时，给每个账号一个直达主页的按钮
    const slots = ids.slice(0, 6);
    for (let i = 0; i < slots.length; i += 2) {
      const row = [{
        text: `${i + 1}号主页`,
        data: `#王者主页${i + 1}`,
        enter: true
      }];
      if (slots[i + 1]) row.push({
        text: `${i + 2}号主页`,
        data: `#王者主页${i + 2}`,
        enter: true
      });
      rows.push(row);
    }
    rows.push([{
      text: '绑定营地',
      data: '#绑定营地',
      enter: false
    }, {
      text: '切换营地',
      data: '#切换营地',
      enter: false
    }]);
    // 登录态两种都留着：微信扫出来的和 QQ 扫出来的在营地里是两个体系，
    // 用户手上是哪个就点哪个（只给微信那一个的话，QQ 区的用户会以为没这条路）
    rows.push([{
      text: '微信登录',
      data: '#营地wx全局登录',
      enter: true
    }, {
      text: 'QQ登录',
      data: '#营地QQ全局登录',
      enter: true
    }]);
    rows.push([{
      text: '删除营地',
      data: '#删除营地',
      enter: false
    }]);
    return segment.keyboard([...rows]);
  }

  /**
   * 王者主页
   * @param {string|number} id 营地ID，带上后按钮直接查该ID；不传则查当前账号
   */
  static homepage(id = '') {
    const s = id ? String(id) : '';
    return segment.keyboard([[
    // #查询战绩<营地ID>：handleQuery 里 >9999 的数字会被当成营地ID
    {
      text: '查询战绩',
      data: `#查询战绩${s}`,
      enter: true
    }, {
      text: '常用英雄',
      data: `#常用英雄${s}`,
      enter: true
    }], [{
      text: '排位表现',
      data: `#排位表现${s}`,
      enter: true
    }, {
      text: '巅峰表现',
      data: `#巅峰表现${s}`,
      enter: true
    }], [{
      text: '皮肤墙',
      data: `#皮肤墙${s}`,
      enter: true
    }, {
      text: '全部皮肤',
      data: `#全部皮肤${s}`,
      enter: true
    }], [{
      text: '排位排名',
      data: '#排位排名',
      enter: true
    }, {
      text: '巅峰排名',
      data: '#巅峰排名',
      enter: true
    }]]);
  }

  /**
   * 战绩列表
   * 带营地ID时走 `#查询<ID><模式>战绩<序号>` 这一路（reg 里 \d+ 捕获组，>9999 视为直接传ID）；
   * 不带ID时模式独立成指令 `#排位战绩<序号>`，无模式则是 `#查询战绩<序号>`。
   * @param {string|number} id 营地ID，可为空
   * @param {number} count 本次返回的场次数，用于生成「第N场」按钮
   * @param {string} mode 当前模式（排位/巅峰），空表示全部
   */
  static gameStats(id = '', count = 0, mode = '') {
    const s = id ? String(id) : '';
    const cmd = (m = '', n = '') => {
      if (s) return `#查询${s}${m}战绩${n}`;
      return m ? `#${m}战绩${n}` : `#查询战绩${n}`;
    };
    const rows = [];

    // 单场详情：必须带上当前模式，否则序号会对应到未筛选的列表
    const detail = [];
    for (let i = 1; i <= Math.min(3, count); i++) {
      detail.push({
        text: `第${i}场`,
        data: cmd(mode, i),
        enter: true
      });
    }
    if (detail.length) rows.push(detail);

    // 模式切换：只列出当前模式之外的选项
    const others = ['排位', '巅峰'].filter(m => m !== mode);
    const modeRow = others.map(m => ({
      text: `${m}战绩`,
      data: cmd(m),
      enter: true
    }));
    if (mode) modeRow.unshift({
      text: '全部战绩',
      data: cmd(),
      enter: true
    });
    // 一行最多放 3 个
    for (let i = 0; i < modeRow.length; i += 3) rows.push(modeRow.slice(i, i + 3));
    rows.push([{
      text: '王者主页',
      data: `#王者主页${s}`,
      enter: true
    }, {
      text: '常用英雄',
      data: `#常用英雄${s}`,
      enter: true
    }]);
    return segment.keyboard([...rows]);
  }

  /**
   * 单场战绩详情
   * @param {string|number} id 营地ID
   * @param {string} mode 该场所属模式，返回列表时保持筛选一致
   */
  static gameStatsDetail(id = '', mode = '') {
    const s = id ? String(id) : '';
    const back = s ? `#查询${s}${mode}战绩` : mode ? `#${mode}战绩` : '#查询战绩';
    return segment.keyboard([[{
      text: '返回战绩列表',
      data: back,
      enter: true
    }, {
      text: '王者主页',
      data: `#王者主页${s}`,
      enter: true
    }]]);
  }

  /** 常用英雄 */
  static heroList(id = '') {
    const s = id ? String(id) : '';
    return segment.keyboard([[{
      text: '查战力',
      data: '#查战力',
      enter: false
    }, {
      text: '英雄梯度',
      data: '#英雄梯度',
      enter: true
    }], [{
      text: '王者主页',
      data: `#王者主页${s}`,
      enter: true
    }, {
      text: '查询战绩',
      data: `#查询战绩${s}`,
      enter: true
    }]]);
  }

  /**
   * 英雄战绩列表
   * @param {string} heroName 英雄名
   * @param {string|number} id 营地ID
   */
  static heroStats(heroName = '', id = '') {
    const s = id ? String(id) : '';
    const rows = [];
    if (heroName) {
      rows.push([{
        text: `${heroName}战力`,
        data: `#查战力${heroName}`,
        enter: true
      }, {
        text: `${heroName}皮肤`,
        data: `#查皮肤${heroName}`,
        enter: true
      }]);
    }
    rows.push([{
      text: '全部战绩',
      data: `#查询战绩${s}`,
      enter: true
    }, {
      text: '常用英雄',
      data: `#常用英雄${s}`,
      enter: true
    }]);
    return segment.keyboard([...rows]);
  }

  /**
   * 英雄详情
   * @param {string} heroName 英雄名
   * @param {string|number} id 营地ID
   */
  static heroDetail(heroName = '', id = '') {
    const s = id ? String(id) : '';
    const rows = [];
    if (heroName) {
      rows.push([{
        text: `${heroName}战绩`,
        data: `#查战绩${heroName}`,
        enter: true
      }, {
        text: `${heroName}战力`,
        data: `#查战力${heroName}`,
        enter: true
      }]);
      rows.push([{
        text: `${heroName}皮肤`,
        data: `#查皮肤${heroName}`,
        enter: true
      }, {
        text: '常用英雄',
        data: `#常用英雄${s}`,
        enter: true
      }]);
    } else {
      rows.push([{
        text: '查战绩',
        data: '#查战绩',
        enter: false
      }, {
        text: '常用英雄',
        data: `#常用英雄${s}`,
        enter: true
      }]);
    }
    return segment.keyboard([...rows]);
  }

  /**
   * 英雄相关（查战力/查皮肤互跳）
   * @param {string} heroName 英雄名
   */
  static hero(heroName = '') {
    if (!heroName) {
      return segment.keyboard([[{
        text: '查战力',
        data: '#查战力',
        enter: false
      }, {
        text: '查皮肤',
        data: '#查皮肤',
        enter: false
      }]]);
    }
    return segment.keyboard([[{
      text: `${heroName}战力`,
      data: `#查战力${heroName}`,
      enter: true
    }, {
      text: `${heroName}皮肤`,
      data: `#查皮肤${heroName}`,
      enter: true
    }], [{
      text: '英雄梯度',
      data: '#英雄梯度',
      enter: true
    }, {
      text: '常用英雄',
      data: '#常用英雄',
      enter: true
    }]]);
  }

  /**
   * 双人对比
   * @param {string|number} left 左边的营地ID
   * @param {string|number} right 右边的营地ID
   */
  static compare(left = '', right = '') {
    const rows = [];
    if (left && right) {
      rows.push([{
        text: '看左边主页',
        data: `#王者主页${left}`,
        enter: true
      }, {
        text: '看右边主页',
        data: `#王者主页${right}`,
        enter: true
      }]);
    }
    rows.push([{
      text: '换个人比',
      data: '#王者对比 ',
      enter: false
    }, {
      text: '排位排名',
      data: '#排位排名',
      enter: true
    }]);
    return segment.keyboard([...rows]);
  }

  /**
   * 荣耀称号墙
   * @param {string|number} id 营地ID
   */
  static medalWall(id = '') {
    const s = id ? String(id) : '';
    return segment.keyboard([[{
      text: '多扫几个',
      data: '#称号墙 25',
      enter: false
    }, {
      text: '我的英雄',
      data: `#我的英雄${s}`,
      enter: true
    }], [{
      text: '查战力',
      data: '#查战力',
      enter: false
    }, {
      text: '王者主页',
      data: `#王者主页${s}`,
      enter: true
    }]]);
  }

  /** 英雄梯度榜 */
  static heroTier() {
    return segment.keyboard([[{
      text: '对抗路',
      data: '#英雄梯度对抗路',
      enter: true
    }, {
      text: '中路',
      data: '#英雄梯度中路',
      enter: true
    }, {
      text: '打野',
      data: '#英雄梯度打野',
      enter: true
    }], [{
      text: '发育路',
      data: '#英雄梯度发育路',
      enter: true
    }, {
      text: '游走',
      data: '#英雄梯度游走',
      enter: true
    }], [{
      text: '查战力',
      data: '#查战力',
      enter: false
    }, {
      text: '常用英雄',
      data: '#常用英雄',
      enter: true
    }]]);
  }

  /** 皮肤墙 */
  static skinWall(id = '') {
    const s = id ? String(id) : '';
    return segment.keyboard([[{
      text: '全部皮肤',
      data: `#全部皮肤${s}`,
      enter: true
    }, {
      text: '查皮肤',
      data: '#查皮肤',
      enter: false
    }], [{
      text: '缺哪些皮肤',
      data: `#缺皮肤${s}`,
      enter: true
    }, {
      text: '王者主页',
      data: `#王者主页${s}`,
      enter: true
    }]]);
  }

  /**
   * 皮肤缺失反查
   * @param {string} heroName 当前查的英雄名，有则给个「看该英雄皮肤图鉴」的直达
   * @param {string|number} id 营地ID
   */
  static skinMissing(heroName = '', id = '') {
    const s = id ? String(id) : '';
    const rows = [];
    if (heroName) {
      rows.push([{
        text: `${heroName}皮肤图`,
        data: `#查皮肤${heroName}`,
        enter: true
      }, {
        text: '换个英雄',
        data: '#缺皮肤',
        enter: false
      }]);
    } else {
      rows.push([{
        text: '看某个英雄',
        data: '#缺皮肤',
        enter: false
      }, {
        text: '皮肤墙',
        data: `#皮肤墙${s}`,
        enter: true
      }]);
    }
    rows.push([{
      text: '全部皮肤',
      data: `#全部皮肤${s}`,
      enter: true
    }, {
      text: '王者主页',
      data: `#王者主页${s}`,
      enter: true
    }]);
    return segment.keyboard([...rows]);
  }

  /**
   * 巅峰分趋势
   * @param {string|number} id 营地ID
   */
  static trend(id = '') {
    const s = id ? String(id) : '';
    return segment.keyboard([[
    // 指令后跟天数，最多 35 天（归档保留上限）
    {
      text: '看近 7 天',
      data: `#巅峰趋势7${s ? ` ${s}` : ''}`,
      enter: true
    }, {
      text: '看近 30 天',
      data: `#巅峰趋势30${s ? ` ${s}` : ''}`,
      enter: true
    }], [{
      text: '巅峰表现',
      data: `#巅峰表现${s}`,
      enter: true
    }, {
      text: '巅峰战绩',
      data: s ? `#查询${s}巅峰战绩` : '#巅峰战绩',
      enter: true
    }], [{
      text: '王者主页',
      data: `#王者主页${s}`,
      enter: true
    }, {
      text: '巅峰排名',
      data: '#巅峰排名',
      enter: true
    }]]);
  }

  /**
   * 段位趋势。和 trend()（巅峰）互为入口：打排位的看这个，打巅峰的看那个
   * @param {string|number} id 营地ID
   */
  static rankTrend(id = '') {
    const s = id ? String(id) : '';
    return segment.keyboard([[{
      text: '看近 7 天',
      data: `#段位趋势7${s ? ` ${s}` : ''}`,
      enter: true
    }, {
      text: '看近 30 天',
      data: `#段位趋势30${s ? ` ${s}` : ''}`,
      enter: true
    }], [{
      text: '排位表现',
      data: `#排位表现${s}`,
      enter: true
    }, {
      text: '巅峰趋势',
      data: `#巅峰趋势${s ? ` ${s}` : ''}`,
      enter: true
    }], [{
      text: '王者主页',
      data: `#王者主页${s}`,
      enter: true
    }, {
      text: '排位排名',
      data: '#排位排名',
      enter: true
    }]]);
  }

  /**
   * 排行榜
   * @param {'rank'|'peak'} type 当前榜单类型
   * @param {boolean} isGlobal 当前是否为总排名，用于给出反向的范围切换入口
   */
  static rank(type = 'rank', isGlobal = false) {
    const self = type === 'peak' ? '巅峰' : '排位';
    const other = type === 'peak' ? '排位' : '巅峰';
    // 当前榜的指令前缀，刷新按钮要带上同样的范围，否则会跳到另一个范围的榜
    const scope = isGlobal ? '总排名' : '排名';
    return segment.keyboard([[{
      text: `${other}${scope}`,
      data: `#${other}${scope}`,
      enter: true
    },
    // 已经在总榜就给回本群榜的入口，反之给总榜入口
    isGlobal ? {
      text: `${self}排名`,
      data: `#${self}排名`,
      enter: true
    } : {
      text: `${self}总排名`,
      data: `#${self}总排名`,
      enter: true
    }], [{
      text: '刷新榜单',
      data: `#${self}${scope}刷新`,
      enter: true
    }, {
      text: '王者主页',
      data: '#王者主页',
      enter: true
    }]]);
  }

  /**
   * 战绩推送
   * @param {boolean} enabled 当前是否已订阅战绩推送，决定给「开启」还是「关闭」按钮
   */
  static push(enabled = false) {
    return segment.keyboard([[enabled ? {
      text: '关闭推送',
      data: '#关闭战绩推送',
      enter: true
    } : {
      text: '开启推送',
      data: '#开启战绩推送',
      enter: true
    }, {
      text: '推送状态',
      data: '#战绩推送状态',
      enter: true
    }], [{
      text: '上下线提醒',
      data: '#开启上下线提醒',
      enter: true
    }, {
      text: '查询战绩',
      data: '#查询战绩',
      enter: true
    }]]);
  }

  /**
   * 在线状态（#谁在打游戏）。
   * 不复用 push()：那个按当前订阅状态给「开启/关闭推送」，而这条指令是给全群看的，
   * 谁点都可能，不该给一个「关闭推送」的按钮在那儿等着误触
   */
  static online() {
    return segment.keyboard([[{
      text: '刷新',
      data: '#谁在打游戏',
      enter: true
    }, {
      text: '上下线提醒',
      data: '#开启上下线提醒',
      enter: true
    }], [{
      text: '推送状态',
      data: '#战绩推送状态',
      enter: true
    }, {
      text: '排位排名',
      data: '#排位排名',
      enter: true
    }]]);
  }

  /**
   * 赛季/巅峰表现
   * @param {string|number} id 营地ID，带上后按钮直接查该ID
   * @param {string} type 当前看的是排位、巅峰，还是两者合并的赛季表现
   * @param {number|string} [prevSeason] 上一个赛季号，用于给出「S43表现」这类历史赛季入口
   */
  static performance(id = '', type = '排位', prevSeason = '') {
    const s = id ? String(id) : '';
    // #赛季表现 是排位+巅峰的合并图，没有对应的榜单和「全部赛季表现」以外的入口，
    // 排名/对侧入口都沿用排位那套，只有历史赛季直达要回到 #赛季表现
    const listType = type === '赛季' ? '排位' : type;
    const other = listType === '排位' ? '巅峰' : '排位';
    const rows = [[{
      text: `${other}表现`,
      data: `#${other}表现${s}`,
      enter: true
    }, {
      text: '查询战绩',
      data: `#查询战绩${s}`,
      enter: true
    }], [{
      text: '王者主页',
      data: `#王者主页${s}`,
      enter: true
    }, {
      text: '常用英雄',
      data: `#常用英雄${s}`,
      enter: true
    }], [
    // 当前看的是哪种表现，就给哪种榜单的入口
    {
      text: `${listType}排名`,
      data: `#${listType}排名`,
      enter: true
    }, {
      text: `全部${listType}表现`,
      data: `#全部${listType}表现${s}`,
      enter: true
    }]];
    // 巅峰分有本地存档可以画趋势，排位没有（星数趋势已经画在排位表现图里了）
    if (type === '巅峰') {
      rows[2].push({
        text: '巅峰趋势',
        data: `#巅峰趋势${s ? ` ${s}` : ''}`,
        enter: true
      });
    }
    // 指令支持 #排位表现s40 指定赛季，这里给个直达上一赛季的入口
    if (prevSeason) {
      rows.push([{
        text: `S${prevSeason}${type}表现`,
        data: `#${type}表现${s}s${prevSeason}`,
        enter: true
      }, {
        text: '指定赛季',
        data: `#${type}表现s`,
        enter: false
      }]);
    }
    return segment.keyboard([...rows]);
  }

  /**
   * 全部赛季表现
   * @param {string|number} id 营地ID
   * @param {string} type 排位 / 巅峰
   */
  static allPerformance(id = '', type = '排位') {
    const s = id ? String(id) : '';
    const other = type === '排位' ? '巅峰' : '排位';
    return segment.keyboard([[{
      text: `全部${other}表现`,
      data: `#全部${other}表现${s}`,
      enter: true
    }, {
      text: `${type}表现`,
      data: `#${type}表现${s}`,
      enter: true
    }], [
    // 指令后可跟数量或 all，控制展示多少个赛季
    {
      text: '全部赛季',
      data: `#全部${type}表现${s} all`,
      enter: true
    }, {
      text: '指定数量',
      data: `#全部${type}表现${s} `,
      enter: false
    }], [{
      text: '王者主页',
      data: `#王者主页${s}`,
      enter: true
    }, {
      text: '查询战绩',
      data: `#查询战绩${s}`,
      enter: true
    }]]);
  }

  /**
   * 皮肤上新日历
   * @param {boolean} subscribed 本群是否已开上新推送，决定给「开启」还是「关闭」
   */
  static skinNews(subscribed = false) {
    return segment.keyboard([[{
      text: subscribed ? '关闭上新推送' : '开启上新推送',
      data: `#${subscribed ? '关闭' : '开启'}皮肤上新推送`,
      enter: true
    }, {
      text: '查皮肤',
      data: '#查皮肤',
      enter: false
    }], [{
      text: '皮肤墙',
      data: '#皮肤墙',
      enter: true
    }, {
      text: '英雄攻略',
      data: '#英雄攻略 ',
      enter: false
    }]]);
  }

  /**
   * 王者公告清单
   * @param {boolean} subscribed 本群是否已开公告推送，决定给「开启」还是「关闭」
   */
  static gameNews(subscribed = false) {
    return segment.keyboard([[{
      text: subscribed ? '关闭公告推送' : '开启公告推送',
      data: `#${subscribed ? '关闭' : '开启'}王者公告推送`,
      enter: true
    }, {
      text: '皮肤上新',
      data: '#皮肤上新',
      enter: true
    }], [{
      text: '英雄梯度',
      data: '#英雄梯度',
      enter: true
    }, {
      text: '英雄攻略',
      data: '#英雄攻略 ',
      enter: false
    }]]);
  }

  /**
   * 英雄攻略（出装 / 克制 / 技能）
   * @param {string} heroName 当前查的英雄名
   */
  static heroGuide(heroName = '') {
    const rows = [];
    if (heroName) {
      rows.push([{
        text: `${heroName}皮肤`,
        data: `#查皮肤${heroName}`,
        enter: true
      }, {
        text: `${heroName}战力`,
        data: `#查战力${heroName}`,
        enter: true
      }]);
    }
    rows.push([{
      text: '换个英雄',
      data: '#英雄攻略 ',
      enter: false
    }, {
      text: '英雄梯度',
      data: '#英雄梯度',
      enter: true
    }]);
    return segment.keyboard([...rows]);
  }

  /**
   * 观战：账号都占着时问「要不要中断上一路」。
   *
   * ⚠️ 一个账号只能服务一路，所以**只有一个登录态时开第二路必然没号可用**。
   *    这里给两颗按钮：确认中断（直接以 callback 触发指令）或算了。
   *    两条 callback 都能被 `#营地观战` 那条规则命中（arg 分别是「确认中断」「继续等」）。
   *
   * 非 QQBot 适配器会自动忽略 button 段，所以文案里必须把指令写出来，别只给按钮。
   */
  static watchReplace() {
    return segment.keyboard([[{
      text: '中断上一路，开这个',
      data: '#营地观战 确认中断',
      enter: true
    }, {
      text: '算了，继续看',
      data: '#营地观战 继续等',
      enter: true
    }]]);
  }
}
