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
    return hydrate(d);
  }

  /* R86 新增运行期容器:老 sessionStorage 快照缺字段时补齐(只加不删,既有字段不动) */
  function hydrate(d) {
    if (!d.dismissed) d.dismissed = [];       // A9 已关闭横幅 id
    if (!d.ruleParams) d.ruleParams = {};     // A2 规则参数覆盖值(影子试算写这里,不改运行判定)
    if (!d.ruleShadow) d.ruleShadow = [];     // A2 影子试算留痕
    if (!d.feedbacks) d.feedbacks = [];       // A5 误报原因回流
    if (!d.stepLog) d.stepLog = {};
    /* R87 A2:待裁定卡(抢占第三步交到复核主管(值班)手上的建议方案 + 后果) */
    if (!d.pendingRulings) d.pendingRulings = [];
    /* R87:工单事项一句话 + 挂起恢复条件位;告警申诉/裁定位;班组坐标与在途目标 —— 老快照缺字段时补齐 */
    (d.tickets || []).forEach(function (t) {
      if (!t.summary) t.summary = summaryOf(t, d);
      if (t.resumeCond === undefined) t.resumeCond = null;
    });
    (d.alerts || []).forEach(function (a) {
      if (a.appeal === undefined) a.appeal = null;
      if (a.ruling === undefined) a.ruling = null;
      if (a.misfire === undefined) a.misfire = false;
    });
    /* R88 A5⑭ / A1⑳:老快照补抽审行的被抽对象与触发 rid;gov 的气象预警位 */
    ((d.gov && d.gov.auditQueue) || []).forEach(function (a) {
      if (a.targetKind === undefined) {
        a.targetKind = '线索'; a.targetId = a.clueId || '';
        a.targetRoute = a.clueId ? ('#/m1/clue/' + a.clueId) : null;
      }
      if (a.srcRid === undefined) a.srcRid = null;
    });
    if (d.gov && d.gov.weatherAlert === undefined) d.gov.weatherAlert = null;
    /* R89 A1:认领位(assignee = 锁到谁手上,null = 公共池;claimLog = 认领 / 接手留痕) */
    (d.clues || []).forEach(function (c) {
      if (c.assignee === undefined) c.assignee = null;
      if (!c.claimLog) c.claimLog = [];
    });
    /* R89 A4⑧:核查任务包的分段试验数据位(老快照只有 segments/done 计数时补出段数组) */
    (d.investigations || []).forEach(function (k) {
      if (k.survey && !k.survey.segs) k.survey.segs = surveySegs(k.survey.segments || 4);
    });
    (d.crews || []).forEach(function (c) {
      if (!c.xy) {
        var seedCrew = byId((w.DATA && w.DATA.crews) || [], c.id);
        c.xy = (seedCrew && seedCrew.xy ? seedCrew.xy : [500, 500]).slice();
      }
      if (c.enroute === undefined) c.enroute = null;
    });
    return d;
  }

  /* R89 A4⑧ · 分段关阀试验的段位:每段一行,班组回传关阀前 / 后流量读数后 done=true */
  function surveySegs(n) {
    var out = [];
    for (var i = 1; i <= (n || 4); i++) {
      out.push({ no: i, name: '第 ' + i + ' 段', done: false, preFlow: null, postFlow: null, note: '', t: null, by: null });
    }
    return out;
  }

  /* R87 · 工单事项一句话:「井盖缺失 · Al Jimi MH-0417」= 关联线索的异常类目(无线索则按工单类型)+ 街区 + 设施号。
     所有工单都要有(含支线新生成的)—— 创建路径统一在 doCommit / advance 尾部回填一次。 */
  var TICKET_TOPIC = {
    '养护批量工单': '周期养护批量', '设备工单': '传感器自检失败', '雨前专项任务': '雨前清掏核查',
    '核查任务': '渗漏核查(夜间听漏 / 分段关阀)', '管网维修工单': '渗漏点维修', '传感器复检工单': '传感器复检',
    '紧急工单': '紧急处置', '急修工单': '急修处置'
  };
  function summaryOf(tk, d) {
    if (!tk) return '';
    d = d || state;
    var c = tk.clueId && d ? byId(d.clues || [], tk.clueId) : null;
    var f = tk.facility && d ? byId(d.facilities || [], tk.facility) : null;
    var topic = (c && c.kindText) || TICKET_TOPIC[tk.type] || tk.type || '处置任务';
    var where = [(f && f.block) || '', tk.facility || ''].filter(function (x) { return !!x; }).join(' ');
    return where ? (topic + ' · ' + where) : topic;
  }
  function fillSummaries(d) {
    (d.tickets || []).forEach(function (t) { if (!t.summary) t.summary = summaryOf(t, d); });
  }

  var state = hydrate(readStore() || seed());
  if (!state.now) state = seed();

  function save() { writeStore(state); }
  /* 静默计数器(R85① 导览重放用):>0 时不外发 render/scenario 事件,避免重放 12 步刷 12 次屏。
     只有 S.tourGoto 会抬高它,既有调用路径 quiet 恒为 0 —— 既有语义不变。 */
  var quiet = 0;
  function emit(name, detail) {
    if (quiet) return;
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
  function isHigh(c) { return c && (c.level === '紧急' || c.level === '急修'); }
  function rank(role) { return (w.DATA.dict.roleRank[role] || 0); }
  function nextId(prefix, list) {
    var n = 9000 + list.length + 1;
    /* 场景表里有写死 id 的工单(WO-9001/9007/9008/9012),按长度推的号可能正好撞上 —— 撞则顺延 */
    while (byId(list, prefix + n)) n++;
    return prefix + n;
  }
  /* R86 A9:横幅统一形态 {id,tone,text,scope,href?,dismissible};href = 该提示对应对象的路由 */
  function banner(tone, text, scope, href) {
    state.banners.push({
      id: 'BN-' + (state.banners.length + 1), tone: tone, text: text,
      scope: scope || 'global', t: state.now, href: href || null, dismissible: true
    });
  }
  /* 对象 → 路由(横幅 href 与地图/卡片跳转共用) */
  function routeOf(kind, id) {
    if (!id) return null;
    if (kind === 'clue') return '#/m1/clue/' + id;
    if (kind === 'ticket') return '#/m2/tickets/' + id;
    if (kind === 'alert') return '#/m2/alerts/' + id;
    if (kind === 'facility') return '#/m3/facility/' + id;
    if (kind === 'recon') return '#/m2/recon';
    if (kind === 'dispatch') return '#/m2/dispatch';
    if (kind === 'case') return '#/m1/line/pl';
    return null;
  }

  /* R87 A2 · 挂起件的恢复条件:每个挂起原因都写清「等什么、谁来解、大概多久」,
     两个出口固定 —— 班组端「条件解除,恢复作业」(crew_resume)/ 复核主管(值班)「强制回队重派」(resume_requeue)。 */
  var RESUME_COND = {
    '抢占调度': { cond: '被让位的高优先级件处置完毕、班组释放', owner: '复核主管(值班)', wait: 60 },
    '待条件(审批/物料/装备)': { cond: '审批下达 / 物料到场 / 装备释放,三者中缺的那一项到位', owner: '复核主管(值班)', wait: 90 },
    '联动处置等待': { cond: '联动单位(警察 / 民防 / 产权单位)到场并交出作业面', owner: '复核主管(值班)', wait: 60 },
    '交通导改审批未下': { cond: '交管导改批文下达', owner: '交管对接岗', wait: 90 },
    '物料未到': { cond: '物料送达现场', owner: '仓储调度岗', wait: 60 },
    '大型设备占用': { cond: '设备从上一处作业面释放', owner: '复核主管(值班)', wait: 120 },
    '作业许可未批': { cond: '作业许可(密闭空间 / 带压)批复下达', owner: '安全岗', wait: 60 }
  };
  function resumeCondOf(reason, now) {
    var d = RESUME_COND[reason] || { cond: '挂起原因消除', owner: '复核主管(值班)', wait: 60 };
    return {
      reason: reason || '', cond: d.cond, owner: d.owner, eta: addMin(now, d.wait),
      exits: ['班组端「条件解除,恢复作业」', '复核主管(值班)「强制回队重派」']
    };
  }

  /* R87 · 班组位置与在途目标(调度视图地图用;坐标与设施同一虚拟坐标系) */
  function crewMove(cw, facilityId, mode) {
    if (!cw) return;
    var f = facilityId ? facOf(facilityId) : null;
    if (mode === 'enroute') {
      cw.enroute = facilityId ? { to: facilityId } : null;
      if (f && f.xy && cw.xy) cw.xy = [Math.round((cw.xy[0] + f.xy[0]) / 2), Math.round((cw.xy[1] + f.xy[1]) / 2)];
    } else if (mode === 'arrive') {
      cw.enroute = null;
      if (f && f.xy) cw.xy = [f.xy[0] + 14, f.xy[1] + 14];
    } else {
      cw.enroute = null;
    }
  }

  /* R86 A3:向线索追加一次观测(证据同时并入展平 evidence —— 既有渲染读 clue.evidence 的路径不变) */
  function addObservation(c, obs) {
    if (!c) return null;
    if (!c.observations) {
      c.observations = [{ t: c.t, source: c.source, conf: (c.conf === undefined ? null : c.conf), evidence: (c.evidence || []).slice(), note: c.note || '', kind: w.CLUE_OBS.kind(c.source) }];
    }
    var o = {
      t: obs.t || state.now, source: obs.source || '', conf: (obs.conf === undefined ? null : obs.conf),
      evidence: obs.evidence || [], note: obs.note || '', kind: obs.kind || w.CLUE_OBS.kind(obs.source)
    };
    c.observations.push(o);
    (o.evidence || []).forEach(function (e) { c.evidence.push(e); });
    w.CLUE_OBS.sync(c);
    return o;
  }
  /* R88 A5⑭:每条抽审记录都带「被抽的是谁」(targetKind / targetId / targetRoute,m4 行内可点跳)
     与「哪条动作把它拘进来的」(srcRid,由 doCommit 在本次动作落日志后回填)。
     target 省略时默认被抽对象=线索;连线索都没有的(纯动作类)由 doCommit 回落到动作日志本身。 */
  function hold(src, clueId, reason, target) {
    var tg = target || { kind: '线索', id: clueId || '' };
    var rk = tg.kind === '工单' ? 'ticket' : (tg.kind === '线索' ? 'clue' : (tg.kind === '告警' ? 'alert' : null));
    state.gov.auditQueue.push({
      id: 'AU-' + (1300 + state.gov.auditQueue.length), src: src, clueId: clueId,
      reason: reason, t: state.now, status: '待抽审',
      targetKind: tg.kind, targetId: tg.id || '',
      targetRoute: (rk && tg.id) ? routeOf(rk, tg.id) : null, srcRid: null
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

  /* ============ R89 A1 · 认领制(件在公共池,谁处置谁先认领)============
     assignee 单值:null = 公共池,任何人可认领;非空 = 锁到那个人手上,他人视图灰化。
     处置动作(定性类)执行时隐式认领 —— 未认领的自动补一条 claim 日志再执行,
     已被他人认领的直接拦下并提示走「接手」。三件都留痕,不做静默夺件。 */
  var CLAIM_ACTIONS = ['confirm', 'reject', 'overrule_mech', 'fastlane_recall', 'archive_doubt', 'transfer', 'clue_escalate'];
  function claimBlock(action, p, actor) {
    if (CLAIM_ACTIONS.indexOf(action) < 0) return null;
    var c = p && p.clueId ? clueOf(p.clueId) : null;
    if (!c || !c.assignee || c.assignee === actor) return null;
    return '本件已由「' + c.assignee + '」认领:要处置请先「接手」(须填原因,记日志)';
  }

  A.claim = {
    label: '认领', actors: ['区复核员', '复核主管'], hint: '把公共池里的件锁到自己名下;他人视图该件灰化标「已由 XX 认领」',
    v: function (s, p, actor) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (c.status !== 'open') return '线索非「待核查」态,无需认领';
      if (c.assignee === actor) return '本件已在你名下';
      if (c.assignee) return '本件已由「' + c.assignee + '」认领:请走「接手」(须填原因)';
      return null;
    },
    run: function (s, p, actor) {
      var c = clueOf(p.clueId);
      c.assignee = actor;
      (c.claimLog = c.claimLog || []).push({ t: s.now, by: actor, way: '认领', from: null, reason: p.reason || '' });
      return '认领 ' + c.id + ':件锁到「' + actor + '」名下;他人视图该件灰化,可「接手」但须填原因并留痕';
    }
  };

  A.claim_takeover = {
    label: '接手', actors: ['区复核员', '复核主管'], hint: '从他人手上接过件:原因必填,记日志;原认领人可回查是谁在什么时候接走的',
    v: function (s, p, actor) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (c.status !== 'open') return '线索非「待核查」态,无需接手';
      if (!c.assignee) return '本件还在公共池里,直接「认领」即可';
      if (c.assignee === actor) return '本件已在你名下';
      if (!p.reason) return '接手原因必填(进动作日志,原认领人可回查)';
      return null;
    },
    run: function (s, p, actor) {
      var c = clueOf(p.clueId), from = c.assignee;
      c.assignee = actor;
      (c.claimLog = c.claimLog || []).push({ t: s.now, by: actor, way: '接手', from: from, reason: p.reason });
      return '接手 ' + c.id + ':' + from + ' → ' + actor + ';原因「' + p.reason + '」;认领转移留痕,不静默夺件';
    }
  };

  /* ---- 复核员动作族 ---- */
  A.view_evidence = {
    label: '查看证据卡', actors: ['*'], hint: '高危件确认前的强制前置',
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
        out.push('机器直派件:告警 ' + al.id + ' 成立=人追认(工单 ' + c.ticketId + ' 已在处置中,不重复派工)');
      } else {
        var tk = {
          id: nextId('WO-', s.tickets), type: c.level === '紧急' ? '紧急工单' : (c.level === '急修' ? '急修工单' : '养护批量工单'),
          clueId: c.id, facility: c.facility, crew: null, state: '已派工', source: w.DATA.dict.ticketSources.human,
          createdT: s.now, mirror: 'MUN-WO-' + (77300 + s.tickets.length), line: c.line,
          sla: { accept: addMin(s.now, w.DATA.dict.sla.accept), arrive: addMin(s.now, w.DATA.dict.sla.arrive), done: addMin(s.now, w.DATA.dict.sla.sameDay) },
          suspended: false, photos: [], note: '确认动作的派工副作用(来源② 人确认派)'
        };
        s.tickets.push(tk); c.ticketId = tk.id;
        out.push('告警 ' + al.id + ' 成立;副作用开' + tk.type + ' ' + tk.id + '(镜像 ' + tk.mirror + ')');
      }
      if (isHigh(c)) { hold('高危确认拘审', c.id, '高危确认件全量拘进主管抽审'); out.push('高危确认已拘主管抽审'); }
      return '确认 ' + c.id + ':' + out.join(';');
    }
  };

  A.reject = {
    label: '驳回', actors: ['区复核员', '复核主管'], hint: '必选六驳回原因码之一,按码回流各自消费者',
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
        hold('高危驳回拘审', c.id, '高危驳回件拘进主管抽审');
        banner('warn', '高危驳回已拘主管抽审:' + c.id + '(' + def.code + ' ' + def.name + ')', 'm1', routeOf('clue', c.id));
        out += ';高危驳回已拘主管抽审';
      }
      return out;
    }
  };

  A.overrule_mech = {
    label: '推翻机械判定', actors: ['区复核员', '复核主管'], hint: '理由码必填;线索复活进人审 + 自动触发抽审',
    v: function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (!c.mechFail) return '本件机械校验无硬失败,无可推翻';
      if (!p.reason) return '理由码必填';
      return null;
    },
    run: function (s, p) {
      var c = clueOf(p.clueId); c.mechFail = false; c.status = 'open';
      c.lane = isHigh(c) ? '加急人工' : '单条必审';
      c.slaDeadline = addMin(s.now, w.DATA.dict.sla.urgentReview);
      hold('推翻机械判定', c.id, '人推翻机械判定自动触发抽审;误杀样本回流规则组');
      return '推翻机械判定 ' + c.id + ':理由「' + p.reason + '」→ 线索复活进「' + c.lane + '」;自动触发抽审';
    }
  };

  A.fastlane_recall = {
    label: '机器直派撤回', actors: ['区复核员', '复核主管'], hint: '显名 + 理由码;副作用=召回班组 + 线索转驳回流',
    v: function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (!c.fastlane) return '仅机器直派自动派单件可撤回';
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
      hold('机器直派件全量抽审', c.id, '机器直派撤回件进误派率月报口径');
      banner('info', '机器直派撤回:' + c.id + ' 线索转驳回流;白跑不计班组考核,班组可申诉。', 'm1', routeOf('clue', c.id));
      return '机器直派撤回 ' + c.id + ':理由「' + p.reason + '」;' + br;
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
    run: function (s, p, actor) {
      var n = 0, held = [];
      (p.clueIds || []).forEach(function (id) {
        var c = clueOf(id); if (!c || c.status !== 'open') return;
        /* R89 A1:批内他人已认领的件跳过(不夺件、不静默处置),显名列出让人去「接手」 */
        if (c.assignee && c.assignee !== actor) { held.push(c.id + '(' + c.assignee + ')'); return; }
        if (!c.assignee) { c.assignee = actor; (c.claimLog = c.claimLog || []).push({ t: s.now, by: actor, way: '批量隐式认领', from: null, reason: '' }); }
        c.status = 'confirmed'; c.lane = c.lane || '批量半审'; c.planned = true; n++;
      });
      var pick = Math.max(1, Math.round(n * 0.15));
      hold('批量确认 15% 抽样', (p.clueIds || [])[0] || '', '批量件抽审率 15%:本批 ' + n + ' 条抽 ' + pick + ' 条');
      return '批量确认 ' + n + ' 条 → 并入养护计划;抽审 15%(本批抽 ' + pick + ' 条)' +
        (held.length ? ';跳过他人已认领 ' + held.length + ' 条(' + held.join(' / ') + '),需先「接手」' : '');
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
    label: '改派', actors: ['复核主管'], hint: '理由码必填;改派 ≠ 撤回(事件不动,单子换承接方)',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (!p.crew || !crewOf(p.crew)) return '未选择承接班组';
      if (!p.reason) return '理由码必填';
      return null;
    },
    run: function (s, p) {
      var t = tkOf(p.ticketId), old = t.crew, nw = crewOf(p.crew);
      if (old && crewOf(old)) { var o = crewOf(old); o.load = Math.max(0, o.load - 1); o.status = o.load ? o.status : '空闲'; }
      t.crew = p.crew; t.state = '已派工'; t.suspended = false; t.resumeCond = null;
      nw.load++; nw.status = '待接单'; crewMove(nw, t.facility, 'enroute');
      return '改派 ' + t.id + ':' + (old || '(无)') + ' → ' + nw.name + ';理由「' + p.reason + '」(事件不动,仅换承接方)';
    }
  };

  A.merge = {
    label: '合并', actors: ['复核主管'], hint: '同点位/同时窗多单合并;理由码必填',
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
    label: '拆单', actors: ['复核主管'], hint: '跨线联动事件拆主责;理由码必填',
    v: function (s, p) { var t = tkOf(p.ticketId); if (!t) return '工单不存在'; if (!p.reason) return '理由码必填'; return null; },
    run: function (s, p) {
      var t = tkOf(p.ticketId);
      var c = clone(t); c.id = nextId('WO-', s.tickets); c.crew = null; c.state = '已派工';
      c.note = '拆自 ' + t.id + ':' + p.reason; c.mirror = 'MUN-WO-' + (77300 + s.tickets.length);
      s.tickets.push(c);
      p.newTicketId = c.id;   // R89 A3:新对象 id 回写进本次动作参数,链接层与日志都能指到它
      return '拆单 ' + t.id + ' → 新增 ' + c.id + ';理由「' + p.reason + '」';
    }
  };

  A.suspend = {
    label: '挂起', actors: ['规则引擎', '复核主管'], hint: '原因码入日志;挂起期 SLA 停表,条件解除后原单回队重派',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (t.suspended) return '工单已处于挂起态';
      if (!p.reason) return '原因码必填';
      return null;
    },
    run: function (s, p) {
      var t = tkOf(p.ticketId);
      t.stateBeforeSuspend = t.state;
      t.suspended = true; t.suspendReason = p.reason; t.suspendT = s.now;
      t.resumeCond = resumeCondOf(p.reason, s.now);
      var cw = t.crew ? crewOf(t.crew) : null;
      if (cw) { cw.status = '空闲'; cw.load = Math.max(0, cw.load - 1); crewMove(cw, null, 'free'); t.crewReleased = true; }
      banner('amber', '挂起回补卡:' + t.id + ' 因「' + p.reason + '」挂起,SLA 停表;等「' + t.resumeCond.cond + '」(' + t.resumeCond.owner + ',预计 ' + t.resumeCond.eta + ')。', 'm2', routeOf('ticket', t.id));
      return '挂起 ' + t.id + ':原因「' + p.reason + '」;SLA 停表,班组释放;恢复条件「' + t.resumeCond.cond + '」,两个出口=班组报条件解除 / 复核主管(值班)强制回队重派';
    }
  };

  A.override_emergency = {
    label: '紧急 override', actors: ['复核主管'], hint: '红色动作:双确认;跳闸直接行动 + 强制事后审计 + 双人知悉',
    v: function (s, p, actor) {
      if (rank(actor) < 2) return '需主管以上权限';
      if (!p.confirm2) return '需红色确认弹层双确认';
      if (!p.reason) return '理由必填';
      return null;
    },
    run: function (s, p) {
      hold('紧急 override 事后审计', p.clueId || '', 'override 强制事后审计 + 双人知悉');
      banner('danger', '紧急 override 已执行:' + (p.target || p.clueId || '') + ' —— 跳闸直接行动,红标日志 + 强制事后审计。', 'global', routeOf('clue', p.clueId) || '#/m4');
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

  /* R89 A2 rollback:市民渠道三动作(受理 / 重复登记 / 甄别驳回)整条删除 —— 见 data.js §8 */

  A.freeze_evidence = {
    label: '证据冻结', actors: ['复核主管'], hint: '涉事故/索赔件:全证据链快照锁定 + 哈希锚定,可导出法务包',
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
    label: '类目机器直派开关', actors: ['上级主管部门'], hint: '关 = 安全侧动作即时生效 + 强制通知横幅 + 区申诉通道;开 = 需数据判据',
    v: function (s, p) {
      if (!p.cat) return '未指定类目';
      if (p.on && !p.dataBasis) return '重开需按数据判据填写批准依据';
      if (!p.on && !p.reason) return '关闭需填写理由(进动作日志)';
      return null;
    },
    run: function (s, p) {
      s.gov.fastlane[p.cat] = !!p.on;
      if (!p.on) {
        banner('warn', '上级主管部门已关闭「' + p.cat + '」类目机器直派:该类目回退人审;本区已强制通知,区可发起申诉(申诉由上级主管部门复议并留痕)。', 'global', '#/m6');
        return '上级主管部门关闭机器直派类目「' + p.cat + '」:理由「' + p.reason + '」;即时生效 + 强制通知该区 + 区申诉通道开启';
      }
      banner('info', '上级主管部门已重开「' + p.cat + '」类目机器直派:依据「' + p.dataBasis + '」。', 'global', '#/m6');
      return '上级主管部门重开机器直派类目「' + p.cat + '」:数据判据「' + p.dataBasis + '」';
    }
  };

  A.appeal_fastlane = {
    label: '区申诉', actors: ['复核主管'], hint: '关车道后的区申诉通道:上级主管部门复议并留痕',
    v: function (s, p) { if (!p.cat) return '未指定类目'; if (!p.reason) return '申诉理由必填'; return null; },
    run: function (s, p) { return '区申诉:请求复议「' + p.cat + '」机器直派关闭;理由「' + p.reason + '」→ 转上级主管部门复议(留痕)'; }
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
      var cw = t.crew ? crewOf(t.crew) : null; if (cw) { cw.status = '在途'; crewMove(cw, t.facility, 'enroute'); }
      return '班组接单 ' + t.id + '(' + (cw ? cw.name : '') + '):状态写回客户工单系统 ' + t.mirror;
    }
  };
  A.crew_arrive = {
    label: '到场', actors: ['班组账号'], hint: '到场 30 分钟 SLA(假设值)',
    v: function (s, p) { var t = tkOf(p.ticketId); if (!t) return '工单不存在'; if (t.state !== '已接单') return '工单非「已接单」态'; return null; },
    run: function (s, p) {
      var t = tkOf(p.ticketId); t.state = '已到场';
      var cw = t.crew ? crewOf(t.crew) : null; if (cw) { cw.status = '到场'; crewMove(cw, t.facility, 'arrive'); }
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
    label: '拒单', actors: ['班组账号'], hint: '理由码必填(缺资质/在办紧急件/装备不符);立即触发改派',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (t.state !== '已派工') return '工单已进入处置,不可拒单';
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
      var t = tkOf(p.ticketId);
      if (!t.suspended) t.stateBeforeSuspend = t.state;
      t.state = '待条件'; t.suspended = true; t.suspendReason = p.code;
      t.suspendT = s.now; t.crewReleased = false;
      t.resumeCond = resumeCondOf(p.code, s.now);
      return '受阻上报 ' + t.id + ':原因码「' + p.code + '」→ 工单转「待条件」(写回客户系统状态机映射);SLA 停表;' +
        '恢复条件「' + t.resumeCond.cond + '」(' + t.resumeCond.owner + ',预计 ' + t.resumeCond.eta + '),条件解除后班组可自行恢复作业';
    }
  };
  A.crew_safety = {
    label: '安全上报', actors: ['班组账号'], hint: '置顶通道:复核主管(值班)即时通知',
    v: function (s, p) { if (!p.note) return '需填写现场情况'; return null; },
    run: function (s, p) {
      banner('danger', '现场安全上报(置顶通道):' + p.note + ' —— 已即时通知复核主管(值班)。', 'global', '#/m2/dispatch');
      return '安全上报:' + p.note + ';置顶通道 → 复核主管(值班)即时通知';
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
        note: '班组现场发现:不走视觉腿,直接进人审甄别',
        assignee: null, claimLog: [], mergedInto: null, ticketId: null, alertId: null,
        observations: []
      };
      c.observations = [{ t: s.now, source: c.source, conf: null, evidence: c.evidence.slice(), note: c.note, kind: '人工巡查' }];
      w.CLUE_OBS.sync(c);
      s.clues.push(c);
      p.newClueId = c.id;     // R89 A3:同上,新线索 id 回写
      return '现场上报:新线索 ' + c.id + '(' + p.facility + '),来源标「现场发现」→ 复核员甄别';
    }
  };
  A.crew_partial_done = {
    label: '部分完工', actors: ['班组账号'], hint: '分阶段处置:临时措施先行(围挡)→ 永久修复',
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

  A.auto_dispatch = autoDef('自动派单(机器直派)', '提交校验:紧急级 + 双闸硬条件 + 该类目机器直派开关开启;产出紧急工单,不产出告警',
    function (s, p) {
      var c = clueOf(p.clueId); var cw = crewOf(p.crew);
      var tk = {
        id: p.ticketId || 'WO-9001', type: '紧急工单', clueId: c.id, facility: c.facility, crew: p.crew,
        state: '已派工', source: w.DATA.dict.ticketSources.auto, createdT: s.now, line: c.line,
        mirror: 'MUN-WO-' + (77300 + s.tickets.length),
        sla: { accept: addMin(s.now, w.DATA.dict.sla.accept), arrive: addMin(s.now, w.DATA.dict.sla.arrive), done: addMin(s.now, 120) },
        suspended: false, photos: [], note: '来源① 机器直派自动派:硬证据准入=已认证设备签名报文;时效窗内实时数据;防抖冷却;速率未熔断'
      };
      if (!tkOf(tk.id)) s.tickets.push(tk);
      c.ticketId = tk.id; c.reviewEnd = addMin(s.now, w.DATA.dict.sla.fastlaneReview); c.slaDeadline = c.reviewEnd;
      if (cw) { cw.load++; cw.status = '待接单'; crewMove(cw, c.facility, 'enroute'); }
      hold('机器直派件全量抽审', c.id, '机器直派自动派单件全量抽审(误派率月报口径)');
      banner('info', '机器派单,人复核中:' + c.id + ' 已自动派 ' + (cw ? cw.name : p.crew) + '(工单 ' + tk.id + ');复核员 15 分钟内并行复核,可撤回召回。', 'm1', routeOf('clue', c.id));
      return '自动派单 ' + tk.id + ' → ' + (cw ? cw.name : p.crew) + ':产出紧急工单,不产出告警(定性权仍在人);15 分钟并行复核窗开启';
    },
    function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (c.level !== '紧急') return '非紧急级,不进机器直派';
      if (!s.gov.fastlane[c.kindText] && !s.gov.fastlane['井盖缺失']) return '该类目机器直派开关已关闭';
      if (s.gov.fastlane[c.kindText] === false) return '该类目机器直派开关已关闭(上级主管部门治理),回退人审';
      if (c.checks.some(function (x) { return x.result === 'fail'; })) return '机械校验存在硬失败,不满足双闸硬条件';
      if (c.ticketId) return '本件已有工单,防抖冷却窗内不重复派单';
      return null;
    });

  A.auto_broadcast = autoDef('只读预警广播', '规则引擎副作用:通知值班圈;不定性、不派工',
    function (s, p) {
      banner('amber', '只读预警广播 · ' + (p.scope || '本区') + ':' + p.text, 'global', routeOf('clue', p.clueId) || '#/m1');
      return '只读预警广播 @' + (p.scope || '本区') + ':' + p.text + '(聚合抑制:同点位同时窗合并 · 每收件人每小时上限 · 静默窗)';
    });

  A.auto_review_window = autoDef('并行复核窗开启', '机器直派 15 分钟并行复核;超时走三级升级',
    function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '复核窗:线索不存在';
      c.reviewEnd = addMin(s.now, p.mins || 15); c.slaDeadline = c.reviewEnd;
      return '并行复核窗开启 ' + c.id + ':截止 ' + c.reviewEnd + '(15 分钟,假设值);确认=告警追认,撤回=召回班组;超时→复核员→主管→复核主管(值班)';
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
      c.slaDeadline = addMin(s.now, p.lane === '加急人工' ? w.DATA.dict.sla.urgentReview : w.DATA.dict.sla.sameDay);
      return '车道路由 ' + c.id + ' → 「' + p.lane + '」:低置信且无硬证据不进机器直派;SLA ' +
        (p.lane === '加急人工' ? '30 分钟' : '当日') + '(假设值)+ 三级升级 + 超时只读预警';
    });

  A.auto_mech_reject = autoDef('机械驳回判定', '高危零自动归档:证据卡置顶,转加急人工驳回确认',
    function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '机械驳回:线索不存在';
      c.mechFail = true; c.lane = '机械驳回';
      var bad = c.checks.filter(function (x) { return x.result === 'fail'; }).map(function (x) { return x.name; });
      if (isHigh(c)) {
        c.slaDeadline = addMin(s.now, w.DATA.dict.sla.urgentReview);
        banner('warn', '机械校验硬失败但不自动归档(高危零自动归档):' + c.id + ' 证据卡置顶,转加急人工驳回确认。', 'm1', routeOf('clue', c.id));
        return '机械驳回判定 ' + c.id + ':未过项「' + bad.join(' / ') + '」;高危件不自动归档 → 转加急人工驳回确认';
      }
      c.status = 'rejected'; c.rejectCode = '②';
      return '机械驳回自动归档 ' + c.id + ':未过项「' + bad.join(' / ') + '」;原因码自动填,待核查池抽样兜底(批量车道)';
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
      banner('info', '本批 ' + n + ' 条未经人工:自动升格/记账车道,抽审兜底(抽审入口可点)。', 'm1', '#/m4');
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
      banner('info', 'AI 复验判不出(配准失败):' + t.id + ' 转「存疑待人裁」—— 永不默认打回,由复核员人裁。', 'm1', routeOf('ticket', t.id));
      return 'AI 复验 ' + t.id + ':修复前后配准判不出 → 存疑待人裁(永不默认打回)';
    },
    function (s, p) { var t = tkOf(p.ticketId); if (!t) return '工单不存在'; if (t.state !== '已完工') return '工单未到「已完工」态'; return null; });

  A.auto_overload = autoDef('过载分诊(显名降级)', '入流超容量三步之②:超额件降级进批量加急分诊,件件可抽审',
    function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '过载分诊:线索不存在';
      c.lane = '批量加急分诊(显名降级)'; c.degraded = true;
      c.slaDeadline = addMin(s.now, w.DATA.dict.sla.urgentReview);
      /* R87 A2:辖区零可用班组 = 抢占程序;前两步系统先算好方案,第三步把待裁定卡放到复核主管(值班)面前。
         只写数据不改本步的日志摘要与横幅 —— 主线 auto 行为不变。 */
      openPendingRuling(s, c);
      hold('降级件抽审', c.id, '过载降级件件件可抽审(区别于常态批量确认)');
      banner('warn', '承接池无可派:' + c.id + ' 显名降级进「批量加急分诊」,降级原因入动作日志;复核主管(值班)可启动临时借调 + SLA 延展档。', 'm1', routeOf('clue', c.id));
      return '过载三步 ' + c.id + ':①只读预警先喊现场 ②显名降级进批量加急分诊(件件可抽审)③待复核主管(值班)临时借调/抢占仲裁';
    });

  /* R89 A2 · T10 重做:第二观测源 = 固定相机复扫同点位再报警(市民渠道整条已删)。
     报警本身只是一条观测事件,不产线索、不定性 —— 是否新开线索交归并规则(CL-R01)判。 */
  A.auto_recheck_obs = autoDef('同点位复扫报警(第二观测源)',
    '固定相机 / 车载复扫在同一设施上再次命中:只产观测事件,不产新线索、不定性,交归并规则判去向',
    function (s, p) {
      var c = clueOf(p.clueId);
      return '同点位复扫报警:' + (p.source || '固定相机复扫') + ' @ ' + (p.facility || (c ? c.facility : '')) +
        ' 再次命中(置信 ' + (p.conf === undefined || p.conf === null ? '—' : p.conf) + ')→ 交归并规则 CL-R01 判定并入既有线索还是另开';
    },
    function (s, p) { return clueOf(p.clueId) ? null : '线索不存在:' + (p.clueId || ''); });

  A.auto_dedupe = autoDef('多源同点去重合并', '同设施同类目在保活时长内复现 → 并入既有线索作一次观测,不新开线索;证据叠加、防抖冷却',
    function (s, p) {
      var c = clueOf(p.clueId);
      if (!c) return '去重合并:线索不存在';
      /* R86 A3 / CL-R01:并入 = 给这条线索追加一次观测(不新开线索) */
      var kind = p.kind || w.CLUE_OBS.kind(p.source);
      addObservation(c, {
        t: s.now, source: p.source || '同点位复扫', conf: (p.conf === undefined ? null : p.conf), kind: kind,
        note: p.note || '一处设施上的同类异常并进原线索(CL-R01),不新开一条',
        evidence: (c.evidence || []).slice(0, 1).map(function (e) { return { kind: e.kind, label: e.label, from: kind }; })
      });
      return '多源同点合并:' + (p.source || '同点位复扫') + ' 并入线索 ' + c.id + ' 作第 ' + c.obsCount +
        ' 次观测(来源分布 +1「' + kind + '」);证据叠加,不新开线索;双源竞态收敛';
    },
    function (s, p) { return clueOf(p.clueId) ? null : '线索不存在:' + (p.clueId || ''); });

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

  /* R88 A1⑳ rollback:推翻「模式化升档」那一套(旧 auto_storm_on + auto_storm_tasks 两步合一)。
     气象预警接入只做一件事 —— 起一个雨前清掏专项任务包并下发。
     它是纯计划性任务:不改任何在池件的分级,不改机器直派准入,不改任何 SLA 档。 */
  A.auto_weather_tasks = autoDef('气象预警接入 · 雨前清掏专项任务包',
    '按预警提前量起专项任务包并与客户清掏计划对接;计划性任务,不动在池件分级、不动派单准入标准',
    function (s, p) {
      var r = ruleById('MH-R07');
      var lead = r ? (r.params || []).filter(function (x) { return x.key === 'leadHours'; })[0] : null;
      s.gov.weatherAlert = { level: p.level || '强对流预警', leadHours: lead ? lead.val : 6, t: s.now, taskTicketId: p.ticketId || null };
      var tk = tkOf(p.ticketId);
      if (!tk) { var tpl = w.UNLOCKS.tickets[p.ticketId]; if (tpl) { tk = clone(tpl); tk.createdT = s.now; s.tickets.push(tk); } }
      banner('warn', '气象预警接入:已按预警提前量(' + (lead ? lead.val : 6) + ' 小时,假设值)下发「雨前清掏专项任务包」' +
        (tk ? (tk.id + ' · ' + (tk.summary || '')) : (p.ticketId || '')) +
        ';这是计划性任务 —— 在池件分级不变,派单准入标准不变。', 'global', routeOf('ticket', p.ticketId) || '#/m2/tickets');
      return '气象预警接入(' + (p.level || '强对流预警') + '):起雨前清掏专项任务包 ' + (p.ticketId || '') +
        ' 下发 —— 箅面干净 ≠ 过水能力在(井筒淤积对视觉与液位皆盲),沙漠城市雨前最该查的一件;' +
        '在池件分级不变、机器直派准入不变、SLA 档不变(MH-R07 v2.0)';
    });

  /* R88 A5⑱ · AI 服务的「提出建议」第四落点:抢占第三步的调度建议(方案 + 后果),
     建议不是决定 —— 采纳与否在复核主管(值班)手上,本动作只负责把它记成一条账。 */
  A.dispatch_suggest = autoDef('调度建议(抢占方案)',
    'AI 服务两动作之「提出建议」:辖区零可用班组时算出让位 / 借调方案与后果,交复核主管(值班)裁定;无定性权、无派单权',
    function (s, p) {
      return '调度建议 ' + (p.rulingId || '') + '(线索 ' + (p.clueId || '') + '):' + (p.text || '已生成抢占方案') +
        ';AI 服务只提建议不做决定,采纳 / 改派由复核主管(值班)拍板';
    });

  A.auto_audit_hold = autoDef('拘进抽审', '高危件与自动处置件拘进主管抽审队列',
    function (s, p) { hold('自动拘审', p.clueId || '', p.reason || '高危件拘进主管抽审'); return '拘进主管抽审:' + (p.clueId || '') + ';' + (p.reason || ''); });

  /* ============ R88 A2 · 加急人工超时兜底派单 ============
     与「先派尽派」同源:派单是处置调度,不是定性。加急人工件的人工确认档到期、
     再等一个兜底等待期(三级升级已走完)仍无人给结论 —— 系统把单先发出去,
     告警不成立、定性仍悬,复核员事后补审,件全量拘抽审(自动派不豁免审计)。
     判据条:井盖线 MH-R08 / 路面线 RD-R07,参数区可配。 */
  function overdueRuleOf(line) { return ruleById(line === '路面' ? 'RD-R07' : 'MH-R08'); }
  function paramVal(rule, key, dflt) {
    if (!rule) return dflt;
    var pm = (rule.params || []).filter(function (x) { return x.key === key; })[0];
    return pm ? pm.val : dflt;
  }
  /* 兜底派单的承接方:先取本线空闲班组,没有空闲就取本线在办最少的一个(先派尽派,不压单) */
  function fallbackCrew(s, line) {
    var list = (s.crews || []).filter(function (cw) { return (cw.lines || []).indexOf(line) >= 0; });
    var idle = list.filter(function (cw) { return cw.status === '空闲'; });
    if (idle.length) return idle[0];
    return list.slice().sort(function (a, b) { return (a.load || 0) - (b.load || 0); })[0] || null;
  }

  A.auto_overdue_dispatch = autoDef('超时兜底派单',
    '加急人工件 SLA 到期 + 兜底等待期内三级升级仍无人给结论 → 系统自动派可用班组;告警不成立、定性仍悬,复核员事后补审,件全量拘抽审',
    function (s, p) {
      var c = clueOf(p.clueId);
      var cw = (p.crew ? crewOf(p.crew) : null) || fallbackCrew(s, c.line);
      var tk = {
        id: nextId('WO-', s.tickets), type: c.level === '紧急' ? '紧急工单' : '急修工单',
        clueId: c.id, facility: c.facility, crew: cw ? cw.id : null,
        state: cw ? '已派工' : '待改派', source: w.DATA.dict.ticketSources.overdue,
        createdT: s.now, line: c.line, mirror: 'MUN-WO-' + (77300 + s.tickets.length),
        sla: { accept: addMin(s.now, w.DATA.dict.sla.accept), arrive: addMin(s.now, w.DATA.dict.sla.arrive), done: addMin(s.now, 120) },
        suspended: false, resumeCond: null, photos: [], overdueFallback: true,
        note: '超时兜底派(来源④):加急人工档到期无人审 → 先把单发出去;定性仍悬,复核员事后补审'
      };
      s.tickets.push(tk);
      c.ticketId = tk.id;
      if (cw) p.crew = cw.id;   // R89 A3:兜底选出的承接班组回写,链接层指得到「工单↦班组」
      c.overdueFallback = { ticketId: tk.id, t: s.now, deadline: c.slaDeadline || null, crew: cw ? cw.id : null };
      if (cw) { cw.load++; if (cw.status === '空闲') cw.status = '待接单'; crewMove(cw, c.facility, 'enroute'); }
      hold('超时兜底派单件全量抽审', c.id, '超时兜底自动派件全量拘抽审(自动派不豁免审计);定性仍悬,需复核员补审',
        { kind: '工单', id: tk.id });
      banner('warn', '超时兜底派单:宁可多看一眼,不漏掉 —— ' + c.id + '(' + (c.kindText || '') + ' · ' + (c.block || '') + ' ' + c.facility +
        ')人工确认档已过仍无人给结论,系统已自动派 ' + (cw ? cw.name : '(无可用班组,进待改派)') + '(工单 ' + tk.id +
        ');告警仍未成立、定性仍悬,请复核员补审。', 'm1', routeOf('clue', c.id));
      return '超时兜底派单 ' + c.id + ' → ' + (cw ? cw.name : '(无可用班组,单进待改派队列)') + '(工单 ' + tk.id + '):' +
        '人工确认档截止 ' + (c.slaDeadline || '—') + ' 已过、三级升级走完仍无结论 → 先派后审;' +
        '告警未成立、定性仍悬,复核员事后补审;件全量拘抽审';
    },
    function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (c.lane !== '加急人工') return '仅「加急人工」车道在池件适用超时兜底(当前车道:' + (c.lane || '—') + ')';
      if (c.status !== 'open') return '线索非「待核查」态,不需兜底';
      if (c.ticketId) return '本件已有工单 ' + c.ticketId + ',不重复派单';
      if (!c.slaDeadline) return '本件无人工确认档截止点';
      if (slaDiff(c.slaDeadline) >= 0) return '人工确认档未到期(截止 ' + c.slaDeadline + ')';
      return null;
    });

  /* 每次假时钟步进时扫一遍在池的加急人工件:过了「SLA 截止 + 兜底等待」还没人给结论就自动兜底。
     ⚠ 今夜主线(T1-T12,推到 21:30)上没有件跨过这条线 —— 叙事不被随机打断;
        专置演示件 CL-0333(18:50 到期)可由导览支线直调 S.commit('auto_overdue_dispatch', { clueId: 'CL-0333' }) 演示。 */
  function sweepOverdue() {
    (state.clues || []).slice().forEach(function (c) {
      if (c.lane !== '加急人工' || c.status !== 'open' || c.ticketId || !c.slaDeadline) return;
      var grace = paramVal(overdueRuleOf(c.line), 'graceMin', 180);
      if (slaDiff(c.slaDeadline) > -grace) return;
      doCommit('auto_overdue_dispatch', { actor: '规则引擎', clueId: c.id }, true);
    });
  }

  /* ============================================================
     R86 增补动作族(A2 规则参数 / A5 支线 / A9 横幅)
     铁律不变:全部走 S.commit,每次一条动作日志;这些动作 **不进 SCENARIO 主线 auto**,
     主线 T1-T12 行为零变化,只供导览支线与页面按钮直调。
     ============================================================ */

  function ruleById(id) {
    var rs = w.RULES || [];
    for (var i = 0; i < rs.length; i++) if (rs[i].id === id) return rs[i];
    return null;
  }

  /* ============ R87 A2 · 抢占第三步的待裁定卡 ============
     先派尽派的另一面:辖区真的一个能接单的班组都没有时,系统不把单压着等人想办法,
     而是把前两步(在办件让位 / 跨班组借调)算好的结果连同后果一起交到复核主管(值班)手上,
     复核主管(值班)只做「采纳」(= preempt_arbitrate)或「改派」。 */
  var TICKET_PRIORITY = {
    '养护批量工单': 1, '设备工单': 1, '传感器复检工单': 1, '雨前专项任务': 2, '核查任务': 2,
    '管网维修工单': 3, '急修工单': 3, '紧急工单': 4
  };
  function yieldCandidate(s) {
    var cand = (s.tickets || []).filter(function (t) {
      return t.crew && !t.suspended && ['已派工', '已接单', '已到场'].indexOf(t.state) >= 0;
    });
    cand.sort(function (a, b) { return (TICKET_PRIORITY[a.type] || 2) - (TICKET_PRIORITY[b.type] || 2); });
    return cand[0] || null;
  }
  function borrowCandidates(s, line) {
    var need = line === '井盖' ? '密闭空间作业' : (line === '管网' ? '带压作业' : null);
    return (s.crews || []).filter(function (cw) {
      if ((cw.lines || []).indexOf(line) >= 0) return false;           // 本线的不叫借调
      return !need || (cw.quals || []).indexOf(need) >= 0;
    });
  }
  function openPendingRuling(s, c) {
    if (!s.pendingRulings) s.pendingRulings = [];
    var dup = s.pendingRulings.filter(function (x) { return x.clueId === c.id && x.status === '待裁定'; })[0];
    if (dup) return dup;
    var yt = yieldCandidate(s);
    var cw = yt && yt.crew ? crewOf(yt.crew) : null;
    var borrow = borrowCandidates(s, c.line);
    var pr = {
      id: 'RL-' + (100 + s.pendingRulings.length), t: s.now, status: '待裁定',
      /* R88 A5⑱:方案是 AI 服务算的 —— 卡上标源头,日志里也留一条(AI 两动作之「提出建议」第四落点) */
      suggestedBy: 'AI 服务',
      clueId: c.id, facility: c.facility, block: c.block, line: c.line, level: c.level, topic: c.kindText,
      step: '第三步 · 复核主管(值班)裁定',
      tried: [
        { no: 1, name: '在办件让位', result: yt ? ('可让位:' + yt.id + '(' + yt.type + ',承办 ' + (cw ? cw.name : '—') + ')') : '辖区内没有可让位的在办件' },
        { no: 2, name: '跨班组借调', result: borrow.length ? ('可借调:' + borrow.map(function (x) { return x.name; }).join(' / ')) : '相邻责任区与相邻班次都没有持证可胜任的班组' }
      ],
      proposal: {
        action: 'preempt_arbitrate', crew: cw ? cw.id : null, crewName: cw ? cw.name : null,
        yieldTicketId: yt ? yt.id : null,
        text: cw ? ('挂起 ' + yt.id + ' 让位,指派 ' + cw.name + ' 接 ' + c.id + '(' + c.kindText + ' · ' + (c.block || '') + ' ' + c.facility + ')')
          : ('辖区无可让位班组:建议向相邻区借调后再指派 ' + c.id)
      },
      consequence: [
        yt ? ('被让位的 ' + yt.id + ' 停表并回队重派,完工时间往后推;班组白跑段不计考核') : '无在办件被打断',
        cw ? (cw.name + ' 当前在办 ' + cw.load + ' 件,采纳后 ' + (cw.load + 1) + ' 件,派单时按在办上限标黄提醒') : '需先完成借调才能指派',
        '不采纳:' + c.id + ' 留在批量加急分诊,按延展档计时,件件可抽审'
      ],
      alts: [
        { text: '改派其他班组(理由码必填)', action: 'dispatch_manual' },
        { text: '维持降级分诊,等下一班次', action: null }
      ]
    };
    s.pendingRulings.push(pr);
    /* R88 A5⑱:建议本身也是一条动作 —— AI 服务提出建议,记账不豁免(机械与模型都不豁免审计)。
       只发日志不发横幅:醒目横幅与调度视图置顶卡由渲染层从 S.pendingRulings() 出。 */
    doCommit('dispatch_suggest', {
      actor: 'AI 服务', rulingId: pr.id, clueId: c.id,
      crew: pr.proposal.crew, yieldTicketId: pr.proposal.yieldTicketId, text: pr.proposal.text
    }, true);
    return pr;
  }

  /* ---- A9 · 横幅关闭 ---- */
  A.banner_dismiss = {
    label: '关闭提示', actors: ['*'], hint: '关闭该条横幅(入 state.dismissed;重置数据后回来)', quiet: true,
    v: function (s, p) {
      if (!p.bannerId) return '未指定横幅';
      var b = byId(s.banners, p.bannerId); if (!b) return '横幅不存在';
      if (b.dismissible === false) return '该横幅不可关闭';
      if ((s.dismissed || []).indexOf(p.bannerId) >= 0) return '该横幅已关闭';
      return null;
    },
    run: function (s, p) {
      s.dismissed.push(p.bannerId);
      return '关闭提示 ' + p.bannerId + '(只在本次演示会话内隐藏,重置数据后回来)';
    }
  };

  /* ---- A2 · 规则参数变更(影子试算语义:记日志、标 shadow,不改运行判定)---- */
  A.rule_param_change = {
    label: '规则参数变更(影子试算)', actors: ['复核主管', '上级主管部门'],
    hint: '改参数走影子试算:留痕 + 试算影响面,不改当前运行判定;正式生效需审批',
    v: function (s, p, actor) {
      var r = ruleById(p.ruleId); if (!r) return '规则不存在:' + (p.ruleId || '');
      if (!p.key) return '未指定参数项';
      var pm = (r.params || []).filter(function (x) { return x.key === p.key; })[0];
      if (!pm && !(p.key === 'promptTpl' && r.promptTpl)) return '本条规则无参数项「' + p.key + '」';
      if (p.val === undefined || p.val === null || p.val === '') return '未填写新值';
      if ((r.editableBy || []).indexOf(actor) < 0) return '本条规则参数变更权在:' + (r.editableBy || []).join(' / ');
      return null;
    },
    run: function (s, p, actor) {
      var r = ruleById(p.ruleId);
      var pm = (r.params || []).filter(function (x) { return x.key === p.key; })[0]
        || (p.key === 'promptTpl' ? { key: 'promptTpl', label: '复验提示词模板', val: r.promptTpl, unit: '' } : null);
      if (!s.ruleParams[r.id]) s.ruleParams[r.id] = {};
      s.ruleParams[r.id][p.key] = { val: p.val, by: actor, t: s.now, shadow: true };
      s.ruleShadow.push({
        id: 'SH-' + (100 + s.ruleShadow.length), ruleId: r.id, key: p.key, label: pm.label,
        from: pm.val, to: p.val, unit: pm.unit || '', by: actor, t: s.now, reason: p.reason || '', status: '影子试算(未生效)'
      });
      s.paramChanges.push({
        id: 'PC-' + (100 + s.paramChanges.length), item: r.id + ' · ' + pm.label,
        from: pm.val + (pm.unit || ''), to: p.val + (pm.unit || ''),
        status: '影子试算(未生效)', by: actor, note: '假设值;正式变更需审批,按试点数据标定'
      });
      return '规则参数影子试算 ' + r.id + '「' + pm.label + '」:' + pm.val + (pm.unit || '') + ' → ' + p.val + (pm.unit || '') +
        ';仅留痕与试算,当前运行判定不变(正式生效需审批)';
    }
  };

  /* ---- A5 · 管网支线:核查任务包 → 现场确认渗漏 → 转维修 → 复验回归 → 结案归档 ---- */
  A.pl_survey_start = {
    label: '开核查任务包', actors: ['区复核员', '复核主管'],
    hint: '立案后的定位主手段:听漏 + 分段关阀试验,按段收敛嫌疑区间',
    v: function (s, p) {
      var k = caseOf(p.caseId); if (!k) return '调查案不存在';
      if (k.status !== '已立案') return '需先「立案」再开核查任务包';
      if (k.phase === '核查中') return '核查任务包已开';
      return null;
    },
    run: function (s, p) {
      var k = caseOf(p.caseId);
      k.phase = '核查中';
      k.survey = { t: s.now, methods: ['夜间听漏', '分段关阀试验'], segments: 4, done: 0, segs: surveySegs(4) };
      (k.caseLog = k.caseLog || []).push({ t: s.now, txt: '开核查任务包:夜间听漏 + 分段关阀试验(4 段)' });
      return '开核查任务包 ' + k.id + '(' + k.dma + '):夜间听漏 + 分段关阀试验分 4 段推进,按段收敛嫌疑区间';
    }
  };

  /* R89 A4⑧ · 现场关阀试验数据回传:班组端在管网核查工单上按段回传关阀前 / 后流量读数。
     写回 investigation.survey 对应段(done=true + 两个读数),与拍照回传并行,不互相替代。 */
  A.survey_report = {
    label: '回传试验数据', actors: ['班组账号'],
    hint: '分段关阀试验:选段 + 关阀前/后流量读数;写回核查任务包对应段,读数差进 P2 数据卡',
    v: function (s, p) {
      var k = caseOf(p.caseId); if (!k) return '调查案不存在';
      if (!k.survey) return '本案未开核查任务包,无可回传的试验段';
      var no = parseInt(p.seg, 10);
      if (!no || no < 1 || no > (k.survey.segs || []).length) return '未选择有效试验段(1-' + (k.survey.segs || []).length + ')';
      var sg = k.survey.segs[no - 1];
      if (sg.done) return '第 ' + no + ' 段已回传(关阀前 ' + sg.preFlow + ' / 关阀后 ' + sg.postFlow + ')';
      if (p.preFlow === undefined || p.preFlow === null || p.preFlow === '') return '关阀前流量读数必填';
      if (p.postFlow === undefined || p.postFlow === null || p.postFlow === '') return '关阀后流量读数必填';
      if (isNaN(parseFloat(p.preFlow)) || isNaN(parseFloat(p.postFlow))) return '流量读数须为数字(m³/h)';
      return null;
    },
    run: function (s, p, actor) {
      var k = caseOf(p.caseId), no = parseInt(p.seg, 10), sg = k.survey.segs[no - 1];
      var pre = parseFloat(p.preFlow), post = parseFloat(p.postFlow);
      sg.done = true; sg.preFlow = pre; sg.postFlow = post; sg.note = p.note || ''; sg.t = s.now; sg.by = actor;
      k.survey.done = k.survey.segs.filter(function (x) { return x.done; }).length;
      var drop = Math.round((pre - post) * 100) / 100;
      (k.caseLog = k.caseLog || []).push({
        t: s.now, txt: '第 ' + no + ' 段关阀试验数据回传:关阀前 ' + pre + ' m³/h → 关阀后 ' + post + ' m³/h(落差 ' + drop + ')'
      });
      return '回传试验数据 ' + k.id + ' 第 ' + no + ' 段:关阀前 ' + pre + ' m³/h → 关阀后 ' + post + ' m³/h(落差 ' + drop +
        ');本段标完成(' + k.survey.done + '/' + k.survey.segs.length + '),读数进核查数据卡,嫌疑区间按段收敛' +
        (p.note ? ';现场备注「' + p.note + '」' : '');
    }
  };

  A.pl_leak_confirm = {
    label: '现场确认渗漏', actors: ['区复核员', '复核主管', '班组账号'],
    hint: '现场核查定性:确认渗漏点与管段;定性权在人,AI 判型只作嫌疑排序',
    v: function (s, p) {
      var k = caseOf(p.caseId); if (!k) return '调查案不存在';
      if (k.phase !== '核查中') return '需先开核查任务包';
      if (!p.segment) return '未填写确认管段';
      return null;
    },
    run: function (s, p) {
      var k = caseOf(p.caseId);
      k.phase = '渗漏确认'; k.leak = { segment: p.segment, t: s.now, note: p.note || '' };
      (k.caseLog = k.caseLog || []).push({ t: s.now, txt: '现场确认渗漏:' + p.segment });
      return '现场确认渗漏 ' + k.id + ':管段「' + p.segment + '」确认渗漏;调查案由「嫌疑」转「确认」,可转维修工单';
    }
  };

  A.pl_to_repair = {
    label: '转维修工单', actors: ['区复核员', '复核主管'],
    hint: '确认渗漏后开维修工单(带压作业);调查案不关,等复验回归',
    v: function (s, p) {
      var k = caseOf(p.caseId); if (!k) return '调查案不存在';
      if (k.phase !== '渗漏确认') return '需先现场确认渗漏';
      if (k.repairTicketId) return '维修工单已开:' + k.repairTicketId;
      return null;
    },
    run: function (s, p) {
      var k = caseOf(p.caseId);
      var tk = {
        id: nextId('WO-', s.tickets), type: '管网维修工单', clueId: null, facility: k.facility, crew: p.crew || 'CR-04',
        state: '已派工', source: w.DATA.dict.ticketSources.human, createdT: s.now, line: '管网',
        mirror: 'MUN-WO-' + (77300 + s.tickets.length),
        sla: { accept: addMin(s.now, 10), arrive: addMin(s.now, 60), done: addMin(s.now, 300) },
        suspended: false, photos: [], note: '渗漏确认后的维修处置(带压作业);复验=流量回归基线,不是照片'
      };
      s.tickets.push(tk); k.repairTicketId = tk.id; k.phase = '维修中';
      p.crew = tk.crew;       // R89 A3:承接班组回写(默认 CR-04 时链接层也指得到)
      var cw = crewOf(tk.crew); if (cw) { cw.load++; if (cw.status === '空闲') cw.status = '待接单'; }
      (k.caseLog = k.caseLog || []).push({ t: s.now, txt: '转维修工单 ' + tk.id });
      return '转维修工单 ' + k.id + ' → ' + tk.id + '(' + (cw ? cw.name : tk.crew) + ');调查案不关,等复验流量回归';
    }
  };

  A.pl_verify_ok = {
    label: '复验回归', actors: ['区复核员', '复核主管'],
    hint: '管网线复验 = 流量回归基线验证(非照片);回归后绿标亮',
    v: function (s, p) {
      var k = caseOf(p.caseId); if (!k) return '调查案不存在';
      if (k.phase !== '维修中') return '需先转维修工单并完成处置';
      return null;
    },
    run: function (s, p) {
      var k = caseOf(p.caseId);
      k.phase = '复验通过'; k.flowGreen = true; k.verifiedT = s.now;
      (k.caseLog = k.caseLog || []).push({ t: s.now, txt: '复验:水量平衡偏差回落至阈值内,绿标点亮' });
      return '复验回归 ' + k.id + '(' + k.dma + '):水量平衡偏差回落至阈值内(PL-R05 假设值),绿标点亮 → 可人签字结案';
    }
  };

  A.pl_close = {
    label: '结案归档', actors: ['复核主管'],
    hint: '人签字结案 + 归档:证据链与规则版本一并留痕',
    v: function (s, p) {
      var k = caseOf(p.caseId); if (!k) return '调查案不存在';
      if (!k.flowGreen) return '流量未回归基线(绿标未亮),不可结案';
      if (k.archived) return '该调查案已归档';
      return null;
    },
    run: function (s, p, actor) {
      var k = caseOf(p.caseId);
      k.status = '已结案'; k.phase = '已归档'; k.archived = true; k.closedT = s.now;
      k.ruleVer = w.DATA.meta.ruleVer;
      (k.caseLog = k.caseLog || []).push({ t: s.now, txt: '人签字结案并归档(' + actor + ');规则版本 ' + k.ruleVer });
      return '结案归档 ' + k.id + ':' + actor + ' 签字结案,证据链与规则版本 ' + k.ruleVer + ' 一并归档';
    }
  };

  /* ---- A5 · 井盖支线:人工确认闭环 / 误报原因回流 ---- */
  A.mh_confirm_close = {
    label: '人工确认闭环', actors: ['区复核员', '复核主管'],
    hint: 'AI 复验存疑时由人裁闭环,闭环同时留痕当时的规则版本',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (t.state !== '已完工') return '工单未到「已完工」态';
      return null;
    },
    run: function (s, p, actor) {
      var t = tkOf(p.ticketId);
      t.state = '已验收'; t.verify = '人工确认闭环(人裁合格)';
      t.closeRuleVer = w.DATA.meta.ruleVer; t.closedBy = actor; t.closedT = s.now;
      var cw = t.crew ? crewOf(t.crew) : null; if (cw) { cw.status = '空闲'; cw.load = Math.max(0, cw.load - 1); }
      var c = t.clueId ? clueOf(t.clueId) : null; if (c) c.closed = true;
      return '人工确认闭环 ' + t.id + ':' + actor + ' 人裁合格 → 「已验收」;归档留痕规则版本 ' + t.closeRuleVer;
    }
  };

  A.fp_feedback = {
    label: '误报原因回流', actors: ['区复核员', '复核主管'],
    hint: '驳回件按原因码回流各自消费者;命中规则项的回流进规则参数调优候选',
    v: function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (c.status !== 'rejected') return '仅已驳回件可做原因回流';
      if (!p.code && !c.rejectCode) return '缺原因码';
      return null;
    },
    run: function (s, p, actor) {
      var c = clueOf(p.clueId), code = p.code || c.rejectCode;
      var def = w.DATA.dict.rejectCodes.filter(function (r) { return r.code === code || r.name === code; })[0];
      var fb = {
        id: 'FB-' + (100 + s.feedbacks.length), clueId: c.id, code: code,
        name: def ? def.name : '', to: def ? def.to : '人工周审',
        ruleId: p.ruleId || null, by: actor, t: s.now, note: p.note || ''
      };
      s.feedbacks.push(fb);
      banner('info', '误报原因回流:' + c.id + '(' + (def ? def.code + ' ' + def.name : code) + ')→ ' +
        fb.to + (fb.ruleId ? ',关联规则 ' + fb.ruleId + ' 进参数调优候选' : '') + '。', 'm1', fb.ruleId ? '#/m6' : routeOf('clue', c.id));
      return '误报原因回流 ' + fb.id + ':' + c.id + ' 按原因码「' + (def ? def.name : code) + '」回流「' + fb.to + '」' +
        (fb.ruleId ? ';关联规则 ' + fb.ruleId + ' 进参数调优候选(改参数走影子试算)' : '');
    }
  };

  /* ---- 提级 = 复核主管主动做的显名动作,原因必填(R88 A1⑬ 已推翻「按计数自动提级」那条;
     R89 A2 后市民渠道整条不在系统内,提级的输入只剩现场与观测证据)。---- */
  A.clue_escalate = {
    label: '提级', actors: ['复核主管'],
    hint: '主管主动把养护 / 观察件提为急修:原因必填,显名留痕;提级是人做的动作,不是系统按计数自动定性',
    v: function (s, p) {
      var c = p.clueId ? clueOf(p.clueId) : null;
      if (!c) return '线索不存在(需 clueId)';
      if (c.status !== 'open') return '线索非「待核查」态,不再提级';
      if (c.level === '急修' || c.level === '紧急') return '已在最高档(' + c.level + '),无可提级';
      if (!p.reason) return '提级原因必填(进动作日志,可回查)';
      return null;
    },
    run: function (s, p, actor) {
      var c = clueOf(p.clueId), from = c.level;
      c.level = '急修';
      c.escalate = { from: from, to: '急修', by: actor, t: s.now, reason: p.reason };
      if (['批量半审', '记账', '批量', '自动升格'].indexOf(c.lane) >= 0) c.lane = '单条必审';
      c.slaDeadline = addMin(s.now, w.DATA.dict.sla.urgentReview);
      banner('amber', '线索提级:' + c.id + '(' + (c.kindText || '') + ' · ' + (c.block || '') + ' ' + c.facility + ')由「' + from +
        '」提为「急修」,提级人 ' + actor + ',原因「' + p.reason + '」,留痕可回查。', 'm1', routeOf('clue', c.id));
      return '提级 ' + c.id + ':' + from + ' → 急修;原因「' + p.reason + '」;车道转「' + c.lane +
        '」,SLA 按急修档重算;提级是人做的显名动作,不是系统自动定性';
    }
  };

  A.rd_spot_check = {
    label: '完工抽查', actors: ['复核主管'],
    hint: '批量养护完工件按比例现场抽查;抽查结果进班组考核与规则评估',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (t.state !== '已完工' && t.state !== '已验收') return '工单未到「已完工」态';
      if (t.spotCheck) return '该单已抽查:' + t.spotCheck.result;
      return null;
    },
    run: function (s, p, actor) {
      var t = tkOf(p.ticketId);
      t.spotCheck = { result: p.result || '合格', by: actor, t: s.now, note: p.note || '' };
      hold('完工抽查', t.clueId || '', '批量养护完工件抽查(工单 ' + t.id + ')', { kind: '工单', id: t.id });
      return '完工抽查 ' + t.id + ':结果「' + t.spotCheck.result + '」;进班组考核与规则评估统计,抽查记录入动作日志';
    }
  };

  /* ---- A5 · 抢占调度三步(让位 / 借调 / 人裁;auto_overload 只做②显名降级,三步由人逐级执行)---- */
  A.preempt_yield = {
    label: '抢占①让位', actors: ['复核主管'],
    hint: '占用中最低优先级件让位:原单挂起,SLA 停表,条件解除后回队重派',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (t.suspended) return '该单已处于挂起态';
      if (!t.crew) return '该单无在办班组,无需让位';
      return null;
    },
    run: function (s, p, actor) {
      var t = tkOf(p.ticketId);
      t.stateBeforeSuspend = t.state;
      t.suspended = true; t.suspendReason = '抢占调度'; t.suspendT = s.now; t.yieldedTo = p.forClueId || null;
      t.resumeCond = resumeCondOf('抢占调度', s.now);
      var cw = t.crew ? crewOf(t.crew) : null;
      if (cw) { cw.status = '空闲'; cw.load = Math.max(0, cw.load - 1); crewMove(cw, null, 'free'); t.crewReleased = true; }
      banner('amber', '抢占①让位:' + t.id + ' 因高优先级件让位挂起,SLA 停表;等「' + t.resumeCond.cond + '」(' + t.resumeCond.owner + '),或由复核主管(值班)强制回队重派。', 'm2', routeOf('ticket', t.id));
      return '抢占①让位 ' + t.id + ':' + actor + ' 判定该单优先级最低 → 挂起让位' +
        (p.forClueId ? '(为 ' + p.forClueId + ' 腾班组)' : '') + ';班组 ' + (cw ? cw.name : '—') + ' 释放,SLA 停表';
    }
  };

  A.preempt_borrow = {
    label: '抢占②跨班组借调', actors: ['复核主管'],
    hint: '本线无人可派时跨线借调;借调资质不符者不进候选(DP-R02 硬性持证)',
    v: function (s, p) {
      var cw = crewOf(p.crew); if (!cw) return '班组不存在';
      if (!p.line) return '未指定借调去哪条线';
      if (p.line === '井盖' && (cw.quals || []).indexOf('密闭空间作业') < 0) return '借调井盖线需「密闭空间作业」持证(DP-R02)';
      if (p.line === '管网' && (cw.quals || []).indexOf('带压作业') < 0) return '借调管网线需「带压作业」持证(DP-R02)';
      if (!p.reason) return '借调理由必填';
      return null;
    },
    run: function (s, p, actor) {
      var cw = crewOf(p.crew);
      if ((cw.lines || []).indexOf(p.line) < 0) cw.lines.push(p.line);
      cw.borrowed = { line: p.line, by: actor, t: s.now, reason: p.reason };
      return '抢占②跨班组借调 ' + cw.name + ' → 「' + p.line + '」线:理由「' + p.reason + '」;持证核验通过(DP-R02),借调期入动作日志';
    }
  };

  A.preempt_arbitrate = {
    label: '抢占③复核主管(值班)人裁', actors: ['复核主管'],
    hint: '前两步不解时升复核主管(值班)人裁:显名指派,理由入日志,件件可抽审',
    v: function (s, p) {
      var c = clueOf(p.clueId); if (!c) return '线索不存在';
      if (!p.crew || !crewOf(p.crew)) return '未选择承接班组';
      if (!p.reason) return '人裁理由必填';
      if (c.ticketId) return '本件已有工单 ' + c.ticketId + ',不重复派单';
      return null;
    },
    run: function (s, p, actor) {
      var c = clueOf(p.clueId), cw = crewOf(p.crew);
      var tk = {
        id: nextId('WO-', s.tickets), type: '紧急工单', clueId: c.id, facility: c.facility, crew: p.crew,
        state: '已派工', source: w.DATA.dict.ticketSources.human, createdT: s.now, line: c.line,
        mirror: 'MUN-WO-' + (77300 + s.tickets.length),
        sla: { accept: addMin(s.now, w.DATA.dict.sla.accept), arrive: addMin(s.now, w.DATA.dict.sla.arrive), done: addMin(s.now, 120) },
        suspended: false, photos: [], note: '抢占③复核主管(值班)人裁指派(来源② 人确认派);理由「' + p.reason + '」'
      };
      s.tickets.push(tk); c.ticketId = tk.id; c.degraded = false;
      cw.load++; cw.status = '待接单'; crewMove(cw, c.facility, 'enroute');
      /* R87 A2:执行本动作 = 采纳待裁定卡上的建议方案;
         建议若含「在办件让位」,采纳即执行让位挂起(幂等:O 支线已单独走过 preempt_yield 则跳过)。 */
      (s.pendingRulings || []).forEach(function (x) {
        if (x.clueId === c.id && x.status === '待裁定') {
          x.status = '已采纳'; x.adoptedBy = actor; x.adoptedT = s.now; x.adoptedCrew = cw.id; x.adoptedTicketId = tk.id;
          var yt = x.proposal && x.proposal.yieldTicketId ? tkOf(x.proposal.yieldTicketId) : null;
          if (yt && !yt.suspended && yt.crew) {
            yt.stateBeforeSuspend = yt.state;
            yt.suspended = true; yt.suspendReason = '抢占调度'; yt.suspendT = s.now; yt.yieldedTo = c.id;
            yt.resumeCond = resumeCondOf('抢占调度', s.now);
            var ycw = crewOf(yt.crew);
            if (ycw && ycw.id !== cw.id) { ycw.status = '空闲'; ycw.load = Math.max(0, ycw.load - 1); crewMove(ycw, null, 'free'); yt.crewReleased = true; }
            else if (ycw) { ycw.load = Math.max(0, ycw.load - 1); yt.crewReleased = true; }
            banner('amber', '抢占让位:' + yt.id + ' 随人裁采纳挂起,SLA 停表;等「' + yt.resumeCond.cond + '」(' + yt.resumeCond.owner + '),或强制回队重派。', 'm2', routeOf('ticket', yt.id));
          }
        }
      });
      hold('抢占人裁件抽审', c.id, '抢占调度人裁指派件件可抽审');
      banner('info', '抢占③人裁:' + c.id + ' 由 ' + actor + ' 指派 ' + cw.name + '(工单 ' + tk.id + '),理由入动作日志。', 'm2', routeOf('ticket', tk.id));
      return '抢占③复核主管(值班)人裁 ' + c.id + ' → ' + cw.name + '(工单 ' + tk.id + '):理由「' + p.reason + '」;显名指派,件件可抽审';
    }
  };

  /* ============================================================
     R87 增补动作族(A1 误报申诉两动作 / A2 挂起两个出口 / A8 抽审两结论)
     铁律不变:全部走 S.commit,每次一条动作日志;这些动作 **不进 SCENARIO 主线 auto**,
     主线 T1-T12 行为零变化,只供页面按钮与导览支线直调。
     ============================================================ */

  /* ---- A1 · 并行复核窗过后的第三条纠错道:误报申诉 → 主管裁定 ---- */
  A.misfire_appeal = {
    label: '误报申诉', actors: ['区复核员'],
    hint: '复核窗过后的纠错道:对已成立的告警提「判定异常」,交主管裁定;记录留痕不删',
    v: function (s, p) {
      var al = byId(s.alerts, p.alertId); if (!al) return '告警不存在';
      if (al.status !== '成立') return '仅「成立」态告警可提误报申诉(当前:' + al.status + ')';
      var c = al.clueId ? clueOf(al.clueId) : null;
      if (c && c.reviewEnd && slaDiff(c.reviewEnd) >= 0) return '并行复核窗未过(截止 ' + c.reviewEnd + '):窗内请用「机器直派撤回」召回班组';
      if (!p.reason) return '申诉理由码必填(传感器读数存疑 / AI 判定存疑 / 现场核实无异常 / 同点位重复报警)';
      return null;
    },
    run: function (s, p, actor) {
      var al = byId(s.alerts, p.alertId);
      al.status = '申诉复核中';
      al.appeal = { by: actor, t: s.now, reason: p.reason, note: p.note || '' };
      banner('warn', '误报申诉待裁定:' + al.id + '(' + al.facility + ')理由「' + p.reason + '」—— 复核主管(值班)裁定后才改状态。', 'm2', routeOf('alert', al.id));
      return '误报申诉 ' + al.id + ':' + actor + ' 提出「' + p.reason + '」→ 告警转「申诉复核中」;原记录不删,待主管裁定';
    }
  };

  A.misfire_ruling = {
    label: '误报裁定', actors: ['复核主管'],
    hint: '裁定申诉是否成立:成立 → 告警置「误报撤销」+ 班组白跑不计考核 + 误报原因回流 + 开传感器复检工单',
    v: function (s, p) {
      var al = byId(s.alerts, p.alertId); if (!al) return '告警不存在';
      if (al.status !== '申诉复核中') return '该告警没有待裁定的误报申诉';
      if (typeof p.upheld !== 'boolean') return '需给出裁定结论(申诉成立 / 申诉不成立)';
      return null;
    },
    run: function (s, p, actor) {
      var al = byId(s.alerts, p.alertId);
      var c = al.clueId ? clueOf(al.clueId) : null;
      al.ruling = { by: actor, t: s.now, upheld: !!p.upheld, note: p.note || '' };
      if (!p.upheld) {
        al.status = '成立';
        banner('info', '误报申诉不成立:' + al.id + ' 维持原判,告警回「成立」;裁定说明入动作日志。', 'm2', routeOf('alert', al.id));
        return '误报裁定 ' + al.id + ':申诉不成立,维持告警成立(裁定人 ' + actor + ')' + (p.note ? ';说明「' + p.note + '」' : '');
      }
      al.status = '误报撤销'; al.misfire = true; al.voidT = s.now; al.voidBy = actor;
      var out = [];
      /* ① 线索侧:定性推翻,留痕不删;② 按原因码走与驳回件同一条回流通道 */
      var code = p.code || '④';
      if (c) {
        var def = w.DATA.dict.rejectCodes.filter(function (r) { return r.code === code || r.name === code; })[0];
        c.status = 'rejected'; c.rejectCode = code;
        c.misfireVoided = { alertId: al.id, by: actor, t: s.now, reason: (al.appeal || {}).reason || '' };
        s.feedbacks.push({
          id: 'FB-' + (100 + s.feedbacks.length), clueId: c.id, code: code,
          name: def ? def.name : '', to: def ? def.to : '人工周审', ruleId: p.ruleId || null,
          by: actor, t: s.now, note: '误报申诉裁定成立后回流(与驳回件同一条通道)'
        });
        out.push('线索 ' + c.id + ' 定性推翻,按原因码 ' + code + ' 回流「' + (def ? def.to : '人工周审') + '」');
      }
      /* ③ 工单侧:班组白跑不计考核 */
      var tk = c && c.ticketId ? tkOf(c.ticketId) : null;
      if (tk) {
        tk.kpiExempt = { by: actor, t: s.now, reason: '告警误报撤销,班组白跑段不计考核' };
        out.push('工单 ' + tk.id + ' 标「白跑不计考核」');
      }
      /* ④ 设施侧:开传感器复检工单(灰档:设备侧核查,不计业务处置指标) */
      var sns = (s.sensors || []).filter(function (x) { return x.facility === al.facility; });
      var rk = {
        id: nextId('WO-', s.tickets), type: '传感器复检工单', clueId: null, facility: al.facility, crew: null,
        state: '已派工', source: w.DATA.dict.ticketSources.plan, createdT: s.now, line: al.line,
        mirror: 'MUN-WO-' + (77300 + s.tickets.length),
        sla: { accept: addMin(s.now, 60), arrive: addMin(s.now, 240), done: addMin(s.now, 600) },
        suspended: false, resumeCond: null, photos: [],
        grade: '灰档', greyNote: '设备侧核查任务,不计入业务处置指标与班组考核',
        sensors: sns.map(function (x) { return x.id; }),
        note: '误报撤销后的传感器复检(承接方=传感网运维方);查读数漂移、安装位移与标定'
      };
      rk.summary = summaryOf(rk, s);
      s.tickets.push(rk);
      p.recheckTicketId = rk.id;   // R89 A3:复检工单 id 回写
      sns.forEach(function (x) { x.recheck = { ticketId: rk.id, t: s.now, by: actor }; });
      out.push('开传感器复检工单 ' + rk.id + '(灰档)');
      banner('info', '误报撤销:' + al.id + '(' + al.facility + ')告警状态置「误报撤销」,记录保留;' + out.join(';') + '。', 'm2', routeOf('alert', al.id));
      return '误报裁定 ' + al.id + ':' + actor + ' 判申诉成立 → 告警「误报撤销」(留痕不删);' + out.join(';');
    }
  };

  /* ---- A2 · 挂起件的两个出口 ---- */
  A.crew_resume = {
    label: '条件解除,恢复作业', actors: ['班组账号'],
    hint: '挂起件出口一:现场条件已解除,班组自行恢复作业;SLA 接着算,不重新起算',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (!t.suspended) return '该单未处于挂起态';
      if (!t.crew) return '该单已释放班组,须由复核主管(值班)「强制回队重派」';
      return null;
    },
    run: function (s, p, actor) {
      var t = tkOf(p.ticketId);
      var back = t.stateBeforeSuspend || '已到场';
      var cond = t.resumeCond ? t.resumeCond.cond : (t.suspendReason || '挂起原因');
      var stop = t.suspendT ? (toMin(s.now) - toMin(t.suspendT)) : 0;
      if (stop < 0) stop += 1440;
      t.suspended = false; t.state = back; t.resumedT = s.now;
      t.resumeHistory = (t.resumeHistory || []).concat([{ t: s.now, by: actor, way: '班组报条件解除', cond: cond, stopMin: stop }]);
      t.resumeCond = null;
      var cw = t.crew ? crewOf(t.crew) : null;
      if (cw) {
        if (t.crewReleased) { cw.load++; t.crewReleased = false; }
        cw.status = (back === '已到场' ? '到场' : '在途');
        crewMove(cw, t.facility, back === '已到场' ? 'arrive' : 'enroute');
      }
      banner('info', '挂起解除:' + t.id + ' 班组报「' + cond + '」已解除,恢复作业;停表 ' + stop + ' 分钟计入档案,SLA 接着算。', 'm2', routeOf('ticket', t.id));
      return '恢复作业 ' + t.id + ':恢复条件「' + cond + '」已解除 → 回到「' + back + '」;停表 ' + stop + ' 分钟入档,SLA 接着算不重新起算';
    }
  };

  A.resume_requeue = {
    label: '强制回队重派', actors: ['复核主管'],
    hint: '挂起件出口二:不等条件解除,直接把单收回待改派队列重新派',
    v: function (s, p) {
      var t = tkOf(p.ticketId); if (!t) return '工单不存在';
      if (!t.suspended) return '该单未处于挂起态';
      return null;
    },
    run: function (s, p, actor) {
      var t = tkOf(p.ticketId);
      var cond = t.resumeCond ? t.resumeCond.cond : (t.suspendReason || '挂起原因');
      var old = t.crew ? crewOf(t.crew) : null;
      if (old && !t.crewReleased) { old.load = Math.max(0, old.load - 1); old.status = old.load ? old.status : '空闲'; }
      if (old) crewMove(old, null, 'free');
      t.suspended = false; t.crewReleased = false; t.crew = null; t.state = '待改派';
      t.requeue = { by: actor, t: s.now, reason: p.reason || '不等条件解除,回队重派', fromCond: cond };
      t.resumeHistory = (t.resumeHistory || []).concat([{ t: s.now, by: actor, way: '复核主管(值班)强制回队重派', cond: cond }]);
      t.resumeCond = null;
      banner('amber', '强制回队重派:' + t.id + ' 不再等「' + cond + '」,已收回进待改派队列,请指派新承接班组。', 'm2', routeOf('ticket', t.id));
      return '强制回队重派 ' + t.id + ':' + actor + ' 判定不再等「' + cond + '」→ 收回工单进「待改派」;原承接班组释放,SLA 续计不清零';
    }
  };

  /* ---- A8 · 抽审两结论(队列每行可操作)---- */
  function auditOf(s, id) { return byId(s.gov.auditQueue, id); }

  A.spot_pass = {
    label: '抽审通过', actors: ['复核主管'],
    hint: '抽审结论:复看后认为原处置站得住;结论入动作日志,原件不动',
    v: function (s, p) {
      var a = auditOf(s, p.auditId); if (!a) return '抽审记录不存在';
      if (a.status !== '待抽审') return '该件已出抽审结论:' + (a.result || a.status);
      return null;
    },
    run: function (s, p, actor) {
      var a = auditOf(s, p.auditId);
      a.status = '已抽审'; a.result = '通过'; a.by = actor; a.ruledT = s.now; a.note = p.note || '';
      return '抽审通过 ' + a.id + '(' + (a.clueId || '—') + '):' + actor + ' 复看后认为原处置站得住;结论入动作日志,计入抽审完成数';
    }
  };

  A.spot_return = {
    label: '抽审打回', actors: ['复核主管'],
    hint: '抽审结论:原处置不成立 —— 原件回队重看,原处置人收到通知',
    v: function (s, p) {
      var a = auditOf(s, p.auditId); if (!a) return '抽审记录不存在';
      if (a.status !== '待抽审') return '该件已出抽审结论:' + (a.result || a.status);
      if (!p.code) return '打回原因码必填';
      return null;
    },
    run: function (s, p, actor) {
      var a = auditOf(s, p.auditId);
      a.status = '已抽审'; a.result = '打回'; a.code = p.code; a.by = actor; a.ruledT = s.now; a.note = p.note || '';
      var c = a.clueId ? clueOf(a.clueId) : null;
      var who = '';
      for (var i = s.actionLog.length - 1; i >= 0; i--) {
        var lg = s.actionLog[i];
        if (lg.params && lg.params.clueId === a.clueId && ['confirm', 'reject', 'overrule_mech', 'batch_confirm'].indexOf(lg.action) >= 0) { who = lg.actor; break; }
      }
      a.checkedActor = who;
      if (c) {
        c.spotReturn = { auditId: a.id, by: actor, t: s.now, code: p.code, to: who || '原处置人' };
        if (['confirmed', 'rejected', 'archived_doubt', 'auto_done'].indexOf(c.status) >= 0) { c.status = 'open'; c.lane = '单条必审'; }
        c.slaDeadline = addMin(s.now, w.DATA.dict.sla.urgentReview);
      }
      banner('warn', '抽审打回:' + (a.clueId || a.id) + ' 原件回队重看,原因「' + p.code + '」;请' + (who ? who : '原处置人') + '复看后重新给结论。',
        'm1', routeOf('clue', a.clueId) || '#/m4');
      return '抽审打回 ' + a.id + '(' + (a.clueId || '—') + '):' + actor + ' 判原处置不成立,原因「' + p.code + '」→ 原件回「待核查」进单条必审;' +
        '通知' + (who ? who : '原处置人') + '复看,打回记录进考核与规则评估统计';
    }
  };

  /* ============ R87 A3 · 影子试算回放 ============
     回答的是「这个参数改成 X,今天已经过这条规则的件会有什么不同」:
     对当日在池的线索 / 工单 / 调查案回放本条规则的判定,逐件给出改前改后的去向。
     ⚠ 只读回放:不写任何状态,也不改运行判定(生效仍需审批)。 */
  function num(v) { var n = parseFloat(v); return (typeof v === 'string' && v !== '' && !isNaN(n)) ? n : (typeof v === 'number' ? v : v); }
  function passCnt(c) { return (c.checks || []).filter(function (x) { return x.result === 'pass'; }).length; }
  function chkOf(c, id) { var a = (c.checks || []).filter(function (x) { return x.id === id; })[0]; return a ? a.result : 'na'; }
  function srcCnt(c) { var k = Object.keys(c.sourceMix || {}); return k.length || 1; }
  function isSensorClue(c) { return !!((c.sourceMix || {})['传感器']) || /传感器|液位|流量/.test(c.source || ''); }
  function isVisualClue(c) { return /相机|视觉|移动传感网|车载/.test(c.source || ''); }
  function lineClues(s, line) { return (s.clues || []).filter(function (c) { return c.line === line; }); }
  function obsSpanH(c) {
    var a = toMin(c.firstSeen || c.t), b = toMin(c.lastSeen || c.t), d = b - a;
    if (d < 0) d += 1440;
    return Math.round(d / 60 * 10) / 10;
  }

  var REPLAY = {
    'MH-R01': {
      what: '井盖线上带传感器观测的件',
      pick: function (s) { return lineClues(s, '井盖').filter(isSensorClue); },
      decide: function (c, P) {
        var tilt = Math.round(c.conf * 30 * 10) / 10;          // 演示口径:置信映射位移角
        var jump = Math.round(c.conf * 28);                     // 演示口径:置信映射液位跳变
        var gap = c.obsCount >= 2 ? 60 : 20;                    // 两次观测的间隔(秒)
        var cross = (jump >= P.levelJump) && (gap <= P.crossWin);
        return (tilt >= P.tiltDeg && cross) ? '机器直派' : '加急人工';
      }
    },
    'MH-R02': {
      what: '井盖线上只有一只传感器报、没有第二只佐证的件',
      pick: function (s) {
        return lineClues(s, '井盖').filter(function (c) { return isSensorClue(c) && ((c.sourceMix || {})['传感器'] || 0) < 2; });
      },
      decide: function (c, P) { return (Math.round(c.conf * 30 * 10) / 10) >= P.tiltDeg ? '加急人工' : '不进处置(未达位移阈值)'; }
    },
    'MH-R03': {
      what: '井盖线上靠画面识别的件',
      pick: function (s) { return lineClues(s, '井盖').filter(isVisualClue); },
      decide: function (c, P) {
        var frames = (c.obsCount || 1) + 3;                          // 演示口径:观测次数映射可用帧数
        var agree = Math.min(0.95, 0.5 + 0.15 * (c.obsCount || 1));  // 演示口径:观测越多帧间越一致
        return (c.conf >= P.conf && agree >= P.agree && frames >= P.frames) ? '机器直派' : '加急人工';
      },
      /* 本条是「升级到机器直派」的规则,三项判据是与关系:今天这批画面识别件的置信全部低于阈值,
         所以先卡在置信线上,一致率与帧数还轮不到起作用 —— 调这两个参数确实一件都不会动。
         这不是试算失灵,是试算给出的真实答案,旁白照此讲即可。 */
      why: function (items, base, key) {
        if (key === 'conf') return '';
        var blocked = items.filter(function (c) { return c.conf < base.conf; });
        if (blocked.length === items.length) {
          return '这 ' + items.length + ' 件今天全部卡在「置信阈值 ' + base.conf + '」上(最高一件 ' +
            Math.max.apply(null, items.map(function (c) { return c.conf; })) +
            '),先放宽置信,帧间一致率与连续帧数才轮得到起作用';
        }
        return '';
      }
    },
    /* R88 A1⑳:MH-R07 已改为纯计划性任务包规则 —— 回放的是「哪些雨水口点位进本轮任务包」,
       不再回放任何分级变动(升档口径整条推翻)。 */
    'MH-R07': {
      what: '井盖线上的雨水口点位(雨前清掏专项任务包的取件范围)',
      pick: function (s) { return lineClues(s, '井盖').filter(function (c) { return /^GR-/.test(c.facility || ''); }); },
      decide: function (c, P) { return P.leadHours >= 6 ? '进本轮雨前清掏专项任务包' : '不进本轮任务包(预警提前量不足,留到下一轮)'; }
    },
    /* R88 A2:兜底线在哪,今天哪几件会被系统自己派出去 —— 逐件真回放,不是示意 */
    'MH-R08': {
      what: '井盖线上还在「加急人工」车道等人给结论的件',
      pick: function (s) {
        return lineClues(s, '井盖').filter(function (c) { return c.lane === '加急人工' && c.status === 'open' && c.slaDeadline; });
      },
      decide: function (c, P) {
        return (-slaDiff(c.slaDeadline)) >= P.graceMin ? '超时兜底派单(先派后审,定性仍悬)' : '继续等人审(未到兜底线)';
      }
    },
    'RD-R07': {
      what: '路面线上还在「加急人工」车道等人给结论的件',
      pick: function (s) {
        return lineClues(s, '路面').filter(function (c) { return c.lane === '加急人工' && c.status === 'open' && c.slaDeadline; });
      },
      decide: function (c, P) {
        return (-slaDiff(c.slaDeadline)) >= P.graceMin ? '超时兜底派单(先派后审,定性仍悬)' : '继续等人审(未到兜底线)';
      }
    },
    /* R88 A3:采集侧的频率也是可试算的 —— 今夜由固定相机产出的观测,调频率会影响谁 */
    'OB-R01': {
      what: '今夜由固定相机产出的线索',
      pick: function (s) { return (s.clues || []).filter(function (c) { return /相机/.test(c.source || ''); }); },
      decide: function (c, P) { return P.interval <= 5 ? '按当前频率可覆盖(漏检窗 ≤ 5 分钟)' : '降频后该点位复现变慢,漏检窗拉长到 ' + P.interval + ' 分钟'; }
    },
    'MH-R05': {
      what: '井盖线在池件的台账点位比对',
      pick: function (s) { return lineClues(s, '井盖'); },
      decide: function (c, P) { return (chkOf(c, 'MH1') === 'pass' ? 8 : 40) > P.buffer ? '驳回与转办' : '不触发本规则(台账对得上)'; }
    },
    'MH-R06': {
      what: '雨水口箅面堵塞件',
      pick: function (s) { return lineClues(s, '井盖').filter(function (c) { return /^GR-/.test(c.facility || ''); }); },
      decide: function (c, P) { return c.conf >= P.conf ? '常规人工' : '不进处置(置信不足)'; }
    },
    'RD-R01': {
      what: '路面线在池件',
      pick: function (s) { return lineClues(s, '路面'); },
      decide: function (c, P) {
        if (c.conf < P.conf) return '常规人工';
        return srcCnt(c) >= P.sources ? '加急人工' : '常规人工(来源不足,不加急)';
      }
    },
    'RD-R02': {
      what: '路面线在池件',
      pick: function (s) { return lineClues(s, '路面'); },
      decide: function (c, P) { return c.conf < P.confLo ? '驳回与转办' : (c.conf < P.confHi ? '常规人工' : '加急人工'); }
    },
    'RD-R03': {
      what: '路面线在池件 + 命中树影特征的件',
      pick: function (s) { return (s.clues || []).filter(function (c) { return c.line === '路面' || /树影/.test(c.source || ''); }); },
      decide: function (c, P) {
        var shadow = /树影/.test(c.source || '') ? 0.9 : 0.2;
        if (shadow >= P.shadowScore) return '驳回与转办';
        return c.conf < P.confLo ? '驳回与转办' : '进人工车道(不驳回)';
      }
    },
    'RD-R04': {
      what: '路面线养护级在池件',
      pick: function (s) { return lineClues(s, '路面').filter(function (c) { return c.level === '养护'; }); },
      decide: function (c, P) { return (c.conf >= P.conf && passCnt(c) >= P.checks) ? '自动处理(免人工并入养护计划)' : '常规人工'; }
    },
    'RD-R05': {
      what: '路面线观察级在池件',
      pick: function (s) { return lineClues(s, '路面').filter(function (c) { return c.level === '观察'; }); },
      decide: function (c) { return passCnt(c) === (c.checks || []).length ? '自动处理(记账)' : '常规人工'; }
    },
    'PL-R01': {
      what: '管网线在办调查案',
      pick: function (s) { return (s.investigations || []).slice(); },
      decide: function (k, P) {
        var dev = 18, hold = 45, times = 3;                    // 演示口径:DMA-07 当夜实测偏差
        return (dev >= P.dev && hold >= P.hold && times >= P.times) ? '常规人工(开调查案)' : '不立案(未达判据)';
      }
    },
    'PL-R05': {
      what: '流量已回归的调查案',
      pick: function (s) { return (s.investigations || []).filter(function (k) { return !!k.flowGreen; }); },
      decide: function (k, P) { return (3 <= P.back && 2 >= P.keep) ? '建议结案(签字仍在人)' : '继续观察'; }
    },
    'DP-R03': {
      what: '当前五个班组的在办量',
      pick: function (s) { return (s.crews || []).slice(); },
      decide: function (cw, P) { return (cw.load > P.maxLoad) ? '超在办提醒上限(仍可派,标黄)' : '正常派单'; }
    },
    'DP-R05': {
      what: '当前在办工单的计时档',
      pick: function (s) { return (s.tickets || []).filter(function (t) { return !!t.sla; }); },
      decide: function (t, P) { return '接单 ' + P.accept + ' 分 / 到场 ' + P.arrive + ' 分 / 完工 ' + P.sameDay + ' 分'; }
    },
    'CL-R01': {
      what: '已有两次以上观测的线索',
      pick: function (s) { return (s.clues || []).filter(function (c) { return (c.obsCount || 1) >= 2; }); },
      decide: function (c, P) { return obsSpanH(c) <= P.activeWin ? '并入既有线索' : '另开新线索'; }
    }
  };

  function shadowReplay(ruleId, key, newVal) {
    var r = ruleById(ruleId);
    if (!r) return { ruleId: ruleId, key: key, total: 0, changed: [], note: '规则不存在:' + ruleId };
    var pm = (r.params || []).filter(function (x) { return x.key === key; })[0];
    if (!pm) return { ruleId: ruleId, key: key, total: 0, changed: [], note: '本条规则没有参数项「' + key + '」' };
    var rp = REPLAY[ruleId];
    var base = {}, nx = {};
    (r.params || []).forEach(function (x) { base[x.key] = x.val; nx[x.key] = x.val; });
    nx[key] = num(newVal);
    var out = {
      ruleId: ruleId, ruleName: r.name, key: key, label: pm.label, unit: pm.unit || '',
      from: pm.val, to: nx[key], scope: rp ? rp.what : '', total: 0, changed: [], note: ''
    };
    if (!rp) { out.note = '今日无经过本规则的件'; return out; }
    var items = rp.pick(state) || [];
    out.total = items.length;
    items.forEach(function (it) {
      var a = rp.decide(it, base), b = rp.decide(it, nx);
      if (a !== b) out.changed.push({ id: it.id, from: a, to: b });
    });
    if (!items.length) out.note = '今日无经过本规则的件';
    /* 有件经过、但一件都不改变去向:说清为什么(哪条判据先卡住),别让调参的人以为试算坏了。
       rule 自己有 why() 就用它的解释,否则给中性话。 */
    else if (!out.changed.length) {
      out.note = (rp.why ? (rp.why(items, base, key, nx) || '') : '') || '当前取值下没有件的去向改变';
    }
    return out;
  }

  /* ============ R86 A6 · 多端同步桩(app ↔ 手机浮窗 iframe;同源共享 sessionStorage)============
     发:每次 commit / advance 后向父窗与自己的子 iframe 广播 {t:'origen-sync'}。
     收:crew.html / public.html 各挂一个 message 监听 → S.reload() 重读 → 重渲染;
        父窗侧(app.html 手机浮窗)由 storage 事件兜底(sessionStorage 写入会在同源另一文档触发 storage)。
     只广播不接管:本文件不替页面决定何时重绘,除 storage 兜底外不外发额外事件。 */
  function syncPeers() {
    try { if (w.parent && w.parent !== w) w.parent.postMessage({ t: 'origen-sync' }, '*'); } catch (e) { /* 跨源/无父窗 */ }
    try {
      var fr = w.document ? w.document.getElementsByTagName('iframe') : [];
      for (var i = 0; i < fr.length; i++) {
        try { if (fr[i].contentWindow) fr[i].contentWindow.postMessage({ t: 'origen-sync' }, '*'); } catch (e2) { /* 未就绪 */ }
      }
    } catch (e3) { /* noop */ }
  }

  /* 重读存储:内容确有变化才换 state 并返回 true(避免同一次同步被两条路径重复渲染) */
  function reload() {
    var raw = readStore();
    if (!raw || !raw.now) return false;
    if (raw.seq === state.seq && raw.stepIdx === state.stepIdx && raw.role === state.role &&
      (raw.actionLog || []).length === state.actionLog.length &&
      (raw.dismissed || []).length === (state.dismissed || []).length) return false;
    state = hydrate(raw);
    w.S.state = state;
    return true;
  }

  try {
    w.addEventListener('storage', function (e) {
      if (e && e.key && e.key !== KEY) return;
      if (reload()) emit('render', { sync: 'storage' });
    });
  } catch (e) { /* 无 window 事件环境 */ }

  /* ============================================================
     R89 A3 · 链接层(本体日志的第三列:这一步动作把哪两个对象连起来了)
     ① 每个动作声明它产出/改变的链接:{type:'工单↦线索', from:<端点取值式>, to:<端点取值式>};
     ② doCommit 落日志时按声明实例化 entry.links = [{type, fromId, toId}](两端都取到才落);
     ③ 链接类型表 = 从声明聚合导出(S.linkTypes()),不是另写一张表 —— 所以日志里出现的
        type 不可能不在类型表里(同源);S.linkAudit() 仍逐条核一遍,恒 0 即机制在。
     端点取值式(字符串,读的是本次动作的参数与它刚改过的对象):
       '@actor'      当前执行人 / 服务账号        '#字面量'   固定文本端点
       'p:key'       params[key](数组则扇出多条)  'p1:key' 数组首项  'prest:key' 数组其余项
       'clue:字段'   clueOf(p.clueId) 的字段       'ticket:字段' tkOf(p.ticketId) 的字段
       'alert:字段' / 'case:字段' / 'crew:字段' / 'audit:字段' / 'recon:字段'  同理
       '$audit'      本次动作新拘进抽审队列的记录 id(可多条)
     ============================================================ */
  function L(type, from, to) { return { type: type, from: from, to: to }; }

  var ACTION_LINKS = {
    /* ---- 认领与复核员定性 ---- */
    claim: [L('线索↦处置人', 'p:clueId', '@actor')],
    claim_takeover: [L('线索↦处置人', 'p:clueId', '@actor')],
    view_evidence: [],
    confirm: [L('告警↦线索', 'clue:alertId', 'p:clueId'), L('告警↦设施', 'clue:alertId', 'clue:facility'),
      L('线索↦处置人', 'p:clueId', '@actor'), L('工单↦线索', 'clue:ticketId', 'p:clueId'), L('抽审↦线索', '$audit', 'p:clueId')],
    reject: [L('线索↦处置人', 'p:clueId', '@actor'), L('抽审↦线索', '$audit', 'p:clueId')],
    overrule_mech: [L('线索↦处置人', 'p:clueId', '@actor'), L('抽审↦线索', '$audit', 'p:clueId')],
    fastlane_recall: [L('工单↦线索', 'clue:ticketId', 'p:clueId'), L('线索↦处置人', 'p:clueId', '@actor'),
      L('抽审↦线索', '$audit', 'p:clueId')],
    batch_confirm: [L('线索↦处置人', 'p:clueIds', '@actor'), L('抽审↦线索', '$audit', 'p1:clueIds')],
    archive_doubt: [L('线索↦处置人', 'p:clueId', '@actor')],
    transfer: [L('线索↦产权单位', 'p:clueId', 'p:owner'), L('设施↦产权单位', 'clue:facility', 'p:owner'),
      L('线索↦处置人', 'p:clueId', '@actor')],
    clue_escalate: [L('线索↦处置人', 'p:clueId', '@actor')],
    fp_feedback: [L('线索↦规则', 'p:clueId', 'p:ruleId')],

    /* ---- 调查案(管网线)---- */
    open_case: [L('工单↦调查案', 'case:ticketId', 'p:caseId'), L('调查案↦设施', 'p:caseId', 'case:facility')],
    close_case: [L('调查案↦结案人', 'p:caseId', '@actor')],
    pl_survey_start: [L('工单↦调查案', 'case:ticketId', 'p:caseId')],
    survey_report: [L('调查案↦班组', 'p:caseId', '@actor')],
    pl_leak_confirm: [L('调查案↦管段', 'p:caseId', 'p:segment')],
    pl_to_repair: [L('工单↦调查案', 'case:repairTicketId', 'p:caseId'), L('工单↦班组', 'case:repairTicketId', 'p:crew')],
    pl_verify_ok: [],
    pl_close: [L('调查案↦结案人', 'p:caseId', '@actor')],

    /* ---- 调度与工单 ---- */
    dispatch_manual: [L('工单↦班组', 'p:ticketId', 'p:crew')],
    merge: [L('工单↦工单', 'prest:ticketIds', 'p1:ticketIds')],
    split: [L('工单↦工单', 'p:newTicketId', 'p:ticketId')],
    suspend: [],
    override_emergency: [L('抽审↦线索', '$audit', 'p:clueId')],
    revoke: [L('告警↦裁定人', 'p:alertId', '@actor')],
    recon_rule: [L('对账↦工单', 'p:reconId', 'recon:ticketId')],
    freeze_evidence: [L('冻结对象↦冻结人', 'p:targetId', '@actor')],
    toggle_fastlane: [L('类目开关↦治理方', 'p:cat', '@actor')],
    appeal_fastlane: [L('类目申诉↦发起方', 'p:cat', '@actor')],
    verify_pass: [L('工单↦复验人', 'p:ticketId', '@actor')],
    verify_reject: [L('工单↦复验人', 'p:ticketId', '@actor')],
    mh_confirm_close: [L('工单↦复验人', 'p:ticketId', '@actor')],
    rd_spot_check: [L('抽审↦工单', '$audit', 'p:ticketId')],
    preempt_yield: [L('工单↦线索', 'p:ticketId', 'p:forClueId')],
    preempt_borrow: [L('班组↦业务线', 'p:crew', 'p:line')],
    preempt_arbitrate: [L('工单↦线索', 'clue:ticketId', 'p:clueId'), L('工单↦班组', 'clue:ticketId', 'p:crew'),
      L('抽审↦线索', '$audit', 'p:clueId')],
    crew_resume: [L('工单↦班组', 'p:ticketId', 'ticket:crew')],
    resume_requeue: [],
    misfire_appeal: [L('告警↦申诉人', 'p:alertId', '@actor')],
    misfire_ruling: [L('告警↦裁定人', 'p:alertId', '@actor'), L('工单↦设施', 'p:recheckTicketId', 'alert:facility')],
    spot_pass: [L('抽审↦裁定人', 'p:auditId', '@actor')],
    spot_return: [L('抽审↦裁定人', 'p:auditId', '@actor'), L('抽审↦线索', 'p:auditId', 'audit:clueId')],
    rule_param_change: [L('规则↦变更人', 'p:ruleId', '@actor')],
    banner_dismiss: [],

    /* ---- 班组端 ---- */
    crew_accept: [L('工单↦班组', 'p:ticketId', 'ticket:crew')],
    crew_arrive: [L('工单↦班组', 'p:ticketId', 'ticket:crew')],
    crew_photo: [L('工单↦班组', 'p:ticketId', 'ticket:crew')],
    crew_done: [L('工单↦班组', 'p:ticketId', 'ticket:crew')],
    crew_reject: [],
    crew_blocked: [],
    crew_safety: [],
    crew_report_new: [L('线索↦设施', 'p:newClueId', 'p:facility')],
    crew_partial_done: [],
    crew_handover: [L('工单↦班组', 'p:ticketId', 'p:toCrew')],

    /* ---- 规则引擎 / AI 服务自动步 ---- */
    auto_sensor_alarm: [L('线索↦传感器', 'p:clueId', 'p:sensorId'), L('线索↦设施', 'p:clueId', 'p:facility')],
    auto_selfcheck: [],
    auto_work_window: [],
    auto_mech_check: [],
    auto_dispatch: [L('工单↦线索', 'clue:ticketId', 'p:clueId'), L('工单↦班组', 'clue:ticketId', 'p:crew'),
      L('抽审↦线索', '$audit', 'p:clueId')],
    auto_broadcast: [],
    auto_review_window: [],
    auto_create_clue: [L('线索↦设施', 'p:clueId', 'clue:facility')],
    auto_route: [],
    auto_mech_reject: [],
    auto_upgrade: [L('抽审↦线索', '$audit', 'p1:clueIds')],
    auto_plan_ticket: [L('工单↦班组', 'p:ticketId', 'p:crew'), L('工单↦设施', 'p:ticketId', 'ticket:facility')],
    auto_rule_alarm: [],
    auto_ai_typing: [],
    auto_open_case: [L('调查案↦设施', 'p:caseId', 'p:facility')],
    auto_device_ticket: [L('工单↦传感器', 'p:ticketId', 'p:sensorId')],
    auto_verify: [],
    auto_overload: [L('抽审↦线索', '$audit', 'p:clueId')],
    auto_recheck_obs: [L('线索↦设施', 'p:clueId', 'p:facility')],
    auto_dedupe: [L('线索↦观测源', 'p:clueId', 'p:source')],
    auto_recon: [L('对账↦工单', 'p:reconId', 'p:ticketId')],
    auto_flow_recover: [],
    auto_suggest_close: [],
    auto_weather_tasks: [L('工单↦设施', 'p:ticketId', 'ticket:facility')],
    dispatch_suggest: [L('待裁定↦线索', 'p:rulingId', 'p:clueId'), L('待裁定↦班组', 'p:rulingId', 'p:crew')],
    auto_audit_hold: [L('抽审↦线索', '$audit', 'p:clueId')],
    auto_overdue_dispatch: [L('工单↦线索', 'clue:ticketId', 'p:clueId'), L('工单↦班组', 'clue:ticketId', 'p:crew'),
      L('抽审↦工单', '$audit', 'clue:ticketId')]
  };
  /* 声明挂回动作定义本体:动作表每行都带 links(没有链接的显式声明空数组,不留「忘了写」的灰区)。
     ⚠ 只挂声明表里有的键 —— 漏写的动作会在 S.linkAudit().undeclaredActions 里露出来,
        写错的键会在 staleLinkKeys 里露出来;两个都空才算这张表跟动作表对齐。 */
  Object.keys(A).forEach(function (k) { if (ACTION_LINKS[k]) A[k].links = ACTION_LINKS[k]; });
  var STALE_LINK_KEYS = Object.keys(ACTION_LINKS).filter(function (k) { return !A[k]; });

  function objOf(kind, s, p) {
    if (kind === 'clue') return p.clueId ? clueOf(p.clueId) : null;
    if (kind === 'ticket') return p.ticketId ? tkOf(p.ticketId) : null;
    if (kind === 'alert') return p.alertId ? byId(s.alerts, p.alertId) : null;
    if (kind === 'case') return p.caseId ? caseOf(p.caseId) : null;
    if (kind === 'crew') return p.crew ? crewOf(p.crew) : null;
    if (kind === 'audit') return p.auditId ? byId((s.gov && s.gov.auditQueue) || [], p.auditId) : null;
    if (kind === 'recon') return p.reconId ? byId(s.recon || [], p.reconId) : null;
    return null;
  }
  function endOf(spec, s, p, actor, ctx) {
    if (!spec) return null;
    if (spec === '@actor') return actor;
    if (spec.charAt(0) === '#') return spec.slice(1);
    if (spec === '$audit') return (ctx && ctx.newAudits) || [];
    var i = spec.indexOf(':');
    if (i < 0) return null;
    var head = spec.slice(0, i), key = spec.slice(i + 1);
    if (head === 'p') return p[key];
    if (head === 'p1') { var a1 = p[key]; return (a1 && a1.length) ? a1[0] : null; }
    if (head === 'prest') { var a2 = p[key]; return (a2 && a2.length > 1) ? a2.slice(1) : []; }
    var o = objOf(head, s, p);
    return o ? o[key] : null;
  }
  function asList(v) {
    if (v === null || v === undefined || v === '') return [];
    return (Object.prototype.toString.call(v) === '[object Array]') ? v.filter(function (x) { return !!x; }) : [v];
  }
  function buildLinks(action, s, p, actor, ctx) {
    var decl = (A[action] && A[action].links) || [], out = [], seen = {};
    decl.forEach(function (dl) {
      var fs = asList(endOf(dl.from, s, p, actor, ctx));
      var ts = asList(endOf(dl.to, s, p, actor, ctx));
      fs.forEach(function (f) {
        ts.forEach(function (t) {
          if (!f || !t || f === t) return;
          var k = dl.type + '|' + f + '|' + t;
          if (seen[k]) return;
          seen[k] = 1;
          out.push({ type: dl.type, fromId: String(f), toId: String(t) });
        });
      });
    });
    return out;
  }
  /* 链接类型表 = 动作声明的聚合(唯一真源);count = 当前日志里该类型的实例数 */
  function linkTypes() {
    var m = {}, order = [];
    Object.keys(A).forEach(function (k) {
      (A[k].links || []).forEach(function (dl) {
        if (!m[dl.type]) {
          var ends = dl.type.split('↦');
          m[dl.type] = { type: dl.type, from: ends[0] || '', to: ends[1] || '', actions: [], count: 0 };
          order.push(dl.type);
        }
        if (m[dl.type].actions.indexOf(k) < 0) m[dl.type].actions.push(k);
      });
    });
    (state.actionLog || []).forEach(function (lg) {
      (lg.links || []).forEach(function (ln) { if (m[ln.type]) m[ln.type].count++; });
    });
    return order.map(function (t) { return m[t]; });
  }
  /* 穷尽自检:日志里出现的链接类型必须都在类型表里(同源 → 恒 0);
     顺带核一遍「有没有动作没写 links 声明」——两项都 0 才算机制在。 */
  function linkAudit() {
    var known = {}, undecl = [];
    linkTypes().forEach(function (x) { known[x.type] = 1; });
    Object.keys(A).forEach(function (k) { if (!A[k].links) undecl.push(k); });
    var bad = [], total = 0;
    (state.actionLog || []).forEach(function (lg) {
      (lg.links || []).forEach(function (ln) {
        total++;
        if (!known[ln.type]) bad.push({ rid: lg.rid, action: lg.action, type: ln.type, fromId: ln.fromId, toId: ln.toId });
      });
    });
    return {
      types: Object.keys(known).length, actions: Object.keys(A).length,
      instances: total, unclassified: bad.length, items: bad,
      undeclaredActions: undecl, staleLinkKeys: STALE_LINK_KEYS.slice()
    };
  }

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
    /* R89 A1:件已被他人认领 → 处置动作在校验层就拦下(灰态按钮显示「先接手」的原因) */
    var lock = claimBlock(action, p, actor);
    if (lock) return { ok: false, reason: lock };
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
    /* R89 A1 · 隐式认领:处置动作落在还没人认领的件上 → 先补一条 claim 日志再执行,
       动作按钮不必先点一次认领,但账上是两条(认领 + 处置),不含糊谁在什么时候把件拿走了。 */
    if (CLAIM_ACTIONS.indexOf(action) >= 0 && p.clueId) {
      var cc = clueOf(p.clueId);
      if (cc && !cc.assignee) doCommit('claim', { actor: actor, clueId: p.clueId, implicit: true }, true);
    }
    var aq = (state.gov && state.gov.auditQueue) || [];
    var aqFrom = aq.length;
    var sum = def.run(state, p, actor) || def.label;
    state.seq++;
    var log = {
      rid: 'LG-' + ('000' + (state.actionLog.length + 1)).slice(-4),
      t: state.now, actor: actor, action: action, params: p,
      snapshot: 'RS-' + state.seq, sum: sum, auto: !!def.auto, label: def.label,
      /* quiet=true 的动作(如关闭横幅)仍入日志不豁免审计,但时间线组件可折叠为次要行 */
      quiet: !!def.quiet,
      /* R89 A3:本次动作产出/改变的链接实例(类型全集 = 动作 links 声明的聚合,同源) */
      links: buildLinks(action, state, p, actor, { newAudits: aq.slice(aqFrom).map(function (x) { return x.id; }) })
    };
    state.actionLog.push(log);
    /* R88 A5⑭:本次动作新拘的抽审记录回填触发它的动作日志 rid;没有被抽对象的回落到动作日志本身 */
    for (var qi = aqFrom; qi < aq.length; qi++) {
      if (!aq[qi].srcRid) aq[qi].srcRid = log.rid;
      if (!aq[qi].targetId) { aq[qi].targetKind = '动作日志'; aq[qi].targetId = log.rid; }
    }
    fillSummaries(state);   // R87:任何路径新建的工单都补上事项一句话
    save();
    emit('render', { action: action, log: log });
    syncPeers();
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
    var logFrom = state.actionLog.length;
    var ran = [];
    (step.auto || []).forEach(function (e) {
      var r = doCommit(e.action, e.params, true);
      if (r.ok) ran.push(e.action);
    });
    sweepOverdue();                     // R88 A2:假时钟每步进一次,扫一遍加急人工件的超时兜底
    /* 本步产生的日志区间(R85⑤「后端发生了什么」浮层的数据来源;不改 actionLog 结构,只记游标) */
    if (!state.stepLog) state.stepLog = {};
    if (!state.stepLog[step.id] || state.actionLog.length > logFrom) {
      state.stepLog[step.id] = { from: logFrom, to: state.actionLog.length };
    }
    fillSummaries(state);   // R87:解锁注入的工单也补上事项一句话
    save();
    emit('scenario', { step: step, ran: ran });
    emit('render', { scenario: step.id });
    syncPeers();
    return { ok: true, step: step, ran: ran };
  }

  function nextStep() {
    if (state.stepIdx >= w.SCENARIO.length) {
      return { ok: false, reason: '已推进到最后一步,没有更多状态可推进。可点「重置数据」回到初始状态。' };
    }
    return advance(w.SCENARIO[state.stepIdx].id);
  }

  /* ============ SLA ============ */
  /* 时刻是 24h 环上的 HH:MM,截止点可能跨零点回绕(如 20:00+300min=01:00)——
     取环上离零最近的差值,否则跨零点的截止会被误判为「已超时 19 小时」。 */
  function slaDiff(deadline) {
    var d = toMin(deadline) - toMin(state.now);
    if (d < -720) d += 1440;
    else if (d > 720) d -= 1440;
    return d;
  }
  function fmtSla(deadline) {
    if (!deadline) return '—';
    var d = slaDiff(deadline);
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
    slaLeft: function (deadline) { return deadline ? slaDiff(deadline) : null; },
    ACTIONS: A,
    dict: function () { return w.DATA.dict; },
    step: function () { return state.stepIdx < w.SCENARIO.length ? w.SCENARIO[state.stepIdx] : null; }, // 下一步
    lastStep: function () { return state.lastStep ? (stepById(state.lastStep) || {}).step : null; },
    setRole: function (r) { state.role = r; save(); emit('render', { role: r }); return r; },
    find: { clue: clueOf, ticket: tkOf, crew: crewOf, facility: facOf, investigation: caseOf, sensor: senOf, alert: function (id) { return byId(state.alerts, id); } },

    /* ---- R85②/⑤ 只读导出与导览辅助(只加不改:不触碰任何既有签名与语义) ---- */
    /* 动作注册表的本体形态:动作 / 显示名 / 执行角色白名单 / 自动或人工 —— m6「本体建模」动作类型表用 */
    actionDefs: function () {
      return Object.keys(A).map(function (k) {
        var d = A[k];
        return { action: k, label: d.label || k, actors: (d.actors || ['*']).slice(), auto: !!d.auto, hint: d.hint || '' };
      });
    },
    /* 某场景步产生的动作日志(导览「后端发生了什么」浮层) */
    stepLog: function (stepId) {
      var r = state.stepLog && state.stepLog[stepId];
      if (!r) return [];
      return state.actionLog.slice(r.from, r.to);
    },
    /* 导览跳镜:目标步数 < 当前 → 状态机不可逆,故重播(重新播种后静默连推);≥ 当前 → 静默补推。
       全程 quiet,结束只发一次 render —— 不改 advance/nextStep 本身的语义。 */
    tourGoto: function (target) {
      target = Math.max(0, Math.min(target | 0, w.SCENARIO.length));
      quiet++;
      try {
        if (target < state.stepIdx) {
          state = seed();
          w.S.state = state;
        }
        while (state.stepIdx < target) {
          if (!nextStep().ok) break;
        }
      } finally { quiet--; }
      save();
      emit('render', { tour: target });
      return { ok: true, stepIdx: state.stepIdx };
    },
    time: { toMin: toMin, toHHMM: toHHMM, addMin: addMin },
    isHigh: isHigh,

    /* ---- R86 只读导出与增补助手(只加不改:不触碰任何既有签名与语义) ---- */
    /* A2 规则表:静态定义(window.RULES)+ 影子试算覆盖值合成后的「生效展示值」。
       ⚠ shadow:true 的值只用于展示与试算,动作校验(v/run)一律不读它 —— 运行判定不变。 */
    rules: function (line) {
      var rs = (w.RULES || []).slice();
      return line ? rs.filter(function (r) { return r.line === line; }) : rs;
    },
    ruleParams: function (ruleId) {
      var over = state.ruleParams || {};
      function eff(r) {
        return (r.params || []).map(function (pm) {
          var o = over[r.id] && over[r.id][pm.key];
          return {
            key: pm.key, label: pm.label, unit: pm.unit || '', assume: true,
            val: o ? o.val : pm.val, base: pm.val,
            shadow: !!o, shadowBy: o ? o.by : null, shadowT: o ? o.t : null
          };
        });
      }
      if (ruleId) { var r = ruleById(ruleId); return r ? eff(r) : []; }
      var m = {};
      (w.RULES || []).forEach(function (r) { m[r.id] = eff(r); });
      return m;
    },
    rule: ruleById,
    /* A1 通道三档:渲染层取名与取色的唯一处 */
    lanes: function () { return (w.LANES || []).slice(); },
    /* A3 观测:追加一次观测(不新开线索);渲染层只读,写请走对应动作 */
    addObservation: addObservation,
    /* A9 横幅:过滤掉已关闭的 */
    banners: function (scope) {
      var dis = state.dismissed || [];
      return state.banners.filter(function (b) {
        if (dis.indexOf(b.id) >= 0) return false;
        return !scope || b.scope === 'global' || b.scope === scope;
      });
    },
    /* A6 多端同步:reload = 重读 sessionStorage(有变化才换 state 并返回 true);sync = 主动广播 */
    reload: reload,
    sync: syncPeers,

    /* ---- R87 只读导出(只加不改) ---- */
    /* A3 影子试算回放:这个参数改成 newVal,今天已经过这条规则的件会有什么不同。
       → { ruleId, ruleName, key, label, unit, from, to, scope, total, changed:[{id,from,to}], note } */
    shadowReplay: shadowReplay,
    /* A2 待裁定卡:抢占第三步交到复核主管(值班)手上的建议方案与后果(默认只给待裁定的) */
    pendingRulings: function (status) {
      var list = state.pendingRulings || [];
      return list.filter(function (x) { return status === '*' ? true : x.status === (status || '待裁定'); });
    },
    /* A8 抽审计数:抽审率与已抽数实时算 */
    auditStats: function () {
      var q = (state.gov && state.gov.auditQueue) || [];
      var done = q.filter(function (a) { return a.status === '已抽审'; });
      return {
        total: q.length, pending: q.length - done.length, done: done.length,
        pass: done.filter(function (a) { return a.result === '通过'; }).length,
        returned: done.filter(function (a) { return a.result === '打回'; }).length,
        rate: q.length ? Math.round(done.length / q.length * 100) : 0
      };
    },
    /* 工单事项一句话(新建工单已自动带 summary;此处供渲染层临时对象取用) */
    ticketSummary: function (tk) { return summaryOf(tk, state); },
    /* 挂起件的恢复条件(渲染层直接读 ticket.resumeCond;此处供预览用) */
    resumeCond: function (reason) { return resumeCondOf(reason, state.now); },
    /* 对象 → hash 路由(横幅 href / 地图点位跳转共用) */
    route: routeOf,

    /* ---- R89 只读导出(只加不改) ---- */
    /* A1 认领:件在谁手上 / 我能不能直接处置(渲染层灰化与「接手」按钮的判据来源) */
    claimOf: function (clueId) {
      var c = clueOf(clueId);
      if (!c) return null;
      var me = state.role;
      return {
        assignee: c.assignee || null, mine: !!c.assignee && c.assignee === me,
        pooled: !c.assignee, lockedByOther: !!c.assignee && c.assignee !== me,
        log: (c.claimLog || []).slice()
      };
    },
    /* A1 红点角标:当前角色在各模块的待办数 —— 复核员 = 池中未认领 + 我认领未结;
       复核主管 = 待裁定 + 待抽审 + 申诉裁定 + 参数审批。返回 {m1,m2,m4,m6,total} */
    todoCount: function (role) {
      role = role || state.role;
      var clues = state.clues || [];
      var open = clues.filter(function (c) { return c.status === 'open'; });
      var out = { m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, total: 0, detail: {} };
      var mine = open.filter(function (c) { return c.assignee === role; }).length;
      var pool = open.filter(function (c) { return !c.assignee; }).length;
      if (role === '区复核员') {
        out.m1 = pool + mine;
        out.m2 = (state.tickets || []).filter(function (t) { return t.state === '已完工' && t.verify === '存疑待人裁'; }).length;
        out.detail = { 池中未认领: pool, 我认领未结: mine, 待复验人裁: out.m2 };
      } else if (role === '复核主管') {
        var ruling = (state.pendingRulings || []).filter(function (x) { return x.status === '待裁定'; }).length;
        var appeal = (state.alerts || []).filter(function (a) { return a.status === '申诉复核中'; }).length;
        var audit = ((state.gov && state.gov.auditQueue) || []).filter(function (a) { return a.status === '待抽审'; }).length;
        var param = (state.ruleShadow || []).filter(function (x) { return x.status === '影子试算(未生效)'; }).length;
        out.m1 = mine;
        out.m2 = ruling + appeal;
        out.m4 = audit;
        out.m6 = param;
        out.detail = { 待裁定: ruling, 申诉裁定: appeal, 待抽审: audit, 参数审批: param, 我认领未结: mine };
      } else if (role === '上级主管部门') {
        out.m6 = (state.ruleShadow || []).filter(function (x) { return x.status === '影子试算(未生效)'; }).length;
        out.detail = { 参数审批: out.m6 };
      } else if (role === '班组账号') {
        out.m2 = (state.tickets || []).filter(function (t) { return t.state === '已派工'; }).length;
        out.detail = { 待接单: out.m2 };
      }
      out.total = out.m1 + out.m2 + out.m3 + out.m4 + out.m5 + out.m6;
      return out;
    },
    /* A3 链接层:类型表(动作声明聚合 · 唯一真源)/ 穷尽自检(恒 0 = 机制在)/ 某对象的链接实例 */
    linkTypes: linkTypes,
    linkAudit: linkAudit,
    linksOf: function (objId) {
      var out = [];
      (state.actionLog || []).forEach(function (lg) {
        (lg.links || []).forEach(function (ln) {
          if (!objId || ln.fromId === objId || ln.toId === objId) out.push({ rid: lg.rid, t: lg.t, action: lg.action, type: ln.type, fromId: ln.fromId, toId: ln.toId });
        });
      });
      return out;
    }
  };

  save();
})(window);
