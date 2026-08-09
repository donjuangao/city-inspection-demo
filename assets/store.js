/* origen 巡检 demo · store + 假时钟 + 场景引擎 + 动作引擎
   规格:施工图 §3(接口契约,已冻结)/ §5(动作表)/ §6(场景时刻表);设计档 §4(本体动作表)· §0.6(角色权限)
   铁律:S.commit 是唯一状态变更入口;每次 commit 追加一条动作日志;规则引擎自动步也各记一条。
   假时钟:时间只在 advance / nextStep 时步进,非实时钟。
   共享文件:W1 工兵只读。要改 = 报指挥官。 */
(function (w) {
  'use strict';

  var KEY = 'origen-demo-v1';

  /* ---------- 时间工具(假时钟) ---------- */
  function toMin(hhmm) {
    if (!hhmm) return 0;
    var p = String(hhmm).split(':');
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  function toHHMM(min) {
    min = ((min % 1440) + 1440) % 1440;
    var h = Math.floor(min / 60), m = min % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }
  function addMin(hhmm, n) { return toHHMM(toMin(hhmm) + n); }

  /* ---------- 存储(file:// 下 sessionStorage 可能不可用 → 内存兜底) ---------- */
  var mem = null;
  function readStore() {
    try { var s = w.sessionStorage.getItem(KEY); return s ? JSON.parse(s) : null; }
    catch (e) { return mem; }
  }
  function writeStore(obj) {
    mem = obj;
    try { w.sessionStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) { /* 内存兜底 */ }
  }
  function clearStore() {
    mem = null;
    try { w.sessionStorage.removeItem(KEY); } catch (e) { /* noop */ }
  }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* ---------- 种子:首载从 DATA 深拷贝 ---------- */
  function seed() {
    var d = clone(w.DATA);
    d.now = d.meta.t0;          // 假时钟当前值
    d.stepIdx = 0;              // 已推进到第几步(0 = T0 开场)
    d.role = '区复核员';         // 角色切换器(只改可用动作,不做登录)
    d.seq = d.actionLog.length; // 快照序号
    d.freezes = [];             // 证据冻结包(C5)
    d.lastStep = null;          // 最近一步场景(叙事 toast 用)
    return d;
  }

  var state = readStore() || seed();
  if (!state.now) state = seed();

  function save() { writeStore(state); }
  function emit(name, detail) {
    try { w.dispatchEvent(new CustomEvent(name, { detail: detail || null })); }
    catch (e) { var ev = w.document.createEvent('Event'); ev.initEvent(name, false, false); w.dispatchEvent(ev); }
  }

  /* ---------- 取数助手 ---------- */
  function byId(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function clueOf(id) { return byId(state.clues, id); }
  function tkOf(id) { return byId(state.tickets, id); }
  function crewOf(id) { return byId(state.crews, id); }
  function facOf(id) { return byId(state.facilities, id); }
  function caseOf(id) { return byId(state.investigations, id); }
  function senOf(id) { return byId(state.sensors, id); }
  function isHigh(c) { return c && (c.level === '应急' || c.level === '急修' || c.level === '紧急'); }
  function rank(role) { return (w.DATA.dict.roleRank[role] || 0); }
  function nextId(prefix, list) {
    var n = 9000 + list.length + 1;
    return prefix + n;
  }
  function banner(tone, text, scope) {
    state.banners.push({ id: 'BN-' + (state.banners.length + 1), tone: tone, text: text, scope: scope || 'global', t: state.now });
  }
  function hold(src, clueId, reason) {
    state.gov.auditQueue.push({
      id: 'AU-' + (1300 + state.gov.auditQueue.length), src: src, clueId: clueId,
      reason: reason, t: state.now, status: '待抽审'
    });
  }
  function codeOk(code) {
    return w.DATA.dict.rejectCodes.some(function (r) { return r.code === code || r.name === code; });
  }
  function ensureClue(id) {
    if (clueOf(id)) return clueOf(id);
    var tpl = w.UNLOCKS.clues[id];
    if (!tpl) return null;
    var c = clone(tpl); c.t = state.now;
    state.clues.push(c);
    return c;
  }

  /* ============================================================
     动作表(施工图 §5 · 设计档 §4)
     每行:{label, actors, hint, v(校验:返回 null 通过 / 字符串=未满足的校验), run(执行:返回日志摘要)}
     actors: 角色数组;'*' = 任意身份
     ============================================================ */
  var A = {};

  /* ---- 复核员动作族 ---- */
  A.view_evidence = {
    label: '查看证据卡', actors: ['*'], hint: '高危件确认前的强制前置(R53)',
    v: function (s, p) { return clueOf(p.clueId) ? null : '线索不存在'; },
    run: function (s, p) { var c = clueOf(p.clueId); c.evidenceViewed = true; return '查看证据卡:' + c.id + '(高危件确认前置已满足)'; }
  };

  A.confirm = {
    label: '确认', actors: ['区复核员', '复核主管'], hint: '线索 → 告警(定性权在人);副作用开工单(来源②)',
    v: function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (c.status !== 'open') return '线索非「待核查」态,不可确认';
      if (isHigh(c) && !c.evidenceViewed) return '高危件须先查看证据卡';
      return null;
    },
    run: function (s, p, actor) {
      var c = clueOf(p.clueId), out = [];
      c.status = 'confirmed';
      var al = { id: 'AL-0' + (800 + s.alerts.length), clueId: c.id, facility: c.facility, line: c.line, level: c.level, status: '成立', t: s.now, by: actor };
      s.alerts.push(al); c.alertId = al.id;
      if (c.fastlane && c.ticketId) {
        out.push('快车道件:告警 ' + al.id + ' 成立=人追认(工单 ' + c.ticketId + ' 已在处置中,不重复派工)');
      } else {
        var tk = {
          id: nextId('WO-', s.tickets), type: c.level === '应急' ? '紧急工单' : (c.level === '急修' ? '急修工单' : '养护批量工单'),
          clueId: c.id, facility: c.facility, crew: null, state: '已派工', source: w.DATA.dict.ticketSources.human,
          createdT: s.now, mirror: 'MUN-WO-' + (77300 + s.tickets.length), line: c.line,
          sla: { accept: addMin(s.now, w.DATA.dict.sla.accept), arrive: addMin(s.now, w.DATA.dict.sla.arrive), done: addMin(s.now, w.DATA.dict.sla.sameDay) },
          suspended: false, photos: [], note: '确认动作的派工副作用(来源② 人确认派)'
        };
        s.tickets.push(tk); c.ticketId = tk.id;
        out.push('告警 ' + al.id + ' 成立;副作用开' + tk.type + ' ' + tk.id + '(镜像 ' + tk.mirror + ')');
      }
      if (isHigh(c)) { hold('高危确认拘审', c.id, '高危确认件全量拘进主管抽审(R34)'); out.push('高危确认已拘主管抽审'); }
      return '确认 ' + c.id + ':' + out.join(';');
    }
  };

  A.reject = {
    label: '驳回', actors: ['区复核员', '复核主管'], hint: '必选六驳回原因码之一(R45a),按码回流各自消费者',
    v: function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (c.status !== 'open') return '线索非「待核查」态,不可驳回';
      if (!p.code || !codeOk(p.code)) return '必选六驳回原因码之一';
      return null;
    },
    run: function (s, p) {
      var c = clueOf(p.clueId); c.status = 'rejected'; c.rejectCode = p.code;
      var def = w.DATA.dict.rejectCodes.filter(function (r) { return r.code === p.code || r.name === p.code; })[0];
      var out = '驳回 ' + c.id + ':原因码 ' + def.code + ' ' + def.name + ' → 回流「' + def.to + '」';
      if (isHigh(c)) {
        hold('高危驳回拘审', c.id, '高危驳回件拘进主管抽审(R34)');
        banner('warn', '高危驳回已拘主管抽审:' + c.id + '(' + def.code + ' ' + def.name + ')', 'm1');
        out += ';高危驳回已拘主管抽审';
      }
      return out;
    }
  };

  A.overrule_mech = {
    label: '推翻机械判定', actors: ['区复核员', '复核主管'], hint: '理由码必填;线索复活进人审 + 自动触发抽审(D4)',
    v: function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (!c.mechFail) return '本件机械校验无硬失败,无可推翻';
      if (!p.reason) return '理由码必填';
      return null;
    },
    run: function (s, p) {
      var c = clueOf(p.clueId); c.mechFail = false; c.status = 'open';
      c.lane = isHigh(c) ? '应急人审档' : '单条必审';
      c.slaDeadline = addMin(s.now, w.DATA.dict.sla.urgentReview);
      hold('推翻机械判定', c.id, '人推翻机械判定自动触发抽审;误杀样本回流规则组');
      return '推翻机械判定 ' + c.id + ':理由「' + p.reason + '」→ 线索复活进「' + c.lane + '」;自动触发抽审';
    }
  };

  A.fastlane_recall = {
    label: '快车道撤回', actors: ['区复核员', '复核主管'], hint: '显名 + 理由码;副作用=召回班组 + 线索转驳回流(D1)',
    v: function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (!c.fastlane) return '仅快车道自动派单件可撤回';
      if (c.status !== 'open') return '线索非「待核查」态,复核窗已闭';
      if (c.reviewEnd && toMin(s.now) > toMin(c.reviewEnd)) return '已超出 15 分钟并行复核窗';
      if (!p.reason) return '理由码必填';
      return null;
    },
    run: function (s, p) {
      var c = clueOf(p.clueId); c.status = 'recalled';
      var tk = c.ticketId ? tkOf(c.ticketId) : null, br = '';
      if (tk) {
        var cw = tk.crew ? crewOf(tk.crew) : null, st = cw ? cw.status : '待接单';
        if (st === '到场' || tk.state === '已到场') { tk.state = '现场核实中'; br = '班组已到场 → 转现场核实(确有异常重新确认,无则撤)'; }
        else if (tk.state === '作业中' || tk.state === '已开井') { tk.state = '现场收尾单'; br = '已开井 → 不能一撤了之,转现场收尾单(恢复原状+安全确认后销单)'; }
        else { tk.state = '已召回'; br = '班组在途 → 班组端撤单通知,返程/转下一单'; }
        if (cw) { cw.status = '空闲'; cw.load = Math.max(0, cw.load - 1); }
        tk.recalled = true;
      }
      hold('快车道件全量抽审', c.id, '快车道撤回件进误派率月报口径');
      banner('info', '快车道撤回:' + c.id + ' 线索转驳回流;白跑不计班组考核,班组可申诉。', 'm1');
      return '快车道撤回 ' + c.id + ':理由「' + p.reason + '」;' + br;
    }
  };

  A.batch_confirm = {
    label: '批量确认', actors: ['区复核员', '复核主管'], hint: '单批 ≤20 + 批内缩略证据展开过;批量件抽审率 15%',
    v: function (s, p) {
      var ids = p.clueIds || [];
      if (!ids.length) return '未选中任何线索';
      if (ids.length > 20) return '单批上限 20 条(当前 ' + ids.length + ' 条)';
      if (!p.expanded) return '批内缩略证据未展开过';
      return null;
    },
    run: function (s, p) {
      var n = 0;
      (p.clueIds || []).forEach(function (id) {
        var c = clueOf(id); if (!c || c.status !== 'open') return;
        c.status = 'confirmed'; c.lane = c.lane || '批量半审'; c.planned = true; n++;
      });
      var pick = Math.max(1, Math.round(n * 0.15));
      hold('批量确认 15% 抽样', (p.clueIds || [])[0] || '', '批量件抽审率 15%:本批 ' + n + ' 条抽 ' + pick + ' 条');
      return '批量确认 ' + n + ' 条 → 并入养护计划;抽审 15%(本批抽 ' + pick + ' 条)';
    }
  };

  A.archive_doubt = {
    label: '存疑归档', actors: ['区复核员', '复核主管'], hint: '仅「批量半审」车道内可用;计入评估统计',
    v: function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (c.lane !== '批量半审') return '仅批量半审车道内可存疑归档';
      if (c.status !== 'open') return '线索非「待核查」态';
      return null;
    },
    run: function (s, p) {
      var c = clueOf(p.clueId); c.status = 'archived_doubt';
      return '存疑归档 ' + c.id + '(置信 ' + c.conf + '):计入模型评估统计,不计为确认也不计为驳回';
    }
  };

  A.open_case = {
    label: '立案', actors: ['区复核员', '复核主管'], hint: '管网线调查案:人在立案/结案两点拍板',
    v: function (s, p) { var k = caseOf(p.caseId); if (!k) return '调查案不存在'; if (k.status !== '观察中') return '调查案非「观察中」态'; return null; },
    run: function (s, p) {
      var k = caseOf(p.caseId); k.status = '已立案';
      var tk = {
        id: nextId('WO-', s.tickets), type: '核查任务', clueId: null, facility: k.facility, crew: 'CR-04',
        state: '已派工', source: w.DATA.dict.ticketSources.human, createdT: s.now, line: '管网',
        mirror: 'MUN-WO-' + (77300 + s.tickets.length),
        sla: { accept: addMin(s.now, 10), arrive: addMin(s.now, 60), done: addMin(s.now, 240) },
        suspended: false, photos: [], note: '调查案定位主手段=现场核查(听漏/分段关阀)'
      };
      s.tickets.push(tk); k.ticketId = tk.id;
      return '立案 ' + k.id + '(' + k.dma + '):开核查任务 ' + tk.id + ' → 水务抢修班';
    }
  };

  A.close_case = {
    label: '结案', actors: ['区复核员', '复核主管'], hint: '结案需流量回归绿标',
    v: function (s, p) {
      var k = caseOf(p.caseId); if (!k) return '调查案不存在';
      if (k.status === '已结案') return '调查案已结案';
      if (!k.flowGreen) return '流量未回归基线(绿标未亮),不可结案';
      return null;
    },
    run: function (s, p) { var k = caseOf(p.caseId); k.status = '已结案'; k.closedT = s.now; return '结案 ' + k.id + ':流量回归基线绿标已亮,人签字结案'; }
  };

  A.dispatch_manual = {
    label: '改派', actors: ['复核主管', '区值班长'], hint: '理由码必填;改派 ≠ 撤回(事件不动,单子换承接方)',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (!p.crew || !crewOf(p.crew)) return '未选择承接班组';
      if (!p.reason) return '理由码必填';
      return null;
    },
    run: function (s, p) {
      var t = tkOf(p.ticketId), old = t.crew, nw = crewOf(p.crew);
      if (old && crewOf(old)) { var o = crewOf(old); o.load = Math.max(0, o.load - 1); o.status = o.load ? o.status : '空闲'; }
      t.crew = p.crew; t.state = '已派工'; t.suspended = false;
      nw.load++; nw.status = '待接单';
      return '改派 ' + t.id + ':' + (old || '(无)') + ' → ' + nw.name + ';理由「' + p.reason + '」(事件不动,仅换承接方)';
    }
  };

  A.merge = {
    label: '合并', actors: ['复核主管', '区值班长'], hint: '同点位/同时窗多单合并;理由码必填',
    v: function (s, p) {
      var ids = p.ticketIds || []; if (ids.length < 2) return '至少选择 2 张工单';
      if (!p.reason) return '理由码必填';
      return null;
    },
    run: function (s, p) {
      var ids = p.ticketIds, main = tkOf(ids[0]);
      ids.slice(1).forEach(function (id) { var t = tkOf(id); if (t) { t.state = '已合并'; t.mergedInto = main.id; } });
      return '合并工单 ' + ids.join(' + ') + ' → ' + main.id + ';理由「' + p.reason + '」';
    }
  };

  A.split = {
    label: '拆单', actors: ['复核主管', '区值班长'], hint: '跨线联动事件拆主责;理由码必填',
    v: function (s, p) { var t = tkOf(p.ticketId); if (!t) return '工单不存在'; if (!p.reason) return '理由码必填'; return null; },
    run: function (s, p) {
      var t = tkOf(p.ticketId);
      var c = clone(t); c.id = nextId('WO-', s.tickets); c.crew = null; c.state = '已派工';
      c.note = '拆自 ' + t.id + ':' + p.reason; c.mirror = 'MUN-WO-' + (77300 + s.tickets.length);
      s.tickets.push(c);
      return '拆单 ' + t.id + ' → 新增 ' + c.id + ';理由「' + p.reason + '」';
    }
  };

  A.suspend = {
    label: '挂起', actors: ['规则引擎', '区值班长', '复核主管'], hint: '原因码入日志;挂起期 SLA 停表,条件解除后原单回队重派',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (t.suspended) return '工单已处于挂起态';
      if (!p.reason) return '原因码必填';
      return null;
    },
    run: function (s, p) {
      var t = tkOf(p.ticketId); t.suspended = true; t.suspendReason = p.reason; t.suspendT = s.now;
      var cw = t.crew ? crewOf(t.crew) : null;
      if (cw) { cw.status = '空闲'; cw.load = Math.max(0, cw.load - 1); }
      banner('amber', '挂起回补卡:' + t.id + ' 因「' + p.reason + '」挂起,SLA 停表;条件解除后自动回队重派。', 'm2');
      return '挂起 ' + t.id + ':原因「' + p.reason + '」;SLA 停表,班组释放';
    }
  };

  A.override_emergency = {
    label: '紧急 override', actors: ['复核主管', '区值班长'], hint: '红色动作:双确认;跳闸直接行动 + 强制事后审计 + 双人知悉',
    v: function (s, p, actor) {
      if (rank(actor) < 2) return '需主管以上权限';
      if (!p.confirm2) return '需红色确认弹层双确认';
      if (!p.reason) return '理由必填';
      return null;
    },
    run: function (s, p) {
      hold('紧急 override 事后审计', p.clueId || '', 'override 强制事后审计 + 双人知悉');
      banner('danger', '紧急 override 已执行:' + (p.target || p.clueId || '') + ' —— 跳闸直接行动,红标日志 + 强制事后审计。', 'global');
      return '紧急 override:' + (p.target || p.clueId || '') + ';理由「' + p.reason + '」;红标日志 + 事后审计标 + 双人知悉';
    }
  };

  A.revoke = {
    label: '撤销', actors: ['复核主管'], hint: '告警 → 撤销(不删除);理由码 + 证据',
    v: function (s, p) {
      var al = byId(s.alerts, p.alertId); if (!al) return '告警不存在';
      if (al.status !== '成立') return '告警非「成立」态';
      if (!p.reason) return '理由码必填';
      if (!p.evidence) return '需附证据';
      return null;
    },
    run: function (s, p) {
      var al = byId(s.alerts, p.alertId); al.status = '已撤销'; al.revokeT = s.now; al.revokeReason = p.reason;
      return '撤销告警 ' + al.id + ':理由「' + p.reason + '」;记录不删除,状态置「已撤销」';
    }
  };

  /* W3 整合补(指挥官,2026-08-09):对账裁决——设计档 §2.3b④;W1-B 报缺 */
  A.recon_rule = {
    label: '对账裁决', actors: ['复核主管'], hint: '处置状态以客户系统为准 · 巡检定性以我方为准;24h 内主管裁定',
    v: function (s, p) {
      var rc = byId(s.recon, p.reconId); if (!rc) return '对账记录不存在';
      if (rc.status === '已裁定') return '该条已裁定';
      return null;
    },
    run: function (s, p) {
      var rc = byId(s.recon, p.reconId);
      rc.status = '已裁定'; rc.ruledT = s.now; rc.ruling = '处置状态以客户系统为准';
      return '对账裁决 ' + rc.id + ':处置状态以客户系统为准(巡检定性以我方为准);裁定入日志';
    }
  };

  /* W3 整合补(指挥官):公众上报人工甄别驳回——设计档 §0.9 E3 无效分支;W1-E 报缺 */
  A.public_reject = {
    label: '甄别驳回', actors: ['区复核员', '复核主管'], hint: '人工甄别判无效:驳回,上报人可见理由',
    v: function (s, p) {
      var r = byId(s.publicReports, p.reportId); if (!r) return '上报不存在';
      if (r.status === '已并入') return '已并入件不走驳回(随线索侧流程)';
      if (r.status === '已驳回') return '该条已驳回';
      if (!p.reason) return '需填驳回理由(上报人可见)';
      return null;
    },
    run: function (s, p) {
      var r = byId(s.publicReports, p.reportId);
      r.status = '已驳回'; r.rejectReason = p.reason;
      return '公众上报 ' + r.id + ' 甄别驳回:理由「' + p.reason + '」;上报人可见,联系方式仍列级脱敏';
    }
  };

  A.freeze_evidence = {
    label: '证据冻结', actors: ['复核主管', '区值班长'], hint: '涉事故/索赔件:全证据链快照锁定 + 哈希锚定,可导出法务包',
    v: function (s, p, actor) {
      if (rank(actor) < 2) return '需主管以上权限';
      if (!p.targetId) return '未指定冻结对象';
      if (!p.reason) return '需标注涉事故/索赔事由';
      return null;
    },
    run: function (s, p) {
      var fz = { id: 'FZ-' + (100 + s.freezes.length), target: p.targetId, t: s.now, reason: p.reason, hash: 'sha256:' + (p.targetId + s.now).replace(/[^0-9a-zA-Z]/g, '').toLowerCase().slice(0, 16) };
      s.freezes.push(fz);
      return '证据冻结 ' + p.targetId + ':快照 ' + fz.id + ' 锁定并哈希锚定,可导出法务包';
    }
  };

  A.transfer = {
    label: '转办', actors: ['区复核员', '复核主管'], hint: '非市政资产转产权单位;转办码 ≠ 驳回码;台账回写产权标',
    v: function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (c.status !== 'open') return '线索非「待核查」态';
      if (!p.owner) return '需填产权判定(承接产权单位)';
      return null;
    },
    run: function (s, p) {
      var c = clueOf(p.clueId); c.status = 'transferred'; c.transferTo = p.owner;
      var f = facOf(c.facility); if (f) { f.owner = p.owner; f.history.push({ t: s.now, txt: '产权标注回写:' + p.owner + '(转办)' }); }
      return '转办 ' + c.id + ' → ' + p.owner + ':转办码 ≠ 驳回码,台账已回写产权标注';
    }
  };

  A.toggle_fastlane = {
    label: '类目快车道开关', actors: ['DMT'], hint: '关 = 安全侧动作即时生效 + 强制通知横幅 + 区申诉通道;开 = 需数据判据',
    v: function (s, p) {
      if (!p.cat) return '未指定类目';
      if (p.on && !p.dataBasis) return '重开需按数据判据(R42)填写批准依据';
      if (!p.on && !p.reason) return '关闭需填写理由(进动作日志)';
      return null;
    },
    run: function (s, p) {
      s.gov.fastlane[p.cat] = !!p.on;
      if (!p.on) {
        banner('warn', 'DMT 已关闭「' + p.cat + '」类目快车道:该类目回退人审;本区已强制通知,区可发起申诉(申诉由 DMT 复议并留痕)。', 'global');
        return 'DMT 关闭快车道类目「' + p.cat + '」:理由「' + p.reason + '」;即时生效 + 强制通知该区 + 区申诉通道开启';
      }
      banner('info', 'DMT 已重开「' + p.cat + '」类目快车道:依据「' + p.dataBasis + '」。', 'global');
      return 'DMT 重开快车道类目「' + p.cat + '」:数据判据「' + p.dataBasis + '」';
    }
  };

  A.appeal_fastlane = {
    label: '区申诉', actors: ['区巡检管理者', '复核主管', '区值班长'], hint: '关车道后的区申诉通道:DMT 复议并留痕(G1)',
    v: function (s, p) { if (!p.cat) return '未指定类目'; if (!p.reason) return '申诉理由必填'; return null; },
    run: function (s, p) { return '区申诉:请求复议「' + p.cat + '」快车道关闭;理由「' + p.reason + '」→ 转 DMT 复议(留痕)'; }
  };

  /* ---- 复验人裁(P5;永不默认打回) ---- */
  A.verify_pass = {
    label: '复验人裁·合格', actors: ['区复核员', '复核主管'], hint: 'AI 复验判不出时由人裁;合格即闭环',
    v: function (s, p) { var t = tkOf(p.ticketId); if (!t) return '工单不存在'; if (t.state !== '已完工') return '工单未到「已完工」态'; return null; },
    run: function (s, p) {
      var t = tkOf(p.ticketId); t.state = '已验收'; t.verify = '人裁合格';
      var cw = t.crew ? crewOf(t.crew) : null; if (cw) { cw.status = '空闲'; cw.load = Math.max(0, cw.load - 1); }
      var c = t.clueId ? clueOf(t.clueId) : null; if (c) c.closed = true;
      return '复验人裁合格 ' + t.id + ':工单「已验收」,闭环;动作日志全程可回查';
    }
  };

  A.verify_reject = {
    label: '复验打回', actors: ['区复核员', '复核主管'], hint: '打回须附复验对比证据;班组可申诉 → 主管裁',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (t.state !== '已完工') return '工单未到「已完工」态';
      if (!p.evidence) return '打回须附复验对比证据';
      return null;
    },
    run: function (s, p) {
      var t = tkOf(p.ticketId); t.state = '已到场'; t.verify = '已打回'; t.rejectNote = p.evidence;
      return '复验打回 ' + t.id + ':附对比证据「' + p.evidence + '」;班组可申诉 → 主管裁';
    }
  };

  /* ---- 班组动作族(crew.html) ---- */
  function crewGuard(p) { return null; }
  A.crew_accept = {
    label: '接单', actors: ['班组账号'], hint: '接单 10 分钟 SLA(假设值);写回客户工单系统',
    v: function (s, p) { var t = tkOf(p.ticketId); if (!t) return '工单不存在'; if (t.state !== '已派工') return '工单非「已派工」态'; return null; },
    run: function (s, p) {
      var t = tkOf(p.ticketId); t.state = '已接单';
      var cw = t.crew ? crewOf(t.crew) : null; if (cw) cw.status = '在途';
      return '班组接单 ' + t.id + '(' + (cw ? cw.name : '') + '):状态写回客户工单系统 ' + t.mirror;
    }
  };
  A.crew_arrive = {
    label: '到场', actors: ['班组账号'], hint: '到场 30 分钟 SLA(假设值)',
    v: function (s, p) { var t = tkOf(p.ticketId); if (!t) return '工单不存在'; if (t.state !== '已接单') return '工单非「已接单」态'; return null; },
    run: function (s, p) {
      var t = tkOf(p.ticketId); t.state = '已到场';
      var cw = t.crew ? crewOf(t.crew) : null; if (cw) cw.status = '到场';
      return '班组到场 ' + t.id + ':状态写回客户工单系统 ' + t.mirror;
    }
  };
  A.crew_photo = {
    label: '现场回传', actors: ['班组账号'], hint: '修复前/后双照;证据双写进我方证据链',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (t.state !== '已到场') return '需先到场';
      if (!p.phase) return '未标注拍摄阶段(修复前/修复后)';
      if (t.photos.some(function (x) { return x.phase === p.phase; })) return p.phase + '照片已回传';
      return null;
    },
    run: function (s, p) {
      var t = tkOf(p.ticketId);
      t.photos.push({ phase: p.phase, t: s.now, kind: p.phase === '修复前' ? 'before' : 'after', label: 'AI 生成示意' });
      return '现场回传 ' + t.id + ':' + p.phase + '照片(矢量示意)进我方证据链,同步写回客户系统';
    }
  };
  A.crew_done = {
    label: '完工提交', actors: ['班组账号'], hint: '完工须前后双照齐;提交触发 AI 复验',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (t.state !== '已到场') return '工单非「已到场」态';
      var has = function (ph) { return t.photos.some(function (x) { return x.phase === ph; }); };
      if (!has('修复前') || !has('修复后')) return '完工须回传修复前/后双照';
      return null;
    },
    run: function (s, p) {
      var t = tkOf(p.ticketId); t.state = '已完工'; t.doneT = s.now;
      return '完工提交 ' + t.id + ':写回客户工单系统 ' + t.mirror + ';触发 AI 复验';
    }
  };
  A.crew_reject = {
    label: '拒单', actors: ['班组账号'], hint: '理由码必填(缺资质/在办应急/装备不符);立即触发改派',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (t.state !== '已派工' && t.state !== '已接单') return '工单已进入处置,不可拒单';
      if (!p.code) return '拒单理由码必填';
      return null;
    },
    run: function (s, p) {
      var t = tkOf(p.ticketId); var cw = t.crew ? crewOf(t.crew) : null;
      if (cw) { cw.status = '空闲'; cw.load = Math.max(0, cw.load - 1); }
      t.crew = null; t.state = '待改派';
      return '显名拒单 ' + t.id + ':理由码「' + p.code + '」;立即触发改派次优班组(不烧超时等待);拒单理由入档案与考核';
    }
  };
  A.crew_blocked = {
    label: '受阻上报', actors: ['班组账号'], hint: '原因码;工单转「待条件」,SLA 停表',
    v: function (s, p) { var t = tkOf(p.ticketId); if (!t) return '工单不存在'; if (!p.code) return '受阻原因码必填'; return null; },
    run: function (s, p) {
      var t = tkOf(p.ticketId); t.state = '待条件'; t.suspended = true; t.suspendReason = p.code;
      return '受阻上报 ' + t.id + ':原因码「' + p.code + '」→ 工单转「待条件」(写回客户系统状态机映射);SLA 停表';
    }
  };
  A.crew_safety = {
    label: '安全上报', actors: ['班组账号'], hint: '置顶通道:区值班长即时通知(P8)',
    v: function (s, p) { if (!p.note) return '需填写现场情况'; return null; },
    run: function (s, p) {
      banner('danger', '现场安全上报(置顶通道):' + p.note + ' —— 已即时通知区值班长。', 'global');
      return '安全上报:' + p.note + ';置顶通道 → 区值班长即时通知';
    }
  };
  A.crew_report_new = {
    label: '现场上报', actors: ['班组账号'], hint: '班组账号产线索,来源标「现场发现」,交复核员甄别',
    v: function (s, p) { if (!p.facility) return '未选择设施'; if (!p.cat) return '未选类目'; return null; },
    run: function (s, p) {
      var f = facOf(p.facility);
      var c = {
        id: 'CL-09' + (10 + s.clues.length), line: p.cat, level: p.level || '急修', conf: null,
        source: '现场发现(班组上报)', facility: p.facility, block: f ? f.block : '', kindText: p.note || p.cat + '异常',
        checks: [], evidence: [{ kind: 'field', label: 'AI 生成示意' }], status: 'open',
        lane: '单条必审', slaDeadline: addMin(s.now, w.DATA.dict.sla.sameDay), t: s.now,
        fastlane: false, mechFail: false, evidenceViewed: false, rejectCode: null,
        note: '班组现场发现:不走视觉腿,直接进人审甄别', publicRefs: [], mergedInto: null, ticketId: null, alertId: null
      };
      s.clues.push(c);
      return '现场上报:新线索 ' + c.id + '(' + p.facility + '),来源标「现场发现」→ 复核员甄别';
    }
  };
  A.crew_partial_done = {
    label: '部分完工', actors: ['班组账号'], hint: '分阶段处置:临时措施先行(围挡)→ 永久修复(P11)',
    v: function (s, p) { var t = tkOf(p.ticketId); if (!t) return '工单不存在'; if (t.state !== '已到场') return '需先到场'; return null; },
    run: function (s, p) {
      var t = tkOf(p.ticketId); t.phase = '阶段一完工(临时措施:围挡+警示)'; t.state = '已到场';
      return '部分完工 ' + t.id + ':' + t.phase + ';永久修复阶段二另排,SLA 分阶段计';
    }
  };
  A.crew_handover = {
    label: '交接', actors: ['班组账号'], hint: '跨班次未完工单:交接记录 + 新班组接续,SLA 连续计',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (!p.toCrew || !crewOf(p.toCrew)) return '未选择接续班组';
      return null;
    },
    run: function (s, p) {
      var t = tkOf(p.ticketId), old = t.crew;
      if (old && crewOf(old)) { var o = crewOf(old); o.status = '空闲'; o.load = Math.max(0, o.load - 1); }
      t.crew = p.toCrew; t.handover = { from: old, to: p.toCrew, t: s.now, note: p.note || '' };
      crewOf(p.toCrew).load++;
      return '交接 ' + t.id + ':' + (old || '(无)') + ' → ' + crewOf(p.toCrew).name + ';SLA 连续计,不重新起算';
    }
  };

  /* ---- 公众上报(public.html) ---- */
  A.public_report = {
    label: '公众上报提交', actors: ['*'], hint: '三步提交 → 受理编号回执;联系方式列级脱敏',
    v: function (s, p) { if (!p.cat) return '未选类目'; if (!p.block && !p.facility) return '未定位'; return null; },
    run: function (s, p) {
      var id = p.reportId || ('PR-0' + (400 + s.publicReports.length));
      var tpl = w.UNLOCKS.publicReports[id];
      var r = tpl ? clone(tpl) : {
        id: id, t: s.now, cat: p.cat, block: p.block || '', facility: p.facility || null,
        contact: '05****' + (1000 + s.publicReports.length), status: '已受理', receipt: 'RC-' + id,
        mergedInto: null, urges: 0, evidence: [{ kind: 'field', label: 'AI 生成示意' }]
      };
      r.t = s.now;
      if (!byId(s.publicReports, r.id)) s.publicReports.push(r);
      return '公众上报受理 ' + r.id + ':回执编号 ' + r.receipt + ';联系方式列级脱敏;进兜底并入队列人工甄别(不直接进应急)';
    }
  };
  A.public_urge = {
    label: '催办', actors: ['*'], hint: '催办计数可见(E3)',
    v: function (s, p) { return byId(s.publicReports, p.reportId) ? null : '上报记录不存在'; },
    run: function (s, p) { var r = byId(s.publicReports, p.reportId); r.urges++; return '公众催办 ' + r.id + ':催办计数 ' + r.urges; }
  };

  /* ============ 规则引擎 / AI 服务自动步(机械不豁免审计,每步一条日志)============ */
  function autoDef(label, hint, run, v) {
    return { label: label, actors: ['规则引擎', 'AI 服务', '*'], hint: hint, auto: true, v: v || function () { return null; }, run: run };
  }

  A.auto_sensor_alarm = autoDef('传感器报警(先导)', '传感器秒级报警 = 先导;已认证设备签名报文',
    function (s, p) {
      var c = ensureClue(p.clueId);
      var sn = senOf(p.sensorId);
      return '传感器报警:' + p.sensorId + '(' + (sn ? sn.type : '') + ')@ ' + p.facility + ' → 产出线索 ' + (c ? c.id : p.clueId) + '(AI/规则只创建线索,不定性)';
    });

  A.auto_selfcheck = autoDef('传感器自检', '心跳/方差/量程三态自检,先排设备故障再报业务异常',
    function (s, p) {
      var sn = senOf(p.sensorId);
      return '传感器自检 ' + p.sensorId + ':心跳正常 · 读数方差正常(非卡死)· 未量程饱和 → 判据通过' + (sn ? '' : '');
    });

  A.auto_work_window = autoDef('合法开井作业窗比对', '报警先比对客户工单系统开井作业时间窗;拿不到数据时注明「未排除合法作业」',
    function (s, p) {
      return '合法开井抑制比对 ' + p.clueId + ':客户工单系统当前时窗无该点位开井作业单 → 不抑制,继续走双闸';
    });

  A.auto_mech_check = autoDef('机械校验闸', '第二闸:硬编码可执行判据,逐条留痕',
    function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '机械校验:线索 ' + p.clueId + ' 不在池中';
      var pass = c.checks.filter(function (x) { return x.result === 'pass'; }).length;
      var tot = c.checks.length;
      return '机械校验闸 ' + c.id + '(' + c.line + '线 ' + tot + ' 项):通过 ' + pass + '/' + tot +
        (pass === tot ? ' → 全过,双闸硬条件满足' : ' → 存在未过项,证据卡置顶');
    });

  A.auto_dispatch = autoDef('自动派单(紧急快车道)', '提交校验:应急/紧急级 + 双闸硬条件 + 该类目快车道开关开启;产出紧急工单,不产出告警',
    function (s, p) {
      var c = clueOf(p.clueId); var cw = crewOf(p.crew);
      var tk = {
        id: p.ticketId || 'WO-9001', type: '紧急工单', clueId: c.id, facility: c.facility, crew: p.crew,
        state: '已派工', source: w.DATA.dict.ticketSources.auto, createdT: s.now, line: c.line,
        mirror: 'MUN-WO-' + (77300 + s.tickets.length),
        sla: { accept: addMin(s.now, w.DATA.dict.sla.accept), arrive: addMin(s.now, w.DATA.dict.sla.arrive), done: addMin(s.now, 120) },
        suspended: false, photos: [], note: '来源① 快车道自动派:硬证据准入=已认证设备签名报文;时效窗内实时数据;防抖冷却;速率未熔断'
      };
      if (!tkOf(tk.id)) s.tickets.push(tk);
      c.ticketId = tk.id; c.reviewEnd = addMin(s.now, w.DATA.dict.sla.fastlaneReview); c.slaDeadline = c.reviewEnd;
      if (cw) { cw.load++; cw.status = '待接单'; }
      hold('快车道件全量抽审', c.id, '快车道自动派单件全量抽审(误派率月报口径)');
      banner('info', '机器派单,人复核中:' + c.id + ' 已自动派 ' + (cw ? cw.name : p.crew) + '(工单 ' + tk.id + ');复核员 15 分钟内并行复核,可撤回召回。', 'm1');
      return '自动派单 ' + tk.id + ' → ' + (cw ? cw.name : p.crew) + ':产出紧急工单,不产出告警(定性权仍在人);15 分钟并行复核窗开启';
    },
    function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (c.level !== '应急' && c.level !== '紧急') return '非应急/紧急级,不进快车道';
      if (!s.gov.fastlane[c.kindText] && !s.gov.fastlane['井盖缺失']) return '该类目快车道开关已关闭';
      if (s.gov.fastlane[c.kindText] === false) return '该类目快车道开关已关闭(DMT 治理),回退人审';
      if (c.checks.some(function (x) { return x.result === 'fail'; })) return '机械校验存在硬失败,不满足双闸硬条件';
      if (c.ticketId) return '本件已有工单,防抖冷却窗内不重复派单';
      return null;
    });

  A.auto_broadcast = autoDef('只读预警广播', '规则引擎副作用:通知值班圈;不定性、不派工',
    function (s, p) {
      banner('amber', '只读预警广播 · ' + (p.scope || '全域') + ':' + p.text, 'global');
      return '只读预警广播 @' + (p.scope || '全域') + ':' + p.text + '(聚合抑制:同点位同时窗合并 · 每收件人每小时上限 · 静默窗)';
    });

  A.auto_review_window = autoDef('并行复核窗开启', '快车道 15 分钟并行复核;超时走三级升级',
    function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '复核窗:线索不存在';
      c.reviewEnd = addMin(s.now, p.mins || 15); c.slaDeadline = c.reviewEnd;
      return '并行复核窗开启 ' + c.id + ':截止 ' + c.reviewEnd + '(15 分钟,假设值);确认=告警追认,撤回=召回班组;超时→复核员→主管→区值班长';
    });

  A.auto_create_clue = autoDef('创建线索', 'AI 服务账号仅「创建线索/提出建议」两动作,无定性权',
    function (s, p) {
      var c = ensureClue(p.clueId);
      if (!c) return '创建线索:模板 ' + p.clueId + ' 缺失';
      return 'AI 识别产出线索 ' + c.id + '(' + c.line + '线 · ' + c.kindText + ' · 置信 ' + (c.conf === null ? '—' : c.conf) + ')→ 入池待双闸';
    });

  A.auto_route = autoDef('车道路由', '闸果进各业务线自己的车道表',
    function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '车道路由:线索不存在';
      c.lane = p.lane;
      c.slaDeadline = addMin(s.now, p.lane === '应急人审档' ? w.DATA.dict.sla.urgentReview : w.DATA.dict.sla.sameDay);
      return '车道路由 ' + c.id + ' → 「' + p.lane + '」:低置信且无硬证据不进快车道;SLA ' +
        (p.lane === '应急人审档' ? '30 分钟' : '当日') + '(假设值)+ 三级升级 + 超时只读预警';
    });

  A.auto_mech_reject = autoDef('机械驳回判定', '高危零自动归档:证据卡置顶,转加急人工驳回确认',
    function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '机械驳回:线索不存在';
      c.mechFail = true; c.lane = '机械驳回';
      var bad = c.checks.filter(function (x) { return x.result === 'fail'; }).map(function (x) { return x.name; });
      if (isHigh(c)) {
        c.slaDeadline = addMin(s.now, w.DATA.dict.sla.urgentReview);
        banner('warn', '机械校验硬失败但不自动归档(高危零自动归档):' + c.id + ' 证据卡置顶,转加急人工驳回确认。', 'm1');
        return '机械驳回判定 ' + c.id + ':未过项「' + bad.join(' / ') + '」;高危件不自动归档 → 转加急人工驳回确认';
      }
      c.status = 'rejected'; c.rejectCode = '②';
      return '机械驳回自动归档 ' + c.id + ':未过项「' + bad.join(' / ') + '」;原因码自动填,影子池抽样兜底';
    });

  A.auto_upgrade = autoDef('自动升格(免人工车道)', '养护级 × 高置信 × 机械全过 = 免人工并入周期养护计划;事后抽审',
    function (s, p) {
      var ids = p.clueIds || [], n = 0;
      ids.forEach(function (id) {
        var c = clueOf(id); if (!c) return;
        c.status = 'auto_done'; c.planned = true; n++;
        if (c.lane !== '记账') c.lane = '自动升格';
      });
      hold('自动升格事后抽审', ids[0] || '', '免人工车道处置件事后抽审(机械自动化不豁免审计)');
      banner('info', '本批 ' + n + ' 条未经人工:自动升格/记账车道,抽审兜底(抽审入口可点)。', 'm1');
      return '自动升格 ' + n + ' 条(' + ids.join(' / ') + '):免人工并入周期养护计划;事后抽审已入队';
    });

  A.auto_plan_ticket = autoDef('计划批量派工', '来源③ 计划批量派:周期规则触发',
    function (s, p) {
      var tk = tkOf(p.ticketId);
      if (!tk) {
        tk = {
          id: p.ticketId, type: p.type || '养护批量工单', clueId: null, facility: p.facility, crew: p.crew,
          state: '已派工', source: w.DATA.dict.ticketSources.plan, createdT: s.now, line: p.line || '路面',
          mirror: 'MUN-WO-' + (77300 + s.tickets.length),
          sla: { accept: addMin(s.now, 20), arrive: addMin(s.now, 120), done: addMin(s.now, 300) },
          suspended: false, photos: [], note: '周批养护工单(计划批量派)'
        };
        s.tickets.push(tk);
        var cw = crewOf(p.crew); if (cw) { cw.load++; if (cw.status === '空闲') cw.status = '待接单'; }
      }
      return '计划批量派(来源③):' + tk.type + ' ' + tk.id + ' → ' + (crewOf(tk.crew) ? crewOf(tk.crew).name : tk.crew) + ';镜像 ' + tk.mirror;
    });

  A.auto_rule_alarm = autoDef('水力学规则报警', '规则腿=硬编码脚本判据,不是模型;按灌溉事件的水量平衡',
    function (s, p) {
      return '水力学规则报警 ' + p.dma + ':本次灌溉事件实配水量 vs 计划应配水量偏差越限(≥ y%,假设值),连续 M 次 → 触发调查腿';
    });

  A.auto_ai_typing = autoDef('AI 时序判型', 'AI 时序模型判型:区分渗漏 vs 灌溉计划/用水高峰,降误报',
    function (s, p) {
      return 'AI 时序判型 ' + p.dma + ':比对灌溉计划表与阀动作事件流 → 判为「渗漏嫌疑」(非计划内轮灌换区);仅提出建议,不定性';
    });

  A.auto_open_case = autoDef('自动开调查案', '管网线:自动开调查案,人在立案/结案两点拍板',
    function (s, p) {
      var k = caseOf(p.caseId);
      if (!k) { var tpl = w.UNLOCKS.investigations[p.caseId]; if (tpl) { k = clone(tpl); k.openedT = s.now; s.investigations.push(k); } }
      return '自动开调查案 ' + p.caseId + '(' + p.dma + '):累积观察窗 + 自动调度视觉旁证 + 可派现场核查;超期升级主管';
    });

  A.auto_device_ticket = autoDef('自动开设备工单', '传感器自检失败 → 免人工定性,自动开设备维护工单;承接方=传感网运维方',
    function (s, p) {
      var sn = senOf(p.sensorId); if (sn) sn.health = '自检失败';
      var tk = tkOf(p.ticketId);
      if (!tk) {
        tk = {
          id: p.ticketId, type: '设备工单', clueId: null, facility: sn ? sn.facility : null, crew: null,
          state: '已派工', source: w.DATA.dict.ticketSources.plan, createdT: s.now, line: '管网',
          mirror: 'MUN-WO-' + (77300 + s.tickets.length),
          sla: { accept: addMin(s.now, 60), arrive: addMin(s.now, 240), done: addMin(s.now, 600) },
          suspended: false, photos: [], note: '承接方=传感网运维方(不归三线市政班组)'
        };
        s.tickets.push(tk);
      }
      return '设备自检失败 ' + p.sensorId + ' → 自动开设备工单 ' + tk.id + '(承接方=传感网运维方);先排设备故障,再报业务异常';
    });

  A.auto_verify = autoDef('AI 复验', '范围=引导拍摄 + 配准判定;判不出 = 存疑待人裁,永不默认打回',
    function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return 'AI 复验:工单不存在';
      t.verify = '存疑待人裁';
      banner('info', 'AI 复验判不出(配准失败):' + t.id + ' 转「存疑待人裁」—— 永不默认打回,由复核员人裁。', 'm1');
      return 'AI 复验 ' + t.id + ':修复前后配准判不出 → 存疑待人裁(永不默认打回)';
    },
    function (s, p) { var t = tkOf(p.ticketId); if (!t) return '工单不存在'; if (t.state !== '已完工') return '工单未到「已完工」态'; return null; });

  A.auto_overload = autoDef('过载分诊(显名降级)', '入流超容量三步之②:超额件降级进批量加急分诊,件件可抽审',
    function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '过载分诊:线索不存在';
      c.lane = '批量加急分诊(显名降级)'; c.degraded = true;
      c.slaDeadline = addMin(s.now, w.DATA.dict.sla.urgentReview);
      hold('降级件抽审', c.id, '过载降级件件件可抽审(区别于常态批量确认)');
      banner('warn', '承接池无可派:' + c.id + ' 显名降级进「批量加急分诊」,降级原因入动作日志;区值班长可启动临时借调 + SLA 延展档。', 'm1');
      return '过载三步 ' + c.id + ':①只读预警先喊现场 ②显名降级进批量加急分诊(件件可抽审)③待区值班长临时借调/抢占仲裁';
    });

  A.auto_dedupe = autoDef('多源同点去重合并', '公众上报与传感器线索同点位合并,证据叠加;防抖冷却',
    function (s, p) {
      var r = byId(s.publicReports, p.reportId), c = clueOf(p.clueId);
      if (!r || !c) return '去重合并:对象不存在';
      r.mergedInto = c.id; r.status = '已并入';
      c.publicRefs.push(r.id);
      (r.evidence || []).forEach(function (e) { c.evidence.push({ kind: e.kind, label: e.label, from: r.id }); });
      return '多源同点合并:公众上报 ' + r.id + ' 并入线索 ' + c.id + ';证据叠加,回执状态同步可查;双单竞态收敛';
    });

  A.auto_recon = autoDef('对账不一致', '每日比对镜像与客户系统;处置状态以客户系统为准,巡检定性以我方为准',
    function (s, p) {
      var rc = byId(s.recon, p.reconId);
      if (!rc) { var tpl = w.UNLOCKS.recon[p.reconId]; if (tpl) { rc = clone(tpl); rc.t = s.now; s.recon.push(rc); } }
      return '对账异常入队 ' + p.reconId + '(工单 ' + p.ticketId + '):我方镜像与客户系统状态不一致 → 24h 内主管人工裁定,裁定入动作日志';
    });

  A.auto_flow_recover = autoDef('流量回归基线', '管网线复验=流量回归基线验证(非照片)',
    function (s, p) {
      var k = caseOf(p.caseId); if (!k) return '流量回归:调查案不存在';
      k.flowGreen = true;
      return '流量回归基线 ' + k.id + '(' + k.dma + '):水量平衡偏差回落至阈值内,绿标点亮';
    });

  A.auto_suggest_close = autoDef('建议结案', '系统只出建议,结案签字仍在人',
    function (s, p) {
      var k = caseOf(p.caseId); if (!k) return '建议结案:调查案不存在';
      if (k.status !== '已结案') k.status = '建议结案';
      return '系统建议结案 ' + k.id + ':流量回归绿标已亮 → 待人签字结案(定性权在人)';
    });

  A.auto_storm_on = autoDef('暴雨模式启动', '井盖线整体升档;液位计转先导预警源',
    function (s, p) {
      s.gov.stormMode = true;
      var n = 0;
      s.clues.forEach(function (c) {
        if (c.line === '井盖' && c.level === '养护' && c.status === 'open') { c.level = '急修'; c.stormUp = true; n++; }
      });
      banner('warn', '暴雨模式已启动:井盖线整体升档(养护件 ' + n + ' 条 → 急修档);液位计转先导预警源;雨前清掏任务包已下发。', 'global');
      return '暴雨模式启动:全线升档,井盖线 ' + n + ' 条养护件升「急修」;暴雨预案 SLA 延展档待区值班长启用(留痕)';
    });

  A.auto_storm_tasks = autoDef('雨前清掏任务包', '井筒淤积对视觉与液位皆盲 → 任务型兜底,与客户清掏计划对接',
    function (s, p) {
      var tk = tkOf(p.ticketId);
      if (!tk) { var tpl = w.UNLOCKS.tickets[p.ticketId]; if (tpl) { tk = clone(tpl); tk.createdT = s.now; s.tickets.push(tk); } }
      return '雨前清掏核查任务包 ' + p.ticketId + ' 下发:箅面干净 ≠ 过水能力在(井筒淤积视觉与液位皆盲)——沙漠城市雨前最该查的一件';
    });

  A.auto_audit_hold = autoDef('拘进抽审', '高危件与自动处置件拘进主管抽审队列',
    function (s, p) { hold('自动拘审', p.clueId || '', p.reason || '高危件拘进主管抽审'); return '拘进主管抽审:' + (p.clueId || '') + ';' + (p.reason || ''); });

  /* ============ commit / check(动作引擎) ============ */
  function actorOf(p) { return (p && p.actor) || state.role; }

  function authorized(def, actor) {
    if (!def.actors || def.actors.indexOf('*') >= 0) return true;
    return def.actors.indexOf(actor) >= 0;
  }

  function evaluate(action, params) {
    var def = A[action];
    if (!def) return { ok: false, reason: '未知动作:' + action };
    var p = params || {}, actor = actorOf(p);
    if (!authorized(def, actor)) {
      return { ok: false, reason: '当前身份「' + actor + '」无此动作授权(授权角色:' + def.actors.join(' / ') + ')' };
    }
    var why = def.v ? def.v(state, p, actor) : null;
    if (why) return { ok: false, reason: why };
    return { ok: true, reason: null };
  }

  function doCommit(action, params, silent) {
    var chk = evaluate(action, params);
    if (!chk.ok) {
      if (silent) return { ok: false, reason: chk.reason, skipped: true };
      return { ok: false, reason: chk.reason };
    }
    var def = A[action], p = params || {}, actor = actorOf(p);
    var sum = def.run(state, p, actor) || def.label;
    state.seq++;
    var log = {
      rid: 'LG-' + ('000' + (state.actionLog.length + 1)).slice(-4),
      t: state.now, actor: actor, action: action, params: p,
      snapshot: 'RS-' + state.seq, sum: sum, auto: !!def.auto, label: def.label
    };
    state.actionLog.push(log);
    save();
    emit('render', { action: action, log: log });
    return { ok: true, log: log };
  }

  /* ============ 场景引擎(假时钟只在此步进) ============ */
  function stepById(id) {
    for (var i = 0; i < w.SCENARIO.length; i++) if (w.SCENARIO[i].id === id) return { step: w.SCENARIO[i], idx: i };
    return null;
  }

  function unlock(step) {
    (step.unlocks || []).forEach(function (u) {
      var id = u.obj;
      if (u.type === 'clue') { ensureClue(id); }
      else if (u.type === 'investigation') { if (!caseOf(id) && w.UNLOCKS.investigations[id]) state.investigations.push(clone(w.UNLOCKS.investigations[id])); }
      else if (u.type === 'publicReport') { if (!byId(state.publicReports, id) && w.UNLOCKS.publicReports[id]) state.publicReports.push(clone(w.UNLOCKS.publicReports[id])); }
      else if (u.type === 'recon') { if (!byId(state.recon, id) && w.UNLOCKS.recon[id]) state.recon.push(clone(w.UNLOCKS.recon[id])); }
      else if (u.type === 'ticket') { if (!tkOf(id) && w.UNLOCKS.tickets[id]) state.tickets.push(clone(w.UNLOCKS.tickets[id])); }
    });
  }

  function advance(stepId) {
    var hit = stepById(stepId);
    if (!hit) return { ok: false, reason: '无此场景步:' + stepId };
    var step = hit.step;
    state.now = step.t;                 // 假时钟步进
    state.stepIdx = Math.max(state.stepIdx, hit.idx + 1);
    state.lastStep = step.id;
    unlock(step);                       // 先解锁对象,再跑自动动作
    var ran = [];
    (step.auto || []).forEach(function (e) {
      var r = doCommit(e.action, e.params, true);
      if (r.ok) ran.push(e.action);
    });
    save();
    emit('scenario', { step: step, ran: ran });
    emit('render', { scenario: step.id });
    return { ok: true, step: step, ran: ran };
  }

  function nextStep() {
    if (state.stepIdx >= w.SCENARIO.length) {
      return { ok: false, reason: '剧情已推进到最后一步(T12)。可点「重置演示」回到 T0。' };
    }
    return advance(w.SCENARIO[state.stepIdx].id);
  }

  /* ============ SLA ============ */
  function fmtSla(deadline) {
    if (!deadline) return '—';
    var d = toMin(deadline) - toMin(state.now);
    var abs = Math.abs(d);
    var body = abs >= 60 ? (Math.floor(abs / 60) + ' 小时 ' + (abs % 60) + ' 分') : (abs + ' 分');
    return d >= 0 ? ('剩 ' + body) : ('已超时 ' + body);
  }

  /* ============ 公开接口(施工图 §3,签名冻结) ============ */
  w.S = {
    state: state,
    get: function () { return state; },
    save: save,
    reset: function () {
      clearStore();
      state = seed();
      w.S.state = state;
      writeStore(state);
      try { w.location.reload(); } catch (e) { emit('render', { reset: true }); }
      return { ok: true };
    },
    commit: function (action, params) { return doCommit(action, params, false); },
    advance: advance,
    nextStep: nextStep,
    now: function () { return state.now; },
    fmtSla: fmtSla,

    /* ---- 以下为增补助手(不改上列冻结签名;W1 页面按需取用) ---- */
    check: function (action, params) { return evaluate(action, params); },   // 灰态按钮的原因来源(R53),不改状态
    slaOverdue: function (deadline) { return !!deadline && toMin(deadline) > 0 && toMin(deadline) < toMin(state.now); },
    slaLeft: function (deadline) { return deadline ? toMin(deadline) - toMin(state.now) : null; },
    ACTIONS: A,
    dict: function () { return w.DATA.dict; },
    step: function () { return state.stepIdx < w.SCENARIO.length ? w.SCENARIO[state.stepIdx] : null; }, // 下一步
    lastStep: function () { return state.lastStep ? (stepById(state.lastStep) || {}).step : null; },
    setRole: function (r) { state.role = r; save(); emit('render', { role: r }); return r; },
    find: { clue: clueOf, ticket: tkOf, crew: crewOf, facility: facOf, investigation: caseOf, sensor: senOf, alert: function (id) { return byId(state.alerts, id); } },
    time: { toMin: toMin, toHHMM: toHHMM, addMin: addMin },
    isHigh: isHigh
  };

  save();
})(window);
