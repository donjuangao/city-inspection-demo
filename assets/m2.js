/* ===== 模块 m2 视图 · 告警与工单 · 归属 W1-B 工兵(施工图 §7/§8 裁定②:模块拆独立文件,文件互斥) =====
   契约:VIEWS.m2 = function(ctx) 返回 HTML 字符串;ctx={module,rest[],hash}
   共享文件(tokens/store/data/ui/app.html)只读;按钮用 data-action 属性走 UI.bindActions→S.commit

   规格来源:
   - 施工图 §7 m2 清单:告警列表 / 工单镜像(状态机五格)/ 对账异常队列 / 调度视图(班组负载+改派/合并/拆单)
   - 施工图 §6 T9(过载三步+挂起回补卡)/ T11(调度视图+对账队列 1 条)
   - 设计档 §2.3b 工单系统对接契约(状态机五格映射 / 对账裁决规则)
   - 设计档 §0.8.3(在途抢占)/ §0.8.5(调度职能与调度视图;撤回≠改派概念分立)
   - 设计档 §0.6(角色权限:复核主管=复核员权限+抽审/撤销;调度职能落在复核主管+区值班长,不新增调度员角色)

   动态表单说明:ui.js 的 actionPanel/actionRow 只支持"渲染时已知的静态 params"(如 confirm/crew_accept)。
   本模块里改派/合并/拆单/撤销需要用户当场选择班组、理由码或填写文本,ui.js 未提供表单→按钮联动的通用机制,
   故在本文件内自建 window.M2 命名空间做"表单取值→更新按钮 data-p/disabled→仍由标准 data-act 走 S.commit"的桥接,
   不绕过 S.commit 这一唯一状态变更入口,也不改动共享 ui.js。 */
