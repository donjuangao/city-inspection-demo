/* origen 巡检 demo · 全部 mock 数据 + 场景时刻表
   规格:施工图 §4(数据模型)/ §6(场景时刻表 T0-T12);设计档 §0.5.1-0.5.3 线卡(校验项名目/分级档名/车道名逐字取)· §3(mock 规则/地址口径)
   全站虚构 · 零真实照片 · 人物=岗位角色 · 地址口径=「设施编号 + 街区名 + Al Ain」
   共享文件:W1 工兵只读。要改 = 报指挥官。 */
(function (w) {
  'use strict';

  /* ============ 0 · 参照字典(逐字取自设计档,W1 页面直接引用,禁自行改名)============ */

  // 设计档 §3:真实街区名 12 个可用
  var BLOCKS = ['Al Jimi', 'Al Muwaiji', 'Hili', 'Al Mutawaa', 'Al Sarooj', 'Zakher',
    'Al Maqam', 'Al Towayya', 'Al Jahili', 'Al Qattara', 'Falaj Hazzaa', 'Al Masoudi'];

  // 设计档 §3:地标可用带源六个
  var LANDMARKS = ['Al Jimi Mall', 'Qasr Al Muwaiji', 'Hili Fun City', 'Al Ain Mall',
    'Green Mubazzarah', 'Jebel Hafeet'];

  // 设计档 §0.6 角色(人类五角色 + 非人三账号)
  var ROLES = ['区复核员', '复核主管', '区值班长', '区巡检管理者', '区管理员', 'DMT'];
  var SERVICE_ACCOUNTS = ['规则引擎', 'AI 服务', '班组账号'];
  var ROLE_RANK = { '区复核员': 1, '复核主管': 2, '区值班长': 3, '区巡检管理者': 2, 'DMT': 2 };

  // 设计档 §0.5.1/0.5.2/0.5.3 线内分级档名(逐字)
  var LEVELS = {
    '路面': ['急修', '养护', '观察'],
    '井盖': ['应急', '急修', '养护', '雨前专项'],
    '管网': ['紧急', '调查', '设备']
  };

  // 设计档 §0.5 各线 to-be 路由车道名(逐字)
  var LANES = {
    '路面': ['记账', '自动升格', '批量半审', '单条必审', '机械驳回'],
    '井盖': ['紧急快车道', '应急人审档', '当日队列', '批量', '机械驳回'],
    '管网': ['紧急快车道', '调查案', '设备维护']
  };

  // 设计档 §0.5.1/0.5.2/0.5.3 机械校验项(变长 checks[]:路面 5 / 井盖 4 / 管网 3,名目逐字)
  var CHECK_DEFS = {
    '路面': [
      { id: 'RD1', name: 'GPS 落路网台账缓冲区', rule_ver: 'rules-2026.08.1' },
      { id: 'RD2', name: '车载连续 N 帧同位置复现', rule_ver: 'rules-2026.08.1' },
      { id: 'RD3', name: 'bbox 几何合理域', rule_ver: 'rules-2026.08.1' },
      { id: 'RD4', name: '同点位活跃线索去重合并', rule_ver: 'rules-2026.08.1' },
      { id: 'RD5', name: '图像质量分(过曝/遮挡/模糊)', rule_ver: 'rules-2026.08.1' }
    ],
    '井盖': [
      { id: 'MH1', name: '台账点位匹配', rule_ver: 'rules-2026.08.1' },
      { id: 'MH2', name: '传感器交叉窗', rule_ver: 'rules-2026.08.1' },
      { id: 'MH3', name: '多帧一致', rule_ver: 'rules-2026.08.1' },
      { id: 'MH4', name: '质量分', rule_ver: 'rules-2026.08.1' }
    ],
    '管网': [
      { id: 'PL1', name: '进口流量 vs 计划配水量偏差', rule_ver: 'rules-2026.08.1' },
      { id: 'PL2', name: '传感器健康自检', rule_ver: 'rules-2026.08.1' },
      { id: 'PL3', name: '灌溉计划表比对', rule_ver: 'rules-2026.08.1' }
    ]
  };

  // 需求档 R45a:六驳回原因码与回流消费者
  var REJECT_CODES = [
    { code: '①', name: '拍摄干扰(树影/污渍/反光)', to: '模型样本回流' },
    { code: '②', name: '已修复/重复线索', to: '去重规则' },
    { code: '③', name: '定位偏移', to: '定位校准' },
    { code: '④', name: '类目误判(是异常但不是该类)', to: '类目体系' },
    { code: '⑤', name: '非市政资产(私产/国道归属外)', to: '资产归属库校正' },
    { code: '⑥', name: '其他(必填备注)', to: '人工周审' }
  ];

  // 设计档 §0.5.2 / §0.8.3 / §4:各动作理由码 / 原因码池
  var REASON_CODES = {
    recall: ['传感器自愈复位', '现场核实无异常', '重复派单', '定位偏移误派'],
    overrule: ['台账未登记但实物存在', '多帧判据误杀', '质量分阈值偏严', '其他(必填备注)'],
    suspend: ['应急抢占', '待条件(审批/物料/装备)', '联动处置等待'],
    dispatch: ['资质不符', '负载均衡', '就近改派', '承包商合同切换'],
    crew_reject: ['缺资质', '在办应急', '装备不符'],
    crew_blocked: ['交通导改审批未下', '物料未到', '大型设备占用', '作业许可未批'],
    transfer: ['私产', '国道归属外', '产权单位待确认']
  };

  // 设计档 §2.3b②:客户侧状态机五格
  var TICKET_STATES = ['已派工', '已接单', '已到场', '已完工', '已验收'];

  // 设计档 §0.8.1:派单三来源
  var TICKET_SOURCES = {
    auto: '① 快车道自动派',
    human: '② 人确认派',
    plan: '③ 计划批量派'
  };

  // SLA 假设值(设计档 §0.8.2 第 4 步 / §0.5 线卡;数字=假设值,区可配 R48)
  var SLA = {
    fastlaneReview: 15,   // 快车道并行复核窗(分)
    urgentReview: 30,     // 应急人审档(分)
    accept: 10,           // 接单(分)
    arrive: 30,           // 到场(分)
    sameDay: 240,         // 当日队列/急修 4h
    roadUrgent: 240       // 路面急修确认 4h
  };

  /* ============ 1 · 设施台账(≥20,三线都有)============ */
  function fac(id, kind, line, block, landmark, sensors, owner, history) {
    return {
      id: id, kind: kind, line: line, block: block, landmark: landmark || '',
      sensors: sensors || [], owner: owner || '区市政',
      // Onwani 五要素双语字段位:空值不渲染(设计档 §3 地址口径)
      onwani: { blockEn: block, blockAr: '', street: '', zone: '', bldg: '' },
      history: history || []
    };
  }

  var FACILITIES = [
    // —— 排水/井盖线(10)——
    fac('MH-0417', '井盖', '井盖', 'Al Jimi', 'Al Jimi Mall 东侧', ['SN-0417'], '区市政', [
      { t: '2026-05-12', txt: '井盖更换(承包商·东区养护)' },
      { t: '2026-07-03', txt: '位移传感器 SN-0417 安装并绑定' }
    ]),
    fac('MH-0562', '井盖', '井盖', 'Hili', 'Hili Fun City 北侧', ['SN-0562'], '区市政', [
      { t: '2026-06-21', txt: '巡检记录:盖体轻微翘起,现场复位' }
    ]),
    fac('MH-0733', '井盖', '井盖', 'Zakher', '', ['SN-0733'], '区市政', [
      { t: '2026-04-08', txt: '井周路面修补' }
    ]),
    fac('MH-0289', '井盖', '井盖', 'Al Muwaiji', 'Qasr Al Muwaiji 南侧', ['SN-0289'], '区市政', []),
    fac('MH-0851', '井盖', '井盖', 'Al Mutawaa', '', [], '区市政', [
      { t: '2026-07-30', txt: '台账登记补录;传感器待装(观测覆盖缺口)' }
    ]),
    fac('GR-1102', '雨水口', '井盖', 'Al Sarooj', '', ['LV-1102'], '区市政', [
      { t: '2026-06-02', txt: '清掏作业(周期养护)' }
    ]),
    fac('GR-1147', '雨水口', '井盖', 'Al Jimi', 'Al Jimi Mall 西侧', ['LV-1147'], '区市政', []),
    fac('GR-1163', '雨水口', '井盖', 'Al Towayya', '', [], '区市政', []),
    fac('GR-1188', '雨水口', '井盖', 'Al Jahili', '', [], '区市政', []),
    fac('GR-1205', '雨水口', '井盖', 'Zakher', '', [], '区市政', []),
    // —— 路面线(7)——
    fac('RD-2101', '路段', '路面', 'Al Maqam', '', ['CM-A12'], '区市政', [
      { t: '2026-03-17', txt: '罩面养护(周批)' },
      { t: '2026-07-11', txt: '裂缝密度复报,进劣化曲线' }
    ]),
    fac('RD-2114', '路段', '路面', 'Al Qattara', '', [], '区市政', []),
    fac('RD-2130', '路段', '路面', 'Falaj Hazzaa', '', [], '区市政', []),
    fac('RD-2145', '路段', '路面', 'Al Masoudi', '', [], '区市政', []),
    fac('RD-2158', '路段', '路面', 'Al Jimi', 'Al Ain Mall 辅路', ['CM-A31'], '区市政', []),
    fac('RD-2166', '路段', '路面', 'Hili', 'Hili Fun City 环路', [], '区市政', []),
    fac('RD-2172', '路段', '路面', 'Al Towayya', '', [], '区市政', []),
    // —— 灌溉管网线(5)——
    fac('PL-3007', '管段', '管网', 'Al Muwaiji', '', ['FM-DMA07', 'PR-DMA07'], '区市政(TSE 再生水网)', [
      { t: '2026-05-29', txt: 'DMA-07 分区计量投运,基线采集起算' }
    ]),
    fac('PL-3012', '管段', '管网', 'Zakher', '', ['SN-FM03'], '区市政(TSE 再生水网)', []),
    fac('PV-3021', '阀门', '管网', 'Al Maqam', '', [], '区市政(TSE 再生水网)', []),
    fac('PS-3033', '泵站', '管网', 'Al Sarooj', 'Green Mubazzarah 方向', [], '区市政(TSE 再生水网)', []),
    fac('PL-3044', '管段', '管网', 'Al Jahili', '', [], '区市政(TSE 再生水网)', [])
  ];

  /* ============ 2 · 传感器点位(≥8;资产族:类型/健康自检状态/所属 DMA 分区)============ */
  var SENSORS = [
    { id: 'SN-0417', type: '位移/开合', facility: 'MH-0417', health: '正常', dma: null, window: '19:00 起连续在线' },
    { id: 'SN-0562', type: '位移/开合', facility: 'MH-0562', health: '正常', dma: null, window: '19:00 起连续在线' },
    { id: 'SN-0733', type: '位移/开合', facility: 'MH-0733', health: '正常', dma: null, window: '19:00 起连续在线' },
    { id: 'SN-0289', type: '位移/开合', facility: 'MH-0289', health: '正常', dma: null, window: '19:00 起连续在线' },
    { id: 'LV-1102', type: '井内液位计', facility: 'GR-1102', health: '正常', dma: null, window: '19:00 起连续在线' },
    { id: 'LV-1147', type: '井内液位计', facility: 'GR-1147', health: '读数卡死(方差为零超时)', dma: null, window: '18:20 后方差为零' },
    { id: 'FM-DMA07', type: 'DMA流量计', facility: 'PL-3007', health: '正常', dma: 'DMA-07', window: '19:00 起连续在线' },
    { id: 'PR-DMA07', type: '压力计', facility: 'PL-3007', health: '正常', dma: 'DMA-07', window: '19:00 起连续在线' },
    { id: 'SN-FM03', type: 'DMA流量计', facility: 'PL-3012', health: '正常', dma: 'DMA-03', window: '19:00 起连续在线' },
    { id: 'CM-A12', type: '固定相机', facility: 'RD-2101', health: '正常', dma: null, window: '夜间照度达标' },
    { id: 'CM-A31', type: '固定相机', facility: 'RD-2158', health: '正常', dma: null, window: '夜间照度达标' }
  ];

  /* ============ 3 · 班组(5,含承包商 1)============ */
  var CREWS = [
    { id: 'CR-01', name: '排水一班', lines: ['井盖'], quals: ['密闭空间作业'], gear: ['吸污车'], loc: 'Al Jimi', load: 0, status: '空闲', contractor: false, shift: '夜班 19:00-07:00' },
    { id: 'CR-02', name: '排水二班', lines: ['井盖'], quals: ['密闭空间作业', '交通导改'], gear: ['清淤车'], loc: 'Hili', load: 1, status: '在办', contractor: false, shift: '夜班 19:00-07:00' },
    { id: 'CR-03', name: '道路养护班', lines: ['路面'], quals: ['交通导改'], gear: ['铣刨机'], loc: 'Al Maqam', load: 0, status: '空闲', contractor: false, shift: '白班 07:00-19:00(可加班)' },
    { id: 'CR-04', name: '水务抢修班', lines: ['管网'], quals: ['带压作业'], gear: ['听漏仪', 'CCTV 检测车'], loc: 'Al Muwaiji', load: 0, status: '空闲', contractor: false, shift: '夜班 19:00-07:00' },
    { id: 'CR-05', name: '东区养护班(年度承包商)', lines: ['路面', '井盖'], quals: ['交通导改'], gear: ['吸污车'], loc: 'Zakher', load: 1, status: '在办', contractor: true, shift: '夜班 19:00-07:00' }
  ];

  /* ============ 4 · 存量线索(§6 T0 行)============ */
  function checks(line, results) {
    return CHECK_DEFS[line].map(function (c, i) {
      return { id: c.id, name: c.name, rule_ver: c.rule_ver, result: results[i] || 'pass' };
    });
  }
  function clue(o) {
    return {
      id: o.id, line: o.line, level: o.level, conf: o.conf, source: o.source,
      facility: o.facility, block: o.block, kindText: o.kindText,
      checks: o.checks || [], evidence: o.evidence || [],
      status: o.status || 'open',          // open 待核查 / confirmed 已确认 / rejected 已驳回 / archived_doubt 存疑归档 / merged 已合并 / recalled 已撤回
      lane: o.lane, slaDeadline: o.slaDeadline || null,
      t: o.t || '19:00', batchId: o.batchId || null,
      fastlane: !!o.fastlane, mechFail: !!o.mechFail, auditHeld: !!o.auditHeld,
      evidenceViewed: false, rejectCode: null, note: o.note || '',
      publicRefs: o.publicRefs || [], mergedInto: null, ticketId: null, alertId: null
    };
  }

  // T0 存量:路面批量半审 12 条(其中 CL-0311 为 0.58 低置信,演存疑归档)
  var T0_CLUES = [];
  var roadKinds = ['坑槽', '裂缝(网裂)', '裂缝(纵向)', '车辙', '沉陷', '拥包'];
  var roadFacs = ['RD-2101', 'RD-2114', 'RD-2130', 'RD-2145', 'RD-2158', 'RD-2166', 'RD-2172'];
  for (var i = 0; i < 12; i++) {
    var id = 'CL-03' + (11 + i);
    var f = roadFacs[i % roadFacs.length];
    var facObj = FACILITIES.filter(function (x) { return x.id === f; })[0];
    var conf = (i === 0) ? 0.58 : Math.round((0.62 + (i % 5) * 0.045) * 100) / 100;
    T0_CLUES.push(clue({
      id: id, line: '路面', level: '养护', conf: conf, source: '城市移动传感网',
      facility: f, block: facObj.block, kindText: roadKinds[i % roadKinds.length],
      checks: checks('路面', ['pass', 'pass', 'pass', 'pass', i === 0 ? 'warn' : 'pass']),
      evidence: [{ kind: i % 2 ? 'crack' : 'pothole', label: 'AI 生成示意' }],
      lane: '批量半审', batchId: 'BT-2608091', t: '18:4' + (i % 10),
      note: i === 0 ? '低置信 0.58:批量半审车道内可「存疑归档」(非理想态②)' : ''
    }));
  }
  // T0 存量:雨水口养护 5 条
  var grFacs = ['GR-1102', 'GR-1147', 'GR-1163', 'GR-1188', 'GR-1205'];
  grFacs.forEach(function (g, k) {
    var fo = FACILITIES.filter(function (x) { return x.id === g; })[0];
    T0_CLUES.push(clue({
      id: 'CL-02' + (41 + k), line: '井盖', level: '养护', conf: Math.round((0.71 + k * 0.03) * 100) / 100,
      source: '固定相机网', facility: g, block: fo.block, kindText: '雨水口堵塞(箅面)',
      checks: checks('井盖', ['pass', k === 2 ? 'na' : 'pass', 'pass', 'pass']),
      evidence: [{ kind: 'grate', label: 'AI 生成示意' }],
      lane: '批量', batchId: 'BT-2608092', t: '18:3' + k,
      note: '暴雨预警期整体升一档(线卡 B:养护→雨前急修)'
    }));
  });

  /* ============ 5 · T0 抽审队列 3 条 + 治理开关 ============ */
  var GOV = {
    fastlane: { '井盖缺失': true, '爆管': true },
    stormMode: false,
    auditQueue: [
      { id: 'AU-1201', src: '高危确认拘审', clueId: 'CL-0198', reason: '井盖移位·高危确认件全量拘审', t: '17:42', status: '待抽审' },
      { id: 'AU-1202', src: '批量确认 15% 抽样', clueId: 'CL-0175', reason: '路面养护批量件抽样', t: '17:55', status: '待抽审' },
      { id: 'AU-1203', src: '快车道件全量抽审', clueId: 'CL-0166', reason: '快车道自动派单件·误派率月报口径', t: '18:10', status: '待抽审' }
    ]
  };

  /* ============ 6 · T0 已有工单/告警/调查案 ============ */
  var TICKETS = [
    {
      id: 'WO-8871', type: '养护批量工单', clueId: null, facility: 'RD-2101', crew: 'CR-05',
      state: '已接单', source: TICKET_SOURCES.plan, createdT: '18:10', mirror: 'MUN-WO-77214',
      sla: { accept: '18:20', arrive: '19:40', done: '23:00' }, suspended: false, photos: [], line: '路面',
      note: '周批养护(在途)——T9 应急抢占的被抢占对象'
    },
    {
      id: 'WO-8863', type: '急修工单', clueId: null, facility: 'GR-1147', crew: 'CR-02',
      state: '已到场', source: TICKET_SOURCES.human, createdT: '17:30', mirror: 'MUN-WO-77198',
      sla: { accept: '17:40', arrive: '18:10', done: '21:30' }, suspended: false, photos: [], line: '井盖',
      note: ''
    }
  ];

  var ALERTS = [
    { id: 'AL-0771', clueId: 'CL-0198', facility: 'MH-0289', line: '井盖', level: '应急', status: '成立', t: '17:41', by: '区复核员' }
  ];

  var INVESTIGATIONS = [];

  /* ============ 7 · 动作日志(一等公民;时间线组件唯一数据源)============ */
  var ACTION_LOG = [
    { rid: 'LG-0001', t: '17:41', actor: '区复核员', action: 'confirm', params: { clueId: 'CL-0198' }, snapshot: 'RS-1', sum: '确认线索 CL-0198 → 告警 AL-0771 成立;副作用开急修工单' },
    { rid: 'LG-0002', t: '17:42', actor: '规则引擎', action: 'auto_audit_hold', params: { clueId: 'CL-0198' }, snapshot: 'RS-2', sum: '高危确认件自动拘进主管抽审队列(AU-1201)' },
    { rid: 'LG-0003', t: '18:10', actor: '规则引擎', action: 'auto_plan_ticket', params: { ticketId: 'WO-8871' }, snapshot: 'RS-3', sum: '计划批量派(来源③):周批养护工单 WO-8871 → 东区养护班(年度承包商)' },
    { rid: 'LG-0004', t: '18:45', actor: 'AI 服务', action: 'auto_create_clue', params: { batchId: 'BT-2608091' }, snapshot: 'RS-4', sum: '城市移动传感网批次入池:路面线索 12 条 → 批量半审车道' }
  ];

  /* ============ 8 · 公众上报 / 对账队列 / 值班表 / 参数变更(§4 模型的运行期增补位)============ */
  var PUBLIC_REPORTS = [];
  var RECON = [];   // 对账异常队列(§2.3b④ / 场景图 P7)
  var DUTY = [
    { date: '今夜', role: '区值班长', who: '区值班长(岗位角色)', note: '暴雨预警值班' },
    { date: '今夜', role: '复核坐席', who: '区复核员 ×2', note: '7×24 复核坐席' },
    { date: '今夜', role: '复核主管', who: '复核主管', note: '抽审与 override 授权位' }
  ];
  var PARAM_CHANGES = [
    { id: 'PC-0031', item: '井盖线 应急人审档 SLA', from: '30 分', to: '30 分', status: '现行', by: '区巡检管理者', note: '假设值,区可配' }
  ];

  /* ============ 9 · 顶层 DATA(施工图 §4)============ */
  w.DATA = {
    meta: {
      city: 'Al Ain', tenant: 'Al Ain 区市政', t0: '19:00',
      storm: '今夜有强对流预警(演示背景)',
      scene: '暴雨前夜',
      ruleVer: 'rules-2026.08.1', modelVer: 'vision-2026.07.3', paramVer: 'param-AlAin-v4', refVer: 'ref-2026.08.01'
    },
    dict: {
      blocks: BLOCKS, landmarks: LANDMARKS, roles: ROLES, serviceAccounts: SERVICE_ACCOUNTS,
      roleRank: ROLE_RANK, levels: LEVELS, lanes: LANES, checkDefs: CHECK_DEFS,
      rejectCodes: REJECT_CODES, reasonCodes: REASON_CODES,
      ticketStates: TICKET_STATES, ticketSources: TICKET_SOURCES, sla: SLA
    },
    facilities: FACILITIES,
    sensors: SENSORS,
    clues: T0_CLUES,
    alerts: ALERTS,
    tickets: TICKETS,
    investigations: INVESTIGATIONS,
    crews: CREWS,
    actionLog: ACTION_LOG,
    publicReports: PUBLIC_REPORTS,
    gov: GOV,
    recon: RECON,
    duty: DUTY,
    paramChanges: PARAM_CHANGES,
    banners: [
      { id: 'BN-storm', tone: 'warn', text: '今夜有强对流预警(演示背景):井盖线雨水口养护件整体升一档,雨前清掏专项待启。', scope: 'global' }
    ]
  };

  /* ============ 10 · 场景时刻表 T1-T12(施工图 §6)============
     每步:{id, t, title, narration, figs(图号), auto[自动动作], unlocks[新对象], manual[评审者可点的人步提示]}
     auto 里的动作全部走 S.commit —— 校验不过则静默跳过(用户已手动做过时不重复记日志) */
  w.SCENARIO = [
    {
      id: 'T1', t: '19:02', figs: 'L2/E1',
      title: '主演开场 · MH-0417 位移传感器报警',
      narration: '19:02 位移传感器报警:MH-0417(Al Jimi)井盖缺失,双闸硬证据齐 → 机器派单,人复核中。',
      unlocks: [{ type: 'clue', obj: 'CL-0417' }],
      auto: [
        { action: 'auto_sensor_alarm', params: { actor: '规则引擎', sensorId: 'SN-0417', facility: 'MH-0417', clueId: 'CL-0417' } },
        { action: 'auto_selfcheck', params: { actor: '规则引擎', sensorId: 'SN-0417' } },
        { action: 'auto_work_window', params: { actor: '规则引擎', clueId: 'CL-0417' } },
        { action: 'auto_mech_check', params: { actor: '规则引擎', clueId: 'CL-0417' } },
        { action: 'auto_dispatch', params: { actor: '规则引擎', clueId: 'CL-0417', crew: 'CR-01' } },
        { action: 'auto_broadcast', params: { actor: '规则引擎', scope: 'Al Jimi', text: 'MH-0417 井盖缺失,已自动派单 排水一班;不定性、不代替复核。' } }
      ],
      manual: '页面横幅「机器派单,人复核中」;m1 快车道并行复核卡可见。'
    },
    {
      id: 'T2', t: '19:03', figs: 'D1',
      title: '并行复核窗开启 · 15 分钟倒计时',
      narration: '19:03 快车道并行复核窗开启:15 分钟倒计时 + 撤回按钮可见。确认=告警追认;撤回=召回班组。',
      unlocks: [],
      auto: [
        { action: 'auto_review_window', params: { actor: '规则引擎', clueId: 'CL-0417', mins: SLA.fastlaneReview } }
      ],
      manual: '评审者点「确认」= 告警追认;或点「快车道撤回」走 D1 召回分支。'
    },
    {
      id: 'T3', t: '19:05', figs: 'P1-P4/P8',
      title: '班组端 · 接单→到场→前后双照→完工提交',
      narration: '19:05 排水一班接单 → 导航到场 → 修复前/后双照回传 → 完工提交(拒单/受阻/安全/现场上报同屏可点)。',
      unlocks: [],
      auto: [
        { action: 'crew_accept', params: { actor: '班组账号', crew: 'CR-01', ticketId: 'WO-9001' } },
        { action: 'crew_arrive', params: { actor: '班组账号', crew: 'CR-01', ticketId: 'WO-9001' } },
        { action: 'crew_photo', params: { actor: '班组账号', crew: 'CR-01', ticketId: 'WO-9001', phase: '修复前' } },
        { action: 'crew_photo', params: { actor: '班组账号', crew: 'CR-01', ticketId: 'WO-9001', phase: '修复后' } },
        { action: 'crew_done', params: { actor: '班组账号', crew: 'CR-01', ticketId: 'WO-9001' } }
      ],
      manual: 'crew.html 上可自己走一遍(已自动走完的步骤不会重复记日志)。'
    },
    {
      id: 'T4', t: '19:24', figs: 'P5/C1',
      title: 'AI 复验 · 配准判不出 → 存疑待人裁',
      narration: '19:24 AI 复验:修复前后配准判不出 → 存疑待人裁(永不默认打回)。人裁合格即闭环。',
      unlocks: [],
      auto: [
        { action: 'auto_verify', params: { actor: '规则引擎', ticketId: 'WO-9001' } }
      ],
      manual: 'm1 详情点「复验人裁」= 闭环;点「复验打回」需附对比证据(班组可申诉→主管裁)。'
    },
    {
      id: 'T5', t: '19:30', figs: 'D2',
      title: '对照例 · MH-0562 纯视觉 0.31 无硬证据',
      narration: '19:30 对照例:MH-0562(Hili)纯视觉 0.31、无传感器硬证据 → 不走快车道,进应急人审档 30 分钟倒计时。',
      unlocks: [{ type: 'clue', obj: 'CL-0562' }],
      auto: [
        { action: 'auto_create_clue', params: { actor: 'AI 服务', clueId: 'CL-0562' } },
        { action: 'auto_mech_check', params: { actor: '规则引擎', clueId: 'CL-0562' } },
        { action: 'auto_route', params: { actor: '规则引擎', clueId: 'CL-0562', lane: '应急人审档' } }
      ],
      manual: '非理想态①:低置信高危仍强制人核,30min SLA + 三级升级。'
    },
    {
      id: 'T6', t: '19:40', figs: 'D3/D4/P10',
      title: '树影误报件 · 机械驳回不自动归档',
      narration: '19:40 树影误报件:机械校验硬失败 → 高危零自动归档,证据卡置顶转人工驳回确认;「推翻机械判定」同屏可点。',
      unlocks: [{ type: 'clue', obj: 'CL-0588' }],
      auto: [
        { action: 'auto_create_clue', params: { actor: 'AI 服务', clueId: 'CL-0588' } },
        { action: 'auto_mech_reject', params: { actor: '规则引擎', clueId: 'CL-0588' } }
      ],
      manual: '人认可驳回码① → 「高危驳回已拘主管抽审」横幅;或点「推翻机械判定」(D4)。'
    },
    {
      id: 'T7', t: '20:00', figs: 'L1',
      title: '路面线 · 五项校验卡 → 自动升格 → 周批工单',
      narration: '20:00 路面车载批量进池:五项机械校验逐项打钩 → 养护级×高置信×机械全过 = 自动升格(免人工)→ 并入周批养护工单。',
      unlocks: [{ type: 'clue', obj: 'CL-0705' }, { type: 'clue', obj: 'CL-0706' }],
      auto: [
        { action: 'auto_create_clue', params: { actor: 'AI 服务', clueId: 'CL-0705' } },
        { action: 'auto_create_clue', params: { actor: 'AI 服务', clueId: 'CL-0706' } },
        { action: 'auto_mech_check', params: { actor: '规则引擎', clueId: 'CL-0705' } },
        { action: 'auto_upgrade', params: { actor: '规则引擎', clueIds: ['CL-0705', 'CL-0706'] } },
        { action: 'auto_plan_ticket', params: { actor: '规则引擎', ticketId: 'WO-9007', facility: 'RD-2158', crew: 'CR-03', line: '路面', type: '养护批量工单' } }
      ],
      manual: '横幅「本条未经人工,抽审兜底」+ 抽审入口可点;CL-0311(0.58)可演「存疑归档」。'
    },
    {
      id: 'T8', t: '20:30', figs: 'L3',
      title: '管网线 · 水量平衡越限 → 自动开调查案;另:SN-FM03 自检失败 → 设备工单',
      narration: '20:30 DMA-07 灌溉事件水量平衡越限 → 水力学规则报警 → AI 时序判型「渗漏嫌疑」→ 自动开调查案(人在立案/结案两点拍板)。同时 SN-FM03 自检失败 → 设备维护工单。',
      unlocks: [{ type: 'investigation', obj: 'IV-0071' }],
      auto: [
        { action: 'auto_rule_alarm', params: { actor: '规则引擎', dma: 'DMA-07', facility: 'PL-3007' } },
        { action: 'auto_ai_typing', params: { actor: 'AI 服务', dma: 'DMA-07' } },
        { action: 'auto_open_case', params: { actor: '规则引擎', caseId: 'IV-0071', dma: 'DMA-07', facility: 'PL-3007' } },
        { action: 'auto_device_ticket', params: { actor: '规则引擎', sensorId: 'SN-FM03', ticketId: 'WO-9008' } }
      ],
      manual: '非理想态④:先排设备故障再报业务异常;人点「立案」→ 核查工单。'
    },
    {
      id: 'T9', t: '21:00', figs: 'D6/D7',
      title: '过载三步 · 第二井盖件(Zakher)无空闲班组',
      narration: '21:00 第二井盖件 MH-0733(Zakher)应急级,承接池无空闲班组 → 过载三步:①只读预警先喊现场 ②超额件显名降级进批量加急分诊 ③值班长可抢占在途养护班组。',
      unlocks: [{ type: 'clue', obj: 'CL-0733' }],
      auto: [
        { action: 'auto_sensor_alarm', params: { actor: '规则引擎', sensorId: 'SN-0733', facility: 'MH-0733', clueId: 'CL-0733' } },
        { action: 'auto_mech_check', params: { actor: '规则引擎', clueId: 'CL-0733' } },
        { action: 'auto_overload', params: { actor: '规则引擎', clueId: 'CL-0733' } },
        { action: 'auto_broadcast', params: { actor: '规则引擎', scope: 'Zakher', text: 'MH-0733 井盖缺失,承接池无可派 → 已进批量加急分诊,等待值班长仲裁。' } }
      ],
      manual: '切「区值班长」角色 → m2 调度视图点「挂起 WO-8871(应急抢占)」再改派 → 挂起回补卡可见(D7)。'
    },
    {
      id: 'T10', t: '21:10', figs: 'E3/D8',
      title: '公众上报同点位 → 回执编号 → 去重合并',
      narration: '21:10 公众上报同点位(Zakher 井盖):生成受理编号回执 → 与传感器线索去重合并,证据叠加;催办计数可见。',
      unlocks: [{ type: 'publicReport', obj: 'PR-0301' }],
      auto: [
        { action: 'public_report', params: { actor: '公众', reportId: 'PR-0301', cat: '井盖', block: 'Zakher', facility: 'MH-0733' } },
        { action: 'auto_dedupe', params: { actor: '规则引擎', reportId: 'PR-0301', clueId: 'CL-0733' } }
      ],
      manual: 'public.html 可自己走三步提交;回执页显示受理编号与状态。'
    },
    {
      id: 'T11', t: '21:20', figs: 'D9/P7',
      title: '调度视图 + 对账队列 1 条不一致;管网流量回归',
      narration: '21:20 调度视图:班组负载地图 + 改派/合并/拆单三件;对账队列出现 1 条不一致(处置状态以客户系统为准)。同时 DMA-07 流量回归基线 → 系统建议结案。',
      unlocks: [{ type: 'recon', obj: 'RC-0011' }],
      auto: [
        { action: 'auto_recon', params: { actor: '规则引擎', reconId: 'RC-0011', ticketId: 'WO-8863' } },
        { action: 'auto_flow_recover', params: { actor: '规则引擎', caseId: 'IV-0071' } },
        { action: 'auto_suggest_close', params: { actor: '规则引擎', caseId: 'IV-0071' } }
      ],
      manual: '切「复核主管」→ 改派/合并/拆单(理由码必填);对账不一致 24h 内人工裁定。'
    },
    {
      id: 'T12', t: '21:30', figs: 'G4/D10/G1/D5',
      title: '暴雨模式启动 · 全线升档 + 雨前清掏任务包',
      narration: '21:30 暴雨模式启动:井盖线整体升档横幅 + 雨前清掏任务包卡。DMT 可关「井盖缺失」快车道 → 回退人审 + 区申诉入口;主管详情内紧急 override 红色动作可点。',
      unlocks: [{ type: 'ticket', obj: 'WO-9012' }],
      auto: [
        { action: 'auto_storm_on', params: { actor: '规则引擎' } },
        { action: 'auto_storm_tasks', params: { actor: '规则引擎', ticketId: 'WO-9012' } }
      ],
      manual: '切「DMT」→ m6 关「井盖缺失」快车道(强制通知横幅 + 区申诉入口);切「复核主管」→ m1 详情紧急 override(双确认)。'
    }
  ];

  /* ============ 11 · 场景步解锁用的对象模板(advance 时按 id 注入)============ */
  w.UNLOCKS = {
    clues: {
      'CL-0417': clue({
        id: 'CL-0417', line: '井盖', level: '应急', conf: 0.93, source: '位移传感器 SN-0417(已认证设备签名报文)',
        facility: 'MH-0417', block: 'Al Jimi', kindText: '井盖缺失',
        checks: checks('井盖', ['pass', 'pass', 'pass', 'pass']),
        evidence: [{ kind: 'manhole-missing', label: 'AI 生成示意' }, { kind: 'sensor', label: 'AI 生成示意' }],
        lane: '紧急快车道', fastlane: true, t: '19:02',
        note: '双闸硬证据齐(传感器硬证据 + 机械四项全过)→ 自动派单,人 15 分钟内并行复核'
      }),
      'CL-0562': clue({
        id: 'CL-0562', line: '井盖', level: '应急', conf: 0.31, source: '固定相机网(纯视觉)',
        facility: 'MH-0562', block: 'Hili', kindText: '井盖缺失(疑似)',
        checks: checks('井盖', ['pass', 'fail', 'warn', 'pass']),
        evidence: [{ kind: 'manhole-shift', label: 'AI 生成示意' }],
        lane: '应急人审档', t: '19:30',
        note: '低置信 0.31 且无传感器硬证据 → 不进快车道;加急队列 SLA 30 分钟(假设值)+ 三级升级'
      }),
      'CL-0588': clue({
        id: 'CL-0588', line: '井盖', level: '应急', conf: 0.44, source: '城市移动传感网(夜间树影)',
        facility: 'MH-0851', block: 'Al Mutawaa', kindText: '井盖缺失(疑似)',
        checks: checks('井盖', ['fail', 'na', 'fail', 'warn']),
        evidence: [{ kind: 'tree-shadow', label: 'AI 生成示意' }],
        lane: '机械驳回', mechFail: true, t: '19:40',
        note: '树影类持续假目标:机械闸拦不住,由人驳回按原因码①回流(诚实边界);高危件零自动归档'
      }),
      'CL-0705': clue({
        id: 'CL-0705', line: '路面', level: '养护', conf: 0.91, source: '城市移动传感网',
        facility: 'RD-2158', block: 'Al Jimi', kindText: '裂缝(网裂成片)',
        checks: checks('路面', ['pass', 'pass', 'pass', 'pass', 'pass']),
        evidence: [{ kind: 'crack', label: 'AI 生成示意' }],
        lane: '自动升格', t: '20:00',
        note: '养护级 × 高置信 × 机械五项全过 = 免人工并入周期养护计划;事后抽审兜底'
      }),
      'CL-0706': clue({
        id: 'CL-0706', line: '路面', level: '观察', conf: 0.88, source: '固定相机网',
        facility: 'RD-2166', block: 'Hili', kindText: '车辙',
        checks: checks('路面', ['pass', 'pass', 'pass', 'pass', 'pass']),
        evidence: [{ kind: 'rut', label: 'AI 生成示意' }],
        lane: '记账', t: '20:00',
        note: '观察级 × 机械过 = 免人工,自动记台账入劣化曲线'
      }),
      'CL-0733': clue({
        id: 'CL-0733', line: '井盖', level: '应急', conf: 0.89, source: '位移传感器 SN-0733(已认证设备签名报文)',
        facility: 'MH-0733', block: 'Zakher', kindText: '井盖缺失',
        checks: checks('井盖', ['pass', 'pass', 'pass', 'pass']),
        evidence: [{ kind: 'manhole-missing', label: 'AI 生成示意' }],
        lane: '紧急快车道', fastlane: true, t: '21:00',
        note: '承接池无空闲班组 → 过载三步(预警广播 / 显名降级分诊 / 值班长抢占)'
      })
    },
    investigations: {
      'IV-0071': {
        id: 'IV-0071', dma: 'DMA-07', facility: 'PL-3007', line: '管网', level: '调查',
        status: '观察中', openedT: '20:30', window: '观察窗 20:30 起 · 连续 M 次灌溉事件',
        basis: '按灌溉事件的水量平衡:本次实配水量 vs 灌溉计划应配水量偏差 ≥ y%(假设值),连续 M 次',
        evidence: [{ kind: 'flow-curve', label: 'AI 生成示意' }],
        caseLog: [], closedT: null
      }
    },
    publicReports: {
      'PR-0301': {
        id: 'PR-0301', t: '21:10', cat: '井盖', block: 'Zakher', facility: 'MH-0733',
        contact: '05****3271(列级脱敏)', status: '已受理', receipt: 'RC-PR-0301',
        mergedInto: null, urges: 0, evidence: [{ kind: 'manhole-missing', label: 'AI 生成示意' }]
      }
    },
    recon: {
      'RC-0011': {
        id: 'RC-0011', ticketId: 'WO-8863', mirror: 'MUN-WO-77198',
        ours: '已到场', theirs: '已完工', t: '21:20', status: '待裁定',
        rule: '处置状态以客户系统为准,巡检定性以我方为准;异常 24h 内主管人工裁定'
      }
    },
    tickets: {
      'WO-9012': {
        id: 'WO-9012', type: '雨前专项任务', clueId: null, facility: 'GR-1102', crew: 'CR-05',
        state: '已派工', source: TICKET_SOURCES.plan, createdT: '21:30', mirror: 'MUN-WO-77260',
        sla: { accept: '21:40', arrive: '22:10', done: '23:59' }, suspended: false, photos: [], line: '井盖',
        note: '雨前清掏核查任务包(井筒淤积对视觉与液位皆盲 → 任务型兜底)'
      }
    }
  };

  /* ============ 12 · index/README 用:浅演示清单(施工图 §6 尾注)============ */
  w.SHALLOW_SCENES = [
    { fig: 'D11', name: '作业时窗与封控校验(斋月/高温禁令/活动封控/交管批文)', form: '工单详情信息行:「排到最近可作业窗,SLA 停表」' },
    { fig: 'D12', name: '跨机构联动出动(警察/民防/产权单位)', form: '应急件详情信息行 + 挂起原因码「联动处置等待」' },
    { fig: 'P6', name: '客户系统不可用/回写失败', form: '工单镜像横幅:「派工请求进重试队列,超阈值转人工电话派工并补录」' },
    { fig: 'P9', name: '移动端离线/无信号', form: 'crew.html 页脚信息行:离线单本地暂存 + 回连补传' },
    { fig: 'P11', name: '分阶段处置(临时措施先行)', form: 'crew.html「部分完工」动作 + 工单阶段标' }
  ];

})(window);
