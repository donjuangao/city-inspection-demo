/* ===== 模块 m4 视图 · 兜底与质量 · 归属 W1-B 工兵(施工图 §7/§8 裁定②:模块拆独立文件,文件互斥) =====
   契约:VIEWS.m4 = function(ctx) 返回 HTML 字符串;ctx={module,rest[],hash}
   共享文件(tokens/store/data/ui/app.html)只读;按钮用 data-action 属性走 UI.bindActions→S.commit

   规格来源:
   - 施工图 §7 m4 清单:抽审队列(拘审标来源)/ 热线上报并入清单(R88 A1⑬:市民渠道 = 12345 市政热线,接线员录入)
   - 设计档 §2.5 机制⑧抽审参数(记账道5%/自动升格道10%/机械驳回5%/批量确认件15%/复验通过件10%,抽审时限48h,全假设值)
   - 设计档 §2.4 P1:热线上报防滥用三件(同点位去重合并/单设备限频/重复无效上报降权);先入并入队列人工甄别升格,不直接进紧急处置
   - 施工图 §6 T10:热线上报同点位 → 去重合并进既有线索,证据叠加,重复来电计数可见

   本模块为只读展示(队列/清单本身不含需要用户当场输入参数的动作),故不建表单桥接;
   跨模块深链(→ m1 线索详情、→ m2 工单镜像)只是 hash 导航,不产生状态变更。 */
