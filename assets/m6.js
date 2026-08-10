/* ===== 模块 m6 视图 · 系统管理 · 归属 W2 工兵(施工图 §7/§8 裁定②:模块拆独立文件,文件互斥) =====
   契约:VIEWS.m6 = function(ctx) 返回 HTML 字符串;ctx={module,rest[],hash}
   共享文件(tokens/store/data/ui/app.html)只读;按钮用 data-action 属性走 UI.bindActions→S.commit

   规格来源:
   - 施工图 §7 m6:角色表 / 参数变更(影子试算)/ 类目机器直派开关(上级主管部门)/ 值班表
   - 设计档 §0.6:角色·账号·权限·数据权限(R85④ 四角色口径 + 三非人账号;上级主管部门关自动车道条款 R72)
   - R86⑥:六 tab + hash 子路由 #/m6/<tab>(roles/rules/lanes/params/duty/ontology)
   - R86 A2:规则引擎 tab —— RULES 26 条按线分组白盒展示;参数调整 → S.commit('rule_param_change') 影子试算 + 审批留痕
   - R86 A1:通道三档收敛(机器直派 / 加急人工 / 常规人工 + 自动处理 + 驳回与转办),旧通道名与旧档名全链改名

   两条铁律:
   ① 参数变更影子试算走 S.commit('rule_param_change')(唯一状态变更入口),写 shadow 覆盖值 + 留痕,不改运行判定;
      正式生效需审批 —— 界面明标,不假装已生效。
   ② 表单取值 → 更新按钮 data-p / disabled(window.M6 桥接,同 m2 的做法),按钮仍走标准 data-act → S.commit。 */
