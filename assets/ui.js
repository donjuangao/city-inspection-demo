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

  var LEVEL_TONE = { '应急': 'red', '紧急': 'red', '急修': 'red', '养护': 'blue', '观察': 'grey', '调查': 'blue', '设备': 'grey', '雨前专项': 'amber' };
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

  U.sla = function (deadline) {
    if (!deadline) return '<span class="sla faint">—</span>';
    var txt = w.S.fmtSla(deadline), left = w.S.slaLeft(deadline);
    var cls = left < 0 ? 'sla-late' : (left <= 5 ? 'sla-warn' : 'sla-ok');
    return '<span class="sla ' + cls + '" title="假设值 SLA;假时钟按剧情步进">' + esc(txt) + '</span>';
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
    if (obj.lane) badges.push(U.badge(obj.lane, obj.lane.indexOf('快车道') >= 0 ? 'amber' : 'blue'));
    if (obj.status) badges.push(U.statusBadge(obj.status));
    if (obj.fastlane) badges.push(U.badge('快车道自动派', 'amber'));
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
        '<div class="check-row"><span class="check-na">本件无机械校验记录(来源=现场发现/公众上报,直接进人审甄别)</span></div></div>';
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
        '<span class="tl-snap">[' + esc(g.rid) + ' · 世界状态快照 ' + esc(g.snapshot) + ']</span></span></li>';
    }).join('') + '</ul>';
  };

  /* ---------------- 横幅 ---------------- */
  var ICO = { info: 'i', warn: '!', danger: '!', ok: '✓', amber: '!' };
  U.banner = function (tone, text) {
    var t = tone === 'amber' ? 'warn' : tone;
    return '<div class="banner banner-' + esc(t) + '"><span class="banner-ico">' + (ICO[tone] || 'i') + '</span><span>' + text + '</span></div>';
  };
  U.banners = function (scope) {
    var bs = w.S.get().banners.filter(function (b) { return !scope || b.scope === 'global' || b.scope === scope; });
    return bs.slice(-6).map(function (b) { return U.banner(b.tone, esc(b.text)); }).join('');
  };

  /* ---------------- toast(剧情叙事 / 动作反馈)---------------- */
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

  /* ---------------- 小工具 ---------------- */
  U.kv = function (pairs) {
    return '<dl class="kv">' + pairs.filter(function (p) { return p[1] !== '' && p[1] !== null && p[1] !== undefined; })
      .map(function (p) { return '<dt>' + esc(p[0]) + '</dt><dd>' + (p[2] ? p[1] : esc(p[1])) + '</dd>'; }).join('') + '</dl>';
  };
  U.crewName = function (id) { var c = w.S.find.crew(id); return c ? c.name : (id || '—'); };
  U.mount = function (sel, html) { var el = w.document.querySelector(sel); if (el) el.innerHTML = html; return el; };

  w.UI = U;
})(window);
