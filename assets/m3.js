/* ===== 模块 m3 视图 · 归属 W1-D 工兵(施工图 §7/§8 裁定②:模块拆独立文件,文件互斥) =====
   契约:VIEWS.m3 = function(ctx) 返回 HTML 字符串;ctx={module,rest[],hash}
   共享文件(tokens/store/data/ui/app.html)只读;按钮用 data-action 属性走 UI.bindActions→S.commit

   规格来源:
   - 施工图 §7 m3 台账:设施列表(筛选按线)+详情(点位历史/证据链回查/劣化曲线SVG[路面]/观测覆盖窗行/Onwani双语字段位)
   - 设计档 §0.7 模块3清单:资产库+归属 P0 · 点位历史与证据链回查 P0 · 劣化曲线(路面线)P1 · 观测覆盖窗 P1
   - 设计档 §3 mock规则:地址口径=设施编号+街区名+Al Ain(街道字段不出现);Onwani 五要素双语字段位,空值不渲染
   - 设计档 §4③:资产族「数据源点位」参数增观测覆盖窗记录——支撑漏报回查时区分「模型漏报」与「覆盖缺失」
   路由:#/m3(全部)· #/m3/line/<线名>(筛选)· #/m3/facility/<设施#>(详情) */
(function (w) {
  'use strict';

  var LINES = ['井盖', '路面', '管网'];

  function allFac() { return w.S.get().facilities; }
  function facByLine(line) {
    return line ? allFac().filter(function (f) { return f.line === line; }) : allFac();
  }
  function sensorsOf(f) {
    return (f.sensors || []).map(function (id) { return w.S.find.sensor(id); }).filter(Boolean);
  }
  function cluesOf(facId) {
    return w.S.get().clues.filter(function (c) { return c.facility === facId; });
  }

  /* 设施 id 派生一个稳定种子(演示用确定性伪随机,非真实检测数据) */
  function seedFromId(id) {
    var h = 0;
    for (var i = 0; i < id.length; i++) { h = (h * 31 + id.charCodeAt(i)) >>> 0; }
    return h;
  }
  /* 路面结构状况指数示意曲线(6 期回顾;数值越低越需养护)—— 演示示意,非实测传感读数 */
  function degradeCurve(id) {
    var seed = seedFromId(id), v = 90 + (seed % 8), pts = [];
    for (var i = 0; i < 6; i++) {
      var drop = 2 + ((seed >> (i * 3)) % 6);
      v = Math.max(35, v - drop);
      pts.push({ x: i, y: v });
    }
    return pts;
  }

  /* ---------------- 列表 ---------------- */
  function renderList(line) {
    var list = facByLine(line);
    var tabs = '<div class="tabs">' +
      '<a href="#/m3" class="' + (!line ? 'is-on' : '') + '">全部 ' + allFac().length + '</a>' +
      LINES.map(function (l) {
        return '<a href="#/m3/line/' + encodeURIComponent(l) + '" class="' + (line === l ? 'is-on' : '') + '">' + UI.esc(l) + ' ' + facByLine(l).length + '</a>';
      }).join('') + '</div>';

    var rows = list.map(function (f) {
      var sn = sensorsOf(f);
      var cov = sn.length ? (sn.length + ' 个') : '<span style="color:var(--red)">0 · 覆盖缺口</span>';
      var n = cluesOf(f.id).length;
      return '<tr>' +
        '<td><a href="#/m3/facility/' + f.id + '">' + UI.esc(f.id) + '</a></td>' +
        '<td>' + UI.esc(f.kind) + '</td>' +
        '<td>' + UI.esc(f.line) + '线</td>' +
        '<td>' + UI.addr(f.id) + (f.landmark ? ' <span class="tiny">(' + UI.esc(f.landmark) + ')</span>' : '') + '</td>' +
        '<td class="tiny">' + UI.esc(f.owner) + '</td>' +
        '<td>' + cov + '</td>' +
        '<td>' + (n ? (n + ' 条') : '<span class="tiny faint">—</span>') + '</td>' +
        '<td><a href="#/m3/facility/' + f.id + '">详情 →</a></td>' +
        '</tr>';
    }).join('');

    return '<div class="card">' +
      '<div class="card-hd"><h3>3 · 设施台账</h3><span class="tiny">资产库 + 归属 · 共 ' + allFac().length + ' 条 · 筛选按业务线</span></div>' +
      tabs +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th>设施#</th><th>类型</th><th>业务线</th><th>地址</th><th>归属</th><th>观测覆盖</th><th>关联线索</th><th></th>' +
      '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="tiny">该业务线暂无设施</td></tr>') + '</tbody></table></div>' +
      '</div>';
  }

  /* ---------------- 详情 ---------------- */
  function renderDetail(id) {
    var f = w.S.find.facility(id);
    if (!f) {
      return UI.banner('danger', '设施不存在:' + UI.esc(id)) +
        '<div class="tiny" style="margin-top:8px"><a href="#/m3">← 返回台账列表</a></div>';
    }
    var sn = sensorsOf(f), clues = cluesOf(f.id), onwani = f.onwani || {};

    var head = '<div class="tiny" style="margin-bottom:8px"><a href="#/m3">← 返回台账列表</a>' +
      (f.line ? ' · <a href="#/m3/line/' + f.line + '">同线其余设施</a>' : '') + '</div>' +
      '<div class="objcard">' +
      '<div class="objcard-id">设施# ' + UI.esc(f.id) +
      ' <span class="badge badge-grey">' + UI.esc(f.kind) + '</span>' +
      ' <span class="badge badge-grey">' + UI.esc(f.line) + '线</span></div>' +
      '<div class="objcard-l2">地址:' + UI.addr(f.id) +
      (f.landmark ? ' <span class="faint">(' + UI.esc(f.landmark) + ')</span>' : '') + '</div>' +
      '<div class="objcard-l3">归属:' + UI.esc(f.owner) + '</div>' +
      '</div>';

    /* Onwani 双语字段位:空值不渲染(设计档 §3) */
    var onwaniRows = UI.kv([
      ['街区(EN)', onwani.blockEn],
      ['街区(AR)', onwani.blockAr],
      ['街道 Street', onwani.street],
      ['分区 Zone', onwani.zone],
      ['楼栋 Bldg', onwani.bldg]
    ]);
    var onwaniBlock = '<div class="card"><div class="sec-title">ONWANI 双语字段位(空值不渲染)</div>' +
      onwaniRows + '<div class="tiny" style="margin-top:6px">市政台账以设施编号定位,街道字段不出现在界面;此处仅留字段位,待 Onwani 五要素补全。</div></div>';

    /* 观测覆盖窗行(设计档 §4③:区分模型漏报与覆盖缺失) */
    var covBlock;
    if (sn.length) {
      covBlock = '<table class="tb"><thead><tr><th>传感器/相机</th><th>类型</th><th>健康</th><th>观测覆盖窗</th></tr></thead><tbody>' +
        sn.map(function (s) {
          var ok = s.health === '正常';
          return '<tr><td>' + UI.esc(s.id) + '</td><td>' + UI.esc(s.type) + '</td>' +
            '<td>' + UI.badge(s.health, ok ? 'green' : 'red') + '</td>' +
            '<td class="tiny">' + UI.esc(s.window || '—') + '</td></tr>';
        }).join('') + '</tbody></table>';
    } else {
      covBlock = UI.banner('warn', '本设施暂无绑定传感器/相机 —— 观测覆盖缺口:AI 无产出时,无法区分是「模型漏报」还是「覆盖缺失」。');
    }
    var covPanel = '<div class="card"><div class="sec-title">观测覆盖窗</div>' + covBlock + '</div>';

    /* 劣化曲线(仅路面线设施) */
    var curvePanel = '';
    if (f.line === '路面') {
      var pts = degradeCurve(f.id), last = pts[pts.length - 1].y, risky = last < 60;
      curvePanel = '<div class="card"><div class="sec-title">劣化曲线(路面线)</div>' +
        '<div style="max-width:320px">' + UI.lineChart(pts, { label: '路面结构状况指数示意 · 6 期回顾', color: risky ? '#c0392b' : '#1a5fb4' }) + '</div>' +
        '<div style="margin-top:4px">现值 ' + UI.badge(String(last), risky ? 'red' : 'blue') +
        (risky ? '<span class="tiny" style="margin-left:6px">已进入低值区间,建议纳入下一周期养护批量</span>' : '') + '</div>' +
        '<div class="tiny" style="margin-top:6px">' +
        UI.assume('示意曲线,非实测传感读数', '简化生成曲线,非真实检测数据;正式版由记账车道持续写入台账') +
        ' —— 免人工「记账」车道自动记入,升级自动触发复报。</div></div>';
    }

    /* 点位历史 */
    var histBlock = (f.history && f.history.length)
      ? '<ul style="list-style:none;margin:0;padding:0">' + f.history.map(function (h) {
        return '<li style="padding:5px 0;border-bottom:1px solid var(--line);font-size:var(--fs-sm)">' +
          '<span class="faint mono">' + UI.esc(h.t) + '</span> ' + UI.esc(h.txt) + '</li>';
      }).join('') + '</ul>'
      : '<div class="tiny">暂无点位历史记录</div>';
    var histPanel = '<div class="card"><div class="sec-title">点位历史</div>' + histBlock + '</div>';

    /* 证据链回查:链接到 m1 详情(施工图 §3 路由契约 #/m1/clue/<id>) */
    var clueBlock = clues.length
      ? '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>线索#</th><th>异常</th><th>级别</th><th>状态</th><th>时间</th><th></th></tr></thead><tbody>' +
        clues.map(function (c) {
          return '<tr><td>' + UI.esc(c.id) + '</td><td>' + UI.esc(c.kindText || '—') + '</td>' +
            '<td>' + UI.levelBadge(c.level) + '</td><td>' + UI.statusBadge(c.status) + '</td>' +
            '<td class="tiny">' + UI.esc(c.t) + '</td>' +
            '<td><a href="#/m1/clue/' + c.id + '">证据链回查 →</a></td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="tiny">本设施暂无线索记录(证据链回查为空)</div>';
    var cluePanel = '<div class="card"><div class="sec-title">证据链回查 · 链接到复核工作台(模块 1)详情</div>' + clueBlock + '</div>';

    return head +
      '<div class="grid2">' + onwaniBlock + covPanel + '</div>' +
      curvePanel + histPanel + cluePanel;
  }

  /* location.hash 对非 ASCII 片段(线名为中文)做 URL 序列化时会被浏览器自动 percent-encode
     (地址栏显示与 location.hash 实际取值不同源,§9 判据要求筛选真实可点,不能只在半数浏览器下工作)——
     读路由参数一律先尝试 decodeURIComponent,读不动(已是原文/格式非法)则原样使用,双向兼容。 */
  function dec(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  VIEWS.m3 = function (ctx) {
    var rest = (ctx.rest || []).map(dec);
    if (rest[0] === 'facility' && rest[1]) return renderDetail(rest[1]);
    if (rest[0] === 'line' && rest[1]) return renderList(rest[1]);
    return renderList(null);
  };
})(window);