(function (w) {
  'use strict';

  /* ================= 0 · tab 定义与子路由 ================= */
  var TABS = [
    { key: 'roles', label: '角色权限', sub: '人角色三类 + 非人四账号的权限范围' },
    { key: 'rules', label: '规则引擎', sub: '判据规则总表 · 按组折叠 · 参数可调(影子试算)· AI 复验策略白盒' },
    { key: 'lanes', label: '通道与类目开关', sub: '五类通道口径 + 类目机器直派开关(上级主管部门)' },
    { key: 'params', label: '参数变更', sub: '变更单台账 · 影子试算 · 审批后生效' },
    { key: 'duty', label: '值班', sub: '值班表 = 升级链兜底依据' },
    { key: 'ontology', label: '本体建模', sub: '对象 · 链接 · 动作 三类注册表 + 全量动作日志' }
  ];
  var DEF_TAB = 'roles';

  function tabDef(k) {
    for (var i = 0; i < TABS.length; i++) if (TABS[i].key === k) return TABS[i];
    return null;
  }

  /* 裸 #/m6 的落点:默认角色权限 tab;唯一例外 = 导览当前分镜聚焦 #m6-ontology-log(S17 终幕)时落本体建模 tab,
     保证 tour.js 的 route '#/m6' + focus '#m6-ontology-log' 组合仍能命中锚点(#/m6/ontology 也直接可达)。 */
  function resolveTab(ctx) {
    var k = (ctx && ctx.rest && ctx.rest[0]) || '';
    if (tabDef(k)) return k;
    try {
      var T = w.TOUR;
      var sc = T && T.story && T.story[T.at()];
      if (sc && typeof sc.focus === 'string' && sc.focus.indexOf('m6-ontology-log') >= 0) return 'ontology';
    } catch (e) { /* 导览层未加载时忽略 */ }
    return DEF_TAB;
  }

  function tabBar(cur) {
    return '<div class="tabs">' + TABS.map(function (t) {
      return '<a href="#/m6/' + t.key + '" class="' + (t.key === cur ? 'is-on' : '') + '">' + UI.esc(t.label) + '</a>';
    }).join('') + '</div>';
  }

  function pageHead(cur) {
    var t = tabDef(cur) || TABS[0];
    return '<div class="card card-tight">' +
      '<div class="card-hd"><h2>6 · 系统管理</h2>' +
      '<span class="row" style="gap:8px;align-items:center"><span class="tiny">' + UI.esc(t.sub) + '</span>' +
      UI.helpBtn('m6') + '</span></div>' +
      '</div>';
  }

  /* 页职责与口径说明的落点(R87 §11:组件渲染文本里的定义 / 解释句一律挪 HELP) */
  (w.HELP = w.HELP || {}).m6 = {
    title: '系统管理 · 本模块职责',
    body:
      '<p><b>这一页干什么:</b>把「谁能做什么、按什么判据做、参数是多少、谁在值班」四件事摆成可查的表,并留一份全量动作日志。</p>' +
      '<p><b>角色与账号:</b>顶栏「角色」切换器换的是身份,不做登录,只改可用动作;权限层级 L 值取自 dict.roleRank,越大调度权越高。服务账号(规则引擎 / AI 服务 / 班组账号)与人角色在同一张动作白名单上受约束,自动动作不豁免审计,每次执行同样落一条日志。</p>' +
      '<p><b>规则引擎:</b>判据规则版本化管理;参数调整先影子试算、审批后生效,每次变更入动作日志。参数名悬停可看该参数管的是什么。</p>' +
      '<p><b>影子试算:</b>回答的是「如果这个参数改成 X,今天已经发生的这些件会有什么不同」——对当日经过该规则的件回放一遍,列出去向会变的逐件。提交只写覆盖值与留痕,运行判定仍走基线值,正式生效需审批。</p>' +
      '<p><b>通道与类目开关:</b>派单是处置调度,不是定性 —— 机器直派件的定性签字仍在人,并行复核窗内可撤回。上级主管部门关闭类目机器直派 = 安全侧动作即时生效,重开需按数据判据批准。</p>' +
      '<p><b>本体建模:</b>平台的一切行为以「对象 - 链接 - 动作」三类记录结构化存储;注册表与日志实时取自当前世界状态,不是文档抄本。链接当前以外键字段承载,计数实算。</p>' +
      '<p><b>日志审计视图:</b>按账号 / 动作类型 / 对象类型 / 时间段筛选,支持关键字、分组、列排序与 CSV 导出;点任意一行跳到该行对象。人做的和服务账号做的在同一张表上,同一套留痕。</p>'
  };

  /* ================= 1 · 角色权限(设计档 §0.6;R85④ 原「区巡检管理者」「区管理员」并入「复核主管」) ================= */
  /* R88 A1④ rollback:「区值班长(夜班)」并入「复核主管」——人角色收敛为三值,
     夜间语境只是文案上的「复核主管(值班)」,不再是第二个身份;原值班长条款并入主管权限范围。 */
  var ROLE_DESC = {
    '区复核员': '工作台读写 / 告警读。可执行:确认 / 驳回 / 推翻机械判定 / 机器直派撤回 / 批量确认 / 存疑归档 / 立案·结案 / 转办 / 复验人裁与打回。',
    '复核主管': '复核员全部权限 + 抽审 / 撤销 / 兜底读写。另可:高危 override(红色动作,双确认)/ 证据冻结 / 调度改派·合并·拆单 / 挂起与强制回队 / 提级(养护→急修,原因必填)/ 台账读写 / 总览本区(模块 5)/ 发起参数变更(走审批)/ 账号与角色授予(走审批,动作留痕);夜间值班时同岗执行升级链第三级兜底、加急单作业时窗豁免批准与过载三步的借调与仲裁;机器直派关闭后的区申诉发起人之一。',
    '上级主管部门': '跨区只读 + 框架标准 + 类目机器直派入池开关 + 月报。关车道 = 安全侧动作即时生效;重开需按数据判据批准。'
  };
  var SVC_DESC = {
    '规则引擎': '机械校验闸 / 自动车道(记账·升格·机械驳回·设备工单)/ 预警广播 / 机器直派自动派单 / 超时兜底派单的执行身份;机械自动化也不豁免审计,每步入动作日志。',
    'AI 服务': '仅「创建线索 / 提出建议」两动作的执行身份(复验判定与调度建议都归「提出建议」);无界面登录权,无定性动作。',
    '班组账号': '仅班组移动端;接单/工单详情/拍照回传/完工提交;处置动作经集成网关写回客户工单系统;无 Web 工作台任何模块权限。',
    '热线接线员': '12345 市政热线的录入身份:受理来电、生成回执编号、录入点位与类目;只录入,无定性权、无派单权,录入件一律先进人工甄别。'
  };

  function roleTable() {
    var dict = w.S.dict(), rank = dict.roleRank, disp = dict.roleDisplay || {}, cur = w.S.get().role;
    var rows = dict.roles.map(function (r) {
      var on = r === cur;
      return '<tr' + (on ? ' class="is-sel"' : '') + '>' +
        '<td><b>' + UI.esc(disp[r] || r) + '</b>' + (on ? ' <span class="badge badge-blue">当前身份</span>' : '') + '</td>' +
        '<td class="tiny">L' + (rank[r] || '-') + '</td>' +
        '<td>' + UI.esc(ROLE_DESC[r] || '') + '</td></tr>';
    }).join('');
    var svcRows = dict.serviceAccounts.map(function (r) {
      return '<tr><td><b>' + UI.esc(r) + '</b> <span class="badge badge-amber">服务账号</span></td>' +
        '<td class="tiny">—</td><td>' + UI.esc(SVC_DESC[r] || '') + '</td></tr>';
    }).join('');
    return '<div class="card">' +
      '<div class="card-hd"><h3 style="margin:0;font-size:14px">角色与账号权限表</h3>' +
      '<span class="tiny">人角色 ' + dict.roles.length + ' 类 + 非人账号 ' + dict.serviceAccounts.length +
      ' 类,同一套动作白名单约束</span></div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>角色 / 账号</th><th>权限层级</th><th>权限范围</th></tr></thead>' +
      '<tbody>' + rows + svcRows + '</tbody></table></div>' +
      '</div>';
  }

  /* ================= 2 · 规则引擎(R86 A2)================= */
  function laneDefs() { return (w.S.lanes ? w.S.lanes() : (w.LANES || [])); }
  function laneDef(name) {
    var ds = laneDefs();
    for (var i = 0; i < ds.length; i++) if (ds[i].name === name) return ds[i];
    return null;
  }
  function laneBadge(name) {
    var l = laneDef(name);
    if (!l) return UI.badge(name, 'grey');
    return '<span class="badge" style="color:' + l.color + ';border-color:' + l.color + ';background:#fff"' +
      ' title="' + UI.esc(l.kind + ' · ' + l.note) + '">' + UI.esc(l.name) + '</span>';
  }

  /* 单个参数值展示:假设值虚线标注;有影子覆盖值时同时给出基线值对比 */
  function paramVal(pm) {
    var cur = UI.assume(String(pm.val) + (pm.unit || ''), '假设值,区可配;正式变更需审批');
    if (!pm.shadow) return cur;
    return cur + ' ' + UI.badge('影子值', 'amber') +
      '<div class="tiny">基线(运行判定仍用)' + UI.esc(String(pm.base) + (pm.unit || '')) + ' · ' +
      UI.esc((pm.shadowBy || '') + ' ' + (pm.shadowT || '')) + '</div>';
  }

  /* ---- R87 A3 · 影子试算影响面 ----
     S.shadowReplay(ruleId,key,newVal) → {total, changed[{id,from,to}], scope, note}:
     对当日 actionLog 里受该规则影响的历史件回放,给出「改之前先看它会改变今天的哪几件」。 */
  var ID_ROUTE = [[/^CL-/, 'clue'], [/^WO-/, 'ticket'], [/^AL-/, 'alert'], [/^IV-/, 'case'], [/^RC-/, 'recon']];
  function idLink(id) {
    for (var i = 0; i < ID_ROUTE.length; i++) {
      if (!ID_ROUTE[i][0].test(id)) continue;
      var h = w.S.route && w.S.route(ID_ROUTE[i][1], id);
      if (h) return '<a class="mono" href="' + UI.esc(h) + '">' + UI.esc(id) + '</a>';
    }
    return '<span class="mono">' + UI.esc(id) + '</span>';
  }
  function simBox(rep) {
    if (!rep) return '';
    var n = (rep.changed || []).length;
    var head = '今日 ' + UI.esc(rep.scope || '经过本规则的件') + ' 共 <b>' + rep.total + '</b> 件经过本规则;' +
      '若生效,<b>' + n + '</b> 件路由将改变';
    var list = n
      ? '<table class="tb" style="margin-top:6px"><thead><tr>' +
        '<th style="width:110px">件号</th><th>当前路由</th><th>试算后路由</th></tr></thead><tbody>' +
        rep.changed.map(function (c) {
          return '<tr><td>' + idLink(c.id) + '</td><td class="small">' + UI.esc(c.from) + '</td>' +
            '<td class="small"><b>' + UI.esc(c.to) + '</b></td></tr>';
        }).join('') + '</tbody></table>'
      /* changed 为空时 note 就是影响面分析的产物(哪一项判据先卡住了),按正文显示不按脚注 */
      : '<div class="small" style="margin-top:5px">' + UI.esc(rep.note || '当前取值下没有件的去向改变。') + '</div>';
    var chg = '<div class="tiny" style="margin-top:4px">候选值:' + UI.esc(rep.label || '') + ' ' +
      UI.esc(String(rep.from) + (rep.unit || '')) + ' → <b>' + UI.esc(String(rep.to) + (rep.unit || '')) + '</b></div>';
    return '<div class="m6-sim">' + '<div class="small">' + head + '</div>' + chg + list +
      '<div class="tiny m6-sim-ft">正式生效需审批 · 提交后写入影子试算留痕队列,运行判定仍走基线值</div></div>';
  }
  function simCss() {
    if (!w.document || w.document.getElementById('origen-m6-sim-css')) return;
    var css = [
      '.m6-sim{margin-top:8px;padding:9px 11px;border:1px solid var(--line,#e4e7e2);border-left:3px solid #1a5fb4;',
      'border-radius:6px;background:#f7fafd}',
      '.m6-sim-ft{margin-top:6px;color:var(--faint,#8e968f)}',
      '.m6-pm{border-bottom:1px dashed #b9c0b8;cursor:help}',
      /* ---- 折叠组(A7㉑ / 靶单#5#7) ---- */
      '.m6-fold{border-radius:6px}',
      '.m6-fold>summary{cursor:pointer;list-style:none;padding:8px 10px;display:flex;align-items:center;gap:8px;',
      'flex-wrap:wrap;border-radius:6px}',
      '.m6-fold>summary::-webkit-details-marker{display:none}',
      '.m6-fold>summary::before{content:"▸";color:var(--mute,#5c6660);font-size:11px;flex:none}',
      '.m6-fold[open]>summary::before{content:"▾"}',
      '.m6-fold>summary:hover{background:#f4f6f2}',
      '.m6-fold-bd{padding:2px 10px 10px}',
      '.m6-group{border-left:3px solid var(--grp,#5b6b7c)}',
      '.m6-gbar{width:4px;height:15px;border-radius:2px;display:inline-block;flex:none}',
      '.m6-gname{font-size:13.5px}',
      '.m6-gcnt{font-size:12px;color:var(--mute,#5c6660);border:1px solid var(--line,#e4e7e2);border-radius:20px;padding:0 8px}',
      '.m6-gnote{color:var(--faint,#8e968f)}',
      '.m6-rule{padding:8px 0;border-top:1px solid var(--line,#e4e7e2)}',
      '.m6-rule-hd{display:flex;align-items:center;gap:7px;flex-wrap:wrap}',
      '.m6-rid{color:var(--mute,#5c6660);font-size:12px}',
      '.m6-rule-when{margin:3px 0 2px;color:var(--ink,#25302a)}',
      '.m6-svc{color:#0f766e;margin-bottom:2px}',
      '.m6-avlead{padding:8px 10px;border:1px dashed #6b3fa0;border-radius:6px;background:#faf7fd;margin-bottom:4px}',
      '.m6-tpl{margin-top:8px;padding:8px 10px;border:1px solid var(--line,#e4e7e2);border-left:3px solid #6b3fa0;',
      'border-radius:6px;background:#fbfaff}',
      '.m6-tpl-ta{width:100%;font-family:var(--mono,ui-monospace,Menlo,monospace);font-size:12px;line-height:1.6;',
      'margin-top:5px;padding:7px 8px;border:1px solid var(--line,#e4e7e2);border-radius:5px;resize:vertical}',
      '.m6-tpl-ft{margin-top:5px;color:var(--faint,#8e968f)}',
      /* ---- 试算同页后果结果卡(A7⑪) ---- */
      '.m6-res{position:fixed;right:20px;bottom:24px;z-index:46;width:420px;max-width:calc(100vw - 40px);',
      'background:#fff;border:1px solid var(--line,#e4e7e2);border-left:4px solid #1a5fb4;border-radius:10px;',
      'box-shadow:0 14px 40px rgba(11,26,18,.24);max-height:70vh;overflow:auto}',
      '.m6-res-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;',
      'border-bottom:1px solid var(--line,#e4e7e2);background:#f7fafd;border-radius:10px 10px 0 0;position:sticky;top:0}',
      '.m6-res-bd{padding:10px 12px 12px}',
      '.m6-res-pre{white-space:pre-wrap;word-break:break-word;font-family:var(--mono,ui-monospace,Menlo,monospace);',
      'font-size:11.5px;line-height:1.6;background:#f7f9fb;border:1px solid var(--line,#e4e7e2);border-radius:5px;',
      'padding:7px 8px;margin:4px 0 6px;max-height:180px;overflow:auto}',
      '.m6-res-x{border:0;background:transparent;color:var(--mute,#5c6660);font-size:15px;line-height:1;cursor:pointer;',
      'padding:0 2px;font-family:inherit}',
      '@media (max-width:900px){.m6-res{left:12px;right:12px;width:auto}}'
    ].join('');
    var s = w.document.createElement('style');
    s.id = 'origen-m6-sim-css';
    s.textContent = css;
    (w.document.head || w.document.documentElement).appendChild(s);
  }
  simCss();

  /* ================= R88 A7⑪ · 试算同页后果 =================
     参数(或模板)提交之后,就地弹一张结果卡:影响面 + 逐件 + 撤销/保留。
     两个入口(规则引擎 tab 的逐参数编辑器、参数 tab 的试算台)同一张卡、同一套行为。
     「撤销」不是删记录:日志不可删 —— 它是再落一条把值改回基线的变更,原留痕仍在。 */
  var resEl = null;
  function resClose() { if (resEl) resEl.style.display = 'none'; }
  function resBuild() {
    resEl = w.document.createElement('div');
    resEl.className = 'm6-res';
    resEl.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== resEl && !(t.getAttribute && t.getAttribute('data-m6res'))) t = t.parentNode;
      if (!t || !t.getAttribute) return;
      var act = t.getAttribute('data-m6res');
      if (act === 'close') { resClose(); return; }
      if (act === 'revert') {
        var p = JSON.parse(t.getAttribute('data-p') || '{}');
        var r = w.S.commit('rule_param_change', p);
        if (!r.ok) UI.toast('撤销未执行:' + r.reason, 'bad');
        else UI.toast('已撤销:该参数回到基线值,撤销本身也是一条留痕', 'ok');
        /* 不收卡:撤销也会触发一次结果卡重绘,让「回到基线」这一步同样看得见 */
      }
    });
    w.document.body.appendChild(resEl);
  }
  /* 一次参数变更提交后的结果卡 */
  function resShow(p, log) {
    var r = w.S.rule(p.ruleId);
    if (!r) return;
    var pm = (r.params || []).filter(function (x) { return x.key === p.key; })[0];
    var isTpl = p.key === 'promptTpl';
    var label = isTpl ? '复验提示词模板' : (pm ? pm.label : p.key);
    var base = isTpl ? r.promptTpl : (pm ? pm.val : '');
    var unit = (!isTpl && pm && pm.unit) || '';
    var body;
    if (isTpl) {
      /* 模板变更没有「路由会变的件」这种影响面 —— 不硬套一个假的,直说它改的是什么 */
      body = '<div class="small">模板变更不改任何件的路由:它改的是复验服务下一次被触发时用的提问方式。' +
        '影响面要等生效后按「无法判定占比 / 人裁回流量」在试点数据上看。</div>' +
        '<div class="tiny" style="margin-top:6px">提交的新模板全文(留痕内容):</div>' +
        '<pre class="m6-res-pre">' + UI.esc(String(p.val)) + '</pre>' +
        '<div class="tiny">当前线上仍是旧模板(本次只写留痕),正式生效需审批。</div>';
    } else {
      var rep = w.S.shadowReplay ? w.S.shadowReplay(p.ruleId, p.key, p.val) : null;
      var n = rep ? (rep.changed || []).length : 0;
      body = '<div class="small">今日 ' + UI.esc((rep && rep.scope) || '经过本规则的件') + ' 共 <b>' +
        (rep ? rep.total : 0) + '</b> 件经过本规则;若生效,<b>' + n + '</b> 件路由将改变。</div>' +
        (n
          ? '<table class="tb" style="margin-top:6px"><thead><tr><th style="width:110px">件号</th>' +
            '<th>当前路由</th><th>试算后路由</th></tr></thead><tbody>' +
            rep.changed.map(function (c) {
              return '<tr><td>' + idLink(c.id) + '</td><td class="small">' + UI.esc(c.from) + '</td>' +
                '<td class="small"><b>' + UI.esc(c.to) + '</b></td></tr>';
            }).join('') + '</tbody></table>'
          : '<div class="small" style="margin-top:5px">' +
            UI.esc((rep && rep.note) || '当前取值下没有件的去向改变。') + '</div>');
    }
    var revertP = { ruleId: p.ruleId, key: p.key, val: base, reason: '撤销上一次影子试算,回到基线值(撤销本身也留痕)' };
    var canRevert = String(p.val) !== String(base);
    if (!resEl) resBuild();
    resEl.innerHTML =
      '<div class="m6-res-hd"><b>已提交影子试算 · ' + UI.esc(r.id + ' 「' + label + '」') + '</b>' +
      '<button type="button" class="m6-res-x" data-m6res="close" title="收起">×</button></div>' +
      '<div class="m6-res-bd">' +
      '<div class="tiny">' +
      (isTpl
        ? '模板全文 ' + String(base).length + ' 字 → <b>' + String(p.val).length + ' 字</b>'
        : UI.esc(String(base) + unit) + ' → <b>' + UI.esc(String(p.val) + unit) + '</b>') +
      (log ? ' · 留痕 ' + UI.esc(log.rid) + ' ' + UI.esc(log.t) : '') + '</div>' +
      '<div style="margin-top:6px">' + body + '</div>' +
      '<div class="row wrap" style="gap:8px;margin-top:10px">' +
      (canRevert
        ? '<button type="button" class="btn btn-sm" data-m6res="revert" data-p="' + UI.attr(revertP) + '">撤销(回到基线值)</button>'
        : '') +
      '<button type="button" class="btn btn-sm btn-primary" data-m6res="close">保留,等审批</button>' +
      '</div>' +
      '<div class="tiny" style="margin-top:7px">运行判定此刻一行没动:提交只写覆盖值与留痕,正式生效仍要走审批。' +
      '「撤销」不删记录 —— 它是再落一条改回基线的变更,两条都在日志上。</div>' +
      '</div>';
    resEl.style.display = '';
  }
  /* 提交入口只有 S.commit 一个,所以监听它发出的 render 事件即可覆盖两个入口 */
  w.addEventListener('render', function (e) {
    var det = e && e.detail;
    if (!det || det.action !== 'rule_param_change' || !det.log) return;
    try { resShow(det.log.params || {}, det.log); }
    catch (err) { if (w.console && w.console.warn) w.console.warn('[m6] 结果卡渲染失败', err); }
  });

  function paramRows(r, eff) {
    /* S.ruleParams() 只回传生效值不带 desc,一句话定义仍从原始 RULES 取(R87 A9) */
    var DESC = {};
    (r.params || []).forEach(function (p) { if (p.desc) DESC[p.key] = p.desc; });
    return eff.map(function (pm) {
      var uid = r.id + '-' + pm.key;
      var probe = { ruleId: r.id, key: pm.key, val: pm.val, reason: '权限探测' };
      var chk = w.S.check('rule_param_change', probe);
      var editCell = chk.ok
        ? '<button type="button" class="btn btn-sm" onclick="M6.edit(\'' + r.id + '\',\'' + pm.key + '\')">调整</button>'
        : '<button type="button" class="btn btn-sm is-off" disabled title="' + UI.esc(chk.reason) + '">调整</button>' +
          '<div class="act-why">未满足:' + UI.esc(chk.reason) + '</div>';
      var initP = { ruleId: r.id, key: pm.key, val: '', reason: '' };
      /* R87 A9:参数名 hover 显示 desc(一句话定义,数据层 RULES params.desc) */
      var desc = pm.desc || DESC[pm.key] || '';
      var nameCell = desc
        ? '<b class="m6-pm" title="' + UI.esc(desc) + '">' + UI.esc(pm.label) + '</b>'
        : '<b>' + UI.esc(pm.label) + '</b>';
      var row = '<tr>' +
        '<td>' + nameCell + '<div class="tiny mono">' + UI.esc(pm.key) + '</div></td>' +
        '<td>' + paramVal(pm) + '</td>' +
        '<td class="tiny">' + UI.esc(String(pm.base) + (pm.unit || '')) + '</td>' +
        '<td>' + editCell + '</td></tr>';
      /* 无权角色不渲染编辑器(灰态 + 原因已在操作列给出) */
      if (!chk.ok) return row;
      var editor = '<tr id="m6-ed-' + uid + '" style="display:none"><td colspan="4">' +
        '<div class="row wrap" style="align-items:flex-end;gap:10px">' +
        '<div style="width:150px"><label class="fl" for="m6-in-' + uid + '">候选新值' + (pm.unit ? '(' + UI.esc(pm.unit) + ')' : '') + '</label>' +
        '<input type="text" id="m6-in-' + uid + '" value="' + UI.esc(String(pm.val)) + '"' +
        ' oninput="M6.sync(\'' + r.id + '\',\'' + pm.key + '\')"></div>' +
        '<div style="min-width:230px;flex:1"><label class="fl" for="m6-rs-' + uid + '">变更理由(入动作日志)</label>' +
        '<input type="text" id="m6-rs-' + uid + '" placeholder="如:试点首周误派率偏高,拟收紧阈值"' +
        ' oninput="M6.sync(\'' + r.id + '\',\'' + pm.key + '\')"></div>' +
        '<div class="act-item">' +
        '<button type="button" class="btn btn-sm btn-primary is-off" disabled id="m6-rp-btn-' + uid + '"' +
        ' data-act="rule_param_change" data-p="' + UI.attr(initP) + '">提交影子试算</button>' +
        '<span class="act-why" id="m6-rp-btn-' + uid + '-why"></span>' +
        '</div>' +
        '<button type="button" class="btn btn-sm" onclick="M6.edit(\'' + r.id + '\',\'' + pm.key + '\')">取消</button>' +
        '</div>' +
        '<div id="m6-sr-' + uid + '"></div>' +
        '</td></tr>';
      return row + editor;
    }).join('');
  }

  /* 该规则名下的影子试算留痕(= 待审批队列的规则视角) */
  function shadowTrail(r) {
    var list = (w.S.get().ruleShadow || []).filter(function (x) { return x.ruleId === r.id; });
    if (!list.length) return '';
    var rows = list.map(function (x) {
      return '<div class="tiny" style="margin-top:4px">' + UI.badge('待审批', 'amber') + ' ' +
        '<span class="mono">' + UI.esc(x.id) + '</span> · ' + UI.esc(x.label) + ' ' +
        UI.esc(String(x.from) + (x.unit || '')) + ' → <b>' + UI.esc(String(x.to) + (x.unit || '')) + '</b> · ' +
        UI.esc(x.by) + ' ' + UI.esc(x.t) + ' · ' + UI.esc(x.status) +
        (x.reason ? ' · 理由:' + UI.esc(x.reason) : '') +
        ' · <b>正式生效需审批</b>(审批前运行判定仍走基线值)</div>';
    }).join('');
    return '<div style="margin-top:8px;padding:8px;border:1px dashed var(--line);border-radius:6px">' +
      '<div class="tiny"><b>影子试算留痕</b> · ' + list.length + ' 条</div>' + rows + '</div>';
  }

  /* ================= 2.1 · 折叠组件(R88 A7㉑ / 靶单#5#7)=================
     开合状态存在模块里,不进 store —— 它是视图态不是世界状态;
     整页 re-render 后仍按这张表还原,不会一提交参数就全部弹回收起。 */
  var OPEN = {};
  function foldOpen(key, def) { return OPEN[key] === undefined ? !!def : OPEN[key]; }
  function fold(key, head, body, def) {
    return '<details class="m6-fold" data-m6fold="' + UI.esc(key) + '"' + (foldOpen(key, def) ? ' open' : '') + '>' +
      '<summary>' + head + '</summary><div class="m6-fold-bd">' + body + '</div></details>';
  }
  w.document.addEventListener('click', function (e) {
    var el = e.target;
    while (el && el !== w.document && !(el.getAttribute && el.getAttribute('data-m6fold'))) el = el.parentNode;
    if (!el || !el.getAttribute) return;
    /* details 的 open 在 click 冒泡时还没翻,所以记的是「翻过之后」的值 */
    OPEN[el.getAttribute('data-m6fold')] = !el.open;
  });

  /* 组头线色条:三条业务线用 UI 的线色,横向组(派单 / AI 复验 / 观测调度 / 线索归并)各给一色 */
  var GROUP_COLOR = { '派单': '#5b6b7c', 'AI 复验': '#6b3fa0', '观测调度': '#0f766e', '线索归并': '#9a6b00' };
  function groupColor(line) { return GROUP_COLOR[line] || (UI.lineColor ? UI.lineColor(line) : '#5b6b7c'); }
  var GROUP_NOTE = {
    '井盖': '发现 → 双闸 → 分档 → 复验的主判据',
    '路面': '置信 × 来源 × 道路等级的分档判据 + 超时兜底',
    '管网': '水力学规则先响,AI 只作嫌疑排序',
    '派单': '资质硬过滤在前,就近与负载只排序',
    '线索归并': '什么算「同一件事」——归并与另开的判据',
    'AI 复验': '复验判定判据 + 可配提示词模板(白盒)',
    '观测调度': '采集侧的节奏:哪条腿多久看一次,谁在推流'
  };

  /* ---- R88 A3 · AI 复验策略区:提示词模板可编辑,走 rule_param_change 同一条审批语义 ----
     数据层若尚未把 promptTpl 开成可提交参数项,按站内既有灰态契约处理:
     文本域照样可编辑(草稿),提交按钮灰态并写明未满足的原因 —— 不假装已可提交,也不做死按钮。 */
  function promptBlock(r) {
    if (!r.promptTpl) return '';
    var uid = 'tpl-' + r.id;
    var probe = { ruleId: r.id, key: 'promptTpl', val: r.promptTpl, reason: '权限探测' };
    var chk = w.S.check('rule_param_change', probe);
    var initP = { ruleId: r.id, key: 'promptTpl', val: r.promptTpl, reason: '' };
    return '<div class="m6-tpl">' +
      '<div class="tiny"><b>复验提示词模板</b> · 生产口吻;{占位符} 由工单上下文填入(设施编号 / 异常类目 / 参数值)</div>' +
      '<textarea id="m6-tpl-' + uid + '" rows="5" class="m6-tpl-ta"' +
      ' oninput="M6.tplSync(\'' + r.id + '\')">' + UI.esc(r.promptTpl) + '</textarea>' +
      '<div class="row wrap" style="align-items:flex-end;gap:10px;margin-top:6px">' +
      '<div style="min-width:240px;flex:1"><label class="fl" for="m6-tplrs-' + uid + '">变更理由(入动作日志)</label>' +
      '<input type="text" id="m6-tplrs-' + uid + '" placeholder="如:试点首周「无法判定」占比偏高,拟收紧输出格式约束"' +
      ' oninput="M6.tplSync(\'' + r.id + '\')"></div>' +
      '<div class="act-item">' +
      '<button type="button" class="btn btn-sm btn-primary' + (chk.ok ? '' : ' is-off') + '"' +
      (chk.ok ? '' : ' disabled') + ' id="m6-tplbtn-' + uid + '"' +
      ' data-act="rule_param_change" data-p="' + UI.attr(initP) + '">提交模板变更(走审批)</button>' +
      '<span class="act-why" id="m6-tplbtn-' + uid + '-why">' + (chk.ok ? '' : '未满足:' + UI.esc(chk.reason)) + '</span>' +
      '</div></div>' +
      '<div class="tiny m6-tpl-ft">模板变更与参数变更同一条审批语义:提交只写留痕,线上跑的仍是当前版本,正式生效需审批。' +
      '可改权:' + UI.esc((r.editableBy || []).join(' / ') || '不可改') + '。</div>' +
      '</div>';
  }

  function ruleBlock(r) {
    var eff = w.S.ruleParams(r.id);
    var route = r.lane ? laneBadge(r.lane) : '';
    if (r.action) route += (route ? ' ' : '') + '<span class="badge badge-grey">动作:' + UI.esc(r.action) + '</span>';
    var shadowN = (w.S.get().ruleShadow || []).filter(function (x) { return x.ruleId === r.id; }).length;
    /* 组内规则行:默认只露一行判据,参数表 / 模板 / 留痕收进「参数与操作」 */
    var head = '<span class="m6-rid mono">' + UI.esc(r.id) + '</span> <b>' + UI.esc(r.name) + '</b> ' + route +
      (shadowN ? ' ' + UI.badge('影子留痕 ' + shadowN, 'amber') : '');
    var detail =
      (eff.length
        ? '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
          '<th style="width:190px">参数</th><th style="width:190px">当前生效展示值</th><th style="width:120px">基线值</th><th style="width:150px">操作</th>' +
          '</tr></thead><tbody>' + paramRows(r, eff) + '</tbody></table></div>'
        : '<div class="tiny">本条无可配参数。</div>') +
      promptBlock(r) +
      '<div class="tiny" style="margin-top:5px">版本 <span class="mono">' + UI.esc(r.version) + '</span> · ' +
      '可改权:' + UI.esc((r.editableBy || []).join(' / ') || '不可改') + '</div>' +
      shadowTrail(r);
    return '<div class="m6-rule">' +
      '<div class="m6-rule-hd">' + head + '</div>' +
      '<div class="small m6-rule-when">判据:' + UI.esc(r.when) + '</div>' +
      /* R88 A3⑫:观测调度组每条把「谁按这个参数在跑」写在判据下面 */
      (r.svc ? '<div class="tiny m6-svc">服务机制:' + UI.esc(r.svc) + '</div>' : '') +
      fold('rule:' + r.id, '参数与操作' + (eff.length ? '(' + eff.length + ' 项)' : '') +
        (r.promptTpl ? ' · 提示词模板' : ''), detail, r.id === tourRuleId()) +
      '</div>';
  }

  /* AI 复验组的组内抬头:判定链路 + 触发时机 一次讲清(白盒的那句话) */
  function avLead(rs) {
    var trig = w.S.rule('OB-R04');
    var delay = null;
    ((trig && trig.params) || []).forEach(function (pm) { if (pm.key === 'delaySec') delay = pm.val; });
    return '<div class="m6-avlead">' +
      '<div class="small"><b>判定链路</b>:① 配准判是否同一处设施 → ② 多帧一致 + 置信判修复完成 / 未完成 → ' +
      '③ 判不出转存疑待人裁(宁升不降)→ ④ 打回须附对比证据。' +
      '每段的阈值与提示词模板见下表,可查可配。</div>' +
      '<div class="tiny" style="margin-top:4px"><b>触发时机</b>:班组完工回传即触发一次(事件触发,不轮询)' +
      (delay === null ? '' : ',回传后延迟 ' + UI.esc(String(delay)) + ' 秒开跑') +
      ';判定结论进线索,定性签字仍在人。</div></div>';
  }

  function groupBlock(line, rs) {
    var color = groupColor(line);
    var hot = tourRuleId();
    var openByTour = !!hot && rs.some(function (r) { return r.id === hot; });
    var head = '<span class="m6-gbar" style="background:' + color + '"></span>' +
      '<b class="m6-gname">' + UI.esc(line) + (['井盖', '路面', '管网'].indexOf(line) >= 0 ? '线' : '') + '规则</b>' +
      '<span class="m6-gcnt">' + rs.length + ' 条</span>' +
      '<span class="tiny m6-gnote">' + UI.esc(GROUP_NOTE[line] || '') + '</span>';
    var body = (line === 'AI 复验' ? avLead(rs) : '') + rs.map(ruleBlock).join('');
    return '<div class="card card-tight m6-group" style="--grp:' + color + '">' +
      fold('grp:' + line, head, body, openByTour) + '</div>';
  }

  /* 导览把镜头对到某条规则上时(F3 = MH-R03 调参镜),该组与该条默认展开 ——
     否则「默认全收」会把导览要看的那一条藏起来。只改默认值:用户手动收过就以用户为准。 */
  function tourRuleId() {
    try {
      var T = w.TOUR, sc = T && T.story && T.story[T.at()];
      if (!sc) return null;
      var f = sc.focus, txt = typeof f === 'string' ? f : (f || []).join(' ');
      var m = /\b([A-Z]{2}-R\d{2})\b/.exec(txt || '');
      return m ? m[1] : null;
    } catch (e) { return null; }
  }

  function rulesBlock() {
    var all = w.S.rules();
    var order = [], groups = {};
    all.forEach(function (r) {
      if (!groups[r.line]) { groups[r.line] = []; order.push(r.line); }
      groups[r.line].push(r);
    });
    var lead = '<div class="card card-tight">' +
      '<div class="card-hd"><h3 style="margin:0;font-size:14px">规则引擎 · 判据规则总表</h3>' +
      '<span class="tiny">共 ' + all.length + ' 条 · ' + order.length + ' 组 · 默认全收,点组头展开一组</span></div>' +
      '</div>';
    var lanesLegend = '<div class="card card-tight"><div class="sec-title">路由去向图例</div>' +
      '<div class="row wrap" style="gap:10px">' + laneDefs().map(function (l) {
        return '<span>' + laneBadge(l.name) + ' <span class="tiny">' + UI.esc(l.kind) + '</span></span>';
      }).join('') + '</div></div>';
    return lead + lanesLegend + order.map(function (line) { return groupBlock(line, groups[line]); }).join('');
  }

  /* ---- 表单桥接:取值 → 更新按钮 data-p/disabled,按钮仍走标准 data-act → S.commit ---- */
  var M6 = {};
  M6.edit = function (ruleId, key) {
    var tr = w.document.getElementById('m6-ed-' + ruleId + '-' + key);
    if (!tr) return;
    var open = tr.style.display !== 'none';
    tr.style.display = open ? 'none' : '';
    if (!open) M6.sync(ruleId, key);
  };
  M6.sync = function (ruleId, key) {
    var uid = ruleId + '-' + key;
    var raw = (w.document.getElementById('m6-in-' + uid) || {}).value;
    var reason = (w.document.getElementById('m6-rs-' + uid) || {}).value || '';
    var r = w.S.rule(ruleId);
    var base = null;
    (r && r.params || []).forEach(function (pm) { if (pm.key === key) base = pm.val; });
    var val = raw === undefined || raw === null ? '' : String(raw).trim();
    /* 数值型参数按数字提交(与基线同型),非数值型按原文提交 */
    if (typeof base === 'number' && val !== '' && !isNaN(Number(val))) val = Number(val);
    var params = { ruleId: ruleId, key: key, val: val, reason: reason };
    var btn = w.document.getElementById('m6-rp-btn-' + uid);
    if (!btn) return;
    var chk = w.S.check('rule_param_change', params);
    btn.setAttribute('data-p', JSON.stringify(params));
    btn.disabled = !chk.ok;
    btn.classList.toggle('is-off', !chk.ok);
    var why = w.document.getElementById('m6-rp-btn-' + uid + '-why');
    if (why) why.textContent = chk.ok ? '' : ('未满足:' + chk.reason);
    /* R87 A3:每次改值即刻回放当日受本规则影响的件,给出影响面 */
    var out = w.document.getElementById('m6-sr-' + uid);
    if (!out) return;
    if (val === '' || !w.S.shadowReplay) { out.innerHTML = ''; return; }
    out.innerHTML = simBox(w.S.shadowReplay(ruleId, key, val));
  };
  /* 参数 tab 试算台的联动:换规则 → 重填参数列表;换参数 → 候选值回到该参数现行值 */
  /* AI 复验提示词模板:文本域 + 理由 → 更新按钮 data-p / disabled(与 M6.sync 同一套桥接) */
  M6.tplSync = function (ruleId) {
    var uid = 'tpl-' + ruleId;
    var ta = w.document.getElementById('m6-tpl-' + uid);
    var rs = w.document.getElementById('m6-tplrs-' + uid);
    var btn = w.document.getElementById('m6-tplbtn-' + uid);
    if (!ta || !btn) return;
    var params = { ruleId: ruleId, key: 'promptTpl', val: String(ta.value || '').trim(), reason: (rs && rs.value) || '' };
    var chk = w.S.check('rule_param_change', params);
    btn.setAttribute('data-p', JSON.stringify(params));
    btn.disabled = !chk.ok;
    btn.classList.toggle('is-off', !chk.ok);
    var why = w.document.getElementById('m6-tplbtn-' + uid + '-why');
    if (why) why.textContent = chk.ok ? '' : ('未满足:' + chk.reason);
  };
  M6.simPick = function (ruleChanged) {
    var rs = w.document.getElementById('m6SimRule');
    var ps = w.document.getElementById('m6SimParam');
    var iv = w.document.getElementById('m6ParamInput');
    var out = w.document.getElementById('m6ParamPreviewOut');
    if (!rs || !ps || !iv) return;
    if (ruleChanged) ps.innerHTML = simParamOpts(rs.value, '');
    iv.value = simFirstVal(rs.value, ps.value);
    if (out) out.innerHTML = '';
    M6.simSync();
  };
  /* 参数 tab 试算台的提交桥接:与规则引擎 tab 的 M6.sync 同一套(取值 → data-p / disabled) */
  M6.simSync = function () {
    var rs = w.document.getElementById('m6SimRule');
    var ps = w.document.getElementById('m6SimParam');
    var iv = w.document.getElementById('m6ParamInput');
    var rz = w.document.getElementById('m6SimReason');
    var btn = w.document.getElementById('m6SimSubmit');
    if (!rs || !ps || !iv || !btn) return;
    var r = w.S.rule(rs.value), base = null;
    ((r && r.params) || []).forEach(function (pm) { if (pm.key === ps.value) base = pm.val; });
    var val = String(iv.value === undefined || iv.value === null ? '' : iv.value).trim();
    if (typeof base === 'number' && val !== '' && !isNaN(Number(val))) val = Number(val);
    var params = { ruleId: rs.value, key: ps.value, val: val, reason: (rz && rz.value) || '' };
    var chk = w.S.check('rule_param_change', params);
    btn.setAttribute('data-p', JSON.stringify(params));
    btn.disabled = !chk.ok;
    btn.classList.toggle('is-off', !chk.ok);
    var why = w.document.getElementById('m6SimSubmit-why');
    if (why) why.textContent = chk.ok ? '' : ('未满足:' + chk.reason);
  };
  w.M6 = M6;

  /* ================= 3 · 通道与类目开关(R86 A1)================= */
  function laneTable() {
    var rows = laneDefs().map(function (l) {
      return '<tr><td>' + laneBadge(l.name) + '</td>' +
        '<td class="tiny mono">' + UI.esc(l.key) + '</td>' +
        '<td><b>' + UI.esc(l.kind) + '</b></td>' +
        '<td class="small">' + UI.esc(l.note) + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="card-hd"><h3 style="margin:0;font-size:14px">通道分类</h3>' +
      '<span class="tiny">三档处置(机器直派 / 加急人工 / 常规人工)+ 自动处理 + 驳回与转办</span></div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th style="width:110px">通道</th><th style="width:90px">代码</th><th style="width:110px">判据</th><th>口径</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '</div>';
  }

  var CAT_NOTE = {
    '井盖缺失': '井盖线机器直派 · 硬证据 = 位移传感器已认证设备签名报文',
    '爆管': '管网线机器直派 · 硬证据 = 阀事件对齐'
  };

  function fastlaneRow(cat) {
    var on = !!w.S.get().gov.fastlane[cat];
    var toggleBtn = on
      ? { action: 'toggle_fastlane', label: '关闭机器直派', cls: 'btn-danger', params: { cat: cat, on: false, reason: '上级主管部门关闭该类目机器直派(治理动作)' } }
      : { action: 'toggle_fastlane', label: '重开机器直派', cls: 'btn-ok', params: { cat: cat, on: true, dataBasis: '近 30 天误派率回落至阈值内(假设数据)' } };
    var appealBtn = { action: 'appeal_fastlane', label: '区申诉', params: { cat: cat, reason: '本区高危件等不起人审,申请复议重开' } };
    return '<tr>' +
      '<td><b>' + UI.esc(cat) + '</b><div class="tiny">' + UI.esc(CAT_NOTE[cat] || '') + '</div></td>' +
      '<td>' + (on ? UI.badge('已开启', 'green') : UI.badge('已关闭 · 回退人审', 'red')) + '</td>' +
      '<td>' + UI.actionRow([toggleBtn]) + '</td>' +
      '<td>' + (on ? '<span class="tiny faint">类目开启中,申诉入口不显示</span>' : UI.actionRow([appealBtn])) + '</td>' +
      '</tr>';
  }

  function fastlaneBlock() {
    var cats = Object.keys(w.S.get().gov.fastlane);
    return '<div class="card">' +
      '<div class="card-hd"><h3 style="margin:0;font-size:14px">类目机器直派开关</h3>' +
      '<span class="tiny">仅上级主管部门身份可点(灰态见未满足校验);关 = 即时生效 + 强制通知横幅 + 区申诉入口</span></div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>类目</th><th>当前状态</th><th>上级主管部门操作</th><th>区申诉</th></tr></thead>' +
      '<tbody>' + cats.map(fastlaneRow).join('') + '</tbody></table></div>' +
      '</div>';
  }

  /* ================= 4 · 参数变更(影子试算)================= */
  function paramTable() {
    var list = w.S.get().paramChanges;
    if (!list.length) return '<div class="tiny">当前无参数变更单。</div>';
    var rows = list.map(function (p) {
      return '<tr><td class="mono">' + UI.esc(p.id) + '</td><td>' + UI.esc(p.item) + '</td>' +
        '<td>' + UI.assume(p.from, '假设值,区可配') + '</td>' +
        '<td>' + UI.assume(p.to, '假设值,区可配') + '</td>' +
        '<td>' + UI.badge(p.status, 'blue') + '</td><td class="tiny">' + UI.esc(p.by) + '</td></tr>';
    }).join('');
    return '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th>变更单#</th><th>参数项</th><th>现行值</th><th>拟改值</th><th>状态</th><th>发起</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* 参数 tab 的试算台(R87 A3):选规则 → 选参数 → 填候选值 → 回放当日受本规则影响的件 */
  function simRuleList() {
    return w.S.rules().filter(function (r) { return (r.params || []).length; });
  }
  function simParamOpts(ruleId, curKey) {
    var r = w.S.rule(ruleId);
    return ((r && r.params) || []).map(function (pm) {
      return '<option value="' + UI.esc(pm.key) + '"' + (pm.key === curKey ? ' selected' : '') + '>' +
        UI.esc(pm.label) + '(现行 ' + UI.esc(String(pm.val) + (pm.unit || '')) + ')</option>';
    }).join('');
  }
  function simFirstVal(ruleId, key) {
    var r = w.S.rule(ruleId), out = '';
    ((r && r.params) || []).forEach(function (pm) { if (!key ? !out : pm.key === key) out = String(pm.val); });
    return out;
  }
  function paramPreview() {
    var list = simRuleList();
    if (!list.length) return '';
    var def = w.S.rule('MH-R01') ? 'MH-R01' : list[0].id;
    var opts = list.map(function (r) {
      return '<option value="' + UI.esc(r.id) + '"' + (r.id === def ? ' selected' : '') + '>' +
        UI.esc(r.id + ' · ' + r.name) + '</option>';
    }).join('');
    /* 首帧就把提交按钮的 data-p 与灰态算准(不等 oninput):默认规则的第一个参数 + 它的现行值 */
    var defR = w.S.rule(def), defPm = ((defR && defR.params) || [])[0] || { key: '', val: '' };
    var initP = { ruleId: def, key: defPm.key, val: defPm.val, reason: '' };
    var initChk = w.S.check('rule_param_change', initP);
    return '<div class="sep"></div>' +
      '<div class="sec-title">影子试算 · 影响面回放</div>' +
      '<div class="row wrap" style="align-items:flex-end;gap:12px">' +
      '<div style="min-width:280px;flex:1"><label class="fl" for="m6SimRule">规则</label>' +
      '<select id="m6SimRule" onchange="M6.simPick(1)" style="width:100%">' + opts + '</select></div>' +
      '<div style="min-width:230px"><label class="fl" for="m6SimParam">参数</label>' +
      '<select id="m6SimParam" onchange="M6.simPick(0)" style="width:100%">' + simParamOpts(def, '') + '</select></div>' +
      '<div style="width:150px"><label class="fl" for="m6ParamInput">候选新值</label>' +
      '<input type="text" id="m6ParamInput" value="' + UI.esc(simFirstVal(def, '')) + '"' +
      ' oninput="M6.simSync()"></div>' +
      '<div><button type="button" class="btn" id="m6ParamPreviewBtn">试算影响面</button></div>' +
      '</div>' +
      /* R88 A7⑪ 双入口同行为:参数 tab 这一侧也能提交,提交后弹同一张结果卡 */
      '<div class="row wrap" style="align-items:flex-end;gap:12px;margin-top:8px">' +
      '<div style="min-width:280px;flex:1"><label class="fl" for="m6SimReason">变更理由(入动作日志)</label>' +
      '<input type="text" id="m6SimReason" placeholder="如:试点首周误派率偏高,拟收紧阈值"' +
      ' oninput="M6.simSync()" style="width:100%"></div>' +
      '<div class="act-item">' +
      '<button type="button" class="btn btn-primary' + (initChk.ok ? '' : ' is-off') + '"' +
      (initChk.ok ? '' : ' disabled') + ' id="m6SimSubmit"' +
      ' data-act="rule_param_change" data-p="' + UI.attr(initP) + '">提交影子试算</button>' +
      '<span class="act-why" id="m6SimSubmit-why">' + (initChk.ok ? '' : '未满足:' + UI.esc(initChk.reason)) + '</span></div>' +
      '</div>' +
      '<div id="m6ParamPreviewOut" style="margin-top:6px"></div>';
  }

  /* 规则参数影子试算留痕汇总(跨规则视角;逐条留痕在规则引擎 tab 各规则名下) */
  function shadowTable() {
    var list = w.S.get().ruleShadow || [];
    var body = list.length
      ? '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
        '<th style="width:90px">留痕#</th><th style="width:90px">规则</th><th>参数项</th><th style="width:150px">影子变更</th>' +
        '<th style="width:110px">发起</th><th style="width:150px">状态</th></tr></thead><tbody>' +
        list.map(function (x) {
          return '<tr><td class="mono">' + UI.esc(x.id) + '</td><td class="mono">' + UI.esc(x.ruleId) + '</td>' +
            '<td>' + UI.esc(x.label) + '</td>' +
            '<td>' + UI.esc(String(x.from) + (x.unit || '')) + ' → <b>' + UI.esc(String(x.to) + (x.unit || '')) + '</b></td>' +
            '<td class="tiny">' + UI.esc(x.by) + ' ' + UI.esc(x.t) + '</td>' +
            '<td>' + UI.badge(x.status, 'amber') + '<div class="tiny">正式生效需审批</div></td></tr>';
        }).join('') + '</tbody></table></div>'
      : '<div class="tiny">当前无规则参数影子试算记录 —— 在「规则引擎」tab 对任一参数点「调整」即可发起。</div>';
    return '<div class="card"><div class="card-hd"><h3 style="margin:0;font-size:14px">规则参数影子试算</h3>' +
      '<span class="tiny">写覆盖值 + 动作日志留痕,运行判定仍走基线值</span></div>' + body + '</div>';
  }

  function paramBlock() {
    return '<div class="card"><div class="card-hd"><h3 style="margin:0;font-size:14px">参数变更</h3>' +
      '<span class="tiny">走审批;发起人 = 复核主管</span></div>' +
      paramTable() + paramPreview() + '</div>' + shadowTable();
  }

  /* 影子试算:不接 S.commit、不改 state —— 走 S.shadowReplay 回放当日受本规则影响的件 */
  function computeShadow() {
    var rid = (w.document.getElementById('m6SimRule') || {}).value;
    var key = (w.document.getElementById('m6SimParam') || {}).value;
    var raw = (w.document.getElementById('m6ParamInput') || {}).value;
    var val = raw === undefined || raw === null ? '' : String(raw).trim();
    if (!rid || !key) return '<div class="tiny">请先选规则与参数。</div>';
    if (val === '') return '<div class="tiny">请填候选新值。</div>';
    var r = w.S.rule(rid), base = null;
    ((r && r.params) || []).forEach(function (pm) { if (pm.key === key) base = pm.val; });
    if (typeof base === 'number') {
      if (isNaN(Number(val))) return '<div class="tiny">本参数为数值型,候选新值需为数字。</div>';
      val = Number(val);
    }
    return simBox(w.S.shadowReplay(rid, key, val));
  }

  /* ================= 5 · 值班表 ================= */
  function dutyBlock() {
    var rows = w.S.get().duty.map(function (d) {
      return '<tr><td>' + UI.esc(d.date) + '</td><td>' + UI.esc(d.role) + '</td>' +
        '<td>' + UI.esc(d.who) + '</td><td class="tiny">' + UI.esc(d.note) + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="sec-title">值班表(升级链兜底依据)</div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>日期</th><th>值班角色</th><th>在岗</th><th>备注</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  /* ================= 6 · 本体建模(R85②:对象 / 链接 / 动作 三张注册表 + 日志)=================
     计数全部实算自 S.get()——注册表不是文档抄本,是运行时本体的镜子。 */
  var OBJ_TYPES = [
    { name: '设施', key: 'facilities', fields: '设施编号 · 类型 · 街区 · 权属 · 业务线 · 绑定数据源' },
    { name: '传感器', key: 'sensors', fields: '点位号 · 类型 · 所属设施 · 自检状态 · 观测覆盖窗' },
    { name: '线索', key: 'clues', fields: '线索号 · 业务线 · 级别 · 置信度 · 通道 · 状态 · 机械校验项' },
    { name: '告警', key: 'alerts', fields: '告警号 · 源线索 · 级别 · 成立/撤销 · 签字人' },
    { name: '工单', key: 'tickets', fields: '工单号 · 类型 · 来源 · 承接班组 · 五格状态 · 客户系统镜像号' },
    { name: '调查案', key: 'investigations', fields: '案号 · 计量区 · 状态 · 观察窗 · 判据 · 核查工单' },
    { name: '班组', key: 'crews', fields: '班组号 · 名称 · 可接业务线 · 资质 · 装备 · 班次 · 负载' },
    { name: '热线上报', key: 'publicReports', fields: '受理号 · 来电渠道 · 类目 · 定位 · 回执 · 状态 · 合并标' },
    { name: '对账件', key: 'recon', fields: '对账号 · 关联工单 · 镜像号 · 我方状态 · 客户系统状态 · 裁定' }
  ];

  function objTypeTable() {
    var st = w.S.get();
    var rows = OBJ_TYPES.map(function (o) {
      var n = (st[o.key] || []).length;
      return '<tr><td><b>' + UI.esc(o.name) + '</b><div class="tiny mono">' + UI.esc(o.key) + '</div></td>' +
        '<td class="mono">' + n + '</td>' +
        '<td class="tiny">' + UI.esc(o.fields) + '</td></tr>';
    }).join('');
    return '<div class="tiny" style="margin-bottom:5px">实例数实算自当前世界状态,不是文档抄本。</div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th style="width:150px">类型</th><th style="width:80px">当前实例数</th><th>关键字段</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* 链接类型:demo 无图数据库,链接以外键字段承载 —— 这里把隐式外键显式枚举并实时计数 */
  var LINK_TYPES = [
    { name: '线索 → 设施', ends: '线索 · 设施', via: 'clue.facility', count: function (st) { return st.clues.filter(function (x) { return !!x.facility; }).length; } },
    { name: '告警 → 线索', ends: '告警 · 线索', via: 'alert.clueId', count: function (st) { return st.alerts.filter(function (x) { return !!x.clueId; }).length; } },
    { name: '工单 → 告警 / 线索', ends: '工单 · 线索', via: 'ticket.clueId', count: function (st) { return st.tickets.filter(function (x) { return !!x.clueId; }).length; } },
    { name: '调查案 → 计量区', ends: '调查案 · 计量区(DMA)', via: 'investigation.dma', count: function (st) { return st.investigations.filter(function (x) { return !!x.dma; }).length; } },
    { name: '热线上报 → 线索(去重合并)', ends: '热线上报 · 线索', via: 'publicReport.mergedInto', count: function (st) { return (st.publicReports || []).filter(function (x) { return !!x.mergedInto; }).length; } },
    { name: '对账件 → 工单', ends: '对账件 · 工单', via: 'recon.ticketId', count: function (st) { return (st.recon || []).filter(function (x) { return !!x.ticketId; }).length; } }
  ];

  function linkTypeTable() {
    var st = w.S.get();
    var rows = LINK_TYPES.map(function (l) {
      return '<tr><td><b>' + UI.esc(l.name) + '</b></td><td class="tiny">' + UI.esc(l.ends) + '</td>' +
        '<td class="tiny mono">' + UI.esc(l.via) + '</td><td class="mono">' + l.count(st) + '</td></tr>';
    }).join('');
    return '<div class="tiny" style="margin-bottom:5px">demo 无图数据库,链接以外键字段承载;承载字段与链接数实算自当前世界状态。</div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th style="width:220px">链接</th><th style="width:180px">端点类型</th><th style="width:180px">承载字段</th><th style="width:90px">当前链接数</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* 动作类型表 = 权限矩阵的本体形态:每个动作的执行角色白名单与自动/人工属性 */
  function actionTypeTable() {
    var defs = w.S.actionDefs();
    var human = defs.filter(function (d) { return !d.auto; });
    var auto = defs.filter(function (d) { return d.auto; });
    function row(d) {
      var who = d.actors.indexOf('*') >= 0 ? '任意已登录身份' : d.actors.join(' / ');
      return '<tr><td class="mono">' + UI.esc(d.action) + '</td>' +
        '<td><b>' + UI.esc(d.label) + '</b></td>' +
        '<td class="tiny">' + UI.esc(who) + '</td>' +
        '<td>' + (d.auto ? UI.badge('自动', 'amber') : UI.badge('人工', 'blue')) + '</td></tr>';
    }
    return '<div class="tiny" style="margin-bottom:5px">共 ' + defs.length + ' 类 · 人工 ' + human.length + ' · 自动 ' + auto.length +
      ';服务账号与人角色在同一张白名单上,自动动作不豁免审计。</div>' +
      '<div style="overflow-x:auto;max-height:340px"><table class="tb"><thead><tr>' +
      '<th style="width:180px">动作</th><th style="width:220px">显示名</th><th>执行角色白名单</th><th style="width:70px">执行方式</th>' +
      '</tr></thead><tbody>' + human.map(row).join('') + auto.map(row).join('') + '</tbody></table></div>';
  }

  /* 本体日志审计视图(R87 A6):筛选 / 搜索 / 分组 / 排序 / CSV 导出 / 行点跳对象 —— 组件在 UI.logAudit。
     导览「后端发生了什么」浮层仍用 UI.ontologyLog 精简渲染,两者共用同一份 actionLog。 */
  function ontologyLogBlock() {
    var all = w.S.get().actionLog;
    return '<div id="m6-ontology-log">' +
      UI.logAudit() +
      '<div class="tiny" style="margin-top:6px">动作日志保存 ' +
      UI.assume('≥3 年', '留存年限 = 假设值,按客户合规要求配置') + ' · 防篡改口径 = 可检测。</div></div>';
  }

  /* 靶单#7:四表各自折叠 —— 三张注册表默认收起(它们是查得到就行的底座),
     日志段默认展开(它是这一页真正要看的东西)。 */
  function ontoFold(key, title, sub, body, def) {
    var head = '<b style="font-size:13.5px">' + UI.esc(title) + '</b>' +
      '<span class="m6-gcnt">' + UI.esc(sub) + '</span>';
    return '<div class="card card-tight">' + fold('onto:' + key, head, body, def) + '</div>';
  }

  function ontologyBlock() {
    var st = w.S.get();
    var linkN = LINK_TYPES.reduce(function (a, l) { return a + l.count(st); }, 0);
    return '<div class="card card-tight" id="m6-ontology">' +
      '<div class="card-hd"><h3 style="margin:0;font-size:14px">本体建模</h3>' +
      '<span class="tiny">对象 · 链接 · 动作 三类注册表 + 全量动作日志(点标题展开)</span></div>' +
      '</div>' +
      ontoFold('obj', '对象类型', OBJ_TYPES.length + ' 类 · 实例数实算', objTypeTable(), false) +
      ontoFold('link', '链接类型', LINK_TYPES.length + ' 类 · 当前 ' + linkN + ' 条链接', linkTypeTable(), false) +
      ontoFold('act', '动作类型', w.S.actionDefs().length + ' 类 · 角色白名单', actionTypeTable(), false) +
      ontoFold('log', '本体日志 · 审计视图', '全量动作记录 ' + st.actionLog.length + ' 条', ontologyLogBlock(), true);
  }

  /* ================= 7 · 事件委托(DOM 每次整段替换,故绑一次在 document 上)================= */
  w.document.addEventListener('click', function (e) {
    if (!e.target) return;
    if (e.target.id === 'm6ParamPreviewBtn') {
      var out = w.document.getElementById('m6ParamPreviewOut');
      if (out) out.innerHTML = computeShadow();
    }
  });
  /* 视图每次整段替换后,把试算台按钮的 data-p / 灰态同步到当前选中项 */
  w.addEventListener('render', function () {
    if (w.document.getElementById('m6SimSubmit')) w.setTimeout(M6.simSync, 0);
  });

  var BODY = {
    roles: roleTable,
    rules: rulesBlock,
    lanes: function () { return laneTable() + fastlaneBlock(); },
    params: paramBlock,
    duty: dutyBlock,
    ontology: ontologyBlock
  };

  VIEWS.m6 = function (ctx) {
    var tab = resolveTab(ctx);
    return pageHead(tab) + tabBar(tab) + (BODY[tab] || BODY[DEF_TAB])();
  };
})(window);
