/* ===== 模块 m6 视图 · 归属 W1-D 工兵(施工图 §7/§8 裁定②:模块拆独立文件,文件互斥) =====
   契约:VIEWS.m6 = function(ctx) 返回 HTML 字符串;ctx={module,rest[],hash}
   共享文件(tokens/store/data/ui/app.html)只读;按钮用 data-action 属性走 UI.bindActions→S.commit

   规格来源:
   - 施工图 §7 m6:角色表 / 参数变更(预演示意)/ 类目快车道开关(DMT)/ 值班表
   - 设计档 §0.6:角色·账号·权限·数据权限(五角色 + 三非人账号;DMT 关自动车道条款 R72)
   - 施工图 §5 动作表:toggle_fastlane(DMT)· appeal_fastlane(区申诉,G1)
   铁律:参数变更「预演」按钮不接 S.commit(store 未注册对应动作)——本页明确标注「不写入正式参数、不产生动作日志」,
        避免假装真实提交;快车道开关/区申诉走 UI.actionRow → S.commit(唯一状态变更入口)。 */
(function (w) {
  'use strict';

  /* ---------------- 1 · 角色权限表(设计档 §0.6) ---------------- */
  var ROLE_DESC = {
    '区管理员': '账号与角色授予(走审批,动作留痕);不参与业务定性与调度。',
    '区复核员': '工作台读写 / 告警读。可执行:确认 / 驳回 / 推翻机械判定 / 快车道撤回 / 批量确认 / 存疑归档 / 立案·结案 / 转办 / 复验人裁与打回。',
    '复核主管': '复核员全部权限 + 抽审 / 撤销 / 兜底读写。另可:紧急 override(红色动作,双确认)/ 证据冻结 / 调度改派·合并·拆单。',
    '区值班长': '升级链第三级兜底(电话/短信);应急单作业时窗豁免批准;过载三步中的临时借调启动;与主管共享调度仲裁(改派/合并/拆单)与挂起(手动)。',
    '区巡检管理者': '台账读写 / 总览本区(模块 5)/ 发起参数变更(走审批)。快车道关闭后的区申诉发起人之一。',
    'DMT': '跨区只读 + 框架标准 + 类目快车道入池开关 + 月报。关车道 = 安全侧动作即时生效;重开需按数据判据批准。'
  };
  var SVC_DESC = {
    '规则引擎': '机械校验闸 / 自动车道(记账·升格·机械驳回·设备工单)/ 预警广播 / 快车道自动派单的执行身份;机械自动化也不豁免审计,每步入动作日志。',
    'AI 服务': '仅「创建线索 / 提出建议」两动作的执行身份;无界面登录权,无定性动作。',
    '班组账号': '仅班组移动端(crew.html);接单/工单详情/拍照回传/完工提交;处置动作经集成网关写回客户工单系统;无 Web 工作台任何模块权限。'
  };

  function roleTable() {
    var dict = w.S.dict(), rank = dict.roleRank, cur = w.S.get().role;
    var rows = dict.roles.map(function (r) {
      var on = r === cur;
      return '<tr' + (on ? ' class="is-sel"' : '') + '>' +
        '<td><b>' + UI.esc(r) + '</b>' + (on ? ' <span class="badge badge-blue">当前身份</span>' : '') + '</td>' +
        '<td class="tiny">L' + (rank[r] || '-') + '</td>' +
        '<td>' + UI.esc(ROLE_DESC[r] || '') + '</td></tr>';
    }).join('');
    var svcRows = dict.serviceAccounts.map(function (r) {
      return '<tr><td><b>' + UI.esc(r) + '</b> <span class="badge badge-amber">服务账号</span></td>' +
        '<td class="tiny">—</td><td>' + UI.esc(SVC_DESC[r] || '') + '</td></tr>';
    }).join('');
    return '<div class="card">' +
      '<div class="card-hd"><h3>6 · 系统管理</h3><span class="tiny">角色权限表 · 五角色 + 值班长(辅助)+ 非人三账号</span></div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>角色 / 账号</th><th>权限层级</th><th>权限范围</th></tr></thead>' +
      '<tbody>' + rows + svcRows + '</tbody></table></div>' +
      '<div class="tiny" style="margin-top:6px">顶栏「角色」切换器可换身份(不做登录,只改可用动作);权限层级 L 值取自 dict.roleRank,越大调度权越高。</div>' +
      '</div>';
  }

  /* ---------------- 2 · 类目快车道开关(DMT;R72)---------------- */
  var CAT_NOTE = {
    '井盖缺失': '井盖线应急快车道 · 硬证据 = 位移传感器已认证设备签名报文',
    '爆管': '管网线应急快车道 · 硬证据 = 阀事件对齐',
    '路面急修': '路面线急修车道(默认关闭;路面线以自动升格/批量为主战场)'
  };

  function fastlaneRow(cat) {
    var on = !!w.S.get().gov.fastlane[cat];
    var toggleBtn = on
      ? { action: 'toggle_fastlane', label: '关闭快车道', cls: 'btn-danger', params: { cat: cat, on: false, reason: '系统管理页治理演示:DMT 关闭该类目快车道' } }
      : { action: 'toggle_fastlane', label: '重开快车道', cls: 'btn-ok', params: { cat: cat, on: true, dataBasis: '近 30 天误派率回落至阈值内(演示数据)' } };
    var appealBtn = { action: 'appeal_fastlane', label: '区申诉(G1)', params: { cat: cat, reason: '本区应急处置等不起人审,申请复议重开' } };
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
      '<div class="card-hd"><h3 style="margin:0;font-size:14px">类目快车道开关</h3>' +
      '<span class="tiny">仅 DMT 身份可点(灰态见未满足校验);关 = 即时生效 + 强制通知横幅 + 区申诉入口(G1)</span></div>' +
      '<div style="overflow-x:auto"><table class="tb"><thead><tr><th>类目</th><th>当前状态</th><th>DMT 操作</th><th>区申诉</th></tr></thead>' +
      '<tbody>' + cats.map(fastlaneRow).join('') + '</tbody></table></div>' +
      '</div>';
  }

  /* ---------------- 3 · 参数变更行(预演示意)---------------- */
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
      '<div class="tiny" style="margin-bottom:6px">影子重算预演(不写入正式参数、不产生动作日志——仅治理演示):试算「井盖线应急人审档 SLA」阈值变化对在池待核查件的影响。</div>' +
      '<div class="row wrap" style="align-items:flex-end;gap:14px">' +
      '<div class="tiny">现行值 ' + UI.assume('30 分', '假设值,区可配') + '</div>' +
      '<div style="width:140px"><label class="fl" for="m6ParamInput">候选新值(分)</label><input type="text" id="m6ParamInput" value="24"></div>' +
      '<div><button type="button" class="btn" id="m6ParamPreviewBtn">影子重算预估</button></div>' +
      '</div>' +
      '<div class="tiny" id="m6ParamPreviewOut" style="margin-top:8px;color:var(--mute)"></div>';
  }

  function paramBlock() {
    return '<div class="card"><div class="card-hd"><h3 style="margin:0;font-size:14px">参数变更</h3>' +
      '<span class="tiny">走审批;发起人 = 区巡检管理者</span></div>' +
      paramTable() + paramPreview() + '</div>';
  }

  /* 影子重算:纯前端演示估算,不接 S.commit,不改 state —— 仅统计当前在池件数作对照 */
  function computeShadow(rawVal) {
    var mins = parseInt(rawVal, 10);
    if (!mins || mins <= 0) return '请输入正整数分钟数。';
    var st = w.S.get();
    var pool = st.clues.filter(function (c) { return c.lane === '应急人审档' && c.status === 'open'; });
    if (!pool.length) return '当前「应急人审档」车道内无在池待核查件,无可预演样本(推进剧情到 T5 之后再试)。';
    var overNow = pool.filter(function (c) { return c.slaDeadline && w.S.slaLeft(c.slaDeadline) < 0; }).length;
    var ratio = mins / 30;
    var overNew = Math.min(pool.length, Math.round(overNow + pool.length * Math.max(0, 1 - ratio) * 0.4));
    return '影子重算(演示简化估算,不生效):SLA 30 分 → ' + mins + ' 分候选值下,在池 ' + pool.length +
      ' 条应急人审档件中,预估超时件数由 ' + overNow + ' 条变为约 ' + overNew +
      ' 条。仅供治理演示,非真实排队论模型;正式变更需走审批并按试点数据标定。';
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

  /* 预演按钮:事件委托绑定一次,不依赖每次 render 后重新挂载(DOM 每次整段替换) */
  w.document.addEventListener('click', function (e) {
    if (!e.target || e.target.id !== 'm6ParamPreviewBtn') return;
    var input = w.document.getElementById('m6ParamInput');
    var out = w.document.getElementById('m6ParamPreviewOut');
    if (out) out.textContent = computeShadow(input ? input.value : '');
  });

  VIEWS.m6 = function (ctx) {
    return roleTable() + fastlaneBlock() + paramBlock() + dutyBlock();
  };
})(window);
