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
      title: '误报申诉裁定 · 主管 / 值班长',
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
      '<div class="oc-t3">跨线仲裁默认序:<b>井盖紧急 &gt; 管网紧急 &gt; 路面急修</b>;本线内机器直派件再置顶。区值班主管可临时置顶改序,动作留痕。' +
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
      '<p><b>加急人工档的兜底:</b>超时走三级升级(复核员 → 复核主管 → 区值班长),并发只读预警不定性也不派工;本档的确认与驳回都拘进主管抽审。</p>' +
      '<p><b>机械闸的实际拦截面:</b>定位错 / 重复线索 / 证据质量不合格 / 管网线规则先行。树影这类物理上持续存在的假目标,机械闸拦不住 —— 误报主体仍由人驳回、按原因码回流模型。推翻机械判定 = 线索复活进人审 + 自动触发抽审,误杀样本回流规则组。</p>' +
      '<p><b>免人工车道的判据与兜底:</b>养护级 × 高置信 × 机械全过 = 自动并入周期养护计划;观察级 × 机械过 = 自动记台账入劣化曲线。免人工不豁免审计:每条一条动作日志,按抽审率捞回复查,抽审可推翻。</p>' +
      '<p><b>存疑归档:</b>既不算确认也不算驳回,计入模型评估统计;只在批量半审车道内可用。</p>' +
      '<p><b>数据源隐性失效两态:</b>读数卡死(方差为零超时,过得了心跳过不了它)与量程饱和(暴雨积水恒满值,不等于失联),判据分开。先排设备故障,再报业务异常;设备工单承接方是传感网运维方,不进三线班组队列。</p>' +
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
      return '<tr class="' + (urgent ? 'is-urgent ' : '') + (on ? 'is-sel' : '') + '" data-row="' + esc(c.id) + '" style="cursor:pointer" title="点击展开详情">' +
        '<td><span class="acc-cev">' + (on ? '▾' : '▸') + '</span> <b>' + esc(c.id) + '</b>' + (c.fastlane ? ' ' + UI.badge('机器直派', 'amber') : '') +
        '<div class="tiny">观测 ' + (c.obsCount || UI.obsList(c).length) + ' 次 · 最近 ' + esc(c.lastSeen || c.t) + '</div></td>' +
        '<td>' + UI.addr(c.facility) + '<div class="tiny">' + esc(c.kindText || '') + '</div></td>' +
        '<td>' + UI.levelBadge(c.level) + '</td>' +
        '<td>' + confText(c) + '</td>' +
        '<td>' + (c.lane ? laneBadgeH(c) : '—') + '</td>' +
        '<td>' + slaCell(c) + '</td>' +
        '<td>' + UI.statusBadge(c.status) + '</td>' +
        '<td><a href="#/m1/clue/' + esc(c.id) + '" class="tiny">详情 →</a></td></tr>' +
        (on ? '<tr class="row-open"><td colspan="8">' + cardFor(c) + '</td></tr>' : '');
    }).join('');
    return filterBar(key, list, view.length) +
      '<table class="tb"><thead><tr>' +
      '<th style="width:140px">线索号</th><th>设施 · 地址</th><th style="width:74px">级别</th>' +
      '<th style="width:66px">置信度</th><th style="width:132px">档位</th><th style="width:104px">SLA 倒计时</th>' +
      '<th style="width:96px">状态</th><th style="width:62px">详情</th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="tiny">筛选后无匹配线索。</td></tr>') + '</tbody></table>';
  }

  /* ============ 置顶区「待处置 · 按时限排序」(R87 A4:只放当前角色需动作的件 · 手风琴同时只开一条)============ */
  /* 通用待处置卡(不属于机器直派 / 加急人工 / 机械驳回三种专卡的件) */
  function pendingCard(c) {
    var body = UI.obsLine(c) +
      '<div class="row wrap" style="align-items:flex-start">' +
      '<div class="grow" style="min-width:230px">' +
      UI.kv([
        ['通道', laneBadgeH(c) + ' <span class="tiny">' + esc(UI.laneKind(c.lane) || '') + '</span>', true],
        ['SLA 倒计时', c.slaDeadline ? (UI.sla(c.slaDeadline) + ' · 截止 ' + esc(c.slaDeadline)) : '批量车道 · 按批计', true],
        ['机械校验', ((c.checks || []).filter(function (x) { return x.result === 'pass'; }).length) + '/' + (c.checks || []).length + ' 项通过'],
        ['来源', esc(c.source || '—')],
        ['异常', esc(c.kindText || '—')]
      ]) + '</div>' +
      '<div style="width:286px;flex:none;min-width:230px">' + UI.evInset(UI.evThumb(c)) + '</div>' +
      '</div><div class="sep"></div>' +
      '<div class="row wrap"><div class="grow">' + pw(UI.actionPanel([
        { action: 'confirm', params: { clueId: c.id }, label: '确认(线索成立)', cls: 'btn-ok' }
      ])) + '</div><div class="grow">' +
      pw(modalBtn('驳回(六码)', 'reject', c.id) + modalBtn('转办产权单位', 'transfer', c.id)) +
      '</div></div>';
    return tcard('clue', esc(c.id) + ' ' + UI.levelBadge(c.level) + ' ' + laneBadgeH(c), body,
      '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">进详情 →</a>', { line: c.line });
  }
  /* 同一详情组件:置顶卡与表内展开共用 */
  function cardFor(c) {
    if (c.fastlane && isOpen(c)) return fastlaneCard(c);
    if (c.lane === '加急人工' && isOpen(c)) return urgentReviewCard(c);
    if (c.mechFail) return mechRejectCard(c);
    return pendingCard(c);
  }
  /* 待裁定卡:误报申诉交到主管 / 值班长手上的那一件 */
  function rulingCard(al) {
    var ap = al.appeal || {}, c = al.clueId ? S.find.clue(al.clueId) : null;
    var body = UI.banner('warn', '<b>误报申诉待裁定</b> —— ' + esc(al.id) + '(' + UI.addr(al.facility) + ')') +
      UI.kv([
        ['申诉人 · 时刻', esc(ap.by || '—') + ' · ' + esc(ap.t || '—')],
        ['申诉理由码', esc(ap.reason || '—')],
        ['补充说明', esc(ap.note || '—')],
        ['源线索', c ? ('<a href="#/m1/clue/' + esc(c.id) + '">' + esc(c.id) + '</a> · ' + esc(c.kindText || '')) : '—', true],
        ['告警状态', UI.badge(al.status, 'amber'), true]
      ]) +
      '<div class="sep"></div>' + pw(modalBtn('申诉裁定(成立 / 不成立)', 'ruling', al.id, 'btn-primary'));
    return tcard('alert', '误报申诉裁定 · ' + esc(al.id), body,
      c ? '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">看源线索 →</a>' : '', { tag: '待裁定' });
  }
  function pendingList(line) {
    var st = S.get(), out = [];
    if (canRole('confirm')) {
      cluesOf(line).forEach(function (c) {
        if (!isOpen(c)) return;
        if (!(c.fastlane || c.mechFail || c.slaDeadline)) return;   // 有 SLA 倒计时 / 待确认的才进置顶区
        var dl = (c.fastlane && c.reviewEnd) ? c.reviewEnd : c.slaDeadline;
        out.push({
          id: c.id, sort: dl ? S.slaLeft(dl) : 9999,
          head: '<b>' + esc(c.id) + '</b> ' + UI.levelBadge(c.level) + ' ' + laneBadgeH(c) +
            ' <span class="oc-t3">' + esc(c.kindText || '') + ' · ' + UI.addr(c.facility) + '</span>',
          right: '为什么在这:<b>' + esc(laneName(c.lane)) + '</b> · ' + esc(leftText(dl)),
          body: cardFor(c)
        });
      });
    }
    if (canRole('misfire_ruling')) {
      (st.alerts || []).filter(function (a) { return a.status === '申诉复核中' && a.line === line; }).forEach(function (al) {
        out.push({
          id: al.id, sort: -1,
          head: '<b>' + esc(al.id) + '</b> ' + UI.badge('申诉复核中', 'amber') +
            ' <span class="oc-t3">误报申诉待裁定 · ' + UI.addr(al.facility) + '</span>',
          right: '为什么在这:<b>误报申诉</b> · 待你裁定',
          body: rulingCard(al)
        });
      });
    }
    out.sort(function (a, b) { return a.sort - b.sort; });
    return out;
  }
  /* 当前展开的那一条:未点过 = 默认展开最紧的一条 */
  function curOpen(key) {
    var items = pendingList(lineOfKey(key).line);
    var cur = M.acc[key];
    if (cur === '') return '';                                   // 用户显式收起了
    if (cur !== undefined) {
      for (var i = 0; i < items.length; i++) if (items[i].id === cur) return cur;
    }
    return items[0] ? items[0].id : '';                          // 没点过 / 原来那条已不在队列 → 展开最紧的一条
  }
  function pendingSection(key, line) {
    var items = pendingList(line);
    var openId = curOpen(key);
    var body = items.length
      ? UI.accordion(items, openId)
      : '<div class="tiny">当前身份「' + esc(S.get().role) + '」在本线没有待处置的件。</div>';
    return card('待处置 · 按时限排序(' + items.length + ')', body,
      '<span class="tiny">同时只展开一条 · 档位徽章悬停看该档判据</span>', 'card-tight');
  }

  /* ============ 机器直派并行复核卡(T1/T2 后出现)============ */
  function fastlaneCard(c) {
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
      '<div style="width:286px;flex:none;min-width:212px">' + UI.evInset(UI.evThumb(c)) + '</div>' +
      '</div>' +
      '<div class="sep"></div>' +
      '<div class="row wrap">' +
      '<div class="grow">' + pw(UI.actionPanel([
        { action: 'confirm', params: { clueId: c.id }, label: '确认 = 告警追认', cls: 'btn-ok' }
      ])) + '</div>' +
      '<div class="grow">' + pw(modalBtn('机器直派撤回(理由码 · 召回班组)', 'recall', c.id, 'btn-danger')) + '</div>' +
      '</div>' +
      '<div class="tiny" style="margin-top:8px"><a href="#/m4">该件已入抽审队列 →</a></div>';
    return tcard('clue', '机器直派并行复核 · ' + esc(c.id) + ' ' + UI.levelBadge(c.level) + ' ' + UI.badge('先派后审', 'amber'),
      body, '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">进详情 →</a>', { line: c.line });
  }

  /* ============ 加急人工卡(T5 · 0.31 件,与机器直派成对照)============ */
  function urgentReviewCard(c) {
    var body =
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
      '<div style="width:286px;flex:none;min-width:230px">' + UI.evInset(UI.evThumb(c)) + '</div>' +
      '</div>' +
      '<div class="sep"></div>' +
      '<div class="row wrap"><div class="grow">' + pw(UI.actionPanel([
        { action: 'confirm', params: { clueId: c.id }, label: '确认(线索成立)', cls: 'btn-ok' }
      ])) + '</div><div class="grow">' +
      pw(modalBtn('驳回(六码)', 'reject', c.id) + modalBtn('转办产权单位', 'transfer', c.id)) +
      '</div></div>';
    return tcard('clue', '加急人工 · ' + esc(c.id) + ' ' + UI.levelBadge(c.level) + ' ' + UI.badge('置信 ' + conf2(c.conf), 'grey'),
      body, '<a href="#/m1/clue/' + esc(c.id) + '" class="tiny">进详情 →</a>', { line: c.line });
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
      UI.obsLine(c) +
      '<div class="row wrap" style="align-items:flex-start">' +
      '<div style="width:286px;flex:none;min-width:230px">' + UI.evInset(UI.evThumb(c)) + '</div>' +
      '<div class="grow" style="min-width:240px">' + UI.checksCard(c) + '</div></div>' +
      '<div class="sep"></div>' +
      '<div class="row wrap"><div class="grow">' +
      pw(UI.actionPanel([{ action: 'reject', params: { clueId: c.id, code: '①' }, label: '认可机械判定 · 驳回(码① 拍摄干扰)' }]) +
      modalBtn('其他原因码驳回…', 'reject', c.id)) +
      '</div><div class="grow">' +
      pw(modalBtn('推翻机械判定(理由码必填)', 'overrule', c.id, 'btn-danger')) +
      '</div></div>';
    return tcard('clue', '机械驳回置顶 · ' + esc(c.id) + ' ' + UI.levelBadge(c.level) + ' ' + UI.laneBadge('机械驳回'),
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
        ' · 承接方:传感网运维方。 <a href="#/m2">工单镜像 →</a></div>' : '');
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
      '<div class="small"><b>雨前清掏核查任务包</b>:' +
      (tks.length ? tks.map(function (t) { return esc(t.id) + ' · ' + esc(t.state) + ' · ' + esc(UI.crewName(t.crew)) + ' · ' + UI.addr(t.facility); }).join(' ; ') : '待下发') +
      ' <a href="#/m2">工单镜像 →</a></div>';
    return card('暴雨模式 · 全线升档 ' + UI.badge('雨前专项', 'amber'), body);
  }

  /* ============ 三个 tab 的队列页 ============ */
  function queuePage(key) {
    var L = lineOfKey(key), st = S.get();
    var all = cluesOf(L.line);
    var html = '';

    /* ① 置顶区:只放当前角色需要动作的件,按时限升序,手风琴同时只开一条 */
    html += pendingSection(key, L.line);

    /* ② 本线专有工作区(批量半审 / 调查案 / 暴雨任务包 / 数据源健康) */
    if (L.key === 'mh') {
      html += stormCard();
      html += healthCard(L);

    } else if (L.key === 'rd') {
      html += autoUpgradeCard(all.filter(function (c) { return c.status === 'auto_done'; }));
      html += batchView(all.filter(function (c) { return c.lane === '批量半审' && isOpen(c); }));

    } else {
      var cases = st.investigations;
      if (cases.length) { cases.forEach(function (k) { html += caseCard(k); }); }
      else {
        html += card('管网线 · 尚无调查案',
          UI.banner('info', '本线走「预警 → 调查案」:DMA 分区流量计与压力计出规则报警,系统自动开调查案,人在<b>立案 / 结案</b>两点拍板。') +
          '<div class="tiny">冷启动口径:首次可信报警需基线期 ' + UI.assume('X 天', '基线期 X 天 = 假设值:遥测通道打通 + 基线窗口历史;客户有归档则回算') + '。</div>');
      }
      html += healthCard(L);
    }

    /* ③ 全部线索表:状态 / 档位筛选,点行内联展开同一详情组件 */
    html += tcard('clue', '全部线索(' + all.length + ')', queueTable(key, all),
      '', { line: L.line, tag: L.line + '线' });

    html += card('最近动作日志',
      UI.timeline(null, { limit: 8, desc: true }),
      '<span class="tiny">机械自动步也逐条留痕</span>');
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

    if (c.fastlane && isOpen(c)) left += fastlaneCard(c);
    if (c.lane === '加急人工' && isOpen(c)) left += urgentReviewCard(c);
    if (c.mechFail) left += mechRejectCard(c);

    left += tcard('clue', '证据卡 · ' + UI.evShots(c).length + ' 张',
      UI.evInset(UI.evThumb(c, {
        note: '来源:' + esc(c.source || '—') +
          (c.publicRefs && c.publicRefs.length ? ' · 已叠加公众上报:' + c.publicRefs.map(esc).join(' / ') : '')
      })),
      c.evidenceViewed ? UI.badge('已查看(高危确认前置已满足)', 'green') : UI.badge('高危件确认前须查看', 'grey'),
      { line: c.line, tag: '证据' });

    left += card('机械校验闸(第二闸)', UI.checksCard(c));

    var covRows = (f && f.sensors || []).map(function (sid) {
      var sn = S.find.sensor(sid);
      return sn ? ('<tr><td><b>' + esc(sn.id) + '</b></td><td>' + esc(sn.type) + '</td><td>' +
        UI.badge(sn.health, sn.health === '正常' ? 'green' : 'amber') + '</td><td class="tiny">' + esc(sn.window || '') + '</td></tr>') : '';
    }).join('');
    left += card('观测覆盖窗',
      (covRows ? '<table class="tb"><thead><tr><th style="width:110px">数据源点位</th><th style="width:120px">类型</th><th style="width:110px">自检</th><th>覆盖窗</th></tr></thead><tbody>' + covRows + '</tbody></table>'
        : '<div class="tiny">本设施<b>无传感器绑定</b>(观测覆盖缺口)。</div>'));

    /* --- 右列:动作面板 + 时间线 --- */
    var right = '';
    var inWindow = !!(c.reviewEnd && S.slaLeft(c.reviewEnd) >= 0);
    var acts = '<div class="sec-title">定性动作 · 复核员</div>' +
      '<div class="act-item"><button type="button" class="btn" data-ev="' + esc(c.id) + '">' +
      (c.evidenceViewed ? '✓ 查看证据卡(已满足)' : '查看证据卡') + '</button></div>' +
      UI.actionPanel([
        { action: 'confirm', params: { clueId: c.id }, label: c.fastlane ? '确认 = 告警追认' : '确认(线索成立)', cls: 'btn-ok' }
      ]) +
      modalBtn('驳回(必选六原因码)', 'reject', c.id) +
      modalBtn('转办产权单位', 'transfer', c.id) +
      UI.actionPanel([{ action: 'archive_doubt', params: { clueId: c.id }, label: '存疑归档(仅批量半审车道)' }]);

    acts += '<div class="sep"></div>' + UI.secTitle('机械闸 / 机器直派', 'clue') +
      modalBtn('推翻机械判定', 'overrule', c.id) +
      /* R87 A1:复核窗内 = 撤回召回班组;窗过 = 误报申诉(交主管裁定) */
      (inWindow || !al
        ? modalBtn('机器直派撤回 · 召回班组' + (c.reviewEnd ? '(窗内 · 截止 ' + esc(c.reviewEnd) + ')' : ''), 'recall', c.id, 'btn-danger')
        : modalBtn('误报申诉(复核窗已过)', 'appeal', al.id, '', c.id));

    if (tk) {
      acts += '<div class="sep"></div><div class="sec-title">复验人裁(永不默认打回)</div>' +
        UI.actionPanel([{ action: 'verify_pass', params: { ticketId: tk.id }, label: '复验人裁 · 合格(闭环)', cls: 'btn-ok' }]) +
        modalBtn('复验打回(须附对比证据)', 'verifyreject', tk.id, '', c.id);
    }

    acts += '<div class="sep"></div><div class="sec-title">主管以上(切顶栏角色可解锁)</div>' +
      (al && al.status === '申诉复核中' ? modalBtn('申诉裁定 ' + al.id + '(成立 / 不成立)', 'ruling', al.id, 'btn-primary', c.id) : '') +
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
    /* R87 A4:置顶区手风琴(同时只开一条)与全部线索表的行内展开 —— 都只改本页局部态 */
    var t = e.target;
    while (t && t.getAttribute && !t.getAttribute('data-acc') && !t.getAttribute('data-row') &&
      !t.getAttribute('data-filt') && !t.getAttribute('data-ui') && !t.getAttribute('data-goto')) t = t.parentNode;
    if (t && t.getAttribute) {
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
