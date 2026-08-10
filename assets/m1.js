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
    { key: 'mh', line: '井盖', title: '井盖 / 排水', sub: '应急流 · 线卡 B' },
    { key: 'rd', line: '路面', title: '路面病害', sub: '养护流 · 线卡 A' },
    { key: 'pl', line: '管网', title: '灌溉管网', sub: '预警调查流 · 线卡 C' }
  ];
  /* R33 跨线仲裁默认序在线内的落地:应急/紧急最前,紧急直派件再置顶 */
  var LV_RANK = { '应急': 0, '紧急': 0, '急修': 1, '雨前专项': 2, '调查': 2, '养护': 3, '观察': 4, '设备': 5 };

  /* 页面局部 UI 态(不进 store;store 只经 S.commit 变更) */
  var M = { modal: null, form: {}, picks: {}, expanded: false };

  /* ============ 小工具 ============ */
  function lineOfKey(k) { for (var i = 0; i < LINES.length; i++) if (LINES[i].key === k) return LINES[i]; return LINES[0]; }
  function keyOfLine(l) { for (var i = 0; i < LINES.length; i++) if (LINES[i].line === l) return LINES[i].key; return 'mh'; }
  function card(title, body, extra, cls) {
    return '<div class="card ' + (cls || '') + '">' +
      (title ? '<div class="card-hd"><h3>' + title + '</h3>' + (extra || '') + '</div>' : '') + body + '</div>';
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
    if (c.conf === null || c.conf === undefined) return '<span class="faint" title="管网线的「置信」= 规则持续时长 × 多源一致度,不是图像置信度">—</span>';
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
      title: '紧急直派撤回 · 召回班组',
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
      '<div class="tiny" style="margin-top:8px">提交后写一条动作日志(含理由码与世界状态快照),时间线可回查。</div>' +
      '</div></div>';
  }

  /* ============ 页头:术语分权 + R33 仲裁序 + 剧情提示 ============ */
  function header(cur) {
    var st = S.get();
    var tabs = LINES.map(function (L) {
      var n = st.clues.filter(function (c) { return c.line === L.line && isOpen(c); }).length;
      var extra = L.key === 'pl' ? st.investigations.filter(function (k) { return k.status !== '已结案'; }).length : 0;
      return '<a href="#/m1/line/' + L.key + '" class="' + (L.key === cur ? 'is-on' : '') + '">' +
        esc(L.title) + ' <span class="badge badge-' + (L.key === cur ? 'blue' : 'grey') + '">' + (n + extra) + '</span></a>';
    }).join('');

    var hint = '';

    return '<div class="card card-tight">' +
      '<div class="card-hd"><h2>1 · 复核工作台 —— 确认 / 驳回 / 升格,处置认定留痕的地方</h2>' +
      '<span class="tiny">复核员 90% 的时间在这一页</span></div>' +
      '<div class="grid3">' +
      '<div class="small"><b>线索 vs 告警</b><div class="tiny">AI 与规则只产「线索」;人确认签字后才叫「告警」—— 定性权永远在人。</div></div>' +
      '<div class="small"><b>双闸</b><div class="tiny">第一闸 = AI 识别;第二闸 = 机械证据校验(硬编码判据逐项打钩)。两闸都过的应急件才有资格走紧急直派。</div></div>' +
      '<div class="small"><b>紧急直派 = 先派后审</b><div class="tiny">派单是处置调度,不是定性;人 ' + UI.assume('15 分钟', '紧急直派并行复核窗 15 分钟=假设值,区可配') + ' 内并行复核,撤回可召回。</div></div>' +
      '</div>' +
      '<div class="sep"></div>' +
      '<div class="tiny">跨线仲裁默认序:<b>井盖应急 &gt; 管网紧急 &gt; 路面急修</b>;本线内紧急直派件再置顶。区值班主管可临时置顶改序,动作留痕。本页 SLA / 阈值数字均为' + UI.assume('假设值', '全部 SLA 与阈值为假设值,试点首周与客户核实后按区可配参数调整') + '。</div>' +
      '</div>' +
      hint +
      '<div class="tabs">' + tabs + '</div>';
  }

  /* ============ 队列表(列:线索号/设施+地址/级别/置信/车道/SLA/状态)============ */
  function queueTable(list, note) {
    if (!list.length) return '<div class="tiny">本线当前无线索。</div>';
    var rows = list.map(function (c) {
      var urgent = isHigh(c) && isOpen(c);
      return '<tr class="' + (urgent ? 'is-urgent' : '') + '" data-goto="#/m1/clue/' + esc(c.id) + '" style="cursor:pointer" title="点击进线索详情">' +
        '<td><b>' + esc(c.id) + '</b>' + (c.fastlane ? ' ' + UI.badge('紧急直派', 'amber') : '') + '</td>' +
        '<td>' + UI.addr(c.facility) + '<div class="tiny">' + esc(c.kindText || '') + '</div></td>' +
        '<td>' + UI.levelBadge(c.level) + '</td>' +
        '<td>' + confText(c) + '</td>' +
        '<td>' + (c.lane ? UI.laneBadge(c.lane) : '—') + '</td>' +
        '<td>' + slaCell(c) + '</td>' +
        '<td>' + UI.statusBadge(c.status) + '</td></tr>';
    }).join('');
    return '<table class="tb"><thead><tr>' +
      '<th style="width:120px">线索号</th><th>设施 · 地址</th><th style="width:74px">级别</th>' +
      '<th style="width:66px">置信度</th><th style="width:120px">车道</th><th style="width:104px">SLA 倒计时</th><th style="width:96px">状态</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      (note ? '<div class="tiny" style="margin-top:6px">' + note + '</div>' : '');
  }

  /* ============ 紧急直派并行复核卡(T1/T2 后出现)============ */
  function fastlaneCard(c, compact) {
    var tk = c.ticketId ? S.find.ticket(c.ticketId) : null;
    var cw = tk && tk.crew ? S.find.crew(tk.crew) : null;
    var body =
      UI.banner('info', '<b>机器派单,人复核中</b> —— ' + esc(c.id) + ' 双闸硬证据齐,系统已自动派 ' +
        esc(cw ? cw.name : '班组') + (tk ? '(紧急工单 ' + esc(tk.id) + ' · 镜像 ' + esc(tk.mirror) + ')' : '') +
        '。派单是<b>处置调度</b>,不是定性;告警要等人确认追认。') +
      '<div class="row wrap" style="align-items:flex-start">' +
      '<div class="grow" style="min-width:220px">' +
      UI.kv([
        ['并行复核窗', '截止 ' + esc(c.reviewEnd || '—') + ' · ' + UI.sla(c.reviewEnd || c.slaDeadline) + ' ' + UI.assume('(窗长 15 分钟)', '15 分钟并行复核窗 = 假设值;超时走三级升级'), true],
        ['准入硬条件', '应急级 + [传感器硬证据(已认证设备签名报文)或 高置信 + 机械四项全过] + 该类目紧急直派开关开启'],
        ['当前工单', tk ? (esc(tk.id) + ' · ' + esc(tk.state) + ' · ' + esc(cw ? cw.name : '—')) : '—'],
        ['撤回后果', esc(recallBranch(tk))]
      ]) +
      '</div>' +
      (compact ? '' : '<div style="width:230px;flex:none">' + UI.evidenceGrid(c.evidence.slice(0, 1)) + '</div>') +
      '</div>' +
      '<div class="sep"></div>' +
      '<div class="row wrap">' +
      '<div class="grow">' + pw(UI.actionPanel([
        { action: 'view_evidence', params: { clueId: c.id }, label: c.evidenceViewed ? '✓ 证据卡已查看(高危前置已满足)' : '查看证据卡(高危确认前置)' },
        { action: 'confirm', params: { clueId: c.id }, label: '确认 = 告警追认', cls: 'btn-ok' }
      ])) + '</div>' +
      '<div class="grow">' + pw(modalBtn('紧急直派撤回(理由码 · 召回班组)', 'recall', c.id, 'btn-danger')) + '</div>' +
      '</div>' +
      '<div class="tiny" style="margin-top:8px">紧急直派件<b>全量抽审</b>(误派率月报口径);撤回件白跑不计班组考核,班组可申诉。' +
      ' <a href="#/m4">抽审队列 →</a></div>';
    return card('紧急直派并行复核 · ' + esc(c.id) + ' ' + UI.levelBadge(c.level) + ' ' + UI.badge('先派后审', 'amber'),
      body, '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">进详情 →</a>');
  }

  /* ============ 应急人审档卡(T5 · 0.31 件,与紧急直派成对照)============ */
  function urgentReviewCard(c) {
    var body =
      '<div class="banner banner-warn"><span class="banner-ico">!</span><span>' +
      '<b>为什么它不走紧急直派:</b>置信 ' + esc(conf2(c.conf)) + ' 纯视觉、<b>无传感器硬证据</b>,机械四项未全过 —— 双闸硬条件不满足。' +
      '低置信不等于放过:应急级<b>不看置信度</b>,强制人核(线卡 B / 非理想态①)。</span></div>' +
      '<div class="row wrap" style="align-items:flex-start">' +
      '<div class="grow" style="min-width:230px">' +
      UI.kv([
        ['车道', UI.laneBadge('应急人审档') + ' <span class="tiny">加急队列人工单条确认</span>', true],
        ['SLA 倒计时', UI.sla(c.slaDeadline) + ' · 截止 ' + esc(c.slaDeadline || '—') + ' ' + UI.assume('(档长 30 分钟)', '应急人审档 SLA 30 分钟 = 假设值,区可配'), true],
        ['超时', '三级升级:复核员 → 复核主管 → 区值班长;并发只读预警(不定性、不派工)'],
        ['兜底', '本档确认与驳回<b>都</b>拘进主管抽审', true]
      ]) + '</div>' +
      '<div style="width:220px;flex:none">' + UI.evidenceGrid(c.evidence.slice(0, 1)) + '</div>' +
      '</div>' +
      '<div class="sep"></div>' +
      '<div class="row wrap"><div class="grow">' + pw(UI.actionPanel([
        { action: 'view_evidence', params: { clueId: c.id }, label: c.evidenceViewed ? '✓ 证据卡已查看' : '查看证据卡(高危确认前置)' },
        { action: 'confirm', params: { clueId: c.id }, label: '确认(线索成立)', cls: 'btn-ok' }
      ])) + '</div><div class="grow">' +
      pw(modalBtn('驳回(六码)', 'reject', c.id) + modalBtn('转办产权单位', 'transfer', c.id)) +
      '</div></div>';
    return card('应急人审档 · ' + esc(c.id) + ' ' + UI.levelBadge(c.level) + ' ' + UI.badge('置信 ' + conf2(c.conf), 'grey'),
      body, '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">进详情 →</a>');
  }

  /* ============ 机械驳回置顶证据卡(T6 树影件:高危零自动归档)============ */
  function mechRejectCard(c) {
    var bad = (c.checks || []).filter(function (x) { return x.result === 'fail' || x.result === 'warn'; })
      .map(function (x) { return x.name; }).join(' / ');
    var done = c.status === 'rejected';
    var body =
      '<div class="banner banner-warn"><span class="banner-ico">!</span><span>' +
      '<b>机械校验硬失败,但高危件零自动归档</b> —— 未过项:' + esc(bad || '—') +
      '。证据卡<b>置顶</b>,转加急人工驳回确认(高危零自动归档验收线)。</span></div>' +
      (done ? UI.banner('warn', '<b>高危驳回已拘主管抽审</b> —— ' + esc(c.id) + ' 原因码 ' + esc(c.rejectCode || '') +
        ';复核员把真异常驳回成树影时,由抽审发现。') : '') +
      '<div class="row wrap" style="align-items:flex-start">' +
      '<div style="width:240px;flex:none">' + UI.evidenceGrid(c.evidence.slice(0, 1)) + '</div>' +
      '<div class="grow" style="min-width:240px">' + UI.checksCard(c) +
      '<div class="tiny" style="margin-top:6px">诚实边界:树影这类<b>物理上持续存在的假目标</b>,多帧复现与几何域判据跟第一闸高度相关,机械闸拦不住 —— 误报主体仍由人驳回、按原因码回流模型。</div>' +
      '</div></div>' +
      '<div class="sep"></div>' +
      '<div class="row wrap"><div class="grow">' +
      pw(UI.actionPanel([{ action: 'reject', params: { clueId: c.id, code: '①' }, label: '认可机械判定 · 驳回(码① 拍摄干扰)' }]) +
      modalBtn('其他原因码驳回…', 'reject', c.id)) +
      '</div><div class="grow">' +
      pw(modalBtn('推翻机械判定(理由码必填)', 'overrule', c.id, 'btn-danger')) +
      '<div class="tiny">推翻 = 线索复活进人审 + 自动触发抽审;误杀样本回流规则组。</div>' +
      '</div></div>';
    return card('机械驳回置顶 · ' + esc(c.id) + ' ' + UI.levelBadge(c.level) + ' ' + UI.badge('机械驳回', 'blue'),
      body, '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">进详情 →</a>');
  }

  /* ============ 自动升格演示(T7:免人工件 + 抽审兜底)============ */
  function autoUpgradeCard(list) {
    if (!list.length) return '';
    var rows = list.map(function (c) {
      return '<tr data-goto="#/m1/clue/' + esc(c.id) + '" style="cursor:pointer">' +
        '<td><b>' + esc(c.id) + '</b></td><td>' + UI.addr(c.facility) + '<div class="tiny">' + esc(c.kindText) + '</div></td>' +
        '<td>' + UI.levelBadge(c.level) + '</td><td>' + confText(c) + '</td>' +
        '<td>' + UI.laneBadge(c.lane) + '</td>' +
        '<td>' + UI.badge('本条未经人工,抽审兜底', 'amber') + '</td></tr>';
    }).join('');
    var body = UI.banner('info', '<b>免人工车道</b> —— 养护级 × 高置信 × 机械五项全过 = 自动并入周期养护计划;观察级 × 机械过 = 自动记台账入劣化曲线。' +
      '机械自动化<b>不豁免审计</b>:每条一条动作日志,抽审可推翻。') +
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
        '<td>' + UI.laneBadge(c.lane) + '</td>' +
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
      rows + '</tbody></table>' +
      '<div class="tiny" style="margin-top:6px">存疑归档 = 既不算确认也不算驳回,<b>计入模型评估统计</b>(非理想态②);仅「批量半审」车道内可用。</div>';
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
        ['旁证', '自动调度视觉旁证 + 现场核查(听漏 / 分段关阀)—— 视觉在本线是<b>弱辅助</b>:湿 ≠ 漏', true],
        ['流量回归', k.flowGreen ? UI.badge('绿标已亮 · 水量平衡回落阈值内', 'green') : UI.badge('未回归基线', 'grey'), true],
        ['核查工单', tk ? (esc(tk.id) + ' · ' + esc(tk.state) + ' · ' + esc(UI.crewName(tk.crew))) : '—']
      ]) +
      '</div>' +
      '<div style="width:250px;flex:none">' + UI.evidenceGrid(k.evidence || [{ kind: 'flow-curve' }]) + '</div>' +
      '</div>' +
      '<div class="sep"></div>' +
      pw(UI.actionPanel([
        { action: 'open_case', params: { caseId: k.id }, label: '立案 → 开核查任务', cls: 'btn-primary' },
        { action: 'close_case', params: { caseId: k.id }, label: '结案(人签字)', cls: 'btn-ok' }
      ])) +
      '<div class="tiny" style="margin-top:8px">本线形态与前两线根本不同:<b>不是「线索池等人审」,是「预警 → 调查案」</b>;规则腿(硬编码水力学脚本)先行,AI 时序判型只提建议,<b>人只在立案与结案两点拍板</b>。系统出「建议结案」,签字仍在人。</div>';
    return card('调查案 ' + esc(k.id) + ' ' + UI.badge(k.status, k.status === '已结案' ? 'green' : 'blue'), body);
  }

  /* ============ 数据源健康(隐性失效两态 / 设备工单)============ */
  function healthCard(L) {
    var st = S.get();
    var facIds = st.facilities.filter(function (f) { return f.line === L.line; }).map(function (f) { return f.id; });
    var bad = st.sensors.filter(function (s) { return facIds.indexOf(s.facility) >= 0 && s.health !== '正常'; });
    var devTk = st.tickets.filter(function (t) { return t.type === '设备工单' && t.line === L.line; });
    if (!bad.length && !devTk.length) return '';
    var rows = bad.map(function (s) {
      return '<tr><td><b>' + esc(s.id) + '</b></td><td>' + esc(s.type) + '</td><td>' + UI.addr(s.facility) + '</td>' +
        '<td>' + UI.badge(s.health, 'amber') + '</td><td class="tiny">' + esc(s.window || '') + '</td></tr>';
    }).join('');
    var body =
      (rows ? '<table class="tb"><thead><tr><th style="width:110px">点位</th><th style="width:110px">类型</th><th>设施 · 地址</th><th style="width:190px">自检状态</th><th>观测覆盖窗</th></tr></thead><tbody>' + rows + '</tbody></table>' : '') +
      (devTk.length ? '<div class="tiny" style="margin-top:6px">已自动开设备工单:' + devTk.map(function (t) { return esc(t.id) + '(' + esc(t.state) + ')'; }).join(' · ') +
        ' —— 承接方 = 传感网运维方,<b>不归三线市政班组</b>,不惊动业务队列。 <a href="#/m2">工单镜像 →</a></div>' : '') +
      '<div class="tiny" style="margin-top:6px">隐性失效两态单列:<b>读数卡死</b>(方差为零超时 —— 过得了心跳过不了它)与<b>量程饱和</b>(暴雨积水恒满值 ≠ 失联),判据分开。先排设备故障,再报业务异常。</div>';
    return card('数据源健康 · 观测覆盖(' + esc(L.line) + '线)', body);
  }

  /* ============ 暴雨模式 · 雨前专项任务包(T12;井盖线兜底模块任务型)============ */
  function stormCard() {
    var st = S.get();
    if (!st.gov.stormMode) return '';
    var tks = st.tickets.filter(function (t) { return t.type === '雨前专项任务'; });
    var up = st.clues.filter(function (c) { return c.stormUp; }).length;
    var body = UI.banner('warn', '<b>暴雨模式已启动</b> —— 井盖线整体升档:养护件 ' + up + ' 条 → 急修档;液位计转先导预警源;' +
      '淹没失联时按最后读数 + 降级视觉。区值班长可启用「临时借调 + SLA 延展档」(启用动作留痕)。') +
      '<div class="small"><b>雨前清掏核查任务包</b>(线卡 B 雨前专项 · 任务型兜底):' +
      (tks.length ? tks.map(function (t) { return esc(t.id) + ' · ' + esc(t.state) + ' · ' + esc(UI.crewName(t.crew)) + ' · ' + UI.addr(t.facility); }).join(' ; ') : '待下发') +
      ' <a href="#/m2">工单镜像 →</a></div>' +
      '<div class="tiny" style="margin-top:4px"><b>箅面干净 ≠ 过水能力在</b> —— 井筒淤积对视觉与液位<b>皆盲</b>(诚实标注),所以它不是识别题,是任务题:与客户清掏计划对接,沙漠城市雨前最该查的一件。</div>';
    return card('暴雨模式 · 全线升档 ' + UI.badge('雨前专项', 'amber'), body);
  }

  /* ============ 三个 tab 的队列页 ============ */
  function queuePage(key) {
    var L = lineOfKey(key), st = S.get();
    var all = cluesOf(L.line);
    var html = '';

    if (L.key === 'mh') {
      all.filter(function (c) { return c.fastlane && isOpen(c); }).forEach(function (c) { html += fastlaneCard(c); });
      all.filter(function (c) { return c.lane === '应急人审档' && isOpen(c); }).forEach(function (c) { html += urgentReviewCard(c); });
      all.filter(function (c) { return c.mechFail || (c.lane === '机械驳回' && isHigh(c)); }).forEach(function (c) { html += mechRejectCard(c); });
      html += stormCard();
      html += card('井盖 / 排水线队列 · ' + all.length + ' 条(仲裁序:紧急直派件最顶,应急件置顶)',
        queueTable(all, '暴雨预警期:雨水口养护件整体升一档(线卡 B「养护→雨前急修」);井筒淤积对视觉与液位<b>皆盲</b>,由雨前清掏核查任务型兜底。'));
      html += healthCard(L);

    } else if (L.key === 'rd') {
      html += autoUpgradeCard(all.filter(function (c) { return c.status === 'auto_done'; }));
      html += batchView(all.filter(function (c) { return c.lane === '批量半审' && isOpen(c); }));
      var rest = all.filter(function (c) { return !(c.lane === '批量半审' && isOpen(c)) && c.status !== 'auto_done'; });
      if (rest.length) {
        html += card('本线其余队列 · ' + rest.length + ' 条(单条必审 / 机械驳回 / 已处置)', queueTable(rest));
      }
      html += card('路面线车道表(线卡 A)',
        '<table class="tb"><thead><tr><th style="width:96px">车道</th><th style="width:230px">进入条件</th><th>处置</th><th style="width:210px">兜底</th></tr></thead><tbody>' +
        '<tr><td>记账</td><td>观察级 × 机械过</td><td><b>免人工</b>,自动记台账入劣化曲线</td><td>台账可查,升级自动触发复报</td></tr>' +
        '<tr><td>自动升格</td><td>养护级 × 高置信 × 机械全过</td><td><b>免人工</b>,自动并入周期养护计划(周批工单)</td><td>事后抽审;冷启动关闭,按数据判据开启</td></tr>' +
        '<tr><td>批量半审</td><td>养护级 × 中低置信</td><td>复核员批量确认视图(机械校验做辅助列)</td><td>抽审;可存疑归档</td></tr>' +
        '<tr><td>单条必审</td><td>急修级(<b>不看置信度</b>)</td><td>人工确认 → 急修工单,确认 SLA ' + UI.assume('30 分钟', '路面急修确认 SLA 30 分钟 = 假设值,区可配') + '</td><td>高危确认 / 驳回拘抽审</td></tr>' +
        '<tr><td>机械驳回</td><td>机械硬失败(不在路网 / 多帧不复现 / 重复)</td><td>自动归档,原因码自动填</td><td>待核查池抽样标注(批量车道)</td></tr>' +
        '</tbody></table>');

    } else {
      var cases = st.investigations;
      if (cases.length) { cases.forEach(function (k) { html += caseCard(k); }); }
      else {
        html += card('管网线 · 尚无调查案',
          UI.banner('info', '管网线<b>不是「线索池等人审」</b>,是「预警 → 调查案」:DMA 分区流量计与压力计出规则报警,AI 时序判型,系统自动开调查案,人在<b>立案 / 结案</b>两点拍板。') +
          '<div class="tiny">冷启动口径:规则腿代码第一天就绪,但首次可信报警需基线期 ' + UI.assume('X 天', '基线期 X 天 = 假设值:遥测通道打通 + 基线窗口历史;客户有归档则回算') + '。</div>');
      }
      html += healthCard(L);
      html += card('管网线队列 · ' + all.length + ' 条', queueTable(all,
        '本线的「置信」不是图像置信度,而是<b>规则持续时长 × 多源一致度</b> —— 三线置信语义都不同,这正是三线不能混为一谈的实证(线卡 C)。'));
      html += card('管网线车道表(线卡 C)',
        '<table class="tb"><thead><tr><th style="width:110px">车道</th><th style="width:230px">进入条件</th><th>处置</th><th style="width:200px">兜底</th></tr></thead><tbody>' +
        '<tr><td>紧急直派</td><td>爆管规则命中 × 阀事件对齐过(计划外)</td><td>自动紧急工单(关阀优先)+ 值班即刻预警;人并行确认</td><td>三级升级;紧急直派件全量抽审</td></tr>' +
        '<tr><td>调查案</td><td>渗漏 / 压力嫌疑</td><td>自动开调查案(观察窗 + 视觉旁证 + 可派现场核查);人在立案→结案两点拍板</td><td>调查案超期升级主管</td></tr>' +
        '<tr><td>设备维护</td><td>传感器自检失败</td><td><b>免人工定性</b>,自动开设备维护工单</td><td>月度设备健康报表</td></tr>' +
        '</tbody></table>');
    }

    html += card('最近动作日志(全域 · 一等公民对象)',
      UI.timeline(null, { limit: 8, desc: true }),
      '<span class="tiny">机械自动步也逐条留痕 —— 机械自动化不豁免审计</span>');
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
    var f = S.find.facility(c.facility);
    var meta = S.get().meta;

    /* --- 左列 --- */
    var left = UI.objectCard(c, { kind: '线索' });

    if (c.fastlane && isOpen(c)) left += fastlaneCard(c, true);
    if (c.lane === '应急人审档' && isOpen(c)) left += urgentReviewCard(c);
    if (c.mechFail) left += mechRejectCard(c);

    left += card('证据卡 · 全部为矢量示意(零真实照片)',
      UI.evidenceGrid(c.evidence) +
      '<div class="tiny" style="margin-top:6px">来源:' + esc(c.source || '—') + '。证据图统一标注「AI 生成示意」;原始视频不出专网。' +
      (c.publicRefs && c.publicRefs.length ? ' 已叠加公众上报证据:' + c.publicRefs.map(esc).join(' / ') + '(多源同点去重合并)。' : '') + '</div>',
      c.evidenceViewed ? UI.badge('已查看(高危确认前置已满足)', 'green') : UI.badge('高危件确认前须查看', 'grey'));

    left += card('机械校验闸(第二闸)', UI.checksCard(c) +
      '<div class="tiny" style="margin-top:6px">校验项<b>变长按线</b>:路面 5 项 / 井盖 4 项 / 管网 3 项;每项留痕规则包版本。' +
      '机械闸实际拦截面 = 定位错 / 重复线索 / 证据质量不合格 / 管网线规则先行;树影类持续假目标由人驳回回流(诚实边界)。</div>');

    var covRows = (f && f.sensors || []).map(function (sid) {
      var sn = S.find.sensor(sid);
      return sn ? ('<tr><td><b>' + esc(sn.id) + '</b></td><td>' + esc(sn.type) + '</td><td>' +
        UI.badge(sn.health, sn.health === '正常' ? 'green' : 'amber') + '</td><td class="tiny">' + esc(sn.window || '') + '</td></tr>') : '';
    }).join('');
    left += card('观测覆盖窗 · 漏报正面答',
      (covRows ? '<table class="tb"><thead><tr><th style="width:110px">数据源点位</th><th style="width:120px">类型</th><th style="width:110px">自检</th><th>覆盖窗</th></tr></thead><tbody>' + covRows + '</tbody></table>'
        : '<div class="tiny">本设施<b>无传感器绑定</b>(观测覆盖缺口)—— 事故回查时可据此区分「模型漏报」与「覆盖缺失」。</div>') +
      '<div class="tiny" style="margin-top:6px">不承诺不漏报;承诺每次定性可追溯:该点位全部线索与处置记录 + 该点位观测覆盖窗。</div>');

    if (isHigh(c)) {
      left += card('作业与联动',
        '<div class="small">· <b>作业时窗与封控校验</b>:斋月 / 高温禁令 / 活动封控 / 交管批文 → 排到最近可作业窗,<b>SLA 停表</b>(挂起原因码「待条件」)。</div>' +
        '<div class="small">· <b>跨机构联动出动</b>:需警察 / 民防 / 产权单位到场时,原单挂起原因码「联动处置等待」,联动到位后自动回队。</div>');
    }

    /* --- 右列:动作面板 + 时间线 --- */
    var right = '';
    var acts = '<div class="sec-title">定性动作 · 复核员</div>' +
      UI.actionPanel([
        { action: 'view_evidence', params: { clueId: c.id }, label: c.evidenceViewed ? '✓ 查看证据卡(已满足)' : '查看证据卡' },
        { action: 'confirm', params: { clueId: c.id }, label: c.fastlane ? '确认 = 告警追认' : '确认(线索成立)', cls: 'btn-ok' }
      ]) +
      modalBtn('驳回(必选六原因码)', 'reject', c.id) +
      modalBtn('转办产权单位(转办码 ≠ 驳回码)', 'transfer', c.id) +
      UI.actionPanel([{ action: 'archive_doubt', params: { clueId: c.id }, label: '存疑归档(仅批量半审车道)' }]);

    acts += '<div class="sep"></div><div class="sec-title">机械闸 / 紧急直派</div>' +
      modalBtn('推翻机械判定', 'overrule', c.id) +
      modalBtn('紧急直派撤回 · 召回班组', 'recall', c.id, 'btn-danger');

    if (tk) {
      acts += '<div class="sep"></div><div class="sec-title">复验人裁(永不默认打回)</div>' +
        UI.actionPanel([{ action: 'verify_pass', params: { ticketId: tk.id }, label: '复验人裁 · 合格(闭环)', cls: 'btn-ok' }]) +
        modalBtn('复验打回(须附对比证据)', 'verifyreject', tk.id, '', c.id);
    }

    acts += '<div class="sep"></div><div class="sec-title">主管以上(切顶栏角色可解锁)</div>' +
      modalBtn('紧急 override(红色动作 · 双确认)', 'override', c.id, 'btn-danger') +
      modalBtn('证据冻结 · 导出法务包', 'freeze', c.id) +
      (al ? modalBtn('撤销告警 ' + al.id, 'revoke', al.id, '', c.id)
        : '<div class="act-item"><button type="button" class="btn is-off" disabled>撤销告警</button><span class="act-why">未满足:本线索尚未确认成立,无告警可撤销</span></div>');

    right += card('动作面板 · 按钮即动作', acts,
      '<span class="tiny">当前身份:' + esc(S.get().role) + '</span>');

    var link = [c.id, c.ticketId, c.alertId].concat(c.publicRefs || []).filter(Boolean);
    var logs = S.get().actionLog.filter(function (g) {
      var s = JSON.stringify(g.params || {}) + ' ' + (g.sum || '');
      for (var i = 0; i < link.length; i++) if (s.indexOf(link[i]) >= 0) return true;
      return false;
    });
    right += card('时间线 · 本线索相关动作日志', UI.timeline(logs, { desc: false }),
      '<span class="tiny">' + logs.length + ' 条</span>');

    right += card('世界状态快照(四版本冻结)', UI.kv([
      ['规则包', esc(meta.ruleVer)],
      ['区级参数集', esc(meta.paramVer)],
      ['模型版本', esc(meta.modelVer)],
      ['参考数据快照', esc(meta.refVer)]
    ]) + '<div class="tiny" style="margin-top:6px">三年后可重放「当时为什么这么判」,抽审推翻有据(动作日志保存 ≥3 年,防篡改口径 = 可检测)。</div>');

    /* --- 关联对象行 --- */
    var relate = '';
    if (tk) {
      relate += '<div class="small">工单镜像:<b>' + esc(tk.id) + '</b> · ' + esc(tk.type) + ' · 状态 ' + UI.badge(tk.state, 'blue') +
        ' · 承接 ' + esc(UI.crewName(tk.crew)) + ' · 客户系统 ' + esc(tk.mirror) + ' · 来源 ' + esc(tk.source) +
        (tk.suspended ? ' · ' + UI.badge('已挂起 · SLA 停表', 'amber') : '') +
        ' <a href="#/m2">告警与工单 →</a></div>' +
        '<div class="tiny">处置动作全部写回区市政工单系统(它才是处置真源);证据同时双写进我方证据链。</div>';
    }
    if (al) {
      relate += '<div class="small" style="margin-top:6px">告警:<b>' + esc(al.id) + '</b> · ' + UI.badge(al.status, al.status === '成立' ? 'green' : 'grey') +
        ' · 成立于 ' + esc(al.t) + ' · 签字人 ' + esc(al.by) + '(人确认后才叫告警)</div>';
    }
    if (c.status === 'rejected') {
      var def = S.dict().rejectCodes.filter(function (r) { return r.code === c.rejectCode; })[0];
      relate += '<div class="small" style="margin-top:6px">驳回原因码:<b>' + esc(c.rejectCode || '') + '</b> ' +
        esc(def ? def.name : '') + ' → 回流「' + esc(def ? def.to : '') + '」</div>';
    }
    if (!relate) relate = '<div class="tiny">本线索暂无下游对象(确认后自动产生告警与工单镜像)。</div>';

    return '<div class="card card-tight"><div class="act-row">' +
      '<a class="btn btn-sm" href="' + back + '">← 返回 ' + esc(c.line) + '线队列</a>' +
      '<span class="tiny" style="align-self:center">路由 #/m1/clue/' + esc(c.id) + '</span></div></div>' +
      card('下游对象 · 处置真源在客户系统', relate) +
      '<div class="row wrap" style="align-items:flex-start">' +
      '<div class="grow" style="min-width:320px">' + left + '</div>' +
      '<div style="width:352px;flex:none;min-width:300px">' + right + '</div>' +
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
