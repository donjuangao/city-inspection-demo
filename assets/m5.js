/* ===== 模块 m5 视图 · 归属 W1-D 工兵(施工图 §7/§8 裁定②:模块拆独立文件,文件互斥) =====
   契约:VIEWS.m5 = function(ctx) 返回 HTML 字符串;ctx={module,rest[],hash}
   共享文件(tokens/store/data/ui/app.html)只读;按钮用 data-action 属性走 UI.bindActions→S.commit

   规格来源:
   - 施工图 §7 m5:健康总览卡(数字=前面动作的下游,联动 store)+ 覆盖热区示意 SVG
   - 设计档 §2.4:「设施状态总览 v1(M8 提级:管理者三问=哪片最差/趋势如何/覆盖哪里有洞;含覆盖热区图 HW-17)」
   - 设计档 §0.7:5 统计总览 —— 健康总览 v1=M4-6 · 覆盖率=M10-12
   铁律:本页零独立数据源,全部数字现算自 S.get()/S.dict(),不新增 mock 字段。 */
(function (w) {
  'use strict';

  function count(arr, fn) { return arr.filter(fn).length; }

  function statTile(num, label, note) {
    return '<div class="card-tight" style="background:#fff;border:1px solid var(--line);border-radius:var(--radius)">' +
      '<div style="font-size:24px;font-weight:700;color:var(--ink-hi);font-variant-numeric:tabular-nums">' + UI.esc(num) + '</div>' +
      '<div class="tiny" style="margin-top:2px">' + UI.esc(label) + '</div>' +
      (note ? '<div class="tiny" style="color:var(--faint);margin-top:2px">' + UI.esc(note) + '</div>' : '') +
      '</div>';
  }

  /* 管理者三问 · ① 哪片最差:按街区聚合在办线索 + 在办工单 */
  function worstBlocks() {
    var st = w.S.get(), byBlock = {};
    st.clues.filter(function (c) { return c.status === 'open'; }).forEach(function (c) {
      var f = w.S.find.facility(c.facility), b = (f && f.block) || c.block || '未知';
      byBlock[b] = (byBlock[b] || 0) + 1;
    });
    st.tickets.filter(function (t) { return t.state !== '已验收' && t.state !== '已合并'; }).forEach(function (t) {
      var f = w.S.find.facility(t.facility), b = f && f.block;
      if (b) byBlock[b] = (byBlock[b] || 0) + 1;
    });
    return Object.keys(byBlock).map(function (b) { return { b: b, n: byBlock[b] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 5);
  }

  /* 管理者三问 · ③ 覆盖哪里有洞:零绑定传感器/相机的设施 */
  function coverageGaps() {
    return w.S.get().facilities.filter(function (f) { return !f.sensors || !f.sensors.length; });
  }

  function q1Worst() {
    var worst = worstBlocks(), maxN = worst.length ? worst[0].n : 1;
    var body = worst.length
      ? worst.map(function (o) {
        var pct = Math.max(6, Math.round(o.n / maxN * 100));
        return '<div style="margin:7px 0">' +
          '<div style="display:flex;justify-content:space-between;font-size:var(--fs-sm)">' +
          '<span>' + UI.esc(o.b) + '</span><span class="faint">' + o.n + ' 件在办</span></div>' +
          '<div style="height:6px;background:var(--line);border-radius:4px;overflow:hidden;margin-top:2px">' +
          '<div style="height:100%;width:' + pct + '%;background:var(--red)"></div></div></div>';
      }).join('')
      : '<div class="tiny">当前无在办线索/工单,暂无片区排名。</div>';
    return '<div class="card"><div class="sec-title">管理者三问 · ① 哪片最差</div>' + body +
      '<div class="tiny" style="margin-top:6px">按街区聚合「待核查线索 + 未验收工单」计数(实算,非独立编造)。</div></div>';
  }

  function q2Trend() {
    var st = w.S.get(), log = st.actionLog;
    var nConfirm = count(log, function (g) { return g.action === 'confirm'; });
    var nReject = count(log, function (g) { return g.action === 'reject'; });
    var nAuto = count(log, function (g) { return !!g.auto; });
    var rows = UI.kv([
      ['剧情进度', st.stepIdx + ' / 12 步(演示时刻 ' + st.now + ')'],
      ['累计动作日志', log.length + ' 条'],
      ['人工确认', nConfirm + ' 次'],
      ['人工驳回', nReject + ' 次'],
      ['规则引擎自动步', nAuto + ' 次']
    ]);
    return '<div class="card"><div class="sec-title">管理者三问 · ② 趋势如何</div>' + rows +
      '<div class="tiny" style="margin-top:6px">趋势口径 = 动作日志累计(时间线唯一数据源);随「▶ 推进剧情」逐步增长。</div></div>';
  }

  function q3Gaps() {
    var gaps = coverageGaps();
    var body = gaps.length
      ? '<div class="tiny" style="margin-bottom:6px">' + gaps.length + ' 处设施无绑定传感器/相机 —— 覆盖缺口:AI 无产出时,无法区分「模型漏报」与「覆盖缺失」(设计档 §4③)。</div>' +
      '<div class="row wrap" style="gap:6px">' + gaps.map(function (f) {
        return '<a class="badge badge-amber" href="#/m3/facility/' + f.id + '">' + UI.esc(f.id) + ' · ' + UI.esc(f.block) + '</a>';
      }).join('') + '</div>'
      : '<div class="tiny">当前演示数据下全部设施均有观测覆盖。</div>';
    return '<div class="card"><div class="sec-title">管理者三问 · ③ 覆盖哪里有洞</div>' + body +
      '<div class="tiny" style="margin-top:6px">点开徽标 → 台账(模块 3)详情核实观测覆盖窗。</div></div>';
  }

  function heatMap() {
    return '<div class="card"><div class="sec-title">覆盖热区示意(HW-17)</div>' +
      '<div style="max-width:360px">' + UI.evidenceSvg('heat') + '</div>' +
      '<div class="tiny" style="margin-top:4px">示意用色深浅代表观测覆盖密度;非真实地理热力图,正式版由传感器在线率 + 移动网轨迹密度生成。</div></div>';
  }

  VIEWS.m5 = function (ctx) {
    var st = w.S.get(), TS = w.S.dict().ticketSources;
    var alertsOn = count(st.alerts, function (a) { return a.status === '成立'; });
    var ticketsOpen = count(st.tickets, function (t) { return t.state !== '已验收' && t.state !== '已合并'; });
    var closed = count(st.tickets, function (t) { return t.state === '已验收'; });
    var fastlane = count(st.tickets, function (t) { return t.source === TS.auto; });

    var head = '<div class="card">' +
      '<div class="card-hd"><h3>5 · 统计总览</h3><span class="tiny">健康总览卡:数字实算自 S.get()——都是前面动作的下游</span></div>' +
      '<div class="grid4">' +
      statTile(alertsOn + ' / ' + st.alerts.length, '告警数(成立 / 总数)', '来自「确认」动作产出') +
      statTile(String(ticketsOpen), '在办工单数', '来自派单三来源(①②③)') +
      statTile(String(closed), '闭环数(已验收)', '来自「复验人裁·合格」动作') +
      statTile(String(fastlane), '快车道件数', '来自「自动派单」动作(来源①)') +
      '</div></div>';

    return head + '<div class="grid3">' + q1Worst() + q2Trend() + q3Gaps() + '</div>' + heatMap();
  };
})(window);
