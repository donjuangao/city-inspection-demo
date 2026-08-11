/* spec.html ⑥ 业务规则总表 ↔ assets/data.js RULES 一致性对拍器(R89⑪ Z4 审计遗留仪器)
   跑法:node tools/verify-spec-rules.js  · 失败数 0 = 两端逐字一致
   RULES 改动后必跑;失配会逐条打印 MISS [规则.字段] 期望值。 */
const fs = require('fs');
const w = {}; global.window = w;
require(require('path').join(__dirname,'..','assets','data.js'));
const R = w.RULES;
let html = fs.readFileSync(require('path').join(__dirname,'..','spec.html'), 'utf8');
// 只看 ⑥ 规则总表章
const sec = html.slice(html.indexOf('id="rules"'), html.indexOf('id="objects"'));
const plain = sec.replace(/<[^>]+>/g, ' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/\s+/g, ' ');

// 与 spec 侧同一套口径映射(修复单口径 3/9;F1 正在 demo 侧落同一批词)
const MAP = [[/机械校验/g,'规则校验'],[/机械驳回/g,'规则驳回'],[/机械全过/g,'规则全过'],
             [/观测覆盖缺口/g,'观测降级'],[/覆盖缺口/g,'观测降级'],[/双闸/g,'两道关口']];
function norm(s){ s=String(s); MAP.forEach(m=>s=s.replace(m[0],m[1])); return s.replace(/\s+/g,' ').trim(); }

let fail = 0, checks = 0;
function has(needle, label) {
  checks++;
  if (plain.indexOf(norm(needle)) < 0) { fail++; console.log('MISS [' + label + '] ' + norm(needle)); }
}
// 条数
const ids = (sec.match(/class="rid">[A-Z]{2}-R\d\d</g) || []).length;
console.log('规则号出现次数:', ids, '(data.js RULES 条数:', R.length + ')');
if (ids !== R.length) { fail++; console.log('!! 条数不符'); }

R.forEach(r => {
  has(r.id, r.id + '.id');
  has(r.name, r.id + '.name');
  has(r.when, r.id + '.when');
  if (r.lane) has(r.lane, r.id + '.lane');
  if (r.action) has(r.action, r.id + '.action');
  if (r.svc) has(r.svc, r.id + '.svc');
  has(r.version, r.id + '.version');
  has((r.editableBy || []).join(' / '), r.id + '.editableBy');
  (r.params || []).forEach(p => {
    has(p.label, r.id + '.' + p.key + '.label');
    has(String(p.val) + (p.unit ? ' ' + p.unit : ''), r.id + '.' + p.key + '.val');
    has(p.desc, r.id + '.' + p.key + '.desc');
  });
  (r.steps || []).forEach(s => { has(s.name, r.id + '.step' + s.no); has(s.when, r.id + '.step' + s.no + '.when'); });
});
console.log('---');
console.log('断言数:', checks, ' 失败:', fail);
// 版本分布
const vs = {}; R.forEach(r => vs[r.version] = (vs[r.version]||0)+1);
console.log('data.js 版本分布:', JSON.stringify(vs));
// editableBy 值域
const eb = {}; R.forEach(r => (r.editableBy||[]).forEach(x => eb[x]=(eb[x]||0)+1));
console.log('data.js 可改角色值域:', JSON.stringify(eb));
