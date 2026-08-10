/* ===== 模块 m4 视图 · 兜底与质量 · 归属 W1-B 工兵(施工图 §7/§8 裁定②:模块拆独立文件,文件互斥) =====
   契约:VIEWS.m4 = function(ctx) 返回 HTML 字符串;ctx={module,rest[],hash}
   共享文件(tokens/store/data/ui/app.html)只读;按钮用 data-action 属性走 UI.bindActions→S.commit

   规格来源:
   - 施工图 §7 m4 清单:抽审队列(拘审标来源)/ 公众上报并入清单
   - 设计档 §2.5 机制⑧抽审参数(记账道5%/自动升格道10%/机械驳回5%/批量确认件15%/复验通过件10%,抽审时限48h,全假设值)
   - 设计档 §2.4 P1:公众上报防滥用三件(同点位去重合并/单设备限频/重复无效上报降权);先入并入队列人工甄别升格,不直接进应急
   - 施工图 §6 T10:公众上报同点位 → 去重合并进既有线索,证据叠加,催办计数可见

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
    if (src.indexOf('紧急直派') >= 0 || src.indexOf('批量') >= 0 || src.indexOf('降级') >= 0 || src.indexOf('自动升格') >= 0) return 'amber';
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
  function auditSection(au) {
    var rateNote = '<div class="card card-tight">' +
      '<div class="sec-title">抽审参数(全假设值,冷启动 × 2)</div>' +
      '<div class="small">记账道 ' + UI.assume('5%') + ' · 自动升格道 ' + UI.assume('10%') + ' · 机械驳回 ' + UI.assume('5%') +
      ' · 批量确认件 ' + UI.assume('15%') + ' · 复验通过件 ' + UI.assume('10%') + ' · 抽审时限 ' + UI.assume('48h') + '</div>' +
      '<div class="tiny" style="margin-top:4px">抽审推翻的自动动作:规则包降版建议;同类错误率超阈值 → 该类目自动车道自动关闭(执行=上级主管部门类目紧急直派开关)。</div>' +
      '</div>';
    if (!au.length) {
      return '<h3>抽审队列</h3>' + rateNote + '<div class="tiny" style="margin-top:8px">暂无抽审件。</div>';
    }
    var rows = au.slice().reverse().map(function (a) {
      return '<tr>' +
        '<td>' + UI.esc(a.id) + '</td>' +
        '<td>' + UI.badge(a.src, srcTone(a.src)) + '</td>' +
        '<td>' + auLabel(a.clueId) + '</td>' +
        '<td class="small">' + UI.esc(a.reason || '') + '</td>' +
        '<td>' + UI.esc(a.t) + '</td>' +
        '<td>' + UI.badge(a.status || '待抽审', 'amber') + '</td>' +
        '</tr>';
    }).join('');
    return '<h3>抽审队列(共 ' + au.length + ' 条)</h3>' + rateNote +
      '<div style="overflow-x:auto;margin-top:8px"><table class="tb"><thead><tr>' +
      '<th>抽审#</th><th>来源标</th><th>关联对象</th><th>拘审理由</th><th>时间</th><th>状态</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------------- ② 公众上报并入清单(施工图 §6 T10;设计档 §2.4 P1)---------------- */
  function reportCard(r) {
    var loc = r.facility ? UI.addr(r.facility) : (r.block ? (UI.esc(r.block) + ' · Al Ain') : '<span class="faint">—</span>');
    var ev = (r.evidence || []).map(function (e) {
      return UI.evidenceCard(e, e.from ? '并入自 ' + UI.esc(e.from) : '公众提交示意');
    }).join('');
    return '<div class="card card-tight">' +
      '<div class="card-hd"><b>' + UI.esc(r.id) + ' · ' + UI.esc(r.cat) + '</b>' +
      (r.status === '已并入' ? UI.badge('已并入', 'blue') : UI.badge(r.status || '已受理', 'green')) +
      '</div>' +
      '<div class="small muted">' + loc + ' · 联系:' + UI.esc(r.contact || '—') + ' · 回执 ' + UI.esc(r.receipt || '—') + '</div>' +
      (r.mergedInto
        ? '<div class="small" style="margin-top:4px">合并标:<a href="#/m1/clue/' + UI.esc(r.mergedInto) + '">→ 线索 ' + UI.esc(r.mergedInto) + '</a>(去重合并,证据叠加)</div>'
        : '<div class="tiny" style="margin-top:4px">进人工甄别并入队列,未直接进应急</div>') +
      '<div class="tiny" style="margin-top:2px">催办计数:' + (r.urges || 0) + '</div>' +
      (r.status === '已驳回'
        ? '<div class="tiny" style="margin-top:4px">驳回理由(上报人可见):' + UI.esc(r.rejectReason || '') + '</div>'
        : '') +
      ((r.status !== '已并入' && r.status !== '已驳回')
        ? '<div style="margin-top:6px">' + ['拍摄不清无法定位', '非市政资产事项'].map(function (rs) {
            var chk = S.check('public_reject', { reportId: r.id, reason: rs });
            return '<button type="button" class="btn' + (chk.ok ? '' : ' is-off') + '"' + (chk.ok ? '' : ' disabled') +
              ' data-act="public_reject" data-p="' + UI.attr({ reportId: r.id, reason: rs }) + '">甄别驳回:' + UI.esc(rs) + '</button>';
          }).join(' ') +
          '<span class="tiny" style="margin-left:6px">(甄别无效即驳回,理由上报人可见)</span></div>'
        : '') +
      (ev ? '<div class="sep"></div><div class="ev-grid">' + ev + '</div>' : '') +
      '</div>';
  }
  function publicSection(pr) {
    var note = '<div class="card card-tight">' +
      '<div class="small">防滥用三件:同点位去重合并 / 单设备限频 / 重复无效上报降权;上报先入本清单人工甄别升格,不直接进应急。</div>' +
      '</div>';
    if (!pr.length) {
      return '<h3 style="margin-top:16px">公众上报并入清单</h3>' + note +
        '<div class="tiny" style="margin-top:8px">暂无公众上报。</div>';
    }
    return '<h3 style="margin-top:16px">公众上报并入清单(共 ' + pr.length + ' 条)</h3>' + note +
      '<div class="grid2" style="margin-top:8px">' + pr.map(reportCard).join('') + '</div>';
  }

  /* ---------------- 出口 ---------------- */
  VIEWS.m4 = function () {
    var au = S.get().gov.auditQueue || [];
    var pr = S.get().publicReports || [];
    return auditSection(au) + publicSection(pr);
  };
})();
