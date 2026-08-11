/* ===== 模块 m1 视图 · 复核工作台 · 归属 W1-A 工兵(施工图 §7-m1;裁定② 模块拆独立文件,文件互斥) =====
   契约:VIEWS.m1 = function(ctx) 返回 HTML 字符串;ctx = {module, rest[], hash}
   路由:#/m1(默认井盖 tab) · #/m1/line/mh|rd|pl · #/m1/clue/CL-0417
   共享文件(tokens.css / store.js / data.js / ui.js / app.html)只读;
   一切按钮走 UI.actionPanel / data-act → UI.bindActions → S.commit(唯一状态变更入口),灰态原因取自 S.check(R53)。
   设计档依据:§0.5.1 线卡 A(路面) · §0.5.2 线卡 B(井盖) · §0.5.3 线卡 C(管网) · §2.3 用户流程 · §3 三线全流程与非理想态 · §4 动作表 */
(function (w, d) {
  'use strict';

  var S = w.S, UI = w.UI, esc = UI.esc;

  /* ============ 常量 ============ */
  var LINES = [
    { key: 'mh', line: '井盖', title: '井盖 / 排水', sub: '突发事件流' },
    { key: 'rd', line: '路面', title: '路面病害', sub: '养护流' },
    { key: 'pl', line: '管网', title: '灌溉管网', sub: '预警调查流' }
  ];
  /* R33 跨线仲裁默认序在线内的落地:紧急最前,机器直派件再置顶 */
  var LV_RANK = { '紧急': 0, '急修': 1, '雨前专项': 2, '调查': 2, '养护': 3, '观察': 4, '设备': 5 };

  /* 页面局部 UI 态(不进 store;store 只经 S.commit 变更)
     acc = 各线置顶区当前展开的那一条(手风琴同时只开一条)· rowOpen = 全部线索表内联展开的行
     filt = 全部线索表的状态/档位筛选 */
  var M = { modal: null, form: {}, picks: {}, expanded: false, acc: {}, rowOpen: {}, filt: {} };

  /* ============ 小工具 ============ */
  function lineOfKey(k) { for (var i = 0; i < LINES.length; i++) if (LINES[i].key === k) return LINES[i]; return LINES[0]; }
  function keyOfLine(l) { for (var i = 0; i < LINES.length; i++) if (LINES[i].line === l) return LINES[i].key; return 'mh'; }
  function card(title, body, extra, cls) {
    return '<div class="card ' + (cls || '') + '">' +
      (title ? '<div class="card-hd"><h3>' + title + '</h3>' + (extra || '') + '</div>' : '') + body + '</div>';
  }
  /* R86 A9 · 带类型视觉的对象卡:kind = clue/alert/ticket/case;线索卡左边框取业务线类目色 */
  function tcard(kind, title, body, extra, opts) {
    opts = opts || {};
    return '<div' + UI.cardAttrs(kind, { cls: 'card' + (opts.cls ? ' ' + opts.cls : ''), line: opts.line, color: opts.color }) + '>' +
      '<div class="card-hd"><h3>' + title + '</h3>' +
      '<span class="row" style="gap:8px;align-items:center">' + (extra || '') + UI.cardTag(kind, opts.tag) + '</span></div>' +
      body + '</div>';
  }
  function isOpen(c) { return c.status === 'open'; }
  function isHigh(c) { return S.isHigh(c); }
  function cluesOf(line) {
    return S.get().clues.filter(function (c) { return c.line === line; }).sort(sortClues);
  }
  function sortClues(a, b) {
    var fa = (a.fastlane && isOpen(a)) ? 0 : 1, fb = (b.fastlane && isOpen(b)) ? 0 : 1;
    if (fa !== fb) return fa - fb;
    var oa = isOpen(a) ? 0 : 1, ob = isOpen(b) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    var la = LV_RANK[a.level] == null ? 9 : LV_RANK[a.level], lb = LV_RANK[b.level] == null ? 9 : LV_RANK[b.level];
    if (la !== lb) return la - lb;
    var sa = a.slaDeadline ? S.slaLeft(a.slaDeadline) : 9999, sb = b.slaDeadline ? S.slaLeft(b.slaDeadline) : 9999;
    return sa - sb;
  }
  function conf2(v) { return (v === null || v === undefined) ? '' : String(Math.round(v * 100) / 100); }
  function confText(c) {
    if (c.conf === null || c.conf === undefined) return '<span class="faint" title="本线不出图像置信度">—</span>';
    return '<span class="mono">' + esc(conf2(c.conf)) + '</span>';
  }
  function slaCell(c) {
    if (!c.slaDeadline) return '<span class="faint tiny" style="white-space:nowrap">批量车道 · 按批计</span>';
    return UI.sla(c.slaDeadline);
  }
  function rejectOpts() {
    return S.dict().rejectCodes.map(function (r) { return [r.code, r.code + ' ' + r.name + ' → 回流「' + r.to + '」']; });
  }
  function rcOpts(k) { return (S.dict().reasonCodes[k] || []).map(function (x) { return [x, x]; }); }
  function recallBranch(tk) {
    if (!tk) return '尚未产生工单,撤回仅回收线索。';
    var cw = tk.crew ? UI.crewName(tk.crew) : '(未指派)';
    if (tk.state === '已到场') return '班组 ' + cw + ' 已到场 → 撤回转「现场核实」:确有异常重新确认,无异常方撤。';
    if (tk.state === '作业中' || tk.state === '已开井') return '班组 ' + cw + ' 已开井 → 不能一撤了之,转「现场收尾单」:恢复原状 + 安全确认后销单。';
    return '班组 ' + cw + ' 在途 → 班组端撤单通知,返程或转下一单;白跑不计班组考核,班组可申诉。';
  }

  /* ---- 当前身份是否在该动作的授权角色里(只看授权,不看前置条件)---- */
  function canRole(action) {
    var def = S.ACTIONS[action] || {}, role = S.get().role, as = def.actors || [];
    return as.indexOf('*') >= 0 || as.indexOf(role) >= 0;
  }
  /* ---- 档位徽章 hover:title 换成该档判据一句话(取 RULES[].when;规则本体在 m6)---- */
  function laneWhen(line, laneRaw) {
    var cls = UI.laneClass(laneRaw); if (!cls) return '';
    var rs = (w.RULES || []).filter(function (r) { return r.line === line && r.lane === cls.name && r.when; });
    return rs.length ? rs[0].when : '';
  }
  function laneBadgeH(c) {
    var html = UI.laneBadge(c.lane), t = laneWhen(c.line, c.lane);
    if (!t) return html;
    var title = esc('该档判据:' + t);
    if (html.indexOf(' title="') >= 0) return html.replace(/ title="[^"]*"/, function () { return ' title="' + title + '"'; });
    return '<span title="' + title + '">' + html + '</span>';
  }
  function laneName(laneRaw) { var c = UI.laneClass(laneRaw); return c ? c.name : (laneRaw || '—'); }
  /* ---- 当前所在线 tab(手风琴/筛选的局部态按线分开存)---- */
  function curKey() {
    var m = String(w.location.hash || '').match(/#\/m1\/line\/(mh|rd|pl)/);
    return m ? m[1] : 'mh';
  }
  /* ---- 剩余时限文案(为什么在这:<档位>·剩 X 分)---- */
  function leftText(deadline) {
    if (!deadline) return '无倒计时';
    var m = S.slaLeft(deadline);
    return m < 0 ? ('已超 ' + Math.abs(m) + ' 分') : ('剩 ' + m + ' 分');
  }

  /* ============ 弹层规格(理由码/原因码全部走选择器,零自由文本)============ */
  var MODALS = {
    reject: {
      title: '驳回线索 · 必选六原因码之一',
      action: 'reject', submit: '提交驳回',
      intro: function () { return '驳回 ≠ 删除:线索转归档并按原因码回流各自消费者;高危件驳回自动拘进主管抽审。'; },
      fields: [
        { k: 'code', label: '驳回原因码(六码)', opts: rejectOpts() },
        { k: 'note', label: '备注(原因码⑥ 必填)', when: function (f) { return f.code === '⑥'; }, opts: [['转人工周审', '转人工周审(周会逐条过)'], ['规则组待判', '规则组待判(判据边界不清)']] }
      ],
      guard: function (f) { return (f.code === '⑥' && !f.note) ? '原因码⑥「其他」必须填备注' : null; },
      probe: function (id) { return { clueId: id, code: '①' }; },
      params: function (m, f) { return { clueId: m.id, code: f.code, note: f.note || '' }; }
    },
    overrule: {
      title: '推翻机械判定',
      action: 'overrule_mech', submit: '推翻并复活线索',
      intro: function () { return '人可以推翻机械闸:理由码必填,线索复活进人审车道,同时自动触发抽审 —— 误杀样本回流规则组。'; },
      fields: [{ k: 'reason', label: '推翻理由码', opts: rcOpts('overrule') }],
      probe: function (id) { return { clueId: id, reason: '预检' }; },
      params: function (m, f) { return { clueId: m.id, reason: f.reason }; }
    },
    recall: {
      title: '机器直派撤回 · 召回班组',
      action: 'fastlane_recall', submit: '显名撤回并召回',
      cls: 'btn-danger',
      intro: function (m) {
        var c = S.find.clue(m.id), tk = c && c.ticketId ? S.find.ticket(c.ticketId) : null;
        return '撤回是<b>显名动作</b>:线索转驳回流,班组按当前状态分支召回。<br>当前分支:' + esc(recallBranch(tk));
      },
      fields: [{ k: 'reason', label: '撤回理由码', opts: rcOpts('recall') }],
      probe: function (id) { return { clueId: id, reason: '预检' }; },
      params: function (m, f) { return { clueId: m.id, reason: f.reason }; }
    },
    transfer: {
      title: '转办产权单位',
      action: 'transfer', submit: '提交转办',
      intro: function () { return '非市政资产 → 转产权单位。<b>转办码 ≠ 驳回码</b>(不计误报),台账回写产权标注。'; },
      fields: [{ k: 'owner', label: '产权判定(承接产权单位)', opts: [['私产业主', '私产业主(商业/住宅红线内)'], ['国道管理机构', '国道管理机构(归属外)'], ['产权单位待确认', '产权单位待确认(先转办后核实)']] }],
      probe: function (id) { return { clueId: id, owner: '预检' }; },
      params: function (m, f) { return { clueId: m.id, owner: f.owner }; }
    },
    /* R88 A1⑬ 后半 · 主管主动提级(推翻「重复观测计数达阈值自动提级」):原因必填,显名留痕 */
    escalate: {
      title: '提级为急修 · 复核主管',
      action: 'clue_escalate', submit: '提交提级',
      cls: 'btn-primary',
      intro: function (m) {
        var c = S.find.clue(m.id);
        return '提级是<b>人做的显名动作</b>,不是系统按重复观测计数自动定性。' +
          (c ? ('当前档「' + esc(c.level) + '」→「急修」,车道转单条必审,SLA 按急修档重算。') : '');
      },
      fields: [{ k: 'reason', label: '提级原因(必填 · 进动作日志可回查)', opts: [
        ['同点位险情升级', '同点位险情升级(现场反馈异常扩大)'],
        ['临近学校/医院等敏感点', '临近学校 / 医院等敏感点位'],
        ['同点位重复观测集中', '同点位重复观测集中(计数只作输入,提级由我判定)'],
        ['雨前风险窗口', '雨前风险窗口(气象预警前处置提前)']
      ] }],
      probe: function (id) { return { clueId: id, reason: '预检' }; },
      params: function (m, f) { return { clueId: m.id, reason: f.reason || '' }; }
    },
    /* R89 A1 · 接手:从他人手上接过件 —— 原因必填,进动作日志与本件认领日志,不静默夺件 */
    takeover: {
      title: '接手 · 从他人手上接过这一件',
      action: 'claim_takeover', submit: '接手(记日志)',
      cls: 'btn-esc',
      intro: function (m) {
        var q = S.claimOf(m.id);
        if (!q || !q.assignee) return '本件还在公共池里,直接「认领」即可。';
        return '本件现在「<b>' + esc(q.assignee) + '</b>」名下。接手<b>不是静默夺件</b>:原因必填,写进动作日志与本件认领日志,原认领人可回查是谁在什么时候接走的。';
      },
      fields: [{ k: 'reason', label: '接手原因(必填 · 原认领人可回查)', opts: [
        ['原认领人离席', '原认领人离席 / 交接班,件不能压在手上'],
        ['时限将到需立即处置', '时限将到需立即处置'],
        ['需我这一级权限判定', '需我这一级权限判定(提级 / 裁定 / override)'],
        ['原认领人请求转交', '原认领人请求转交']
      ] }],
      guard: function (f) { return f.reason ? null : '接手原因必填'; },
      probe: function (id) { return { clueId: id, reason: '预检' }; },
      params: function (m, f) { return { clueId: m.id, reason: f.reason || '' }; }
    },
    verifyreject: {
      title: '复验打回 · 须附对比证据',
      action: 'verify_reject', submit: '打回并附证据',
      intro: function () { return '<b>永不默认打回</b>:AI 判不出只转「存疑待人裁」;打回必须是复核员显名动作并附复验对比证据,班组可申诉 → 主管裁。'; },
      fields: [{ k: 'evidence', label: '复验对比证据', opts: [['修复前后配准不通过', '修复前后配准不通过(同点位不同姿态)'], ['缺口未封闭', '现场复核:井口缺口未封闭'], ['完工照点位不符', '完工照点位与工单不符']] }],
      probe: function (id) { return { ticketId: id, evidence: '预检' }; },
      params: function (m, f) { return { ticketId: m.id, evidence: f.evidence }; }
    },
    revoke: {
      title: '撤销告警 · 记录不删除',
      action: 'revoke', submit: '撤销(留痕)',
      intro: function () { return '确认错了怎么办:主管撤销 —— 状态置「已撤销」,<b>记录永不删除</b>;理由码 + 证据入动作日志。'; },
      fields: [
        { k: 'reason', label: '撤销理由码', opts: [['现场核实无异常', '现场核实无异常'], ['重复告警', '重复告警(同点位已在办)'], ['定位偏移误判', '定位偏移误判']] },
        { k: 'evidence', label: '附证据', opts: [['班组到场回传对比', '班组到场回传对比'], ['传感器复位记录', '传感器复位记录'], ['现场复核示意', '现场复核示意']] }
      ],
      probe: function (id) { return { alertId: id, reason: '预检', evidence: '预检' }; },
      params: function (m, f) { return { alertId: m.id, reason: f.reason, evidence: f.evidence }; }
    },
    freeze: {
      title: '证据冻结 · 法务包',
      action: 'freeze_evidence', submit: '冻结并锚定哈希',
      intro: function () { return '涉事故/索赔件:全证据链快照锁定 + 哈希锚定,可导出法务包(动作日志防篡改口径 = 可检测)。'; },
      fields: [{ k: 'reason', label: '冻结事由', opts: [['涉人身伤害事故', '涉人身伤害事故'], ['涉第三方索赔', '涉第三方索赔'], ['涉行政复议/调查', '涉行政复议 / 调查']] }],
      probe: function (id) { return { targetId: id, reason: '预检' }; },
      params: function (m, f) { return { targetId: m.id, reason: f.reason }; }
    },
    override: {
      title: '紧急 override · 红色动作',
      action: 'override_emergency', submit: '执行 override(跳闸直接行动)',
      cls: 'btn-danger', danger: true,
      intro: function () { return '跳过闸门直接行动。代价明写:<b>红标日志 + 强制事后审计 + 双人知悉</b>。授权 = 主管以上;需红色弹层双确认。'; },
      fields: [
        { k: 'reason', label: 'override 理由', opts: [['人身安全即刻威胁', '人身安全即刻威胁'], ['命脉资产不可等待', '命脉资产不可等待'], ['跨机构联动已到场', '跨机构联动已到场(警察/民防)']] },
        { k: 'confirm2', label: '我确认跳闸直接行动,并知悉强制事后审计与双人知悉(第二次确认)', type: 'check' }
      ],
      probe: function (id) { return { clueId: id, reason: '预检', confirm2: true }; },
      params: function (m, f) { return { clueId: m.id, target: m.id, reason: f.reason, confirm2: !!f.confirm2 }; }
    },
    /* R87 A1 · 复核窗过后的第三条纠错道 */
    appeal: {
      title: '误报申诉 · 交主管裁定',
      action: 'misfire_appeal', submit: '提交申诉',
      intro: function () { return '告警转「申诉复核中」,原记录保留;裁定前处置不停,班组按现单继续。'; },
      fields: [
        { k: 'reason', label: '申诉理由码', opts: rcOpts('misfire') },
        { k: 'note', label: '补充说明(可选)', opts: [
          ['同点位近期重复报警', '同点位近期重复报警'],
          ['班组到场未见异常', '班组到场未见异常'],
          ['传感器近期有过更换/标定', '传感器近期有过更换 / 标定']
        ] }
      ],
      probe: function (id) { return { alertId: id, reason: '预检' }; },
      params: function (m, f) { return { alertId: m.id, reason: f.reason, note: f.note || '' }; }
    },
    ruling: {
      title: '误报申诉裁定 · 复核主管',
      action: 'misfire_ruling', submit: '提交裁定',
      cls: 'btn-primary',
      intro: function (m) {
        var al = S.find.alert(m.id), ap = al && al.appeal;
        return ap ? ('申诉人 ' + esc(ap.by) + ' · ' + esc(ap.t) + ' · 理由「' + esc(ap.reason) + '」' + (ap.note ? ';说明「' + esc(ap.note) + '」' : ''))
          : '该告警无待裁定申诉。';
      },
      fields: [
        { k: 'upheld', label: '裁定结论', opts: [['1', '申诉成立 → 告警置「误报撤销」(留痕不删)'], ['0', '申诉不成立 → 维持告警成立']] },
        { k: 'code', label: '误报归因码(决定回流去向)', when: function (f) { return f.upheld === '1'; }, opts: rejectOpts() },
        { k: 'note', label: '裁定说明', opts: [
          ['已调传感器原始报文核对', '已调传感器原始报文核对'],
          ['已看班组到场回传', '已看班组到场回传'],
          ['已比对同点位历史线索', '已比对同点位历史线索']
        ] }
      ],
      guard: function (f) {
        if (!f.upheld) return '请先选择裁定结论';
        if (f.upheld === '1' && !f.code) return '申诉成立须选误报归因码';
        return null;
      },
      probe: function (id) { return { alertId: id, upheld: true }; },
      params: function (m, f) {
        return { alertId: m.id, upheld: f.upheld === '1', code: f.code || '④', note: f.note || '' };
      }
    }
  };

  /* 宽卡片里的动作面板包装:按内容收窄(tokens 里 .act-item 是 flex 列,默认会拉满父宽) */
  function pw(html) { return '<div style="display:inline-block;min-width:212px;vertical-align:top">' + html + '</div>'; }

  /* 打开弹层的按钮:灰态与原因由 S.check(探针参数) 决定(R53) */
  function modalBtn(label, kind, id, cls, ctxId) {
    var spec = MODALS[kind];
    var r = S.check(spec.action, spec.probe(id));
    var off = !r.ok;
    return '<div class="act-item">' +
      '<button type="button" class="btn ' + (cls || '') + (off ? ' is-off' : '') + '"' + (off ? ' disabled' : '') +
      ' data-ui="modal" data-val="' + esc(kind + ':' + id + ':' + (ctxId || '')) + '"' +
      ' title="' + esc((S.ACTIONS[spec.action] || {}).hint || '') + '">' + esc(label) + '</button>' +
      (off ? '<span class="act-why">未满足:' + esc(r.reason) + '</span>' : '') + '</div>';
  }

  function field(f) {
    var v = M.form[f.k];
    if (f.type === 'check') {
      return '<label class="chk" style="margin-top:10px"><input type="checkbox" data-set="' + esc(f.k) + '"' +
        (v ? ' checked' : '') + '> <span>' + esc(f.label) + '</span></label>';
    }
    var opts = '<option value="">— 请选择 —</option>' + (f.opts || []).map(function (o) {
      return '<option value="' + esc(o[0]) + '"' + (v === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
    }).join('');
    return '<label class="fl">' + esc(f.label) + '</label><select data-set="' + esc(f.k) + '">' + opts + '</select>';
  }

  function renderModal() {
    if (!M.modal) return '';
    var spec = MODALS[M.modal.kind]; if (!spec) return '';
    var f = M.form;
    var body = (spec.fields || []).filter(function (x) { return !x.when || x.when(f); }).map(field).join('');
    var params = spec.params(M.modal, f);
    var guard = spec.guard ? spec.guard(f, M.modal) : null;
    var chk = S.check(spec.action, params);
    var off = !!guard || !chk.ok;
    var why = guard || chk.reason;
    return '<div class="mask" data-ui="closeself">' +
      '<div class="modal' + (spec.danger ? ' modal-danger' : '') + '">' +
      '<div class="card-hd"><h3>' + esc(spec.title) + '</h3>' +
      '<button type="button" class="btn btn-sm" data-ui="close">关闭</button></div>' +
      '<div class="small muted" style="margin-bottom:8px">' + (spec.intro ? spec.intro(M.modal) : '') + '</div>' +
      body +
      '<div class="sep"></div>' +
      '<div class="act-row">' +
      '<button type="button" class="btn ' + (spec.cls || 'btn-primary') + (off ? ' is-off' : '') + '"' + (off ? ' disabled' : '') +
      ' data-act="' + esc(spec.action) + '" data-p="' + UI.attr(params) + '">' + esc(spec.submit) + '</button>' +
      '<button type="button" class="btn" data-ui="close">取消</button></div>' +
      (off ? '<div class="act-why" style="margin-top:6px">未满足:' + esc(why) + '</div>' : '') +
      '<div class="tiny" style="margin-top:8px">提交后写一条动作日志(含理由码与判定版本字段),时间线可回查。</div>' +
      '</div></div>';
  }

  /* ============ 页头:术语分权 + R33 仲裁序 + 导览提示 ============ */
  function header(cur) {
    var st = S.get();
    var tabs = LINES.map(function (L) {
      var n = st.clues.filter(function (c) { return c.line === L.line && isOpen(c); }).length;
      var extra = L.key === 'pl' ? st.investigations.filter(function (k) { return k.status !== '已结案'; }).length : 0;
      return '<a href="#/m1/line/' + L.key + '" class="' + (L.key === cur ? 'is-on' : '') + '">' +
        esc(L.title) + ' <span class="badge badge-' + (L.key === cur ? 'blue' : 'grey') + '">' + (n + extra) + '</span></a>';
    }).join('');

    return '<div class="card card-tight">' +
      '<div class="card-hd"><h2>1 · 复核工作台</h2>' +
      '<span class="row" style="gap:8px;align-items:center">' +
      '<span class="tiny">当前身份 ' + esc(st.role) + '</span>' + UI.helpBtn('m1') + '</span></div>' +
      '<div class="oc-t3">跨线仲裁默认序:<b>井盖紧急 &gt; 管网紧急 &gt; 路面急修</b>;本线内机器直派件再置顶。复核主管可临时置顶改序,动作留痕。' +
      'SLA / 阈值数字均为' + UI.assume('假设值', '全部 SLA 与阈值为假设值,试点首周与客户核实后按区可配参数调整') + '。</div>' +
      '</div>' +
      '<div class="tabs">' + tabs + '</div>';
  }

  /* ============ 帮助浮层内容(R86 A4:组件内只留生产文案,解说迁到这里)============ */
  (w.HELP = w.HELP || {}).m1 = {
    title: '复核工作台 · 本模块职责',
    body:
      '<p><b>这一页干什么:</b>对 AI 与规则产出的线索做定性 —— 确认 / 驳回 / 转办 / 升格,每一次定性都留痕。复核员约九成工作时间在这一页。</p>' +
      '<p><b>线索 vs 告警:</b>AI 与规则只产「线索」;人确认签字后才叫「告警」—— 定性权永远在人。</p>' +
      '<p><b>双闸:</b>第一闸 = AI 识别;第二闸 = 机械证据校验(硬编码判据逐项打钩)。两闸都过的紧急件才有资格走机器直派。</p>' +
      '<p><b>三档通道判据:</b>机器直派 = 先派后审(机器先把单派出去,人 15 分钟并行复核可撤回);加急人工 / 常规人工 = 先审后派(分钟级单条确认 / 批量例行确认);另有自动处理(不派人)与驳回与转办(不进处置)。</p>' +
      '<p><b>线索的原子性:</b>同一设施(或 50m 路段栅格)× 同一异常类目 = 同一条线索;活跃期内每次新发现并入为一次「观测」,不新开线索。线索关闭后再发现才开新线索。</p>' +
      '<p><b>与客户系统的关系:</b>本平台负责巡检定性与证据链;派工与处置的记录系统是区市政工单系统,本模块产生的工单为镜像 + 写回,处置状态以客户系统为准。</p>' +
      '<p><b>数字口径:</b>模块内 SLA、阈值、抽审率均为假设值(带虚线下划线标注),试点首周与客户核实后按区可配参数标定。</p>' +
      /* R87 A4/⑯:以下从组件里挪进来的说明,原来贴在卡片上当小抄 —— 规则本体住 6 · 系统管理,工作台只在档位徽章上挂 hover */
      '<p><b>置信度的语义按线不同:</b>井盖与路面线是图像置信度;管网线是规则持续时长 × 多源一致度,不是图像置信度,所以两条线的数字不可互相比较。</p>' +
      '<p><b>机器直派件的代价:</b>该通道件全量拘进主管抽审(误派率月报口径);撤回件班组白跑不计考核,班组可申诉。</p>' +
      '<p><b>加急人工档的兜底:</b>超时走三级升级(区复核员 → 复核主管 → 上级主管部门),并发只读预警不定性也不派工;本档的确认与驳回都拘进主管抽审。' +
      '三级升级走完仍无人给结论,<b>系统自动派单兜底</b>(宁可多看一眼,不漏掉):单先发出去,告警仍不成立、定性仍悬,复核员事后补审,该件全量拘抽审。</p>' +
      '<p><b>机械闸的实际拦截面:</b>定位错 / 重复线索 / 证据质量不合格 / 管网线规则先行。树影这类物理上持续存在的假目标,机械闸拦不住 —— 误报主体仍由人驳回、按原因码回流模型。推翻机械判定 = 线索复活进人审 + 自动触发抽审,误杀样本回流规则组。</p>' +
      '<p><b>免人工车道的判据与兜底:</b>养护级 × 高置信 × 机械全过 = 自动并入周期养护计划;观察级 × 机械过 = 自动记台账入劣化曲线。免人工不豁免审计:每条一条动作日志,按抽审率捞回复查,抽审可推翻。</p>' +
      '<p><b>存疑归档:</b>既不算确认也不算驳回,计入模型评估统计;只在批量半审车道内可用。</p>' +
      /* R89 A1:认领制的机制说明从卡片挪进来 —— 界面上只留状态徽章与按钮,不在卡上讲机制 */
      '<p><b>认领制怎么用:</b>件默认在公共池,谁处置谁先认领 —— 认领后件锁到你名下,他人视图该件灰化标「已由 XX 认领」。未认领也能直接点处置动作:系统隐式认领并记两条日志(认领 + 处置),不必先点一次认领。他人手上的件要动,须走「接手」并填原因,认领转移进日志,原认领人可回查是谁在什么时候接走的 —— 不做静默夺件。</p>' +
      '<p><b>待处置区随角色变:</b>区复核员看待确认 / 待复核件,按剩余时限升序;复核主管看误报裁定(置顶)与自己认领的件,抽审与参数审批只给数与入口,处理在 4 · 兜底与质量与 6 · 系统管理两页做。侧边导航的红点角标 = 当前身份在该模块的待办数。</p>' +
      '<p><b>数据源隐性失效两态:</b>读数卡死(方差为零超时,过得了心跳过不了它)与量程饱和(强降雨积水恒满值,不等于失联),判据分开。先排设备故障,再报业务异常;设备工单承接方是传感网运维方,不进三线班组队列。</p>' +
      '<p><b>雨前清掏为什么是任务不是识别:</b>箅面干净不代表过水能力在,井筒淤积对视觉与液位皆盲。所以它按任务包与客户清掏计划对接,不靠识别。</p>' +
      '<p><b>漏报的正面答复:</b>不承诺不漏报;承诺每次定性可追溯 —— 该点位全部线索与处置记录 + 该点位观测覆盖窗。无传感器绑定的设施在事故回查时可据此区分「模型漏报」与「覆盖缺失」。</p>' +
      '<p><b>动作记录的版本字段:</b>每条动作记录带当时的规则包 / 参数集 / 模型 / 参考数据版本,三年后可重放当时的判定依据;动作日志保存 ≥3 年,防篡改口径 = 可检测。</p>' +
      '<p><b>高危件的作业与联动:</b>作业时窗与封控校验(斋月 / 高温禁令 / 活动封控 / 交管批文)排到最近可作业窗,SLA 停表;需警察 / 民防 / 产权单位到场时,原单挂起并在联动到位后自动回队。</p>' +
      '<p><b>管网调查案:</b>规则腿(硬编码水力学脚本)先行,AI 时序判型只提建议;视觉在本线是弱辅助(湿不等于漏)。人只在立案与结案两点拍板,系统出「建议结案」,签字仍在人。</p>' +
      '<p><b>复核窗过后的纠错道:</b>15 分钟并行复核窗只约束撤回召回。窗过后仍可提「误报申诉」交主管裁定;裁定申诉成立则告警置「误报撤销」(记录保留),班组白跑不计考核,误报原因回流规则引擎,并对该设施开传感器复检工单。</p>'
  };

  /* ============ 全部线索表(R87 A4:状态 / 档位筛选 + 点行内联展开同一详情组件)============ */
  function filtOf(key) {
    if (!M.filt[key]) M.filt[key] = { status: '', lane: '' };
    return M.filt[key];
  }
  function selBox(key, k, label, opts, cur) {
    return '<label class="tiny" style="display:inline-flex;align-items:center;gap:5px">' + esc(label) +
      '<select data-filt="' + esc(key + ':' + k) + '" style="width:auto">' +
      '<option value="">全部</option>' +
      opts.map(function (o) {
        return '<option value="' + esc(o[0]) + '"' + (cur === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>';
      }).join('') + '</select></label>';
  }
  function filterBar(key, list, shown) {
    var f = filtOf(key), sts = [], lns = [];
    list.forEach(function (c) {
      if (sts.indexOf(c.status) < 0) sts.push(c.status);
      var ln = laneName(c.lane);
      if (c.lane && lns.indexOf(ln) < 0) lns.push(ln);
    });
    return '<div class="row wrap" style="gap:12px;align-items:center;margin-bottom:8px">' +
      selBox(key, 'status', '状态', sts.map(function (s) { return [s, UI.statusText(s)]; }), f.status) +
      selBox(key, 'lane', '档位', lns.map(function (l) { return [l, l]; }), f.lane) +
      '<span class="tiny">显示 <b>' + shown + '</b> / ' + list.length + ' 条</span>' +
      ((f.status || f.lane) ? '<button type="button" class="btn btn-sm" data-filt="' + esc(key + ':clear') + '">清除筛选</button>' : '') +
      '</div>';
  }
  function queueTable(key, list) {
    if (!list.length) return '<div class="tiny">本线当前无线索。</div>';
    var f = filtOf(key);
    var view = list.filter(function (c) {
      if (f.status && c.status !== f.status) return false;
      if (f.lane && laneName(c.lane) !== f.lane) return false;
      return true;
    });
    var rows = view.map(function (c) {
      var urgent = isHigh(c) && isOpen(c), on = !!M.rowOpen[c.id];
      /* R89 A1:行也带认领态徽章;他人认领的行整行灰化(仍可点开、可进详情接手) */
      return '<tr class="' + (urgent ? 'is-urgent ' : '') + (on ? 'is-sel ' : '') + UI.claimCls(c.id).replace(/^\s+/, '') +
        '" data-row="' + esc(c.id) + '" style="cursor:pointer" title="点击展开详情">' +
        '<td><span class="acc-cev">' + (on ? '▾' : '▸') + '</span> <b>' + esc(c.id) + '</b>' + (c.fastlane ? ' ' + UI.badge('机器直派', 'amber') : '') +
        (c.overdueFallback ? ' ' + UI.badge('超时兜底已派单 · 定性待补审', 'amber') : '') +
        (isOpen(c) ? ' ' + UI.claimBadge(c.id) : '') +
        '<div class="tiny">观测 ' + (c.obsCount || UI.obsList(c).length) + ' 次 · 最近 ' + esc(c.lastSeen || c.t) + '</div></td>' +
        '<td>' + UI.addr(c.facility) + '<div class="tiny">' + esc(c.kindText || '') + '</div></td>' +
        '<td>' + UI.levelBadge(c.level) + '</td>' +
        '<td>' + confText(c) + '</td>' +
        '<td>' + (c.lane ? laneBadgeH(c) : '—') + '</td>' +
        '<td>' + slaCell(c) + '</td>' +
        '<td>' + UI.statusBadge(c.status) + '</td>' +
        '<td><a href="#/m1/clue/' + esc(c.id) + '" class="tiny">详情 →</a></td></tr>' +
        /* R88 靶单#3:行内展开 = 只读摘要(无动作按钮);动作只在置顶手风琴与详情页 */
        (on ? '<tr class="row-open"><td colspan="8">' + cardFor(c, true) + '</td></tr>' : '');
    }).join('');
    return filterBar(key, list, view.length) +
      '<table class="tb"><thead><tr>' +
      '<th style="width:140px">线索号</th><th>设施 · 地址</th><th style="width:74px">级别</th>' +
      '<th style="width:66px">置信度</th><th style="width:132px">档位</th><th style="width:104px">SLA 倒计时</th>' +
      '<th style="width:96px">状态</th><th style="width:62px">详情</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="tiny">筛选后无匹配线索。</td></tr>') + '</tbody></table>';
  }

  /* ============ 置顶区「待处置 · 按时限排序」(R87 A4:只放当前角色需动作的件 · 手风琴同时只开一条)============ */
  /* R88 A4① · 只读模式(ro=true):卡内嵌动作行全删,卡退化为「只读摘要」。
     动作只在两处:队列页置顶手风琴(唯一动作区之一)与线索详情右侧动作面板。
     调用点:详情页左列 / 全部线索表行内展开 → ro=true;置顶手风琴 → ro=false。 */
  /* 卡内证据缩略列:ro='detail' 时不渲染 —— 详情页下方已有唯一的「证据卡」区块,不重复出按钮 */
  function evCol(c, ro) {
    if (ro === 'detail') return '';
    return '<div style="width:286px;flex:none;min-width:212px">' + UI.evInset(UI.evThumb(c)) + '</div>';
  }
  function roNote(ro) {
    var where = (ro === 'detail') ? '本页右侧动作面板' : '该线索详情页的动作面板(或本页置顶待处置区)';
    return '<div class="tiny" style="margin-top:8px">只读摘要 —— 动作在' + esc(where) + '。</div>';
  }
  /* ============ R89 A4② · 卡头徽章:先去重再拼 ============
     规则住 UI.dedupeBadges:通道名与来源名重叠只显通道(来源留在卡内「来源」详情行);
     「紧急」level 与「紧急工单」type 只显一次。来源以 html:'' 入列 —— 只参与判据,不自己出徽章。 */
  function clueBadges(c) {
    return UI.dedupeBadges([
      { kind: 'level', text: c.level, html: UI.levelBadge(c.level) },
      { kind: 'lane', text: UI.laneText(c.lane), html: c.lane ? laneBadgeH(c) : '' },
      { kind: 'source', text: c.source, html: '' },
      { kind: 'other', text: c.overdueFallback ? '超时兜底已派单' : '', html: c.overdueFallback ? UI.badge('超时兜底已派单 · 定性待补审', 'amber') : '' }
    ]).map(function (x) { return x.html; }).filter(Boolean).join(' ');
  }
  /* 线索卡标题 = 线索号 + 去重徽章行 + 认领态徽章 */
  function clueTitle(c) {
    return esc(c.id) + ' ' + clueBadges(c) + ' ' + UI.claimBadge(c.id);
  }

  /* ============ R89 A1 · 认领态渲染件(判据唯一来源 = S.claimOf)============ */
  /* 卡壳灰化:他人认领 → 整卡灰 + 「已由 XX 认领」+「接手(需原因)」;我认领 → 左侧绿条 */
  function claimWrap(c, html) {
    var k = UI.claimCls(c.id);
    return k ? '<div class="' + k.replace(/^\s+/, '') + '">' + html + '</div>' : html;
  }
  /* 认领动作行:公共池 → 认领;他人认领 → 接手(弹层填原因);我认领 → 一句「可直接处置」 */
  function claimActs(c) {
    var q = S.claimOf(c.id);
    if (!q || !isOpen(c)) return '';
    if (q.pooled) {
      var r = S.check('claim', { clueId: c.id });
      return '<button type="button" class="btn btn-sm' + (r.ok ? '' : ' is-off') + '"' + (r.ok ? '' : ' disabled') +
        ' data-act="claim" data-p="' + UI.attr({ clueId: c.id }) + '"' +
        ' title="把公共池里的件锁到自己名下">认领</button>';
    }
    if (q.lockedByOther) return modalBtn('接手(需原因)', 'takeover', c.id, 'btn-esc');
    return '<span class="tiny">可直接处置</span>';
  }
  /* 认领条:徽章 + 归属句 + 动作 + 认领日志(详情页动作面板顶部 / 待处置卡内共用) */
  function claimBar(c) {
    var q = S.claimOf(c.id);
    if (!q) return '';
    var cls = q.lockedByOther ? ' is-held-bar' : (q.mine ? ' is-mine-bar' : '');
    var who = q.pooled ? '公共池 · 还没人认领'
      : (q.mine ? '在我名下(' + esc(S.get().role) + ')' : '已由「' + esc(q.assignee) + '」认领');
    return '<div class="clm-bar' + cls + '">' + UI.claimBadge(c.id) +
      '<b>' + who + '</b>' +
      (isOpen(c) ? '' : '<span class="tiny">已结件</span>') +
      '<span class="top-spacer"></span>' + claimActs(c) + '</div>' +
      UI.claimLogHtml(c.id);
  }
  /* R88 A2⑧ · 超时兜底件的显式态 */
  function fallbackBadge(c) {
    return c && c.overdueFallback ? ' ' + UI.badge('超时兜底已派单 · 定性待补审', 'amber') : '';
  }
  function fallbackBanner(c) {
    if (!c || !c.overdueFallback) return '';
    var fb = c.overdueFallback;
    return UI.banner('warn', '<b>超时兜底已派单 · 定性待补审</b> —— 人工确认档 ' + esc(fb.deadline || '—') +
      ' 到期无人给结论,系统于 ' + esc(fb.t || '—') + ' 自动派 ' + esc(fb.crew ? UI.crewName(fb.crew) : '(待改派)') +
      '(工单 ' + esc(fb.ticketId || '—') + ')。<b>告警仍未成立、定性仍悬</b>,请复核员补审;该件已全量拘抽审。');
  }
  /* 通用待处置卡(不属于机器直派 / 加急人工 / 机械驳回三种专卡的件) */
  function pendingCard(c, ro) {
    var body = fallbackBanner(c) + UI.obsLine(c) +
      '<div class="row wrap" style="align-items:flex-start">' +
      '<div class="grow" style="min-width:230px">' +
      UI.kv([
        ['通道', laneBadgeH(c) + ' <span class="tiny">' + esc(UI.laneKind(c.lane) || '') + '</span>', true],
        ['SLA 倒计时', c.slaDeadline ? (UI.sla(c.slaDeadline) + ' · 截止 ' + esc(c.slaDeadline)) : '批量车道 · 按批计', true],
        ['机械校验', ((c.checks || []).filter(function (x) { return x.result === 'pass'; }).length) + '/' + (c.checks || []).length + ' 项通过'],
        ['来源', esc(c.source || '—')],
        ['异常', esc(c.kindText || '—')]
      ]) + '</div>' +
      evCol(c, ro) +
      '</div>' +
      (ro ? roNote(ro) : '<div class="sep"></div>' + claimBar(c) +
        '<div class="row wrap"><div class="grow">' + pw(UI.actionPanel([
          { action: 'confirm', params: { clueId: c.id }, label: '确认(线索成立)', cls: 'btn-ok' }
        ])) + '</div><div class="grow">' +
        pw(modalBtn('驳回(六码)', 'reject', c.id, 'btn-rej') + modalBtn('转办产权单位', 'transfer', c.id, 'btn-neu')) +
        '</div></div>');
    return tcard('clue', clueTitle(c), body,
      '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">进详情 →</a>', { line: c.line });
  }
  /* 同一详情组件:置顶卡与表内展开共用(ro=true 时为只读摘要);他人认领的件整卡灰化 */
  function cardFor(c, ro) {
    var html;
    if (c.fastlane && isOpen(c)) html = fastlaneCard(c, ro);
    else if (c.lane === '加急人工' && isOpen(c)) html = urgentReviewCard(c, ro);
    else if (c.mechFail) html = mechRejectCard(c, ro);
    else html = pendingCard(c, ro);
    return claimWrap(c, html);
  }
  /* 待裁定卡:误报申诉交到复核主管手上的那一件 */
  function rulingCard(al, ro) {
    var ap = al.appeal || {}, c = al.clueId ? S.find.clue(al.clueId) : null;
    var body = UI.banner('warn', '<b>误报申诉待裁定</b> —— ' + esc(al.id) + '(' + UI.addr(al.facility) + ')') +
      UI.kv([
        ['申诉人 · 时刻', esc(ap.by || '—') + ' · ' + esc(ap.t || '—')],
        ['申诉理由码', esc(ap.reason || '—')],
        ['补充说明', esc(ap.note || '—')],
        ['源线索', c ? ('<a href="#/m1/clue/' + esc(c.id) + '">' + esc(c.id) + '</a> · ' + esc(c.kindText || '')) : '—', true],
        ['告警状态', UI.badge(al.status, 'amber'), true]
      ]) +
      (ro ? roNote(ro) : '<div class="sep"></div>' + pw(modalBtn('申诉裁定(成立 / 不成立)', 'ruling', al.id, 'btn-primary')));
    return tcard('alert', '误报申诉裁定 · ' + esc(al.id), body,
      c ? '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">看源线索 →</a>' : '', { tag: '待裁定' });
  }
  /* ============ R89 ⑥ · 角色视角过滤 + A1 认领过滤 ============
     取件判据与 S.todoCount(role).detail 同源:
       区复核员   = 本线待确认 / 待复核件(池中未认领 + 我认领未结 + 他人认领的灰件)
       复核主管   = 误报裁定件置顶 + 我认领未结件 + 待抽审(链去 m4)/ 参数审批(链去 m6)两条提示
     排序随之变:主管的裁定件恒在最前,提示条恒在最后;复核员一律按剩余时限升序。 */
  function claimFiltOf(key) {
    if (!M.cfilt) M.cfilt = {};
    if (!M.cfilt[key]) M.cfilt[key] = 'all';
    return M.cfilt[key];
  }
  /* 本角色在本线需要动作的线索件(未过认领筛选) */
  function pendClues(line) {
    var role = S.get().role;
    if (!canRole('confirm')) return [];
    return cluesOf(line).filter(function (c) {
      if (!isOpen(c)) return false;
      if (!(c.fastlane || c.mechFail || c.slaDeadline)) return false;   // 有 SLA 倒计时 / 待确认的才进置顶区
      if (role === '复核主管') {                                        // 主管视角:定性主力是复核员,他只留自己接过手的件
        var q = S.claimOf(c.id);
        if (!q || !q.mine) return false;
      }
      return true;
    });
  }
  /* 认领三态计数(过滤 tab 上的 N) */
  function claimTally(list) {
    var t = { mine: 0, pool: 0, all: list.length };
    list.forEach(function (c) {
      var q = S.claimOf(c.id) || {};
      if (q.mine) t.mine++;
      else if (q.pooled) t.pool++;
    });
    return t;
  }
  function claimPass(c, view) {
    if (view === 'all') return true;
    var q = S.claimOf(c.id) || {};
    return view === 'mine' ? !!q.mine : !!q.pooled;
  }
  function pendingList(line, key) {
    var st = S.get(), role = st.role, out = [];
    var view = claimFiltOf(key || keyOfLine(line));
    pendClues(line).forEach(function (c) {
      if (!claimPass(c, view)) return;
      var dl = (c.fastlane && c.reviewEnd) ? c.reviewEnd : c.slaDeadline;
      var q = S.claimOf(c.id) || {};
      out.push({
        id: c.id, sort: dl ? S.slaLeft(dl) : 9999,
        head: '<b>' + esc(c.id) + '</b> ' + clueBadges(c) + ' ' + UI.claimBadge(c.id) +
          ' <span class="oc-t3">' + esc(c.kindText || '') + ' · ' + UI.addr(c.facility) + '</span>',
        right: '为什么在这:<b>' + esc(laneName(c.lane)) + '</b> · ' + esc(leftText(dl)) +
          (q.lockedByOther ? ' · <b>他人在办</b>' : (q.mine ? ' · <b>我认领</b>' : '')),
        body: cardFor(c)
      });
    });
    if (canRole('misfire_ruling')) {
      (st.alerts || []).filter(function (a) { return a.status === '申诉复核中' && a.line === line; }).forEach(function (al) {
        out.push({
          id: al.id, sort: -1000,
          head: '<b>' + esc(al.id) + '</b> ' + UI.badge('申诉复核中', 'amber') +
            ' <span class="oc-t3">误报申诉待裁定 · ' + UI.addr(al.facility) + '</span>',
          right: '为什么在这:<b>误报申诉</b> · 待你裁定',
          body: rulingCard(al)
        });
      });
    }
    out.sort(function (a, b) { return a.sort - b.sort; });
    /* 主管视角的两条跨模块提示:本页做不了的两件事,给数 + 给门,不在这里重做一遍 */
    if (role === '复核主管') {
      var cnt = S.todoCount(role) || { detail: {} };
      if (cnt.m4) {
        out.push({
          id: '_todo_m4', sort: 9000,
          head: '<b>待抽审 ' + cnt.m4 + ' 件</b> ' + UI.badge('归你裁', 'amber') +
            ' <span class="oc-t3">抽审队列在「4 · 兜底与质量」</span>',
          right: '为什么在这:<b>主管职权</b> · 不在本页做',
          body: '<div class="tiny" style="margin-bottom:8px">待抽审 ' + cnt.m4 + ' 件 · 处理入口:4 · 兜底与质量</div>' +
            '<a class="btn btn-sm btn-evi" href="#/m4">去抽审队列 →</a>'
        });
      }
      if (cnt.m6) {
        out.push({
          id: '_todo_m6', sort: 9001,
          head: '<b>参数审批 ' + cnt.m6 + ' 项</b> ' + UI.badge('影子试算待批', 'amber') +
            ' <span class="oc-t3">规则参数在「6 · 系统管理」</span>',
          right: '为什么在这:<b>主管职权</b> · 不在本页做',
          body: '<div class="tiny" style="margin-bottom:8px">影子试算(未生效)' + cnt.m6 + ' 项 · 处理入口:6 · 系统管理</div>' +
            '<a class="btn btn-sm btn-evi" href="#/m6">去参数变更 →</a>'
        });
      }
    }
    return out;
  }
  /* 当前展开的那一条:未点过 = 默认展开最紧的一条 */
  function curOpen(key) {
    var items = pendingList(lineOfKey(key).line, key);
    var cur = M.acc[key];
    if (cur === '') return '';                                   // 用户显式收起了
    if (cur !== undefined) {
      for (var i = 0; i < items.length; i++) if (items[i].id === cur) return cur;
    }
    return items[0] ? items[0].id : '';                          // 没点过 / 原来那条已不在队列 → 展开最紧的一条
  }
  /* 认领过滤 tab:我的(N) / 公共池(N) / 全部(N) */
  function claimTabs(key, line) {
    var t = claimTally(pendClues(line)), cur = claimFiltOf(key);
    var defs = [['mine', '我的', t.mine], ['pool', '公共池', t.pool], ['all', '全部', t.all]];
    return '<span class="ctab">' + defs.map(function (d) {
      return '<button type="button" class="' + (cur === d[0] ? 'is-on' : '') + '" data-cfilt="' + esc(key + ':' + d[0]) + '">' +
        esc(d[1]) + '(' + d[2] + ')</button>';
    }).join('') + '</span>';
  }
  function pendingSection(key, line) {
    var items = pendingList(line, key);
    var openId = curOpen(key);
    var role = S.get().role;
    var viewNote = role === '复核主管'
      ? '视角:复核主管 · 排序:误报裁定置顶,其余按剩余时限'
      : '视角:区复核员 · 排序:剩余时限升序';
    var body = '<div class="tiny" style="margin-bottom:8px">' + esc(viewNote) + '</div>' +
      (items.length
        ? UI.accordion(items, openId)
        : '<div class="tiny">当前身份「' + esc(role) + '」在本线、当前认领筛选下没有待处置的件。</div>');
    return card('待处置 · 按时限排序(' + items.length + ')', body,
      claimTabs(key, line) + '<span class="tiny">同时只展开一条 · 档位徽章悬停看该档判据</span>', 'card-tight');
  }

  /* ============ 机器直派并行复核卡(T1/T2 后出现)============ */
  function fastlaneCard(c, ro) {
    var tk = c.ticketId ? S.find.ticket(c.ticketId) : null;
    var cw = tk && tk.crew ? S.find.crew(tk.crew) : null;
    var body =
      UI.banner('info', '<b>机器派单,人复核中</b> —— ' + esc(c.id) + ' 双闸硬证据齐,系统已自动派 ' +
        esc(cw ? cw.name : '班组') + (tk ? '(紧急工单 ' + esc(tk.id) + ' · 镜像 ' + esc(tk.mirror) + ')' : '') + '。') +
      UI.obsLine(c) +
      '<div class="row wrap" style="align-items:flex-start">' +
      '<div class="grow" style="min-width:220px">' +
      UI.kv([
        ['并行复核窗', '截止 ' + esc(c.reviewEnd || '—') + ' · ' + UI.sla(c.reviewEnd || c.slaDeadline) + ' ' + UI.assume('(窗长 15 分钟)', '15 分钟并行复核窗 = 假设值;超时走三级升级'), true],
        ['通道', laneBadgeH(c) + ' <span class="tiny">' + esc(UI.laneKind(c.lane) || '') + '</span>', true],
        ['当前工单', tk ? (esc(tk.id) + ' · ' + esc(tk.state) + ' · ' + esc(cw ? cw.name : '—')) : '—'],
        ['撤回后果', esc(recallBranch(tk))]
      ]) +
      '</div>' +
      evCol(c, ro) +
      '</div>' +
      (ro ? roNote(ro) : '<div class="sep"></div>' + claimBar(c) +
        '<div class="row wrap">' +
        '<div class="grow">' + pw(UI.actionPanel([
          { action: 'confirm', params: { clueId: c.id }, label: '确认 = 告警追认', cls: 'btn-ok' }
        ])) + '</div>' +
        '<div class="grow">' + pw(modalBtn('机器直派撤回(理由码 · 召回班组)', 'recall', c.id, 'btn-rej')) + '</div>' +
        '</div>') +
      '<div class="tiny" style="margin-top:8px"><a href="#/m4">该件已入抽审队列 →</a></div>';
    return tcard('clue', '机器直派并行复核 · ' + clueTitle(c) + ' ' + UI.badge('先派后审', 'amber'),
      body, '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">进详情 →</a>', { line: c.line });
  }

  /* ============ 加急人工卡(T5 · 0.31 件,与机器直派成对照)============ */
  function urgentReviewCard(c, ro) {
    var body =
      fallbackBanner(c) +
      '<div class="banner banner-warn"><span class="banner-ico">!</span><span>' +
      '<b>为什么它不走机器直派:</b>置信 ' + esc(conf2(c.conf)) + ' 纯视觉、<b>无传感器硬证据</b>,机械四项未全过 —— 双闸硬条件不满足。' +
      '低置信不等于放过:紧急级<b>不看置信度</b>,强制人核。</span></div>' +
      UI.obsLine(c) +
      '<div class="row wrap" style="align-items:flex-start">' +
      '<div class="grow" style="min-width:230px">' +
      UI.kv([
        ['通道', laneBadgeH(c) + ' <span class="tiny">' + esc(UI.laneKind(c.lane) || '') + '</span>', true],
        ['SLA 倒计时', UI.sla(c.slaDeadline) + ' · 截止 ' + esc(c.slaDeadline || '—') + ' ' + UI.assume('(档长 30 分钟)', '加急人工 SLA 30 分钟 = 假设值,区可配'), true],
        ['机械校验', ((c.checks || []).filter(function (x) { return x.result === 'pass'; }).length) + '/' + (c.checks || []).length + ' 项通过'],
        ['来源', esc(c.source || '—')]
      ]) + '</div>' +
      evCol(c, ro) +
      '</div>' +
      (ro ? roNote(ro) : '<div class="sep"></div>' + claimBar(c) +
        '<div class="row wrap"><div class="grow">' + pw(UI.actionPanel([
          { action: 'confirm', params: { clueId: c.id }, label: '确认(线索成立)', cls: 'btn-ok' }
        ])) + '</div><div class="grow">' +
        pw(modalBtn('驳回(六码)', 'reject', c.id, 'btn-rej') + modalBtn('转办产权单位', 'transfer', c.id, 'btn-neu')) +
        '</div></div>');
    return tcard('clue', '加急人工 · ' + clueTitle(c) + ' ' + UI.badge('置信 ' + conf2(c.conf), 'grey') +
      (c.slaDeadline && S.slaLeft(c.slaDeadline) < 0 ? ' ' + UI.badge('人工确认档已过时限', 'red') : ''),
      body, '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">进详情 →</a>', { line: c.line });
  }

  /* ============ 机械驳回置顶证据卡(T6 树影件:高危零自动归档)============ */
  function mechRejectCard(c, ro) {
    var bad = (c.checks || []).filter(function (x) { return x.result === 'fail' || x.result === 'warn'; })
      .map(function (x) { return x.name; }).join(' / ');
    var done = c.status === 'rejected';
    var body =
      '<div class="banner banner-warn"><span class="banner-ico">!</span><span>' +
      '<b>机械校验硬失败,但高危件零自动归档</b> —— 未过项:' + esc(bad || '—') +
      '。证据卡<b>置顶</b>,转加急人工驳回确认(高危零自动归档验收线)。</span></div>' +
      (done ? UI.banner('warn', '<b>高危驳回已拘主管抽审</b> —— ' + esc(c.id) + ' 原因码 ' + esc(c.rejectCode || '') +
        ';复核员把真异常驳回成树影时,由抽审发现。') : '') +
      UI.obsLine(c) +
      '<div class="row wrap" style="align-items:flex-start">' +
      evCol(c, ro) +
      '<div class="grow" style="min-width:240px">' + UI.checksCard(c) + '</div></div>' +
      (ro ? roNote(ro) : '<div class="sep"></div>' + claimBar(c) +
        '<div class="row wrap"><div class="grow">' +
        pw(UI.actionPanel([{ action: 'reject', params: { clueId: c.id, code: '①' }, label: '认可机械判定 · 驳回(码① 拍摄干扰)', cls: 'btn-rej' }]) +
        modalBtn('其他原因码驳回…', 'reject', c.id, 'btn-rej')) +
        '</div><div class="grow">' +
        pw(modalBtn('推翻机械判定(理由码必填)', 'overrule', c.id, 'btn-esc')) +
        '</div></div>');
    return tcard('clue', '机械驳回置顶 · ' + clueTitle(c),
      body, '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">进详情 →</a>', { line: c.line });
  }

  /* ============ 自动升格演示(T7:免人工件 + 抽审兜底)============ */
  function autoUpgradeCard(list) {
    if (!list.length) return '';
    var rows = list.map(function (c) {
      return '<tr data-goto="#/m1/clue/' + esc(c.id) + '" style="cursor:pointer">' +
        '<td><b>' + esc(c.id) + '</b></td><td>' + UI.addr(c.facility) + '<div class="tiny">' + esc(c.kindText) + '</div></td>' +
        '<td>' + UI.levelBadge(c.level) + '</td><td>' + confText(c) + '</td>' +
        '<td>' + laneBadgeH(c) + '</td>' +
        '<td>' + UI.badge('本条未经人工,抽审兜底', 'amber') + '</td></tr>';
    }).join('');
    var body = UI.banner('info', '<b>自动升格(免人工)</b> —— 本批已自动并入周期养护计划与台账,每条一条动作日志,抽审兜底。') +
      '<table class="tb"><thead><tr><th style="width:120px">线索号</th><th>设施 · 地址</th><th style="width:74px">级别</th><th style="width:66px">置信度</th><th style="width:110px">车道</th><th style="width:200px">人工参与</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="tiny" style="margin-top:6px">事后抽审已入队(抽审率对批量确认件 = ' + UI.assume('15%', '批量件抽审率 15% = 假设值;自动升格件按批入抽审队列') + ')。 <a href="#/m4">抽审入口 →</a></div>';
    return card('自动升格(免人工)· ' + list.length + ' 条', body);
  }

  /* ============ 批量半审工作台(路面 12 条:批量确认 + 存疑归档)============ */
  function batchView(list) {
    if (!list.length) return '';
    var picked = list.filter(function (c) { return M.picks[c.id]; }).map(function (c) { return c.id; });
    var allOn = picked.length === list.length && list.length > 0;

    var rows = list.map(function (c) {
      var on = !!M.picks[c.id];
      return '<tr class="' + (on ? 'is-sel' : '') + '">' +
        '<td style="width:30px"><input type="checkbox" data-pick="' + esc(c.id) + '"' + (on ? ' checked' : '') + '></td>' +
        (M.expanded ? '<td style="width:130px"><div class="ev" style="width:118px">' + UI.evidenceSvg((c.evidence[0] || {}).kind) + '</div></td>' : '') +
        '<td><a href="#/m1/clue/' + esc(c.id) + '"><b>' + esc(c.id) + '</b></a>' +
        (c.conf <= 0.6 ? '<div class="tiny">低置信 ' + esc(conf2(c.conf)) + ' · 演存疑归档</div>' : '') + '</td>' +
        '<td>' + UI.addr(c.facility) + '<div class="tiny">' + esc(c.kindText) + '</div></td>' +
        '<td>' + UI.levelBadge(c.level) + '</td>' +
        '<td>' + confText(c) + '</td>' +
        '<td>' + laneBadgeH(c) + '</td>' +
        '<td>' + ((c.checks || []).filter(function (x) { return x.result === 'pass'; }).length) + '/' + (c.checks || []).length + '</td>' +
        '<td>' + UI.statusBadge(c.status) + '</td>' +
        '<td style="width:96px">' + UI.actionRow([{ action: 'archive_doubt', params: { clueId: c.id }, label: '存疑归档' }]) + '</td></tr>';
    }).join('');

    var body =
      '<div class="row wrap" style="align-items:center;margin-bottom:8px">' +
      '<label class="chk"><input type="checkbox" data-pick="*"' + (allOn ? ' checked' : '') + '> 全选本批</label>' +
      '<button type="button" class="btn btn-sm" data-ui="expand">' + (M.expanded ? '✓ 缩略证据已展开' : '展开批内缩略证据') + '</button>' +
      '<span class="tiny">已选 <b>' + picked.length + '</b> 条 · 单批上限 ' + UI.assume('20 条', '单批 ≤20 条 = 提交校验,假设值') + ' · 批量件抽审率 ' + UI.assume('15%', '批量确认件抽审率 15% = 假设值') + '</span>' +
      '<span class="top-spacer"></span>' +
      '</div>' +
      pw(UI.actionPanel([{ action: 'batch_confirm', params: { clueIds: picked, expanded: M.expanded }, label: '批量确认(' + picked.length + ' 条)→ 并入养护计划', cls: 'btn-primary' }])) +
      '<div class="sep"></div>' +
      '<table class="tb"><thead><tr><th></th>' + (M.expanded ? '<th>缩略证据</th>' : '') +
      '<th style="width:126px">线索号</th><th>设施 · 地址</th><th style="width:66px">级别</th><th style="width:64px">置信度</th>' +
      '<th style="width:88px">车道</th><th style="width:56px">机械校验</th><th style="width:92px">状态</th><th>动作</th></tr></thead><tbody>' +
      rows + '</tbody></table>';
    return card('批量半审工作台 · ' + list.length + ' 条(路面养护流)', body,
      '<span class="tiny">提交校验:单批 ≤20 + 批内缩略证据展开过</span>');
  }

  /* ============ 调查案视图(管网线:立案 → 核查 → 建议结案 → 人结案)============ */
  function caseCard(k) {
    var steps = ['观察中', '已立案', '建议结案', '已结案'];
    var curIdx = steps.indexOf(k.status); if (curIdx < 0) curIdx = 0;
    var chain = steps.map(function (s, i) {
      var on = i <= curIdx;
      return '<span class="badge badge-' + (i === curIdx ? 'blue' : (on ? 'green' : 'grey')) + '">' + esc(s) + '</span>' +
        (i < steps.length - 1 ? ' <span class="faint">→</span> ' : '');
    }).join('');
    var tk = k.ticketId ? S.find.ticket(k.ticketId) : null;
    var body =
      '<div style="margin-bottom:8px">' + chain + '</div>' +
      '<div class="row wrap" style="align-items:flex-start">' +
      '<div class="grow" style="min-width:250px">' +
      UI.kv([
        ['调查案#', esc(k.id) + ' · ' + esc(k.dma)],
        ['关于', UI.addr(k.facility), true],
        ['观察窗', esc(k.window || '—')],
        ['判据', esc(k.basis || '—') + ' ' + UI.assume('(y% / M 次 = 假设值)', '偏差阈值 y% 与连续次数 M = 假设值,试点首周实测标定'), true],
        ['旁证', '自动调度视觉旁证 + 现场核查(听漏 / 分段关阀)', true],
        ['流量回归', k.flowGreen ? UI.badge('绿标已亮 · 水量平衡回落阈值内', 'green') : UI.badge('未回归基线', 'grey'), true],
        ['核查工单', tk ? (esc(tk.id) + ' · ' + esc(tk.state) + ' · ' + esc(UI.crewName(tk.crew))) : '—']
      ]) +
      '</div>' +
      '<div style="width:250px;flex:none">' + UI.evInset(UI.evidenceGrid(k.evidence || [{ kind: 'flow-curve' }])) + '</div>' +
      '</div>' +
      '<div class="sep"></div>' +
      pw(UI.actionPanel([
        { action: 'open_case', params: { caseId: k.id }, label: '立案 → 开核查任务', cls: 'btn-primary' },
        { action: 'close_case', params: { caseId: k.id }, label: '结案(人签字)', cls: 'btn-ok' }
      ]));
    return tcard('case', '调查案 ' + esc(k.id) + ' ' + UI.badge(k.status, k.status === '已结案' ? 'green' : 'blue'), body, '', { color: '#6b3fa0' });
  }

  /* ============ 数据源健康(隐性失效两态 / 设备工单)============
     R88 A4⑯:全局大卡从队列主区下沉 —— 队列页只在「本线概览」折叠区放一行摘要 + 明细表;
     单条线索的观测状况改在详情页按设施派生(facilityObsCard);全局汇总仍在 m5 统计页一处。 */
  function healthOf(L) {
    var st = S.get();
    var facIds = st.facilities.filter(function (f) { return f.line === L.line; }).map(function (f) { return f.id; });
    var all = st.sensors.filter(function (s) { return facIds.indexOf(s.facility) >= 0; });
    var bad = all.filter(function (s) { return s.health !== '正常'; });
    var devTk = st.tickets.filter(function (t) { return t.type === '设备工单' && t.line === L.line; });
    return { all: all, bad: bad, devTk: devTk };
  }
  /* 一行摘要(概览折叠区标题右侧也用它) */
  function healthLine(L) {
    var h = healthOf(L);
    return '数据源健康:' + h.all.length + ' 个点位 · ' +
      (h.bad.length ? UI.badge('异常 ' + h.bad.length, 'amber') : UI.badge('全部正常', 'green')) +
      (h.devTk.length ? ' · 设备工单 ' + h.devTk.length + ' 单(承接方:传感网运维方)' : '');
  }
  function healthBlock(L) {
    var h = healthOf(L);
    var rows = h.bad.map(function (s) {
      return '<tr><td><b>' + esc(s.id) + '</b></td><td>' + esc(s.type) + '</td><td>' + UI.addr(s.facility) + '</td>' +
        '<td>' + UI.badge(s.health, 'amber') + '</td><td class="tiny">' + esc(s.window || '') + '</td></tr>';
    }).join('');
    return '<div class="small">' + healthLine(L) + '</div>' +
      (rows ? '<table class="tb" style="margin-top:6px"><thead><tr><th style="width:110px">点位</th><th style="width:110px">类型</th><th>设施 · 地址</th><th style="width:190px">自检状态</th><th>观测覆盖窗</th></tr></thead><tbody>' + rows + '</tbody></table>' : '') +
      (h.devTk.length ? '<div class="tiny" style="margin-top:6px">已自动开设备工单:' + h.devTk.map(function (t) { return esc(t.id) + '(' + esc(t.state) + ')'; }).join(' · ') +
        ' · 承接方:传感网运维方。 <a href="#/m2">工单镜像 →</a></div>' : '') +
      '<div class="tiny" style="margin-top:6px">全局汇总口径在 <a href="#/m5">5 · 统计与月报</a> 一处;单条线索的观测状况在该线索详情页。</div>';
  }

  /* ============ 气象预警 · 雨前清掏专项任务包(T12;计划性任务,不动分级也不动派单标准)============ */
  function weatherCard() {
    var st = S.get();
    var wa = st.gov.weatherAlert;
    if (!wa) return '';
    var tks = st.tickets.filter(function (t) { return t.type === '雨前专项任务'; });
    var body = UI.banner('info', '<b>' + esc(wa.level || '气象预警') + '</b> —— 提前量 ' + esc(String(wa.leadHours || '—')) +
      ' 小时(' + esc(wa.t || '—') + ' 下发)。本预警只触发<b>计划性专项任务</b>:雨前清掏按任务包下发;' +
      '<b>在池件分级不变、机器直派准入标准不变</b>。') +
      '<div class="small"><b>雨前清掏核查任务包</b>:' +
      (tks.length ? tks.map(function (t) { return esc(t.id) + ' · ' + esc(t.state) + ' · ' + esc(UI.crewName(t.crew)) + ' · ' + UI.addr(t.facility); }).join(' ; ') : '待下发') +
      ' <a href="#/m2">工单镜像 →</a></div>';
    return card('气象预警 · 雨前清掏专项任务包 ' + UI.badge('计划性任务', 'blue'), body);
  }

  /* ============ R88 A4⑯ · 本设施观测状况(线索详情内一行,从 sensors / observations 派生)============ */
  function facilityObsCard(c) {
    var f = S.find.facility(c.facility);
    var sns = ((f && f.sensors) || []).map(function (sid) { return S.find.sensor(sid); }).filter(Boolean);
    var badN = sns.filter(function (s) { return s.health !== '正常'; }).length;
    var os = UI.obsList(c);
    var last = c.lastSeen || (os[os.length - 1] && os[os.length - 1].t) || c.t;
    var ways = [];
    os.forEach(function (o) { var k = o.kind || '其他'; if (ways.indexOf(k) < 0) ways.push(k); });
    sns.forEach(function (s) { var k = '传感器(' + s.type + ')'; if (ways.indexOf(k) < 0) ways.push(k); });
    var health = !sns.length
      ? UI.badge('本设施无传感器绑定 · 覆盖缺口', 'grey')
      : (badN ? UI.badge(sns.length - badN + '/' + sns.length + ' 正常 · ' + badN + ' 异常', 'amber')
        : UI.badge(sns.length + '/' + sns.length + ' 正常', 'green'));
    var rows = sns.map(function (sn) {
      return '<tr><td><b>' + esc(sn.id) + '</b></td><td>' + esc(sn.type) + '</td><td>' +
        UI.badge(sn.health, sn.health === '正常' ? 'green' : 'amber') + '</td><td class="tiny">' + esc(sn.window || '') + '</td></tr>';
    }).join('');
    var body = UI.kv([
      ['传感器健康', health, true],
      ['最近观测', esc(last || '—') + ' · 共 ' + os.length + ' 次观测', true],
      ['覆盖方式', ways.join(' / ') || '—']
    ]) +
      (rows ? '<table class="tb"><thead><tr><th style="width:110px">数据源点位</th><th style="width:120px">类型</th><th style="width:110px">自检</th><th>覆盖窗</th></tr></thead><tbody>' + rows + '</tbody></table>'
        : '<div class="tiny">本设施<b>无传感器绑定</b>(观测覆盖缺口)。</div>');
    return card('本设施观测状况 · ' + esc(c.facility), body,
      '<span class="tiny">按本设施派生 · 全线汇总见 <a href="#/m5">m5</a></span>');
  }

  /* 本线统计一行(概览折叠区内;全局统计口径仍在 m5) */
  function lineStats(L, all) {
    function n(fn) { return all.filter(fn).length; }
    return '<div class="row wrap" style="gap:18px">' +
      [['在池待核查', n(isOpen)], ['已确认成立', n(function (c) { return c.status === 'confirmed'; })],
       ['已驳回', n(function (c) { return c.status === 'rejected'; })],
       ['免人工自动办结', n(function (c) { return c.status === 'auto_done'; })],
       ['本线线索合计', all.length]].map(function (p) {
        return '<div style="min-width:96px"><div class="tiny">' + esc(p[0]) + '</div><div class="oc-t1">' + p[1] + '</div></div>';
      }).join('') + '</div>' +
      '<div class="tiny" style="margin-top:4px">本线口径;跨线与月报口径在 <a href="#/m5">5 · 统计与月报</a>。</div>';
  }

  /* ============ 三个 tab 的队列页(R88 靶单#4:两层化)============
     第一层「本线概览」= 折叠区(默认收):健康摘要 / 任务包 / 本线统计 —— 全局性、不需当场动手的东西;
     第二层「线索队列」= 主区(常开):置顶待处置 + 本线专有工作区 + 全部线索表;动作日志折叠在末尾。 */
  function queuePage(key) {
    var L = lineOfKey(key), st = S.get();
    var all = cluesOf(L.line);
    var html = '';

    /* ① 本线概览(默认收起) */
    var ov = '';
    if (L.key === 'mh') ov += weatherCard();
    if (L.key === 'rd') ov += autoUpgradeCard(all.filter(function (c) { return c.status === 'auto_done'; }));
    ov += card('本线统计', lineStats(L, all), '', 'card-tight');
    ov += card('数据源健康 · 观测覆盖(' + esc(L.line) + '线)', healthBlock(L), '', 'card-tight');
    html += UI.fold('m1-ov-' + key, '<b>本线概览</b> · ' + esc(L.title) + '(健康 / 任务包 / 统计)', ov,
      { right: healthLine(L) });

    /* ② 线索队列主区 —— 置顶待处置(唯一动作区之一,按时限升序,手风琴同时只开一条) */
    html += pendingSection(key, L.line);

    /* ③ 本线专有工作区(批量半审 / 调查案) */
    if (L.key === 'rd') {
      html += batchView(all.filter(function (c) { return c.lane === '批量半审' && isOpen(c); }));
    } else if (L.key === 'pl') {
      var cases = st.investigations;
      if (cases.length) { cases.forEach(function (k) { html += caseCard(k); }); }
      else {
        html += card('管网线 · 尚无调查案',
          UI.banner('info', '本线走「预警 → 调查案」:DMA 分区流量计与压力计出规则报警,系统自动开调查案,人在<b>立案 / 结案</b>两点拍板。') +
          '<div class="tiny">冷启动口径:首次可信报警需基线期 ' + UI.assume('X 天', '基线期 X 天 = 假设值:遥测通道打通 + 基线窗口历史;客户有归档则回算') + '。</div>');
      }
    }

    /* ④ 全部线索表:状态 / 档位筛选,点行内联展开只读摘要 */
    html += tcard('clue', '全部线索(' + all.length + ')', queueTable(key, all),
      '', { line: L.line, tag: L.line + '线' });

    /* ⑤ 动作日志(折叠) */
    html += UI.fold('m1-log-' + key, '<b>最近动作日志</b>(机械自动步也逐条留痕)',
      UI.timeline(null, { limit: 8, desc: true }), { right: '按需展开' });
    return html;
  }

  /* ============ 线索详情 ============ */
  function clueDetail(id) {
    var c = S.find.clue(id);
    if (!c) {
      return card('线索不存在', '<div class="tiny">该线索尚未入池。</div>' +
        '<div class="act-row" style="margin-top:8px"><a class="btn" href="#/m1">← 返回复核队列</a></div>');
    }
    var back = '#/m1/line/' + keyOfLine(c.line);
    var tk = c.ticketId ? S.find.ticket(c.ticketId) : null;
    var al = c.alertId ? S.find.alert(c.alertId) : null;
    var meta = S.get().meta;

    /* --- 左列 --- */
    /* 超时兜底横幅由下方对应的只读摘要卡承载(加急人工卡 / 通用待处置卡),此处不重复 */
    var left = UI.objectCard(c, { kind: '线索' }) + UI.obsLine(c);

    /* R87 A1:申诉 / 裁定留痕横幅(状态取 alertStates 枚举) */
    if (al && al.status === '申诉复核中') {
      left += UI.banner('warn', '<b>申诉复核中</b> —— ' + esc(al.id) + ' 已由 ' + esc((al.appeal || {}).by || '复核员') +
        ' 于 ' + esc((al.appeal || {}).t || '—') + ' 提误报申诉,理由「' + esc((al.appeal || {}).reason || '') +
        '」;裁定前记录与处置照旧。');
    }
    if (al && al.status === '误报撤销') {
      var ap = al.appeal || {}, rl = al.ruling || {};
      var rk = (S.get().tickets || []).filter(function (t) { return t.type === '传感器复检工单' && t.facility === al.facility; })[0];
      left += tcard('alert', '误报撤销 · 留痕链 ' + UI.badge('记录保留', 'grey'),
        UI.kv([
          ['① 申诉', esc(ap.by || '—') + ' · ' + esc(ap.t || '—') + ' · 理由「' + esc(ap.reason || '—') + '」' + (ap.note ? ';说明「' + esc(ap.note) + '」' : '')],
          ['② 裁定', esc(rl.by || '—') + ' · ' + esc(rl.t || '—') + ' · 申诉成立' + (rl.note ? ';说明「' + esc(rl.note) + '」' : '')],
          ['③ 复检工单', rk ? ('<a href="#/m2">' + esc(rk.id) + '</a> · ' + esc(rk.state) + ' · ' + esc(rk.grade || '灰档') + ' · ' + esc(rk.summary || '')) : '—', true],
          ['告警状态', UI.badge(al.status, 'grey'), true],
          ['班组考核', tk && tk.kpiExempt ? UI.badge('白跑不计考核', 'green') : '—', true]
        ]), '', { tag: '误报撤销' });
    }

    /* R88 A4① · 左列三卡改「只读摘要」:动作全部收进右侧动作面板(唯一动作区),不再有同一动作两处按钮 */
    if (c.fastlane && isOpen(c)) left += fastlaneCard(c, 'detail');
    if (c.lane === '加急人工' && isOpen(c)) left += urgentReviewCard(c, 'detail');
    if (c.mechFail) left += mechRejectCard(c, 'detail');

    left += tcard('clue', '证据卡 · ' + UI.evShots(c).length + ' 张',
      UI.evInset(UI.evThumb(c, {
        note: '来源:' + esc(c.source || '—') +
          (UI.obsList(c).length > 1 ? ' · 已叠加同点位重复观测 ' + (UI.obsList(c).length - 1) + ' 次' : '')
      })),
      c.evidenceViewed ? UI.badge('已查看(高危确认前置已满足)', 'green') : UI.badge('高危件确认前须查看', 'grey'),
      { line: c.line, tag: '证据' });

    /* R88 A4① · 机械校验四项 = 证据性区块,保留但降为折叠区(它是确认的前置凭据,不是动作) */
    var mechPass = (c.checks || []).filter(function (x) { return x.result === 'pass'; }).length;
    left += UI.fold('m1-mech-' + c.id, '<b>机械校验闸(第二闸)</b> · ' + mechPass + '/' + (c.checks || []).length + ' 项通过' +
      (c.mechFail ? ' ' + UI.badge('硬失败', 'red') : ''), UI.checksCard(c), { right: '证据区 · 按需展开' });

    /* R88 A4⑯ · 数据源健康下沉:每条线索详情带「本设施观测状况」(该设施传感器健康 + 最近观测 + 覆盖方式) */
    left += facilityObsCard(c);

    /* --- 右列:动作面板(R88 A4① 唯一动作区)+ 时间线 --- */
    var right = '';
    var inWindow = !!(c.reviewEnd && S.slaLeft(c.reviewEnd) >= 0);
    /* 一条动作项 → {ok, g(分组), html};动作项三形态:act(直接动作)/ modal(带表单)/ raw(非状态变更的前置动作) */
    function pItem(it) {
      var ok, why = '', btn;
      if (it.kind === 'raw') {
        ok = true; btn = it.html;
      } else if (it.kind === 'modal') {
        var spec = MODALS[it.modal], r = S.check(spec.action, spec.probe(it.id));
        ok = r.ok; why = r.reason || '';
        btn = '<button type="button" class="btn ' + (it.cls || '') + (ok ? '' : ' is-off') + '"' + (ok ? '' : ' disabled') +
          ' data-ui="modal" data-val="' + esc(it.modal + ':' + it.id + ':' + (it.ctx || '')) + '"' +
          ' title="' + esc((S.ACTIONS[spec.action] || {}).hint || '') + '">' + esc(it.label) + '</button>';
      } else {
        var def = S.ACTIONS[it.action] || {}, r2 = S.check(it.action, it.params || {});
        ok = r2.ok; why = r2.reason || '';
        btn = '<button type="button" class="btn ' + (it.cls || '') + (ok ? '' : ' is-off') + '"' + (ok ? '' : ' disabled') +
          ' data-act="' + esc(it.action) + '" data-p="' + UI.attr(it.params || {}) + '"' +
          ' title="' + esc(def.hint || '') + '">' + esc(it.label) + '</button>';
      }
      return {
        ok: ok, g: it.g,
        html: '<div class="act-item">' + btn +
          (ok ? '' : '<span class="act-why">' + esc(it.g) + ' · 未满足:' + esc(why) + '</span>') + '</div>'
      };
    }

    /* R89 A4⑤ 语义分色(页级 CSS 在 ui.js):确认 / 通过 = 实心绿 btn-ok;驳回 / 打回 / 撤回 / 撤销 = 红描边 btn-rej;
       转办 / 挂起 / 归档 = 灰 btn-neu;查看证据 = 蓝描边 btn-evi;提级 / 升格 = 橙 btn-esc;
       紧急 override 保持实心红 btn-danger(最危险的主动作,实心 ≠ 次动作描边)。 */
    var G1 = '定性动作 · 区复核员', G2 = '机械闸 / 机器直派', G3 = '复验人裁', G4 = '复核主管以上';
    var items = [
      { g: G1, kind: 'raw', html: '<button type="button" class="btn btn-evi" data-ev="' + esc(c.id) + '">' +
        (c.evidenceViewed ? '✓ 查看证据卡(已满足)' : '查看证据卡') + '</button>' },
      { g: G1, kind: 'act', action: 'confirm', params: { clueId: c.id }, cls: 'btn-ok',
        label: c.fastlane ? '确认 = 告警追认' : '确认(线索成立)' },
      { g: G1, kind: 'modal', modal: 'reject', id: c.id, cls: 'btn-rej', label: '驳回(必选六原因码)' },
      { g: G1, kind: 'modal', modal: 'transfer', id: c.id, cls: 'btn-neu', label: '转办产权单位' },
      { g: G1, kind: 'act', action: 'archive_doubt', params: { clueId: c.id }, cls: 'btn-neu', label: '存疑归档(仅批量半审车道)' }
    ];
    /* R88 A1⑬ 后半:提级入口显式化 —— 养护 / 观察件由复核主管主动提级为急修(原因必填) */
    if (['养护', '观察'].indexOf(c.level) >= 0) {
      items.push({ g: G4, kind: 'modal', modal: 'escalate', id: c.id, cls: 'btn-esc', label: '提级为急修(原因必填)' });
    }
    items.push({ g: G2, kind: 'modal', modal: 'overrule', id: c.id, cls: 'btn-esc', label: '推翻机械判定' });
    /* R87 A1:复核窗内 = 撤回召回班组;窗过 = 误报申诉(交复核主管裁定) */
    items.push(inWindow || !al
      ? { g: G2, kind: 'modal', modal: 'recall', id: c.id, cls: 'btn-rej',
          label: '机器直派撤回 · 召回班组' + (c.reviewEnd ? '(窗内 · 截止 ' + c.reviewEnd + ')' : '') }
      : { g: G2, kind: 'modal', modal: 'appeal', id: al.id, ctx: c.id, cls: 'btn-rej', label: '误报申诉(复核窗已过)' });
    if (tk) {
      items.push({ g: G3, kind: 'act', action: 'verify_pass', params: { ticketId: tk.id }, cls: 'btn-ok', label: '复验人裁 · 合格(闭环)' });
      items.push({ g: G3, kind: 'modal', modal: 'verifyreject', id: tk.id, ctx: c.id, cls: 'btn-rej', label: '复验打回(须附对比证据)' });
    }
    if (al && al.status === '申诉复核中') {
      items.push({ g: G4, kind: 'modal', modal: 'ruling', id: al.id, ctx: c.id, cls: 'btn-primary', label: '申诉裁定 ' + al.id + '(成立 / 不成立)' });
    }
    items.push({ g: G4, kind: 'modal', modal: 'override', id: c.id, cls: 'btn-danger', label: '紧急 override(红色动作 · 双确认)' });
    items.push({ g: G4, kind: 'modal', modal: 'freeze', id: c.id, cls: 'btn-neu', label: '证据冻结 · 导出法务包' });
    if (al) items.push({ g: G4, kind: 'modal', modal: 'revoke', id: al.id, ctx: c.id, cls: 'btn-rej', label: '撤销告警 ' + al.id });

    var rendered = items.map(pItem);
    var live = rendered.filter(function (x) { return x.ok; });
    var dead = rendered.filter(function (x) { return !x.ok; });
    if (!al) {
      dead.push({ ok: false, g: G4, html: '<div class="act-item"><button type="button" class="btn is-off" disabled>撤销告警</button>' +
        '<span class="act-why">' + esc(G4) + ' · 未满足:本线索尚未确认成立,无告警可撤销</span></div>' });
    }

    var acts = '';
    [G1, G2, G3, G4].forEach(function (g) {
      var seg = live.filter(function (x) { return x.g === g; });
      if (!seg.length) return;
      acts += (acts ? '<div class="sep"></div>' : '') + '<div class="sec-title">' + esc(g) + '</div>' +
        seg.map(function (x) { return x.html; }).join('');
    });
    if (!acts) acts = '<div class="tiny">当前身份「' + esc(S.get().role) + '」在本件上没有可执行动作 —— 全部动作在下方「更多」里,附未满足原因。</div>';
    if (dead.length) {
      acts += '<div class="sep"></div>' +
        UI.fold('m1-more-' + c.id, '<b>更多(' + dead.length + ',当前不可用)</b>',
          dead.map(function (x) { return x.html; }).join(''),
          { right: '灰态原因逐条可见' });
    }

    /* R89 A4⑤:分色图例 —— 按钮颜色是承诺,写在动作区脚下,不靠猜 */
    var btnLegend = '<div class="btn-lg">' +
      '<span><i style="background:var(--green)"></i>确认 / 通过</span>' +
      '<span><i style="background:#fff;border:1.5px solid var(--red)"></i>驳回 / 打回 / 撤回</span>' +
      '<span><i style="background:#f4f6f2;border:1.5px solid var(--line)"></i>转办 / 归档 / 冻结</span>' +
      '<span><i style="background:#fff;border:1.5px solid var(--info)"></i>查看证据</span>' +
      '<span><i style="background:var(--amberw-soft);border:1.5px solid var(--amberw)"></i>提级 / 推翻</span>' +
      '<span><i style="background:var(--red)"></i>紧急 override</span>' +
      '</div>';
    /* R89 A1:动作面板顶部先摆认领态 —— 这件在谁手上、怎么来的、我能不能直接动 */
    right += card('动作面板 · 按钮即动作', claimBar(c) + '<div class="sep"></div>' + acts + btnLegend,
      '<span class="tiny">当前身份:' + esc(S.get().role) + ' · 唯一动作区</span>');

    var link = [c.id, c.ticketId, c.alertId].filter(Boolean);
    var logs = S.get().actionLog.filter(function (g) {
      var s = JSON.stringify(g.params || {}) + ' ' + (g.sum || '');
      for (var i = 0; i < link.length; i++) if (s.indexOf(link[i]) >= 0) return true;
      return false;
    });
    right += card('时间线 · 本线索相关动作日志', UI.timeline(logs, { desc: false }),
      '<span class="tiny">' + logs.length + ' 条</span>');

    right += card('判定版本字段(随动作记录)', UI.kv([
      ['规则包', esc(meta.ruleVer)],
      ['区级参数集', esc(meta.paramVer)],
      ['模型版本', esc(meta.modelVer)],
      ['参考数据快照', esc(meta.refVer)]
    ]));

    /* --- 关联对象行 --- */
    var relate = '';
    if (tk) {
      relate += '<div class="small">工单镜像:<b>' + esc(tk.id) + '</b> · ' + esc(tk.type) + ' · 状态 ' + UI.badge(tk.state, 'blue') +
        ' · 承接 ' + esc(UI.crewName(tk.crew)) + ' · 客户系统 ' + esc(tk.mirror) + ' · 来源 ' + esc(tk.source) +
        (tk.suspended ? ' · ' + UI.badge('已挂起 · SLA 停表', 'amber') : '') +
        (tk.overdueFallback ? ' · ' + UI.badge('超时兜底已派单 · 定性待补审', 'amber') : '') +
        ' <a href="#/m2">告警与工单 →</a></div>';
    }
    if (al) {
      var alTone = al.status === '成立' ? 'green' : (al.status === '申诉复核中' ? 'amber' : 'grey');
      relate += '<div class="small" style="margin-top:6px">告警:<b>' + esc(al.id) + '</b> · ' + UI.badge(al.status, alTone) +
        ' · 成立于 ' + esc(al.t) + ' · 签字人 ' + esc(al.by) + '</div>';
    }
    if (c.spotReturn) {
      relate += '<div class="small" style="margin-top:6px">抽审打回:<b>' + esc(c.spotReturn.auditId) + '</b> · ' +
        esc(c.spotReturn.by) + ' · ' + esc(c.spotReturn.t) + ' · 原因「' + esc(c.spotReturn.code) + '」→ 原件回队重看(通知 ' +
        esc(c.spotReturn.to) + ') <a href="#/m4">抽审队列 →</a></div>';
    }
    if (c.status === 'rejected') {
      var def = S.dict().rejectCodes.filter(function (r) { return r.code === c.rejectCode; })[0];
      relate += '<div class="small" style="margin-top:6px">驳回原因码:<b>' + esc(c.rejectCode || '') + '</b> ' +
        esc(def ? def.name : '') + ' → 回流「' + esc(def ? def.to : '') + '」</div>';
    }
    if (!relate) relate = '<div class="tiny">本线索暂无下游对象(确认后自动产生告警与工单镜像)。</div>';

    return '<div class="card card-tight"><div class="act-row">' +
      '<a class="btn btn-sm" href="' + back + '">← 返回 ' + esc(c.line) + '线队列</a>' +
      '<span class="tiny" style="align-self:center">路由 #/m1/clue/' + esc(c.id) + '</span>' +
      '<span class="top-spacer"></span>' + UI.helpBtn('m1') + '</div></div>' +
      tcard('ticket', '下游对象', relate, '', { tag: '关联' }) +
      /* R89 A4①:左右两栏各自 overflow-y:auto + overscroll-behavior:contain —— 滚一栏不带动另一栏,
         也不把滚动透传给页面;栏高 = 视口 - 顶栏 - 导览条(--dtl-off 由 ui.js 每次重绘实测导览条高度写入)。 */
      '<div class="dtl-cols">' +
      '<div class="dtl-col dtl-l">' + left + '</div>' +
      '<div class="dtl-col dtl-r">' + right + '</div>' +
      '</div>';
  }

  /* ============ 视图入口 ============ */
  w.VIEWS.m1 = function (ctx) {
    var rest = ctx.rest || [];
    if (rest[0] === 'clue' && rest[1]) {
      return clueDetail(decodeURIComponent(rest[1])) + renderModal();
    }
    var key = (rest[0] === 'line' && rest[1]) ? rest[1] : 'mh';
    if (!lineOfKey(key) || ['mh', 'rd', 'pl'].indexOf(key) < 0) key = 'mh';
    return header(key) + queuePage(key) + renderModal();
  };

  /* ============ 局部 UI 事件(不改 store;状态变更一律走 data-act → S.commit)============ */
  function rerender() {
    var y = w.scrollY || w.pageYOffset || 0;
    try { w.dispatchEvent(new CustomEvent('render', { detail: { ui: 'm1' } })); }
    catch (e) { var ev = d.createEvent('Event'); ev.initEvent('render', false, false); w.dispatchEvent(ev); }
    try { w.scrollTo(0, y); } catch (e2) { /* noop */ }
  }

  d.addEventListener('click', function (e) {
    /* R87 A4:置顶区手风琴(同时只开一条)与全部线索表的行内展开 —— 都只改本页局部态 */
    var t = e.target;
    while (t && t.getAttribute && !t.getAttribute('data-acc') && !t.getAttribute('data-row') &&
      !t.getAttribute('data-filt') && !t.getAttribute('data-cfilt') && !t.getAttribute('data-ui') && !t.getAttribute('data-goto')) t = t.parentNode;
    if (t && t.getAttribute) {
      /* R89 A1:待处置区的认领过滤 tab(我的 / 公共池 / 全部)—— 只改本页局部态 */
      var cf = t.getAttribute('data-cfilt');
      if (cf) {
        var cp = cf.split(':');
        if (!M.cfilt) M.cfilt = {};
        M.cfilt[cp[0]] = cp[1];
        M.acc[cp[0]] = undefined;                 // 换视图 → 手风琴回到「展开最紧的一条」
        rerender(); return;
      }
      var fc = t.getAttribute('data-filt');
      if (fc && fc.split(':')[1] === 'clear') {
        M.filt[fc.split(':')[0]] = { status: '', lane: '' };
        rerender(); return;
      }
      var accId = t.getAttribute('data-acc');
      if (accId) {
        var k = curKey();
        M.acc[k] = (curOpen(k) === accId) ? '' : accId;
        rerender(); return;
      }
      var rowId = t.getAttribute('data-row');
      if (rowId) {
        /* 行内的「详情 →」链接照常跳转,不抢它的点击 */
        if (e.target && e.target.tagName === 'A') return;
        M.rowOpen[rowId] = !M.rowOpen[rowId];
        rerender(); return;
      }
    }

    var el = e.target;
    while (el && el.getAttribute && !el.getAttribute('data-ui') && !el.getAttribute('data-goto')) el = el.parentNode;
    if (!el || !el.getAttribute) return;

    var go = el.getAttribute('data-goto');
    if (go) { w.location.hash = go; return; }

    var ui = el.getAttribute('data-ui');
    if (!ui) return;
    if (ui === 'closeself' && e.target !== el) return;

    if (ui === 'modal') {
      var parts = String(el.getAttribute('data-val') || '').split(':');
      M.modal = { kind: parts[0], id: parts[1] || '', ctx: parts[2] || '' };
      M.form = {};
      rerender();
    } else if (ui === 'close' || ui === 'closeself') {
      M.modal = null; M.form = {}; rerender();
    } else if (ui === 'expand') {
      M.expanded = !M.expanded; rerender();
    }
  });

  d.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || !el.getAttribute) return;
    /* 全部线索表的状态 / 档位筛选 */
    var ft = el.getAttribute('data-filt');
    if (ft) {
      var fp = ft.split(':');
      filtOf(fp[0])[fp[1]] = el.value;
      rerender(); return;
    }
    var pk = el.getAttribute('data-pick');
    if (pk) {
      if (pk === '*') {
        var on = el.checked;
        S.get().clues.forEach(function (c) { if (c.lane === '批量半审' && c.status === 'open') M.picks[c.id] = on; });
      } else { M.picks[pk] = el.checked; }
      rerender(); return;
    }
    var k = el.getAttribute('data-set');
    if (!k) return;
    M.form[k] = (el.type === 'checkbox') ? el.checked : el.value;
    rerender();
  });

  /* 动作成功后:关掉对应弹层、清批量勾选(本监听注册早于 app.html 的 render 监听,故优先执行) */
  w.addEventListener('render', function (e) {
    var log = e && e.detail && e.detail.log;
    if (!log) return;
    if (M.modal && MODALS[M.modal.kind] && MODALS[M.modal.kind].action === log.action) { M.modal = null; M.form = {}; }
    if (log.action === 'batch_confirm' || log.action === 'archive_doubt') { M.picks = {}; }
  });

})(window, document);