(function () {
  'use strict';
  var S = window.S, UI = window.UI;

  /* ---------------- ① 抽审队列(拘审标来源;施工图 §7 m4)---------------- */
  function srcTone(src) {
    if (!src) return 'grey';
    if (src.indexOf('高危') >= 0) return 'red';
    if (src.indexOf('override') >= 0 || src.indexOf('自动拘审') >= 0) return 'red';
    if (src.indexOf('推翻机械判定') >= 0) return 'blue';
    if (src.indexOf('机器直派') >= 0 || src.indexOf('批量') >= 0 || src.indexOf('降级') >= 0 || src.indexOf('自动升格') >= 0) return 'amber';
    return 'grey';
  }
  // 抽审关联对象的术语分权:已确认成告警的显示「告警」,尚未确认(或已驳回)的仍显示「线索」——按对象当前真实状态判定,不猜
  function auLabel(clueId) {
    if (!clueId) return '<span class="faint">—</span>';
    var c = S.find.clue(clueId);
    if (!c) return UI.esc(clueId);
    if (c.alertId) {
      var al = S.find.alert(c.alertId);
      return '<a href="#/m1/clue/' + UI.esc(c.id) + '">告警 ' + UI.esc(al ? al.id : c.alertId) + '</a><span class="tiny"> (源线索 ' + UI.esc(c.id) + ')</span>';
    }
    return '<a href="#/m1/clue/' + UI.esc(c.id) + '">线索 ' + UI.esc(c.id) + '</a><span class="tiny"> (' + UI.esc(UI.statusText(c.status)) + ')</span>';
  }
  /* R88 A5⑭:被抽对象一律可点 —— 优先用 Y0 补的 targetKind/targetId/targetRoute(线索 / 工单 / 告警 / 动作日志),
     只有旧记录(仅有 clueId)才回落到 auLabel 的线索/告警术语分权渲染。 */
  function auTarget(a) {
    if (!a.targetId) return auLabel(a.clueId);
    var lb = UI.esc(a.targetKind || '对象') + ' ' + UI.esc(a.targetId);
    var body = a.targetRoute ? ('<a href="' + UI.esc(a.targetRoute) + '">' + lb + ' →</a>') : lb;
    /* 被抽的是线索时,顺带把它现在的定性状态标出来(抽审看的是「当时的处置」,状态是回查线索) */
    if (a.targetKind === '线索') {
      var c = S.find.clue(a.targetId);
      if (c) body += '<div class="tiny">' + UI.esc(UI.statusText(c.status)) +
        (c.alertId ? ' · 已成立告警 ' + UI.esc(c.alertId) : '') + '</div>';
    }
    return body;
  }
  /* R88 A5⑭:被抽动作的上下文 —— srcRid 指向把这条件拘进抽审队列的那条动作日志(执行人 + 时刻 + 摘要) */
  function auContext(a) {
    var logs = S.get().actionLog || [];
    var g = null;
    for (var i = 0; i < logs.length; i++) if (logs[i].rid === a.srcRid) { g = logs[i]; break; }
    var head = '<div class="tiny" style="margin-bottom:6px">被抽动作上下文(把这件拘进抽审队列的那一步处置)</div>';
    if (!g) {
      return head + UI.kv([
        ['触发动作', a.srcRid ? ('动作日志 ' + UI.esc(a.srcRid) + '(本次会话中未找到该记录)') : 'T0 存量件:入队动作发生在本次演示开始之前'],
        ['拘审理由', UI.esc(a.reason || '—')],
        ['入队时刻', UI.esc(a.t || '—')],
        ['被抽对象', auTarget(a), true]
      ]);
    }
    return head + UI.kv([
      ['执行人', UI.esc(g.actor) + (g.auto ? ' ' + UI.badge('服务账号 · 自动', 'amber') : ''), true],
      ['时刻 · 动作', UI.esc(g.t) + ' · <b>' + UI.esc(g.label || (S.ACTIONS[g.action] || {}).label || g.action) + '</b>', true],
      ['动作摘要', UI.esc(g.sum || '—')],
      ['关键参数', UI.esc(UI.logParams(g) || '—')],
      ['记录号 · 版本组', '<span class="mono">' + UI.esc(g.rid) + ' · ' + UI.esc(g.snapshot) + '</span>', true],
      ['被抽对象', auTarget(a), true],
      ['拘审理由', UI.esc(a.reason || '—')]
    ]);
  }
  /* ---- R87 A8:抽审可操作(通过 / 打回带原因码)+ 顶部统计行 ---- */
  var M4 = { rc: {}, open: {} };   // rc = 每行打回原因码;open = 行内展开(页面局部态,不进 store)

  function statCell(k, v, tone) {
    return '<div style="min-width:88px">' +
      '<div class="tiny">' + UI.esc(k) + '</div>' +
      '<div class="oc-t1"' + (tone ? ' style="color:' + tone + '"' : '') + '>' + UI.esc(String(v)) + '</div></div>';
  }
  function statsRow() {
    var s = S.auditStats();
    return '<div class="card card-tight"><div class="row wrap" style="gap:18px;align-items:flex-start">' +
      statCell('抽审总数', s.total) +
      statCell('待抽审', s.pending, '#9a6b00') +
      statCell('已抽', s.done) +
      statCell('通过', s.pass, '#2e7d32') +
      statCell('打回', s.returned, '#c0392b') +
      statCell('抽审完成率', s.rate + '%') +
      '</div></div>';
  }
  function resultBadge(a) {
    if (a.status !== '已抽审') return UI.badge(a.status || '待抽审', 'amber');
    return UI.badge('已抽审 · ' + (a.result || ''), a.result === '通过' ? 'green' : 'red') +
      (a.code ? '<div class="tiny">原因「' + UI.esc(a.code) + '」</div>' : '') +
      '<div class="tiny">' + UI.esc(a.by || '') + ' · ' + UI.esc(a.ruledT || '') + '</div>';
  }
  function rowActions(a) {
    if (a.status === '已抽审') {
      return '<span class="tiny">' + (a.result === '打回' ? '原件已回队重看' : '原处置维持') + '</span>';
    }
    var code = M4.rc[a.id] || '';
    var codes = (S.dict().reasonCodes.spot_return || []);
    var pass = S.check('spot_pass', { auditId: a.id });
    var ret = code ? S.check('spot_return', { auditId: a.id, code: code }) : { ok: false, reason: '先选打回原因码' };
    var sel = '<select data-rc="' + UI.esc(a.id) + '" style="width:auto;max-width:190px">' +
      '<option value="">— 打回原因码 —</option>' +
      codes.map(function (x) {
        return '<option value="' + UI.esc(x) + '"' + (code === x ? ' selected' : '') + '>' + UI.esc(x) + '</option>';
      }).join('') + '</select>';
    return '<div class="act-row" style="gap:6px;align-items:center">' +
      '<button type="button" class="btn btn-sm btn-ok' + (pass.ok ? '' : ' is-off') + '"' + (pass.ok ? '' : ' disabled') +
      ' data-act="spot_pass" data-p="' + UI.attr({ auditId: a.id }) + '"' +
      ' title="' + UI.esc(pass.ok ? (S.ACTIONS.spot_pass.hint || '') : '未满足:' + pass.reason) + '">通过</button>' +
      sel +
      '<button type="button" class="btn btn-sm btn-danger' + (ret.ok ? '' : ' is-off') + '"' + (ret.ok ? '' : ' disabled') +
      ' data-act="spot_return" data-p="' + UI.attr({ auditId: a.id, code: code }) + '"' +
      ' title="' + UI.esc(ret.ok ? (S.ACTIONS.spot_return.hint || '') : '未满足:' + ret.reason) + '">打回</button>' +
      '</div>' +
      (pass.ok ? '' : '<div class="act-why">未满足:' + UI.esc(pass.reason) + '</div>');
  }
  function auditSection(au) {
    var rateNote = '<div class="card card-tight">' +
      UI.secTitle('抽审参数(全假设值,冷启动 × 2)', 'audit') +
      '<div class="small">记账道 ' + UI.assume('5%') + ' · 自动升格道 ' + UI.assume('10%') + ' · 机械驳回 ' + UI.assume('5%') +
      ' · 批量确认件 ' + UI.assume('15%') + ' · 复验通过件 ' + UI.assume('10%') + ' · 抽审时限 ' + UI.assume('48h') + '</div>' +
      '</div>';
    if (!au.length) {
      return '<h3>抽审队列</h3>' + statsRow() + rateNote + '<div class="tiny" style="margin-top:8px">暂无抽审件。</div>';
    }
    var rows = au.slice().reverse().map(function (a) {
      var on = !!M4.open[a.id];
      return '<tr class="' + (on ? 'is-sel' : '') + '">' +
        '<td><button type="button" class="btn btn-sm" data-auopen="' + UI.esc(a.id) + '"' +
        ' title="展开被抽动作的上下文">' + (on ? '▾' : '▸') + ' ' + UI.esc(a.id) + '</button></td>' +
        '<td>' + UI.badge(a.src, srcTone(a.src)) + '</td>' +
        '<td>' + auTarget(a) + '</td>' +
        '<td class="small">' + UI.esc(a.reason || '') + '</td>' +
        '<td>' + UI.esc(a.t) + '</td>' +
        '<td>' + resultBadge(a) + '</td>' +
        '<td style="min-width:300px">' + rowActions(a) + '</td>' +
        '</tr>' +
        (on ? '<tr class="row-open"><td colspan="7">' + auContext(a) + '</td></tr>' : '');
    }).join('');
    return '<h3>抽审队列(共 ' + au.length + ' 条)</h3>' + statsRow() + rateNote +
      '<div class="tiny" style="margin-top:8px">点抽审号展开「被抽动作上下文」;被抽对象可点,直达该对象详情。</div>' +
      '<div style="overflow-x:auto;margin-top:4px"><table class="tb"><thead><tr>' +
      '<th style="width:120px">抽审#</th><th>来源标</th><th>被抽对象</th><th>拘审理由</th><th>时间</th><th style="width:150px">结论</th><th>动作</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------------- ② 热线上报并入清单(施工图 §6 T10;设计档 §2.4 P1)---------------- */
  function reportCard(r) {
    var loc = r.facility ? UI.addr(r.facility) : (r.block ? (UI.esc(r.block) + ' · Al Ain') : '<span class="faint">—</span>');
    var ev = (r.evidence || []).map(function (e) {
      return UI.evidenceCard(e, e.from ? '并入自 ' + UI.esc(e.from) : '热线来电录入示意');
    }).join('');
    return '<div' + UI.cardAttrs('report', { cls: 'card card-tight' }) + '>' +
      '<div class="card-hd"><b class="oc-t1">' + UI.esc(r.id) + ' · ' + UI.esc(r.cat) + '</b>' +
      '<span class="row" style="gap:6px;align-items:center">' +
      (r.status === '已并入' ? UI.badge('已并入', 'blue') : UI.badge(r.status || '已受理', 'green')) +
      UI.cardTag('report', '热线上报') + '</span></div>' +
      '<div class="small muted">' + loc + ' · 联系:' + UI.esc(r.contact || '—') + ' · 回执 ' + UI.esc(r.receipt || '—') + '</div>' +
      (r.mergedInto
        ? '<div class="small" style="margin-top:4px">合并标:<a href="#/m1/clue/' + UI.esc(r.mergedInto) + '">→ 线索 ' + UI.esc(r.mergedInto) + '</a></div>'
        : '<div class="tiny" style="margin-top:4px">在人工甄别并入队列中</div>') +
      '<div class="tiny" style="margin-top:2px">重复来电计数:' + (r.urges || 0) + '</div>' +
      (r.status === '已驳回'
        ? '<div class="tiny" style="margin-top:4px">驳回理由(来电人可见):' + UI.esc(r.rejectReason || '') + '</div>'
        : '') +
      ((r.status !== '已并入' && r.status !== '已驳回')
        ? '<div style="margin-top:6px">' + ['拍摄不清无法定位', '非市政资产事项'].map(function (rs) {
            var chk = S.check('public_reject', { reportId: r.id, reason: rs });
            return '<button type="button" class="btn' + (chk.ok ? '' : ' is-off') + '"' + (chk.ok ? '' : ' disabled') +
              ' data-act="public_reject" data-p="' + UI.attr({ reportId: r.id, reason: rs }) + '">甄别驳回:' + UI.esc(rs) + '</button>';
          }).join(' ') +
          '<span class="tiny" style="margin-left:6px">(驳回理由来电人可见)</span></div>'
        : '') +
      (ev ? '<div class="sep"></div>' + UI.evInset('<div class="ev-grid">' + ev + '</div>') : '') +
      '</div>';
  }
  function publicSection(pr) {
    if (!pr.length) {
      return '<h3 style="margin-top:16px">热线上报并入清单</h3>' +
        '<div class="tiny" style="margin-top:8px">暂无热线上报(12345 市政热线接线员录入后进本清单甄别)。</div>';
    }
    return '<h3 style="margin-top:16px">热线上报并入清单(共 ' + pr.length + ' 条)</h3>' +
      '<div class="grid2" style="margin-top:8px">' + pr.map(reportCard).join('') + '</div>';
  }

  /* ============ 帮助浮层内容(R86 A4)============ */
  (window.HELP = window.HELP || {}).m4 = {
    title: '兜底与质量 · 本模块职责',
    body:
      '<p><b>这一页干什么:</b>两件兜底 —— ① 抽审队列:把「自动做掉的」与「人做过的」按比例捞回来复查;② 热线上报(12345 市政热线 · 接线员录入):人工甄别后并入线索,或按理由驳回(理由来电人可见)。</p>' +
      '<p><b>为什么要抽审:</b>机械自动化不豁免审计。免人工车道每条都留一条动作日志,按抽审率捞回复查;推翻结果回流规则包降版建议,同类错误率超阈值即自动关闭该类目的自动车道。</p>' +
      '<p><b>热线上报防滥用三件:</b>同点位去重合并 / 单来电号限频 / 重复无效上报降权。上报先入甄别队列,不直接进紧急处置队列;去重合并后作为既有线索的一次「观测」叠加证据,重复来电计数可见 —— 计数只作排序输入,提级由复核主管显名做。</p>' +
      '<p><b>与客户系统的关系:</b>热线工单与回执由本平台承载,处置仍走区市政工单系统;抽审结论只影响巡检侧定性与规则版本,不改客户处置记录。</p>' +
      '<p><b>数字口径:</b>各车道抽审率与抽审时限均为假设值,冷启动期按双倍执行,试点数据到位后标定。</p>'
  };

  /* R88 A5⑭:抽审行展开 —— 只改页面局部态并重绘(不产生状态变更) */
  function m4rerender() {
    var y = window.scrollY || window.pageYOffset || 0;
    try { window.dispatchEvent(new CustomEvent('render', { detail: { ui: 'm4' } })); }
    catch (err) { var ev = document.createEvent('Event'); ev.initEvent('render', false, false); window.dispatchEvent(ev); }
    try { window.scrollTo(0, y); } catch (e2) { /* noop */ }
  }
  document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el.getAttribute && !el.getAttribute('data-auopen')) el = el.parentNode;
    if (!el || !el.getAttribute) return;
    var id = el.getAttribute('data-auopen');
    if (!id) return;
    e.preventDefault();
    M4.open[id] = !M4.open[id];
    m4rerender();
  });

  /* 打回原因码下拉:只改页面局部态并重绘(状态变更仍只走 data-act → S.commit) */
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (!el || !el.getAttribute) return;
    var id = el.getAttribute('data-rc');
    if (!id) return;
    M4.rc[id] = el.value;
    var y = window.scrollY || window.pageYOffset || 0;
    try { window.dispatchEvent(new CustomEvent('render', { detail: { ui: 'm4' } })); }
    catch (err) { var ev = document.createEvent('Event'); ev.initEvent('render', false, false); window.dispatchEvent(ev); }
    try { window.scrollTo(0, y); } catch (e2) { /* noop */ }
  });

  /* ---------------- 出口 ---------------- */
  VIEWS.m4 = function () {
    var au = S.get().gov.auditQueue || [];
    var pr = S.get().publicReports || [];
    var head = '<div class="card card-tight"><div class="card-hd"><h3>4 · 兜底与质量</h3>' +
      '<span class="row" style="gap:8px;align-items:center"><span class="tiny">抽审队列 · 热线上报并入清单</span>' +
      UI.helpBtn('m4') + '</span></div></div>';
    return head + auditSection(au) + publicSection(pr);
  };
})();
