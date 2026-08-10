/* origen 巡检 demo · 共享组件(对象卡 / 动作面板 / 时间线 / 校验卡 / 横幅 + 证据示意 SVG)
   规格:施工图 §1(ui.js 职责)· §4(对象卡三行头 R53)· §5(按钮即动作,灰态标注未满足校验)
   铁律:证据图全部 inline SVG 矢量示意,统一角标「AI 生成示意」;零真实照片;零外链。
   共享文件:W1 工兵只读。要改 = 报指挥官。 */
(function (w) {
  'use strict';

  var U = {};

  /* ---------------- 基础 ---------------- */
  function esc(s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  U.esc = esc;
  U.attr = function (o) { return esc(JSON.stringify(o || {})); };

  U.badge = function (text, tone) { return '<span class="badge badge-' + (tone || 'grey') + '">' + esc(text) + '</span>'; };

  var LEVEL_TONE = { '紧急': 'red', '急修': 'red', '养护': 'blue', '观察': 'grey', '调查': 'blue', '设备': 'grey', '雨前专项': 'amber' };
  U.levelBadge = function (lv) { return lv ? U.badge(lv, LEVEL_TONE[lv] || 'grey') : ''; };

  var STATUS_TEXT = {
    open: '待核查', confirmed: '已确认', rejected: '已驳回归档', archived_doubt: '存疑归档',
    recalled: '已撤回', auto_done: '免人工已处置', transferred: '已转办', merged: '已合并'
  };
  var STATUS_TONE = {
    open: 'grey', confirmed: 'green', rejected: 'grey', archived_doubt: 'grey',
    recalled: 'amber', auto_done: 'blue', transferred: 'blue', merged: 'grey'
  };
  U.statusText = function (st) { return STATUS_TEXT[st] || st || ''; };
  U.statusBadge = function (st) { return U.badge(U.statusText(st), STATUS_TONE[st] || 'grey'); };

  /* 地址 UI 口径(设计档 §3):设施编号 + 街区名 + Al Ain;街道字段不出现 */
  U.addr = function (facilityId) {
    var f = w.S && w.S.find.facility(facilityId);
    if (!f) return esc(facilityId || '');
    return esc(f.id) + ' · ' + esc(f.block) + ' · Al Ain';
  };

  /* 数字假设值标注(判据 §9.5) */
  U.assume = function (text, note) {
    return '<span class="assume" title="' + esc(note || '假设值:试点首周与客户核实后按区可配参数调整') + '">' + esc(text) + '</span>';
  };

  /* ---------------- 通道徽章(R86 A1 三档收敛;取名取色唯一处 = data.js window.LANES —— 页级注入,不动 tokens.css) ----------------
     window.LANES = [{key,name,short,color,kind,note}];五档:机器直派 / 加急人工 / 常规人工 / 自动处理 / 驳回与转办。
     LANE_CLASS = 数据层车道原名(队列细分名)→ 五档之一 + 细分名副注。 */
  var LANE_DEFS = w.LANES || [];
  function laneDef(key) { for (var i = 0; i < LANE_DEFS.length; i++) if (LANE_DEFS[i].key === key) return LANE_DEFS[i]; return null; }
  function laneName(key) { var d = laneDef(key); return d ? d.name : key; }

  var LANE_CLASS = {
    '机器直派':   { key: 'machine' },
    '加急人工':   { key: 'urgent' },
    '当日队列':   { key: 'urgent', sub: '当日队列(参数)' },
    '批量':       { key: 'normal', sub: '批量' },
    '批量加急分诊(显名降级)': { key: 'normal', sub: '批量加急分诊 · 显名降级' },
    '批量半审':   { key: 'normal', sub: '批量半审' },
    '单条必审':   { key: 'normal', sub: '单条必审' },
    '常规人工':   { key: 'normal' },
    '调查案':     { key: 'normal', sub: '调查案 · 立案/结案两点拍板' },
    '记账':       { key: 'auto', sub: '记账' },
    '自动升格':   { key: 'auto', sub: '自动升格' },
    '自动处理':   { key: 'auto' },
    '机械驳回':   { key: 'reject', sub: '机械驳回' },
    '设备维护':   { key: 'reject', sub: '设备维护' },
    '驳回与转办': { key: 'reject' }
  };
  Object.keys(LANE_CLASS).forEach(function (k) {
    var d = LANE_CLASS[k];
    d.name = laneName(d.key);
    d.tone = 'lane-' + d.key;
  });
  U.laneClass = function (laneRaw) { return LANE_CLASS[laneRaw] || null; };
  U.laneColor = function (laneRaw) {
    var c = LANE_CLASS[laneRaw]; var d = c ? laneDef(c.key) : null;
    return d ? d.color : '#5b6b7c';
  };
  /* 主名徽章(五色)+ 原细分名降为副注小字;未在字典内的车道名原样徽章不着五色 */
  U.laneBadge = function (laneRaw) {
    if (!laneRaw) return '';
    var def = LANE_CLASS[laneRaw];
    if (!def) return U.badge(laneRaw, 'blue');
    var sub = def.sub ? ' <span class="lane-sub">(' + esc(def.sub) + ')</span>' : '';
    return '<span class="badge lane-badge ' + def.tone + '" title="' + esc((laneDef(def.key) || {}).kind || '') + '">' + esc(def.name) + '</span>' + sub;
  };
  /* 通道判据句(先派后审 / 先审后派 / 不派人 / 不进处置) */
  U.laneKind = function (laneRaw) {
    var c = LANE_CLASS[laneRaw]; var d = c ? laneDef(c.key) : null;
    return d ? d.kind : '';
  };
  function hexSoft(hex, amt) {
    var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    function mix(x) { return Math.round(x + (255 - x) * amt); }
    return 'rgb(' + mix(r) + ',' + mix(g) + ',' + mix(b) + ')';
  }
  (function injectLaneCss() {
    if (!w.document || w.document.getElementById('origen-lane-css')) return;
    var css = '.lane-badge{font-weight:600;border:1px solid transparent;border-radius:20px;padding:1px 8px;font-size:11.5px;display:inline-block}';
    LANE_DEFS.forEach(function (d) {
      css += '.lane-' + d.key + '{background:' + hexSoft(d.color, 0.9) + ';color:' + d.color + ';border-color:' + hexSoft(d.color, 0.7) + '}';
    });
    css += '.lane-sub{font-size:11px;color:var(--faint,#8e968f);margin-left:2px}';
    var s = w.document.createElement('style');
    s.id = 'origen-lane-css';
    s.textContent = css;
    (w.document.head || w.document.documentElement).appendChild(s);
  })();

  U.sla = function (deadline) {
    if (!deadline) return '<span class="sla faint">—</span>';
    var txt = w.S.fmtSla(deadline), left = w.S.slaLeft(deadline);
    var cls = left < 0 ? 'sla-late' : (left <= 5 ? 'sla-warn' : 'sla-ok');
    return '<span class="sla ' + cls + '" title="假设值 SLA;假时钟按场景步进">' + esc(txt) + '</span>';
  };

  /* ---------------- 证据示意 SVG(kind → 矢量示意 + 「AI 生成示意」角标) ---------------- */
  function tag() {
    return '<g><rect x="150" y="128" width="86" height="17" rx="3" fill="#243342" opacity="0.82"></rect>' +
      '<text x="193" y="140" font-size="10.5" fill="#ffffff" text-anchor="middle" font-family="sans-serif">AI 生成示意</text></g>';
  }
  function box(x, y, w2, h2, color, label) {
    return '<rect x="' + x + '" y="' + y + '" width="' + w2 + '" height="' + h2 + '" fill="none" stroke="' + color +
      '" stroke-width="1.6" stroke-dasharray="5 3"></rect>' +
      (label ? '<text x="' + x + '" y="' + (y - 4) + '" font-size="10" fill="' + color + '" font-family="sans-serif">' + esc(label) + '</text>' : '');
  }
  function road() {
    return '<rect x="0" y="0" width="240" height="150" fill="#eef1f4"></rect>' +
      '<rect x="0" y="30" width="240" height="96" fill="#dfe4ea"></rect>' +
      '<path d="M0 78 H240" stroke="#ffffff" stroke-width="3" stroke-dasharray="16 12"></path>';
  }

  var SVGS = {
    'manhole-missing': function () {
      return road() +
        '<ellipse cx="112" cy="86" rx="30" ry="14" fill="#2b3a4a"></ellipse>' +
        '<ellipse cx="112" cy="82" rx="30" ry="14" fill="#141c25"></ellipse>' +
        '<path d="M92 60 L132 60" stroke="#c0392b" stroke-width="2"></path>' +
        box(74, 58, 76, 44, '#c0392b', '井盖缺失 · 开口暴露');
    },
    'manhole-shift': function () {
      return road() +
        '<ellipse cx="112" cy="86" rx="30" ry="14" fill="#141c25"></ellipse>' +
        '<ellipse cx="126" cy="80" rx="28" ry="13" fill="#8c97a3" stroke="#5b6b7c"></ellipse>' +
        box(76, 58, 82, 44, '#9a6b00', '盖体移位 · 开口尺寸分档');
    },
    'grate': function () {
      return road() +
        '<rect x="86" y="66" width="68" height="34" rx="3" fill="#8c97a3" stroke="#5b6b7c"></rect>' +
        '<path d="M94 70 V96 M106 70 V96 M118 70 V96 M130 70 V96 M142 70 V96" stroke="#5b6b7c" stroke-width="2"></path>' +
        '<path d="M88 88 H152" stroke="#7a6a3a" stroke-width="7" opacity=".55"></path>' +
        box(82, 60, 78, 46, '#9a6b00', '雨水口箅面堵塞面积比');
    },
    'pothole': function () {
      return road() +
        '<ellipse cx="118" cy="84" rx="34" ry="18" fill="#5b6b7c"></ellipse>' +
        '<ellipse cx="118" cy="82" rx="26" ry="12" fill="#2b3a4a"></ellipse>' +
        box(80, 60, 78, 46, '#c0392b', '坑槽 · 表观平面直径');
    },
    'crack': function () {
      return road() +
        '<path d="M70 60 L96 78 L86 96 L112 108 M96 78 L124 72 M112 108 L142 100 M124 72 L150 88" stroke="#2b3a4a" stroke-width="2" fill="none"></path>' +
        box(62, 52, 100, 62, '#1a5fb4', '网裂 · 单位车道米长度密度');
    },
    'rut': function () {
      return road() +
        '<path d="M40 66 H200" stroke="#8c97a3" stroke-width="9" opacity=".8"></path>' +
        '<path d="M40 98 H200" stroke="#8c97a3" stroke-width="9" opacity=".8"></path>' +
        box(36, 56, 168, 52, '#1a5fb4', '车辙 · 表观连续长度(深度现场回填)');
    },
    'tree-shadow': function () {
      return road() +
        '<path d="M96 62 q22 -14 40 6 q16 20 -6 34 q-30 12 -42 -8 z" fill="#2b3a4a" opacity=".45"></path>' +
        '<path d="M40 40 q18 -18 34 -6" stroke="#2e7d32" stroke-width="5" fill="none" opacity=".7"></path>' +
        box(88, 54, 62, 56, '#9a6b00', '树影 · 持续假目标(机械闸拦不住)');
    },
    'flow-curve': function () {
      return '<rect x="0" y="0" width="240" height="150" fill="#ffffff"></rect>' +
        '<path d="M24 122 H222 M24 122 V22" stroke="#d8dee6" stroke-width="1"></path>' +
        '<path d="M24 100 H222" stroke="#eef1f4" stroke-width="1"></path>' +
        '<path d="M24 70 H222" stroke="#eef1f4" stroke-width="1"></path>' +
        '<path d="M26 104 L56 96 L80 62 L104 68 L128 40 L152 44 L178 42 L214 46" fill="none" stroke="#1a5fb4" stroke-width="2"></path>' +
        '<path d="M26 108 L60 106 L92 104 L128 106 L170 104 L214 106" fill="none" stroke="#7b8794" stroke-width="1.4" stroke-dasharray="4 3"></path>' +
        '<text x="28" y="34" font-size="10" fill="#c0392b" font-family="sans-serif">实配水量越限</text>' +
        '<text x="150" y="120" font-size="9.5" fill="#7b8794" font-family="sans-serif">虚线=计划应配水量</text>';
    },
    'sensor': function () {
      return '<rect x="0" y="0" width="240" height="150" fill="#f7f9fb"></rect>' +
        '<circle cx="70" cy="82" r="26" fill="none" stroke="#1a5fb4" stroke-width="2"></circle>' +
        '<circle cx="70" cy="82" r="9" fill="#1a5fb4"></circle>' +
        '<path d="M104 82 H150" stroke="#1a5fb4" stroke-width="2" stroke-dasharray="5 3"></path>' +
        '<rect x="152" y="62" width="60" height="40" rx="4" fill="#ffffff" stroke="#d8dee6"></rect>' +
        '<text x="182" y="86" font-size="10" fill="#243342" text-anchor="middle" font-family="sans-serif">签名报文</text>' +
        '<text x="30" y="34" font-size="10.5" fill="#2e7d32" font-family="sans-serif">位移/开合传感器 · 硬证据</text>';
    },
    'before': function () {
      return road() +
        '<ellipse cx="112" cy="84" rx="30" ry="14" fill="#141c25"></ellipse>' +
        '<text x="16" y="24" font-size="11" fill="#c0392b" font-family="sans-serif">修复前</text>' +
        box(76, 58, 74, 44, '#c0392b', '');
    },
    'after': function () {
      return road() +
        '<ellipse cx="112" cy="84" rx="30" ry="14" fill="#8c97a3" stroke="#5b6b7c"></ellipse>' +
        '<path d="M100 84 h24 M112 74 v20" stroke="#5b6b7c"></path>' +
        '<text x="16" y="24" font-size="11" fill="#2e7d32" font-family="sans-serif">修复后</text>' +
        box(76, 58, 74, 44, '#2e7d32', '');
    },
    'field': function () {
      return road() +
        '<circle cx="118" cy="82" r="22" fill="none" stroke="#1a5fb4" stroke-width="2" stroke-dasharray="4 3"></circle>' +
        '<path d="M118 68 v14 h12" stroke="#1a5fb4" stroke-width="2" fill="none"></path>' +
        '<text x="16" y="24" font-size="10.5" fill="#5b6b7c" font-family="sans-serif">现场回传示意</text>';
    },
    'heat': function () {
      var s = '<rect x="0" y="0" width="240" height="150" fill="#ffffff"></rect>', i, j;
      var tones = ['#eef3fa', '#cfdff2', '#9dbfe6', '#6d9fd8', '#4a86cc'];
      for (i = 0; i < 6; i++) for (j = 0; j < 4; j++) {
        s += '<rect x="' + (14 + i * 36) + '" y="' + (18 + j * 30) + '" width="34" height="28" fill="' + tones[(i * 3 + j * 2) % 5] + '" stroke="#ffffff"></rect>';
      }
      s += '<text x="14" y="146" font-size="9.5" fill="#7b8794" font-family="sans-serif">观测覆盖热区示意(深=覆盖高)</text>';
      return s;
    }
  };

  U.evidenceSvg = function (kind) {
    var body = (SVGS[kind] || SVGS['field'])();
    return '<svg viewBox="0 0 240 150" role="img" aria-label="证据矢量示意(AI 生成示意)">' + body + tag() + '</svg>';
  };

  U.evidenceCard = function (ev, caption) {
    var kind = typeof ev === 'string' ? ev : (ev && ev.kind) || 'field';
    var cap = caption || (typeof ev === 'object' && ev.from ? '并入自 ' + ev.from : '');
    return '<div class="ev">' + U.evidenceSvg(kind) + (cap ? '<div class="ev-cap">' + esc(cap) + '</div>' : '') + '</div>';
  };

  U.evidenceGrid = function (list, caption) {
    if (!list || !list.length) return '<div class="tiny">暂无证据件</div>';
    return '<div class="ev-grid">' + list.map(function (e) { return U.evidenceCard(e, caption); }).join('') + '</div>';
  };

  /* ---------------- R86 A3 · 观测(一次检测事件 = 一条观测)---------------- */
  /* 兼容口径:没有 observations 的线索按「一次观测」渲染(既有渲染路径不变) */
  function obsList(c) {
    if (c && c.observations && c.observations.length) return c.observations;
    if (!c) return [];
    return [{ t: c.t, source: c.source, conf: (c.conf === undefined ? null : c.conf), evidence: (c.evidence || []).slice(), note: c.note || '', kind: (w.CLUE_OBS ? w.CLUE_OBS.kind(c.source) : '其他') }];
  }
  U.obsList = obsList;
  function mixText(c, os) {
    var mix = c && c.sourceMix;
    if (!mix) { mix = {}; os.forEach(function (o) { var k = o.kind || '其他'; mix[k] = (mix[k] || 0) + 1; }); }
    return Object.keys(mix).map(function (k) { return k + '×' + mix[k]; }).join(' / ');
  }
  /* 线索卡/详情头部观测行:观测 N 次 · 首见 xx:xx · 最近 xx:xx · 来源:传感器×2/热线×1 */
  U.obsLine = function (c) {
    if (!c) return '';
    var os = obsList(c);
    var first = c.firstSeen || (os[0] && os[0].t) || c.t;
    var last = c.lastSeen || (os[os.length - 1] && os[os.length - 1].t) || c.t;
    var maxConf = (c.maxConf === undefined || c.maxConf === null)
      ? (typeof c.conf === 'number' ? c.conf : null) : c.maxConf;
    return '<div class="obs-line">' +
      '<span class="obs-n">观测 ' + os.length + ' 次</span>' +
      '<span class="obs-sep">·</span><span>首见 ' + esc(first || '—') + '</span>' +
      '<span class="obs-sep">·</span><span>最近 ' + esc(last || '—') + '</span>' +
      '<span class="obs-sep">·</span><span>来源:' + esc(mixText(c, os)) + '</span>' +
      (maxConf === null ? '' : '<span class="obs-sep">·</span><span>最高置信 <b class="mono">' + esc(String(Math.round(maxConf * 100) / 100)) + '</b></span>') +
      '</div>';
  };
  /* 证据卡多图横排:observations 逐条一张(证据示意 + 来源角标 + 时刻);零真实照片纪律不变 */
  U.obsStrip = function (c) {
    var os = obsList(c);
    if (!os.length) return '<div class="tiny">暂无证据件</div>';
    var cells = os.map(function (o, i) {
      var evs = (o.evidence && o.evidence.length) ? o.evidence : [{ kind: 'field' }];
      return evs.map(function (e) {
        var kind = typeof e === 'string' ? e : (e && e.kind) || 'field';
        return '<div class="obs-item">' +
          '<div class="ev">' + U.evidenceSvg(kind) +
          '<span class="obs-src">' + esc(o.kind || '其他') + '</span>' +
          '<div class="ev-cap">观测 ' + (i + 1) + ' · ' + esc(o.t || '—') +
          (typeof o.conf === 'number' ? ' · 置信 <span class="mono">' + esc(String(Math.round(o.conf * 100) / 100)) + '</span>' : '') +
          '</div></div>' +
          (o.note ? '<div class="tiny obs-note">' + esc(o.note) + '</div>' : '') +
          '</div>';
      }).join('');
    }).join('');
    return '<div class="obs-strip">' + cells + '</div>';
  };

  /* ---------------- R86 A9 · 卡片视觉体系(页级注入,不动 tokens.css)----------------
     线索卡=左边框类目色 + 右上类型角标;告警卡=红系头部条;工单卡=蓝系;调查案=紫系;
     证据区=深底内嵌;队列区块标题=色条;标题/正文/元信息三级字号字重;kv 行降灰。 */
  var CARD_TONE = {
    clue: { color: '#1a5fb4', label: '线索' },
    alert: { color: '#c0392b', label: '告警' },
    ticket: { color: '#1a5fb4', label: '工单' },
    case: { color: '#6b3fa0', label: '调查案' },
    audit: { color: '#9a6b00', label: '抽审' },
    report: { color: '#2e7d32', label: '热线上报' },
    facility: { color: '#5b6b7c', label: '设施' }
  };
  var LINE_COLOR = { '井盖': '#c2410c', '路面': '#1a5fb4', '管网': '#0e7490' };
  U.lineColor = function (line) { return LINE_COLOR[line] || '#5b6b7c'; };
  /* 卡片外壳 class + 内联类目色变量:U.cardShell('clue', {line:'井盖'}) → ' oc oc-clue" style="--cat:#c2410c ' 的安全拼装见下 */
  U.cardAttrs = function (kind, opts) {
    opts = opts || {};
    var t = CARD_TONE[kind] || CARD_TONE.clue;
    var color = opts.color || (opts.line ? U.lineColor(opts.line) : t.color);
    return ' class="' + (opts.cls ? esc(opts.cls) + ' ' : '') + 'oc oc-' + kind + '"' +
      ' style="--cat:' + color + (opts.style ? ';' + opts.style : '') + '"';
  };
  U.cardTag = function (kind, text) {
    var t = CARD_TONE[kind] || CARD_TONE.clue;
    return '<span class="oc-tag" style="--cat:' + t.color + '">' + esc(text || t.label) + '</span>';
  };
  /* 队列区块标题(带色条) */
  U.secTitle = function (text, kind) {
    var t = CARD_TONE[kind] || CARD_TONE.clue;
    return '<div class="sec-title sec-bar" style="--cat:' + t.color + '">' + esc(text) + '</div>';
  };
  /* 证据区深底内嵌 */
  U.evInset = function (inner, note) {
    return '<div class="ev-inset">' + inner + (note ? '<div class="ev-inset-note">' + note + '</div>' : '') + '</div>';
  };
  (function injectCardCss() {
    if (!w.document || w.document.getElementById('origen-card-css')) return;
    var css = [
      /* 卡片类型区分 */
      '.oc{position:relative}',
      '.oc-clue{border-left:4px solid var(--cat,#1a5fb4)}',
      '.oc-alert,.oc-ticket,.oc-case,.oc-audit,.oc-report{border-top:3px solid var(--cat)}',
      '.oc-alert{background:linear-gradient(#fdf6f4,#fff 46px)}',
      '.oc-ticket{background:linear-gradient(#f2f6fd,#fff 46px)}',
      '.oc-case{background:linear-gradient(#f7f3fc,#fff 46px)}',
      '.oc-tag{display:inline-block;flex:none;font-size:10.5px;font-weight:700;letter-spacing:.08em;' +
        'padding:1px 8px;border-radius:20px;color:var(--cat);border:1px solid var(--cat);background:#fff;opacity:.92}',
      /* 队列区块标题色条 */
      '.sec-bar{border-left:3px solid var(--cat,#1a5fb4);padding-left:8px;color:var(--cat,#5c6660);opacity:.95}',
      /* 信息层级三级 */
      '.oc-t1{font-size:15px;font-weight:700;color:var(--ink-hi,#0b1a12);letter-spacing:-.01em}',
      '.oc-t2{font-size:13px;font-weight:400;color:var(--ink,#1b231f);line-height:1.68}',
      '.oc-t3{font-size:11.5px;font-weight:400;color:var(--faint,#8e968f);line-height:1.55}',
      '.card .kv dt{color:#9aa39c;font-weight:400}',
      '.card .kv dd{color:#3c453f}',
      /* 证据区深底内嵌 */
      '.ev-inset{background:#20303c;border-radius:8px;padding:10px}',
      '.ev-inset .ev{border-color:#33454f;background:#16232c}',
      '.ev-inset .ev-cap{background:#f7f9fb;border-top-color:#dfe4ea}',
      '.ev-inset-note{color:#b9c6d1;font-size:11.5px;margin-top:8px;line-height:1.6}',
      '.ev-inset-note b{color:#e7eef3}',
      /* 观测行 / 观测证据横排 */
      '.obs-line{display:flex;flex-wrap:wrap;align-items:center;gap:7px;font-size:12px;color:#5c6660;' +
        'background:#f5f7f4;border:1px solid #e4e7e2;border-radius:6px;padding:6px 10px;margin:8px 0}',
      '.obs-line .obs-n{font-weight:700;color:#0b1a12}',
      '.obs-line .obs-sep{color:#c3cabf}',
      '.ev-inset .obs-line{background:#1a2831;border-color:#33454f;color:#b9c6d1}',
      '.ev-inset .obs-line .obs-n{color:#fff}',
      '.obs-strip{display:flex;gap:10px;overflow-x:auto;padding-bottom:4px}',
      '.obs-item{flex:none;width:172px}',
      '.obs-item .ev{position:relative}',
      '.obs-src{position:absolute;left:6px;top:6px;background:rgba(11,26,18,.78);color:#fff;font-size:10px;' +
        'padding:1px 7px;border-radius:20px;letter-spacing:.02em}',
      '.obs-note{margin-top:4px;line-height:1.5}',
      '.ev-inset .obs-note{color:#93a3b0}',
      /* 横幅:关闭键 / 可点主体 / 同类堆叠折叠 */
      '.banner{position:relative}',
      '.banner-body{flex:1 1 auto}',
      'a.banner-body{color:inherit;text-decoration:none;cursor:pointer}',
      'a.banner-body:hover{text-decoration:underline;color:inherit}',
      '.banner-x{flex:none;border:0;background:transparent;color:inherit;opacity:.5;cursor:pointer;' +
        'font-size:15px;line-height:1;padding:0 2px;font-family:inherit}',
      '.banner-x:hover{opacity:1}',
      '.banner-fold{margin-bottom:var(--gap,10px)}',
      '.banner-fold>summary{cursor:pointer;list-style:none;font-size:12.5px;padding:6px 12px;border-radius:6px;' +
        'border:1px dashed var(--line,#e4e7e2);background:#fbfcfa;color:var(--mute,#5c6660)}',
      '.banner-fold>summary::-webkit-details-marker{display:none}',
      '.banner-fold[open]>summary{margin-bottom:6px}',
      '.banner-fold .banner{margin-bottom:6px}',
      /* 帮助浮层 */
      '.help-btn{border:1px solid var(--line,#e4e7e2);background:#fff;color:var(--mute,#5c6660);border-radius:50%;' +
        'width:22px;height:22px;line-height:1;cursor:pointer;font-size:12.5px;font-weight:700;padding:0;font-family:inherit}',
      '.help-btn:hover{border-color:#1a5fb4;color:#1a5fb4}',
      '.help-mask{position:fixed;inset:0;background:rgba(11,26,18,.34);display:flex;align-items:center;' +
        'justify-content:center;z-index:80;padding:20px}',
      '.help-fly{background:#fff;border-radius:10px;max-width:560px;width:100%;max-height:80vh;overflow:auto;' +
        'padding:18px 20px;box-shadow:0 18px 46px rgba(11,26,18,.28)}',
      '.help-fly h3{margin:0 0 8px}',
      '.help-fly .help-body{font-size:13px;line-height:1.75;color:#3c453f}',
      '.help-fly .help-body p{margin:0 0 8px}',
      /* 地图看板(m3) */
      '.map-wrap{display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start}',
      '.map-svg{flex:1 1 460px;min-width:320px;max-width:660px}',
      '.map-svg svg{display:block;width:100%;height:auto;border:1px solid var(--line,#e4e7e2);border-radius:8px;background:#fbfcf8}',
      '.map-side{flex:0 1 230px;min-width:190px}',
      '.map-layers{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px}',
      '.map-layer{border:1px solid var(--line,#e4e7e2);background:#fff;color:var(--mute,#5c6660);border-radius:20px;' +
        'padding:3px 11px;font-size:12px;cursor:pointer;font-family:inherit}',
      '.map-layer.is-on{border-color:var(--cat,#1a5fb4);color:var(--cat,#1a5fb4);background:#fff;font-weight:600}',
      '.map-layer.is-on::before{content:"✓ "}',
      '.map-lg{display:flex;align-items:center;gap:7px;font-size:12px;color:#5c6660;padding:2px 0}',
      '.map-lg i{width:12px;height:12px;border-radius:50%;display:inline-block;flex:none}',
      '.map-node{cursor:pointer}',
      '.map-node:hover{opacity:.72}'
    ].join('');
    var s = w.document.createElement('style');
    s.id = 'origen-card-css';
    s.textContent = css;
    (w.document.head || w.document.documentElement).appendChild(s);
  })();

  /* 通用折线(劣化曲线 / 流量曲线;points = [{x,y}] 或 [num]) */
  U.lineChart = function (points, opts) {
    opts = opts || {};
    var W = 240, H = 110, pad = 18;
    var vals = (points || []).map(function (p, i) { return typeof p === 'number' ? { x: i, y: p } : p; });
    if (!vals.length) return '';
    var xs = vals.map(function (p) { return p.x; }), ys = vals.map(function (p) { return p.y; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs) || 1;
    var y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (y1 === y0) y1 = y0 + 1;
    var d = vals.map(function (p, i) {
      var X = pad + (p.x - x0) / (x1 - x0 || 1) * (W - pad * 2);
      var Y = H - pad - (p.y - y0) / (y1 - y0) * (H - pad * 2);
      return (i ? 'L' : 'M') + X.toFixed(1) + ' ' + Y.toFixed(1);
    }).join(' ');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(opts.label || '趋势曲线') + '">' +
      '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"></rect>' +
      '<path d="M' + pad + ' ' + (H - pad) + ' H' + (W - pad) + '" stroke="#d8dee6"></path>' +
      '<path d="M' + pad + ' ' + pad + ' V' + (H - pad) + '" stroke="#d8dee6"></path>' +
      '<path d="' + d + '" fill="none" stroke="' + (opts.color || '#1a5fb4') + '" stroke-width="2"></path>' +
      (opts.label ? '<text x="' + pad + '" y="12" font-size="10" fill="#5b6b7c" font-family="sans-serif">' + esc(opts.label) + '</text>' : '') +
      '</svg>';
  };

  /* ---------------- 对象卡(三行头:对象# · 关于:设施 · 归属:区)---------------- */
  U.objectCard = function (obj, opts) {
    opts = opts || {};
    var kind = opts.kind || '线索';
    var f = obj.facility ? (w.S.find.facility(obj.facility) || null) : null;
    var badges = [];
    if (obj.level) badges.push(U.levelBadge(obj.level));
    if (obj.lane) badges.push(U.laneBadge(obj.lane));
    if (obj.status) badges.push(U.statusBadge(obj.status));
    if (obj.fastlane) badges.push(U.badge('机器直派自动派', 'amber'));
    if (obj.conf !== undefined && obj.conf !== null) badges.push(U.badge('置信 ' + obj.conf, 'grey'));

    var l2 = f ? ('关于:' + esc(f.kind) + ' ' + U.addr(f.id) + (f.landmark ? ' <span class="faint">(' + esc(f.landmark) + ')</span>' : ''))
      : ('关于:' + esc(obj.facility || obj.dma || '—'));
    var l3 = '归属:' + esc((f && f.owner) || w.S.get().meta.tenant) + ' · 业务线:' + esc(obj.line || '—') +
      (obj.source ? ' · 来源:' + esc(obj.source) : '');

    return '<div class="objcard">' +
      '<div class="objcard-id">' + esc(kind) + '# ' + esc(obj.id) + ' ' + badges.join(' ') + '</div>' +
      '<div class="objcard-l2">' + l2 + '</div>' +
      '<div class="objcard-l3">' + l3 + '</div>' +
      (obj.kindText ? '<div class="objcard-l3">异常:' + esc(obj.kindText) + '</div>' : '') +
      (obj.slaDeadline ? '<div class="objcard-l3">SLA:' + U.sla(obj.slaDeadline) + ' <span class="tiny">(截止 ' + esc(obj.slaDeadline) + ',假设值)</span></div>' : '') +
      (obj.note ? '<div class="objcard-l3 tiny">' + esc(obj.note) + '</div>' : '') +
      '</div>';
  };

  /* ---------------- 机械校验卡(变长 checks[],路面 5 / 井盖 4 / 管网 3)---------------- */
  var MARK = { pass: ['✓', 'check-pass'], fail: ['✗', 'check-fail'], warn: ['!', 'check-fail'], na: ['—', 'check-na'] };
  U.checksCard = function (clue) {
    var cs = clue.checks || [];
    if (!cs.length) {
      return '<div class="checks"><div class="checks-hd">机械校验闸</div>' +
        '<div class="check-row"><span class="check-na">本件无机械校验记录(来源=现场发现/热线上报,直接进人审甄别)</span></div></div>';
    }
    var pass = cs.filter(function (c) { return c.result === 'pass'; }).length;
    var rows = cs.map(function (c) {
      var m = MARK[c.result] || MARK.na;
      return '<div class="check-row">' +
        '<span class="check-mark ' + m[1] + '">' + m[0] + '</span>' +
        '<span class="check-name">' + esc(c.name) + '</span>' +
        '<span class="check-ver">' + esc(c.rule_ver) + '</span></div>';
    }).join('');
    return '<div class="checks">' +
      '<div class="checks-hd">机械校验闸 · ' + esc(clue.line) + '线 ' + cs.length + ' 项 —— 通过 ' + pass + '/' + cs.length +
      (clue.mechFail ? ' · <b style="color:var(--red)">硬失败:高危零自动归档,转人工驳回确认</b>' : '') + '</div>' +
      rows + '</div>';
  };

  /* ---------------- 动作面板(按钮即动作;灰态 + 未满足校验小字)---------------- */
  U.actionPanel = function (items, opts) {
    opts = opts || {};
    var html = (items || []).map(function (it) {
      var def = w.S.ACTIONS[it.action] || {};
      var r = w.S.check(it.action, it.params || {});
      var label = it.label || def.label || it.action;
      var cls = 'btn ' + (it.cls || '') + (r.ok ? '' : ' is-off');
      var btn = '<button type="button" class="' + cls + '"' + (r.ok ? '' : ' disabled') +
        ' data-act="' + esc(it.action) + '" data-p="' + U.attr(it.params || {}) + '"' +
        ' title="' + esc(def.hint || '') + '">' + esc(label) + '</button>';
      var why = r.ok ? (opts.showHint && def.hint ? '<span class="tiny">' + esc(def.hint) + '</span>' : '')
        : '<span class="act-why">未满足:' + esc(r.reason) + '</span>';
      return '<div class="act-item">' + btn + why + '</div>';
    }).join('');
    return '<div class="act-panel">' + html + '</div>';
  };

  U.actionRow = function (items) {
    return '<div class="act-row">' + (items || []).map(function (it) {
      var def = w.S.ACTIONS[it.action] || {};
      var r = w.S.check(it.action, it.params || {});
      return '<button type="button" class="btn btn-sm ' + (it.cls || '') + (r.ok ? '' : ' is-off') + '"' +
        (r.ok ? '' : ' disabled') + ' data-act="' + esc(it.action) + '" data-p="' + U.attr(it.params || {}) + '"' +
        ' title="' + esc(r.ok ? (def.hint || '') : '未满足:' + r.reason) + '">' + esc(it.label || def.label || it.action) + '</button>';
    }).join('') + '</div>';
  };

  /* 点击 → S.commit(唯一状态变更入口);失败弹 toast 说明未满足的校验 */
  U.bindActions = function (root) {
    (root || w.document).addEventListener('click', function (e) {
      var el = e.target;
      while (el && el !== (root || w.document) && !(el.getAttribute && el.getAttribute('data-act'))) el = el.parentNode;
      if (!el || !el.getAttribute) return;
      var act = el.getAttribute('data-act'); if (!act) return;
      if (el.hasAttribute('disabled')) { e.preventDefault(); return; }
      var p = {};
      try { p = JSON.parse(el.getAttribute('data-p') || '{}'); } catch (err) { p = {}; }
      var r = w.S.commit(act, p);
      if (!r.ok) U.toast('动作未执行:' + r.reason, 'bad');
      else if (r.log) U.toast(r.log.sum, 'ok');
      e.preventDefault();
    });
  };

  /* ---------------- 时间线(动作日志流 = 唯一数据源)---------------- */
  U.timeline = function (logs, opts) {
    opts = opts || {};
    var list = (logs || w.S.get().actionLog).slice();
    if (opts.limit) list = list.slice(-opts.limit);
    if (opts.desc) list = list.reverse();
    if (!list.length) return '<div class="tiny">暂无动作日志</div>';
    return '<ul class="tl">' + list.map(function (g) {
      var tone = g.auto ? 'dot-amber' : (g.action.indexOf('reject') >= 0 || g.action.indexOf('recall') >= 0 ? 'dot-red'
        : (g.action.indexOf('confirm') >= 0 || g.action.indexOf('pass') >= 0 ? 'dot-green' : 'dot-blue'));
      return '<li class="' + (g.auto ? 'tl-auto' : '') + '">' +
        '<span class="tl-t">' + esc(g.t) + '</span>' +
        '<span class="tl-d"><i class="dot ' + tone + '"></i></span>' +
        '<span class="tl-b"><b>' + esc(g.label || g.action) + '</b> ' +
        '<span class="tl-actor">· ' + esc(g.actor) + (g.auto ? '(服务账号)' : '') + '</span><br>' +
        '<span class="small">' + esc(g.sum || '') + '</span> ' +
        '<span class="tl-snap">[' + esc(g.rid) + ' · 版本组 ' + esc(g.snapshot) + ']</span></span></li>';
    }).join('') + '</ul>';
  };

  /* ---------------- 本体日志(对象-链接-动作 三类记录的日志形态)----------------
     m6「本体建模」分区与导览「后端发生了什么」浮层共用同一份渲染:一行 = 时刻 · 账号 · 动作 · 对象 · 摘要。
     只做呈现,不改 actionLog 结构。 */
  var OBJ_KEYS = ['clueId', 'ticketId', 'alertId', 'caseId', 'reportId', 'reconId', 'sensorId', 'targetId', 'facility', 'dma', 'crew', 'cat', 'scope'];
  U.logObject = function (g) {
    var p = g.params || {}, out = [];
    for (var i = 0; i < OBJ_KEYS.length && out.length < 2; i++) {
      var v = p[OBJ_KEYS[i]];
      if (v === undefined || v === null || v === '') continue;
      out.push(Array.isArray(v) ? v.join(' / ') : String(v));
    }
    if (!out.length && p.clueIds) out.push(p.clueIds.join(' / '));
    if (!out.length && p.ticketIds) out.push(p.ticketIds.join(' / '));
    return out.join(' · ') || '—';
  };
  /* 关键参数:除对象键之外的入参摘要(权限矩阵/理由码/阈值这类「动作的形参」) */
  U.logParams = function (g) {
    var p = g.params || {}, out = [];
    Object.keys(p).forEach(function (k) {
      if (k === 'actor' || OBJ_KEYS.indexOf(k) >= 0) return;
      var v = p[k];
      if (v === undefined || v === null || v === '') return;
      out.push(k + '=' + (Array.isArray(v) ? v.join('/') : String(v)));
    });
    return out.join(' · ');
  };
  /* opts: {limit, desc, empty} */
  U.ontologyLog = function (logs, opts) {
    opts = opts || {};
    var list = (logs || w.S.get().actionLog).slice();
    if (opts.desc) list = list.reverse();
    if (opts.limit) list = list.slice(0, opts.limit);
    if (!list.length) return '<div class="tiny">' + esc(opts.empty || '本区间无动作记录。') + '</div>';
    var rows = list.map(function (g) {
      var par = U.logParams(g);
      return '<tr>' +
        '<td class="mono">' + esc(g.t) + '</td>' +
        '<td>' + esc(g.actor) + (g.auto ? ' ' + U.badge('自动', 'amber') : '') + '</td>' +
        '<td><b>' + esc(g.label || g.action) + '</b><div class="tiny mono">' + esc(g.action) + '</div></td>' +
        '<td class="mono">' + esc(U.logObject(g)) + '</td>' +
        '<td class="small">' + esc(g.sum || '') + (par ? '<div class="tiny">' + esc(par) + '</div>' : '') + '</td>' +
        '<td class="tiny mono">' + esc(g.rid) + ' · ' + esc(g.snapshot) + '</td>' +
        '</tr>';
    }).join('');
    return '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th style="width:56px">时刻</th><th style="width:96px">账号</th><th style="width:170px">动作</th>' +
      '<th style="width:130px">对象</th><th>关键参数 · 摘要</th><th style="width:130px">记录号 · 快照</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  };

  /* ================================================================
     R87 A6 · 本体日志审计组件(X3 区 · UI.logAudit)
     筛选(账号 / 动作 / 对象类型 / 时间段)+ 关键字 + 分组(对象 / 账号 / 动作)+ 列排序
     + CSV 导出(Blob + a[download],零外链)+ 行点击跳该对象(S.route)。
     数据源 = S.get().actionLog,不改其结构;「后端发生了什么」浮层继续用 U.ontologyLog 精简渲染。
     ================================================================ */
  var LA_OBJ = [
    { key: 'clueId', type: '线索', route: 'clue' },
    { key: 'ticketId', type: '工单', route: 'ticket' },
    { key: 'alertId', type: '告警', route: 'alert' },
    { key: 'caseId', type: '调查案', route: 'case' },
    { key: 'reconId', type: '对账件', route: 'recon' },
    { key: 'reportId', type: '热线上报', route: null },
    { key: 'sensorId', type: '传感器', route: null },
    { key: 'facility', type: '设施', route: 'facility' },
    { key: 'crew', type: '班组', route: null },
    { key: 'dma', type: '计量区', route: null },
    { key: 'ruleId', type: '规则', route: null },
    { key: 'cat', type: '类目', route: null },
    { key: 'targetId', type: '对象', route: null },
    { key: 'scope', type: '范围', route: null }
  ];
  function laObjOf(g) {
    var p = g.params || {}, i, k, v;
    for (i = 0; i < LA_OBJ.length; i++) {
      k = LA_OBJ[i]; v = p[k.key];
      if (v === undefined || v === null || v === '') continue;
      if (Array.isArray(v)) return { type: k.type, id: v.join(' / '), href: null };
      return { type: k.type, id: String(v), href: (k.route && w.S.route) ? w.S.route(k.route, v) : null };
    }
    if (p.clueIds && p.clueIds.length) return { type: '线索', id: p.clueIds.join(' / '), href: null };
    if (p.ticketIds && p.ticketIds.length) return { type: '工单', id: p.ticketIds.join(' / '), href: null };
    return { type: '—', id: '—', href: null };
  }

  var LA = { q: '', actor: '', act: '', otype: '', t0: '', t1: '', group: '', sk: 't', sd: 'desc' };
  var LA_ROOT = 'la-root';

  function laRows() {
    return (w.S.get().actionLog || []).map(function (g) {
      var o = laObjOf(g);
      return {
        t: g.t || '', actor: g.actor || '', auto: !!g.auto,
        action: g.action || '', label: g.label || g.action || '',
        otype: o.type, oid: o.id, href: o.href,
        sum: g.sum || '', par: U.logParams(g), rid: g.rid || '', snap: g.snapshot || ''
      };
    });
  }
  function laMatch(r) {
    if (LA.actor && r.actor !== LA.actor) return false;
    if (LA.act && r.action !== LA.act) return false;
    if (LA.otype && r.otype !== LA.otype) return false;
    if (LA.t0 && r.t < LA.t0) return false;
    if (LA.t1 && r.t > LA.t1) return false;
    var q = LA.q.trim().toLowerCase();
    if (!q) return true;
    return [r.t, r.actor, r.action, r.label, r.otype, r.oid, r.sum, r.par, r.rid, r.snap]
      .join(' ').toLowerCase().indexOf(q) >= 0;
  }
  var LA_SORT_KEY = { t: 't', actor: 'actor', action: 'label', obj: 'oid' };
  function laSorted(rows) {
    var key = LA_SORT_KEY[LA.sk] || 't', dir = LA.sd === 'asc' ? 1 : -1;
    return rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) {
      var x = a.r[key], y = b.r[key];
      if (x === y) return a.i - b.i;
      return (x < y ? -1 : 1) * dir;
    }).map(function (o) { return o.r; });
  }
  function laGroupKey(r) {
    if (LA.group === 'obj') return r.otype + ' ' + r.oid;
    if (LA.group === 'actor') return r.actor;
    if (LA.group === 'action') return r.label;
    return '';
  }

  function laUniq(rows, pick) {
    var seen = {}, out = [];
    rows.forEach(function (r) { var v = pick(r); if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out.sort();
  }
  function laSel(k, list, cur, ph) {
    return '<select data-la="f" data-k="' + k + '"><option value="">' + esc(ph) + '</option>' +
      list.map(function (o) {
        var v = o.v === undefined ? o : o.v, tx = o.t === undefined ? o : o.t;
        return '<option value="' + esc(v) + '"' + (v === cur ? ' selected' : '') + '>' + esc(tx) + '</option>';
      }).join('') + '</select>';
  }
  function laTh(k, text, width) {
    var on = LA.sk === k;
    return '<th style="width:' + width + 'px"><button type="button" class="la-th' + (on ? ' is-on' : '') +
      '" data-la="sort" data-k="' + k + '">' + esc(text) + (on ? (LA.sd === 'asc' ? ' ▲' : ' ▼') : ' ↕') + '</button></th>';
  }

  function laBar(all) {
    var actors = laUniq(all, function (r) { return r.actor; });
    var seen = {}, acts = [];
    all.forEach(function (r) { if (r.action && !seen[r.action]) { seen[r.action] = 1; acts.push({ v: r.action, t: r.label }); } });
    acts.sort(function (a, b) { return a.t < b.t ? -1 : 1; });
    var types = laUniq(all, function (r) { return r.otype; });
    var groups = [['', '不分组'], ['obj', '按对象'], ['actor', '按账号'], ['action', '按动作']];
    return '<div class="la-bar">' +
      '<label class="la-f">账号' + laSel('actor', actors, LA.actor, '全部') + '</label>' +
      '<label class="la-f">动作类型' + laSel('act', acts, LA.act, '全部') + '</label>' +
      '<label class="la-f">对象类型' + laSel('otype', types, LA.otype, '全部') + '</label>' +
      '<label class="la-f">时间段<span class="la-range">' +
      '<input type="text" data-la="i" data-k="t0" value="' + esc(LA.t0) + '" placeholder="19:00" size="5">' +
      '<span class="la-dash">—</span>' +
      '<input type="text" data-la="i" data-k="t1" value="' + esc(LA.t1) + '" placeholder="21:30" size="5"></span></label>' +
      '<label class="la-f la-grow">关键字' +
      '<input type="text" data-la="i" data-k="q" value="' + esc(LA.q) + '" placeholder="线索号 / 工单号 / 摘要 / 记录号"></label>' +
      '<span class="la-f">分组<span class="la-gbtns">' + groups.map(function (g) {
        return '<button type="button" class="la-g' + (LA.group === g[0] ? ' is-on' : '') +
          '" data-la="g" data-g="' + g[0] + '">' + esc(g[1]) + '</button>';
      }).join('') + '</span></span>' +
      '<span class="la-f la-acts">' +
      '<button type="button" class="btn btn-sm" data-la="csv">导出 CSV</button>' +
      '<button type="button" class="btn btn-sm" data-la="reset">清空筛选</button></span>' +
      '</div>';
  }

  function laTrs(rows) {
    return rows.map(function (r) {
      return '<tr' + (r.href ? ' class="la-go" data-la="go" data-h="' + esc(r.href) + '" title="' + esc('跳到 ' + r.oid) + '"' : '') + '>' +
        '<td class="mono">' + esc(r.t) + '</td>' +
        '<td>' + esc(r.actor) + (r.auto ? ' ' + U.badge('自动', 'amber') : '') + '</td>' +
        '<td><b>' + esc(r.label) + '</b><div class="tiny mono">' + esc(r.action) + '</div></td>' +
        '<td><span class="tiny">' + esc(r.otype) + '</span><div class="mono">' + esc(r.oid) + '</div></td>' +
        '<td class="small">' + esc(r.sum) + (r.par ? '<div class="tiny">' + esc(r.par) + '</div>' : '') + '</td>' +
        '<td class="tiny mono">' + esc(r.rid) + ' · ' + esc(r.snap) + '</td>' +
        '</tr>';
    }).join('');
  }

  function laOut() {
    var all = laRows();
    var rows = laSorted(all.filter(laMatch));
    var head = '<div class="la-count">共 ' + all.length + ' 条 · 当前筛选 <b>' + rows.length + '</b> 条' +
      (LA.group ? ' · ' + laUniq(rows, laGroupKey).length + ' 组' : '') + '</div>';
    if (!rows.length) return head + '<div class="tiny">当前筛选条件下无动作记录。</div>';
    var body;
    if (LA.group) {
      var order = [], bag = {};
      rows.forEach(function (r) {
        var k = laGroupKey(r) || '—';
        if (!bag[k]) { bag[k] = []; order.push(k); }
        bag[k].push(r);
      });
      body = order.map(function (k) {
        return '<tbody><tr class="la-grp"><td colspan="6"><b>' + esc(k) + '</b> · ' + bag[k].length + ' 条</td></tr>' +
          laTrs(bag[k]) + '</tbody>';
      }).join('');
    } else {
      body = '<tbody>' + laTrs(rows) + '</tbody>';
    }
    return head + '<div class="la-scroll"><table class="tb la-tb"><thead><tr>' +
      laTh('t', '时刻', 62) + laTh('actor', '账号', 104) + laTh('action', '动作', 176) + laTh('obj', '对象', 138) +
      '<th>摘要 · 关键参数</th><th style="width:132px">记录号 · 快照</th>' +
      '</tr></thead>' + body + '</table></div>';
  }

  function laCsv() {
    var rows = laSorted(laRows().filter(laMatch));
    function cell(v) { return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"'; }
    var lines = [['时刻', '账号', '动作', '动作码', '对象类型', '对象', '摘要', '关键参数', '记录号', '版本组']
      .map(cell).join(',')];
    rows.forEach(function (r) {
      lines.push([r.t, r.actor + (r.auto ? '(服务账号)' : ''), r.label, r.action, r.otype, r.oid, r.sum, r.par, r.rid, r.snap]
        .map(cell).join(','));
    });
    var blob = new w.Blob(['﻿' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    var url = w.URL.createObjectURL(blob);
    var a = w.document.createElement('a');
    a.href = url; a.download = 'ontology-log.csv';
    w.document.body.appendChild(a); a.click();
    w.setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      w.URL.revokeObjectURL(url);
    }, 200);
    U.toast('已导出 ' + rows.length + ' 条动作记录(CSV)', 'ok');
  }

  function laRoot() { return w.document.getElementById(LA_ROOT); }
  function laPaint(barToo) {
    var root = laRoot();
    if (!root) return;
    var out = root.querySelector('.la-out');
    if (barToo) {
      var bar = root.querySelector('.la-bar');
      if (bar) bar.outerHTML = laBar(laRows());
    }
    out = root.querySelector('.la-out');
    if (out) out.innerHTML = laOut();
  }

  function laInject() {
    if (!w.document || w.document.getElementById('origen-la-css')) return;
    var css = [
      '.la-bar{display:flex;flex-wrap:wrap;gap:10px 14px;align-items:flex-end;padding:10px;border:1px solid var(--line,#e4e7e2);',
      'border-radius:8px;background:#fbfcfa;margin-bottom:10px}',
      '.la-f{display:flex;flex-direction:column;gap:4px;font-size:11.5px;color:var(--mute,#5c6660)}',
      '.la-f select,.la-f input{font-family:inherit;font-size:12.5px;padding:4px 6px;border:1px solid var(--line,#e4e7e2);',
      'border-radius:5px;background:#fff;color:var(--ink,#1b231f)}',
      '.la-grow{flex:1 1 220px;min-width:180px}',
      '.la-grow input{width:100%}',
      '.la-range{display:inline-flex;align-items:center;gap:5px}',
      '.la-dash{color:var(--faint,#8e968f)}',
      '.la-gbtns{display:inline-flex;gap:0}',
      '.la-g{font-family:inherit;font-size:12px;padding:4px 10px;border:1px solid var(--line,#e4e7e2);background:#fff;',
      'color:var(--mute,#5c6660);cursor:pointer}',
      '.la-g:first-child{border-radius:5px 0 0 5px}.la-g:last-child{border-radius:0 5px 5px 0}',
      '.la-g+.la-g{border-left:0}',
      '.la-g.is-on{background:#243342;border-color:#243342;color:#fff;font-weight:600}',
      '.la-acts{flex-direction:row;gap:6px;align-items:flex-end}',
      '.la-count{font-size:12px;color:var(--mute,#5c6660);margin-bottom:6px}',
      '.la-scroll{overflow:auto;max-height:460px}',
      '.la-th{font-family:inherit;font-size:inherit;font-weight:inherit;color:inherit;background:transparent;border:0;',
      'padding:0;cursor:pointer;white-space:nowrap}',
      '.la-th.is-on{color:#243342;font-weight:700}',
      '.la-grp td{background:#eef2f6;font-size:12px;color:#243342}',
      '.la-tb tr.la-go{cursor:pointer}',
      '.la-tb tr.la-go:hover td{background:#f2f6fd}'
    ].join('');
    var s = w.document.createElement('style');
    s.id = 'origen-la-css';
    s.textContent = css;
    (w.document.head || w.document.documentElement).appendChild(s);
  }

  /* opts:{reset:true} —— 每次整段重渲染视图时可要求筛选归零(默认保留用户已选条件) */
  U.logAudit = function (opts) {
    opts = opts || {};
    laInject();
    if (opts.reset) LA = { q: '', actor: '', act: '', otype: '', t0: '', t1: '', group: '', sk: 't', sd: 'desc' };
    return '<div id="' + LA_ROOT + '" class="la">' + laBar(laRows()) + '<div class="la-out">' + laOut() + '</div></div>';
  };
  U.logAudit.refresh = function () { laPaint(true); };

  if (w.document) {
    w.document.addEventListener('input', function (e) {
      var el = e.target;
      if (!el || !el.getAttribute || el.getAttribute('data-la') !== 'i') return;
      var k = el.getAttribute('data-k');
      if (k === 'q') LA.q = el.value; else if (k === 't0') LA.t0 = el.value.trim(); else if (k === 't1') LA.t1 = el.value.trim();
      laPaint(false);
    });
    w.document.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || !el.getAttribute || el.getAttribute('data-la') !== 'f') return;
      var k = el.getAttribute('data-k');
      if (k === 'actor') LA.actor = el.value; else if (k === 'act') LA.act = el.value; else if (k === 'otype') LA.otype = el.value;
      laPaint(false);
    });
    w.document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el.getAttribute && !el.getAttribute('data-la')) el = el.parentNode;
      if (!el || !el.getAttribute) return;
      var a = el.getAttribute('data-la');
      if (a === 'sort') {
        var k = el.getAttribute('data-k');
        if (LA.sk === k) LA.sd = LA.sd === 'asc' ? 'desc' : 'asc'; else { LA.sk = k; LA.sd = k === 't' ? 'desc' : 'asc'; }
        laPaint(false);
      } else if (a === 'g') { LA.group = el.getAttribute('data-g') || ''; laPaint(true); }
      else if (a === 'csv') laCsv();
      else if (a === 'reset') { LA = { q: '', actor: '', act: '', otype: '', t0: '', t1: '', group: '', sk: 't', sd: 'desc' }; laPaint(true); }
      else if (a === 'go') {
        var h = el.getAttribute('data-h');
        if (h) w.location.hash = h;
      }
    });
  }

  /* ---------------- 横幅(R86 A9:右侧 × 关闭 + 主体可点跳对象 + 同类堆叠折叠)---------------- */
  var ICO = { info: 'i', warn: '!', danger: '!', ok: '✓', amber: '!' };
  /* U.banner(tone, htmlText, opts?) —— opts:{id 可关闭, href 可点跳转} */
  U.banner = function (tone, text, opts) {
    opts = opts || {};
    var t = tone === 'amber' ? 'warn' : tone;
    var body = opts.href
      ? '<a class="banner-body" href="' + esc(opts.href) + '" title="跳转到该提示对应的对象">' + text + '</a>'
      : '<span class="banner-body">' + text + '</span>';
    var x = opts.id
      ? '<button type="button" class="banner-x" title="关闭该条提示(重置数据后回来)" ' +
        'data-act="banner_dismiss" data-p="' + U.attr({ bannerId: opts.id }) + '">×</button>'
      : '';
    return '<div class="banner banner-' + esc(t) + '">' +
      '<span class="banner-ico">' + (ICO[tone] || 'i') + '</span>' + body + x + '</div>';
  };
  var TONE_LABEL = { info: '通知', warn: '提醒', danger: '预警', ok: '完成', amber: '提醒' };
  /* R88 布局靶单⑧ · 横幅栈:横幅不许把主视图(调度=地图)挤出首屏 ——
     >1 条一律收成**一行**「N 条待处理 ▾」,危险级同样接入折叠(只是折叠条本身仍是红系醒目态),
     收起行里带最高级别那条的摘要与分级计数,展开才铺全部;整栈永远只占一行高度。 */
  var TONE_RANK = { danger: 0, warn: 1, amber: 1, ok: 2, info: 3 };
  function toneKey(t) { return t === 'amber' ? 'warn' : (t || 'info'); }
  function toneRank(t) { var r = TONE_RANK[t]; return r === undefined ? 9 : r; }
  function bannerBrief(b) {
    var s = String(b.text || '').replace(/\s+/g, ' ');
    return s.length > 36 ? s.slice(0, 36) + '…' : s;
  }
  (function injectBannerCss() {
    if (!w.document || w.document.getElementById('origen-banner-css')) return;
    var css = [
      '.banner-fold>summary{display:flex;align-items:center;gap:8px}',
      '.banner-fold .bf-n{color:var(--faint,#8e968f);font-size:11.5px;margin-left:auto;white-space:nowrap}',
      '.banner-fold .bf-ico{flex:none;width:16px;height:16px;line-height:16px;text-align:center;border-radius:50%;',
      'font-size:11px;font-weight:700;background:#e4e7e2;color:#5c6660}',
      '.banner-fold .bf-t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.bf-danger>summary{border-style:solid;border-color:#e6bfb8;background:#fdf3f1;color:#8d2f22;font-weight:600}',
      '.bf-danger .bf-ico{background:#c0392b;color:#fff}',
      '.bf-warn>summary{border-style:solid;border-color:#ecdcbc;background:#fdf9f0;color:#7a5a12}',
      '.bf-warn .bf-ico{background:#9a6b00;color:#fff}'
    ].join('');
    var s = w.document.createElement('style');
    s.id = 'origen-banner-css';
    s.textContent = css;
    (w.document.head || w.document.documentElement).appendChild(s);
  })();
  U.banners = function (scope) {
    var bs = (w.S.banners ? w.S.banners(scope)
      : w.S.get().banners.filter(function (b) { return !scope || b.scope === 'global' || b.scope === scope; }));
    bs = bs.slice(-8);
    if (!bs.length) return '';
    /* 危险级排前(收起行的摘要取它),同级保持原有先后 */
    var sorted = bs.map(function (b, i) { return { b: b, i: i }; }).sort(function (x, y) {
      var d = toneRank(x.b.tone) - toneRank(y.b.tone);
      return d || (x.i - y.i);
    }).map(function (o) { return o.b; });
    var html = sorted.map(function (b) {
      return U.banner(b.tone, esc(b.text), { id: b.dismissible === false ? null : b.id, href: b.href });
    }).join('');
    if (bs.length <= 1) return html;
    var top = sorted[0], k = toneKey(top.tone);
    var counts = {}, order = [];
    sorted.forEach(function (b) {
      var kk = toneKey(b.tone);
      if (!counts[kk]) { counts[kk] = 0; order.push(kk); }
      counts[kk]++;
    });
    var brief = order.map(function (kk) { return (TONE_LABEL[kk] || '提示') + ' ' + counts[kk]; }).join(' · ');
    return '<details class="banner-fold bf-' + esc(k) + '">' +
      '<summary><span class="bf-ico">' + (ICO[top.tone] || 'i') + '</span>' +
      '<span class="bf-t">' + bs.length + ' 条待处理 ▾ · ' + esc(bannerBrief(top)) + '</span>' +
      '<span class="bf-n">' + esc(brief) + ' · 点开展开全部</span></summary>' + html + '</details>';
  };

  /* ---------------- toast(动作反馈 / 系统提示)---------------- */
  U.toast = function (text, tone) {
    var box = w.document.querySelector('.toasts');
    if (!box) { box = w.document.createElement('div'); box.className = 'toasts'; w.document.body.appendChild(box); }
    var el = w.document.createElement('div');
    el.className = 'toast' + (tone ? ' toast-' + tone : '');
    el.textContent = text;
    box.appendChild(el);
    w.setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, tone === 'bad' ? 5200 : 4200);
  };

  /* ---------------- 占位块(W1 工兵填充位)---------------- */
  U.placeholder = function (title, who, lines) {
    return '<div class="ph"><b>' + esc(title) + '</b>' +
      '<div>' + esc(who) + '</div>' +
      (lines && lines.length ? '<div class="tiny" style="margin-top:8px">' + lines.map(esc).join(' · ') + '</div>' : '') +
      '</div>';
  };

  /* ---------------- 帮助浮层(R86 A4:页职责说明 / 与客户系统关系,从组件文案迁出的落点)----------------
     注册表 = window.HELP = { m1:{title, body(html)}, … },各模块自己注册。
     机制:页头「?」按钮 → UI.helpFly(key);W1 若提供更完备的浮层实现,其定义覆盖本降级实现(后到者优先)。 */
  w.HELP = w.HELP || {};
  U.helpBtn = function (key, label) {
    return '<button type="button" class="help-btn" data-help="' + esc(key) + '" ' +
      'title="' + esc(label || '本模块职责说明 / 与客户系统的关系') + '" aria-label="帮助">?</button>';
  };
  function helpFallback(key) {
    var def = (w.HELP || {})[key];
    if (!def) return;
    var old = w.document.querySelector('.help-mask');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var mask = w.document.createElement('div');
    mask.className = 'help-mask';
    mask.innerHTML = '<div class="help-fly">' +
      '<div class="card-hd"><h3>' + esc(def.title || '说明') + '</h3>' +
      '<button type="button" class="btn btn-sm" data-help-close="1">关闭</button></div>' +
      '<div class="help-body">' + (def.body || '') + '</div></div>';
    mask.addEventListener('click', function (e) {
      if (e.target === mask || (e.target.getAttribute && e.target.getAttribute('data-help-close'))) {
        if (mask.parentNode) mask.parentNode.removeChild(mask);
      }
    });
    w.document.body.appendChild(mask);
  }
  U.helpFly = U.helpFly || helpFallback;
  if (w.document) {
    w.document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el.getAttribute && !el.getAttribute('data-help')) el = el.parentNode;
      if (!el || !el.getAttribute) return;
      var k = el.getAttribute('data-help');
      if (!k) return;
      e.preventDefault();
      (U.helpFly || helpFallback)(k);
    });
  }

  /* ================================================================
     R86 A4 · 帮助浮层完整实现(W1 新增;覆盖上面的降级实现,契约同款:w.HELP 注册表 + data-help 委托)
     def = {title, sub?, body(html 字符串 或 段落数组), rows?:[[k,v]], foot?}
     ================================================================ */
  U.registerHelp = function (key, def) { w.HELP[key] = def; return U; };
  U.helpDef = function (key) { return (w.HELP || {})[key] || null; };

  function helpBody(def) {
    var out = '';
    if (def.sub) out += '<p class="tiny" style="color:var(--faint,#8e968f)">' + esc(def.sub) + '</p>';
    var b = def.body;
    if (b && b.join) out += b.map(function (p) { return '<p>' + p + '</p>'; }).join('');
    else if (b) out += b;
    if (def.rows && def.rows.length) {
      out += '<table class="tb" style="margin-top:8px"><tbody>' + def.rows.map(function (r) {
        return '<tr><td style="width:34%"><b>' + esc(r[0]) + '</b></td><td>' + (r[2] ? r[1] : esc(r[1])) + '</td></tr>';
      }).join('') + '</tbody></table>';
    }
    if (def.foot) out += '<p class="tiny" style="margin-top:10px;color:var(--faint,#8e968f)">' + esc(def.foot) + '</p>';
    return out;
  }

  U.helpClose = function () {
    var old = w.document && w.document.querySelector('.help-mask');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  };

  U.helpFly = function (key) {
    var def = U.helpDef(key);
    if (!def || !w.document) return null;
    U.helpClose();
    var mask = w.document.createElement('div');
    mask.className = 'help-mask';
    mask.innerHTML = '<div class="help-fly" role="dialog" aria-label="' + esc(def.title || '说明') + '">' +
      '<div class="card-hd"><h3>' + esc(def.title || '说明') + '</h3>' +
      '<button type="button" class="btn btn-sm" data-help-close="1">关闭(Esc)</button></div>' +
      '<div class="help-body">' + helpBody(def) + '</div></div>';
    mask.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== mask && !(t.getAttribute && t.getAttribute('data-help-close'))) t = t.parentNode;
      if (e.target === mask || (t && t !== mask)) U.helpClose();
    });
    w.document.body.appendChild(mask);
    return mask;
  };

  if (w.document) {
    w.document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.keyCode === 27) U.helpClose();
    });
  }

  /* ================================================================
     R86 A6 · 手机模拟浮窗(UI.phoneSim)
     UI.phoneSim(src, {title, crew}) 打开/切换;UI.phoneSim.close() 关闭;UI.phoneSim.isOpen() 查询。
     同源 iframe:store.js 每次 commit/advance 后 postMessage('origen-sync') + storage 事件兜底 →
     浮窗内页面自行重读 sessionStorage 重渲染,本组件只负责「壳」与「在场」,不代管同步。
     ================================================================ */
  var PH_W = 390, PH_H = 740, PH_S = 0.72;
  var _phone = null;

  function phoneCss() {
    if (w.document.getElementById('origen-phone-css')) return;
    var css = [
      /* z-index 45:压在导览条(40)之上、浮层遮罩(50)之下 —— 开浮层时手机窗自然退到遮罩后面 */
      '.phonesim{position:fixed;right:20px;bottom:118px;z-index:45;width:' + Math.round(PH_W * PH_S) + 'px;',
      'background:#11161a;border-radius:26px;padding:8px;box-shadow:0 14px 40px rgba(11,26,18,.34);border:1px solid #2a3238}',
      '.phonesim-hd{display:flex;align-items:center;gap:6px;color:#e9eeea;font-size:11.5px;padding:2px 4px 7px;cursor:move;user-select:none}',
      '.phonesim-hd b{font-weight:600}',
      '.phonesim-dot{width:7px;height:7px;border-radius:50%;background:#17a05e;flex:none}',
      '.phonesim-sp{flex:1}',
      '.phonesim-x{background:transparent;border:1px solid #39424a;color:#c9d2cb;border-radius:5px;font-family:inherit;',
      'font-size:11.5px;line-height:1;padding:3px 7px;cursor:pointer}',
      '.phonesim-x:hover{background:#222a30;color:#fff}',
      '.phonesim-body{width:' + Math.round(PH_W * PH_S) + 'px;height:' + Math.round(PH_H * PH_S) + 'px;overflow:hidden;',
      'border-radius:18px;background:#fff;position:relative}',
      '.phonesim-body iframe{width:' + PH_W + 'px;height:' + PH_H + 'px;border:0;transform:scale(' + PH_S + ');transform-origin:0 0;display:block}',
      '.phonesim-ft{color:#8b958d;font-size:10.5px;padding:6px 4px 0;text-align:center}',
      '@media (max-height:760px){.phonesim{bottom:96px}.phonesim-body{height:' + Math.round(PH_H * PH_S * 0.82) + 'px}}'
    ].join('');
    var s = w.document.createElement('style');
    s.id = 'origen-phone-css';
    s.textContent = css;
    (w.document.head || w.document.documentElement).appendChild(s);
  }

  function phoneBuild() {
    phoneCss();
    var wrap = w.document.createElement('div');
    wrap.className = 'phonesim';
    wrap.innerHTML =
      '<div class="phonesim-hd"><span class="phonesim-dot"></span><b class="phonesim-t">班组处置端</b>' +
      '<span class="phonesim-sp"></span>' +
      '<button type="button" class="phonesim-x" data-phone="new">新窗打开</button>' +
      '<button type="button" class="phonesim-x" data-phone="close">×</button></div>' +
      '<div class="phonesim-body"><iframe title="现场端" src="about:blank"></iframe></div>' +
      '<div class="phonesim-ft">与工作台同一份状态 · 推进即同步</div>';
    w.document.body.appendChild(wrap);
    var api = {
      wrap: wrap, frame: wrap.querySelector('iframe'),
      titleEl: wrap.querySelector('.phonesim-t'), src: ''
    };
    wrap.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== wrap && !(t.getAttribute && t.getAttribute('data-phone'))) t = t.parentNode;
      if (!t || t === wrap) return;
      var a = t.getAttribute('data-phone');
      if (a === 'close') U.phoneSim.close();
      else if (a === 'new' && api.src) w.open(api.src, '_blank');
    });
    /* 拖动:表头按下 → 改用 left/top 定位 */
    var hd = wrap.querySelector('.phonesim-hd'), drag = null;
    hd.addEventListener('mousedown', function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-phone')) return;
      var r = wrap.getBoundingClientRect();
      drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      wrap.style.right = 'auto'; wrap.style.bottom = 'auto';
      wrap.style.left = r.left + 'px'; wrap.style.top = r.top + 'px';
      e.preventDefault();
    });
    w.document.addEventListener('mousemove', function (e) {
      if (!drag) return;
      var x = Math.max(4, Math.min(e.clientX - drag.dx, w.innerWidth - 60));
      var y = Math.max(4, Math.min(e.clientY - drag.dy, w.innerHeight - 40));
      wrap.style.left = x + 'px'; wrap.style.top = y + 'px';
    });
    w.document.addEventListener('mouseup', function () { drag = null; });
    return api;
  }

  U.phoneSim = function (src, opts) {
    if (!w.document || !src) return null;
    opts = opts || {};
    if (!_phone) _phone = phoneBuild();
    if (_phone.src !== src) { _phone.frame.src = src; _phone.src = src; }
    _phone.titleEl.textContent = opts.title || '现场端 · 实时';
    _phone.wrap.style.display = '';
    return _phone;
  };
  U.phoneSim.close = function () { if (_phone) _phone.wrap.style.display = 'none'; };
  U.phoneSim.isOpen = function () { return !!(_phone && _phone.wrap.style.display !== 'none'); };
  U.phoneSim.src = function () { return _phone ? _phone.src : ''; };

  /* ================================================================
     R87 X2 · 筛选条 / 分组切换 / 分组折叠(m2 告警与工单镜像用)
     纯呈现组件:当前选中值由调用方持有并回传,交互回调 = 调用方给的 JS 表达式字符串
     (与 m2 表单桥接同款:只改本模块视图态,状态变更仍只走 S.commit)。
     ================================================================ */
  (function injectFilterCss() {
    if (!w.document || w.document.getElementById('origen-filter-css')) return;
    var css = [
      '.flt-bar{display:flex;flex-wrap:wrap;align-items:center;gap:10px;background:#f7f9f5;',
      'border:1px solid var(--line,#e4e7e2);border-radius:8px;padding:8px 10px;margin-bottom:10px}',
      '.flt-item{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--mute,#5c6660)}',
      '.flt-lb{color:var(--faint,#8e968f)}',
      '.flt-sel{font-family:inherit;font-size:12px;padding:3px 7px;border:1px solid #dfe3dd;border-radius:6px;',
      'background:#fff;color:var(--ink,#1b231f)}',
      '.flt-sp{flex:1 1 auto}',
      '.flt-n{font-size:11.5px;color:var(--faint,#8e968f)}',
      '.grp-sw{display:inline-flex;border:1px solid #dfe3dd;border-radius:20px;overflow:hidden;background:#fff}',
      '.grp-btn{border:0;background:transparent;font-family:inherit;font-size:12px;padding:3px 12px;',
      'cursor:pointer;color:var(--mute,#5c6660)}',
      '.grp-btn.is-on{background:#1a5fb4;color:#fff;font-weight:600}',
      '.grp-head{display:flex;align-items:center;gap:8px;margin:14px 0 6px}',
      '.grp-head .grp-t{font-size:13px;font-weight:700;color:var(--ink-hi,#0b1a12);border-left:3px solid var(--cat,#1a5fb4);',
      'padding-left:8px}',
      '.grp-head .grp-n{font-size:11.5px;color:var(--faint,#8e968f)}',
      '.fold-more{border:1px dashed var(--line,#e4e7e2);background:#fbfcfa;color:var(--mute,#5c6660);',
      'border-radius:6px;font-family:inherit;font-size:12px;padding:5px 12px;cursor:pointer;margin:6px 0 2px}',
      '.fold-more:hover{border-color:#1a5fb4;color:#1a5fb4}'
    ].join('');
    var s = w.document.createElement('style');
    s.id = 'origen-filter-css';
    s.textContent = css;
    (w.document.head || w.document.documentElement).appendChild(s);
  })();

  /* fields = [{label, value, options:[{v,t}|'字符串'], on:'JS 表达式(this.value 可用)', id?}];opts={right:html} */
  U.filterBar = function (fields, opts) {
    opts = opts || {};
    var html = (fields || []).map(function (f) {
      var cur = (f.value === null || f.value === undefined) ? '' : String(f.value);
      var os = (f.options || []).map(function (o) {
        var v = (typeof o === 'string') ? o : o.v;
        var t = (typeof o === 'string') ? o : (o.t === undefined ? o.v : o.t);
        return '<option value="' + esc(v) + '"' + (String(v) === cur ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('');
      return '<label class="flt-item"><span class="flt-lb">' + esc(f.label) + '</span>' +
        '<select class="flt-sel"' + (f.id ? ' id="' + esc(f.id) + '"' : '') +
        ' onchange="' + esc(f.on || '') + '">' + os + '</select></label>';
    }).join('');
    return '<div class="flt-bar">' + html +
      (opts.right ? '<span class="flt-sp"></span>' + opts.right : '') + '</div>';
  };

  /* items = [{v,t,on}];cur = 当前值 */
  U.groupSwitch = function (items, cur, label) {
    return '<span class="flt-item">' + (label ? '<span class="flt-lb">' + esc(label) + '</span>' : '') +
      '<span class="grp-sw">' + (items || []).map(function (it) {
        return '<button type="button" class="grp-btn' + (String(it.v) === String(cur) ? ' is-on' : '') + '"' +
          ' onclick="' + esc(it.on || '') + '">' + esc(it.t || it.v) + '</button>';
      }).join('') + '</span></span>';
  };

  U.groupHead = function (title, n, color, extra) {
    return '<div class="grp-head" style="--cat:' + esc(color || '#1a5fb4') + '">' +
      '<span class="grp-t">' + esc(title) + '</span><span class="grp-n">' + esc(String(n)) + ' 条</span>' +
      (extra ? '<span class="flt-sp"></span>' + extra : '') + '</div>';
  };

  /* 折叠按钮:hidden = 折起时被藏起的条数;expanded = 当前是否已展开 */
  U.foldMore = function (hidden, on, expanded, shown) {
    if (!hidden) return '';
    return '<button type="button" class="fold-more" onclick="' + esc(on || '') + '">' +
      (expanded ? '收起(只看前 ' + esc(String(shown || 5)) + ' 条)' : '展开全部 ' + esc(String(hidden + (shown || 5))) + ' 条') +
      '</button>';
  };

  /* ================================================================
     R87 X1 分区 · 证据卡弹层(UI.evThumb / UI.evidenceModal)+ 手风琴(UI.accordion)
     —— 本区只归 X1 维护;X2(筛选条)/ X3(日志审计)各有自己的分区,互不越界。
     弹层定宽 880px 居中(宽屏不缩到角落),横向翻页:按钮 + 键盘 ← →;
     打开即记 view_evidence(高危确认前置的「已查看」语义不变,按钮态随之变化)。
     ================================================================ */

  /* 一条线索的全部观测摊平成「一张图 = 一条记录」:{kind, src, srcKind, t, conf, note, obsNo} */
  function evShots(c) {
    var out = [];
    obsList(c).forEach(function (o, i) {
      var evs = (o.evidence && o.evidence.length) ? o.evidence : [{ kind: 'field' }];
      evs.forEach(function (e) {
        out.push({
          kind: typeof e === 'string' ? e : (e && e.kind) || 'field',
          src: o.source || o.kind || '—',
          srcKind: o.kind || '',
          t: o.t || '—',
          conf: (typeof o.conf === 'number') ? o.conf : null,
          note: o.note || '',
          obsNo: i + 1
        });
      });
    });
    return out;
  }
  U.evShots = evShots;

  /* 列表内缩略行:首图 + 「共 N 张」 + 「查看证据卡」按钮 */
  U.evThumb = function (c, opts) {
    opts = opts || {};
    var shots = evShots(c), first = shots[0] || { kind: 'field', t: '—', src: '—', srcKind: '' };
    return '<div class="ev-thumb">' +
      '<div class="ev ev-thumb-img" data-ev="' + esc(c.id) + '" title="点开证据卡大图">' + U.evidenceSvg(first.kind) +
      (first.srcKind ? '<span class="obs-src">' + esc(first.srcKind) + '</span>' : '') + '</div>' +
      '<div class="ev-thumb-side">' +
      '<div class="ev-thumb-n">共 ' + shots.length + ' 张</div>' +
      '<div class="tiny">首张 ' + esc(first.t) + ' · ' + esc(first.src) + '</div>' +
      '<div style="margin-top:6px"><button type="button" class="btn btn-sm" data-ev="' + esc(c.id) + '">' +
      (c.evidenceViewed ? '✓ 证据卡已查看' : '查看证据卡') + '</button></div>' +
      (opts.note ? '<div class="tiny" style="margin-top:4px">' + opts.note + '</div>' : '') +
      '</div></div>';
  };

  var _ev = null;

  function evCss() {
    if (!w.document || w.document.getElementById('origen-ev-css')) return;
    var css = [
      '.ev-thumb{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}',
      '.ev-thumb-img{width:132px;flex:none;cursor:pointer;position:relative}',
      '.ev-thumb-side{flex:1 1 110px;min-width:0;overflow-wrap:anywhere}',
      '.ev-thumb-n{font-weight:700;font-size:13px;color:var(--ink-hi,#0b1a12)}',
      '.evm-mask{position:fixed;inset:0;background:rgba(11,26,18,.46);display:flex;align-items:center;',
      'justify-content:center;z-index:90;padding:24px}',
      '.evm{background:#fff;border-radius:10px;width:880px;max-width:100%;max-height:88vh;overflow:auto;',
      'padding:16px 18px;box-shadow:0 20px 52px rgba(11,26,18,.3)}',
      '.evm h3{margin:0}',
      '.evm-stage{display:flex;align-items:center;gap:10px;margin-top:8px}',
      '.evm-img{flex:1 1 auto;background:#20303c;border-radius:8px;padding:10px}',
      '.evm-img svg{display:block;width:100%;height:auto;border-radius:5px;background:#fff}',
      '.evm-nav{flex:none;width:38px;height:72px;border:1px solid var(--line,#e4e7e2);background:#fff;',
      'border-radius:8px;font-size:22px;line-height:1;cursor:pointer;color:#3c453f;font-family:inherit}',
      '.evm-nav[disabled]{opacity:.32;cursor:default}',
      '.evm-strip{display:flex;gap:8px;overflow-x:auto;margin-top:10px}',
      '.evm-t{flex:none;width:98px;padding:2px;border:1px solid var(--line,#e4e7e2);background:#fff;',
      'border-radius:6px;cursor:pointer}',
      '.evm-t.is-on{border-color:#1a5fb4;box-shadow:0 0 0 2px rgba(26,95,180,.16)}',
      '.evm-t svg{display:block;width:100%;height:auto}',
      /* 手风琴 */
      '.acc{display:flex;flex-direction:column;gap:8px}',
      '.acc-item{border:1px solid var(--line,#e4e7e2);border-radius:8px;background:#fff;overflow:hidden}',
      '.acc-item.is-open{border-color:#c7d4e6;box-shadow:0 2px 10px rgba(11,26,18,.06)}',
      '.acc-hd{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:#fbfcfa;',
      'border:0;border-bottom:1px solid transparent;padding:9px 12px;cursor:pointer;font-family:inherit;font-size:13px;color:var(--ink,#1b231f)}',
      '.acc-item.is-open>.acc-hd{background:#f2f6fd;border-bottom-color:var(--line,#e4e7e2)}',
      '.acc-hd:hover{background:#f2f6fd}',
      '.acc-cev{flex:none;color:#7b8794;font-size:11px}',
      '.acc-t{flex:1 1 auto}',
      '.acc-r{flex:none;text-align:right;font-size:11.5px;color:var(--faint,#8e968f);white-space:nowrap}',
      '.acc-body{padding:10px 12px 4px}',
      '.acc-body>.card{box-shadow:none}'
    ].join('');
    var s = w.document.createElement('style');
    s.id = 'origen-ev-css';
    s.textContent = css;
    (w.document.head || w.document.documentElement).appendChild(s);
  }

  function evHtml(c, idx) {
    var shots = evShots(c);
    var s = shots[idx] || { kind: 'field', t: '—', src: '—', conf: null, note: '', obsNo: 1 };
    var strip = shots.map(function (x, i) {
      return '<button type="button" class="evm-t' + (i === idx ? ' is-on' : '') + '" data-evgo="' + i + '"' +
        ' title="' + esc('第 ' + (i + 1) + ' 张 · ' + x.t) + '">' + U.evidenceSvg(x.kind) + '</button>';
    }).join('');
    return '<div class="evm" role="dialog" aria-label="证据卡大图">' +
      '<div class="card-hd"><h3>证据卡 · ' + esc(c.id) + ' ' +
      '<span class="tiny">第 ' + (idx + 1) + ' / ' + shots.length + ' 张</span></h3>' +
      '<button type="button" class="btn btn-sm" data-evclose="1">关闭(Esc)</button></div>' +
      '<div class="evm-stage">' +
      '<button type="button" class="evm-nav" data-evstep="-1" aria-label="上一张"' + (idx <= 0 ? ' disabled' : '') + '>‹</button>' +
      '<div class="evm-img">' + U.evidenceSvg(s.kind) + '</div>' +
      '<button type="button" class="evm-nav" data-evstep="1" aria-label="下一张"' + (idx >= shots.length - 1 ? ' disabled' : '') + '>›</button>' +
      '</div>' +
      U.kv([
        ['来源', esc(s.src)],
        ['时刻', esc(s.t)],
        ['置信', s.conf === null ? '—' : '<span class="mono">' + esc(String(Math.round(s.conf * 100) / 100)) + '</span>', true],
        ['观测序', '第 ' + s.obsNo + ' 次观测']
      ]) +
      (s.note ? '<div class="small">' + esc(s.note) + '</div>' : '') +
      '<div class="evm-strip">' + strip + '</div>' +
      '<div class="tiny" style="margin-top:6px">← → 翻页</div>' +
      '</div>';
  }

  function evPaint() {
    if (!_ev) return;
    var c = w.S.find.clue(_ev.clueId); if (!c) return;
    var n = evShots(c).length;
    if (_ev.idx >= n) _ev.idx = n - 1;
    if (_ev.idx < 0) _ev.idx = 0;
    _ev.el.innerHTML = evHtml(c, _ev.idx);
  }

  U.evidenceModalClose = function () {
    if (_ev && _ev.el && _ev.el.parentNode) _ev.el.parentNode.removeChild(_ev.el);
    _ev = null;
  };
  U.evidenceModalOpen = function () { return !!_ev; };

  U.evidenceModal = function (clueId, opts) {
    if (!w.document) return null;
    var c = w.S.find.clue(clueId);
    if (!c) { U.toast('证据卡打不开:线索 ' + clueId + ' 不在池内', 'bad'); return null; }
    evCss();
    U.evidenceModalClose();
    var mask = w.document.createElement('div');
    mask.className = 'evm-mask';
    _ev = { clueId: clueId, idx: (opts && opts.idx) || 0, el: mask };
    mask.addEventListener('click', function (e) {
      if (e.target === mask) { U.evidenceModalClose(); return; }
      var t = e.target;
      while (t && t !== mask && !(t.getAttribute &&
        (t.getAttribute('data-evstep') || t.getAttribute('data-evgo') !== null || t.getAttribute('data-evclose')))) t = t.parentNode;
      if (!t || t === mask) return;
      if (t.getAttribute('data-evclose')) { U.evidenceModalClose(); return; }
      var st = t.getAttribute('data-evstep');
      if (st) { _ev.idx += parseInt(st, 10); evPaint(); return; }
      var go = t.getAttribute('data-evgo');
      if (go !== null && go !== undefined && go !== '') { _ev.idx = parseInt(go, 10); evPaint(); }
    });
    w.document.body.appendChild(mask);
    evPaint();
    /* 打开即记录「已查看」:弹层挂在 body 上,commit 触发的重绘只换 #view,不影响本层 */
    if (!c.evidenceViewed && w.S.check('view_evidence', { clueId: clueId }).ok) {
      w.S.commit('view_evidence', { clueId: clueId });
    }
    return mask;
  };

  if (w.document) {
    w.document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el.getAttribute && !el.getAttribute('data-ev')) el = el.parentNode;
      if (!el || !el.getAttribute) return;
      var id = el.getAttribute('data-ev');
      if (!id) return;
      e.preventDefault();
      U.evidenceModal(id);
    });
    w.document.addEventListener('keydown', function (e) {
      if (!_ev) return;
      var k = e.key;
      if (k === 'Escape' || e.keyCode === 27) { U.evidenceModalClose(); return; }
      if (k === 'ArrowLeft' || e.keyCode === 37) { _ev.idx -= 1; evPaint(); e.preventDefault(); }
      else if (k === 'ArrowRight' || e.keyCode === 39) { _ev.idx += 1; evPaint(); e.preventDefault(); }
    });
  }

  /* 手风琴(同时只展开一条):开合状态由调用方持有 —— 点 data-acc → 调用方改状态重绘。
     items = [{id, head(html), right(html), body(html)}];openId = 当前展开的那条 */
  U.accordion = function (items, openId) {
    evCss();
    return '<div class="acc">' + (items || []).map(function (it) {
      var on = it.id === openId;
      return '<div class="acc-item' + (on ? ' is-open' : '') + '">' +
        '<button type="button" class="acc-hd" data-acc="' + esc(it.id) + '" aria-expanded="' + (on ? 'true' : 'false') + '">' +
        '<span class="acc-cev">' + (on ? '▾' : '▸') + '</span>' +
        '<span class="acc-t">' + (it.head || '') + '</span>' +
        '<span class="acc-r">' + (it.right || '') + '</span></button>' +
        (on ? '<div class="acc-body">' + (it.body || '') + '</div>' : '') +
        '</div>';
    }).join('') + '</div>';
  };

  /* ================================================================
     R88 Y1 分区 · 折叠区(UI.fold)—— 本区只归 Y1 维护
     用途:①动作面板「更多(N,当前不可用)」②证据性区块降级折叠 ③队列页「本线概览」两层化。
     开合态存在 UI 层(不进 store),跨重绘保留;点击 → 改态 → 派发 render 由路由重绘。
     ================================================================ */
  var FOLD = {};
  function foldCss() {
    if (!w.document || w.document.getElementById('origen-fold-css')) return;
    var css = [
      '.fold{border:1px solid var(--line,#e4e7e2);border-radius:8px;background:#fff;margin-bottom:var(--gap,10px)}',
      '.fold-hd{display:flex;align-items:center;gap:8px;width:100%;text-align:left;background:#fbfcfa;border:0;',
      'border-radius:8px;padding:8px 12px;cursor:pointer;font-family:inherit;font-size:12.5px;color:var(--mute,#5c6660)}',
      '.fold-hd:hover{background:#f2f6fd;color:var(--ink,#1b231f)}',
      '.fold.is-open>.fold-hd{background:#f2f6fd;color:var(--ink,#1b231f);border-radius:8px 8px 0 0;',
      'border-bottom:1px solid var(--line,#e4e7e2)}',
      '.fold-t{flex:1 1 auto}',
      '.fold-r{flex:none;font-size:11.5px;color:var(--faint,#8e968f);white-space:nowrap}',
      '.fold-body{padding:10px 12px 4px}',
      '.fold-body>.card{box-shadow:none}',
      '.fold-cev{flex:none;color:#7b8794;font-size:11px}'
    ].join('');
    var s = w.document.createElement('style');
    s.id = 'origen-fold-css';
    s.textContent = css;
    (w.document.head || w.document.documentElement).appendChild(s);
  }
  /* UI.fold(key, title, body, {open:默认展开, right:右侧小字}) —— title/right 收 HTML,body 收 HTML */
  U.fold = function (key, title, body, opts) {
    opts = opts || {};
    foldCss();
    if (FOLD[key] === undefined) FOLD[key] = !!opts.open;
    var on = !!FOLD[key];
    return '<div class="fold' + (on ? ' is-open' : '') + '">' +
      '<button type="button" class="fold-hd" data-foldk="' + esc(key) + '" aria-expanded="' + (on ? 'true' : 'false') + '">' +
      '<span class="fold-cev">' + (on ? '▾' : '▸') + '</span>' +
      '<span class="fold-t">' + (title || '') + '</span>' +
      (opts.right ? '<span class="fold-r">' + opts.right + '</span>' : '') +
      '</button>' +
      (on ? '<div class="fold-body">' + (body || '') + '</div>' : '') +
      '</div>';
  };
  if (w.document) {
    w.document.addEventListener('click', function (e) {
      var el = e.target;
      while (el && el.getAttribute && !el.getAttribute('data-foldk')) el = el.parentNode;
      if (!el || !el.getAttribute) return;
      var k = el.getAttribute('data-foldk');
      if (!k) return;
      e.preventDefault();
      FOLD[k] = !FOLD[k];
      var y = w.scrollY || w.pageYOffset || 0;
      try { w.dispatchEvent(new CustomEvent('render', { detail: { ui: 'fold' } })); }
      catch (err) { var ev = w.document.createEvent('Event'); ev.initEvent('render', false, false); w.dispatchEvent(ev); }
      try { w.scrollTo(0, y); } catch (e2) { /* noop */ }
    });
  }

  /* ---------------- 小工具 ---------------- */
  U.kv = function (pairs) {
    return '<dl class="kv">' + pairs.filter(function (p) { return p[1] !== '' && p[1] !== null && p[1] !== undefined; })
      .map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + (p[2] ? p[1] : esc(p[1])) + '</dd>'; }).join('') + '</dl>';
  };
  U.crewName = function (id) { var c = w.S.find.crew(id); return c ? c.name : (id || '—'); };
  U.mount = function (sel, html) { var el = w.document.querySelector(sel); if (el) el.innerHTML = html; return el; };

  w.UI = U;
})(window);
