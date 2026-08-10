/* ===== 导览层 · 分镜导览条(主线 + 支线)+ 三枚浮层 + 手机浮窗(R86 A5/A6/A7/A4/A1)=====
   职责边界:本文件是**导览层**,允许解说口吻;业务界面文案不归它管,也不往业务界面里写导览词。
   契约(不可破坏):
   - 不动 T1-T12 状态机:分镜表只是它上面的一层索引,推进仍走 S.tourGoto()/S.commit,S.commit 仍是唯一状态变更入口。
   - 不改 actionLog 结构:「后端发生了什么」只读 S.stepLog(stepId) 做呈现。
   - 通道取名取色唯一处 = window.LANES(data.js);徽章渲染走 UI.laneBadge。
   - CSS 页级注入,不动 tokens.css。
   实现要点:
   - 主线镜 = 场景步(ref=T1…T12)的一层索引;推进一镜 = 补状态到该镜所需步 → 跳 hash → 聚焦高亮 → 换旁白。
   - 支线镜 = 主线某一步之上再叠一条动作链(sc.acts,走 S.commit);跳到支线镜 = 先重放主线到 ref 步,再逐动作 commit。
     acts 是**累积链**(从分岔点到本镜的全部动作),重放器统一执行 —— 任何一镜都能被直接点到,状态可复现。
   - 状态机不可逆,所以「上一镜 / 跳镜 / 离开支线」实现为重放(S.tourGoto(0) 重新播种后静默连推)。
   - 下车 = 非导览发起的 hashchange;回来只重新导航 + 重新聚焦,不动状态。
   - R88 A6⑲:每镜带 role,进镜自动 S.setRole(排在 applyState 之后 —— 回跳会重新播种,role 会被冲掉);
     下车后用户自己切过的身份导览不改回(reboard 不调 applyRole)。 */
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

  /* 通道取名取色唯一处 = window.LANES */
  function laneDef(name) {
    var L = w.LANES || [];
    for (var i = 0; i < L.length; i++) if (L[i].name === name || L[i].key === name) return L[i];
    return null;
  }
  function laneColor(name) { var x = laneDef(name); return x ? x.color : '#5b6b7c'; }

  /* ---------------- 分镜树 ----------------
     {sid, ref(场景步 id 或 null), axis, stage, route, focus(选择器 或 备选数组),
      lane(LANES 名), laneNote, title, say,
      role(本镜的操作视角:进镜自动 S.setRole;R88 A6⑲,缺省 = 区复核员)
      branches:[{label,sid}](分岔点)· br(所属支线 id)· back(支线尽头回哪一镜)· acts[{action,params}](支线累积动作链)
      graph(流程图:mh/rd/pl/dp)· node(当前所在节点)· phone{src,title}(自动弹手机浮窗)}
     R88 A6⑲ 角色口径:镜里要看的那个动作由谁做,role 就写谁 —— 主管落锤(驳回/裁定/抽审/提级/参数变更)
     的镜写「复核主管」,其余写「区复核员」;班组镜的现场视角由右侧手机浮窗自己承载,工作台身份不跟着变。 */
  var STORY = [
    /* ============ 主线 18 镜 ============ */
    {
      sid: 'S0', ref: null, axis: '序幕', stage: '', route: '#/m1', focus: '.tabs',
      lane: null, laneNote: '尚未进入任何通道', graph: 'mh', node: null,
      title: '今晚 19:00 · 三线全景',
      say: '值班交接刚过。井盖、路面、管网三条线的待核查队列摆在同一张工作台上,tab 上的数字是每条线此刻压着多少件。时钟停在 19:00——它是随处置步进的工作时钟,不按现实秒走。'
    },
    {
      sid: 'S1', ref: 'T1', axis: '井盖线', stage: '发现', route: '#/m1/clue/CL-0417', focus: '.objcard',
      lane: '机器直派', graph: 'mh', node: 'mh_find',
      title: 'MH-0417 位移传感器报警',
      say: '19:02,Al Jimi 街区 MH-0417 的位移传感器报警,报文带已认证设备签名,属于硬证据。注意抬头的措辞:它现在只是「线索」——AI 与规则只产线索,定性权在人。'
    },
    {
      /* focus 用备选数组:m1 详情把机械校验四项降成折叠区后 .checks 这个类名可能不在了,
         退到文本命中「机械校验」所在的卡 —— 焦点不跟着别人的 DOM 变动一起烂掉。 */
      sid: 'S2', ref: 'T1', axis: '井盖线', stage: '规则校验', route: '#/m1/clue/CL-0417',
      focus: ['.checks', 'text:机械校验', 'text:规则包版本'],
      lane: '机器直派', graph: 'mh', node: 'mh_gate',
      title: '第二闸 · 机械校验四项逐项打钩',
      say: '第一闸是 AI 识别,第二闸是机械证据校验:硬编码判据逐项打钩,每项留规则包版本号。井盖线四项全过——两闸都过的高危件,才有资格先派后审。'
    },
    {
      sid: 'S3', ref: 'T1', axis: '井盖线', stage: '分级路由', route: '#/m2/tickets', focus: '#tk-WO-9001',
      lane: '机器直派', graph: 'mh', node: 'mh_machine',
      title: '机器直派 · 机器先把单派出去',
      say: '双闸齐全,系统当场把工单派给排水一班,同时镜像写进区市政工单系统。这条通道叫机器直派,判据句是「先派后审」:派单是处置调度,不是定性——人还没签字,告警就还不成立。'
    },
    {
      sid: 'S4', ref: 'T2', axis: '井盖线', stage: '处置', route: '#/m1',
      focus: ['text:并行复核', 'text:复核窗'],
      lane: '机器直派', graph: 'mh', node: 'mh_machine',
      title: '并行复核窗 · 15 分钟倒计时',
      say: '19:03,复核窗开启,倒计时挂在卡片上。人这时二选一:确认,等于对已经出动的这一单追认;撤回,班组当场召回。先派后审的代价明写在卡上——这类件全量拘进主管抽审。'
    },
    /* R88 A6② 班组段细化:原「班组端回传」一镜拆三镜,每镜只落该格的动作,
       右侧手机浮窗因此逐镜联动(接单 → 到场+前照 → 后照+完工),旁白讲清每格的必填项。
       实现:三镜都停在 T2(复核窗已开、工单已派、班组还没动),再按镜叠加累积动作链 —— 与支线镜同一套重放器。 */
    {
      sid: 'S5', ref: 'T2', axis: '井盖线', stage: '处置', route: '#/m2/tickets/WO-9001', focus: '#tk-WO-9001',
      lane: '机器直派', graph: 'mh', node: 'mh_do',
      phone: { src: 'crew.html?crew=CR-01', title: '现场端 · 排水一班' },
      acts: [{ action: 'crew_accept', params: { ticketId: 'WO-9001', crew: 'CR-01', actor: '班组账号' } }],
      title: '班组端①接单与导航',
      say: '19:05,单落到排水一班手机上,班长点「接单」。这一格没有必填项——接单只是应答,接单时刻本身就是 SLA 的第一个计时点。右侧浮窗就是班组那一屏,和工作台共用同一份状态,推进一镜它跟着翻。接不了也有出口:拒单要选原因,单退回调度重派。'
    },
    {
      sid: 'S5B', ref: 'T2', axis: '井盖线', stage: '处置', route: '#/m2/tickets/WO-9001', focus: '#tk-WO-9001',
      lane: '机器直派', graph: 'mh', node: 'mh_do',
      phone: { src: 'crew.html?crew=CR-01', title: '现场端 · 排水一班' },
      acts: [
        { action: 'crew_accept', params: { ticketId: 'WO-9001', crew: 'CR-01', actor: '班组账号' } },
        { action: 'crew_arrive', params: { ticketId: 'WO-9001', crew: 'CR-01', actor: '班组账号' } },
        { action: 'crew_photo', params: { ticketId: 'WO-9001', crew: 'CR-01', phase: '修复前', actor: '班组账号' } }
      ],
      title: '班组端②到场与修复前照(两项必填)',
      say: '到场这一格开始有硬门槛:到场定位必填,修复前照必填——没有前照,后面的 AI 复验没有比对基准,复验这一环整条落空。必填不是表单洁癖,是复验链的入口条件。班组按「到场」后手机上直接跳到拍照页,拍完才让往下走。'
    },
    {
      sid: 'S5C', ref: 'T2', axis: '井盖线', stage: '处置', route: '#/m2/tickets/WO-9001', focus: '#tk-WO-9001',
      lane: '机器直派', graph: 'mh', node: 'mh_do',
      phone: { src: 'crew.html?crew=CR-01', title: '现场端 · 排水一班' },
      acts: [
        { action: 'crew_accept', params: { ticketId: 'WO-9001', crew: 'CR-01', actor: '班组账号' } },
        { action: 'crew_arrive', params: { ticketId: 'WO-9001', crew: 'CR-01', actor: '班组账号' } },
        { action: 'crew_photo', params: { ticketId: 'WO-9001', crew: 'CR-01', phase: '修复前', actor: '班组账号' } },
        { action: 'crew_photo', params: { ticketId: 'WO-9001', crew: 'CR-01', phase: '修复后', actor: '班组账号' } },
        { action: 'crew_done', params: { ticketId: 'WO-9001', crew: 'CR-01', actor: '班组账号' } }
      ],
      title: '班组端③修复后照与完工提交(必填 + 可选)',
      say: '最后一格:修复后照必填、完工说明必填,备注与材料用量可选。后照一交,完工提交这一步同时把 AI 复验叫起来——复验是事件触发,不是定时轮询。五格状态机到此走完,工单转「已完工」等复验与验收。'
    },
    {
      sid: 'S6', ref: 'T4', axis: '井盖线', stage: '复验闭环', route: '#/m1',
      focus: ['text:复验判不出', 'text:存疑待人裁'],
      lane: '机器直派', graph: 'mh', node: 'mh_verify',
      branches: [{ label: '↳ 深入:人裁闭环与归档留痕', sid: 'M1' }],
      title: 'AI 复验判不出 · 存疑待人裁',
      say: '19:24,AI 拿修复前后两张图做配准复验,判不出。系统把它转「存疑待人裁」,不是默认打回——判不出宁可升给人,也不替人做减法。人裁合格,这一件才算闭环。'
    },
    {
      sid: 'S7', ref: 'T5', axis: '支线·异常', stage: '规则校验', route: '#/m1/clue/CL-0562',
      focus: ['text:为什么它不走', 'text:无传感器硬证据'],
      lane: '加急人工', graph: 'mh', node: 'mh_urgent',
      title: '对照件 · 纯视觉 0.31、无硬证据',
      say: '19:30,Hili 街区一件井盖异常,置信 0.31,纯视觉,没有传感器硬证据,机械四项没全过——不满足先派后审的硬条件,进加急人工 30 分钟档。低置信不等于放过:高危级本身不看置信度,该人核照样人核。'
    },
    {
      sid: 'S8', ref: 'T6', axis: '支线·异常', stage: '规则校验', route: '#/m1/clue/CL-0588',
      focus: ['text:机械校验硬失败', 'text:零自动归档'],
      lane: '驳回与转办', graph: 'mh', node: 'mh_reject',
      branches: [{ label: '↳ 深入:驳回落锤与误报回流', sid: 'F0' }],
      title: '树影误报 · 机械驳回也不自动归档',
      say: '19:40,一件树影造成的持续假目标,机械校验硬失败。系统没有直接归档——高危件零自动归档是硬线,证据卡置顶转人工驳回确认。人也可以反过来推翻机械判定,理由码必填,误杀样本回流规则组。'
    },
    {
      sid: 'S9', ref: 'T7', axis: '路面线', stage: '发现+规则校验', route: '#/m1/line/rd',
      focus: ['text:自动升格', 'text:免人工'],
      lane: '自动处理', graph: 'rd', node: 'rd_auto',
      title: '路面车载批量 · 五项校验全过',
      say: '20:00,路面车载采集的一批进池。路面线的机械校验是五项,逐项打钩。养护级、高置信、机械全过——三条同时成立才自动升格,免人工。横幅上写着抽审兜底:免人工不等于免审计,每条照样一条日志。'
    },
    {
      sid: 'S10', ref: 'T7', axis: '路面线', stage: '分级路由+处置', route: '#/m2/tickets', focus: '#tk-WO-9007',
      lane: '自动处理', graph: 'rd', node: 'rd_plan',
      branches: [{ label: '↳ 深入:主管提级与完工抽查', sid: 'R1' }],
      title: '并入周期养护的批量工单',
      say: '升格后的件不单独开单,并入周批养护工单——这是自动处理通道,绿色,判据句是「不派人定性」。同一条流水线,井盖线那件走的是红色的机器直派,路面线这件走到这里是绿色:分档不同的是级别与证据,不是系统。'
    },
    {
      sid: 'S11', ref: 'T8', axis: '管网线', stage: '发现', route: '#/m1/line/pl',
      focus: ['text:IV-0071', 'text:调查案'],
      lane: null, laneNote: '调查案(观察窗 + 现场核查)', graph: 'pl', node: 'pl_case',
      branches: [{ label: '↳ 深入:立案之后', sid: 'P1' }],
      title: 'DMA-07 水量平衡越限 · 自动开调查案',
      say: '20:30,DMA-07 分区水量平衡越限。先响的是硬编码水力学规则,不是 AI;AI 在后面做时序判型,只给出「渗漏嫌疑」这个建议。管网线形态与前两线根本不同:不是线索池等人审,是预警开调查案,人只在立案与结案两点拍板。'
    },
    {
      sid: 'S12', ref: 'T8', axis: '管网线', stage: '分级路由', route: '#/m2/tickets', focus: '#tk-WO-9008',
      lane: '自动处理', graph: 'pl', node: 'pl_dev',
      title: 'SN-FM03 自检失败 · 设备维修单',
      say: '同一时刻还有一件:流量计 SN-FM03 自检失败,系统直接开设备维修单,承接方是传感网运维方,不惊动三线班组。判型职权在这里划死——爆管与设备故障走规则与设备通道,不经 AI 定性。先排设备故障,再报业务异常。'
    },
    {
      sid: 'S13', ref: 'T9', axis: '支线·越级与压力', stage: '分级路由', route: '#/m2/dispatch',
      focus: ['text:抢占', 'text:WO-8871'],
      lane: '常规人工', laneNote: '批量加急分诊 · 显名降级', graph: 'dp', node: 'dp_none',
      branches: [{ label: '↳ 深入:抢占调度三步', sid: 'O1' }],
      title: '承接池无空闲班组 · 过载三步',
      say: '21:00,Zakher 又来一件紧急级井盖,可承接池里没有空闲班组。过载三步依次落地:先发只读预警喊现场,再把超额件显名降级进批量加急分诊、件件可抽审,最后由当班的复核主管决定要不要抢占在途的养护班组。挂起会让 SLA 停表,班组释放。'
    },
    {
      sid: 'S14', ref: 'T10', axis: '支线·越级与压力', stage: '发现', route: '#/m4',
      focus: ['text:PR-0301', 'text:热线上报'],
      lane: null, laneNote: '热线上报 · 人工甄别并入(不直接进加急队列)', graph: 'mh', node: 'mh_find',
      branches: [{ label: '↳ 深入:加急件超时兜底派单', sid: 'H1' }],
      title: '热线上报并入观测 · 受理编号与去重合并',
      say: '21:10,12345 市政热线接到同一点位的来电,接线员录入受理。系统先出受理编号回执,再与传感器那条线索去重合并——同设施同类目在活跃期内并作一次观测,不新开线索,证据叠加,重复来电计数可见。市民渠道没有自助客户端,接线员是录入身份、没有定性权;热线件也不直接进加急队列,先进人工甄别。'
    },
    {
      sid: 'S15', ref: 'T11', axis: '支线·越级与压力', stage: '复验闭环', route: '#/m2/recon', focus: 'text:RC-0011',
      lane: null, laneNote: '人工裁定(24h 内)', graph: 'dp', node: 'dp_recon',
      title: '对账队列 · 1 条不一致',
      say: '21:20,与客户工单系统的日对账出现 1 条不一致。裁决规则写在页首:处置状态以客户系统为准,巡检定性以我方为准。这个界面不是第二真源,它是镜像;对不上就人工裁定,裁定本身也是一条动作。同一时刻 DMA-07 流量回归基线,管网那条线也走到了建议结案。'
    },
    {
      sid: 'S16', ref: 'T12', axis: '支线·越级与压力', stage: '处置', route: '#/m2/tickets',
      focus: ['text:气象预警接入', 'text:雨前清掏', '#tk-WO-9012'],
      lane: null, laneNote: '气象预警 · 雨前清掏专项任务包', graph: 'mh', node: 'mh_route',
      title: '气象预警接入 · 雨前清掏专项任务包下发',
      say: '21:30,气象预警接进来,系统按预警提前量起一张「雨前清掏专项任务包」派下去。它是计划性任务:在池件的分级一件不动,派单准入标准一条不改,SLA 档也不变——该派的照派,该人审的照人审。真正的治理手柄在另一处:上级主管部门可以直接关掉某个类目的机器直派,关是即时生效的安全侧动作,区里不服可以申诉,重开要按数据判据批。'
    },
    {
      sid: 'S17', ref: null, axis: '终幕', stage: '复验闭环', route: '#/m6', focus: '#m6-ontology-log',
      lane: null, laneNote: '全通道共用同一本日志', graph: null, node: null,
      title: '一晚上的动作,都在同一本日志上',
      say: '这一晚发生的一切——谁、何时、对什么对象、做了什么——都记在同一本日志上,人做的和服务账号做的一视同仁。上面三张表是它的骨架:对象、链接、动作。AI 的每一格权限,也是开在这张动作表上的。'
    },

    /* ============ 支线 M · 井盖人裁闭环(分岔点 S6,回 S7)============ */
    {
      sid: 'M1', br: 'M', back: 'S7', ref: 'T4', axis: '井盖线', stage: '复验闭环',
      route: '#/m2/tickets/WO-9001', focus: '#tk-WO-9001',
      lane: null, laneNote: '人裁闭环(复核主管)', graph: 'mh', node: 'mh_close',
      acts: [{ action: 'mh_confirm_close', params: { ticketId: 'WO-9001', actor: '复核主管' } }],
      title: '人裁闭环 · 合格即验收',
      say: 'AI 判不出的那一件交回人手里:复核主管看过修复前后两张图,判合格,工单转「已验收」。重点不在结论本身,在留痕——闭环同时把当时生效的规则版本写进工单,日后回查能知道这件是按哪一版判据结的。'
    },
    {
      sid: 'M2', br: 'M', back: 'S7', ref: 'T4', axis: '井盖线', stage: '复验闭环',
      route: '#/m6', focus: '#m6-ontology-log',
      lane: null, laneNote: '人裁与机器同一本账', graph: 'mh', node: 'mh_close',
      acts: [{ action: 'mh_confirm_close', params: { ticketId: 'WO-9001', actor: '复核主管' } }],
      title: '归档留痕 · 人裁与机器同一张表',
      say: '刚才那一下人裁,落在日志上的形态与前面机器落的每一条完全一样:时刻、账号、动作、对象、参数、快照号。人裁不是「系统外的例外」,它是同一张动作表上的一行——这是后面所有审计、回放、导出的前提。'
    },

    /* ============ 支线 F · 驳回落锤与误报回流(分岔点 S8,回 S9)============ */
    {
      sid: 'F0', br: 'F', back: 'S9', ref: 'T6', axis: '支线·异常', stage: '分级路由',
      route: '#/m1/line/mh', focus: ['text:高危驳回已拘主管抽审', 'text:已驳回归档'],
      lane: '驳回与转办', graph: 'mh', node: 'mh_reject',
      acts: [{ action: 'reject', params: { clueId: 'CL-0562', code: '④', actor: '复核主管' } }],
      title: '主管初审驳回 · 高危件当场拘抽审',
      say: '先看另一条路。Hili 那件纯视觉的 CL-0562 交到主管手里,主管初审就落了锤:驳回,原因码④类目误判——盖体在位,是移位不是缺失。高危件一驳回,系统当场把它拘进主管抽审队列,队列里那一行从「待核查」翻成「已驳回归档」。人有权当场结束一件,但结束这个动作本身仍要被复查。'
    },
    {
      sid: 'F1', br: 'F', back: 'S9', ref: 'T6', axis: '支线·异常', stage: '分级路由',
      route: '#/m1/clue/CL-0588', focus: ['text:已驳回', '.objcard'],
      lane: '驳回与转办', graph: 'mh', node: 'mh_reject',
      acts: [
        { action: 'reject', params: { clueId: 'CL-0562', code: '④', actor: '复核主管' } },
        { action: 'reject', params: { clueId: 'CL-0588', code: '①', actor: '区复核员' } }
      ],
      title: '人工驳回确认 · 原因码必填',
      say: '树影这一件由人来落锤:驳回,原因码①拍摄干扰。机械闸拦不住的东西,系统不敢替人归档;但人一旦驳回,这条记录带着原因码进日志——驳回不是终点,是回流的起点。'
    },
    {
      sid: 'F2', br: 'F', back: 'S9', ref: 'T6', axis: '支线·异常', stage: '分级路由',
      route: '#/m1', focus: ['text:误报原因回流', '.banner'],
      lane: '驳回与转办', graph: 'mh', node: 'mh_arch',
      acts: [
        { action: 'reject', params: { clueId: 'CL-0562', code: '④', actor: '复核主管' } },
        { action: 'reject', params: { clueId: 'CL-0588', code: '①', actor: '区复核员' } },
        { action: 'fp_feedback', params: { clueId: 'CL-0588', code: '①', ruleId: 'MH-R03', actor: '区复核员' } }
      ],
      title: '原因回流 · 按码找到消费者',
      say: '原因码①的消费者是模型样本回流;这一条同时挂到判据 MH-R03「多帧一致」上,进参数调优候选。谁该为这次误杀做改进,写在记录里,不靠会上口头交办。六个原因码各有各的下游,回流路径是固定的。'
    },
    {
      sid: 'F3', br: 'F', back: 'S9', ref: 'T6', axis: '支线·异常', stage: '规则校验',
      route: '#/m6/rules', focus: ['text:MH-R03', 'text:影子试算'],
      lane: null, laneNote: '判据参数调优(影子试算)', graph: 'mh', node: 'mh_arch',
      acts: [
        { action: 'reject', params: { clueId: 'CL-0562', code: '④', actor: '复核主管' } },
        { action: 'reject', params: { clueId: 'CL-0588', code: '①', actor: '区复核员' } },
        { action: 'fp_feedback', params: { clueId: 'CL-0588', code: '①', ruleId: 'MH-R03', actor: '区复核员' } },
        { action: 'rule_param_change', params: { ruleId: 'MH-R03', key: 'agree', val: 0.88, reason: '树影误杀样本回流(原因码①)', actor: '复核主管' } }
      ],
      title: '规则参数调优 · 走影子试算',
      say: '回流到判据这一层就成了具体动作:把 MH-R03 的帧间一致率从 0.8 提到 0.88。要点是改之前先看它会改变今天的哪几件——试算把今天经过这条规则的件逐件回放,路由会变的当场列出来。这一条的答案是零件改变,原因也直接写出来了:今天这 7 件画面识别件全卡在置信线上,最高一件 0.83 还没到 0.85,一致率根本轮不到起作用。调参的人在生效前就知道自己拧错了旋钮——这比事后看误派率省一整个试点周。提交也只是留痕,当前运行判定一行不动,正式生效仍要走审批。'
    },

    /* ============ 支线 R · 路面主管提级与完工抽查(分岔点 S10,回 S11)============
       R88 A1⑬:原「公众催办计数达阈值 → 自动提级」整条推翻(rd_urge_boost 已从数据层删除)。
       重复来电只是排序的输入,提级改为复核主管主动做的显名动作(clue_escalate,原因必填)。 */
    {
      sid: 'R1', br: 'R', back: 'S11', ref: 'T7', axis: '路面线', stage: '分级路由',
      route: '#/m1/line/rd', focus: ['text:CL-0311', 'text:提级', 'text:急修'],
      lane: '加急人工', laneNote: '主管主动提级 · 原因必填', graph: 'rd', node: 'rd_urgent',
      acts: [{ action: 'clue_escalate', params: { clueId: 'CL-0311', reason: '同一路口重复来电反映沉陷加深,主干道行车安全优先', actor: '复核主管' } }],
      title: '主管主动提级 · 养护 → 急修',
      say: '批量池里那条 CL-0311,同一路口的重复来电已经攒了几次。注意系统在这里没有自动提级:重复来电只是排序的输入,不构成定性理由。提级是复核主管自己落的一个显名动作,原因必填、进日志可回查;提完级这一件的车道从批量转单条必审,SLA 按急修档重算。'
    },
    {
      sid: 'R2', br: 'R', back: 'S11', ref: 'T7', axis: '路面线', stage: '处置',
      route: '#/m2/tickets/WO-9007', focus: '#tk-WO-9007',
      lane: '自动处理', laneNote: '并入周批 · 处置流程同款', graph: 'rd', node: 'rd_do',
      phone: { src: 'crew.html?crew=CR-03', title: '现场端 · 道路养护班' },
      acts: [
        { action: 'clue_escalate', params: { clueId: 'CL-0311', reason: '同一路口重复来电反映沉陷加深,主干道行车安全优先', actor: '复核主管' } },
        { action: 'crew_accept', params: { ticketId: 'WO-9007', actor: '班组账号' } },
        { action: 'crew_arrive', params: { ticketId: 'WO-9007', actor: '班组账号' } },
        { action: 'crew_photo', params: { ticketId: 'WO-9007', phase: '修复前', actor: '班组账号' } },
        { action: 'crew_photo', params: { ticketId: 'WO-9007', phase: '修复后', actor: '班组账号' } },
        { action: 'crew_done', params: { ticketId: 'WO-9007', actor: '班组账号' } }
      ],
      title: '周批养护落地 · 班组五格走完',
      say: '周批那张工单在道路养护班手上走完五格:接单、到场、前后双照、完工提交。右侧浮窗是班组自己那一屏。批量件的处置流程和单件一模一样,差别只在前面是怎么进的通道——通道分档管的是「谁来定性、多久之内」,不是换一套处置系统。'
    },
    {
      sid: 'R3', br: 'R', back: 'S11', ref: 'T7', axis: '路面线', stage: '复验闭环',
      route: '#/m4', focus: ['text:完工抽查', 'text:抽审'],
      lane: null, laneNote: '抽查兜底(复核主管)', graph: 'rd', node: 'rd_spot',
      acts: [
        { action: 'clue_escalate', params: { clueId: 'CL-0311', reason: '同一路口重复来电反映沉陷加深,主干道行车安全优先', actor: '复核主管' } },
        { action: 'crew_accept', params: { ticketId: 'WO-9007', actor: '班组账号' } },
        { action: 'crew_arrive', params: { ticketId: 'WO-9007', actor: '班组账号' } },
        { action: 'crew_photo', params: { ticketId: 'WO-9007', phase: '修复前', actor: '班组账号' } },
        { action: 'crew_photo', params: { ticketId: 'WO-9007', phase: '修复后', actor: '班组账号' } },
        { action: 'crew_done', params: { ticketId: 'WO-9007', actor: '班组账号' } },
        { action: 'rd_spot_check', params: { ticketId: 'WO-9007', result: '合格', actor: '复核主管' } }
      ],
      title: '完工抽查 · 免人工不等于免检',
      say: '批量养护完工件按比例现场抽查,这一单抽到了,结果合格。抽查记录同时进班组考核与判据评估统计——自动处理通道的兜底不在派单那一端,在完工之后:前面省掉的人工,后面用抽样补回来。'
    },

    /* ============ 支线 P · 管网立案下钻(分岔点 S11,回 S12)============ */
    {
      sid: 'P1', br: 'P', back: 'S12', ref: 'T8', axis: '管网线', stage: '处置',
      route: '#/m1/line/pl', focus: ['text:核查工单', 'text:调查案#'],
      lane: '常规人工', laneNote: '立案 / 结案两点拍板', graph: 'pl', node: 'pl_survey',
      acts: [
        { action: 'open_case', params: { caseId: 'IV-0071', actor: '区复核员' } },
        { action: 'pl_survey_start', params: { caseId: 'IV-0071', actor: '区复核员' } }
      ],
      card: { title: '核查任务包 · IV-0071', html: function () { return surveyCardHtml('IV-0071'); } },
      title: '立案 · 核查任务包下现场',
      say: '人在这里落第一锤:立案。立案之后立刻要回答的是「漏在哪一段」——夜间听漏加分段关阀试验,分四段推,按段收敛嫌疑区间。右侧卡片就是这个任务包本身:哪几段、用什么方法、谁去、推到第几段。管网这条线的定位主手段是现场核查,不是模型;模型给的是嫌疑排序。'
    },
    {
      sid: 'P2', br: 'P', back: 'S12', ref: 'T8', axis: '管网线', stage: '处置',
      route: '#/m1/line/pl', focus: ['text:流量回归', 'text:核查工单'],
      lane: '常规人工', laneNote: '现场核查定性', graph: 'pl', node: 'pl_leak',
      acts: [
        { action: 'open_case', params: { caseId: 'IV-0071', actor: '区复核员' } },
        { action: 'pl_survey_start', params: { caseId: 'IV-0071', actor: '区复核员' } },
        { action: 'pl_leak_confirm', params: { caseId: 'IV-0071', segment: 'PL-3007 第 3 段(PV-3021 下游 180 米)', actor: '区复核员' } }
      ],
      card: { title: '关阀试验 · 夜间最小流量对比', html: function () { return valveCardHtml('IV-0071'); } },
      title: '现场确认渗漏 · 嫌疑转确认',
      say: '关阀试验的数就摆在右边:逐段关阀,别的段一关流量就掉下去,只有第 3 段关了几乎不动——水还在往那一段后面走,这就是渗漏的证据。第 4 段还空着「待关阀」:定位到第 3 段就收敛了,剩下那段不用白跑。卡上的数是两条腿合出来的——流量计自动上报 + 班组每关一段回传一次,来源写在卡底下。听漏点位也对上,调查案由「嫌疑」转「确认」;AI 之前给的判型建议到此只起了排序作用,定性是现场加人做的。'
    },
    {
      sid: 'P3', br: 'P', back: 'S12', ref: 'T8', axis: '管网线', stage: '处置',
      route: '#/m2/tickets', focus: ['text:管网维修', 'text:水务抢修班'],
      lane: '常规人工', laneNote: '维修工单(带压作业)', graph: 'pl', node: 'pl_repair',
      phone: { src: 'crew.html?crew=CR-04', title: '现场端 · 水务抢修班' },
      acts: [
        { action: 'open_case', params: { caseId: 'IV-0071', actor: '区复核员' } },
        { action: 'pl_survey_start', params: { caseId: 'IV-0071', actor: '区复核员' } },
        { action: 'pl_leak_confirm', params: { caseId: 'IV-0071', segment: 'PL-3007 第 3 段(PV-3021 下游 180 米)', actor: '区复核员' } },
        { action: 'pl_to_repair', params: { caseId: 'IV-0071', crew: 'CR-04', actor: '复核主管' } }
      ],
      title: '转维修工单 · 调查案不关',
      say: '确认之后开维修工单,带压作业交水务抢修班,新单当场出现在右侧那台手机上。注意调查案没关:开了工单只说明处置在跑,这条案子要等流量回归才算完——处置结束和问题解决,是两件事。'
    },
    {
      sid: 'P4', br: 'P', back: 'S12', ref: 'T8', axis: '管网线', stage: '复验闭环',
      route: '#/m1/line/pl', focus: ['text:回归', 'text:IV-0071'],
      lane: null, laneNote: '复验 = 流量回归基线', graph: 'pl', node: 'pl_verify',
      acts: [
        { action: 'open_case', params: { caseId: 'IV-0071', actor: '区复核员' } },
        { action: 'pl_survey_start', params: { caseId: 'IV-0071', actor: '区复核员' } },
        { action: 'pl_leak_confirm', params: { caseId: 'IV-0071', segment: 'PL-3007 第 3 段(PV-3021 下游 180 米)', actor: '区复核员' } },
        { action: 'pl_to_repair', params: { caseId: 'IV-0071', crew: 'CR-04', actor: '复核主管' } },
        { action: 'pl_verify_ok', params: { caseId: 'IV-0071', actor: '区复核员' } }
      ],
      title: '复验 · 流量回归基线',
      say: '管网线的复验不是照片,是数:水量平衡偏差回落到阈值内并保持住,绿标才亮。井盖线拿两张图配准,路面线拿完工抽查,这条线拿流量曲线——同一副五段骨架,复验的证据形态按线走。'
    },
    {
      sid: 'P5', br: 'P', back: 'S12', ref: 'T8', axis: '管网线', stage: '复验闭环',
      route: '#/m1/line/pl', focus: ['text:结案', 'text:IV-0071'],
      lane: null, laneNote: '人签字结案 + 归档', graph: 'pl', node: 'pl_close',
      acts: [
        { action: 'open_case', params: { caseId: 'IV-0071', actor: '区复核员' } },
        { action: 'pl_survey_start', params: { caseId: 'IV-0071', actor: '区复核员' } },
        { action: 'pl_leak_confirm', params: { caseId: 'IV-0071', segment: 'PL-3007 第 3 段(PV-3021 下游 180 米)', actor: '区复核员' } },
        { action: 'pl_to_repair', params: { caseId: 'IV-0071', crew: 'CR-04', actor: '复核主管' } },
        { action: 'pl_verify_ok', params: { caseId: 'IV-0071', actor: '区复核员' } },
        { action: 'pl_close', params: { caseId: 'IV-0071', actor: '复核主管' } }
      ],
      title: '结案归档 · 签字与规则版本一起留痕',
      say: '绿标亮了,系统只出建议,签字仍在人。结案同时把证据链和当时的规则版本一并归档——这条案子按哪一版判据开的、按哪一版结的,日后可回查。从预警到归档,人拍板两次,其余全在日志上。'
    },

    /* ============ 支线 O · 抢占调度三步(分岔点 S13,回 S14)============ */
    {
      sid: 'O1', br: 'O', back: 'S14', ref: 'T9', axis: '支线·越级与压力', stage: '处置',
      route: '#/m2/dispatch', focus: ['text:WO-8871', 'text:挂起'],
      lane: null, laneNote: '抢占①让位(复核主管 · 值班)', graph: 'dp', node: 'dp_yield',
      acts: [{ action: 'preempt_yield', params: { ticketId: 'WO-8871', forClueId: 'CL-0733', actor: '复核主管' } }],
      title: '抢占①让位 · 挂起最低优先级件',
      say: '第一步不是抢人,是让位:在办件里挑优先级最低的那张——周批养护 WO-8871——挂起,SLA 停表,班组释放。挂起带原因码,条件解除后原单回队重派,不是丢掉。谁让的位、为谁让的,都在这条记录里。'
    },
    {
      sid: 'O2', br: 'O', back: 'S14', ref: 'T9', axis: '支线·越级与压力', stage: '处置',
      route: '#/m2/dispatch', focus: ['text:借调', 'text:排水二班'],
      lane: null, laneNote: '抢占②跨片借调', graph: 'dp', node: 'dp_borrow',
      acts: [
        { action: 'preempt_yield', params: { ticketId: 'WO-8871', forClueId: 'CL-0733', actor: '复核主管' } },
        { action: 'preempt_borrow', params: { crew: 'CR-02', line: '井盖', reason: 'Zakher 无空闲井盖班组,自 Hili 片区跨片借调', actor: '复核主管' } }
      ],
      title: '抢占②跨班组借调 · 持证硬校验',
      say: '第二步跨片借调。谁能借,由派单判据说了算:井盖线要密闭空间作业证,管网线要带压作业证,不符的连候选都进不去。借调放宽的是归属和距离,不是资质——这一条是硬性过滤,不是排序权重。'
    },
    {
      sid: 'O3', br: 'O', back: 'S14', ref: 'T9', axis: '支线·越级与压力', stage: '处置',
      route: '#/m2/dispatch', focus: ['text:人裁', 'text:CL-0733'],
      lane: '机器直派', laneNote: '人裁指派(显名)', graph: 'dp', node: 'dp_arb',
      acts: [
        { action: 'preempt_yield', params: { ticketId: 'WO-8871', forClueId: 'CL-0733', actor: '复核主管' } },
        { action: 'preempt_borrow', params: { crew: 'CR-02', line: '井盖', reason: 'Zakher 无空闲井盖班组,自 Hili 片区跨片借调', actor: '复核主管' } },
        { action: 'preempt_arbitrate', params: { clueId: 'CL-0733', crew: 'CR-02', reason: 'Zakher 紧急件承接池无空闲,显名指派跨片借调班组', actor: '复核主管' } }
      ],
      title: '抢占③主管人裁 · 显名指派',
      say: '前两步不解,才升到人:当班复核主管显名指派,理由进日志,件件可抽审。三步都留痕,是为了让「为什么这一单插了队、谁的单被挤了」在事后能被问出来——过载是常态,失序才是事故。'
    },

    /* ============ 支线 H · 加急件超时兜底派单(分岔点 S14,回 S15)============
       R88 A2⑧:今夜主线上没有件跨过这条线(叙事不被随机打断),专置演示件 CL-0333
       (路面急修 · 人工确认档 18:50 已过)由本镜直调 auto_overdue_dispatch 演示。 */
    {
      sid: 'H1', br: 'H', back: 'S15', ref: 'T10', axis: '支线·异常', stage: '分级路由',
      route: '#/m1/clue/CL-0333', focus: ['text:超时兜底', 'text:CL-0333', '.objcard'],
      lane: '机器直派', laneNote: '超时兜底派单(定性仍悬)', graph: 'rd', node: 'rd_urgent',
      acts: [{ action: 'auto_overdue_dispatch', params: { clueId: 'CL-0333', actor: '规则引擎' } }],
      title: '超时兜底派单 · 宁可多看一眼,不漏掉',
      say: '池子里还压着一件路面急修 CL-0333,人工确认档 18:50 就该给结论,三级升级走完仍然没人接。系统这时候不再等:自动派一个可用班组先把人送过去。要点在它没做什么——告警仍未成立、定性仍然悬着,系统只是把处置提前了,没有替人签字。代价明写在件上:这类兜底件全量拘进主管抽审,复核员事后必须补审。这是「先派尽派」的同一条哲学:宁可多看一眼,不漏掉。'
    }
  ];

  /* R88 A6⑲ · 每镜的操作视角(role):进镜自动 S.setRole,导览条显示「当前视角」。
     判据 = 这一镜要看的那个动作由谁落锤:主管落锤的镜(驳回 / 裁定 / 抽审 / 提级 / 参数变更 / 抢占仲裁 /
     兜底件抽审)= 复核主管,其余 = 区复核员;班组镜的现场视角由手机浮窗承载,工作台身份不跟着变。
     写成一张表而不是逐镜手抄同一个字符串:漏一镜就是一次「按钮为什么是灰的」的误会(⑨ 的病根)。 */
  var SUPERVISOR_SIDS = ['S13', 'S15', 'M1', 'M2', 'F0', 'F3', 'R1', 'R3', 'P3', 'P5', 'O1', 'O2', 'O3', 'H1'];
  STORY.forEach(function (sc) {
    if (!sc.role) sc.role = SUPERVISOR_SIDS.indexOf(sc.sid) >= 0 ? '复核主管' : '区复核员';
  });

  /* ---------------- 索引与树结构 ---------------- */
  var N = STORY.length;
  var IDX = {};
  STORY.forEach(function (sc, i) { IDX[sc.sid] = i; });
  var MAIN = [];
  STORY.forEach(function (sc, i) { if (!sc.br) MAIN.push(i); });
  var MAIN_N = MAIN.length;

  function idxOf(sid) { return IDX[sid] === undefined ? 0 : IDX[sid]; }
  function mainNo(i) { var k = MAIN.indexOf(i); return k < 0 ? 0 : k + 1; }
  function brList(br) {
    var out = [];
    STORY.forEach(function (sc, i) { if (sc.br === br) out.push(i); });
    return out;
  }
  /* 支线所属的分岔点(哪一镜的 branches 指向它) */
  function brParent(br) {
    for (var i = 0; i < N; i++) {
      var bs = STORY[i].branches || [];
      for (var j = 0; j < bs.length; j++) if (STORY[idxOf(bs[j].sid)].br === br) return i;
    }
    return 0;
  }
  function brLabel(br) {
    var p = STORY[brParent(br)].branches || [];
    for (var j = 0; j < p.length; j++) if (STORY[idxOf(p[j].sid)].br === br) return p[j].label.replace(/^↳\s*/, '');
    return '支线';
  }

  /* 该镜需要的状态步数(stepIdx):ref 对应场景步走完之后的位置;终幕 = 全部走完 */
  function targetIdx(sc) {
    if (!sc.ref) return sc.sid === 'S0' ? 0 : w.SCENARIO.length;
    for (var i = 0; i < w.SCENARIO.length; i++) if (w.SCENARIO[i].id === sc.ref) return i + 1;
    return 0;
  }

  function nextIdx(i) {
    var sc = STORY[i], j;
    if (sc.br) {
      for (j = i + 1; j < N; j++) if (STORY[j].br === sc.br) return j;
      return idxOf(sc.back);
    }
    for (j = i + 1; j < N; j++) if (!STORY[j].br) return j;
    return i;
  }
  function prevIdx(i) {
    var sc = STORY[i], j;
    if (sc.br) {
      for (j = i - 1; j >= 0; j--) if (STORY[j].br === sc.br) return j;
      return brParent(sc.br);
    }
    for (j = i - 1; j >= 0; j--) if (!STORY[j].br) return j;
    return i;
  }
  function hasNext(i) { return nextIdx(i) !== i; }

  /* ---------------- 页级 CSS(不动 tokens.css) ---------------- */
  (function injectCss() {
    if (d.getElementById('origen-tour-css')) return;
    var css = [
      '.tour-dock{position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--shell,#0e1210);color:var(--shell-ink,#e9eeea);',
      'border-top:1px solid var(--shell-line,#252d28);box-shadow:0 -8px 24px rgba(11,26,18,.18);font-size:12.5px}',
      '.tour-row{display:flex;align-items:center;gap:10px;padding:7px 14px;flex-wrap:nowrap;overflow-x:auto}',
      '.tour-axis{flex:none;display:inline-flex;align-items:center;gap:6px;font-weight:700;color:#fff;border-radius:20px;padding:2px 10px;white-space:nowrap}',
      '.tour-pos{flex:none;color:var(--shell-mute,#98a29b);white-space:nowrap}',
      '.tour-role{flex:none;white-space:nowrap;border:1px solid var(--shell-line,#252d28);border-radius:20px;',
      'padding:2px 9px;color:var(--shell-mute,#98a29b);cursor:help}',
      '.tour-role b{color:#fff;font-weight:600}',
      '.tour-role.is-off{border-color:#7a6a33;color:var(--gold,#c9c57e)}',
      '.tour-say{flex:1;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer}',
      '.tour-say.is-open{white-space:normal;overflow:visible;line-height:1.7}',
      '.tour-say b{color:#fff}',
      '.tour-btn{flex:none;background:var(--shell-2,#161b18);border:1px solid var(--shell-line,#252d28);color:var(--shell-ink,#e9eeea);',
      'border-radius:var(--radius-xs,6px);padding:5px 11px;font-size:12.5px;font-family:inherit;cursor:pointer;white-space:nowrap}',
      '.tour-btn:hover{background:var(--shell-3,#1d2420);color:#fff}',
      '.tour-btn[disabled]{opacity:.42;cursor:default}',
      '.tour-btn.is-main{background:var(--blue,#17a05e);border-color:var(--blue,#17a05e);color:#fff;font-weight:600}',
      '.tour-btn.is-main:hover{background:var(--blue-dark,#10804a)}',
      '.tour-btn.is-br{border-color:#5b6b7c;color:#cfd6dc}',
      '.tour-btn.is-br:hover{border-color:#9aa5ae;color:#fff}',
      '.tour-dots{display:flex;align-items:center;gap:3px;padding:0 14px 8px;flex-wrap:wrap}',
      '.tour-dot{width:22px;height:18px;border-radius:4px;border:1px solid transparent;background:#2a332e;color:#9aa49d;',
      'font-size:10.5px;line-height:1;font-family:inherit;cursor:pointer;padding:0}',
      '.tour-dot:hover{color:#fff}',
      '.tour-dot.is-on{color:#fff;font-weight:700;box-shadow:0 0 0 2px rgba(255,255,255,.22)}',
      '.tour-dot.is-past{opacity:.8}',
      '.tour-dot.is-br{width:17px;height:14px;border-radius:3px;font-size:9.5px;opacity:.55;margin-top:3px}',
      '.tour-dot.is-br.is-on{opacity:1}',
      '.tour-brgap{width:5px;flex:none}',
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
      '.tour-modal.is-wide .modal{max-width:1140px}',
      '.tour-meta{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:10px 0}',
      '.fg-tabs{display:flex;gap:6px;margin:2px 0 10px;flex-wrap:wrap}',
      '.fg-tab{border:1px solid var(--line,#e4e7e2);background:#fff;color:var(--mute,#5c6660);border-radius:20px;',
      'padding:3px 12px;font-size:12px;font-family:inherit;cursor:pointer}',
      '.fg-tab.is-on{background:#243342;border-color:#243342;color:#fff;font-weight:600}',
      '.fg-wrap{overflow-x:auto}',
      '.fg-node{cursor:default}',
      '.fg-node.is-jump{cursor:pointer}',
      '.fg-node.is-jump:hover rect.fg-box{stroke-width:2.4}',
      '.fg-legend{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-top:8px;font-size:12px;color:#5b6b7c}',
      '.fg-rule{cursor:pointer}',
      '.fg-rule:hover text{fill:#0d3f7d;font-weight:700}',
      '.fg-rulecard{margin-top:8px;padding:9px 11px;border:1px solid var(--line,#e4e7e2);border-left:3px solid #1a5fb4;',
      'border-radius:6px;background:#f7fafd}',
      '.fg-rules{margin-top:10px;border:1px solid var(--line,#e4e7e2);border-radius:6px;padding:6px 10px;background:#fbfcfa}',
      '.fg-rules>summary{cursor:pointer;font-size:12.5px;color:#243342;font-weight:600;list-style:revert}',
      '.fg-rules[open]>summary{margin-bottom:6px}',
      '.fg-key{display:inline-flex;align-items:center;gap:5px}',
      '.fg-swatch{width:12px;height:12px;border-radius:3px;display:inline-block}',
      /* 本镜数据浮卡(R87 A7):z-index 44 —— 压在导览条(40)之上、浮层遮罩(50)之下 */
      '.tour-card{position:fixed;right:20px;bottom:118px;z-index:44;width:392px;max-width:calc(100vw - 40px);',
      'background:#fff;border:1px solid var(--line,#e4e7e2);border-radius:10px;',
      'box-shadow:0 14px 40px rgba(11,26,18,.24);max-height:62vh;overflow:auto}',
      '.tour-card-hd{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 12px;',
      'border-bottom:1px solid var(--line,#e4e7e2);background:#f7f9fb;border-radius:10px 10px 0 0;',
      'position:sticky;top:0;font-size:13px;color:var(--ink-hi,#0b1a12)}',
      '.tour-card-x{border:0;background:transparent;color:var(--mute,#5c6660);font-size:15px;line-height:1;',
      'cursor:pointer;padding:0 2px;font-family:inherit}',
      '.tour-card-x:hover{color:#0b1a12}',
      '.tour-card-bd{padding:10px 12px 12px}',
      '@media (max-height:760px){.tour-card{bottom:96px;max-height:52vh}}'
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
  var appliedSid = null; // 已叠加动作链的支线镜 sid(null = 当前状态是纯主线)

  /* 按已推进的状态步反推当前在第几镜(只认主线):冷启动/重置后自愈,不落额外存储 */
  function deriveCur() {
    var idx = S.get().stepIdx || 0, best = MAIN[0];
    for (var k = 0; k < MAIN_N; k++) if (targetIdx(STORY[MAIN[k]]) <= idx) best = MAIN[k];
    return best;
  }
  cur = deriveCur();

  /* ---------------- 聚焦高亮 ---------------- */
  var spotTimer = null;
  function clearSpot() {
    var old = d.querySelectorAll('.tour-spot');
    for (var i = 0; i < old.length; i++) old[i].classList.remove('tour-spot');
  }
  function findOne(spec) {
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
  /* focus 可以是字符串,也可以是备选数组(前面的选不中就退到后面的) */
  function findFocus(spec) {
    if (!spec) return null;
    if (typeof spec === 'string') return findOne(spec);
    for (var i = 0; i < spec.length; i++) {
      var el = findOne(spec[i]);
      if (el) return el;
    }
    return null;
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

  /* ---------------- 状态重放器(主线补推 + 支线动作链) ---------------- */
  function applyState(sc) {
    var acts = sc.acts || [];
    /* 需要「干净底」的两种情形:①本镜带支线动作链 ②上一镜叠过支线动作链(得先卸掉) */
    if (acts.length || appliedSid) S.tourGoto(0);
    S.tourGoto(targetIdx(sc));
    for (var i = 0; i < acts.length; i++) {
      var r = S.commit(acts[i].action, acts[i].params || {});
      if (!r.ok) {
        UI.toast('支线动作未执行:' + acts[i].action + ' —— ' + r.reason, 'bad');
        if (w.console && w.console.warn) w.console.warn('[tour] act failed', sc.sid, acts[i].action, r.reason);
      }
    }
    appliedSid = acts.length ? sc.sid : null;
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

  /* 手机浮窗:声明了 phone 的镜自动弹;没声明的镜不主动关(评审者可自己留着) */
  function syncPhone(sc) {
    if (sc.phone) UI.phoneSim(sc.phone.src, { title: sc.phone.title });
  }

  /* ================================================================
     R87 A7 · 本镜数据浮卡(导览层组件)
     声明了 card 的镜推进时弹一张实时数据卡,数据全部取自当前世界状态(S.get()),
     不落任何动作、不改 state;换到没声明 card 的镜自动收起。
     ================================================================ */
  var cardEl = null;
  function cardClose() { if (cardEl) cardEl.style.display = 'none'; }
  function cardBuild() {
    cardEl = d.createElement('div');
    cardEl.className = 'tour-card';
    cardEl.addEventListener('click', function (e) {
      var t = e.target;
      if (t && t.getAttribute && t.getAttribute('data-tcard') === 'close') cardClose();
    });
    d.body.appendChild(cardEl);
  }
  function syncCard(sc) {
    if (!sc.card) { cardClose(); return; }
    var html = '';
    try { html = sc.card.html() || ''; }
    catch (e) {
      html = '';
      if (w.console && w.console.warn) w.console.warn('[tour] card render failed', sc.sid, e);
    }
    if (!html) { cardClose(); return; }
    if (!cardEl) cardBuild();
    cardEl.innerHTML =
      '<div class="tour-card-hd"><b>' + esc(sc.card.title) + '</b>' +
      '<button type="button" class="tour-card-x" data-tcard="close" title="收起本镜数据卡">×</button></div>' +
      '<div class="tour-card-bd">' + html + '</div>';
    cardEl.style.display = '';
  }

  function caseFind(id) {
    var ks = S.get().investigations || [];
    for (var i = 0; i < ks.length; i++) if (ks[i].id === id) return ks[i];
    return null;
  }
  function segNo(txt) {
    var m = /第\s*(\d+)\s*段/.exec(String(txt || ''));
    return m ? parseInt(m[1], 10) : 0;
  }
  function plCrew() {
    var cs = (S.get().crews || []).filter(function (c) { return (c.lines || []).indexOf('管网') >= 0; });
    return cs.length ? cs[0].name : '—';
  }

  /* R88 A8⑮ · 关阀试验数据的来源行:这两个数不是画出来的示意,是系统里两条采集腿合出来的 ——
     一条自动(DMA 流量计按固定粒度上报),一条人工(班组每关一段回传一次作业记录)。
     核查工单号:调查案上挂到工单就写工单号,还没挂到就写任务包本身(不编号)。 */
  function flowMeterOf(k) {
    var ss = (S.get().sensors || []).filter(function (x) { return x.dma === k.dma && String(x.type || '').indexOf('流量') >= 0; });
    return ss.length ? ss[0].id : 'DMA 流量计';
  }
  function valveSourceHtml(k) {
    var wo = k.ticketId ? ('核查工单 ' + k.ticketId) : ('核查任务包 ' + k.id + '(未转工单)');
    return '<div class="tiny" style="margin-top:6px;padding-top:5px;border-top:1px dashed var(--line,#e4e7e2)">' +
      '数据源:' + esc(flowMeterOf(k)) + '(自动采集,' +
      UI.assume('15min 粒度', '采集粒度 = 假设值,试点接入 SCADA 后按实际配置') + ')+ 班组分段关阀作业回传(' + esc(wo) + ')' +
      ' —— 系统内两条采集腿合出来的数,不是外部示意图。</div>';
  }

  /* P1 · 核查任务包详情卡:从 investigation.survey 渲染(段 / 方法 / 状态 / 承办) */
  function surveyCardHtml(caseId) {
    var k = caseFind(caseId);
    if (!k || !k.survey) return '';
    var sv = k.survey, done = sv.done || 0, leak = segNo(k.leak && k.leak.segment);
    var crew = plCrew(), method = (sv.methods || []).join(' + ');
    var rows = '';
    for (var i = 1; i <= sv.segments; i++) {
      var st;
      if (leak && i === leak) st = UI.badge('渗漏确认', 'red');
      else if (i < (leak || (done + 1))) st = UI.badge('已完成', 'green');
      else if (!leak && i === done + 1) st = UI.badge('进行中', 'blue');
      else st = UI.badge('待排', 'grey');
      rows += '<tr><td class="mono">' + esc(k.facility + ' 第 ' + i + ' 段') + '</td>' +
        '<td class="tiny">' + esc(method) + '</td><td>' + st + '</td>' +
        '<td class="tiny">' + esc(crew) + '</td></tr>';
    }
    return '<div class="tiny" style="margin-bottom:6px">' + esc(k.id + ' · ' + k.dma + ' · 开包 ' + sv.t) +
      ' · 分 ' + sv.segments + ' 段</div>' +
      '<table class="tb"><thead><tr><th style="width:120px">管段</th><th>方法</th>' +
      '<th style="width:76px">状态</th><th style="width:88px">承办</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      /* R88 A8⑮:这张表的段状态就是关阀试验数据卡的点亮依据 —— 一段作业回传,一段数据才有 */
      '<div class="tiny" style="margin-top:6px">每完成一段关阀作业,班组回传一次读数,下一镜的「关阀试验」数据卡上该段才点亮;' +
      '没关过的段不预先画数。</div>';
  }

  /* P2 · 关阀试验夜间最小流量对比(SVG 小卡):逐段关阀前后对比,不降的那一段即渗漏段 */
  function seedOf(s) { var h = 0; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function valveCardHtml(caseId) {
    var k = caseFind(caseId);
    if (!k || !k.survey) return '';
    var n = k.survey.segments || 4, leak = segNo(k.leak && k.leak.segment);
    /* R88 A8⑮ 联动:P1 任务包推到第几段,P2 数据卡就只点亮到第几段 ——
       关阀数据是班组作业回传出来的,没关过的段没有数,不预先画好。 */
    var lit = Math.max(k.survey.done || 0, leak || 0);
    var seed = seedOf(k.id + k.dma), data = [], i;
    for (i = 1; i <= n; i++) {
      var b = Math.round((10.5 + ((seed >> (i * 3)) % 40) / 10) * 10) / 10;
      var drop = (leak && i === leak) ? 0.04 : (0.62 + ((seed >> (i * 2)) % 14) / 100);
      data.push({ seg: i, before: b, after: Math.round(b * (1 - drop) * 10) / 10, drop: drop, lit: i <= lit });
    }
    var max = 0;
    data.forEach(function (x) { if (x.before > max) max = x.before; });
    max = Math.ceil(max + 1);
    var W = 356, H = 168, y0 = 18, y1 = 128, gw = (W - 34) / n;
    function Y(v) { return y1 - (v / max) * (y1 - y0); }
    var svg = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="分段关阀试验前后夜间最小流量对比" style="width:100%;height:auto">'];
    svg.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"></rect>');
    svg.push('<path d="M28 ' + y1 + ' H' + (W - 6) + ' M28 ' + y0 + ' V' + y1 + '" stroke="#d8dee6"></path>');
    [0, max / 2, max].forEach(function (v) {
      svg.push('<text x="24" y="' + (Y(v) + 3.5) + '" text-anchor="end" font-size="9.5" font-family="sans-serif" fill="#8e968f">' +
        (Math.round(v * 10) / 10) + '</text>');
    });
    data.forEach(function (x, idx) {
      var gx = 32 + idx * gw, bw = Math.min(24, gw / 2.6);
      var hot = leak && x.seg === leak;
      if (!x.lit) {
        /* 未关阀的段:留位不留数(虚线空框 + 待关阀),避免把没做过的作业画成已有数据 */
        svg.push('<rect x="' + gx + '" y="' + (y1 - 26) + '" width="' + (bw * 2 + 5) + '" height="26" fill="none" ' +
          'stroke="#cfd6dc" stroke-dasharray="4 3"></rect>');
        svg.push('<text x="' + (gx + bw + 2) + '" y="' + (y1 - 32) + '" text-anchor="middle" font-size="9.5" ' +
          'font-family="sans-serif" fill="#a8b0b8">待关阀</text>');
        svg.push('<text x="' + (gx + bw + 2) + '" y="' + (y1 + 14) + '" text-anchor="middle" font-size="10.5" ' +
          'font-family="sans-serif" fill="#a8b0b8">第 ' + x.seg + ' 段</text>');
        return;
      }
      svg.push('<rect x="' + gx + '" y="' + Y(x.before) + '" width="' + bw + '" height="' + (y1 - Y(x.before)) +
        '" fill="#9db4c8"></rect>');
      svg.push('<rect x="' + (gx + bw + 5) + '" y="' + Y(x.after) + '" width="' + bw + '" height="' + (y1 - Y(x.after)) +
        '" fill="' + (hot ? '#c0392b' : '#2e7d32') + '"></rect>');
      svg.push('<text x="' + (gx + bw + 2) + '" y="' + (Y(Math.max(x.before, x.after)) - 5) + '" text-anchor="middle" font-size="9.5" ' +
        'font-family="sans-serif" fill="' + (hot ? '#c0392b' : '#5b6b7c') + '">−' + Math.round(x.drop * 100) + '%</text>');
      svg.push('<text x="' + (gx + bw + 2) + '" y="' + (y1 + 14) + '" text-anchor="middle" font-size="10.5" ' +
        'font-family="sans-serif" fill="' + (hot ? '#c0392b' : '#243342') + '">第 ' + x.seg + ' 段</text>');
    });
    svg.push('<rect x="32" y="' + (H - 14) + '" width="10" height="9" fill="#9db4c8"></rect>');
    svg.push('<text x="46" y="' + (H - 6) + '" font-size="10" font-family="sans-serif" fill="#5b6b7c">关阀前</text>');
    svg.push('<rect x="92" y="' + (H - 14) + '" width="10" height="9" fill="#2e7d32"></rect>');
    svg.push('<text x="106" y="' + (H - 6) + '" font-size="10" font-family="sans-serif" fill="#5b6b7c">关阀后</text>');
    svg.push('</svg>');
    var hotRow = leak ? data[leak - 1] : null;
    var others = data.filter(function (x) { return x.lit && (!leak || x.seg !== leak); });
    var avg = others.length ? Math.round(others.reduce(function (a, x) { return a + x.drop; }, 0) / others.length * 100) : 0;
    var line = hotRow
      ? '第 ' + hotRow.seg + ' 段 ' + hotRow.before + ' → ' + hotRow.after + ' m³/h(降 ' + Math.round(hotRow.drop * 100) +
        '%)· 其余已关 ' + others.length + ' 段平均降 ' + avg + '%'
      : (lit ? '已关 ' + lit + '/' + n + ' 段 · 平均降 ' + avg + '%' : '任务包已开,尚无分段关阀数据回传');
    return '<div class="tiny" style="margin-bottom:4px">' + esc(k.id + ' · ' + k.dma + ' · 夜间最小流量 m³/h · 已回传 ' +
      lit + '/' + n + ' 段') + '</div>' +
      svg.join('') +
      '<div class="tiny" style="margin-top:4px">' + esc(line) + '</div>' +
      '<div class="tiny">' + UI.assume('流量数值为假设值', '关阀试验流量 = 假设值,试点接入 SCADA 后取实测') + '</div>' +
      valveSourceHtml(k);
  }

  /* R88 A6⑲ · 进镜自动切到本镜的操作视角。
     必须排在 applyState 之后:回跳 / 进支线时 S.tourGoto(0) 会重新播种,role 跟着回落坐席默认。
     下车之后不改回(用户自己切过的身份留着),所以 reboard() 不调用它。 */
  function applyRole(sc) {
    var want = sc.role;
    if (!want || !S.setRole) return;
    var roles = (S.dict && S.dict().roles) || [];
    if (roles.indexOf(want) < 0) {
      if (w.console && w.console.warn) w.console.warn('[tour] 未知角色', sc.sid, want);
      return;
    }
    if (S.get().role !== want) S.setRole(want);
  }

  function goTo(i, opts) {
    i = Math.max(0, Math.min(i, N - 1));
    var sc = STORY[i];
    cur = i;
    riding = true;
    sayOpen = false;
    if (!(opts && opts.keepState)) applyState(sc);
    applyRole(sc);
    renderDock();
    navigate(sc);
    syncPhone(sc);
    syncCard(sc);
  }

  /* 回到导览:只重新导航 + 重新聚焦,不动状态 */
  function reboard() {
    riding = true;
    renderDock();
    navigate(STORY[cur]);
  }

  /* ================================================================
     R86 A7 · 流程位置图(按线的真实分支流程图,不是五节点直线)
     FLOWGRAPH[line] = {name, start, nodes[{id,label,sub,x,y,w,h,lane,sid}], edges[{from,to,label,type,dash}]}
     type:h(右行折线)/ v(下行)/ vu(上行)/ back(下绕回流)
     ================================================================ */
  var NH = 50;
  function nd(id, label, sub, x, y, wd, lane, sid) {
    return { id: id, label: label, sub: sub || '', x: x, y: y, w: wd, h: NH, lane: lane || null, sid: sid || null };
  }
  var FLOWGRAPH = {
    mh: {
      name: '井盖线', line: '井盖', vb: [1040, 376], start: 'mh_find',
      nodes: [
        nd('mh_find', '发现', '传感器报警 / 视觉过检', 16, 20, 190, null, 'S1'),
        nd('mh_gate', '规则校验', '机械四项 · 双闸硬条件', 16, 110, 190, null, 'S2'),
        nd('mh_route', '分级路由', '按证据与级别分档', 16, 200, 190, null, 'S16'),
        nd('mh_machine', '机器直派', '先派后审 · 并行复核 15 分', 286, 12, 270, '机器直派', 'S3'),
        nd('mh_urgent', '加急人工', '先审后派 · 分钟级确认', 286, 78, 270, '加急人工', 'S7'),
        nd('mh_normal', '常规人工', '批量例行确认后并入计划', 286, 144, 270, '常规人工', null),
        nd('mh_auto', '自动处理', '设备维修单 · 不派三线班组', 286, 210, 270, '自动处理', null),
        nd('mh_reject', '驳回与转办', '人工驳回确认 · 零自动归档', 286, 276, 270, '驳回与转办', 'F1'),
        nd('mh_do', '处置', '班组五格状态机', 616, 78, 190, null, 'S5'),
        nd('mh_dev', '设备侧闭环', '传感网运维方承接', 616, 210, 190, null, null),
        nd('mh_arch', '归档 · 原因回流', '按原因码找消费者', 616, 276, 190, null, 'F2'),
        nd('mh_verify', '复验闭环', 'AI 配准判定', 846, 78, 178, null, 'S6'),
        nd('mh_close', '人裁闭环', '判不出即人裁 · 留版本', 846, 180, 178, null, 'M1')
      ],
      edges: [
        { from: 'mh_find', to: 'mh_gate', type: 'v' },
        { from: 'mh_gate', to: 'mh_route', type: 'v' },
        { from: 'mh_route', to: 'mh_machine', label: 'MH-R01' },
        { from: 'mh_route', to: 'mh_urgent', label: 'MH-R02' },
        { from: 'mh_route', to: 'mh_normal', label: 'MH-R06' },
        { from: 'mh_route', to: 'mh_auto', label: 'MH-R04' },
        { from: 'mh_route', to: 'mh_reject', label: 'MH-R05' },
        { from: 'mh_machine', to: 'mh_do' },
        { from: 'mh_urgent', to: 'mh_do' },
        { from: 'mh_normal', to: 'mh_do' },
        { from: 'mh_auto', to: 'mh_dev' },
        { from: 'mh_reject', to: 'mh_arch' },
        { from: 'mh_do', to: 'mh_verify' },
        { from: 'mh_verify', to: 'mh_close', type: 'v', label: '判不出' },
        { from: 'mh_verify', to: 'mh_do', type: 'back', via: 348, dash: true, label: '复验打回' },
        { from: 'mh_machine', to: 'mh_arch', dash: true, label: '窗内撤回' }
      ],
      pre: {
        mh_gate: 'mh_find', mh_route: 'mh_gate',
        mh_machine: 'mh_route', mh_urgent: 'mh_route', mh_normal: 'mh_route', mh_auto: 'mh_route', mh_reject: 'mh_route',
        mh_do: 'mh_machine', mh_dev: 'mh_auto', mh_arch: 'mh_reject',
        mh_verify: 'mh_do', mh_close: 'mh_verify'
      },
      note: '判据句:双传感器互证(MH-R01)才走先派后审;单一传感器越限只能先审后派。'
    },
    rd: {
      name: '路面线', line: '路面', vb: [1040, 356], start: 'rd_find',
      nodes: [
        nd('rd_find', '发现', '车载过检 / 固定相机', 16, 20, 190, null, 'S9'),
        nd('rd_gate', '规则校验', '机械五项逐项打钩', 16, 110, 190, null, 'S9'),
        nd('rd_route', '分级路由', '置信 × 来源 × 道路等级', 16, 200, 190, null, null),
        nd('rd_urgent', '加急人工', '高置信 + 多源确证 + 主干道', 286, 12, 270, '加急人工', 'R1'),
        nd('rd_normal', '常规人工', '单源中置信 → 批量半审', 286, 78, 270, '常规人工', null),
        nd('rd_auto', '自动处理 · 自动升格', '养护级 × 高置信 × 机械全过', 286, 144, 270, '自动处理', 'S9'),
        nd('rd_note', '自动处理 · 记账', '观察级 → 入劣化曲线', 286, 210, 270, '自动处理', null),
        nd('rd_reject', '驳回与转办', '低置信 / 树影类误报特征', 286, 276, 270, '驳回与转办', null),
        nd('rd_plan', '开单 / 并入周批', '按级别单开或并批', 616, 78, 190, null, 'S10'),
        nd('rd_curve', '劣化曲线', '不开单 · 只记台账', 616, 210, 190, null, null),
        nd('rd_arch', '归档 · 样本回流', '原因码① 回流模型', 616, 276, 190, null, null),
        nd('rd_do', '处置', '班组五格状态机', 846, 78, 178, null, 'R2'),
        nd('rd_spot', '完工抽查', '按比例现场抽查', 846, 180, 178, null, 'R3')
      ],
      edges: [
        { from: 'rd_find', to: 'rd_gate', type: 'v' },
        { from: 'rd_gate', to: 'rd_route', type: 'v' },
        { from: 'rd_route', to: 'rd_urgent', label: 'RD-R01' },
        { from: 'rd_route', to: 'rd_normal', label: 'RD-R02' },
        { from: 'rd_route', to: 'rd_auto', label: 'RD-R04' },
        { from: 'rd_route', to: 'rd_note', label: 'RD-R05' },
        { from: 'rd_route', to: 'rd_reject', label: 'RD-R03' },
        { from: 'rd_urgent', to: 'rd_plan' },
        { from: 'rd_normal', to: 'rd_plan' },
        { from: 'rd_auto', to: 'rd_plan' },
        { from: 'rd_note', to: 'rd_curve' },
        { from: 'rd_reject', to: 'rd_arch' },
        { from: 'rd_plan', to: 'rd_do' },
        { from: 'rd_do', to: 'rd_spot', type: 'v', label: '完工后' },
        { from: 'rd_normal', to: 'rd_urgent', type: 'vu', dash: true, label: '主管提级' }
      ],
      pre: {
        rd_gate: 'rd_find', rd_route: 'rd_gate',
        rd_urgent: 'rd_route', rd_normal: 'rd_route', rd_auto: 'rd_route', rd_note: 'rd_route', rd_reject: 'rd_route',
        rd_plan: 'rd_auto', rd_curve: 'rd_note', rd_arch: 'rd_reject',
        rd_do: 'rd_plan', rd_spot: 'rd_do'
      },
      note: '判据句:置信只决定进哪一档,不决定要不要人看;低置信高危仍强制人核。'
    },
    pl: {
      name: '管网线', line: '管网', vb: [1040, 340], start: 'pl_alarm',
      nodes: [
        nd('pl_alarm', '发现 · 规则报警', '水量平衡越限(非 AI)', 16, 20, 190, null, 'S11'),
        nd('pl_typing', '规则校验 + AI 判型', '判型只作嫌疑排序', 16, 110, 190, null, 'S11'),
        nd('pl_route', '分级路由', '爆管 / 立案 / 设备三分', 16, 200, 190, null, null),
        nd('pl_machine', '机器直派', '压降速率越限 → 关阀预案', 286, 12, 270, '机器直派', null),
        nd('pl_case', '常规人工 · 立案', '人在立案 / 结案两点拍板', 286, 90, 270, '常规人工', 'P1'),
        nd('pl_dev', '自动处理', '自检异常 → 设备维修单', 286, 168, 270, '自动处理', 'S12'),
        nd('pl_unknown', '常规人工 · 不明异常', 'AI 判不出 → 宁升不降', 286, 246, 270, '常规人工', null),
        nd('pl_survey', '核查任务包', '夜间听漏 + 分段关阀', 616, 90, 190, null, 'P1'),
        nd('pl_leak', '现场确认渗漏', '定性在现场加人', 616, 168, 190, null, 'P2'),
        nd('pl_devclose', '设备侧闭环', '传感网运维方承接', 616, 246, 190, null, null),
        nd('pl_repair', '转维修工单', '带压作业 · 案不关', 846, 90, 178, null, 'P3'),
        nd('pl_verify', '复验 · 流量回归', '绿标点亮才算完', 846, 168, 178, null, 'P4'),
        nd('pl_close', '结案归档', '签字 + 规则版本', 846, 246, 178, null, 'P5')
      ],
      edges: [
        { from: 'pl_alarm', to: 'pl_typing', type: 'v' },
        { from: 'pl_typing', to: 'pl_route', type: 'v' },
        { from: 'pl_route', to: 'pl_machine', label: 'PL-R02' },
        { from: 'pl_route', to: 'pl_case', label: 'PL-R01' },
        { from: 'pl_route', to: 'pl_dev', label: 'PL-R03' },
        { from: 'pl_route', to: 'pl_unknown', label: 'PL-R04' },
        { from: 'pl_case', to: 'pl_survey' },
        { from: 'pl_unknown', to: 'pl_survey' },
        { from: 'pl_dev', to: 'pl_devclose' },
        { from: 'pl_survey', to: 'pl_leak', type: 'v' },
        { from: 'pl_leak', to: 'pl_repair' },
        { from: 'pl_machine', to: 'pl_repair', label: '关阀 + 抢修' },
        { from: 'pl_repair', to: 'pl_verify', type: 'v' },
        { from: 'pl_verify', to: 'pl_close', type: 'v', label: 'PL-R05' }
      ],
      pre: {
        pl_typing: 'pl_alarm', pl_route: 'pl_typing',
        pl_machine: 'pl_route', pl_case: 'pl_route', pl_dev: 'pl_route', pl_unknown: 'pl_route',
        pl_survey: 'pl_case', pl_leak: 'pl_survey', pl_devclose: 'pl_dev',
        pl_repair: 'pl_leak', pl_verify: 'pl_repair', pl_close: 'pl_verify'
      },
      note: '判据句:复验不是照片,是流量回归基线;系统只出建议,结案签字仍在人。'
    },
    dp: {
      name: '派单与调度', line: '派单', vb: [1040, 376], start: 'dp_in',
      nodes: [
        nd('dp_in', '派工请求', '三来源:机器 / 人 / 计划', 16, 20, 190, null, null),
        nd('dp_filter', '持证与技能过滤', '不符者不进候选', 16, 110, 190, null, null),
        nd('dp_sort', '就近 + 负载均衡', '同等条件在办少者优先', 16, 200, 190, null, null),
        nd('dp_assign', '派工 · SLA 计时', '接单 / 到场 / 完工三段', 286, 60, 270, null, 'S3'),
        nd('dp_none', '无空闲 → 抢占三步', '让位 → 借调 → 人裁', 286, 200, 270, null, 'S13'),
        nd('dp_crew', '班组处置', '接单 / 到场 / 双照 / 完工', 616, 20, 190, null, 'S5'),
        nd('dp_susp', '挂起 · 待条件', 'SLA 停表,回队重派', 616, 110, 190, null, 'O1'),
        nd('dp_yield', '抢占①让位', '最低优先级件挂起', 616, 200, 190, null, 'O1'),
        nd('dp_borrow', '抢占②借调', '跨片调人 · 持证硬校验', 616, 276, 190, null, 'O2'),
        nd('dp_recon', '对账与镜像', '处置状态以客户系统为准', 846, 20, 178, null, 'S15'),
        nd('dp_arb', '抢占③人裁', '复核主管显名指派', 846, 238, 178, null, 'O3')
      ],
      edges: [
        { from: 'dp_in', to: 'dp_filter', type: 'v', label: 'DP-R02' },
        { from: 'dp_filter', to: 'dp_sort', type: 'v', label: 'DP-R01' },
        { from: 'dp_sort', to: 'dp_assign', label: 'DP-R03' },
        { from: 'dp_sort', to: 'dp_none', label: 'DP-R04' },
        { from: 'dp_assign', to: 'dp_crew', label: 'DP-R05' },
        { from: 'dp_assign', to: 'dp_susp', label: '拒单 / 受阻' },
        { from: 'dp_crew', to: 'dp_recon' },
        { from: 'dp_none', to: 'dp_yield' },
        { from: 'dp_yield', to: 'dp_borrow', type: 'v' },
        { from: 'dp_borrow', to: 'dp_arb' },
        { from: 'dp_arb', to: 'dp_assign', type: 'back', via: 348, dash: true, label: '显名指派回主流程' }
      ],
      pre: {
        dp_filter: 'dp_in', dp_sort: 'dp_filter',
        dp_assign: 'dp_sort', dp_none: 'dp_sort',
        dp_crew: 'dp_assign', dp_susp: 'dp_assign', dp_recon: 'dp_crew',
        dp_yield: 'dp_none', dp_borrow: 'dp_yield', dp_arb: 'dp_borrow'
      },
      note: '判据句:资质是硬性过滤(不符不进候选),就近与负载只是排序;三步抢占逐级留痕。'
    }
  };

  function gNode(G, id) {
    for (var i = 0; i < G.nodes.length; i++) if (G.nodes[i].id === id) return G.nodes[i];
    return null;
  }
  /* 已走路径 = 从起点到当前节点的**正规路径**(G.pre 前驱树,不用最短路:
     汇合节点有多条入边时,最短路会挑错那一条 —— 前驱树把「本线正规怎么走到这」写死。) */
  function walked(G, curId) {
    if (!curId) return { n: {}, e: {} };
    var onN = {}, onE = {}, n = curId, guard = 0;
    onN[n] = 1;
    while (G.pre[n] && guard++ < 40) { onE[G.pre[n] + '>' + n] = 1; n = G.pre[n]; onN[n] = 1; }
    return { n: onN, e: onE };
  }

  function poly(f, t, e) {
    var fcx = f.x + f.w / 2, tcx = t.x + t.w / 2, fcy = f.y + f.h / 2, tcy = t.y + t.h / 2;
    var type = e.type || 'h', mid;
    if (type === 'v') {
      mid = (f.y + f.h + t.y) / 2;
      return [[fcx, f.y + f.h], [fcx, mid], [tcx, mid], [tcx, t.y]];
    }
    if (type === 'vu') {
      mid = (t.y + t.h + f.y) / 2;
      return [[fcx, f.y], [fcx, mid], [tcx, mid], [tcx, t.y + t.h]];
    }
    if (type === 'back') {
      var via = e.via || (Math.max(f.y + f.h, t.y + t.h) + 30);
      return [[fcx, f.y + f.h], [fcx, via], [tcx, via], [tcx, t.y + t.h]];
    }
    mid = (f.x + f.w + t.x) / 2;
    return [[f.x + f.w, fcy], [mid, fcy], [mid, tcy], [t.x, tcy]];
  }
  function arrow(p1, p2, color) {
    var dx = p2[0] - p1[0], dy = p2[1] - p1[1], s = 6;
    var x = p2[0], y = p2[1], pts;
    if (Math.abs(dx) >= Math.abs(dy)) {
      var sg = dx >= 0 ? 1 : -1;
      pts = [[x, y], [x - sg * s, y - 4.4], [x - sg * s, y + 4.4]];
    } else {
      var sv = dy >= 0 ? 1 : -1;
      pts = [[x, y], [x - 4.4, y - sv * s], [x + 4.4, y - sv * s]];
    }
    return '<path d="M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L') + ' Z" fill="' + color + '"></path>';
  }
  function textW(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) n += s.charCodeAt(i) > 127 ? 12 : 7;
    return n;
  }

  function graphSvg(gid, curId) {
    var G = FLOWGRAPH[gid];
    if (!G) return '';
    var on = walked(G, curId) || {};
    var onN = on.n || {}, onE = on.e || {};
    var W = G.vb[0], H = G.vb[1];
    var out = ['<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(G.name) + '流程图中的当前位置" style="width:100%;min-width:900px;height:auto">'];
    out.push('<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#ffffff"></rect>');

    /* 边 */
    G.edges.forEach(function (e) {
      var f = gNode(G, e.from), t = gNode(G, e.to);
      if (!f || !t) return;
      var hot = !!onE[e.from + '>' + e.to];
      var color = hot ? '#243342' : '#c3ccd4';
      var pts = poly(f, t, e);
      var dd = 'M' + pts.map(function (p) { return p[0] + ' ' + p[1]; }).join(' L');
      out.push('<path d="' + dd + '" fill="none" stroke="' + color + '" stroke-width="' + (hot ? 2.2 : 1.4) + '"' +
        (e.dash ? ' stroke-dasharray="6 4"' : '') + '></path>');
      out.push(arrow(pts[pts.length - 2], pts[pts.length - 1], color));
      if (e.label) {
        var lx = (pts[1][0] + pts[2][0]) / 2, ly = (pts[1][1] + pts[2][1]) / 2;
        var wdt = textW(e.label) + 8;
        /* R88 A6⑩:边上的判据编号(MH-R01 等)是规则表里的真规则 —— hover 出判据原文,点开出规则卡 */
        var rl = ruleOf(e.label);
        if (rl) out.push('<g class="fg-rule" data-fgrule="' + esc(rl.id) + '"><title>' +
          esc(rl.id + ' · ' + rl.name + '\n判据:' + rl.when + '\n(点开看参数与版本)') + '</title>');
        out.push('<rect x="' + (lx - wdt / 2) + '" y="' + (ly - 15) + '" width="' + wdt + '" height="16" fill="#ffffff"></rect>');
        out.push('<text x="' + lx + '" y="' + (ly - 3) + '" text-anchor="middle" font-size="12" font-family="sans-serif" fill="' +
          (rl ? '#1a5fb4' : (hot ? '#243342' : '#8e968f')) + '"' + (rl ? ' text-decoration="underline"' : '') + '>' +
          esc(e.label) + '</text>');
        if (rl) out.push('</g>');
      }
    });

    /* 节点 */
    G.nodes.forEach(function (n) {
      var isCur = n.id === curId;
      var past = !!onN[n.id] && !isCur;
      var lc = n.lane ? laneColor(n.lane) : null;
      var stroke = isCur ? '#243342' : (lc || (past ? '#8e968f' : '#cfd6dc'));
      var fill = isCur ? '#243342' : (past ? '#f2f5f8' : '#ffffff');
      var ink = isCur ? '#ffffff' : '#243342';
      var sub = isCur ? '#dfe6ec' : '#5b6b7c';
      var jump = n.sid && IDX[n.sid] !== undefined;
      out.push('<g class="fg-node' + (jump ? ' is-jump' : '') + '"' + (jump ? ' data-fgsid="' + esc(n.sid) + '"' : '') + '>');
      out.push('<rect class="fg-box" x="' + n.x + '" y="' + n.y + '" width="' + n.w + '" height="' + n.h + '" rx="8" fill="' + fill +
        '" stroke="' + stroke + '" stroke-width="' + (isCur ? 2.4 : 1.4) + '"></rect>');
      if (lc) out.push('<rect x="' + n.x + '" y="' + n.y + '" width="6" height="' + n.h + '" rx="3" fill="' + lc + '"></rect>');
      out.push('<text x="' + (n.x + (lc ? 16 : 12)) + '" y="' + (n.y + 21) + '" font-size="13" font-weight="700" font-family="sans-serif" fill="' + ink + '">' + esc(n.label) + '</text>');
      if (n.sub) out.push('<text x="' + (n.x + (lc ? 16 : 12)) + '" y="' + (n.y + 39) + '" font-size="12" font-family="sans-serif" fill="' + sub + '">' + esc(n.sub) + '</text>');
      if (isCur) out.push('<text x="' + (n.x + n.w - 8) + '" y="' + (n.y - 6) + '" text-anchor="end" font-size="12" font-weight="700" font-family="sans-serif" fill="#243342">当前 ▼</text>');
      out.push('</g>');
    });
    out.push('</svg>');
    return out.join('');
  }

  /* ================================================================
     R88 A6⑩ · 流程浮层里的规则卡 —— 分支边上的编号不再是装饰:
     hover 出判据原文,点开出规则卡(名 / 判据 / 参数当前值与基线 / 版本 / 可改权),
     浮层底部再挂一张「本线规则表」折叠区(该线全部规则,复用同一份 S.rules())。
     一切取自 S.rules()/S.ruleParams()(数据层同一份 RULES),不在导览层抄第二遍。
     ================================================================ */
  function ruleOf(id) {
    if (!id || !S.rule) return null;
    try { return S.rule(id) || null; } catch (e) { return null; }
  }
  function ruleParamRows(r) {
    var eff = (S.ruleParams && S.ruleParams(r.id)) || [];
    if (!eff.length) return '<div class="tiny">本条无可配参数。</div>';
    return '<table class="tb" style="margin-top:4px"><thead><tr>' +
      '<th>参数</th><th style="width:120px">当前生效值</th><th style="width:100px">基线值</th></tr></thead><tbody>' +
      eff.map(function (pm) {
        return '<tr><td>' + esc(pm.label) + '<div class="tiny mono">' + esc(pm.key) + '</div></td>' +
          '<td>' + esc(String(pm.val) + (pm.unit || '')) + (pm.shadow ? ' ' + UI.badge('影子值', 'amber') : '') + '</td>' +
          '<td class="tiny">' + esc(String(pm.base) + (pm.unit || '')) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }
  function ruleCardHtml(id) {
    var r = ruleOf(id);
    if (!r) return '';
    return '<div class="fg-rulecard">' +
      '<div class="row wrap" style="justify-content:space-between;gap:8px;align-items:flex-start">' +
      '<div><span class="mono">' + esc(r.id) + '</span> <b>' + esc(r.name) + '</b></div>' +
      '<div>' + (r.lane ? UI.laneBadge(r.lane) : '') +
      '<button type="button" class="btn btn-sm" data-tour="fgruleoff" style="margin-left:6px">收起规则卡</button></div></div>' +
      '<div class="small" style="margin-top:4px">判据:' + esc(r.when) + '</div>' +
      (r.action ? '<div class="tiny" style="margin-top:3px">路由去向:' + esc(r.action) + '</div>' : '') +
      ruleParamRows(r) +
      '<div class="tiny" style="margin-top:4px">版本 <span class="mono">' + esc(r.version) + '</span> · 可改权:' +
      esc((r.editableBy || []).join(' / ') || '不可改') + ' · 改参数走影子试算,正式生效需审批(系统管理 → 规则引擎)。</div>' +
      '</div>';
  }
  /* 本线规则表(折叠):按 FLOWGRAPH[gid].line 取该线全部规则 */
  function lineRulesHtml(gid) {
    var G = FLOWGRAPH[gid];
    if (!G || !G.line || !S.rules) return '';
    var rs = S.rules(G.line) || [];
    if (!rs.length) return '';
    var rows = rs.map(function (r) {
      var eff = (S.ruleParams && S.ruleParams(r.id)) || [];
      var pv = eff.map(function (pm) { return pm.label + ' ' + pm.val + (pm.unit || ''); }).join(' · ') || '无可配参数';
      return '<tr><td class="mono">' + esc(r.id) + '</td><td><b>' + esc(r.name) + '</b>' +
        '<div class="tiny">' + esc(r.when) + '</div></td>' +
        '<td class="tiny">' + esc(pv) + '</td>' +
        '<td>' + (r.lane ? UI.laneBadge(r.lane) : '<span class="tiny faint">—</span>') + '</td></tr>';
    }).join('');
    return '<details class="fg-rules"><summary>本线规则表 · ' + esc(G.line) + ' ' + rs.length + ' 条(点开)</summary>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th style="width:80px">编号</th><th>规则与判据</th><th style="width:200px">参数当前值</th><th style="width:100px">路由去向</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<div class="tiny" style="margin-top:5px">同一份规则表在「系统管理 → 规则引擎」可查可配(参数改动走影子试算)。</div></details>';
  }

  function graphLegend() {
    var L = w.LANES || [];
    return '<div class="fg-legend">' +
      L.map(function (x) {
        return '<span class="fg-key"><i class="fg-swatch" style="background:' + x.color + '"></i>' + esc(x.name) + ' · ' + esc(x.kind) + '</span>';
      }).join('') +
      '<span class="fg-key">深色描边 = 已走过的路径 · 虚线 = 例外分支 · 方框可点则跳到对应分镜 · ' +
      '<b style="color:#1a5fb4">蓝色下划线的判据编号</b>可 hover 看判据、点开看规则卡</span></div>';
  }

  function laneBadgeOf(sc) {
    if (sc.lane) return UI.laneBadge(sc.lane) + (sc.laneNote ? ' <span class="tiny">(' + esc(sc.laneNote) + ')</span>' : '');
    return UI.badge(sc.laneNote || '—', 'grey');
  }

  var flowTab = null;   // 流程浮层里手动切过的线(null = 跟着当前镜)
  var flowRule = null;  // 流程浮层里点开的规则编号(null = 未点开)
  function stageModal(sc) {
    var gid = flowTab || sc.graph || 'mh';
    var G = FLOWGRAPH[gid];
    var curId = (gid === (sc.graph || null)) ? sc.node : null;
    var color = AXIS[sc.axis] || '#5b6b7c';
    var tabs = Object.keys(FLOWGRAPH).map(function (k) {
      return '<button type="button" class="fg-tab' + (k === gid ? ' is-on' : '') + '" data-tour="fgtab" data-g="' + k + '">' +
        esc(FLOWGRAPH[k].name) + '</button>';
    }).join('');
    return '<div class="tour-modal-hd"><h3 style="margin:0">流程位置 · ' + esc(posText(cur)) + '</h3>' +
      '<button type="button" class="btn btn-sm" data-tour="close">关闭(Esc)</button></div>' +
      '<div class="fg-tabs">' + tabs + '</div>' +
      '<div class="fg-wrap">' + graphSvg(gid, curId) + '</div>' +
      (flowRule ? ruleCardHtml(flowRule) : '') +
      graphLegend() +
      lineRulesHtml(gid) +
      '<div class="tour-meta">' +
      '<span class="badge" style="background:' + color + ';color:#fff;border-color:' + color + '">' + esc(sc.axis) + '</span>' +
      '<span class="tiny">五段骨架:' + STAGES.join(' → ') + '</span>' +
      '<span class="tiny">本镜所处:<b>' + esc((sc.stage || '—').replace('+', ' + ')) + '</b></span>' +
      '<span class="tiny">走的通道:</span>' + laneBadgeOf(sc) +
      '</div>' +
      '<div class="small">' + esc(sc.title) + '——' + esc(sc.say) + '</div>' +
      '<div class="tiny" style="margin-top:8px">' + esc(G.note) + ' 三条业务线各有自己的分支形态,但共用同一副五段骨架与同一套通道分档。</div>';
  }

  function backendModal(sc) {
    var logs = sc.ref ? S.stepLog(sc.ref) : [];
    var body, note;
    if (sc.acts && sc.acts.length) {
      var all = S.get().actionLog;
      logs = all.slice(Math.max(0, all.length - sc.acts.length));
      note = '本镜是支线镜:在主线第 ' + esc(sc.ref) + ' 步的状态上,又逐条落了 ' + sc.acts.length + ' 个动作(全部走同一个提交入口,与主线动作同表同列):';
      body = UI.ontologyLog(logs, { empty: '本镜未新增动作记录。' });
    } else if (sc.ref) {
      note = '本镜推进时,后端(规则引擎 / AI 服务 / 班组账号 / 人)一共落了 ' + logs.length + ' 条动作记录:';
      body = UI.ontologyLog(logs, { empty: '本镜未新增动作记录(该步动作此前已由人手动执行过,不重复记日志)。' });
    } else if (sc.sid === 'S17') {
      note = '截至此刻,这一晚累计的全部动作记录(倒序,最近 20 条;完整表在本页「本体日志」):';
      body = UI.ontologyLog(null, { desc: true, limit: 20 });
    } else {
      note = '本镜不推进状态,只看开场的世界。以下为当前已有的动作记录:';
      body = UI.ontologyLog(null, { desc: true, limit: 10 });
    }
    return '<div class="tour-modal-hd"><h3 style="margin:0">后端发生了什么 · ' + esc(posText(cur)) + '</h3>' +
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
  function openModal(html, wide) {
    closeModal();
    maskEl = d.createElement('div');
    maskEl.className = 'mask tour-modal' + (wide ? ' is-wide' : '');
    maskEl.innerHTML = '<div class="modal">' + html + '</div>';
    maskEl.addEventListener('click', function (e) {
      if (e.target === maskEl) { closeModal(); return; }
      var t = e.target;
      while (t && t !== maskEl && !(t.getAttribute &&
        (t.getAttribute('data-tour') || t.getAttribute('data-fgsid') || t.getAttribute('data-fgrule')))) t = t.parentNode;
      if (!t || t === maskEl || !t.getAttribute) return;
      var act = t.getAttribute('data-tour');
      if (act === 'close') closeModal();
      else if (act === 'fgtab') { flowTab = t.getAttribute('data-g'); flowRule = null; openModal(stageModal(STORY[cur]), true); }
      else if (act === 'fgruleoff') { flowRule = null; openModal(stageModal(STORY[cur]), true); }
      else if (t.getAttribute('data-fgrule')) { flowRule = t.getAttribute('data-fgrule'); openModal(stageModal(STORY[cur]), true); }
      else if (t.getAttribute('data-fgsid')) {
        var sid = t.getAttribute('data-fgsid');
        if (IDX[sid] !== undefined) { closeModal(); goTo(IDX[sid]); }
      }
    });
    d.body.appendChild(maskEl);
  }
  d.addEventListener('keydown', function (e) {
    if ((e.key === 'Escape' || e.keyCode === 27) && maskEl) closeModal();
  });

  /* ---------------- 导览条 ---------------- */
  var dock = null;

  function posText(i) {
    var sc = STORY[i];
    if (sc.br) {
      var list = brList(sc.br), k = list.indexOf(i) + 1;
      return '支线「' + brLabel(sc.br) + '」第 ' + k + '/' + list.length + ' 步' + (sc.stage ? ' · ' + sc.stage : '');
    }
    return '第 ' + mainNo(i) + '/' + MAIN_N + ' 镜' + (sc.stage ? ' · ' + sc.stage : '');
  }

  /* 点列 = 主线顺序;分岔点后面紧跟它的支线镜(缩进半色) */
  function dotsHtml() {
    var out = [], prevAxis = null;
    MAIN.forEach(function (i) {
      var sc = STORY[i];
      var color = AXIS[sc.axis] || '#5b6b7c';
      if (prevAxis !== null && sc.axis !== prevAxis) out.push('<span class="tour-gap"></span>');
      prevAxis = sc.axis;
      var on = i === cur;
      var past = MAIN.indexOf(i) < MAIN.indexOf(curMain());
      var style = on ? 'background:' + color + ';border-color:' + color
        : (past ? 'background:' + color + ';opacity:.5;border-color:transparent' : '');
      out.push('<button type="button" class="tour-dot' + (on ? ' is-on' : (past ? ' is-past' : '')) + '"' +
        ' style="' + style + '" data-tour="jump" data-i="' + i + '"' +
        ' title="' + esc('第 ' + mainNo(i) + ' 镜 · ' + sc.axis + (sc.stage ? ' · ' + sc.stage : '') + ' · ' + sc.title) + '">' +
        mainNo(i) + '</button>');
      (sc.branches || []).forEach(function (b) {
        var br = STORY[idxOf(b.sid)].br;
        var list = brList(br);
        out.push('<span class="tour-brgap"></span>');
        list.forEach(function (j, k) {
          var bs = STORY[j], bon = j === cur;
          var bc = AXIS[bs.axis] || '#5b6b7c';
          out.push('<button type="button" class="tour-dot is-br' + (bon ? ' is-on' : '') + '"' +
            ' style="' + (bon ? 'background:' + bc + ';border-color:' + bc : 'border-color:' + bc) + '"' +
            ' data-tour="jump" data-i="' + j + '"' +
            ' title="' + esc('支线「' + brLabel(br) + '」第 ' + (k + 1) + '/' + list.length + ' 步 · ' + bs.title) + '">↳' + (k + 1) + '</button>');
        });
        out.push('<span class="tour-brgap"></span>');
      });
    });
    return out.join('');
  }
  /* 当前所在的主线镜(在支线上时 = 其分岔点) */
  function curMain() { return STORY[cur].br ? brParent(STORY[cur].br) : cur; }

  /* R88 A6⑲ · 视角徽章:显示的是**当前真实身份**(不是分镜声明值)——
     进镜会自动切到本镜的视角,但用户下车后自己切过的身份仍要如实显示,不一致时把差异写出来。 */
  function roleBadge(sc) {
    var now = S.get().role;
    var same = now === sc.role;
    return '<span class="tour-role' + (same ? '' : ' is-off') + '"' +
      ' title="' + esc('进镜自动切到该镜的操作视角(本镜:' + sc.role + ');下车后可在顶栏自己切,导览不改回。') + '">' +
      '当前视角:<b>' + esc(now) + '</b>' + (same ? '' : esc('(本镜视角 ' + sc.role + ')')) + '</span>';
  }

  function renderDock() {
    if (!dock) return;
    var sc = STORY[cur];
    var color = AXIS[sc.axis] || '#5b6b7c';
    var say = riding
      ? '<b>' + esc(sc.title) + '</b> · ' + esc(sc.say)
      : '<span class="tour-off">已下车,现在是自由操作。随时可以回到' + esc(posText(cur)) + '继续。</span>';

    var nav = riding
      ? '<button type="button" class="tour-btn" data-tour="prev">◀ 上一镜</button>' +
        '<button type="button" class="tour-btn is-main" id="btnNext" data-tour="next"' + (hasNext(cur) ? '' : ' disabled') + '>▶ 下一镜</button>'
      : '<button type="button" class="tour-btn is-main" data-tour="reboard">⏸ 已下车 · 回到' + esc(posText(cur)) + '</button>' +
        '<button type="button" class="tour-btn" id="btnNext" data-tour="next"' + (hasNext(cur) ? '' : ' disabled') + '>▶ 下一镜</button>';

    var brBtns = (sc.branches || []).map(function (b) {
      return '<button type="button" class="tour-btn is-br" data-tour="jumpsid" data-sid="' + esc(b.sid) + '">' + esc(b.label) + '</button>';
    }).join('');
    if (sc.br) {
      brBtns = '<button type="button" class="tour-btn is-br" data-tour="jumpsid" data-sid="' + esc(sc.back) + '">↩ 回主线</button>' + brBtns;
    }

    dock.className = 'tour-dock' + (minimized ? ' is-min' : '');
    dock.innerHTML =
      '<div class="tour-row">' +
      '<span class="tour-axis" style="background:' + color + '">' + esc(sc.axis) + (sc.br ? ' · 支线' : '') + '</span>' +
      '<span class="tour-pos">' + esc(posText(cur)) + '</span>' +
      roleBadge(sc) +
      '<span class="tour-say' + (sayOpen ? ' is-open' : '') + '" data-tour="say" title="点开/收起全文">' + say + '</span>' +
      brBtns + nav +
      '<button type="button" class="tour-btn" data-tour="stage">流程位置</button>' +
      '<button type="button" class="tour-btn" data-tour="backend">后端发生了什么</button>' +
      '<button type="button" class="tour-btn" data-tour="phone" title="唤起 / 收起现场端手机浮窗">📱 现场端</button>' +
      '<button type="button" class="tour-btn" data-help="tour" title="导览条怎么用">?</button>' +
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
      if (act === 'next') goTo(nextIdx(cur));
      else if (act === 'prev') goTo(prevIdx(cur));
      else if (act === 'jump') goTo(parseInt(t.getAttribute('data-i'), 10) || 0);
      else if (act === 'jumpsid') goTo(idxOf(t.getAttribute('data-sid')));
      else if (act === 'reboard') reboard();
      else if (act === 'stage') { flowTab = null; flowRule = null; openModal(stageModal(STORY[cur]), true); }
      else if (act === 'backend') openModal(backendModal(STORY[cur]));
      else if (act === 'phone') {
        if (UI.phoneSim.isOpen()) UI.phoneSim.close();
        else {
          var sc = STORY[cur];
          var p = sc.phone || { src: 'crew.html', title: '现场端 · 班组处置端' };
          UI.phoneSim(p.src, { title: p.title });
        }
      }
      else if (act === 'say') { sayOpen = !sayOpen; renderDock(); }
      else if (act === 'min') { minimized = !minimized; renderDock(); }
    });
    renderDock();
  }

  /* ---------------- 导览层自身的帮助浮层(A4 机制的第一处消费者) ---------------- */
  UI.registerHelp('tour', {
    title: '分镜导览条怎么用',
    sub: '导览条是解说层,不是业务界面的一部分;它只做三件事:推进状态、跳到该看的位置、把当前所在的流程节点说清楚。',
    body: [
      '<b>主线</b>:「▶ 下一镜」按主线 ' + MAIN_N + ' 镜依次推进,页面自动跳到该镜要看的位置并高亮焦点。点色块可直接跳镜。',
      '<b>支线</b>:主线上带「↳ 深入…」按钮的镜是分岔点,进去是这条线的下钻(人裁闭环 / 驳回落锤与误报回流 / 主管提级与抽查 / 立案之后 / 抢占三步 / 超时兜底),走到尽头自动回主线,也可以随时点「↩ 回主线」。色块里缩进的半色小格就是支线镜。',
      '<b>状态是重放出来的</b>:状态机不可逆,所以往回跳或进支线时会重新播种再静默连推到位——同一镜任何时候点到,看到的都是同一份状态。',
      '<b>两枚浮层</b>:「流程位置」= 当前镜落在本线流程图的哪个节点(已走路径加深,分支节点可点着跳镜;分支边上的判据编号 hover 出判据、点开出规则卡,底部还挂一张本线规则表);「后端发生了什么」= 这一镜落了哪些动作记录。',
      '<b>数据卡</b>:少数镜(管网核查任务包、关阀试验对比)会在右侧弹一张实时数据卡,内容取自当前世界状态,点右上 × 收起。',
      '<b>手机浮窗</b>:涉现场端的镜会自动弹出班组那一屏,与工作台共用同一份状态;也可以随时点导览条上的「📱 现场端」自己唤起或收起,浮窗可拖动、可另开新窗。班组段拆成三镜(接单 / 到场+前照 / 后照+完工),推一镜浮窗跟着走一格。',
      '<b>当前视角</b>:每一镜声明了它该由谁来看 —— 进镜自动把顶栏身份切成该镜的视角(主管落锤的镜切「复核主管」,其余「区复核员」),导览条上的「当前视角」就是此刻的真实身份。下车后自己切过的身份导览不改回,与本镜视角不一致时徽章会标出来。'
    ],
    foot: '时钟是随处置步进的工作时钟,不按现实秒走;界面里的数字与阈值为假设值,试点首周按实测标定。'
  });

  /* 外部驱动(评审控制台 iframe 直接调 S.nextStep)也让导览条跟上:
     导览自己推进时走的是 quiet 通道,不会发 scenario 事件,所以收到这个事件必然来自外部驱动。 */
  /* 顶栏自己切角色时视角徽章跟着变(setRole 走 render 事件;导览自己切也会经过这里) */
  w.addEventListener('render', function (e) {
    if (e && e.detail && e.detail.role) renderDock();
  });

  w.addEventListener('scenario', function () {
    var next = deriveCur();
    if (next === cur) return;
    cur = next;
    appliedSid = null;
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

  w.TOUR = {
    story: STORY, graph: FLOWGRAPH, go: goTo,
    at: function () { return cur; },
    sid: function () { return STORY[cur].sid; },
    goSid: function (sid) { if (IDX[sid] !== undefined) goTo(IDX[sid]); }
  };
})(window, document);
