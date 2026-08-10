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

  // 设计档 §0.6 角色(R85④ 五行角色口径:区复核员/复核主管(白班)/区值班长(夜班)/上级主管部门 + 非人三账号;
  // 原「区巡检管理者」「区管理员」并入「复核主管」——身份值仍取不带班次后缀的裸字符串,「(白班)/(夜班)」只在下拉与角色表显示)
  var ROLES = ['区复核员', '复核主管', '区值班长', '上级主管部门'];
  var ROLE_DISPLAY = { '复核主管': '复核主管(白班)', '区值班长': '区值班长(夜班)' };
  var SERVICE_ACCOUNTS = ['规则引擎', 'AI 服务', '班组账号'];
  var ROLE_RANK = { '区复核员': 1, '复核主管': 2, '区值班长': 3, '上级主管部门': 2 };

  // 设计档 §0.5.1/0.5.2/0.5.3 线内分级档名(逐字)
  var LEVELS = {
    '路面': ['急修', '养护', '观察'],
    '井盖': ['紧急', '急修', '养护', '雨前专项'],
    '管网': ['紧急', '调查', '设备']
  };

  // 设计档 §0.5 各线 to-be 路由车道名(R86 A1 三档收敛后口径:机器直派 / 加急人工 / 常规人工 + 自动处理 + 驳回与转办)
  var LINE_LANES = {
    '路面': ['记账', '自动升格', '批量半审', '单条必审', '机械驳回'],
    '井盖': ['机器直派', '加急人工', '当日队列', '批量', '机械驳回'],
    '管网': ['机器直派', '调查案', '设备维护']
  };

  /* R86 A1 · 通道三档收敛(W1/W2/W3/W4 渲染层唯一取名处;判据句 = 先派后审 / 先审后派 / 不派人 / 不进处置)
     kind 四值:'先派后审' | '先审后派' | '不派人' | '不进处置';色值与 PDF 五类通道分类学同色 */
  var LANE_DEFS = [
    { key: 'machine', name: '机器直派', short: '直派', color: '#c0392b', kind: '先派后审',
      note: '机器先把单派出去,人并行复核可撤回;派单是处置调度,不是定性' },
    { key: 'urgent', name: '加急人工', short: '加急', color: '#9a6b00', kind: '先审后派',
      note: '分钟级人工单条确认后再派;低置信高危仍强制人核' },
    { key: 'normal', name: '常规人工', short: '常规', color: '#1a5fb4', kind: '先审后派',
      note: '批量 / 例行人工确认后并入计划' },
    { key: 'auto', name: '自动处理', short: '自动', color: '#2e7d32', kind: '不派人',
      note: '记账 / 自动升格 / 设备工单等免人工车道;事后抽审兜底' },
    { key: 'reject', name: '驳回与转办', short: '驳回', color: '#5b6b7c', kind: '不进处置',
      note: '机械驳回 / 人工驳回 / 转办产权单位;不进处置队列' }
  ];
  w.LANES = LANE_DEFS;

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
    suspend: ['抢占调度', '待条件(审批/物料/装备)', '联动处置等待'],
    dispatch: ['资质不符', '负载均衡', '就近改派', '承包商合同切换'],
    crew_reject: ['缺资质', '在办紧急件', '装备不符'],
    crew_blocked: ['交通导改审批未下', '物料未到', '大型设备占用', '作业许可未批'],
    transfer: ['私产', '国道归属外', '产权单位待确认'],
    /* R87 A1:误报申诉理由码(复核窗过后的第三条纠错道) */
    misfire: ['传感器读数存疑(疑似漂移/卡死)', 'AI 判定存疑(疑似树影/污渍)', '现场核实无异常', '同点位重复报警'],
    /* R87 A8:抽审打回原因码 */
    spot_return: ['证据不足以支撑该定性', '原因码选择不当', '越权处置', '流程步骤缺失(未看证据卡即定性)', '其他(必填备注)']
  };

  /* R87 A1 · 告警状态枚举(留痕不删:撤销与误报撤销都只改状态,记录仍在)
     成立 → 申诉复核中(复核员发起误报申诉)→ 误报撤销(主管裁定申诉成立)/ 回到成立(申诉不成立);
     已撤销 = 复核主管走 revoke 动作的撤销,与误报撤销分开计,月报口径不混。 */
  var ALERT_STATES = ['成立', '申诉复核中', '误报撤销', '已撤销'];

  // 设计档 §2.3b②:客户侧状态机五格
  var TICKET_STATES = ['已派工', '已接单', '已到场', '已完工', '已验收'];

  // 设计档 §0.8.1:派单三来源
  var TICKET_SOURCES = {
    auto: '① 机器直派自动派',
    human: '② 人确认派',
    plan: '③ 计划批量派'
  };

  // SLA 假设值(设计档 §0.8.2 第 4 步 / §0.5 线卡;数字=假设值,区可配 R48)
  var SLA = {
    fastlaneReview: 15,   // 机器直派并行复核窗(分)
    urgentReview: 30,     // 加急人工(分)
    accept: 10,           // 接单(分)
    arrive: 30,           // 到场(分)
    sameDay: 240,         // 当日队列(养护档)4h
    roadUrgent: 30        // 路面急修确认 30 分(假设值;R85⑤ 由 4h 收口;当前未接入计算,仅作口径参照)
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

  /* ---- R86 A8 · 虚拟坐标(0-1000 × 0-1000,左上原点;风格化街区,非真实地理数据)---- */
  var FAC_XY = {
    'MH-0417': [232, 168], 'MH-0562': [534, 138], 'MH-0733': [246, 648], 'MH-0289': [168, 404],
    'MH-0851': [438, 292], 'GR-1102': [608, 344], 'GR-1147': [196, 196], 'GR-1163': [836, 286],
    'GR-1188': [416, 532], 'GR-1205': [274, 682],
    'RD-2101': [540, 700], 'RD-2114': [712, 158], 'RD-2130': [180, 548], 'RD-2145': [806, 612],
    'RD-2158': [268, 214], 'RD-2166': [560, 96], 'RD-2172': [812, 340],
    'PL-3007': [140, 432], 'PL-3012': [230, 616], 'PV-3021': [500, 672], 'PS-3033': [648, 300],
    'PL-3044': [452, 556]
  };
  FACILITIES.forEach(function (f) { f.xy = (FAC_XY[f.id] || [500, 500]).slice(); });

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

  /* 传感器落点 = 所属设施旁 12-18px 偏移(一处设施上有多只传感器时错开,避免重叠)*/
  var SEN_OFFSET = { 'PR-DMA07': [16, 14], 'CM-A31': [14, -12] };
  SENSORS.forEach(function (s, i) {
    var f = FACILITIES.filter(function (x) { return x.id === s.facility; })[0];
    var base = f ? f.xy : [500, 500];
    var off = SEN_OFFSET[s.id] || [(i % 2 ? 15 : -15), (i % 3 ? -13 : 13)];
    s.xy = [base[0] + off[0], base[1] + off[1]];
  });

  /* ============ 2b · 底图几何(R86 A8;风格化街区,零真实地理数据,供 m3 地图视图画底)============
     roads: {x1,y1,x2,y2,cls:'main'(主干)|'sub'(支路)|'ring'(环路), name?}
     blocks: {x,y,w,h,name}(街区名与 dict.blocks 同名);water: {kind:'wadi'(旱谷折线)|'lake', pts?|x,y,w,h} */
  w.MAPBASE = {
    roads: [
      { x1: 40, y1: 110, x2: 960, y2: 110, cls: 'main', name: 'Northern Arterial' },
      { x1: 40, y1: 250, x2: 960, y2: 250, cls: 'main', name: 'Central Ave' },
      { x1: 40, y1: 400, x2: 960, y2: 400, cls: 'main', name: 'Oasis Road' },
      { x1: 40, y1: 545, x2: 960, y2: 545, cls: 'main', name: 'Southern Ave' },
      { x1: 40, y1: 700, x2: 960, y2: 700, cls: 'main', name: 'Hafeet Road' },
      { x1: 40, y1: 840, x2: 960, y2: 840, cls: 'sub' },
      { x1: 110, y1: 40, x2: 110, y2: 900, cls: 'main', name: 'West Ring' },
      { x1: 260, y1: 40, x2: 260, y2: 900, cls: 'main' },
      { x1: 420, y1: 40, x2: 420, y2: 900, cls: 'main' },
      { x1: 580, y1: 40, x2: 580, y2: 900, cls: 'main' },
      { x1: 740, y1: 40, x2: 740, y2: 900, cls: 'main' },
      { x1: 900, y1: 40, x2: 900, y2: 900, cls: 'main', name: 'East Ring' },
      { x1: 110, y1: 180, x2: 260, y2: 180, cls: 'sub' },
      { x1: 260, y1: 180, x2: 420, y2: 180, cls: 'sub' },
      { x1: 420, y1: 175, x2: 580, y2: 175, cls: 'sub' },
      { x1: 580, y1: 175, x2: 740, y2: 175, cls: 'sub' },
      { x1: 740, y1: 180, x2: 900, y2: 180, cls: 'sub' },
      { x1: 110, y1: 325, x2: 420, y2: 325, cls: 'sub' },
      { x1: 420, y1: 325, x2: 740, y2: 325, cls: 'sub' },
      { x1: 740, y1: 325, x2: 900, y2: 325, cls: 'sub' },
      { x1: 110, y1: 470, x2: 420, y2: 470, cls: 'sub' },
      { x1: 420, y1: 470, x2: 740, y2: 470, cls: 'sub' },
      { x1: 740, y1: 470, x2: 900, y2: 470, cls: 'sub' },
      { x1: 110, y1: 620, x2: 420, y2: 620, cls: 'sub' },
      { x1: 420, y1: 620, x2: 740, y2: 620, cls: 'sub' },
      { x1: 740, y1: 620, x2: 900, y2: 620, cls: 'sub' },
      { x1: 185, y1: 110, x2: 185, y2: 400, cls: 'sub' },
      { x1: 340, y1: 110, x2: 340, y2: 700, cls: 'sub' },
      { x1: 500, y1: 250, x2: 500, y2: 840, cls: 'sub' },
      { x1: 660, y1: 110, x2: 660, y2: 700, cls: 'sub' },
      { x1: 820, y1: 110, x2: 820, y2: 840, cls: 'sub' },
      { x1: 110, y1: 400, x2: 420, y2: 110, cls: 'ring', name: '西北放射线' },
      { x1: 580, y1: 110, x2: 900, y2: 400, cls: 'ring', name: '东北放射线' },
      { x1: 260, y1: 700, x2: 580, y2: 840, cls: 'ring' },
      { x1: 740, y1: 700, x2: 900, y2: 840, cls: 'ring' }
    ],
    blocks: [
      { x: 130, y: 130, w: 170, h: 130, name: 'Al Jimi' },
      { x: 460, y: 60, w: 160, h: 120, name: 'Hili' },
      { x: 650, y: 95, w: 150, h: 115, name: 'Al Qattara' },
      { x: 95, y: 355, w: 150, h: 120, name: 'Al Muwaiji' },
      { x: 355, y: 250, w: 150, h: 110, name: 'Al Mutawaa' },
      { x: 560, y: 280, w: 150, h: 115, name: 'Al Sarooj' },
      { x: 760, y: 250, w: 150, h: 120, name: 'Al Towayya' },
      { x: 370, y: 470, w: 150, h: 115, name: 'Al Jahili' },
      { x: 115, y: 495, w: 150, h: 115, name: 'Falaj Hazzaa' },
      { x: 190, y: 600, w: 160, h: 120, name: 'Zakher' },
      { x: 470, y: 645, w: 160, h: 120, name: 'Al Maqam' },
      { x: 735, y: 565, w: 150, h: 120, name: 'Al Masoudi' }
    ],
    water: [
      { kind: 'wadi', name: 'Wadi(旱谷)', pts: [[60, 760], [180, 730], [300, 760], [430, 735], [560, 775], [700, 745], [880, 780]] },
      { kind: 'lake', name: 'Green Mubazzarah 水面', x: 690, y: 415, w: 90, h: 52 },
      { kind: 'wadi', name: 'Falaj(灌渠)', pts: [[120, 300], [230, 330], [360, 318], [470, 352], [600, 336]] }
    ],
    landmarks: [
      { name: 'Al Jimi Mall', xy: [210, 150] },
      { name: 'Qasr Al Muwaiji', xy: [150, 385] },
      { name: 'Hili Fun City', xy: [545, 78] },
      { name: 'Al Ain Mall', xy: [290, 230] },
      { name: 'Green Mubazzarah', xy: [700, 430] },
      { name: 'Jebel Hafeet', xy: [845, 760] }
    ]
  };

  /* ============ 3 · 班组(5,含承包商 1)============
     R87:xy = 班组当前位置(与 FAC_XY 同一虚拟坐标系,0-1000;风格化街区,非真实地理数据);
         enroute = 在途目标 {to: 设施 id} | null —— 空闲/已到场的班组为 null,在途的指向目的设施。
         T0 剧情:CR-02 已到场 GR-1147;CR-05 在途赶往 RD-2101(周批养护 WO-8871);其余三班待命。 */
  var CREWS = [
    { id: 'CR-01', name: '排水一班', lines: ['井盖'], quals: ['密闭空间作业'], gear: ['吸污车'], loc: 'Al Jimi', load: 0, status: '空闲', contractor: false, shift: '夜班 19:00-07:00', xy: [258, 252], enroute: null },
    { id: 'CR-02', name: '排水二班', lines: ['井盖'], quals: ['密闭空间作业', '交通导改'], gear: ['清淤车'], loc: 'Hili', load: 1, status: '在办', contractor: false, shift: '夜班 19:00-07:00', xy: [180, 214], enroute: null },
    { id: 'CR-03', name: '道路养护班', lines: ['路面'], quals: ['交通导改'], gear: ['铣刨机'], loc: 'Al Maqam', load: 0, status: '空闲', contractor: false, shift: '白班 07:00-19:00(可加班)', xy: [560, 660], enroute: null },
    { id: 'CR-04', name: '水务抢修班', lines: ['管网'], quals: ['带压作业'], gear: ['听漏仪', 'CCTV 检测车'], loc: 'Al Muwaiji', load: 0, status: '空闲', contractor: false, shift: '夜班 19:00-07:00', xy: [150, 455], enroute: null },
    { id: 'CR-05', name: '东区养护班(年度承包商)', lines: ['路面', '井盖'], quals: ['交通导改'], gear: ['吸污车'], loc: 'Zakher', load: 1, status: '在办', contractor: true, shift: '夜班 19:00-07:00', xy: [400, 676], enroute: { to: 'RD-2101' } }
  ];

  /* ============ 4 · 存量线索(§6 T0 行)============ */
  function checks(line, results) {
    return CHECK_DEFS[line].map(function (c, i) {
      return { id: c.id, name: c.name, rule_ver: c.rule_ver, result: results[i] || 'pass' };
    });
  }
  /* R86 A3 · 观测来源归类(线索卡头部「来源:传感器×2/公众×1」用) */
  function obsKind(src) {
    var s = String(src || '');
    if (s.indexOf('公众') >= 0) return '公众';
    if (s.indexOf('传感器') >= 0 || s.indexOf('液位') >= 0 || s.indexOf('流量') >= 0) return '传感器';
    if (s.indexOf('相机') >= 0) return '固定相机';
    if (s.indexOf('移动传感网') >= 0 || s.indexOf('车载') >= 0) return '车载过检';
    if (s.indexOf('现场') >= 0 || s.indexOf('巡查') >= 0) return '人工巡查';
    return '其他';
  }
  /* R86 A3 · 线索级派生字段(冗余字段而非 getter:state 走 JSON 序列化,getter 存不下来) */
  function syncObs(c) {
    var os = c.observations || [];
    c.obsCount = os.length;
    c.firstSeen = os.length ? os[0].t : c.t;
    c.lastSeen = os.length ? os[os.length - 1].t : c.t;
    var confs = os.map(function (o) { return o.conf; }).filter(function (x) { return typeof x === 'number'; });
    c.maxConf = confs.length ? Math.max.apply(null, confs) : (typeof c.conf === 'number' ? c.conf : null);
    var mix = {};
    os.forEach(function (o) { var k = o.kind || obsKind(o.source); mix[k] = (mix[k] || 0) + 1; });
    c.sourceMix = mix;
    return c;
  }
  function clue(o) {
    var c = {
      id: o.id, line: o.line, level: o.level, conf: o.conf, source: o.source,
      facility: o.facility, block: o.block, kindText: o.kindText,
      checks: o.checks || [], evidence: o.evidence || [],
      status: o.status || 'open',          // open 待核查 / confirmed 已确认 / rejected 已驳回 / archived_doubt 存疑归档 / merged 已合并 / recalled 已撤回
      lane: o.lane, slaDeadline: o.slaDeadline || null,
      t: o.t || '19:00', batchId: o.batchId || null,
      fastlane: !!o.fastlane, mechFail: !!o.mechFail, auditHeld: !!o.auditHeld,
      evidenceViewed: false, rejectCode: null, note: o.note || '',
      publicRefs: o.publicRefs || [], mergedInto: null, ticketId: null, alertId: null,
      /* R86 A3:一次检测事件 = 一条观测;首观测由现 evidence/source/conf 折入。
         clue.evidence 仍是全观测证据的累积展平数组(向后兼容:既有渲染读 evidence 的路径不变),
         每条观测的 evidence 是其中的同一批引用。 */
      observations: []
    };
    var os = (o.observations || []).map(function (x) {
      return { t: x.t, source: x.source, conf: (x.conf === undefined ? null : x.conf), evidence: x.evidence || [], note: x.note || '', kind: x.kind || obsKind(x.source) };
    });
    var first = { t: o.t || '19:00', source: o.source, conf: (o.conf === undefined ? null : o.conf), evidence: c.evidence.slice(), note: o.note || '', kind: obsKind(o.source) };
    // 历史观测在前(按给定序),首现/最新按数组顺序取
    c.observations = os.concat([first]);
    // 历史观测的证据并入展平数组(排在本次观测证据之前,保持时间序)
    if (os.length) {
      var flat = [];
      os.forEach(function (x) { (x.evidence || []).forEach(function (e) { flat.push(e); }); });
      c.evidence = flat.concat(c.evidence);
    }
    return syncObs(c);
  }
  w.CLUE_OBS = { kind: obsKind, sync: syncObs };

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
      note: '暴雨预警期整体升一档(养护→雨前急修)'
    }));
  });

  /* ============ 5 · T0 抽审队列 3 条 + 治理开关 ============ */
  var GOV = {
    fastlane: { '井盖缺失': true, '爆管': true },
    stormMode: false,
    auditQueue: [
      { id: 'AU-1201', src: '高危确认拘审', clueId: 'CL-0198', reason: '井盖移位·高危确认件全量拘审', t: '17:42', status: '待抽审' },
      { id: 'AU-1202', src: '批量确认 15% 抽样', clueId: 'CL-0175', reason: '路面养护批量件抽样', t: '17:55', status: '待抽审' },
      { id: 'AU-1203', src: '机器直派件全量抽审', clueId: 'CL-0166', reason: '机器直派自动派单件·误派率月报口径', t: '18:10', status: '待抽审' }
    ]
  };

  /* ============ 6 · T0 已有工单/告警/调查案 ============
     R87:summary = 事项一句话(「井盖缺失 · Al Jimi MH-0417」式,由关联线索或工单类型派生);
         resumeCond = 挂起件的恢复条件 {cond, owner, eta} —— 未挂起为 null。 */
  var TICKETS = [
    {
      id: 'WO-8871', type: '养护批量工单', clueId: null, facility: 'RD-2101', crew: 'CR-05',
      state: '已接单', source: TICKET_SOURCES.plan, createdT: '18:10', mirror: 'MUN-WO-77214',
      sla: { accept: '18:20', arrive: '19:40', done: '23:00' }, suspended: false, photos: [], line: '路面',
      summary: '周期养护批量 · Al Maqam RD-2101', resumeCond: null,
      note: '周批养护(在途);被抢占让位,SLA 停表'
    },
    {
      id: 'WO-8863', type: '急修工单', clueId: null, facility: 'GR-1147', crew: 'CR-02',
      state: '已到场', source: TICKET_SOURCES.human, createdT: '17:30', mirror: 'MUN-WO-77198',
      sla: { accept: '17:40', arrive: '18:10', done: '21:30' }, suspended: false, photos: [], line: '井盖',
      summary: '雨水口堵塞(箅面) · Al Jimi GR-1147', resumeCond: null,
      note: ''
    }
  ];

  /* R87 A1:告警对象带状态与申诉/裁定留痕位(appeal / ruling / misfire) */
  var ALERTS = [
    { id: 'AL-0771', clueId: 'CL-0198', facility: 'MH-0289', line: '井盖', level: '紧急', status: '成立', t: '17:41', by: '区复核员', appeal: null, ruling: null, misfire: false }
  ];

  var INVESTIGATIONS = [];

  /* ============ 7 · 动作日志(登记在册的独立记录;时间线组件唯一数据源)============ */
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
    { id: 'PC-0031', item: '井盖线 加急人工 SLA', from: '30 分', to: '30 分', status: '现行', by: '复核主管', note: '假设值,区可配' }
  ];

  /* ============ 8b · 判据规则表(R86 A2;规则引擎从黑盒到白盒)============
     每条:{id, line(井盖/路面/管网/派单/线索归并), name, when(人话判据句),
            lane(路由到哪档,取 LANE_DEFS.name)| action(不路由而是产出动作),
            params:[{key,label,val,unit,assume,desc}], version, editableBy[]}
     ⚠ params 数字全为假设值(assume:true),试点首周与客户核实后按区可配参数标定。
     R87 A9:每个参数带 desc —— 一句话说清这个数管的是什么,m6 参数列悬停即见。
     消费方:m6 规则引擎 tab / 流程位置图分支标注 / spec.html 规则总表 / PDF 指路。 */
  function P(key, label, val, unit, desc) { return { key: key, label: label, val: val, unit: unit || '', assume: true, desc: desc || '' }; }
  var SUP = ['复核主管', '上级主管部门'];
  var MGR = ['复核主管'];

  w.RULES = [
    /* ---- 井盖线 ---- */
    { id: 'MH-R01', line: '井盖', name: '双传感器互证 → 机器直派', lane: '机器直派',
      when: '位移角越限 且 同井液位突变,两只传感器在互证窗内先后命中 → 硬证据齐,先派后审',
      params: [
        P('tiltDeg', '位移角阈值', 15, '°', '井盖偏离水平多少度算越限;不到这个角度按盖体正常轻微晃动处理。'),
        P('levelJump', '液位突变阈值', 20, 'cm', '同一口井的液位在互证窗内跳变多少,才算第二只传感器给出了佐证。'),
        P('crossWin', '互证窗', 90, '秒', '两只传感器先后命中的最长间隔;超过这个时间算两件独立的事,不再互证。')],
      version: 'v1.0', editableBy: SUP },
    { id: 'MH-R02', line: '井盖', name: '单一位移越限(无第二传感器佐证)→ 加急人工', lane: '加急人工',
      when: '只有位移传感器越限,同井无第二传感器佐证 → 不满足双闸硬条件,进分钟级人工确认',
      params: [
        P('tiltDeg', '位移角阈值', 15, '°', '单只位移传感器越限的判定角度,与双传感器规则同一口径。'),
        P('sla', '人工确认档长', 30, '分钟', '这类件从进队列到复核员必须给出结论的时限,超时逐级升级。')],
      version: 'v1.0', editableBy: SUP },
    { id: 'MH-R03', line: '井盖', name: 'AI 视觉确认盖体缺失(多帧一致)→ 升机器直派', lane: '机器直派',
      when: 'AI 在连续多帧上一致判定盖体缺失,且置信不低于阈值 → 视觉可当硬证据用,升先派后审',
      params: [
        P('frames', '连续帧数', 5, '帧', '同一处异常要在连续多少帧画面上出现,才算稳定识别而不是单帧闪现。'),
        P('agree', '帧间一致率', 0.8, '', '这些帧里判为同一处异常的比例,防的是单帧误检。'),
        P('conf', '置信阈值', 0.85, '', '视觉判定的把握度下限,低于这个数不拿视觉当硬证据用。')],
      version: 'v1.0', editableBy: SUP },
    { id: 'MH-R04', line: '井盖', name: '传感器自检失败 → 设备维修单', action: '开设备工单', lane: '自动处理',
      when: '心跳/方差/量程三态自检任一失败 → 先排设备故障,不报业务异常;承接方=传感网运维方',
      params: [
        P('hbGap', '心跳缺失容忍', 10, '分钟', '传感器多久没上报心跳就判为掉线,转设备侧排查。'),
        P('varWin', '方差为零判定窗', 60, '分钟', '读数在这段时间里一动不动就判为卡死,不再当真实读数用。')],
      version: 'v1.0', editableBy: MGR },
    { id: 'MH-R05', line: '井盖', name: '台账不符 → 驳回复核', lane: '驳回与转办',
      when: '报警点位在台账缓冲区外,或该点位无登记设施 → 转人工驳回确认(高危件零自动归档)',
      params: [P('buffer', '台账点位匹配半径', 25, '米', '报警坐标与台账登记点位允许的最大偏差,超出就认为对不上账。')],
      version: 'v1.0', editableBy: MGR },
    { id: 'MH-R06', line: '井盖', name: '雨水口箅面堵塞(养护级)→ 常规人工', lane: '常规人工',
      when: '固定相机判定箅面堵塞、无液位异常 → 批量例行确认后并入清掏计划',
      params: [
        P('conf', '置信阈值', 0.7, '', '相机判定箅面堵塞的把握度下限,低于这个数不进清掏计划。'),
        P('batch', '单批上限', 20, '条', '一次批量确认最多带多少条,防止一屏点过、看不过来。')],
      version: 'v1.0', editableBy: MGR },
    { id: 'MH-R07', line: '井盖', name: '暴雨预警期整体升一档', action: '全线升档 + 雨前清掏任务包',
      when: '气象强对流预警生效 → 井盖线在池养护件整体升「急修」,液位计转先导预警源',
      params: [P('leadHours', '预警提前量', 6, '小时', '气象预警生效前多久开始全线升档并起雨前清掏任务包。')],
      version: 'v1.0', editableBy: SUP },

    /* ---- 路面线 ---- */
    { id: 'RD-R01', line: '路面', name: '高置信 + 多源确证 + 主干道 → 加急人工', lane: '加急人工',
      when: 'AI 置信达标,且公众上报或复检构成第二来源,且落在主干道 → 分钟级人工确认后派',
      params: [
        P('conf', 'AI 置信阈值', 0.85, '', '视觉识别的把握度下限,达标才进分钟级人工确认。'),
        P('sources', '最少来源数', 2, '个', '同一处异常至少要有几路来源印证(车载、固定相机、公众上报各算一路)。'),
        P('roadClass', '道路等级', '主干道', '', '哪一级道路适用这条加急口径;支路与背街按常规队列走。')],
      version: 'v1.0', editableBy: SUP },
    { id: 'RD-R02', line: '路面', name: '单源中置信 → 常规人工', lane: '常规人工',
      when: '仅车载单源、置信落在中档区间 → 进批量半审,人逐条或成批确认',
      params: [
        P('confLo', '中档下界', 0.6, '', '把握度低于这个数不进人工队列,按机械驳回处理。'),
        P('confHi', '中档上界', 0.85, '', '把握度高于这个数改走加急人工,不再排批量。')],
      version: 'v1.0', editableBy: MGR },
    { id: 'RD-R03', line: '路面', name: '低置信 / 树影类误报特征 → 机械驳回', lane: '驳回与转办',
      when: '置信低于下界,或命中夜间树影、路面污渍等已知误报特征 → 机械驳回按原因码①回流样本',
      params: [
        P('confLo', '置信下界', 0.6, '', '把握度低于这个数即机械驳回,不占人工工时。'),
        P('shadowScore', '树影特征分阈值', 0.7, '', '画面命中夜间树影、路面污渍等已知误报特征的程度,越高越像误报。')],
      version: 'v1.0', editableBy: MGR },
    { id: 'RD-R04', line: '路面', name: '养护级 × 高置信 × 机械全过 → 自动升格', lane: '自动处理',
      when: '养护级、置信高、五项机械校验全过 → 免人工并入周期养护计划,事后抽审兜底',
      params: [
        P('conf', '置信阈值', 0.88, '', '免人工直接并入养护计划所需的把握度下限。'),
        P('checks', '机械校验须全过项数', 5, '项', '五项机械校验要全部通过才允许免人工,缺一项就回人审。'),
        P('audit', '事后抽审率', 15, '%', '免人工处置的件按这个比例抽出来事后复看,机械自动化不豁免审计。')],
      version: 'v1.0', editableBy: SUP },
    { id: 'RD-R05', line: '路面', name: '观察级 → 记账(自动)', lane: '自动处理',
      when: '观察级且机械校验通过 → 不开单,自动记台账入劣化曲线',
      params: [P('curveWin', '劣化曲线回看窗', 90, '天', '记账件往回看多长时间的历史,用来判断这处路面是不是在持续变差。')],
      version: 'v1.0', editableBy: MGR },
    { id: 'RD-R06', line: '路面', name: '周期定检漏扫 → 补扫任务(自动)', action: '开补扫任务', lane: '自动处理',
      when: '路段超过定检周期仍无有效过检帧 → 自动排补扫任务,不产线索',
      params: [
        P('cycle', '定检周期', 14, '天', '同一路段两次有效过检之间的最长间隔。'),
        P('grace', '宽限期', 3, '天', '超过定检周期后再宽限几天,仍无过检才排补扫任务。')],
      version: 'v1.0', editableBy: MGR },

    /* ---- 管网线 ---- */
    { id: 'PL-R01', line: '管网', name: '水量平衡越限持续 → 立案(常规人工)', lane: '常规人工',
      when: '按灌溉事件比对实配水量与计划应配水量,偏差越限并持续 → 开调查案,人在立案/结案两点拍板',
      params: [
        P('dev', '水量偏差阈值', 12, '%', '本次灌溉实配水量与计划应配水量的差,超过这个比例就认为有异常损失。'),
        P('hold', '持续时长', 30, '分钟', '偏差要持续多久才算数,防的是阀门切换那一下的抖动。'),
        P('times', '连续灌溉事件数', 3, '次', '连续几次灌溉都偏,才开调查案。')],
      version: 'v1.0', editableBy: SUP },
    { id: 'PL-R02', line: '管网', name: '水力学爆管特征 → 机器直派 + 关阀预案', lane: '机器直派',
      when: '压降速率越限且阀事件对齐为计划外 → 先派后审,同时下发关阀预案',
      params: [
        P('dpdt', '压降速率阈值', 0.15, 'bar/分', '管压下跌多快算爆管特征;慢降按正常用水波动看。'),
        P('valveWin', '阀事件对齐窗', 5, '分钟', '压降前后这段时间内如有计划内阀门动作,判为计划操作不报警。')],
      version: 'v1.0', editableBy: SUP },
    { id: 'PL-R03', line: '管网', name: '自检信号异常 → 设备维修单', action: '开设备工单', lane: '自动处理',
      when: '流量计/压力计自检异常或读数卡死 → 免人工定性,自动开设备维护工单',
      params: [P('flatWin', '读数方差为零窗', 60, '分钟', '流量、压力读数在这段时间里毫无波动,就判为仪表卡死。')],
      version: 'v1.0', editableBy: MGR },
    { id: 'PL-R04', line: '管网', name: 'AI 判不出 → 不明异常调查案(宁升不降)', lane: '常规人工',
      when: 'AI 渗漏判型只对规则腿筛出的剩余嫌疑作判;判不出时不降级归档,按「不明异常」开调查案',
      params: [P('conf', '判型可用置信', 0.6, '', 'AI 判型把握度低于这个数就不给结论,按不明异常开调查案,不降级归档。')],
      version: 'v1.0', editableBy: SUP },
    { id: 'PL-R05', line: '管网', name: '流量回归基线 → 建议结案', action: '建议结案(签字仍在人)',
      when: '水量平衡偏差回落至阈值内并保持 → 绿标点亮,系统只出建议,结案签字仍在人',
      params: [
        P('back', '回归判定偏差', 5, '%', '水量偏差回落到这个范围内,才算恢复正常。'),
        P('keep', '保持事件数', 2, '次', '回落之后还要连续保持几次灌溉事件,才建议结案。')],
      version: 'v1.0', editableBy: MGR },

    /* ---- 派单规则(R86⑧ 班组派工规则;R87 A2 改写为「先派尽派」口径)---- */
    { id: 'DP-R01', line: '派单', name: '就近可用班组优先', action: '候选班组排序',
      when: '能接这单的班组按到现场路程从近到远排;超出就近半径的不剔除,只往后排',
      params: [
        P('radius', '就近半径', 8, '公里', '超过这个路程的班组排序往后放,但仍留在候选里。'),
        P('etaCap', '到场时间上限', 30, '分钟', '预计到场超过这个时间的,派单时标出来给值班长看。')],
      version: 'v1.0', editableBy: MGR },
    { id: 'DP-R02', line: '派单', name: '技能与持证匹配', action: '候选班组过滤',
      when: '井盖线要密闭空间作业证、管网线要带压作业证;没证的不进候选,班组也可显名拒单',
      params: [
        P('mustCert', '硬性持证项', '密闭空间作业 / 带压作业', '', '这些证缺一不可,系统不放行,也不允许口头替代。'),
        P('gearMatch', '装备匹配要求', '必需', '', '车辆与器具不满足作业要求的班组不进候选。')],
      version: 'v1.0', editableBy: SUP },
    { id: 'DP-R03', line: '派单', name: '先派尽派:有能接的就先发出去', action: '候选班组指派',
      when: '只要辖区里还有一个能接这单的班组(含跨类目可胜任的),单就先发出去;班组手上有在办件只把它往后排,不构成把单压在系统里不派的理由',
      params: [
        P('maxLoad', '单班组在办提醒上限', 2, '件', '手上超过这么多件的班组仍然可以派,只是派单时标出来提醒值班长。'),
        P('holdOnBusy', '班组都在办时压单', '不允许', '', '所有班组都在办,也不许把单压在系统里等人;先发出去,再走抢占程序。')],
      version: 'v1.0', editableBy: MGR },
    { id: 'DP-R04', line: '派单', name: '辖区零可用班组 → 抢占调度三步', action: '在办件让位 → 跨班组借调 → 值班长裁定',
      when: '只有当辖区里一个能接单的班组都没有时才进抢占:先从在办件里挑一件让位,让不出来就跨班组借调,还不解决就交值班长裁定;三步各自留痕,每一步系统都先算好具体方案再交人',
      steps: [
        { no: 1, name: '在办件让位', when: '从占用班组手上的在办件里挑出优先级最低、且中断不会造成二次风险的一件,系统建议把它挂起让位;原件停表并回队重派。' },
        { no: 2, name: '跨班组借调', when: '本线让不出人时,向相邻责任区或相邻班次借一个持证可胜任的班组;证不符的不进借调候选。' },
        { no: 3, name: '值班长裁定', when: '前两步系统都已经给出具体建议单,值班长收到待裁定卡(含建议方案与执行后果),一键采纳或改派;不是等人想办法,是人只做确认或改。' }
      ],
      params: [
        P('yieldGap', '让位优先级差', 2, '档', '新来的件要比在办件高出这么多档,才允许让位。'),
        P('borrowRadius', '借调半径', 15, '公里', '向多远范围内的相邻责任区或相邻班次借人。'),
        P('escalate', '升值班长等待', 10, '分钟', '前两步这么久还没解决,就直接推给值班长裁定,不再等。')],
      version: 'v1.0', editableBy: SUP },
    { id: 'DP-R05', line: '派单', name: 'SLA 档位', action: '工单计时档',
      when: '派工后按档计时:接单、到场、完工三段各自计时;挂起与待条件期间停表,条件解除后接着算',
      params: [
        P('accept', '接单', SLA.accept, '分钟', '从派工到班组点接单的时限。'),
        P('arrive', '到场', SLA.arrive, '分钟', '从接单到人车抵达现场的时限。'),
        P('sameDay', '当日档完工', SLA.sameDay, '分钟', '当日队列的件从派工到提交完工的时限。')],
      version: 'v1.0', editableBy: SUP },

    /* ---- 线索归并(R86 A3 原子性)---- */
    { id: 'CL-R01', line: '线索归并', name: '一处设施上的同类异常只记一条线索', action: '并入既有线索作一次观测',
      when: '一处设施上又发现同一类异常,而原线索还没关闭 → 并进原线索记一次观测,不新开一条',
      params: [P('activeWin', '线索保活时长', 72, '小时', '线索开出后多久之内的新发现算同一件事并进去;超过这个时长再发现就另开一条。')],
      version: 'v1.0', editableBy: SUP },
    { id: 'CL-R02', line: '线索归并', name: '路面无设施锚点按路段栅格并', action: '并入既有线索作一次观测',
      when: '路面异常没有设施编号可锚时按路段格子归并,落在同一个格子里的同类异常算一处',
      params: [P('grid', '路段栅格', 50, '米', '路面没有设施编号时按这么大的格子归并,同格同类算一处。')],
      version: 'v1.0', editableBy: MGR },
    { id: 'CL-R03', line: '线索归并', name: '跨类目不并 / 关闭后再发现另开新线索', action: '新开线索 + 历史关联',
      when: '不同类的异常各自成线索;线索关闭后又发现 → 新开一条,并挂上旧线索作「历史关联」',
      params: [P('reopenGap', '关闭后另开判定间隔', 0, '分钟', '线索关闭后再发现同类异常即另开新线索,不做等待。')],
      version: 'v1.0', editableBy: MGR }
  ];

  /* ============ 9 · 顶层 DATA(施工图 §4)============ */
  w.DATA = {
    meta: {
      city: 'Al Ain', tenant: 'Al Ain 区市政', t0: '19:00',
      storm: '今夜有强对流预警',
      scene: '暴雨前夜',
      ruleVer: 'rules-2026.08.1', modelVer: 'vision-2026.07.3', paramVer: 'param-AlAin-v4', refVer: 'ref-2026.08.01'
    },
    dict: {
      blocks: BLOCKS, landmarks: LANDMARKS, roles: ROLES, roleDisplay: ROLE_DISPLAY, serviceAccounts: SERVICE_ACCOUNTS,
      roleRank: ROLE_RANK, levels: LEVELS, lanes: LINE_LANES, laneDefs: LANE_DEFS, checkDefs: CHECK_DEFS,
      rejectCodes: REJECT_CODES, reasonCodes: REASON_CODES,
      ticketStates: TICKET_STATES, ticketSources: TICKET_SOURCES, sla: SLA,
      alertStates: ALERT_STATES
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
    /* R86 A9 · 横幅统一形态:{id, tone, text, scope, href?(点主体跳对象路由), dismissible} */
    banners: [
      {
        id: 'BN-storm', tone: 'warn', scope: 'global', dismissible: true, href: '#/m1/line/mh',
        text: '今夜有强对流预警:井盖线雨水口养护件整体升一档,雨前清掏专项待启。'
      }
    ],
    /* R86 A9 · 已关闭横幅 id(重置数据后回来) */
    dismissed: []
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
      manual: '页面横幅「机器派单,人复核中」;m1 机器直派并行复核卡可见。'
    },
    {
      id: 'T2', t: '19:03', figs: 'D1',
      title: '并行复核窗开启 · 15 分钟倒计时',
      narration: '19:03 机器直派并行复核窗开启:15 分钟倒计时 + 撤回按钮可见。确认=告警追认;撤回=召回班组。',
      unlocks: [],
      auto: [
        { action: 'auto_review_window', params: { actor: '规则引擎', clueId: 'CL-0417', mins: SLA.fastlaneReview } }
      ],
      manual: '评审者点「确认」= 告警追认;或点「机器直派撤回」走召回分支。'
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
      manual: '班组端上可自己走一遍(已自动走完的步骤不会重复记日志)。'
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
      narration: '19:30 对照例:MH-0562(Hili)纯视觉 0.31、无传感器硬证据 → 不走机器直派,进加急人工 30 分钟倒计时。',
      unlocks: [{ type: 'clue', obj: 'CL-0562' }],
      auto: [
        { action: 'auto_create_clue', params: { actor: 'AI 服务', clueId: 'CL-0562' } },
        { action: 'auto_mech_check', params: { actor: '规则引擎', clueId: 'CL-0562' } },
        { action: 'auto_route', params: { actor: '规则引擎', clueId: 'CL-0562', lane: '加急人工' } }
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
      manual: '人认可驳回码① → 「高危驳回已拘主管抽审」横幅;或点「推翻机械判定」。'
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
      narration: '21:00 第二井盖件 MH-0733(Zakher)紧急级,承接池无空闲班组 → 过载三步:①只读预警先喊现场 ②超额件显名降级进批量加急分诊 ③值班长可抢占在途养护班组。',
      unlocks: [{ type: 'clue', obj: 'CL-0733' }],
      auto: [
        { action: 'auto_sensor_alarm', params: { actor: '规则引擎', sensorId: 'SN-0733', facility: 'MH-0733', clueId: 'CL-0733' } },
        { action: 'auto_mech_check', params: { actor: '规则引擎', clueId: 'CL-0733' } },
        { action: 'auto_overload', params: { actor: '规则引擎', clueId: 'CL-0733' } },
        { action: 'auto_broadcast', params: { actor: '规则引擎', scope: 'Zakher', text: 'MH-0733 井盖缺失,承接池无可派 → 已进批量加急分诊,等待值班长仲裁。' } }
      ],
      manual: '切「区值班长」角色 → m2 调度视图点「挂起 WO-8871(抢占调度)」再改派 → 挂起回补卡可见。'
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
      narration: '21:30 暴雨模式启动:井盖线整体升档横幅 + 雨前清掏任务包卡。上级主管部门可关「井盖缺失」机器直派 → 回退人审 + 区申诉入口;主管详情内紧急 override 红色动作可点。',
      unlocks: [{ type: 'ticket', obj: 'WO-9012' }],
      auto: [
        { action: 'auto_storm_on', params: { actor: '规则引擎' } },
        { action: 'auto_storm_tasks', params: { actor: '规则引擎', ticketId: 'WO-9012' } }
      ],
      manual: '切「上级主管部门」→ m6 关「井盖缺失」机器直派(强制通知横幅 + 区申诉入口);切「复核主管」→ m1 详情紧急 override(双确认)。'
    }
  ];

  /* ============ 11 · 场景步解锁用的对象模板(advance 时按 id 注入)============ */
  w.UNLOCKS = {
    clues: {
      'CL-0417': clue({
        id: 'CL-0417', line: '井盖', level: '紧急', conf: 0.93, source: '位移传感器 SN-0417(已认证设备签名报文)',
        facility: 'MH-0417', block: 'Al Jimi', kindText: '井盖缺失',
        checks: checks('井盖', ['pass', 'pass', 'pass', 'pass']),
        evidence: [{ kind: 'manhole-missing', label: 'AI 生成示意' }, { kind: 'sensor', label: 'AI 生成示意' }],
        /* R86 A3:19:01 位移先响、19:02 液位突变互证 —— 两次观测构成 MH-R01 的双传感器互证 */
        observations: [
          { t: '19:01', source: '位移传感器 SN-0417(已认证设备签名报文)', conf: 0.76, note: '位移角越限首报,互证窗内等待第二传感器',
            evidence: [{ kind: 'sensor', label: 'AI 生成示意' }] }
        ],
        lane: '机器直派', fastlane: true, t: '19:02',
        note: '双闸硬证据齐(传感器硬证据 + 机械四项全过)→ 自动派单,人 15 分钟内并行复核'
      }),
      'CL-0562': clue({
        id: 'CL-0562', line: '井盖', level: '紧急', conf: 0.31, source: '固定相机网(纯视觉)',
        facility: 'MH-0562', block: 'Hili', kindText: '井盖缺失(疑似)',
        checks: checks('井盖', ['pass', 'fail', 'warn', 'pass']),
        evidence: [{ kind: 'manhole-shift', label: 'AI 生成示意' }],
        /* R86 A3:同一处设施上同类异常在保活时长内的历史观测(证据卡多图横排的料;首见 18:52,最近 19:30) */
        observations: [
          { t: '18:52', source: '固定相机网(纯视觉)', conf: 0.24, note: '首帧疑似盖体偏移,单帧未达多帧一致阈值',
            evidence: [{ kind: 'manhole-shift', label: 'AI 生成示意' }] },
          { t: '19:11', source: '城市移动传感网(车载过检)', conf: 0.29, note: '车载过检复现同点位,置信仍在阈值下',
            evidence: [{ kind: 'manhole-shift', label: 'AI 生成示意' }] }
        ],
        lane: '加急人工', t: '19:30',
        note: '低置信 0.31 且无传感器硬证据 → 不进机器直派;加急队列 SLA 30 分钟(假设值)+ 三级升级'
      }),
      'CL-0588': clue({
        id: 'CL-0588', line: '井盖', level: '紧急', conf: 0.44, source: '城市移动传感网(夜间树影)',
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
        /* R86 A3:同路段同类目三次过检 = 一条线索三次观测(裂缝密度递增,进劣化曲线) */
        observations: [
          { t: '19:18', source: '城市移动传感网(车载过检)', conf: 0.83, note: '首次过检:网裂初现,密度低于养护触发线',
            evidence: [{ kind: 'crack', label: 'AI 生成示意' }] },
          { t: '19:47', source: '固定相机网', conf: 0.87, note: '同点位复现,裂缝密度上升',
            evidence: [{ kind: 'crack', label: 'AI 生成示意' }] }
        ],
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
        id: 'CL-0733', line: '井盖', level: '紧急', conf: 0.89, source: '位移传感器 SN-0733(已认证设备签名报文)',
        facility: 'MH-0733', block: 'Zakher', kindText: '井盖缺失',
        checks: checks('井盖', ['pass', 'pass', 'pass', 'pass']),
        evidence: [{ kind: 'manhole-missing', label: 'AI 生成示意' }],
        lane: '机器直派', fastlane: true, t: '21:00',
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
        summary: '雨前清掏核查 · Al Sarooj GR-1102', resumeCond: null,
        note: '雨前清掏核查任务包(井筒淤积对视觉与液位皆盲 → 任务型兜底)'
      }
    }
  };

  /* ============ 12 · index/README 用:浅演示清单(施工图 §6 尾注)============ */
  w.SHALLOW_SCENES = [
    { fig: 'D11', name: '作业时窗与封控校验(斋月/高温禁令/活动封控/交管批文)', form: '工单详情信息行:「排到最近可作业窗,SLA 停表」' },
    { fig: 'D12', name: '跨机构联动出动(警察/民防/产权单位)', form: '紧急件详情信息行 + 挂起原因码「联动处置等待」' },
    { fig: 'P6', name: '客户系统不可用/回写失败', form: '工单镜像横幅:「派工请求进重试队列,超阈值转人工电话派工并补录」' },
    { fig: 'P9', name: '移动端离线/无信号', form: '班组端页脚信息行:离线单本地暂存 + 回连补传' },
    { fig: 'P11', name: '分阶段处置(临时措施先行)', form: '班组端「部分完工」动作 + 工单阶段标' }
  ];

})(window);
