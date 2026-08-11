/* ===== 模块 m2 视图 · 告警与工单 · 归属 W1-B 工兵(施工图 §7/§8 裁定②:模块拆独立文件,文件互斥) =====
   契约:VIEWS.m2 = function(ctx) 返回 HTML 字符串;ctx={module,rest[],hash}
   共享文件(tokens/store/data/ui/app.html)只读;按钮用 data-action 属性走 UI.bindActions→S.commit

   规格来源:
   - 施工图 §7 m2 清单:告警列表 / 工单镜像(状态机五格)/ 对账异常队列 / 调度视图(班组负载+改派/合并/拆单)
   - 设计档 §2.3b 工单系统对接契约(状态机五格映射 / 对账裁决规则)
   - 设计档 §0.8.3(在途抢占)/ §0.8.5(调度职能与调度视图;撤回≠改派概念分立)
   - 设计档 §0.6(角色权限:复核主管=复核员权限+抽审/撤销;调度职能落在复核主管一位上,不新增调度员角色)
     R88 A1④ 角色三值(区复核员/复核主管/上级主管部门):原第四个身份值并入复核主管,夜间只是文案「复核主管(值班)」
   - R87 A5:工单卡信息补全(线路/设施/地点/事项一句话/状态/承办班组/SLA)· 全链跳转(线索/设施/班组)
     · 班组详情子路由 #/m2/crew/CR-xx · 工单镜像筛选条与分组折叠 · 告警状态筛选
     · 调度视图三件(班组位置地图 / 最近调度动作流 / 待裁定卡置顶 + 全局横幅)
   - R87 A2:挂起件恢复条件卡与两个出口(班组端 crew_resume 只读显示 / 复核主管(值班) resume_requeue 可点)
   - R87 A1:告警详情的误报申诉与误报裁定(并行复核窗过后的第三条纠错道)

   动态表单说明:ui.js 的 actionPanel/actionRow 只支持"渲染时已知的静态 params"(如 confirm/crew_accept)。
   本模块里改派/合并/拆单/撤销/申诉需要用户当场选择班组、理由码或填写文本,ui.js 未提供表单→按钮联动的通用机制,
   故在本文件内自建 window.M2 命名空间做"表单取值→更新按钮 data-p/disabled→仍由标准 data-act 走 S.commit"的桥接,
   不绕过 S.commit 这一唯一状态变更入口;筛选条/分组切换只改本模块视图态,不写 store。 */
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
  function val(id) { var el = document.getElementById(id); return el ? el.value : ''; }
  M2.syncRevoke = function (alertId) {
    M2.applyParams('revoke', 'm2-rv-btn-' + alertId,
      { alertId: alertId, reason: val('m2-rv-reason-' + alertId), evidence: val('m2-rv-evi-' + alertId) });
  };
  M2.syncAppeal = function (alertId) {
    M2.applyParams('misfire_appeal', 'm2-ap-btn-' + alertId,
      { alertId: alertId, reason: val('m2-ap-reason-' + alertId), note: val('m2-ap-note-' + alertId) });
  };
  M2.syncRuling = function (alertId) {
    M2.applyParams('misfire_ruling', 'm2-rl-yes-' + alertId,
      { alertId: alertId, upheld: true, code: val('m2-rl-code-' + alertId), note: val('m2-rl-note-' + alertId) });
    M2.applyParams('misfire_ruling', 'm2-rl-no-' + alertId,
      { alertId: alertId, upheld: false, note: val('m2-rl-note-' + alertId) });
  };
  M2.syncDispatch = function (tid) {
    M2.applyParams('dispatch_manual', 'm2-dp-btn-' + tid,
      { ticketId: tid, crew: val('m2-dp-crew-' + tid), reason: val('m2-dp-reason-' + tid) });
  };
  M2.syncSplit = function (tid) {
    M2.applyParams('split', 'm2-sp-btn-' + tid, { ticketId: tid, reason: val('m2-sp-reason-' + tid) });
  };
  M2.syncMerge = function () {
    var boxes = document.querySelectorAll('.m2-mg-chk:checked');
    var ids = Array.prototype.map.call(boxes, function (b) { return b.value; });
    M2.applyParams('merge', 'm2-mg-btn', { ticketIds: ids, reason: val('m2-mg-reason') });
  };
  M2.syncRequeue = function (tid) {
    M2.applyParams('resume_requeue', 'm2-rq-btn-' + tid, { ticketId: tid, reason: val('m2-rq-reason-' + tid) });
  };
  window.M2 = M2;

  /* ---------------- 视图态(只在本模块内存里,不写 store;改后重绘并保持滚动位置)---------------- */
  /* R88 布局靶单①⑥ + A5⑦ 新增视图态:
     rulingOpen = 待裁定横条是否展开(默认收成一行)· seg = 调度视图两段的开合(总览默认开、操作台默认收)
     done = 工单镜像各分组「已完结(已完工/已验收)」紧凑行是否展开(默认收) */
  /* R89 A4⑦ 追加 sub:操作台段内三个子折叠(班组负载 / 改派与合并拆单 / 抢占与挂起记录),
     各自默认收 —— 段一打开不再是三块内容一摊到底,组头带计数,想动哪块开哪块。 */
  var VS = {
    line: '', state: '', crew: '', group: 'line', open: {}, alStatus: '',
    rulingOpen: false, seg: { ov: true, ops: false }, sub: { load: false, disp: false, pre: false }, done: {}
  };
  var FOLD = 5;
  var DONE_STATES = ['已完工', '已验收'];
  function isDone(t) { return !t.suspended && DONE_STATES.indexOf(t.state) >= 0; }
  function rerender() {
    var y = window.scrollY || 0;
    try { window.dispatchEvent(new CustomEvent('render', { detail: { ui: 'm2' } })); }
    catch (e) {
      var ev = document.createEvent('Event'); ev.initEvent('render', false, false); window.dispatchEvent(ev);
    }
    try { window.scrollTo(0, y); } catch (e2) { /* noop */ }
  }
  M2.setF = function (k, v) { VS[k] = v; rerender(); };
  M2.setGroup = function (g) { VS.group = g; rerender(); };
  M2.toggleOpen = function (k) { VS.open[k] = !VS.open[k]; rerender(); };
  M2.toggleDone = function (k) { VS.done[k] = !VS.done[k]; rerender(); };
  M2.toggleRuling = function () { VS.rulingOpen = !VS.rulingOpen; rerender(); };
  M2.toggleSeg = function (k) { VS.seg[k] = !VS.seg[k]; rerender(); };
  M2.toggleSub = function (k) { VS.sub[k] = !VS.sub[k]; rerender(); };
  M2.jump = function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
  };
  /* 待裁定卡的备选动作要跳到改派表 —— 表在「操作台」段里,段可能是收着的:先展开再跳 */
  M2.openOps = function (id) {
    /* 改派表现在收在「改派与合并拆单」子段里:段与子段都得先开,否则跳过去是一片收着的头 */
    if (!VS.seg.ops || !VS.sub.disp) { VS.seg.ops = true; VS.sub.disp = true; rerender(); }
    window.setTimeout(function () { M2.jump(id || 'm2-dispatch-table'); }, 0);
  };

  /* ---------------- 本模块布局样式(R88 布局靶单①⑥ + A5⑦;页级注入,不动 tokens.css / ui.js 他人分区) ---------------- */
  (function injectM2Css() {
    if (!document || document.getElementById('origen-m2-css')) return;
    var css = [
      /* 待裁定醒目横条(地图上方,默认收成一行) */
      '.m2-strip{border:1px solid #e6bfb8;border-left:4px solid #c0392b;background:#fdf3f1;border-radius:8px;margin-bottom:10px}',
      '.m2-strip-hd{display:flex;align-items:center;gap:8px;width:100%;background:transparent;border:0;',
      'font-family:inherit;font-size:13px;color:#8d2f22;padding:9px 12px;cursor:pointer;text-align:left}',
      '.m2-strip-hd:hover{background:#fbe9e5}',
      /* R89 ⑦:收合条右侧的一键采纳(与展开按钮同一行,不必先展开) */
      '.m2-strip-row{display:flex;align-items:center;gap:8px;padding-right:10px}',
      '.m2-strip-row>.m2-strip-hd{flex:1 1 auto;min-width:0}',
      '.m2-strip-act{flex:none;display:flex;align-items:center;gap:6px}',
      '.m2-strip-act .act-why{font-size:11px;color:#a4685c;max-width:190px}',
      '@media (max-width:760px){.m2-strip-row{flex-wrap:wrap;padding-bottom:8px}',
      '.m2-strip-act{padding-left:12px}}',
      '.m2-strip-ico{flex:none;width:17px;height:17px;line-height:17px;text-align:center;border-radius:50%;',
      'background:#c0392b;color:#fff;font-size:11px;font-weight:700}',
      '.m2-strip-t{flex:1 1 auto;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.m2-strip-n{flex:none;font-size:11.5px;color:#a4685c;font-weight:400}',
      '.m2-strip-body{padding:0 10px 10px}',
      /* 调度视图分段(总览 / 操作台) */
      '.m2-seg{display:flex;align-items:center;gap:8px;width:100%;background:#f7f9f5;border:1px solid var(--line,#e4e7e2);',
      'border-radius:8px;font-family:inherit;font-size:13px;color:var(--ink,#1b231f);padding:8px 12px;cursor:pointer;',
      'text-align:left;margin:12px 0 8px}',
      '.m2-seg:hover{border-color:#1a5fb4}',
      '.m2-seg-cev{flex:none;color:#7b8794;font-size:11px}',
      '.m2-seg-t{font-weight:700}',
      '.m2-seg-d{flex:1 1 auto;font-size:11.5px;color:var(--faint,#8e968f);font-weight:400}',
      '.m2-seg-n{flex:none;font-size:11.5px;color:var(--faint,#8e968f)}',
      /* 操作台内部子折叠(比段头轻一级:无底色、左侧一道竖线) */
      '.m2-sub{display:flex;align-items:center;gap:8px;width:100%;background:#fff;border:1px solid var(--line,#e4e7e2);',
      'border-left:3px solid #7b8794;border-radius:6px;font-family:inherit;font-size:12.5px;color:var(--ink,#1b231f);',
      'padding:7px 11px;cursor:pointer;text-align:left;margin:10px 0 6px}',
      '.m2-sub:hover{border-color:#1a5fb4;border-left-color:#1a5fb4}',
      '.m2-sub-t{font-weight:600}',
      /* 工单镜像:已完结紧凑行 */
      '.m2-done{display:flex;flex-direction:column;gap:0;border:1px solid var(--line,#e4e7e2);border-radius:8px;',
      'background:#fbfcfa;margin:4px 0 2px;overflow:hidden}',
      '.m2-done-row{display:flex;align-items:center;gap:10px;padding:5px 10px;font-size:12.5px;border-top:1px solid #eef1ec}',
      '.m2-done-row:first-child{border-top:0}',
      '.m2-done-id{flex:none;width:82px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
      '.m2-done-s{flex:1 1 auto;color:var(--mute,#5c6660);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '.m2-done-st{flex:none}'
    ].join('');
    var s = document.createElement('style');
    s.id = 'origen-m2-css';
    s.textContent = css;
    (document.head || document.documentElement).appendChild(s);
  })();

  /* ---------------- 小工具 ---------------- */
  function sourceBadge(src) {
    if (!src) return '';
    var tone = src.indexOf('①') === 0 ? 'amber' : (src.indexOf('②') === 0 ? 'blue' : 'grey');
    return UI.badge(src, tone);
  }
  function lineBadge(line) {
    if (!line) return '';
    var c = UI.lineColor(line);
    return '<span class="badge" style="background:#fff;color:' + c + ';border:1px solid ' + c + '">' + UI.esc(line) + '线</span>';
  }
  function facLink(fid) {
    if (!fid) return '<span class="faint">—</span>';
    var f = S.find.facility(fid);
    var href = (S.route && S.route('facility', fid)) || ('#/m3/facility/' + fid);
    return '<a href="' + UI.esc(href) + '">' + UI.esc(fid) + '</a>' +
      (f ? ' <span class="faint">· ' + UI.esc(f.block) + ' · Al Ain</span>' : '');
  }
  function crewLink(crewId) {
    if (!crewId) return '<span class="faint">待派</span>';
    var cw = S.find.crew(crewId);
    return '<a href="#/m2/crew/' + UI.esc(crewId) + '">' + UI.esc(cw ? cw.name : crewId) + '</a>';
  }
  function clueLink(cid) {
    if (!cid) return '<span class="faint">—</span>';
    var href = (S.route && S.route('clue', cid)) || ('#/m1/clue/' + cid);
    return '<a href="' + UI.esc(href) + '">' + UI.esc(cid) + '</a>';
  }
  function ticketLink(tid) {
    if (!tid) return '<span class="faint">—</span>';
    return '<a href="#/m2/tickets/' + UI.esc(tid) + '">' + UI.esc(tid) + '</a>';
  }
  /* R89 A3 · 「关联对象」区的实链列表:kv 那几行是这张卡自己的外键字段,
     下面这张表是 S.linksOf(objId) —— 动作日志里所有连到这个对象的链接实例,含它是被谁连过来的那一端。 */
  function anyLink(id) {
    if (!id) return '<span class="faint">—</span>';
    if (/^CL-/.test(id)) return clueLink(id);
    if (/^WO-/.test(id)) return ticketLink(id);
    if (/^AL-/.test(id)) return '<a href="#/m2/alerts/' + UI.esc(id) + '">' + UI.esc(id) + '</a>';
    if (/^CR-/.test(id)) return crewLink(id);
    var kind = /^(MH|RD|PL|GR)-\d/.test(id) ? 'facility'
      : (/^RC-/.test(id) ? 'recon' : (/^IV-/.test(id) ? 'case' : null));
    var h = kind && S.route && S.route(kind, id);
    if (h) return '<a href="' + UI.esc(h) + '">' + UI.esc(id) + '</a>';
    /* 认不出的端点(角色名 / 类目 / 规则号 / 管段 / 传感器)按纯文本 —— 不造没有落点的链接 */
    return '<span class="mono">' + UI.esc(id) + '</span>';
  }
  function linkList(objId) {
    var ls = (S.linksOf && S.linksOf(objId)) || [];
    if (!ls.length) return '<div class="tiny faint">本对象当前无链接实例。</div>';
    var rows = ls.map(function (ln) {
      var def = S.ACTIONS[ln.action] || {};
      return '<tr><td class="tiny">' + UI.esc(ln.type) + '</td>' +
        '<td>' + anyLink(ln.fromId) + ' <span class="faint">↦</span> ' + anyLink(ln.toId) + '</td>' +
        '<td class="tiny">' + UI.esc(def.label || ln.action) + '</td>' +
        '<td class="tiny mono">' + UI.esc(ln.t || '') + '</td></tr>';
    }).join('');
    return '<div class="tiny" style="margin-bottom:4px">链接实例 ' + ls.length +
      ' 条 · 全量与筛选见系统管理 · 本体日志审计</div>' +
      '<div style="overflow-x:auto;max-height:260px"><table class="tb"><thead><tr>' +
      '<th style="width:130px">链接类型</th><th>两端(可点)</th><th style="width:140px">产生动作</th><th style="width:56px">时刻</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  // 状态机五格进度(施工图 §7 m2);非五格内状态(例外分支)单独标注
  function progressLine(t) {
    var idx = TICKET_STATES.indexOf(t.state);
    var seq = TICKET_STATES.map(function (s, i) {
      var tone = idx < 0 ? 'grey' : (i < idx ? 'green' : (i === idx ? 'blue' : 'grey'));
      return UI.badge(s, tone);
    }).join(' ');
    var extra = '';
    if (idx < 0) extra += ' ' + UI.badge(t.state, 'red');
    if (t.suspended) extra += ' ' + UI.badge('挂起' + (t.suspendReason ? '·' + t.suspendReason : ''), 'amber');
    if (t.recalled) extra += ' ' + UI.badge('已召回', 'amber');
    return seq + extra;
  }
  /* R89 A4② · 徽章去重:卡上的徽章先摆成 {kind,text,html} 再过 UI.dedupeBadges —— 通道名与来源名
     重叠时只留通道(来源本就在卡脚详情行)、级别词与类型词重叠时只显一次。函数未就绪则原样渲染。 */
  function badgeRow(items) {
    var list = (items || []).filter(function (b) { return b && b.text; });
    if (UI.dedupeBadges) list = UI.dedupeBadges(list) || list;
    return list.map(function (b) { return b.html; }).join(' ');
  }
  function ticketBadges(t) {
    var idx = TICKET_STATES.indexOf(t.state);
    var tone = idx < 0 ? 'red' : (idx === TICKET_STATES.length - 1 ? 'green' : 'blue');
    var out = [{ kind: 'state', text: t.state, html: UI.badge(t.state, tone) }];
    if (t.suspended) out.push({ kind: 'state', text: '挂起', html: UI.badge('挂起', 'amber') });
    if (t.grade === '灰档') out.push({ kind: 'grade', text: '灰档', html: UI.badge('灰档', 'grey') });
    if (t.kpiExempt) out.push({ kind: 'kpi', text: '白跑不计考核', html: UI.badge('白跑不计考核', 'grey') });
    /* R88 A2:超时兜底自动派的单要一眼看出来源 —— 定性仍悬,复核员事后补审。
       它与卡脚「来源 ④ 超时兜底派」说的是同一件事:按 A4② 的规则留通道徽章,来源留在详情行(卡脚),
       两处不各挂一枚 —— 所以这里不把 t.source 也做成徽章。 */
    if (t.overdueFallback) out.push({ kind: 'lane', text: '超时兜底派单', html: UI.badge('超时兜底派单', 'amber') });
    return out;
  }
  function stateBadge(t) { return badgeRow(ticketBadges(t)); }
  var AL_TONE = { '成立': 'green', '申诉复核中': 'amber', '误报撤销': 'grey', '已撤销': 'grey' };
  function alertStatusBadge(st) { return UI.badge(st || '成立', AL_TONE[st] || 'grey'); }
  function selOpts(list, cur) {
    return list.map(function (o) {
      var v = typeof o === 'string' ? o : o.v, t = typeof o === 'string' ? o : o.t;
      return '<option value="' + UI.esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + UI.esc(t) + '</option>';
    }).join('');
  }

  /* ---------------- Tab 路由(#/m2/<tab>/<id>;#/m2/crew/<crewId> 为班组详情子路由)---------------- */
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
    return '<div class="row" style="align-items:center;gap:8px">' +
      '<div class="tabs grow">' + TABS.map(function (t) {
        return '<a href="#/m2/' + t.id + '" class="' + (t.id === cur ? 'is-on' : '') + '">' + UI.esc(t.label) + '</a>';
      }).join('') + '</div>' + UI.helpBtn('m2') + '</div>';
  }

  /* ============ 帮助浮层内容(R86 A4 / R87:组件内只留生产文案,说明全在这里)============ */
  (window.HELP = window.HELP || {}).m2 = {
    title: '告警与工单 · 本模块职责',
    body:
      '<p><b>这一页干什么:</b>看成立告警、看工单在客户系统里走到哪一格、处理两边状态不一致、以及调度班组(改派 / 合并 / 拆单 / 抢占)。</p>' +
      '<p><b>告警列表范围:</b>只列复核员确认后成立(以及申诉复核中 / 已撤销 / 误报撤销)的告警;未确认的对象在复核工作台的线索队列。</p>' +
      '<p><b>与客户系统的关系:</b>处置的记录系统是区市政工单系统 —— 本模块的工单是<b>只读镜像 + 写回动作</b>:派工、改派、挂起等动作写回客户系统,状态回读展示;巡检定性(线索 / 告警)的记录系统才是本平台。</p>' +
      '<p><b>对账裁决:</b>处置状态以客户系统为准,巡检定性以我方为准;不一致进对账异常队列,由主管在时限内人工裁定,裁定动作入日志。</p>' +
      '<p><b>撤回 ≠ 改派:</b>撤回 = 事件不成立(线索转驳回流,召回班组);改派 = 事件成立但派错了承接方(单子换人,事件不动)。两者都是显名动作,理由码入日志。</p>' +
      '<p><b>误报申诉:</b>并行复核窗过后仍可提「判定异常申诉」,由复核主管裁定;裁定成立则告警置「误报撤销」,记录保留、班组白跑不计考核、原因回流规则引擎、该设施开传感器复检工单。</p>' +
      '<p><b>不新增调度员角色:</b>调度职能(常规改派与抢占仲裁)都落在复核主管一位上;撤回 / 改派 / 合并 / 拆单均为显名动作,理由码入动作日志。</p>' +
      '<p><b>超时兜底派单:</b>加急人工件人工确认档到期、三级升级走完仍无人给结论 —— 系统先把单发出去(工单标「超时兜底派单」来源徽章),告警仍未成立、定性仍悬,复核员事后补审,件全量拘抽审。宁可多看一眼,不漏掉。</p>' +
      '<p><b>抢占调度三步:</b>承接池无空闲班组时 —— ① 在办件让位 ② 跨班组借调 ③ 复核主管(值班)裁定;前两步的结果连同建议方案与后果由 <b>AI 服务</b>算好一起交到复核主管手上(卡上标「AI 服务 · 建议」),人只做一键采纳或改派。挂起使 SLA 停表,恢复条件解除后回队重派。</p>' +
      '<p><b>挂起件两个出口:</b>班组端「条件解除,恢复作业」(班组账号在手机端发起)/ 复核主管(值班)「强制回队重派」(不等条件解除,收回工单重新指派)。</p>'
  };

  /* ---------------- ① 告警列表 ---------------- */
  function alertRow(al, curId) {
    var c = S.find.clue(al.clueId);
    return '<tr class="' + (al.id === curId ? 'is-sel' : '') + '">' +
      '<td>' + UI.levelBadge(al.level) + ' <a href="#/m2/alerts/' + UI.esc(al.id) + '">' + UI.esc(al.id) + '</a></td>' +
      '<td>' + facLink(al.facility) + '</td>' +
      '<td>' + lineBadge(al.line) + '</td>' +
      '<td>' + alertStatusBadge(al.status) + '</td>' +
      '<td>' + UI.esc(al.t) + ' · ' + UI.esc(al.by) + '</td>' +
      '<td>' + (c && c.ticketId ? ticketLink(c.ticketId) : '<span class="faint">—</span>') + '</td>' +
      '</tr>';
  }
  function appealBlock(al) {
    var reasons = S.dict().reasonCodes.misfire;
    var p0 = { alertId: al.id, reason: '', note: '' };
    var chk = S.check('misfire_appeal', p0);
    return UI.secTitle('误报申诉(复核窗过后的纠错道;交主管裁定)', 'alert') +
      '<label class="fl" for="m2-ap-reason-' + al.id + '">申诉理由码</label>' +
      '<select id="m2-ap-reason-' + al.id + '" onchange="M2.syncAppeal(\'' + al.id + '\')">' +
      '<option value="">选择理由码…</option>' + selOpts(reasons, '') + '</select>' +
      '<label class="fl" for="m2-ap-note-' + al.id + '">补充说明</label>' +
      '<input type="text" id="m2-ap-note-' + al.id + '" placeholder="现场核实结论 / 传感器读数记录号" oninput="M2.syncAppeal(\'' + al.id + '\')">' +
      '<div class="act-item" style="margin-top:8px">' +
      '<button type="button" class="btn' + (chk.ok ? '' : ' is-off') + '" id="m2-ap-btn-' + al.id +
      '" data-act="misfire_appeal" data-p="' + UI.attr(p0) + '"' + (chk.ok ? '' : ' disabled') + '>提交误报申诉</button>' +
      '<span class="act-why" id="m2-ap-btn-' + al.id + '-why">' + (chk.ok ? '' : '未满足:' + UI.esc(chk.reason)) + '</span>' +
      '</div>';
  }
  function rulingBlock(al) {
    var codes = DATA.dict.rejectCodes.map(function (r) { return { v: r.code, t: r.code + ' ' + r.name }; });
    var pYes = { alertId: al.id, upheld: true, code: '', note: '' };
    var pNo = { alertId: al.id, upheld: false, note: '' };
    var cY = S.check('misfire_ruling', pYes), cN = S.check('misfire_ruling', pNo);
    return UI.secTitle('误报裁定(复核主管)', 'alert') +
      '<div class="small">申诉人 ' + UI.esc((al.appeal || {}).by || '') + ' · ' + UI.esc((al.appeal || {}).t || '') +
      ' · 理由「' + UI.esc((al.appeal || {}).reason || '') + '」' +
      ((al.appeal || {}).note ? ' · ' + UI.esc(al.appeal.note) : '') + '</div>' +
      '<label class="fl" for="m2-rl-code-' + al.id + '">回流原因码(申诉成立时用)</label>' +
      '<select id="m2-rl-code-' + al.id + '" onchange="M2.syncRuling(\'' + al.id + '\')">' +
      selOpts(codes, '④') + '</select>' +
      '<label class="fl" for="m2-rl-note-' + al.id + '">裁定说明</label>' +
      '<input type="text" id="m2-rl-note-' + al.id + '" placeholder="裁定依据" oninput="M2.syncRuling(\'' + al.id + '\')">' +
      '<div class="act-panel" style="margin-top:8px">' +
      '<div class="act-item"><button type="button" class="btn btn-danger' + (cY.ok ? '' : ' is-off') + '" id="m2-rl-yes-' + al.id +
      '" data-act="misfire_ruling" data-p="' + UI.attr({ alertId: al.id, upheld: true, code: '④', note: '' }) + '"' + (cY.ok ? '' : ' disabled') +
      '>申诉成立 · 告警置误报撤销</button>' +
      '<span class="act-why" id="m2-rl-yes-' + al.id + '-why">' + (cY.ok ? '' : '未满足:' + UI.esc(cY.reason)) + '</span></div>' +
      '<div class="act-item"><button type="button" class="btn' + (cN.ok ? '' : ' is-off') + '" id="m2-rl-no-' + al.id +
      '" data-act="misfire_ruling" data-p="' + UI.attr(pNo) + '"' + (cN.ok ? '' : ' disabled') + '>申诉不成立 · 维持成立</button>' +
      '<span class="act-why" id="m2-rl-no-' + al.id + '-why">' + (cN.ok ? '' : '未满足:' + UI.esc(cN.reason)) + '</span></div>' +
      '</div>';
  }
  function alertDetail(al) {
    var c = S.find.clue(al.clueId);
    var tk = c && c.ticketId ? S.find.ticket(c.ticketId) : null;
    var html = '<div' + UI.cardAttrs('alert') + '>' +
      '<div class="card-hd"><h3>告警 ' + UI.esc(al.id) + '</h3>' + UI.cardTag('alert') + ' ' +
      UI.levelBadge(al.level) + ' ' + alertStatusBadge(al.status) +
      '</div>' +
      UI.kv([
        ['设施', facLink(al.facility), true],
        ['业务线', lineBadge(al.line), true],
        ['确认人', al.by],
        ['确认时间', al.t],
        ['源线索', clueLink(al.clueId), true],
        ['关联工单', tk ? (ticketLink(tk.id) + ' <span class="faint">· ' + UI.esc(tk.summary || '') + '</span>') : '—', true]
      ]) +
      '<div class="sep"></div>' + UI.secTitle('链接实例', 'alert') + linkList(al.id);
    if (al.status === '已撤销') {
      html += '<div class="sep"></div>' + UI.banner('warn',
        '已撤销:理由「' + UI.esc(al.revokeReason || '') + '」· ' + UI.esc(al.revokeT || '') + ' —— 记录不删除,状态置「已撤销」。');
    } else if (al.status === '误报撤销') {
      html += '<div class="sep"></div>' + UI.banner('warn',
        '误报撤销:裁定人 ' + UI.esc((al.ruling || {}).by || '') + ' · ' + UI.esc(al.voidT || '') +
        ' · 申诉理由「' + UI.esc((al.appeal || {}).reason || '') + '」;记录保留。');
    } else if (al.status === '申诉复核中') {
      html += '<div class="sep"></div>' + rulingBlock(al);
    } else {
      var reasonId = 'm2-rv-reason-' + al.id, eviId = 'm2-rv-evi-' + al.id, btnId = 'm2-rv-btn-' + al.id;
      var initP = { alertId: al.id, reason: '', evidence: '' };
      var chk = S.check('revoke', initP);
      html += '<div class="sep"></div>' +
        UI.secTitle('撤销告警(需主管权限;告警→撤销,不删除记录)', 'alert') +
        '<label class="fl" for="' + reasonId + '">撤销理由</label>' +
        '<input type="text" id="' + reasonId + '" placeholder="如:复核后确认为误判 / 现场复查无异常" oninput="M2.syncRevoke(\'' + al.id + '\')">' +
        '<label class="fl" for="' + eviId + '">附证据说明</label>' +
        '<input type="text" id="' + eviId + '" placeholder="如:二次巡查记录编号 / 现场核实结论" oninput="M2.syncRevoke(\'' + al.id + '\')">' +
        '<div class="act-item" style="margin-top:8px">' +
        '<button type="button" class="btn btn-danger' + (chk.ok ? '' : ' is-off') + '" id="' + btnId + '" data-act="revoke" data-p="' + UI.attr(initP) + '"' + (chk.ok ? '' : ' disabled') + '>撤销告警</button>' +
        '<span class="act-why" id="' + btnId + '-why">' + (chk.ok ? '' : '未满足:' + UI.esc(chk.reason)) + '</span>' +
        '</div>' +
        '<div class="sep"></div>' + appealBlock(al);
    }
    html += '</div>';
    return html;
  }
  function renderAlerts(curId) {
    var all = S.get().alerts.slice().reverse();
    var states = S.dict().alertStates || [];
    var list = VS.alStatus ? all.filter(function (a) { return (a.status || '成立') === VS.alStatus; }) : all;
    var bar = UI.filterBar([
      {
        label: '状态', value: VS.alStatus, on: "M2.setF('alStatus',this.value)",
        options: [{ v: '', t: '全部 ' + all.length }].concat(states.map(function (s) {
          return { v: s, t: s + ' ' + all.filter(function (a) { return (a.status || '成立') === s; }).length };
        }))
      }
    ], { right: '<span class="flt-n">当前 ' + list.length + ' / ' + all.length + ' 条</span>' });
    var table = list.length
      ? '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>告警号</th><th>设施 · 地点</th><th>业务线</th><th>状态</th><th>确认</th><th>关联工单</th></tr></thead><tbody>' +
        list.map(function (al) { return alertRow(al, curId); }).join('') + '</tbody></table></div>'
      : '<div class="tiny">当前筛选条件下无告警。</div>';
    var detail = '';
    if (curId) {
      var al = S.find.alert(curId);
      if (al) detail = '<div class="sep"></div>' + alertDetail(al);
    }
    return bar + table + detail;
  }

  /* ---------------- ② 工单镜像(卡信息补全 + 筛选条 + 分组折叠 + 工单详情)---------------- */
  function ticketCard(t) {
    var f = S.find.facility(t.facility);
    var sla = t.sla || {};
    return '<div' + UI.cardAttrs('ticket', { cls: 'card card-tight', line: t.line }) + ' id="tk-' + UI.esc(t.id) + '">' +
      '<div class="card-hd"><b class="oc-t1"><a href="#/m2/tickets/' + UI.esc(t.id) + '">' +
      UI.esc(t.summary || S.ticketSummary(t)) + '</a></b>' +
      '<span class="row" style="gap:6px;align-items:center">' + badgeRow([
        { kind: 'line', text: t.line, html: lineBadge(t.line) },
        { kind: 'type', text: t.type, html: UI.cardTag('ticket', t.type) }
      ]) + '</span></div>' +
      '<div class="small muted">' + facLink(t.facility) + (f ? ' · ' + UI.esc(f.kind) : '') + '</div>' +
      '<div style="margin:6px 0">' + stateBadge(t) + ' <span class="faint">·</span> 承办:' + crewLink(t.crew) + '</div>' +
      '<div style="margin:6px 0">' + progressLine(t) + '</div>' +
      UI.kv([
        ['接单 SLA', UI.sla(sla.accept), true],
        ['到场 SLA', UI.sla(sla.arrive), true],
        ['完工 SLA', UI.sla(sla.done), true],
        ['复验', t.verify || '—']
      ]) +
      (t.suspended && t.resumeCond
        ? '<div class="tiny">恢复条件:' + UI.esc(t.resumeCond.cond) + ' · ' + UI.esc(t.resumeCond.owner) +
          ' · 预计 ' + UI.esc(t.resumeCond.eta) + '</div>'
        : '') +
      (t.note ? '<div class="tiny">' + UI.esc(t.note) + '</div>' : '') +
      '<div class="oc-t3" style="margin-top:6px">工单 ' + ticketLink(t.id) + ' · 镜像 ' + UI.esc(t.mirror || '—') +
      ' · 来源 ' + UI.esc(t.source || '—') + ' · 线索 ' + clueLink(t.clueId) + '</div>' +
      '</div>';
  }

  /* T0 种子日志没有 label 字段,直接渲染会漏出动作机器名 —— 渲染前按动作表补中文名(只补副本,不改 store) */
  function withLabel(list) {
    return list.map(function (g) {
      if (g.label) return g;
      var def = S.ACTIONS[g.action] || {};
      var c = {}; for (var k in g) if (Object.prototype.hasOwnProperty.call(g, k)) c[k] = g[k];
      c.label = def.label || g.action;
      return c;
    });
  }
  function ticketLogs(t) {
    return S.get().actionLog.filter(function (g) {
      var p = g.params || {};
      if (p.ticketId === t.id) return true;
      if (p.ticketIds && p.ticketIds.indexOf(t.id) >= 0) return true;
      if (t.clueId && (p.clueId === t.clueId || (p.clueIds && p.clueIds.indexOf(t.clueId) >= 0))) return true;
      if (g.sum && g.sum.indexOf(t.id) >= 0) return true;
      return false;
    });
  }
  /* 挂起工单的恢复条件卡:原因 / 条件 / 责任方 / 预计 + 两个出口 */
  function resumeCard(t) {
    var rc = t.resumeCond;
    if (!t.suspended || !rc) return '';
    var pRq = { ticketId: t.id, reason: '' };
    var cRq = S.check('resume_requeue', pRq);
    return '<div' + UI.cardAttrs('ticket', { cls: 'card', color: '#9a6b00' }) + '>' +
      '<div class="card-hd"><h3>挂起中 · 恢复条件</h3>' + UI.badge('SLA 停表', 'amber') + '</div>' +
      UI.kv([
        ['挂起原因', rc.reason || t.suspendReason || '—'],
        ['挂起时刻', t.suspendT || '—'],
        ['恢复条件', rc.cond],
        ['责任方', rc.owner],
        ['预计恢复', rc.eta]
      ]) +
      '<div class="sep"></div>' +
      UI.secTitle('两个出口', 'ticket') +
      '<div class="act-panel">' +
      '<div class="act-item">' +
      '<button type="button" class="btn is-off" disabled>' + UI.esc(S.ACTIONS.crew_resume.label) + '</button>' +
      '<span class="act-why">班组端(手机)发起,本页只读显示</span></div>' +
      '<div class="act-item">' +
      '<input type="text" id="m2-rq-reason-' + UI.esc(t.id) + '" placeholder="回队理由(可选)" oninput="M2.syncRequeue(\'' + UI.esc(t.id) + '\')" style="width:180px;display:inline-block;margin-right:6px">' +
      '<button type="button" class="btn btn-primary' + (cRq.ok ? '' : ' is-off') + '" id="m2-rq-btn-' + UI.esc(t.id) +
      '" data-act="resume_requeue" data-p="' + UI.attr(pRq) + '"' + (cRq.ok ? '' : ' disabled') + '>强制回队重派</button>' +
      '<span class="act-why" id="m2-rq-btn-' + UI.esc(t.id) + '-why">' + (cRq.ok ? '' : '未满足:' + UI.esc(cRq.reason)) + '</span>' +
      '</div></div>' +
      '</div>';
  }
  function ticketDetail(tid) {
    var t = S.find.ticket(tid);
    if (!t) return '<div class="tiny">未找到工单 ' + UI.esc(tid) + '。</div>';
    var c = t.clueId ? S.find.clue(t.clueId) : null;
    var al = c && c.alertId ? S.find.alert(c.alertId) : null;
    var photos = (t.photos || []).map(function (p) { return UI.evidenceCard(p, UI.esc(p.phase) + ' · ' + UI.esc(p.t)); }).join('');
    var links = '<div class="card card-tight">' + UI.secTitle('关联对象', 'ticket') +
      UI.kv([
        ['源线索', clueLink(t.clueId) + (c ? ' <span class="faint">· ' + UI.esc(c.kindText || '') + '</span>' : ''), true],
        ['关联告警', al ? ('<a href="#/m2/alerts/' + UI.esc(al.id) + '">' + UI.esc(al.id) + '</a> ' + alertStatusBadge(al.status)) : '—', true],
        ['设施', facLink(t.facility), true],
        ['承办班组', crewLink(t.crew), true],
        ['客户系统镜像号', t.mirror || '—'],
        ['派单来源', UI.esc(t.source || '—') +
          (t.overdueFallback ? ' ' + UI.badge('超时兜底派单', 'amber') +
            ' <span class="tiny">加急人工档到期无人给结论,系统先派;告警未成立、定性仍悬,复核员事后补审</span>' : ''), true],
        ['灰档说明', t.greyNote || '']
      ]) +
      '<div class="sep"></div>' + UI.secTitle('链接实例', 'ticket') + linkList(t.id) + '</div>';
    var hist = (t.resumeHistory || []).map(function (h) {
      return '<li>' + UI.esc(h.t) + ' · ' + UI.esc(h.way) + ' · ' + UI.esc(h.by) +
        ' · 条件「' + UI.esc(h.cond) + '」' + (h.stopMin ? ' · 停表 ' + h.stopMin + ' 分钟' : '') + '</li>';
    }).join('');
    var histBlock = hist ? '<div class="card card-tight">' + UI.secTitle('挂起 / 恢复记录', 'ticket') +
      '<ul class="tiny" style="margin:6px 0 0 16px">' + hist + '</ul></div>' : '';
    return '<div class="row" style="gap:8px;align-items:center;margin-bottom:8px">' +
      '<a class="btn btn-sm" href="#/m2/tickets">← 返回工单镜像</a>' +
      '<span class="tiny">工单 ' + UI.esc(t.id) + ' · 镜像 ' + UI.esc(t.mirror || '—') + '</span></div>' +
      ticketCard(t) +
      (photos ? '<div class="card card-tight">' + UI.secTitle('现场回传件', 'ticket') + UI.evInset('<div class="ev-grid">' + photos + '</div>') + '</div>' : '') +
      resumeCard(t) +
      histBlock +
      links +
      '<div class="card card-tight">' + UI.secTitle('处置记录时间线(时刻 · 账号 · 动作)', 'ticket') +
      UI.timeline(withLabel(ticketLogs(t))) + '</div>';
  }

  function groupKeyOf(t) {
    if (VS.group === 'state') return t.suspended ? '挂起中' : (t.state || '—');
    if (VS.group === 'crew') return t.crew ? UI.crewName(t.crew) : '待派';
    return t.line || '未分线';
  }
  var LINE_ORDER = ['井盖', '路面', '管网'];
  function groupOrder(keys) {
    if (VS.group === 'line') {
      return keys.slice().sort(function (a, b) {
        var ia = LINE_ORDER.indexOf(a), ib = LINE_ORDER.indexOf(b);
        return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
      });
    }
    if (VS.group === 'state') {
      return keys.slice().sort(function (a, b) {
        var ia = TICKET_STATES.indexOf(a), ib = TICKET_STATES.indexOf(b);
        return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib);
      });
    }
    return keys.slice().sort(function (a, b) { return a === '待派' ? -1 : (b === '待派' ? 1 : (a < b ? -1 : 1)); });
  }
  function groupColor(key) {
    if (VS.group === 'line') return UI.lineColor(key);
    if (VS.group === 'state') return key === '挂起中' ? '#9a6b00' : '#1a5fb4';
    return key === '待派' ? '#c0392b' : '#1a5fb4';
  }
  /* A5⑦ 已完结紧凑行:一行 = 工单号 + 事项一句话 + 状态;点号进详情 */
  function ticketDoneRow(t) {
    return '<div class="m2-done-row">' +
      '<span class="m2-done-id">' + ticketLink(t.id) + '</span>' +
      '<span class="m2-done-s">' + UI.esc(t.summary || S.ticketSummary(t)) + '</span>' +
      '<span class="m2-done-st">' + stateBadge(t) + '</span></div>';
  }
  function doneBlock(key, done) {
    if (!done.length) return '';
    var on = !!VS.done[key];
    var btn = '<button type="button" class="fold-more" onclick="M2.toggleDone(\'' + key.replace(/'/g, "\\'") + '\')">' +
      (on ? '收起已完结(' + done.length + ')' : '显示已完结(' + done.length + ')') + '</button>';
    return btn + (on ? '<div class="m2-done">' + done.map(ticketDoneRow).join('') + '</div>' : '');
  }
  function renderTickets() {
    var all = S.get().tickets.slice().reverse();
    if (!all.length) return '<div class="tiny">暂无工单。</div>';
    var crews = S.get().crews;
    var stateSet = [];
    all.forEach(function (t) { if (stateSet.indexOf(t.state) < 0) stateSet.push(t.state); });
    var list = all.filter(function (t) {
      if (VS.line && t.line !== VS.line) return false;
      if (VS.state) {
        if (VS.state === '挂起中') { if (!t.suspended) return false; }
        else if (t.state !== VS.state) return false;
      }
      if (VS.crew) {
        if (VS.crew === '__none') { if (t.crew) return false; }
        else if (t.crew !== VS.crew) return false;
      }
      return true;
    });
    var bar = UI.filterBar([
      {
        label: '线路', value: VS.line, on: "M2.setF('line',this.value)",
        options: [{ v: '', t: '全部' }].concat(LINE_ORDER.map(function (l) { return { v: l, t: l }; }))
      },
      {
        label: '状态', value: VS.state, on: "M2.setF('state',this.value)",
        options: [{ v: '', t: '全部' }].concat(stateSet.map(function (s) { return { v: s, t: s }; })).concat([{ v: '挂起中', t: '挂起中' }])
      },
      {
        label: '班组', value: VS.crew, on: "M2.setF('crew',this.value)",
        options: [{ v: '', t: '全部' }, { v: '__none', t: '待派' }].concat(crews.map(function (c) { return { v: c.id, t: c.name }; }))
      }
    ], {
      right: UI.groupSwitch([
        { v: 'line', t: '按线路', on: "M2.setGroup('line')" },
        { v: 'state', t: '按状态', on: "M2.setGroup('state')" },
        { v: 'crew', t: '按班组', on: "M2.setGroup('crew')" }
      ], VS.group, '分组') + ' <span class="flt-n">当前 ' + list.length + ' / ' + all.length + ' 条</span>'
    });
    if (!list.length) return bar + '<div class="tiny">当前筛选条件下无工单。</div>';

    var groups = {}, keys = [];
    list.forEach(function (t) {
      var k = groupKeyOf(t);
      if (!groups[k]) { groups[k] = []; keys.push(k); }
      groups[k].push(t);
    });
    var body = groupOrder(keys).map(function (k) {
      var g = groups[k];
      /* R88 A5⑦:已完工 / 已验收 的单默认不占卡位 —— 收进节内紧凑行,「显示已完结(N)」才展开 */
      var live = g.filter(function (t) { return !isDone(t); });
      var done = g.filter(isDone);
      var openKey = VS.group + ':' + k;
      var expanded = !!VS.open[openKey];
      var shown = expanded ? live : live.slice(0, FOLD);
      var hidden = live.length - shown.length;
      var fold = UI.foldMore(expanded ? Math.max(0, live.length - FOLD) : hidden,
        "M2.toggleOpen('" + openKey.replace(/'/g, "\\'") + "')", expanded, FOLD);
      var headExtra = done.length ? '<span class="grp-n">已完结 ' + done.length + ' 条(已折叠)</span>' : '';
      return UI.groupHead(k, g.length, groupColor(k), headExtra) +
        (shown.length ? '<div class="grid2">' + shown.map(ticketCard).join('') + '</div>' + fold
          : '<div class="tiny faint">本组无在办工单</div>') +
        doneBlock(openKey, done);
    }).join('');
    return bar + body;
  }

  /* ---------------- ②b 班组详情页(#/m2/crew/CR-xx)---------------- */
  function crewLogs(cw) {
    var tids = S.get().tickets.filter(function (t) { return t.crew === cw.id; }).map(function (t) { return t.id; });
    return S.get().actionLog.filter(function (g) {
      var p = g.params || {};
      if (p.crew === cw.id) return true;
      if (p.ticketId && tids.indexOf(p.ticketId) >= 0) return true;
      if (g.sum && g.sum.indexOf(cw.name) >= 0) return true;
      return false;
    });
  }
  function renderCrew(crewId) {
    var cw = S.find.crew(crewId);
    if (!cw) return '<div class="tiny">未找到班组 ' + UI.esc(crewId || '') + '。</div>';
    var open = S.get().tickets.filter(function (t) { return t.crew === cw.id && t.state !== '已验收' && t.state !== '已合并'; });
    var tone = cw.status === '空闲' ? 'green' : 'blue';
    var f = cw.enroute && cw.enroute.to ? S.find.facility(cw.enroute.to) : null;
    var head = '<div class="row" style="gap:8px;align-items:center;margin-bottom:8px">' +
      '<a class="btn btn-sm" href="#/m2/dispatch">← 返回调度视图</a>' +
      '<a class="btn btn-sm" href="#/m2/tickets">工单镜像</a></div>';
    var info = '<div' + UI.cardAttrs('ticket', { cls: 'card' }) + '>' +
      '<div class="card-hd"><h3>' + UI.esc(cw.name) + '</h3>' +
      '<span class="row" style="gap:6px;align-items:center">' + UI.badge(cw.status, tone) +
      (cw.contractor ? UI.badge('年度承包商', 'grey') : '') + '</span></div>' +
      UI.kv([
        ['班组编号', cw.id],
        ['业务线', cw.lines.map(lineBadge).join(' '), true],
        ['资质', cw.quals.join(' / ') || '—'],
        ['装备', cw.gear.join(' / ') || '—'],
        ['班次', cw.shift],
        ['责任区街区', cw.loc + ' · Al Ain'],
        ['当前负载', cw.load + ' 单'],
        ['在途目标', f ? (facLink(f.id) + ' <span class="faint">· ' + UI.esc(f.kind) + '</span>') : '—', true],
        ['借调', cw.borrowed ? (cw.borrowed.line + '线 · ' + cw.borrowed.by + ' · ' + cw.borrowed.t + ' · ' + cw.borrowed.reason) : '']
      ]) + '</div>';
    var jobs = '<div class="card card-tight">' + UI.secTitle('当前在办工单 · ' + open.length + ' 单', 'ticket') +
      (open.length
        ? '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>工单</th><th>事项</th><th>设施 · 地点</th><th>状态</th><th>完工 SLA</th></tr></thead><tbody>' +
          open.map(function (t) {
            return '<tr><td>' + ticketLink(t.id) + '</td><td>' + UI.esc(t.summary || '') + '</td>' +
              '<td>' + facLink(t.facility) + '</td><td>' + stateBadge(t) + '</td><td>' + UI.sla((t.sla || {}).done) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="tiny faint">当前无在办工单</div>') + '</div>';
    var his = '<div class="card card-tight">' + UI.secTitle('今日动作历史(时刻 · 账号 · 动作)', 'ticket') +
      UI.timeline(withLabel(crewLogs(cw))) + '</div>';
    return head + info + jobs + his;
  }

  /* ---------------- ③ 对账异常队列(设计档 §2.3b④ 裁决规则)---------------- */
  function renderRecon() {
    var items = S.get().recon || [];
    var head = UI.secTitle('对账异常 · 主管人工裁定时限 ' +
      UI.assume('24h', '假设值:对账周期,试点首周与客户核实后按区可配'), 'ticket');
    if (!items.length) {
      return head + '<div class="tiny" style="margin-top:8px">暂无对账异常。</div>';
    }
    var cards = items.map(function (rc) {
      return '<div class="card card-tight">' +
        '<div class="card-hd"><b>' + UI.esc(rc.id) + '</b>' + UI.badge(rc.status || '待裁定', rc.status === '已裁定' ? 'green' : 'amber') + '</div>' +
        UI.kv([
          ['关联工单', ticketLink(rc.ticketId), true],
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

  /* ---------------- ④ 调度视图 ---------------- */
  /* ④-1 待裁定卡(抢占第三步:前两步试过什么 + 建议方案 + 后果 + 采纳 / 备选) */
  /* 采纳建议的入参:收合条上的一键按钮与展开卡里的按钮同一份 —— 同一个动作、同一条链
     (preempt_arbitrate 内含被让位件的挂起与 SLA 停表),不是两个近似入口。 */
  function adoptParams(pr) {
    return {
      clueId: pr.clueId, crew: (pr.proposal || {}).crew || '',
      reason: '采纳系统建议:' + (pr.proposal && pr.proposal.text ? pr.proposal.text : '')
    };
  }
  function rulingPendingCard(pr) {
    var p = adoptParams(pr);
    var chk = S.check('preempt_arbitrate', p);
    var tried = (pr.tried || []).map(function (x) {
      return '<li><b>' + UI.esc(x.no + ' · ' + x.name) + ':</b> ' + UI.esc(x.result) + '</li>';
    }).join('');
    var cons = (pr.consequence || []).map(function (x) { return '<li>' + UI.esc(x) + '</li>'; }).join('');
    var alts = (pr.alts || []).map(function (a) {
      if (a.action === 'dispatch_manual') {
        return '<div class="act-item"><button type="button" class="btn btn-sm" onclick="M2.openOps()">' +
          UI.esc(a.text) + '</button><span class="act-why">到「操作台」段的改派表选班组与理由码</span></div>';
      }
      return '<div class="act-item"><span class="tiny">备选:' + UI.esc(a.text) + '</span></div>';
    }).join('');
    /* R88 A5⑱:方案是 AI 服务算的,卡上标源头 —— 建议不是决定,拍板在复核主管(值班) */
    var aiBadge = pr.suggestedBy ? UI.badge(pr.suggestedBy + ' · 建议', 'blue') : '';
    return '<div' + UI.cardAttrs('alert', { cls: 'card' }) + ' id="m2-ruling-' + UI.esc(pr.id) + '">' +
      '<div class="card-hd"><h3>待裁定 · ' + UI.esc(pr.id) + '</h3>' +
      '<span class="row" style="gap:6px;align-items:center">' + UI.badge(pr.step || '复核主管(值班)裁定', 'red') +
      UI.levelBadge(pr.level) + lineBadge(pr.line) + '</span></div>' +
      UI.kv([
        ['待派线索', clueLink(pr.clueId) + ' <span class="faint">· ' + UI.esc(pr.topic || '') + '</span>', true],
        ['设施 · 地点', facLink(pr.facility), true],
        ['提交时刻', pr.t]
      ]) +
      '<div class="sep"></div>' + UI.secTitle('前两步已试结果', 'alert') +
      '<ul class="small" style="margin:4px 0 0 16px">' + tried + '</ul>' +
      '<div class="sep"></div>' + UI.secTitle('建议方案', 'alert') +
      (aiBadge ? '<div style="margin:4px 0">' + aiBadge +
        ' <span class="tiny">前两步的结果与方案由 AI 服务算好并记账(动作「调度建议」);建议不是决定 —— 采纳或改派在复核主管(值班)手上</span></div>' : '') +
      '<div class="oc-t2">' + UI.esc((pr.proposal || {}).text || '') + '</div>' +
      '<div class="sep"></div>' + UI.secTitle('采纳后的后果', 'alert') +
      '<ul class="small" style="margin:4px 0 0 16px">' + cons + '</ul>' +
      '<div class="sep"></div>' +
      '<div class="act-panel">' +
      '<div class="act-item"><button type="button" class="btn btn-primary' + (chk.ok ? '' : ' is-off') + '"' +
      (chk.ok ? '' : ' disabled') + ' data-act="preempt_arbitrate" data-p="' + UI.attr(p) + '">采纳建议</button>' +
      (chk.ok ? '' : '<span class="act-why">未满足:' + UI.esc(chk.reason) + '</span>') + '</div>' +
      alts + '</div></div>';
  }
  /* R88 布局靶单①:待裁定不再是压在地图上面的大卡 —— 收成地图上方一条醒目横条,
     默认一行(「⚠ 待裁定 RL-100 · 抢占方案等复核主管确认 ▾」),点开才是全卡。 */
  /* R89 A4⑦:采纳建议一键化 —— 按钮就在收合条上,不必先展开。
     展开卡仍在(前两步试了什么 / 后果 / 备选改派),它是「想细看再看」,不是「必须先看才能点」。 */
  function rulingStrip() {
    var list = S.pendingRulings();
    if (!list.length) return '';
    var pr = list[0];
    var on = VS.rulingOpen;
    var title = '待裁定 ' + pr.id + ' · 抢占方案等复核主管确认 ' + (on ? '▴ 收起' : '▾ 点开看方案与后果');
    var side = (list.length > 1 ? '共 ' + list.length + ' 件 · ' : '') +
      (pr.suggestedBy ? pr.suggestedBy + ' · 建议' : '');
    var p = adoptParams(pr);
    var chk = S.check('preempt_arbitrate', p);
    var adopt = '<div class="m2-strip-act">' +
      '<button type="button" class="btn btn-sm btn-primary' + (chk.ok ? '' : ' is-off') + '"' +
      (chk.ok ? '' : ' disabled') + ' data-act="preempt_arbitrate" data-p="' + UI.attr(p) + '"' +
      ' title="' + UI.esc(chk.ok
        ? '采纳 ' + ((pr.proposal || {}).text || '') + '(含被让位件挂起与 SLA 停表)'
        : '未满足:' + chk.reason) + '">一键采纳建议</button>' +
      (chk.ok ? '' : '<span class="act-why">未满足:' + UI.esc(chk.reason) + '</span>') +
      '</div>';
    return '<div class="m2-strip">' +
      '<div class="m2-strip-row">' +
      '<button type="button" class="m2-strip-hd" aria-expanded="' + (on ? 'true' : 'false') +
      '" onclick="M2.toggleRuling()">' +
      '<span class="m2-strip-ico">!</span>' +
      '<span class="m2-strip-t">' + UI.esc(title) + '</span>' +
      '<span class="m2-strip-n">' + UI.esc(side) + '</span></button>' + adopt +
      '</div>' +
      (on ? '<div class="m2-strip-body">' + list.map(rulingPendingCard).join('') + '</div>' : '') +
      '</div>';
  }

  /* ④-2 班组位置地图(MAPBASE 简化底图 + 班组车辆点 + 在途虚线指向目标设施) */
  var CREW_COLOR = { '空闲': '#2e7d32', '在办': '#1a5fb4', '待接单': '#e08b1e', '在途': '#e08b1e', '到场': '#6b3fa0' };
  function crewColor(cw) { return CREW_COLOR[cw.status] || '#5b6b7c'; }
  function mapBaseLite() {
    var B = window.MAPBASE || { roads: [], blocks: [], water: [] };
    var s = '<rect x="0" y="0" width="1000" height="940" fill="#fbfcf8"></rect>';
    s += (B.blocks || []).map(function (b) {
      return '<g><rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" rx="6" fill="#f0f2ec" stroke="#e6e9e1"></rect>' +
        '<text x="' + (b.x + 8) + '" y="' + (b.y + 20) + '" font-size="14" fill="#b3bbaf" font-family="sans-serif">' + UI.esc(b.name) + '</text></g>';
    }).join('');
    s += (B.roads || []).filter(function (r) { return r.cls === 'main'; }).map(function (r) {
      return '<line x1="' + r.x1 + '" y1="' + r.y1 + '" x2="' + r.x2 + '" y2="' + r.y2 +
        '" stroke="#dcded4" stroke-width="9" stroke-linecap="round"></line>';
    }).join('');
    return s;
  }
  function crewMapSvg() {
    var st = S.get(), body = mapBaseLite(), lines = '', marks = '';
    st.crews.forEach(function (cw) {
      var xy = cw.xy || [500, 500], x = xy[0], y = xy[1], c = crewColor(cw);
      var f = cw.enroute && cw.enroute.to ? S.find.facility(cw.enroute.to) : null;
      if (f && f.xy) {
        lines += '<g><line x1="' + x + '" y1="' + y + '" x2="' + f.xy[0] + '" y2="' + f.xy[1] +
          '" stroke="' + c + '" stroke-width="2.6" stroke-dasharray="9 6" stroke-linecap="round" opacity=".85">' +
          '<title>' + UI.esc(cw.name + ' 在途 → ' + f.id + ' · ' + f.block) + '</title></line>' +
          '<circle cx="' + f.xy[0] + '" cy="' + f.xy[1] + '" r="9" fill="none" stroke="' + c + '" stroke-width="2.4"></circle>' +
          '<text x="' + (f.xy[0] + 13) + '" y="' + (f.xy[1] + 4) + '" font-size="12" fill="' + c + '" font-family="sans-serif">' +
          UI.esc(f.id) + '</text></g>';
      }
      var no = String(cw.id).replace(/^CR-?/, '');
      var shape = '<g><rect x="' + (x - 15) + '" y="' + (y - 10) + '" width="30" height="20" rx="5" fill="' + c + '" stroke="#ffffff" stroke-width="2"></rect>' +
        '<circle cx="' + (x - 7) + '" cy="' + (y + 11) + '" r="3.2" fill="#33404a"></circle>' +
        '<circle cx="' + (x + 7) + '" cy="' + (y + 11) + '" r="3.2" fill="#33404a"></circle>' +
        '<text x="' + x + '" y="' + (y + 5) + '" font-size="12" fill="#ffffff" text-anchor="middle" font-family="sans-serif">' + UI.esc(no) + '</text>' +
        '<text x="' + (x + 20) + '" y="' + (y + 5) + '" font-size="12.5" fill="#5c6660" font-family="sans-serif">' + UI.esc(cw.name) + '</text></g>';
      marks += '<a href="#/m2/crew/' + UI.esc(cw.id) + '" class="map-node"><title>' +
        UI.esc(cw.name + ' · ' + cw.status + ' · ' + cw.loc + ' · 在办 ' + cw.load + ' 单(点击进班组详情)') + '</title>' + shape + '</a>';
    });
    return body + lines + marks;
  }
  function crewMap() {
    var st = S.get();
    var legend = Object.keys(CREW_COLOR).map(function (k) {
      var n = st.crews.filter(function (c) { return c.status === k; }).length;
      return '<div class="map-lg"><i style="background:' + CREW_COLOR[k] + '"></i>' + UI.esc(k) +
        ' <span class="faint">· ' + n + ' 班</span></div>';
    }).join('') +
      '<div class="map-lg"><span class="faint">虚线 = 在途方向,圈住的是目标设施;方块 = 班组车辆,点击进班组详情</span></div>';
    return '<div class="card">' +
      '<div class="card-hd"><h3>班组位置</h3><span class="tiny">位置与在途目标随派单 / 到场动作更新</span></div>' +
      '<div class="map-wrap">' +
      '<div class="map-svg"><svg viewBox="0 0 1000 940" role="img" aria-label="班组位置与在途目标风格化示意图">' + crewMapSvg() + '</svg></div>' +
      '<div class="map-side">' + UI.secTitle('图例', 'ticket') + legend +
      '<div class="sep"></div><div class="oc-t3">底图为风格化街区示意,' +
      UI.assume('非真实地理数据', '演示底图与坐标为风格化示意,不含真实测绘数据;正式版接客户 GIS 底图与班组定位') +
      '。</div></div></div></div>';
  }

  /* ④-3 最近调度动作流(派单 / 接单 / 交接 / 抢占 / 挂起恢复 类动作) */
  /* R88:AI 服务的「调度建议」(dispatch_suggest)与「超时兜底派单」(auto_overdue_dispatch)
     都是调度线上的动作 —— 进动作流,和人工动作同表可比。 */
  var DISPATCH_ACTIONS = {
    auto_dispatch: 1, auto_plan_ticket: 1, dispatch_manual: 1, crew_accept: 1, crew_handover: 1, crew_reject: 1,
    preempt_yield: 1, preempt_borrow: 1, preempt_arbitrate: 1, dispatch_suggest: 1, auto_overdue_dispatch: 1,
    suspend: 1, crew_resume: 1, resume_requeue: 1, merge: 1, split: 1, fastlane_recall: 1
  };
  function dispatchFeed() {
    var logs = S.get().actionLog.filter(function (g) { return DISPATCH_ACTIONS[g.action]; });
    var last = logs.slice(-10);
    return '<div class="card card-tight">' +
      UI.secTitle('最近调度动作 · 最新 ' + last.length + ' 条', 'ticket') +
      (last.length ? UI.timeline(withLabel(last), { desc: true }) : '<div class="tiny">暂无调度动作。</div>') +
      '</div>';
  }

  /* ④-4 班组负载卡 */
  function crewCard(cw) {
    var tone = cw.status === '空闲' ? 'green' : 'blue';
    var myTickets = S.get().tickets.filter(function (t) { return t.crew === cw.id && t.state !== '已验收' && t.state !== '已合并'; });
    var f = cw.enroute && cw.enroute.to ? S.find.facility(cw.enroute.to) : null;
    return '<div class="card card-tight">' +
      '<div class="card-hd"><b><a href="#/m2/crew/' + UI.esc(cw.id) + '">' + UI.esc(cw.name) + '</a></b>' + UI.badge(cw.status, tone) + '</div>' +
      UI.kv([
        ['辖区', cw.loc],
        ['业务线', cw.lines.join(' / ')],
        ['资质', cw.quals.join(' / ') || '—'],
        ['装备', cw.gear.join(' / ') || '—'],
        ['班次', cw.shift],
        ['当前负载', cw.load + ' 单' + (cw.contractor ? ' · 年度承包商' : '')],
        ['在途目标', f ? facLink(f.id) : '', true]
      ]) +
      '<div class="sep"></div>' +
      (myTickets.length
        ? '<div class="tiny">在办:' + myTickets.map(function (t) { return ticketLink(t.id); }).join(' · ') + '</div>'
        : '<div class="tiny faint">当前无在办工单</div>') +
      '</div>';
  }

  /* ④-5 抢占调度卡(设计档 §0.8.3 在途抢占;WO-8871 = 被抢占对象) */
  function preemptCard() {
    var t = S.find.ticket('WO-8871');
    if (!t) return '';
    var suspendOpts = S.dict().reasonCodes.suspend;
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
      ? resumeCard(t)
      : ('<div class="sep"></div>' + UI.secTitle('挂起本单以释放班组(选原因码)', 'ticket') + '<div class="act-panel">' + btnsHtml + '</div>');
    return '<div' + UI.cardAttrs('ticket', { color: '#9a6b00' }) + '>' +
      '<div class="card-hd"><h3>抢占调度 · ' + UI.esc(t.id) + '</h3>' +
      '<span class="row" style="gap:6px;align-items:center">' + UI.badge(t.type, 'blue') + UI.cardTag('ticket', '在途抢占') + '</span></div>' +
      '<div class="oc-t2">' + UI.esc(t.summary || '') + '</div>' +
      '<div class="small muted">' + facLink(t.facility) + ' · 承接 ' + crewLink(t.crew) + '</div>' +
      '<div class="tiny" style="margin-top:2px">' + UI.esc(t.note || '') + '</div>' +
      body +
      '</div>';
  }

  /* ④-6 改派 / 合并 / 拆单表 */
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
        '<td>' + ticketLink(t.id) + '<div class="tiny">' + UI.esc(t.summary || t.type) + '</div></td>' +
        '<td>' + facLink(t.facility) + '</td>' +
        '<td>' + crewLink(t.crew) + '</td>' +
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
    return '<div id="m2-dispatch-table" style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th></th><th>工单 · 事项</th><th>设施 · 地点</th><th>现班组</th><th>状态</th><th>改派(理由码必填)</th><th>拆单(理由必填)</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="card card-tight" style="margin-top:8px">' +
      UI.secTitle('合并所选工单(勾选 ≥2 张同点位/同时窗工单)', 'ticket') +
      '<input type="text" id="m2-mg-reason" placeholder="合并理由,如:同点位重复派工" oninput="M2.syncMerge()">' +
      '<div class="act-item" style="margin-top:6px">' +
      '<button type="button" class="btn' + (mgChk.ok ? '' : ' is-off') + '" id="m2-mg-btn" data-act="merge" data-p="' + UI.attr(mgP) + '"' + (mgChk.ok ? '' : ' disabled') + '>合并</button>' +
      '<span class="act-why" id="m2-mg-btn-why">' + (mgChk.ok ? '' : '未满足:' + UI.esc(mgChk.reason)) + '</span>' +
      '</div></div>';
  }

  /* R88 布局靶单⑥:调度视图分两段 —— 全局态(地图 + 动作流)与操作台(负载 / 单工单抢占 / 改派表)不同层,
     单工单的抢占卡不再与全局地图平摊在同一层。段头可点收合,总览默认开、操作台默认收。 */
  function segHead(key, title, desc, right) {
    var on = !!VS.seg[key];
    return '<button type="button" class="m2-seg" aria-expanded="' + (on ? 'true' : 'false') +
      '" onclick="M2.toggleSeg(\'' + key + '\')">' +
      '<span class="m2-seg-cev">' + (on ? '▾' : '▸') + '</span>' +
      '<span class="m2-seg-t">' + UI.esc(title) + '</span>' +
      '<span class="m2-seg-d">' + UI.esc(desc) + '</span>' +
      '<span class="m2-seg-n">' + UI.esc(right + (on ? '' : ' · 点开')) + '</span></button>';
  }
  /* 操作台内部的子折叠头(比段头轻一级:段 = 全局态 / 操作台,子段 = 操作台里的三件事) */
  function subHead(key, title, desc, right) {
    var on = !!VS.sub[key];
    return '<button type="button" class="m2-sub" aria-expanded="' + (on ? 'true' : 'false') +
      '" onclick="M2.toggleSub(\'' + key + '\')">' +
      '<span class="m2-seg-cev">' + (on ? '▾' : '▸') + '</span>' +
      '<span class="m2-sub-t">' + UI.esc(title) + '</span>' +
      '<span class="m2-seg-d">' + UI.esc(desc) + '</span>' +
      '<span class="m2-seg-n">' + UI.esc(right + (on ? '' : ' · 点开')) + '</span></button>';
  }
  /* 抢占与挂起记录子段:在途抢占卡 + 当前所有挂起件(挂起是抢占的直接后果,同一处看) */
  function suspendedList(exceptId) {
    var list = S.get().tickets.filter(function (t) { return t.suspended && t.id !== exceptId; });
    if (!list.length) return '';
    return '<div class="m2-done" style="margin-top:8px">' + list.map(function (t) {
      return '<div class="m2-done-row">' +
        '<span class="m2-done-id">' + ticketLink(t.id) + '</span>' +
        '<span class="m2-done-s">' + UI.esc(t.summary || S.ticketSummary(t)) +
        (t.resumeCond ? ' · 等:' + UI.esc(t.resumeCond.cond) : '') + '</span>' +
        '<span class="m2-done-st">' + stateBadge(t) + '</span></div>';
    }).join('') + '</div>';
  }
  function renderDispatch() {
    var st = S.get();
    var crews = st.crews;
    var idle = crews.filter(function (c) { return c.status === '空闲'; }).length;
    var openN = st.tickets.filter(function (t) { return t.state !== '已验收' && t.state !== '已合并'; }).length;
    var susN = st.tickets.filter(function (t) { return t.suspended; }).length;
    var ops =
      subHead('load', '班组负载', '在办 / 在途 / 空闲,点班组名进详情', crews.length + ' 班组 · 空闲 ' + idle) +
      (VS.sub.load ? '<div class="grid3">' + crews.map(crewCard).join('') + '</div>' : '') +
      subHead('disp', '改派与合并拆单', '理由码必填,动作入日志', openN + ' 单可调度') +
      (VS.sub.disp ? dispatchTable() : '') +
      subHead('pre', '抢占与挂起记录', '在途抢占的让位口 + 当前挂起件与恢复条件', '挂起 ' + susN + ' 单') +
      (VS.sub.pre ? (preemptCard() + suspendedList('WO-8871')) : '');
    return rulingStrip() +
      segHead('ov', '总览', '班组位置地图 + 最近调度动作流(全区态)', crews.length + ' 班组 · 空闲 ' + idle) +
      (VS.seg.ov ? (crewMap() + dispatchFeed()) : '') +
      segHead('ops', '操作台', '班组负载 · 改派与合并拆单 · 抢占与挂起记录(三段各自收放)', openN + ' 单可调度') +
      (VS.seg.ops ? ops : '');
  }

  /* ---------------- 待裁定的全局横幅(渲染层加,不动 store)----------------
     app.html 每次渲染都会重写 #view;本处在渲染之后补一条置顶提示,任意模块页都可见,
     点进去 = 调度视图的待裁定卡。 */
  function injectRulingBanner() {
    var view = document.getElementById('view');
    if (!view || !S.pendingRulings) return;
    var old = document.getElementById('m2-ruling-banner');
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var list = S.pendingRulings();
    if (!list.length) return;
    /* R88 布局靶单⑧:调度视图自己已有醒目横条(地图上方),再插一条全局横幅就是三条横条压内容 —— 本页不插 */
    if (/^#\/m2\/dispatch/.test(window.location.hash || '')) return;
    var pr = list[0];
    var text = '待裁定 · ' + pr.id + ':' + UI.esc(pr.topic || '') + ' ' + UI.esc(pr.facility || '') +
      ' 已试「在办件让位 / 跨班组借调」,' + UI.esc(pr.suggestedBy || 'AI 服务') +
      '给的方案与后果在调度视图顶部待裁定条,等复核主管(值班)确认' +
      (list.length > 1 ? '(共 ' + list.length + ' 件)' : '');
    var box = document.createElement('div');
    box.id = 'm2-ruling-banner';
    box.innerHTML = UI.banner('danger', text, { href: '#/m2/dispatch' });
    view.insertBefore(box, view.firstChild);
  }
  function deferBanner() { window.setTimeout(injectRulingBanner, 0); }
  window.addEventListener('render', deferBanner);
  window.addEventListener('hashchange', deferBanner);
  deferBanner();

  /* ---------------- 出口 ---------------- */
  VIEWS.m2 = function (ctx) {
    var rest = ctx.rest || [];
    if (rest[0] === 'crew' && rest[1]) {
      return tabsHtml('') + '<div style="margin-top:10px">' + renderCrew(decodeURIComponent(rest[1])) + '</div>';
    }
    var tab = tabId(ctx);
    var id = rest[1] ? decodeURIComponent(rest[1]) : '';
    var body = tab === 'alerts' ? renderAlerts(id)
      : tab === 'tickets' ? (id ? ticketDetail(id) : renderTickets())
        : tab === 'recon' ? renderRecon()
          : renderDispatch();
    return tabsHtml(tab) + '<div style="margin-top:10px">' + body + '</div>';
  };
})();