(function () {
  'use strict';
  var S = window.S, UI = window.UI, DATA = window.DATA;
  var TICKET_STATES = DATA.dict.ticketStates; // ['已派工','已接单','已到场','已完工','已验收']

  /* ---------------- 表单桥接(不改 ui.js,button 仍走标准 data-act→S.commit)---------------- */
  var M2 = {};
  M2.applyParams = function (action, btnId, params) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    var r = S.check(action, params);
    btn.setAttribute('data-p', JSON.stringify(params));
    btn.disabled = !r.ok;
    btn.classList.toggle('is-off', !r.ok);
    var why = document.getElementById(btnId + '-why');
    if (why) why.textContent = r.ok ? '' : ('未满足:' + r.reason);
  };
  M2.syncRevoke = function (alertId) {
    var reason = (document.getElementById('m2-rv-reason-' + alertId) || {}).value || '';
    var evidence = (document.getElementById('m2-rv-evi-' + alertId) || {}).value || '';
    M2.applyParams('revoke', 'm2-rv-btn-' + alertId, { alertId: alertId, reason: reason, evidence: evidence });
  };
  M2.syncDispatch = function (tid) {
    var crew = (document.getElementById('m2-dp-crew-' + tid) || {}).value || '';
    var reason = (document.getElementById('m2-dp-reason-' + tid) || {}).value || '';
    M2.applyParams('dispatch_manual', 'm2-dp-btn-' + tid, { ticketId: tid, crew: crew, reason: reason });
  };
  M2.syncSplit = function (tid) {
    var reason = (document.getElementById('m2-sp-reason-' + tid) || {}).value || '';
    M2.applyParams('split', 'm2-sp-btn-' + tid, { ticketId: tid, reason: reason });
  };
  M2.syncMerge = function () {
    var boxes = document.querySelectorAll('.m2-mg-chk:checked');
    var ids = Array.prototype.map.call(boxes, function (b) { return b.value; });
    var reason = (document.getElementById('m2-mg-reason') || {}).value || '';
    M2.applyParams('merge', 'm2-mg-btn', { ticketIds: ids, reason: reason });
  };
  window.M2 = M2;

  /* ---------------- 小工具 ---------------- */
  function sourceBadge(src) {
    if (!src) return '';
    var tone = src.indexOf('①') === 0 ? 'amber' : (src.indexOf('②') === 0 ? 'blue' : 'grey');
    return UI.badge(src, tone);
  }
  // 状态机五格进度(施工图 §7 m2:已派工/已接单/已到场/已完工/已验收);非五格内状态(D1/D7 等例外分支)单独标注
  function progressLine(t) {
    var idx = TICKET_STATES.indexOf(t.state);
    var seq = TICKET_STATES.map(function (s, i) {
      var tone = idx < 0 ? 'grey' : (i < idx ? 'green' : (i === idx ? 'blue' : 'grey'));
      return UI.badge(s, tone);
    }).join(' ');
    var extra = '';
    if (idx < 0) extra += ' ' + UI.badge(t.state, 'red') + '<span class="tiny">(例外分支,偏离标准五格)</span>';
    if (t.suspended) extra += ' ' + UI.badge('挂起' + (t.suspendReason ? '·' + t.suspendReason : ''), 'amber');
    if (t.recalled) extra += ' ' + UI.badge('已召回', 'amber');
    return seq + extra;
  }
  function stateBadge(t) {
    var idx = TICKET_STATES.indexOf(t.state);
    var tone = idx < 0 ? 'red' : (idx === TICKET_STATES.length - 1 ? 'green' : 'blue');
    var b = UI.badge(t.state, tone);
    if (t.suspended) b += ' ' + UI.badge('挂起', 'amber');
    return b;
  }

  /* ---------------- Tab 路由(#/m2/<tab>/<id>)---------------- */
  var TABS = [
    { id: 'alerts', label: '告警列表' },
    { id: 'tickets', label: '工单镜像' },
    { id: 'recon', label: '对账异常' },
    { id: 'dispatch', label: '调度视图' }
  ];
  function tabId(ctx) {
    var t = ctx.rest && ctx.rest[0];
    return TABS.some(function (x) { return x.id === t; }) ? t : 'alerts';
  }
  function tabsHtml(cur) {
    return '<div class="tabs">' + TABS.map(function (t) {
      return '<a href="#/m2/' + t.id + '" class="' + (t.id === cur ? 'is-on' : '') + '">' + UI.esc(t.label) + '</a>';
    }).join('') + '</div>';
  }

  /* ---------------- ① 告警列表(施工图 §7 m2;仅复核员「确认」后的对象才在此,术语分权的活证据)---------------- */
  function alertRow(al, curId) {
    var c = S.find.clue(al.clueId);
    return '<tr class="' + (al.id === curId ? 'is-sel' : '') + '">' +
      '<td>' + UI.levelBadge(al.level) + ' <a href="#/m2/alerts/' + UI.esc(al.id) + '">' + UI.esc(al.id) + '</a></td>' +
      '<td>' + UI.addr(al.facility) + '</td>' +
      '<td>' + UI.esc(al.line || '—') + '</td>' +
      '<td>' + (al.status === '成立' ? UI.badge('成立', 'green') : UI.badge('已撤销', 'grey')) + '</td>' +
      '<td>' + UI.esc(al.t) + ' · ' + UI.esc(al.by) + '</td>' +
      '<td>' + (c && c.ticketId ? ('<a href="#/m2/tickets/' + UI.esc(c.ticketId) + '">' + UI.esc(c.ticketId) + '</a>') : '<span class="faint">—</span>') + '</td>' +
      '</tr>';
  }
  function alertDetail(al) {
    var c = S.find.clue(al.clueId);
    var html = '<div class="card">' +
      '<div class="card-hd"><h3>告警 ' + UI.esc(al.id) + '</h3>' +
      UI.levelBadge(al.level) + ' ' + (al.status === '成立' ? UI.badge('成立', 'green') : UI.badge('已撤销', 'grey')) +
      '</div>' +
      UI.kv([
        ['设施', UI.addr(al.facility), true],
        ['业务线', al.line || '—'],
        ['确认人', al.by],
        ['确认时间', al.t],
        ['源线索', c ? ('<a href="#/m1/clue/' + UI.esc(c.id) + '">' + UI.esc(c.id) + '</a>') : UI.esc(al.clueId || ''), true],
        ['关联工单', (c && c.ticketId) ? ('<a href="#/m2/tickets/' + UI.esc(c.ticketId) + '">' + UI.esc(c.ticketId) + '</a>') : '—', true]
      ]);
    if (al.status !== '成立') {
      html += '<div class="sep"></div>' + UI.banner('warn',
        '已撤销:理由「' + UI.esc(al.revokeReason || '') + '」· ' + UI.esc(al.revokeT || '') + ' —— 记录不删除,状态置「已撤销」(§2.5⑥)。');
    } else {
      var reasonId = 'm2-rv-reason-' + al.id, eviId = 'm2-rv-evi-' + al.id, btnId = 'm2-rv-btn-' + al.id;
      var initP = { alertId: al.id, reason: '', evidence: '' };
      var chk = S.check('revoke', initP);
      html += '<div class="sep"></div>' +
        '<div class="sec-title">撤销告警(需主管权限;告警→撤销,不删除记录;R34/§2.5⑥)</div>' +
        '<label class="fl" for="' + reasonId + '">撤销理由</label>' +
        '<input type="text" id="' + reasonId + '" placeholder="如:复核后确认为误判 / 现场复查无异常" oninput="M2.syncRevoke(\'' + al.id + '\')">' +
        '<label class="fl" for="' + eviId + '">附证据说明</label>' +
        '<input type="text" id="' + eviId + '" placeholder="如:二次巡查记录编号 / 现场核实结论" oninput="M2.syncRevoke(\'' + al.id + '\')">' +
        '<div class="act-item" style="margin-top:8px">' +
        '<button type="button" class="btn btn-danger' + (chk.ok ? '' : ' is-off') + '" id="' + btnId + '" data-act="revoke" data-p="' + UI.attr(initP) + '"' + (chk.ok ? '' : ' disabled') + '>撤销告警</button>' +
        '<span class="act-why" id="' + btnId + '-why">' + (chk.ok ? '' : '未满足:' + UI.esc(chk.reason)) + '</span>' +
        '</div>';
    }
    html += '</div>';
    return html;
  }
  function renderAlerts(curId) {
    var alerts = S.get().alerts.slice().reverse();
    var note = '<div class="tiny" style="margin-bottom:6px">仅展示复核员「确认」后成立的告警——确认前只是「线索」,不在此列(术语分权,R32)。</div>';
    var table = alerts.length
      ? '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>告警号</th><th>设施</th><th>业务线</th><th>状态</th><th>确认</th><th>关联工单</th></tr></thead><tbody>' +
        alerts.map(function (al) { return alertRow(al, curId); }).join('') + '</tbody></table></div>'
      : '<div class="tiny">暂无成立告警。</div>';
    var detail = '';
    if (curId) {
      var al = S.find.alert(curId);
      if (al) detail = '<div class="sep"></div>' + alertDetail(al);
    }
    return note + table + detail;
  }

  /* ---------------- ② 工单镜像卡(状态机五格 + 来源标;施工图 §7 m2)---------------- */
  function ticketCard(t, curId) {
    var cw = t.crew ? S.find.crew(t.crew) : null;
    var photos = (t.photos || []).map(function (p) { return UI.evidenceCard(p, UI.esc(p.phase) + ' · ' + UI.esc(p.t)); }).join('');
    return '<div class="card card-tight" id="tk-' + UI.esc(t.id) + '" style="' + (t.id === curId ? 'border-color:var(--blue)' : '') + '">' +
      '<div class="card-hd"><b>' + UI.esc(t.id) + ' · ' + UI.esc(t.type) + '</b>' + sourceBadge(t.source) + '</div>' +
      '<div class="small muted">' + UI.addr(t.facility) + ' · ' + UI.esc(t.line || '—') + '线 · 承接:' + (cw ? UI.esc(cw.name) : '<span class="faint">未派</span>') + ' · 镜像 ' + UI.esc(t.mirror) + '</div>' +
      '<div style="margin:6px 0">' + progressLine(t) + '</div>' +
      UI.kv([
        ['接单 SLA', UI.sla(t.sla.accept), true],
        ['到场 SLA', UI.sla(t.sla.arrive), true],
        ['完工 SLA', UI.sla(t.sla.done), true],
        ['复验', t.verify || '—'],
        ['备注', t.note || '']
      ]) +
      (photos ? '<div class="sep"></div><div class="ev-grid">' + photos + '</div>' : '') +
      '</div>';
  }
  function renderTickets(curId) {
    var tickets = S.get().tickets.slice().reverse();
    if (!tickets.length) return '<div class="tiny">暂无工单。</div>';
    return '<div class="grid2">' + tickets.map(function (t) { return ticketCard(t, curId); }).join('') + '</div>';
  }

  /* ---------------- ③ 对账异常队列(施工图 §6 T11;设计档 §2.3b④ 裁决规则)---------------- */
  function renderRecon() {
    var items = S.get().recon || [];
    var head = '<div class="card card-tight">' +
      '<div class="sec-title">裁决规则(§2.3b④)</div>' +
      '<div class="small">处置状态以客户系统为准,巡检定性以我方为准;异常 ' +
      UI.assume('24h', '假设值:对账周期,试点首周与客户核实后按区可配(R48)') +
      ' 内主管人工裁定,裁定=动作入日志。M1-3 期以人工日对账清单先行(P0-lite),自动对账 P1。</div>' +
      '</div>';
    if (!items.length) {
      return head + '<div class="tiny" style="margin-top:8px">暂无对账异常(推进剧情至 T11 可见示例:WO-8863 我方镜像与客户系统状态不一致)。</div>';
    }
    var cards = items.map(function (rc) {
      return '<div class="card card-tight">' +
        '<div class="card-hd"><b>' + UI.esc(rc.id) + '</b>' + UI.badge(rc.status || '待裁定', rc.status === '已裁定' ? 'green' : 'amber') + '</div>' +
        UI.kv([
          ['关联工单', '<a href="#/m2/tickets/' + UI.esc(rc.ticketId) + '">' + UI.esc(rc.ticketId) + '</a>', true],
          ['客户镜像号', rc.mirror],
          ['我方状态', rc.ours],
          ['客户系统状态', rc.theirs],
          ['发现时间', rc.t]
        ]) +
        '<div class="sep"></div>' +
        '<div class="act-item">' +
        (rc.status === '已裁定'
          ? '<span class="tiny">已裁定:' + UI.esc(rc.ruling || '处置状态以客户系统为准') + '(' + UI.esc(rc.ruledT || '') + ')</span>'
          : (function () { var r = S.check('recon_rule', { reconId: rc.id }); return '<button type="button" class="btn' + (r.ok ? ' btn-primary' : ' is-off') + '"' + (r.ok ? '' : ' disabled') + ' data-act="recon_rule" data-p="' + UI.attr({ reconId: rc.id }) + '">裁决:处置状态以客户系统为准</button>' + (r.ok ? '' : '<span class="act-why">' + UI.esc(r.reason) + '</span>'); })()) +
        '</div>' +
        '</div>';
    }).join('');
    return head + cards;
  }

  /* ---------------- ④ 调度视图(施工图 §7 m2 + §6 T9;设计档 §0.8.3/§0.8.5)---------------- */
  function crewCard(cw) {
    var tone = cw.status === '空闲' ? 'green' : 'blue';
    var myTickets = S.get().tickets.filter(function (t) { return t.crew === cw.id && t.state !== '已验收' && t.state !== '已合并'; });
    return '<div class="card card-tight">' +
      '<div class="card-hd"><b>' + UI.esc(cw.name) + '</b>' + UI.badge(cw.status, tone) + '</div>' +
      UI.kv([
        ['辖区', cw.loc],
        ['业务线', cw.lines.join(' / ')],
        ['资质', cw.quals.join(' / ') || '—'],
        ['装备', cw.gear.join(' / ') || '—'],
        ['班次', cw.shift],
        ['当前负载', cw.load + ' 单' + (cw.contractor ? ' · 年度承包商' : '')]
      ]) +
      '<div class="sep"></div>' +
      (myTickets.length
        ? '<div class="tiny">在办:' + myTickets.map(function (t) { return '<a href="#/m2/tickets/' + UI.esc(t.id) + '">' + UI.esc(t.id) + '</a>'; }).join(' · ') + '</div>'
        : '<div class="tiny faint">当前无在办工单</div>') +
      '</div>';
  }
  // T9 应急抢占演示卡(施工图 §6 T9;设计档 §0.8.3 在途抢占;数据模型标注 WO-8871 = 被抢占对象)
  function preemptCard() {
    var t = S.find.ticket('WO-8871');
    if (!t) return '';
    var cw = t.crew ? S.find.crew(t.crew) : null;
    var suspendOpts = S.dict().reasonCodes.suspend; // ['应急抢占','待条件(审批/物料/装备)','联动处置等待']
    var btnsHtml = suspendOpts.map(function (r) {
      var p = { ticketId: 'WO-8871', reason: r };
      var chk = S.check('suspend', p);
      return '<div class="act-item">' +
        '<button type="button" class="btn btn-sm' + (chk.ok ? '' : ' is-off') + '"' + (chk.ok ? '' : ' disabled') +
        ' data-act="suspend" data-p="' + UI.attr(p) + '">挂起 · ' + UI.esc(r) + '</button>' +
        (chk.ok ? '' : '<span class="act-why">未满足:' + UI.esc(chk.reason) + '</span>') +
        '</div>';
    }).join('');
    var body = t.suspended
      ? UI.banner('warn', '已挂起:原因「' + UI.esc(t.suspendReason || '') + '」(' + UI.esc(t.suspendT || '') + ');SLA 停表,班组已释放;条件解除后回队重派——下方「改派/合并/拆单」表对本单重新指派班组即完成回补。')
      : ('<div class="sep"></div><div class="sec-title">值班长可抢占:第二井盖应急件承接池无空闲班组时,挂起本单释放班组(D6/D7)</div><div class="act-panel">' + btnsHtml + '</div>');
    return '<div class="card" style="border-color:var(--amberw)">' +
      '<div class="card-hd"><h3>T9 应急抢占演示 · ' + UI.esc(t.id) + '</h3>' + UI.badge(t.type, 'blue') + '</div>' +
      '<div class="small muted">' + UI.addr(t.facility) + ' · 承接班组 ' + (cw ? UI.esc(cw.name) : '<span class="faint">—</span>') + '</div>' +
      '<div class="tiny" style="margin-top:2px">' + UI.esc(t.note || '') + '</div>' +
      body +
      '</div>';
  }
  function dispatchTable() {
    var tickets = S.get().tickets.filter(function (t) { return t.state !== '已验收' && t.state !== '已合并'; });
    if (!tickets.length) return '<div class="tiny">暂无可调度工单。</div>';
    var crews = S.get().crews;
    var reasonsDispatch = S.dict().reasonCodes.dispatch;
    var rows = tickets.map(function (t) {
      var eligible = crews.filter(function (c) { return c.lines.indexOf(t.line) >= 0; });
      if (!eligible.length) eligible = crews;
      var crewSel = '<select id="m2-dp-crew-' + t.id + '" onchange="M2.syncDispatch(\'' + t.id + '\')">' +
        '<option value="">改派至…</option>' +
        eligible.map(function (c) { return '<option value="' + UI.esc(c.id) + '">' + UI.esc(c.name) + (c.id === t.crew ? '(现)' : '') + '</option>'; }).join('') +
        '</select>';
      var reasonSel = '<select id="m2-dp-reason-' + t.id + '" onchange="M2.syncDispatch(\'' + t.id + '\')">' +
        '<option value="">理由码…</option>' +
        reasonsDispatch.map(function (r) { return '<option value="' + UI.esc(r) + '">' + UI.esc(r) + '</option>'; }).join('') +
        '</select>';
      var dpP = { ticketId: t.id, crew: '', reason: '' };
      var dpChk = S.check('dispatch_manual', dpP);
      var spP = { ticketId: t.id, reason: '' };
      var spChk = S.check('split', spP);
      return '<tr>' +
        '<td><input type="checkbox" class="m2-mg-chk" value="' + UI.esc(t.id) + '" onchange="M2.syncMerge()"></td>' +
        '<td><a href="#/m2/tickets/' + UI.esc(t.id) + '">' + UI.esc(t.id) + '</a><div class="tiny">' + UI.esc(t.type) + '</div></td>' +
        '<td>' + UI.addr(t.facility) + '</td>' +
        '<td>' + (t.crew ? UI.esc(UI.crewName(t.crew)) : '<span class="faint">未派</span>') + '</td>' +
        '<td>' + stateBadge(t) + '</td>' +
        '<td>' + crewSel + reasonSel +
        '<button type="button" class="btn btn-sm' + (dpChk.ok ? '' : ' is-off') + '" id="m2-dp-btn-' + t.id + '" data-act="dispatch_manual" data-p="' + UI.attr(dpP) + '"' + (dpChk.ok ? '' : ' disabled') + '>改派</button>' +
        '<div class="tiny act-why" id="m2-dp-btn-' + t.id + '-why">' + (dpChk.ok ? '' : '未满足:' + UI.esc(dpChk.reason)) + '</div>' +
        '</td>' +
        '<td><input type="text" id="m2-sp-reason-' + t.id + '" placeholder="拆单理由" oninput="M2.syncSplit(\'' + t.id + '\')" style="width:120px;display:inline-block;margin-right:4px">' +
        '<button type="button" class="btn btn-sm' + (spChk.ok ? '' : ' is-off') + '" id="m2-sp-btn-' + t.id + '" data-act="split" data-p="' + UI.attr(spP) + '"' + (spChk.ok ? '' : ' disabled') + '>拆单</button>' +
        '<div class="tiny act-why" id="m2-sp-btn-' + t.id + '-why">' + (spChk.ok ? '' : '未满足:' + UI.esc(spChk.reason)) + '</div>' +
        '</td>' +
        '</tr>';
    }).join('');
    var mgP = { ticketIds: [], reason: '' };
    var mgChk = S.check('merge', mgP);
    return '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th></th><th>工单</th><th>设施</th><th>现班组</th><th>状态</th><th>改派(理由码必填)</th><th>拆单(理由必填)</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="card card-tight" style="margin-top:8px">' +
      '<div class="sec-title">合并所选工单(勾选 ≥2 张同点位/同时窗工单)</div>' +
      '<input type="text" id="m2-mg-reason" placeholder="合并理由,如:同点位重复派工" oninput="M2.syncMerge()">' +
      '<div class="act-item" style="margin-top:6px">' +
      '<button type="button" class="btn' + (mgChk.ok ? '' : ' is-off') + '" id="m2-mg-btn" data-act="merge" data-p="' + UI.attr(mgP) + '"' + (mgChk.ok ? '' : ' disabled') + '>合并</button>' +
      '<span class="act-why" id="m2-mg-btn-why">' + (mgChk.ok ? '' : '未满足:' + UI.esc(mgChk.reason)) + '</span>' +
      '</div></div>';
  }
  function renderDispatch() {
    var crews = S.get().crews;
    return '<div class="card card-tight">' +
      '<div class="small">概念分立(§0.8.5):<b>撤回</b> = 事件不成立(线索转驳回流,召回班组);<b>改派</b> = 事件成立但派错了承接方(单子换人,事件不动)。以下三件均为显名动作,理由入日志。不新增「调度员」角色——调度职能落在复核主管(常规改派)+ 区值班长(应急仲裁)。</div>' +
      '</div>' +
      '<div class="sec-title" style="margin-top:10px">班组负载卡(在办/在途/空闲)</div>' +
      '<div class="grid3">' + crews.map(crewCard).join('') + '</div>' +
      '<div style="margin-top:10px">' + preemptCard() + '</div>' +
      '<div class="sec-title" style="margin-top:10px">改派 / 合并 / 拆单</div>' +
      dispatchTable();
  }

  /* ---------------- 出口 ---------------- */
  VIEWS.m2 = function (ctx) {
    var tab = tabId(ctx);
    var id = ctx.rest && ctx.rest[1];
    var body = tab === 'alerts' ? renderAlerts(id)
      : tab === 'tickets' ? renderTickets(id)
        : tab === 'recon' ? renderRecon()
          : renderDispatch();
    return tabsHtml(tab) + '<div style="margin-top:10px">' + body + '</div>';
  };
})();
