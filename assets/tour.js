/* ===== 导览层 · 分镜导览条 + 两枚说明浮层(R85① / R85⑤)=====
   职责边界:本文件是**导览层**,允许解说口吻;业务界面文案不归它管,也不往业务界面里写导览词。
   契约(不可破坏):
   - 不动 T1-T12 状态机:分镜表只是它上面的一层索引,推进仍走 S.nextStep()/S.tourGoto(),S.commit 仍是唯一状态变更入口。
   - 不改 actionLog 结构:「后端发生了什么」只读 S.stepLog(stepId) 做呈现。
   - CSS 页级注入,不动 tokens.css。
   实现要点:
   - 推进一镜 = 补状态到该镜所需步 → 跳 hash → 渲染完成后聚焦高亮 → 导览条换旁白。
   - 状态机不可逆,所以「上一镜 / 跳镜」实现为重放(S.tourGoto 内重新播种后静默连推)。
   - 下车 = 非导览发起的 hashchange;回来只重新导航 + 重新聚焦,不动状态。 */
(function (w, d) {
  'use strict';

  var S = w.S, UI = w.UI, esc = UI.esc;

  /* ---------------- 轴线配色(导览层自用,不进业务界面) ---------------- */
  var AXIS = {
    '序幕': '#5b6b7c',
    '井盖线': '#1a5fb4',
    '路面线': '#9a6b00',
    '管网线': '#2e7c9b',
    '支线·异常': '#c0392b',
    '支线·越级与压力': '#6b4fa0',
    '终幕': '#5b6b7c'
  };
  var STAGES = ['发现', '规则校验', '分级路由', '处置', '复验闭环'];

  /* ---------------- 分镜表 ----------------
     {sid, ref(场景步 id 或 null), axis, stage(可含「+」表示跨两段), route, focus, lane, laneNote, title, say, link} */
  var STORY = [
    {
      sid: 'S0', ref: null, axis: '序幕', stage: '', route: '#/m1', focus: '.tabs',
      lane: null, laneNote: '尚未进入任何通道',
      title: '今晚 19:00 · 三线全景',
      say: '值班交接刚过。井盖、路面、管网三条线的待核查队列摆在同一张工作台上,tab 上的数字是每条线此刻压着多少件。时钟停在 19:00——它是随处置步进的工作时钟,不按现实秒走。'
    },
    {
      sid: 'S1', ref: 'T1', axis: '井盖线', stage: '发现', route: '#/m1/clue/CL-0417', focus: '.objcard',
      lane: '紧急直派',
      title: 'MH-0417 位移传感器报警',
      say: '19:02,Al Jimi 街区 MH-0417 的位移传感器报警,报文带已认证设备签名,属于硬证据。注意抬头的措辞:它现在只是「线索」——AI 与规则只产线索,定性权在人。'
    },
    {
      sid: 'S2', ref: 'T1', axis: '井盖线', stage: '规则校验', route: '#/m1/clue/CL-0417', focus: '.checks',
      lane: '紧急直派',
      title: '第二闸 · 机械校验四项逐项打钩',
      say: '第一闸是 AI 识别,第二闸是机械证据校验:硬编码判据逐项打钩,每项留规则包版本号。井盖线四项全过——两闸都过的应急件,才有资格走自动派单。'
    },
    {
      sid: 'S3', ref: 'T1', axis: '井盖线', stage: '分级路由', route: '#/m2/tickets', focus: '#tk-WO-9001',
      lane: '紧急直派',
      title: '紧急直派 · 机器先把单派出去',
      say: '双闸齐全,系统当场把工单派给排水一班,同时镜像写进区市政工单系统。这条通道叫紧急直派:派单是处置调度,不是定性——人还没签字,告警就还不成立。'
    },
    {
      sid: 'S4', ref: 'T2', axis: '井盖线', stage: '处置', route: '#/m1', focus: 'text:紧急直派并行复核',
      lane: '紧急直派',
      title: '并行复核窗 · 15 分钟倒计时',
      say: '19:03,复核窗开启,倒计时挂在卡片上。人这时二选一:确认,等于对已经出动的这一单追认;撤回,班组当场召回。先派后审的代价明写在卡上——这类件全量拘进主管抽审。'
    },
    {
      sid: 'S5', ref: 'T3', axis: '井盖线', stage: '处置', route: '#/m2/tickets/WO-9001', focus: '#tk-WO-9001',
      lane: '紧急直派', link: { href: 'crew.html', label: '打开班组处置端' },
      title: '班组端回传 · 五格状态机走完',
      say: '19:05,排水一班接单、到场、回传修复前后双照、提交完工,工单在五格状态机上逐格前进。这几步在班组手机端做,右边可以直接打开自己走一遍;已经走过的步骤不会重复记日志。'
    },
    {
      sid: 'S6', ref: 'T4', axis: '井盖线', stage: '复验闭环', route: '#/m1', focus: 'text:AI 复验判不出',
      lane: '紧急直派',
      title: 'AI 复验判不出 · 存疑待人裁',
      say: '19:24,AI 拿修复前后两张图做配准复验,判不出。系统把它转「存疑待人裁」,不是默认打回——判不出宁可升给人,也不替人做减法。人裁合格,这一件才算闭环。'
    },
    {
      sid: 'S7', ref: 'T5', axis: '支线·异常', stage: '规则校验', route: '#/m1/clue/CL-0562', focus: 'text:为什么它不走紧急直派',
      lane: '应急人审档',
      title: '对照件 · 纯视觉 0.31、无硬证据',
      say: '19:30,Hili 街区一件井盖异常,置信 0.31,纯视觉,没有传感器硬证据,机械四项没全过——不走自动派单,进加急人工 30 分钟档。低置信不等于放过:应急级本身不看置信度,该人核照样人核。'
    },
    {
      sid: 'S8', ref: 'T6', axis: '支线·异常', stage: '规则校验', route: '#/m1/clue/CL-0588', focus: 'text:机械校验硬失败',
      lane: '机械驳回',
      title: '树影误报 · 机械驳回也不自动归档',
      say: '19:40,一件树影造成的持续假目标,机械校验硬失败。系统没有直接归档——高危件零自动归档是硬线,证据卡置顶转人工驳回确认。人也可以反过来推翻机械判定,理由码必填,误杀样本回流规则组。'
    },
    {
      sid: 'S9', ref: 'T7', axis: '路面线', stage: '发现+规则校验', route: '#/m1/line/rd', focus: 'text:自动升格(免人工)',
      lane: '自动升格',
      title: '路面车载批量 · 五项校验全过',
      say: '20:00,路面车载采集的一批进池。路面线的机械校验是五项,逐项打钩。养护级、高置信、机械全过——三条同时成立才自动升格,免人工。横幅上写着抽审兜底:免人工不等于免审计,每条照样一条日志。'
    },
    {
      sid: 'S10', ref: 'T7', axis: '路面线', stage: '分级路由+处置', route: '#/m2/tickets', focus: '#tk-WO-9007',
      lane: '自动升格',
      title: '并入周期养护的批量工单',
      say: '升格后的件不单独开单,并入周批养护工单——这是自动处理通道,绿色。同一条流水线,井盖线那件走的是红色的紧急直派,路面线这件走到这里是绿色:分档不同的是级别与证据,不是系统。'
    },
    {
      sid: 'S11', ref: 'T8', axis: '管网线', stage: '发现', route: '#/m1/line/pl', focus: 'text:调查案 IV-0071',
      lane: null, laneNote: '调查案(观察窗 + 现场核查)',
      title: 'DMA-07 水量平衡越限 · 自动开调查案',
      say: '20:30,DMA-07 分区水量平衡越限。先响的是硬编码水力学规则,不是 AI;AI 在后面做时序判型,只给出「渗漏嫌疑」这个建议。管网线形态与前两线根本不同:不是线索池等人审,是预警开调查案,人只在立案与结案两点拍板。'
    },
    {
      sid: 'S12', ref: 'T8', axis: '管网线', stage: '分级路由', route: '#/m2/tickets', focus: '#tk-WO-9008',
      lane: '设备维护',
      title: 'SN-FM03 自检失败 · 设备维护单',
      say: '同一时刻还有一件:流量计 SN-FM03 自检失败,系统直接开设备维护工单,承接方是传感网运维方,不惊动三线班组。判型职权在这里划死——爆管与设备故障走规则与设备通道,不经 AI 定性。先排设备故障,再报业务异常。'
    },
    {
      sid: 'S13', ref: 'T9', axis: '支线·越级与压力', stage: '分级路由', route: '#/m2/dispatch', focus: 'text:应急抢占',
      lane: '批量加急分诊(显名降级)',
      title: '承接池无空闲班组 · 过载三步',
      say: '21:00,Zakher 又来一件应急级井盖,可承接池里没有空闲班组。过载三步依次落地:先发只读预警喊现场,再把超额件显名降级进批量加急分诊、件件可抽审,最后由值班长决定要不要抢占在途的养护班组。挂起会让 SLA 停表,班组释放。'
    },
    {
      sid: 'S14', ref: 'T10', axis: '支线·越级与压力', stage: '发现', route: '#/m4', focus: 'text:PR-0301',
      lane: null, laneNote: '人工甄别并入(不直接进应急)', link: { href: 'public.html', label: '打开公众上报端' },
      title: '公众上报 · 回执编号与去重合并',
      say: '21:10,同一个点位有市民上报。系统先出受理编号回执,再与传感器那条线索去重合并,证据叠加,催办计数可见。公众上报不直接进应急队列,先进人工甄别——防滥用三件都在这一页上。'
    },
    {
      sid: 'S15', ref: 'T11', axis: '支线·越级与压力', stage: '复验闭环', route: '#/m2/recon', focus: 'text:RC-0011',
      lane: null, laneNote: '人工裁定(24h 内)',
      title: '对账队列 · 1 条不一致',
      say: '21:20,与客户工单系统的日对账出现 1 条不一致。裁决规则写在页首:处置状态以客户系统为准,巡检定性以我方为准。这个界面不是第二真源,它是镜像;对不上就人工裁定,裁定本身也是一条动作。同一时刻 DMA-07 流量回归基线,管网那条线也走到了建议结案。'
    },
    {
      sid: 'S16', ref: 'T12', axis: '支线·越级与压力', stage: '处置', route: '#/m2/dispatch', focus: 'text:暴雨模式已启动',
      lane: null, laneNote: '全线升档 · 雨前专项任务包',
      title: '暴雨模式 · 全线升档',
      say: '21:30,暴雨模式启动:井盖线整体升一档,液位计转成先导预警源,雨前清掏任务包下发。压力最大的时候,上级主管部门可以直接关掉某个类目的紧急直派——关是即时生效的安全侧动作,区里不服可以申诉,重开要按数据判据批。'
    },
    {
      sid: 'S17', ref: null, axis: '终幕', stage: '复验闭环', route: '#/m6', focus: '#m6-ontology-log',
      lane: null, laneNote: '全通道共用同一本日志',
      title: '一晚上的动作,都在同一本日志上',
      say: '这一晚发生的一切——谁、何时、对什么对象、做了什么——都记在同一本日志上,人做的和服务账号做的一视同仁。上面三张表是它的骨架:对象、链接、动作。AI 的每一格权限,也是开在这张动作表上的。'
    }
  ];

  var N = STORY.length;

  /* 该镜需要的状态步数(stepIdx):ref 对应场景步走完之后的位置;终幕 = 全部走完 */
  function targetIdx(sc) {
    if (!sc.ref) return sc.sid === 'S0' ? 0 : w.SCENARIO.length;
    for (var i = 0; i < w.SCENARIO.length; i++) if (w.SCENARIO[i].id === sc.ref) return i + 1;
    return 0;
  }

  /* ---------------- 页级 CSS(不动 tokens.css) ---------------- */
  (function injectCss() {
    if (d.getElementById('origen-tour-css')) return;
    var css = [
      '.tour-dock{position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--shell,#0e1210);color:var(--shell-ink,#e9eeea);',
      'border-top:1px solid var(--shell-line,#252d28);box-shadow:0 -8px 24px rgba(11,26,18,.18);font-size:12.5px}',
      '.tour-row{display:flex;align-items:center;gap:10px;padding:7px 14px;flex-wrap:nowrap;overflow-x:auto}',
      '.tour-axis{flex:none;display:inline-flex;align-items:center;gap:6px;font-weight:700;color:#fff;border-radius:20px;padding:2px 10px;white-space:nowrap}',
      '.tour-pos{flex:none;color:var(--shell-mute,#98a29b);white-space:nowrap}',
      '.tour-say{flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}',
      '.tour-say.is-open{white-space:normal;overflow:visible;line-height:1.7}',
      '.tour-say b{color:#fff}',
      '.tour-btn{flex:none;background:var(--shell-2,#161b18);border:1px solid var(--shell-line,#252d28);color:var(--shell-ink,#e9eeea);',
      'border-radius:var(--radius-xs,6px);padding:5px 11px;font-size:12.5px;font-family:inherit;cursor:pointer;white-space:nowrap}',
      '.tour-btn:hover{background:var(--shell-3,#1d2420);color:#fff}',
      '.tour-btn[disabled]{opacity:.42;cursor:default}',
      '.tour-btn.is-main{background:var(--blue,#17a05e);border-color:var(--blue,#17a05e);color:#fff;font-weight:600}',
      '.tour-btn.is-main:hover{background:var(--blue-dark,#10804a)}',
      '.tour-dots{display:flex;align-items:center;gap:3px;padding:0 14px 8px;flex-wrap:wrap}',
      '.tour-dot{width:22px;height:18px;border-radius:4px;border:1px solid transparent;background:#2a332e;color:#9aa49d;',
      'font-size:10.5px;line-height:1;font-family:inherit;cursor:pointer;padding:0}',
      '.tour-dot:hover{color:#fff}',
      '.tour-dot.is-on{color:#fff;font-weight:700;box-shadow:0 0 0 2px rgba(255,255,255,.22)}',
      '.tour-dot.is-past{opacity:.8}',
      '.tour-gap{width:9px;flex:none}',
      '.tour-off{color:var(--gold,#c9c57e)}',
      '.tour-dock.is-min .tour-dots{display:none}',
      '.tour-dock.is-min .tour-say{display:none}',
      '.tour-spot{outline:2.5px solid var(--blue,#17a05e) !important;outline-offset:3px;border-radius:var(--radius-sm,8px);',
      'animation:tourPulse 1.1s ease-out 2}',
      '@keyframes tourPulse{0%{box-shadow:0 0 0 0 rgba(23,160,94,.42)}70%{box-shadow:0 0 0 12px rgba(23,160,94,0)}100%{box-shadow:0 0 0 0 rgba(23,160,94,0)}}',
      '.toasts{bottom:104px}',
      '.tour-modal-hd{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px}',
      '.tour-modal .modal{max-width:760px}',
      '.tour-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}'
    ].join('');
    var s = d.createElement('style');
    s.id = 'origen-tour-css';
    s.textContent = css;
    (d.head || d.documentElement).appendChild(s);
  })();

  /* ---------------- 导览状态 ---------------- */
  var cur = 0;          // 当前分镜下标
  var riding = true;    // 在车上(false = 已下车自由点)
  var navigating = false;
  var navToken = 0;
  var sayOpen = false;
  var minimized = false;

  /* 按已推进的状态步反推当前在第几镜:冷启动/重置后自愈,不落额外存储 */
  function deriveCur() {
    var idx = S.get().stepIdx || 0, best = 0;
    for (var i = 0; i < N; i++) if (targetIdx(STORY[i]) <= idx) best = i;
    return best;
  }
  cur = deriveCur();

  /* ---------------- 聚焦高亮 ---------------- */
  var spotTimer = null;
  function clearSpot() {
    var old = d.querySelectorAll('.tour-spot');
    for (var i = 0; i < old.length; i++) old[i].classList.remove('tour-spot');
  }
  function findFocus(spec) {
    var view = d.getElementById('view');
    if (!spec || !view) return null;
    if (spec.indexOf('text:') === 0) {
      var needle = spec.slice(5);
      var cands = view.querySelectorAll('.card, .checks, .banner, .objcard');
      var best = null;
      for (var i = 0; i < cands.length; i++) {
        if (cands[i].textContent.indexOf(needle) < 0) continue;
        if (!best || cands[i].textContent.length < best.textContent.length) best = cands[i];
      }
      return best;
    }
    try { return view.querySelector(spec); } catch (e) { return null; }
  }
  function spotlight() {
    clearSpot();
    var el = findFocus(STORY[cur].focus);
    if (!el) return false;
    el.classList.add('tour-spot');
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    catch (e) { el.scrollIntoView(); }
    if (spotTimer) w.clearTimeout(spotTimer);
    spotTimer = w.setTimeout(clearSpot, 2600);
    return true;
  }

  /* ---------------- 导航 ---------------- */
  function navigate(sc) {
    navToken++;
    var token = navToken;
    navigating = true;
    if (w.location.hash !== sc.route) w.location.hash = sc.route;
    w.setTimeout(function () {
      if (token !== navToken) return;
      navigating = false;
      spotlight();
    }, 90);
  }

  function goTo(i, opts) {
    i = Math.max(0, Math.min(i, N - 1));
    var sc = STORY[i];
    cur = i;
    riding = true;
    sayOpen = false;
    if (!(opts && opts.keepState)) S.tourGoto(targetIdx(sc));  // 补状态 / 重放到位
    renderDock();
    navigate(sc);
  }

  /* 回到导览:只重新导航 + 重新聚焦,不动状态 */
  function reboard() {
    riding = true;
    renderDock();
    navigate(STORY[cur]);
  }

  /* ---------------- 五段流水线 SVG(「流程位置」浮层) ---------------- */
  function pipelineSvg(sc) {
    var color = AXIS[sc.axis] || '#5b6b7c';
    var on = (sc.stage || '').split('+');
    var W = 700, H = 96, bw = 116, bh = 44, gap = 20, x0 = 14, y = 26;
    var parts = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="五段流水线中的当前位置" style="max-width:100%;height:auto">'];
    parts.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"></rect>');
    STAGES.forEach(function (st, i) {
      var x = x0 + i * (bw + gap);
      var hot = on.indexOf(st) >= 0;
      parts.push('<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + bh + '" rx="8" ' +
        'fill="' + (hot ? color : '#f4f6f8') + '" stroke="' + (hot ? color : '#cfd6dc') + '" stroke-width="' + (hot ? 2 : 1) + '"></rect>');
      parts.push('<text x="' + (x + bw / 2) + '" y="' + (y + bh / 2 + 5) + '" text-anchor="middle" font-size="13.5" ' +
        'font-family="sans-serif" fill="' + (hot ? '#ffffff' : '#5b6b7c') + '" font-weight="' + (hot ? '700' : '400') + '">' + esc(st) + '</text>');
      if (i < STAGES.length - 1) {
        var ax = x + bw + 3, ay = y + bh / 2;
        parts.push('<path d="M' + ax + ' ' + ay + ' H' + (ax + gap - 9) + '" stroke="#9aa5ae" stroke-width="1.6"></path>');
        parts.push('<path d="M' + (ax + gap - 12) + ' ' + (ay - 4) + ' L' + (ax + gap - 6) + ' ' + ay + ' L' + (ax + gap - 12) + ' ' + (ay + 4) + '" fill="#9aa5ae"></path>');
      }
      if (hot) {
        parts.push('<text x="' + (x + bw / 2) + '" y="' + (y - 8) + '" text-anchor="middle" font-size="11.5" ' +
          'font-family="sans-serif" fill="' + color + '" font-weight="700">当前</text>');
      }
    });
    parts.push('<text x="' + x0 + '" y="' + (H - 6) + '" font-size="11.5" font-family="sans-serif" fill="#8e968f">' +
      '发现 → 规则校验 → 分级路由 → 处置 → 复验闭环 · 三条业务线共用同一副骨架</text>');
    parts.push('</svg>');
    return parts.join('');
  }

  function laneBadgeOf(sc) {
    if (sc.lane) return UI.laneBadge(sc.lane);
    return UI.badge(sc.laneNote || '—', 'grey');
  }

  function stageModal(sc) {
    var color = AXIS[sc.axis] || '#5b6b7c';
    return '<div class="tour-modal-hd"><h3 style="margin:0">流程位置 · 第 ' + (cur + 1) + '/' + N + ' 镜</h3>' +
      '<button type="button" class="btn btn-sm" data-tour="close">关闭(Esc)</button></div>' +
      '<div>' + pipelineSvg(sc) + '</div>' +
      '<div class="tour-meta">' +
      '<span class="badge" style="background:' + color + ';color:#fff;border-color:' + color + '">' + esc(sc.axis) + '</span>' +
      '<span class="tiny">所处环节:<b>' + esc((sc.stage || '—').replace('+', ' + ')) + '</b></span>' +
      '<span class="tiny">走的通道:</span>' + laneBadgeOf(sc) +
      '</div>' +
      '<div class="small">' + esc(sc.title) + '——' + esc(sc.say) + '</div>' +
      '<div class="tiny" style="margin-top:8px">通道分五类:紧急直派 / 加急人工 / 常规人工 / 自动处理 / 驳回与转办。' +
      '同一副五段骨架,三条业务线按级别与证据分档,进的通道不同,流程不换。</div>';
  }

  function backendModal(sc) {
    var logs = sc.ref ? S.stepLog(sc.ref) : [];
    var body, note;
    if (sc.ref) {
      note = '本镜推进时,后端(规则引擎 / AI 服务 / 班组账号 / 人)一共落了 ' + logs.length + ' 条动作记录:';
      body = UI.ontologyLog(logs, { empty: '本镜未新增动作记录(该步动作此前已由人手动执行过,不重复记日志)。' });
    } else if (sc.sid === 'S17') {
      note = '截至此刻,这一晚累计的全部动作记录(倒序,最近 20 条;完整表在本页「本体日志」):';
      body = UI.ontologyLog(null, { desc: true, limit: 20 });
      logs = S.get().actionLog;
    } else {
      note = '本镜不推进状态,只看开场的世界。以下为当前已有的动作记录:';
      body = UI.ontologyLog(null, { desc: true, limit: 10 });
    }
    return '<div class="tour-modal-hd"><h3 style="margin:0">后端发生了什么 · 第 ' + (cur + 1) + '/' + N + ' 镜</h3>' +
      '<button type="button" class="btn btn-sm" data-tour="close">关闭(Esc)</button></div>' +
      '<div class="small" style="margin-bottom:8px">' + esc(note) + '</div>' +
      body +
      '<div class="tiny" style="margin-top:10px">每条动作记录可整链导出、可回放——这就是本体化日志底座:' +
      '谁(人或服务账号)、何时、对哪个对象、做了什么、带什么参数,自动步与人工步同一张表、同一套留痕。</div>';
  }

  /* ---------------- 浮层壳 ---------------- */
  var maskEl = null;
  function closeModal() {
    if (maskEl && maskEl.parentNode) maskEl.parentNode.removeChild(maskEl);
    maskEl = null;
  }
  function openModal(html) {
    closeModal();
    maskEl = d.createElement('div');
    maskEl.className = 'mask tour-modal';
    maskEl.innerHTML = '<div class="modal">' + html + '</div>';
    maskEl.addEventListener('click', function (e) {
      if (e.target === maskEl) closeModal();
      var t = e.target;
      while (t && t !== maskEl && !(t.getAttribute && t.getAttribute('data-tour'))) t = t.parentNode;
      if (t && t.getAttribute && t.getAttribute('data-tour') === 'close') closeModal();
    });
    d.body.appendChild(maskEl);
  }
  d.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.keyCode === 27) && maskEl) closeModal();
  });

  /* ---------------- 导览条 ---------------- */
  var dock = null;

  function dotsHtml() {
    var out = [], prevAxis = null;
    STORY.forEach(function (sc, i) {
      if (prevAxis !== null && sc.axis !== prevAxis) out.push('<span class="tour-gap"></span>');
      prevAxis = sc.axis;
      var color = AXIS[sc.axis] || '#5b6b7c';
      var on = i === cur;
      var style = on ? 'background:' + color + ';border-color:' + color
        : (i < cur ? 'background:' + color + ';opacity:.5;border-color:transparent' : '');
      out.push('<button type="button" class="tour-dot' + (on ? ' is-on' : (i < cur ? ' is-past' : '')) + '"' +
        ' style="' + style + '" data-tour="jump" data-i="' + i + '"' +
        ' title="' + esc('第 ' + (i + 1) + ' 镜 · ' + sc.axis + (sc.stage ? ' · ' + sc.stage.replace('+', '+') : '') + ' · ' + sc.title) + '">' +
        (i + 1) + '</button>');
    });
    return out.join('');
  }

  function renderDock() {
    if (!dock) return;
    var sc = STORY[cur];
    var color = AXIS[sc.axis] || '#5b6b7c';
    var pos = '第 ' + (cur + 1) + '/' + N + ' 镜' + (sc.stage ? ' · ' + sc.stage.replace('+', '+') : '');
    var say = riding
      ? '<b>' + esc(sc.title) + '</b> · ' + esc(sc.say)
      : '<span class="tour-off">已下车,现在是自由操作。随时可以回到第 ' + (cur + 1) + ' 镜继续。</span>';

    var right = riding
      ? '<button type="button" class="tour-btn" data-tour="prev"' + (cur === 0 ? ' disabled' : '') + '>◀ 上一镜</button>' +
        '<button type="button" class="tour-btn is-main" id="btnNext" data-tour="next"' + (cur >= N - 1 ? ' disabled' : '') + '>▶ 下一镜</button>'
      : '<button type="button" class="tour-btn is-main" data-tour="reboard">⏸ 已下车 · 回到第 ' + (cur + 1) + ' 镜</button>' +
        '<button type="button" class="tour-btn" id="btnNext" data-tour="next"' + (cur >= N - 1 ? ' disabled' : '') + '>▶ 下一镜</button>';

    dock.className = 'tour-dock' + (minimized ? ' is-min' : '');
    dock.innerHTML =
      '<div class="tour-row">' +
      '<span class="tour-axis" style="background:' + color + '">' + esc(sc.axis) + '</span>' +
      '<span class="tour-pos">' + esc(pos) + '</span>' +
      '<span class="tour-say' + (sayOpen ? ' is-open' : '') + '" data-tour="say" title="点开/收起全文">' + say + '</span>' +
      (sc.link && riding ? '<a class="tour-btn" href="' + esc(sc.link.href) + '" target="_blank" rel="noopener">' + esc(sc.link.label) + ' →</a>' : '') +
      right +
      '<button type="button" class="tour-btn" data-tour="stage">流程位置</button>' +
      '<button type="button" class="tour-btn" data-tour="backend">后端发生了什么</button>' +
      '<button type="button" class="tour-btn" data-tour="min" title="折叠/展开导览条">' + (minimized ? '▲' : '▼') + '</button>' +
      '</div>' +
      '<div class="tour-dots">' + dotsHtml() + '</div>';
    d.body.style.paddingBottom = (dock.offsetHeight + 8) + 'px';
  }

  function buildDock() {
    dock = d.createElement('div');
    dock.className = 'tour-dock';
    dock.setAttribute('aria-label', '分镜导览条');
    d.body.appendChild(dock);
    dock.addEventListener('click', function (e) {
      var t = e.target;
      while (t && t !== dock && !(t.getAttribute && t.getAttribute('data-tour'))) t = t.parentNode;
      if (!t || t === dock || !t.getAttribute) return;
      if (t.hasAttribute('disabled')) return;
      var act = t.getAttribute('data-tour');
      if (act === 'next') goTo(cur + 1);
      else if (act === 'prev') goTo(cur - 1);
      else if (act === 'jump') goTo(parseInt(t.getAttribute('data-i'), 10) || 0);
      else if (act === 'reboard') reboard();
      else if (act === 'stage') openModal(stageModal(STORY[cur]));
      else if (act === 'backend') openModal(backendModal(STORY[cur]));
      else if (act === 'say') { sayOpen = !sayOpen; renderDock(); }
      else if (act === 'min') { minimized = !minimized; renderDock(); }
    });
    renderDock();
  }

  /* 外部驱动(评审控制台 iframe 直接调 S.nextStep)也让导览条跟上:
     导览自己推进时走的是 quiet 通道,不会发 scenario 事件,所以收到这个事件必然来自外部驱动。 */
  w.addEventListener('scenario', function () {
    var next = deriveCur();
    if (next === cur) return;
    cur = next;
    sayOpen = false;
    renderDock();
  });

  /* 下车侦测:非导览发起的 hash 变化 = 用户自己点走了 */
  w.addEventListener('hashchange', function () {
    if (navigating) { navigating = false; return; }
    /* 快速连推时多个 hashchange 事件排队,单旗会被第一个事件耗尽;
       只要落点仍是当前镜的 route,就视为导览自身导航,不算下车。 */
    if (riding && w.location.hash === STORY[cur].route) return;
    if (riding) { riding = false; renderDock(); }
  });

  if (d.body) buildDock();
  else w.addEventListener('DOMContentLoaded', buildDock);

  /* 首屏:把首镜的焦点也点亮一次(不动状态) */
  w.setTimeout(function () { if (riding) spotlight(); }, 160);

  w.TOUR = { story: STORY, go: goTo, at: function () { return cur; } };
})(window, document);
