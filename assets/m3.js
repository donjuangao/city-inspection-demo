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

  /* ================= R86 A8 · 地图看板 =================
     底图 = data.js window.MAPBASE(风格化街区,零真实地理数据,零外链);设施/传感器按 xy(0-1000)落点。
     状态色实时算自 state:告警红 > 活跃线索橙 > 维修蓝 > 正常灰。图层四类可叠加,点击跳 S.route。 */
  var MAP = { layers: { mh: true, rd: true, pl: true, sn: true } };
  var LAYER_DEFS = [
    { key: 'mh', label: '井盖 / 排水', line: '井盖', color: '#c2410c' },
    { key: 'rd', label: '路面', line: '路面', color: '#1a5fb4' },
    { key: 'pl', label: '灌溉管网', line: '管网', color: '#0e7490' },
    { key: 'sn', label: '传感器 / 相机', line: null, color: '#5b6b7c' }
  ];
  var ST_COLOR = { alert: '#c0392b', clue: '#e08b1e', fix: '#1a5fb4', ok: '#5b6b7c' };
  var ST_TEXT = { alert: '告警', clue: '活跃线索', fix: '维修在办', ok: '正常' };

  /* 设施实时状态:告警 > 活跃线索 > 维修在办 > 正常 */
  function facStatus(f) {
    var st = w.S.get();
    if (st.alerts.some(function (a) { return a.facility === f.id && a.status === '成立'; })) return 'alert';
    if (st.clues.some(function (c) { return c.facility === f.id && c.status === 'open'; })) return 'clue';
    if (st.tickets.some(function (t) { return t.facility === f.id && t.state !== '已验收' && t.state !== '已合并'; })) return 'fix';
    return 'ok';
  }
  function senStatus(s) {
    if (s.health !== '正常') return 'alert';
    var f = w.S.find.facility(s.facility);
    return f ? facStatus(f) : 'ok';
  }
  function hashOf(id) { var h = 0; for (var i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0; return h; }
  function node(href, title, shape) {
    return '<a href="' + UI.esc(href || '#/m3') + '" class="map-node"><title>' + UI.esc(title) + '</title>' + shape + '</a>';
  }
  function route(f) { return (w.S.route && w.S.route('facility', f.id)) || ('#/m3/facility/' + f.id); }
  function facTitle(f, st) {
    return f.id + ' · ' + f.kind + ' · ' + f.block + ' · ' + ST_TEXT[st] + '(点击进设施详情)';
  }

  function mapBase() {
    var B = w.MAPBASE || { roads: [], blocks: [], water: [], landmarks: [] };
    var s = '<rect x="0" y="0" width="1000" height="940" fill="#fbfcf8"></rect>';
    /* 街区淡填充 + 名 */
    s += B.blocks.map(function (b) {
      return '<g><rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" rx="6" ' +
        'fill="#f0f2ec" stroke="#e6e9e1"></rect>' +
        '<text x="' + (b.x + 8) + '" y="' + (b.y + 20) + '" font-size="14" fill="#a9b2a5" font-family="sans-serif">' +
        UI.esc(b.name) + '</text></g>';
    }).join('');
    /* 水系:旱谷折线 / 水面 */
    s += (B.water || []).map(function (wt) {
      if (wt.kind === 'lake') {
        return '<ellipse cx="' + (wt.x + wt.w / 2) + '" cy="' + (wt.y + wt.h / 2) + '" rx="' + (wt.w / 2) + '" ry="' + (wt.h / 2) +
          '" fill="#d6e9ef" stroke="#b7d6df"><title>' + UI.esc(wt.name || '水面') + '</title></ellipse>';
      }
      return '<polyline points="' + wt.pts.map(function (p) { return p[0] + ',' + p[1]; }).join(' ') +
        '" fill="none" stroke="#cfe4ea" stroke-width="9" stroke-linecap="round"><title>' + UI.esc(wt.name || '水系') + '</title></polyline>';
    }).join('');
    /* 路网:主干粗 / 支路细 / 放射环路中等 */
    var WID = { main: 10, sub: 4.5, ring: 7 }, COL = { main: '#dcded4', sub: '#e6e8de', ring: '#e3ddca' };
    s += B.roads.map(function (r) {
      return '<line x1="' + r.x1 + '" y1="' + r.y1 + '" x2="' + r.x2 + '" y2="' + r.y2 +
        '" stroke="' + (COL[r.cls] || '#ebece5') + '" stroke-width="' + (WID[r.cls] || 4) + '" stroke-linecap="round">' +
        (r.name ? '<title>' + UI.esc(r.name) + '</title>' : '') + '</line>';
    }).join('');
    /* 地标 */
    s += (B.landmarks || []).map(function (l) {
      return '<g><circle cx="' + l.xy[0] + '" cy="' + l.xy[1] + '" r="3.5" fill="#b6bdaf"></circle>' +
        '<text x="' + (l.xy[0] + 7) + '" y="' + (l.xy[1] + 4) + '" font-size="11.5" fill="#9aa295" font-family="sans-serif">' +
        UI.esc(l.name) + '</text></g>';
    }).join('');
    return s;
  }

  /* 管网计量区块(DMA):按传感器 dma 分组取所属设施包围盒 */
  function dmaBlocks() {
    var st = w.S.get(), groups = {};
    st.sensors.forEach(function (s) {
      if (!s.dma) return;
      var f = w.S.find.facility(s.facility);
      if (!f || !f.xy) return;
      (groups[s.dma] = groups[s.dma] || []).push(f.xy);
    });
    return Object.keys(groups).map(function (k) {
      var pts = groups[k], pad = 46;
      var xs = pts.map(function (p) { return p[0]; }), ys = pts.map(function (p) { return p[1]; });
      var x = Math.min.apply(null, xs) - pad, y = Math.min.apply(null, ys) - pad;
      var wd = Math.max.apply(null, xs) - Math.min.apply(null, xs) + pad * 2;
      var ht = Math.max.apply(null, ys) - Math.min.apply(null, ys) + pad * 2;
      return '<g><rect x="' + x + '" y="' + y + '" width="' + wd + '" height="' + ht + '" rx="8" fill="#0e749010" ' +
        'stroke="#0e7490" stroke-width="1.4" stroke-dasharray="7 5"></rect>' +
        '<text x="' + (x + 6) + '" y="' + (y - 5) + '" font-size="12" fill="#0e7490" font-family="sans-serif">计量区块 ' +
        UI.esc(k) + '</text></g>';
    }).join('');
  }

  function layerShapes(key) {
    var st = w.S.get(), out = '';
    if (key === 'sn') {
      return st.sensors.map(function (s) {
        var c = ST_COLOR[senStatus(s)], x = s.xy[0], y = s.xy[1];
        var f = w.S.find.facility(s.facility);
        return node(f ? route(f) : '#/m3',
          s.id + ' · ' + s.type + ' · 自检 ' + s.health + (s.dma ? ' · ' + s.dma : '') + '(点击进所属设施)',
          '<rect x="' + (x - 5.4) + '" y="' + (y - 5.4) + '" width="10.8" height="10.8" fill="#fff" stroke="' + c +
          '" stroke-width="2" transform="rotate(45 ' + x + ' ' + y + ')"></rect>');
      }).join('');
    }
    var def = LAYER_DEFS.filter(function (l) { return l.key === key; })[0];
    var list = st.facilities.filter(function (f) { return f.line === def.line; });
    if (key === 'pl') out += dmaBlocks();
    out += list.map(function (f) {
      var s = facStatus(f), c = ST_COLOR[s], x = f.xy[0], y = f.xy[1], shape;
      if (key === 'mh') {
        /* 井盖 / 雨水口 = 圆点(雨水口加箅面横纹) */
        shape = '<circle cx="' + x + '" cy="' + y + '" r="8.5" fill="' + c + '" fill-opacity="' + (s === 'ok' ? '.5' : '.92') +
          '" stroke="#ffffff" stroke-width="1.6"></circle>' +
          (f.kind === '雨水口' ? '<path d="M' + (x - 4) + ' ' + y + ' h8" stroke="#fff" stroke-width="1.4"></path>' : '');
      } else if (key === 'rd') {
        /* 路面 = 路段短线(取 id 哈希定横竖,贴合所在路网走向) */
        var vert = hashOf(f.id) % 2 === 1, L = 24;
        shape = '<line x1="' + (vert ? x : x - L) + '" y1="' + (vert ? y - L : y) + '" x2="' + (vert ? x : x + L) + '" y2="' + (vert ? y + L : y) +
          '" stroke="' + c + '" stroke-opacity="' + (s === 'ok' ? '.55' : '.95') + '" stroke-width="8" stroke-linecap="round"></line>';
      } else {
        /* 管网 = 虚线折线(管段)/ 菱形阀门 / 方块泵站 */
        if (f.kind === '阀门') {
          shape = '<rect x="' + (x - 6) + '" y="' + (y - 6) + '" width="12" height="12" fill="#fff" stroke="' + c +
            '" stroke-width="2.4" transform="rotate(45 ' + x + ' ' + y + ')"></rect>';
        } else if (f.kind === '泵站') {
          shape = '<rect x="' + (x - 7) + '" y="' + (y - 7) + '" width="14" height="14" rx="2" fill="' + c +
            '" fill-opacity="' + (s === 'ok' ? '.5' : '.92') + '" stroke="#fff" stroke-width="1.6"></rect>';
        } else {
          shape = '<polyline points="' + (x - 34) + ',' + (y + 12) + ' ' + x + ',' + y + ' ' + (x + 34) + ',' + (y - 10) +
            '" fill="none" stroke="' + c + '" stroke-opacity="' + (s === 'ok' ? '.6' : '.95') +
            '" stroke-width="4" stroke-dasharray="9 5" stroke-linecap="round"></polyline>';
        }
      }
      return node(route(f), facTitle(f, s), shape);
    }).join('');
    return out;
  }

  function renderMap() {
    var st = w.S.get();
    var body = mapBase();
    LAYER_DEFS.forEach(function (l) { if (MAP.layers[l.key]) body += layerShapes(l.key); });

    var toggles = LAYER_DEFS.map(function (l) {
      var n = l.line ? st.facilities.filter(function (f) { return f.line === l.line; }).length : st.sensors.length;
      return '<button type="button" class="map-layer' + (MAP.layers[l.key] ? ' is-on' : '') + '" ' +
        'data-layer="' + l.key + '" style="--cat:' + l.color + '">' + UI.esc(l.label) + ' ' + n + '</button>';
    }).join('');

    var counts = { alert: 0, clue: 0, fix: 0, ok: 0 };
    st.facilities.forEach(function (f) { counts[facStatus(f)]++; });
    var legend = Object.keys(ST_TEXT).map(function (k) {
      return '<div class="map-lg"><i style="background:' + ST_COLOR[k] + ';opacity:' + (k === 'ok' ? '.5' : '1') + '"></i>' +
        UI.esc(ST_TEXT[k]) + ' <span class="faint">· ' + counts[k] + ' 处</span></div>';
    }).join('');
    var shapes = '<div class="map-lg"><span class="faint">井盖 = 圆点 · 路面 = 路段短线 · 管网 = 虚线管段 / 菱形阀门 / 方块泵站 · 传感器 = 小菱形</span></div>';

    return '<div class="card">' +
      '<div class="card-hd"><h3>设施地图看板</h3>' +
      '<span class="row" style="gap:8px;align-items:center"><span class="tiny">点位状态实时算自线索 / 告警 / 工单</span>' +
      UI.helpBtn('m3') + '</span></div>' +
      '<div class="map-layers">' + toggles + '</div>' +
      '<div class="map-wrap">' +
      '<div class="map-svg"><svg viewBox="0 0 1000 940" role="img" aria-label="Al Ain 区设施分布风格化示意图">' + body + '</svg></div>' +
      '<div class="map-side">' + UI.secTitle('状态图例', 'facility') + legend +
      '<div class="sep"></div>' + UI.secTitle('图形约定', 'facility') + shapes +
      '<div class="sep"></div>' +
      '<div class="oc-t3">底图为风格化街区示意(路网 / 街区 / 水系 / 地标),' +
      UI.assume('非真实地理数据', '演示底图与坐标为风格化示意,不含真实测绘数据;正式版接客户 GIS 底图与设施坐标') +
      ';点击任一点位进设施详情。</div>' +
      '</div></div></div>';
  }

  /* 图层开关(只改本模块 UI 态,不碰 store) */
  w.document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el.getAttribute && !el.getAttribute('data-layer')) el = el.parentNode;
    if (!el || !el.getAttribute) return;
    var k = el.getAttribute('data-layer');
    if (!k || !MAP.layers.hasOwnProperty(k)) return;
    MAP.layers[k] = !MAP.layers[k];
    var y = w.scrollY || 0;
    try { w.dispatchEvent(new CustomEvent('render', { detail: { ui: 'm3' } })); }
    catch (err) { var ev = w.document.createEvent('Event'); ev.initEvent('render', false, false); w.dispatchEvent(ev); }
    try { w.scrollTo(0, y); } catch (e2) { /* noop */ }
  });

  /* ============ 帮助浮层内容(R86 A4)============ */
  (w.HELP = w.HELP || {}).m3 = {
    title: '设施台账 · 本模块职责',
    body:
      '<p><b>这一页干什么:</b>资产库与归属 —— 设施在哪、归谁、绑了哪些观测设备、历史上发生过什么、关联过哪些线索。地图看板是同一份台账的空间视图。</p>' +
      '<p><b>与客户系统的关系:</b>设施台账的记录系统是客户的资产台账 / GIS;本平台按设施编号对齐并只读引用,巡检侧只增补「观测覆盖窗」与线索关联,不改客户台账主数据。</p>' +
      '<p><b>观测覆盖窗:</b>记录每个点位「什么时候有观测能力」。事故回查时据此区分「模型漏报」(有覆盖没报出)与「覆盖缺失」(压根没观测)—— 不承诺不漏报,承诺每次定性可追溯。</p>' +
      '<p><b>地址口径:</b>界面统一用「设施编号 + 街区名 + Al Ain」;Onwani 五要素双语字段位已预留,空值不渲染。</p>' +
      '<p><b>地图底图:</b>路网 / 街区 / 水系 / 地标与设施坐标均为风格化示意,不含真实测绘数据;正式版接客户 GIS 底图与设施实际坐标。</p>'
  };

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

    var head = '<div class="row" style="align-items:center;gap:8px;margin-bottom:8px">' +
      '<span class="tiny grow"><a href="#/m3">← 返回台账列表与地图</a>' +
      (f.line ? ' · <a href="#/m3/line/' + f.line + '">同线其余设施</a>' : '') + '</span>' + UI.helpBtn('m3') + '</div>' +
      '<div' + UI.cardAttrs('facility', { cls: 'objcard', line: f.line }) + '>' +
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
    var onwaniBlock = '<div class="card">' + UI.secTitle('ONWANI 双语字段位(空值不渲染)', 'facility') +
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
      covBlock = UI.banner('warn', '本设施暂无绑定传感器/相机 —— 观测降级:AI 无产出时,无法区分是「模型漏报」还是「覆盖缺失」。');
    }
    var covPanel = '<div class="card">' + UI.secTitle('观测覆盖窗', 'facility') + covBlock + '</div>';

    /* 劣化曲线(仅路面线设施) */
    var curvePanel = '';
    if (f.line === '路面') {
      var pts = degradeCurve(f.id), last = pts[pts.length - 1].y, risky = last < 60;
      curvePanel = '<div class="card">' + UI.secTitle('劣化曲线(路面线)', 'facility') +
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
    var histPanel = '<div class="card">' + UI.secTitle('点位历史', 'facility') + histBlock + '</div>';

    /* 证据链回查:链接到 m1 详情(施工图 §3 路由契约 #/m1/clue/<id>) */
    var clueBlock = clues.length
      ? '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>线索#</th><th>异常</th><th>级别</th><th>状态</th><th>时间</th><th></th></tr></thead><tbody>' +
        clues.map(function (c) {
          return '<tr><td>' + UI.esc(c.id) + '</td><td>' + UI.esc(c.kindText || '—') + '</td>' +
            '<td>' + UI.levelBadge(c.level) + '</td>' +
            '<td class="tiny">' + (c.obsCount || UI.obsList(c).length) + ' 次</td>' +
            '<td>' + UI.statusBadge(c.status) + '</td>' +
            '<td class="tiny">' + UI.esc(c.t) + '</td>' +
            '<td><a href="#/m1/clue/' + c.id + '">证据链回查 →</a></td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="tiny">本设施暂无线索记录(证据链回查为空)</div>';
    var cluePanel = '<div' + UI.cardAttrs('clue', { cls: 'card', line: f.line }) + '>' + UI.secTitle('证据链回查 · 链接到复核工作台', 'clue') + clueBlock + '</div>';

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
    if (rest[0] === 'line' && rest[1]) return renderMap() + renderList(rest[1]);
    return renderMap() + renderList(null);
  };
})(window);
