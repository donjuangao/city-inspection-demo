/* ===== 模块 m6 视图 · 归属 W1-D 工兵(施工图 §7/§8 裁定②:模块拆独立文件,文件互斥) =====
   契约:VIEWS.m6 = function(ctx) 返回 HTML 字符串;ctx={module,rest[],hash}
   共享文件(tokens/store/data/ui/app.html)只读;按钮用 data-action 属性走 UI.bindActions→S.commit

   规格来源:
   - 施工图 §7 m6:角色表 / 参数变更(影子试算)/ 类目紧急直派开关(上级主管部门)/ 值班表
   - 设计档 §0.6:角色·账号·权限·数据权限(R85④ 四角色口径 + 三非人账号;上级主管部门关自动车道条款 R72)
   - 施工图 §5 动作表:toggle_fastlane(上级主管部门)· appeal_fastlane(区申诉,G1)
   铁律:参数变更「影子试算」按钮不接 S.commit(store 未注册对应动作)——本页明确标注「不写入正式参数、不产生动作日志」,
        避免假装真实提交;紧急直派开关/区申诉走 UI.actionRow → S.commit(唯一状态变更入口)。 */
(function (w) {
  'use strict';

  /* ---------------- 1 · 角色权限表(设计档 §0.6;R85④ 原「区巡检管理者」「区管理员」并入「复核主管」) ---------------- */
  var ROLE_DESC = {
    '区复核员': '工作台读写 / 告警读。可执行:确认 / 驳回 / 推翻机械判定 / 紧急直派撤回 / 批量确认 / 存疑归档 / 立案·结案 / 转办 / 复验人裁与打回。',
    '复核主管': '复核员全部权限 + 抽审 / 撤销 / 兜底读写。另可:紧急 override(红色动作,双确认)/ 证据冻结 / 调度改派·合并·拆单 / 台账读写 / 总览本区(模块 5)/ 发起参数变更(走审批)/ 账号与角色授予(走审批,动作留痕);紧急直派关闭后的区申诉发起人之一。',
    '区值班长': '升级链第三级兜底(电话/短信);应急单作业时窗豁免批准;过载三步中的临时借调启动;与主管共享调度仲裁(改派/合并/拆单)与挂起(手动)。',
    '上级主管部门': '跨区只读 + 框架标准 + 类目紧急直派入池开关 + 月报。关车道 = 安全侧动作即时生效;重开需按数据判据批准。'
  };
  var SVC_DESC = {
    '规则引擎': '机械校验闸 / 自动车道(记账·升格·机械驳回·设备工单)/ 预警广播 / 紧急直派自动派单的执行身份;机械自动化也不豁免审计,每步入动作日志。',
    'AI 服务': '仅「创建线索 / 提出建议」两动作的执行身份;无界面登录权,无定性动作。',
    '班组账号': '仅班组移动端;接单/工单详情/拍照回传/完工提交;处置动作经集成网关写回客户工单系统;无 Web 工作台任何模块权限。'
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
      '<div class="card-hd"><h3>6 · 系统管理</h3><span class="tiny">角色权限表 · 四角色(白班/夜班岗位标注)+ 非人三账号</span></div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>角色 / 账号</th><th>权限层级</th><th>权限范围</th></tr></thead>' +
      '<tbody>' + rows + svcRows + '</tbody></table></div>' +
      '<div class="tiny" style="margin-top:6px">顶栏「角色」切换器可换身份(不做登录,只改可用动作);权限层级 L 值取自 dict.roleRank,越大调度权越高。</div>' +
      '</div>';
  }

  /* ---------------- 2 · 类目紧急直派开关(上级主管部门;R72)---------------- */
  var CAT_NOTE = {
    '井盖缺失': '井盖线应急紧急直派 · 硬证据 = 位移传感器已认证设备签名报文',
    '爆管': '管网线应急紧急直派 · 硬证据 = 阀事件对齐'
  };

  function fastlaneRow(cat) {
    var on = !!w.S.get().gov.fastlane[cat];
    var toggleBtn = on
      ? { action: 'toggle_fastlane', label: '关闭紧急直派', cls: 'btn-danger', params: { cat: cat, on: false, reason: '上级主管部门关闭该类目紧急直派(治理动作)' } }
      : { action: 'toggle_fastlane', label: '重开紧急直派', cls: 'btn-ok', params: { cat: cat, on: true, dataBasis: '近 30 天误派率回落至阈值内(假设数据)' } };
    var appealBtn = { action: 'appeal_fastlane', label: '区申诉', params: { cat: cat, reason: '本区应急处置等不起人审,申请复议重开' } };
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
      '<div class="card-hd"><h3 style="margin:0;font-size:14px">类目紧急直派开关</h3>' +
      '<span class="tiny">仅上级主管部门身份可点(灰态见未满足校验);关 = 即时生效 + 强制通知横幅 + 区申诉入口</span></div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>类目</th><th>当前状态</th><th>上级主管部门操作</th><th>区申诉</th></tr></thead>' +
      '<tbody>' + cats.map(fastlaneRow).join('') + '</tbody></table></div>' +
      '</div>';
  }

  /* ---------------- 3 · 参数变更行(影子试算)---------------- */
  function paramTable() {
    var rows = w.S.get().paramChanges.map(function (p) {
      return '<tr><td class="mono">' + UI.esc(p.id) + '</td><td>' + UI.esc(p.item) + '</td>' +
        '<td>' + UI.assume(p.from, '假设值,区可配') + '</td>' +
        '<td>' + UI.assume(p.to, '假设值,区可配') + '</td>' +
        '<td>' + UI.badge(p.status, 'blue') + '</td><td class="tiny">' + UI.esc(p.by) + '</td></tr>';
    }).join('');
    return '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th>变更单#</th><th>参数项</th><th>现行值</th><th>拟改值</th><th>状态</th><th>发起</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function paramPreview() {
    return '<div class="sep"></div>' +
      '<div class="tiny" style="margin-bottom:6px">影子试算(不写入正式参数、不产生动作日志):试算「井盖线应急人审档 SLA」阈值变化对在池待核查件的影响;正式变更需审批,按试点数据标定。</div>' +
      '<div class="row wrap" style="align-items:flex-end;gap:14px">' +
      '<div class="tiny">现行值 ' + UI.assume('30 分', '假设值,区可配') + '</div>' +
      '<div style="width:140px"><label class="fl" for="m6ParamInput">候选新值(分)</label><input type="text" id="m6ParamInput" value="24"></div>' +
      '<div><button type="button" class="btn" id="m6ParamPreviewBtn">影子试算预估</button></div>' +
      '</div>' +
      '<div class="tiny" id="m6ParamPreviewOut" style="margin-top:8px;color:var(--mute)"></div>';
  }

  function paramBlock() {
    return '<div class="card"><div class="card-hd"><h3 style="margin:0;font-size:14px">参数变更</h3>' +
      '<span class="tiny">走审批;发起人 = 复核主管</span></div>' +
      paramTable() + paramPreview() + '</div>';
  }

  /* 影子试算:纯前端估算,不接 S.commit,不改 state —— 仅统计当前在池件数作对照 */
  function computeShadow(rawVal) {
    var mins = parseInt(rawVal, 10);
    if (!mins || mins <= 0) return '请输入正整数分钟数。';
    var st = w.S.get();
    var pool = st.clues.filter(function (c) { return c.lane === '应急人审档' && c.status === 'open'; });
    if (!pool.length) return '当前「应急人审档」车道内无在池待核查件,暂无可试算样本。';
    var overNow = pool.filter(function (c) { return c.slaDeadline && w.S.slaLeft(c.slaDeadline) < 0; }).length;
    var ratio = mins / 30;
    var overNew = Math.min(pool.length, Math.round(overNow + pool.length * Math.max(0, 1 - ratio) * 0.4));
    return '影子试算(简化估算,不生效):SLA 30 分 → ' + mins + ' 分候选值下,在池 ' + pool.length +
      ' 条应急人审档件中,预估超时件数由 ' + overNow + ' 条变为约 ' + overNew +
      ' 条。非真实排队论模型;正式变更需走审批并按试点数据标定。';
  }

  /* ---------------- 4 · 值班表 ---------------- */
  function dutyBlock() {
    var rows = w.S.get().duty.map(function (d) {
      return '<tr><td>' + UI.esc(d.date) + '</td><td>' + UI.esc(d.role) + '</td>' +
        '<td>' + UI.esc(d.who) + '</td><td class="tiny">' + UI.esc(d.note) + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="sec-title">值班表(升级链兜底依据)</div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>日期</th><th>值班角色</th><th>在岗</th><th>备注</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  /* ---------------- 5 · 本体建模(R85②:对象 / 链接 / 动作 三张注册表 + 日志浏览入口)----------------
     平台的一切行为以 对象-链接-动作 三类记录结构化存储;本分区是注册表与日志的浏览入口。
     计数全部实算自 S.get()——注册表不是文档抄本,是运行时本体的镜子。 */
  var OBJ_TYPES = [
    { name: '设施', key: 'facilities', fields: '设施编号 · 类型 · 街区 · 权属 · 业务线 · 绑定数据源' },
    { name: '传感器', key: 'sensors', fields: '点位号 · 类型 · 所属设施 · 自检状态 · 观测覆盖窗' },
    { name: '线索', key: 'clues', fields: '线索号 · 业务线 · 级别 · 置信度 · 通道 · 状态 · 机械校验项' },
    { name: '告警', key: 'alerts', fields: '告警号 · 源线索 · 级别 · 成立/撤销 · 签字人' },
    { name: '工单', key: 'tickets', fields: '工单号 · 类型 · 来源 · 承接班组 · 五格状态 · 客户系统镜像号' },
    { name: '调查案', key: 'investigations', fields: '案号 · 计量区 · 状态 · 观察窗 · 判据 · 核查工单' },
    { name: '班组', key: 'crews', fields: '班组号 · 名称 · 可接业务线 · 资质 · 装备 · 班次 · 负载' },
    { name: '公众上报', key: 'publicReports', fields: '受理号 · 类目 · 定位 · 回执 · 状态 · 合并标' },
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
    return '<div class="card"><div class="card-hd"><h3 style="margin:0;font-size:14px">对象类型</h3>' +
      '<span class="tiny">实例数实算自当前世界状态</span></div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th style="width:150px">类型</th><th style="width:80px">当前实例数</th><th>关键字段</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
  }

  /* 链接类型:demo 无图数据库,链接以外键字段承载 —— 这里把隐式外键显式枚举并实时计数 */
  var LINK_TYPES = [
    { name: '线索 → 设施', ends: '线索 · 设施', via: 'clue.facility', count: function (st) { return st.clues.filter(function (x) { return !!x.facility; }).length; } },
    { name: '告警 → 线索', ends: '告警 · 线索', via: 'alert.clueId', count: function (st) { return st.alerts.filter(function (x) { return !!x.clueId; }).length; } },
    { name: '工单 → 告警 / 线索', ends: '工单 · 线索', via: 'ticket.clueId', count: function (st) { return st.tickets.filter(function (x) { return !!x.clueId; }).length; } },
    { name: '调查案 → 计量区', ends: '调查案 · 计量区(DMA)', via: 'investigation.dma', count: function (st) { return st.investigations.filter(function (x) { return !!x.dma; }).length; } },
    { name: '公众上报 → 线索(去重合并)', ends: '公众上报 · 线索', via: 'publicReport.mergedInto', count: function (st) { return (st.publicReports || []).filter(function (x) { return !!x.mergedInto; }).length; } },
    { name: '对账件 → 工单', ends: '对账件 · 工单', via: 'recon.ticketId', count: function (st) { return (st.recon || []).filter(function (x) { return !!x.ticketId; }).length; } }
  ];

  function linkTypeTable() {
    var st = w.S.get();
    var rows = LINK_TYPES.map(function (l) {
      return '<tr><td><b>' + UI.esc(l.name) + '</b></td><td class="tiny">' + UI.esc(l.ends) + '</td>' +
        '<td class="tiny mono">' + UI.esc(l.via) + '</td><td class="mono">' + l.count(st) + '</td></tr>';
    }).join('');
    return '<div class="card"><div class="card-hd"><h3 style="margin:0;font-size:14px">链接类型</h3>' +
      '<span class="tiny">对象之间的引用关系;当前以外键字段承载,计数实算</span></div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr>' +
      '<th style="width:220px">链接</th><th style="width:180px">端点类型</th><th style="width:180px">承载字段</th><th style="width:90px">当前链接数</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div></div>';
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
    return '<div class="card"><div class="card-hd"><h3 style="margin:0;font-size:14px">动作类型</h3>' +
      '<span class="tiny">共 ' + defs.length + ' 类(人工 ' + human.length + ' · 自动 ' + auto.length + ');本表即权限矩阵的本体形态</span></div>' +
      '<div style="overflow-x:auto;max-height:340px"><table class="tb"><thead><tr>' +
      '<th style="width:180px">动作</th><th style="width:220px">显示名</th><th>执行角色白名单</th><th style="width:70px">执行方式</th>' +
      '</tr></thead><tbody>' + human.map(row).join('') + auto.map(row).join('') + '</tbody></table></div>' +
      '<div class="tiny" style="margin-top:6px">服务账号(规则引擎 / AI 服务 / 班组账号)与人角色在同一张表上受同一套白名单约束;' +
      '自动动作不豁免审计,每次执行同样落一条日志。</div></div>';
  }

  /* 本体日志(倒序;默认前 50 条,可展开全部)—— 与导览「后端发生了什么」浮层共用 UI.ontologyLog */
  var logExpanded = false;
  function ontologyLogBlock() {
    var all = w.S.get().actionLog;
    var lim = logExpanded ? 0 : 50;
    var more = all.length > 50
      ? '<div style="margin-top:8px"><button type="button" class="btn btn-sm" id="m6LogToggle">' +
        (logExpanded ? '收起(只看最近 50 条)' : '展开全部 ' + all.length + ' 条') + '</button></div>'
      : '';
    return '<div class="card" id="m6-ontology-log"><div class="card-hd"><h3 style="margin:0;font-size:14px">本体日志</h3>' +
      '<span class="tiny">全量动作记录 ' + all.length + ' 条 · 倒序' + (logExpanded ? '' : ' · 显示最近 ' + Math.min(50, all.length) + ' 条') + '</span></div>' +
      UI.ontologyLog(all, { desc: true, limit: lim, empty: '当前世界状态下尚无动作记录。' }) + more +
      '<div class="tiny" style="margin-top:6px">谁、何时、对什么对象、做了什么 —— 同一本日志;每条可整链导出、可按世界状态快照回放。' +
      '动作日志保存 ' + UI.assume('≥3 年', '留存年限 = 假设值,按客户合规要求配置') + ',防篡改口径 = 可检测。</div></div>';
  }

  function ontologyBlock() {
    return '<div class="card card-tight" id="m6-ontology">' +
      '<div class="card-hd"><h3 style="margin:0;font-size:14px">本体建模</h3>' +
      '<span class="tiny">对象 · 链接 · 动作 三类注册表</span></div>' +
      '<div class="small">平台的一切行为以 <b>对象-链接-动作</b> 三类记录结构化存储;本页是注册表与日志的浏览入口。</div>' +
      '</div>' +
      objTypeTable() + linkTypeTable() + actionTypeTable() + ontologyLogBlock();
  }

  /* 预演按钮:事件委托绑定一次,不依赖每次 render 后重新挂载(DOM 每次整段替换) */
  w.document.addEventListener('click', function (e) {
    if (!e.target) return;
    if (e.target.id === 'm6ParamPreviewBtn') {
      var input = w.document.getElementById('m6ParamInput');
      var out = w.document.getElementById('m6ParamPreviewOut');
      if (out) out.textContent = computeShadow(input ? input.value : '');
      return;
    }
    if (e.target.id === 'm6LogToggle') {
      logExpanded = !logExpanded;
      if (w.ROUTE && w.ROUTE.render) w.ROUTE.render();
    }
  });

  VIEWS.m6 = function (ctx) {
    return roleTable() + fastlaneBlock() + paramBlock() + dutyBlock() + ontologyBlock();
  };
})(window);
