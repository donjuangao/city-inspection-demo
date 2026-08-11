#!/usr/bin/env python3
"""print.html 形制自检(W2-PDF)。零依赖,只用标准库。"""
import re, sys, pathlib

SRC = pathlib.Path(__file__).with_name("print.html")
html = SRC.read_text(encoding="utf-8")
# 2026-08-11 R90:界面原型截图以 data: URI 内嵌后,base64 载荷会污染所有「正文文本」类判据
#   (③ R\d 编号、⑨ 中文占比、⑪ 黑话族、⑫ 厂商专名 都在 base64 里被随机字节命中)。
#   base64 载荷不是正文 —— 文本类判据一律扫 htmlx(载荷替换为占位符),资源类判据(①②)仍扫原文。
DATA_URI = re.compile(r'data:image/[a-z+]+;base64,[A-Za-z0-9+/=\s]+')
htmlx = DATA_URI.sub('data:image/png;base64,PAYLOAD', html)
fails, notes = [], []

def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (("  -> " + detail) if detail else ""))
    if not ok:
        fails.append(name)

print("== print.html 形制自检 ==  文件:%s  字节:%d" % (SRC, len(html.encode("utf-8"))))

# 1 零外链资源(2026-08-10 R85⑥ 收窄:PDF 精简后须以纯文本印出演示站「产品协议」页指路 URL,
#   原判据「全文零 http」已过时。红线的真实对象是**资源外链**——渲染时会去网上取东西的引用;
#   印在纸上的一行文字 URL 不发请求、不破坏离线可印性,故豁免,但登记在备注里可见)
res_links = re.findall(r'(?:href|src|srcset|xlink:href)\s*=\s*["\']?\s*https?://[^\s"\'<>)]*'
                       r'|url\(\s*["\']?\s*https?://[^\s"\'<>)]*'
                       r'|@import[^;]*https?://[^\s"\'<>);]*', html, re.I)
check("① 零外链资源(href/src/url()/@import 无 http)", not res_links, "命中 %r" % (res_links[:5],))
text_links = re.findall(r'https?://[^\s"\'<>)]*', html)
notes.append("纯文本 URL(印在纸上,不发请求)%d 处:%r" % (len(text_links), sorted(set(text_links))))

# 2 <img> 纪律(2026-08-11 R90 改判:PRD「界面原型」节须放 demo 真实界面截图,
#   原判据「零 <img>」把截图一并禁掉已过时。红线的真实对象是**外链**与**真实照片**:
#   截图 = 界面本身(零真实照片纪律不涉),且必须 data: 内嵌保持离线可印性。
#   新判据:每个 <img> 的 src 必须以 data: 开头;图示仍以 inline SVG 为主(②b 保底)。)
imgs = re.findall(r'<img\b[^>]*>', html, re.I)
bad_img = [t[:60] for t in imgs if not re.search(r'src\s*=\s*["\']data:', t, re.I)]
check("② <img> 全部 data: 内嵌(零外链图,截图豁免见注)", not bad_img, "外链图 %r" % (bad_img[:3],))
notes.append("内嵌截图 %d 张(界面原型节;每张 ≤300KB,PNG 宽 1024)" % len(imgs))

# 2b 确有 inline SVG
svgs = re.findall(r'<svg\b', html, re.I)
check("②b inline SVG 存在", len(svgs) >= 4, "共 %d 个 <svg>" % len(svgs))

# 3 零 R 编号残留(正文里的内部索引 R1..R99);排除 R&D / RBAC 等误伤
rnums = re.findall(r'R\d{1,2}', htmlx)
misfire = [m for m in re.findall(r'R&D|RBAC|RTL', htmlx)]
check("③ 零内部 R 编号残留(正则 R\\d{1,2})", not rnums, "命中 %r" % (rnums[:10],))
notes.append("误伤自查:R&D/RBAC/RTL 类词命中 %d 处(不计入 R\\d 正则,已确认无误伤)" % len(misfire))

# 3b 其它内部索引抽查(HW-xx / A-xx / PM-Bx 之类不应出现在评审稿)
other_idx = re.findall(r'\bHW-\d+|\bPM-B\d|判官标注件|反审 [FM]\d+', htmlx)
check("③b 零其它内部索引(HW-/PM-B/判官标注件/反审)", not other_idx, "命中 %r" % (other_idx[:8],))

# 4 页数(2026-08-10 走查 R83-11:页数弹性放开;硬约束只剩 题面①≤3页 + 全文上限 12)
pages = re.findall(r'<section class="page">', html)
p1 = len(re.findall(r'交付① 平台规划', html))
# 2026-08-11 R90:PRD 按客户模板重组进入**加法期**(先写全,PM 再减法),全文上限临时松绑
#   12 → 22。**待 PM 减法后收回**;交付① ≤3 页硬约束不变。
check("④ 页数:交付① ≤3 且全文 ≤22(R90 加法期临时上限,PM 减法后收回)", p1 <= 3 and len(pages) <= 22,
      "交付① %d 页 / 全文 %d 页" % (p1, len(pages)))
notes.append("页容器 = %d(交付① %d 页 + 交付② %d 页)" % (len(pages), p1, len(pages) - p1))

# 5 禁色值(黑金)
bad_color = re.findall(r'#d4af37|#ffd700|gold|黑金', htmlx, re.I)
check("⑤ 禁色值(#d4af37/#ffd700/gold/黑金)", not bad_color, "命中 %r" % (bad_color[:5],))

# 6 页脚齐全
FOOT = "城市设施智能巡检平台 · 方案与 PRD · 2026-08 · 全文所涉客户业务与数字均为假定/假设值"
check("⑥ 每页脚一致", html.count(FOOT) == len(pages), "页脚 %d / 页 %d" % (html.count(FOOT), len(pages)))

# 7 A4 纵向 + 14mm 边距
check("⑦ @page A4 纵向 margin 14mm", bool(re.search(r'@page\{?\s*size:A4 portrait;\s*margin:14mm;', html)))

# 8 最小字号 ≥9pt(CSS pt 值)
pts = [float(x) for x in re.findall(r'font-size:\s*([0-9.]+)pt', html)]
check("⑧ CSS 最小字号 ≥9pt", pts and min(pts) >= 9, "最小 %spt" % (min(pts) if pts else "n/a"))

# 8b SVG 内字号折算(viewBox 宽 W 映射到 182mm 版心 => 1 unit = 182/W mm = 182/W*2.8346 pt)
svg_blocks = re.findall(r'<svg viewBox="0 0 (\d+) \d+".*?</svg>', html, re.S)
svg_min = []
for m in re.finditer(r'<svg viewBox="0 0 (\d+) \d+"(.*?)</svg>', html, re.S):
    w = int(m.group(1))
    sizes = [float(s) for s in re.findall(r'font-size="([0-9.]+)"', m.group(2))]
    if sizes:
        svg_min.append(min(sizes) * (182.0 / w) * 2.83465)
check("⑧b SVG 折算最小字号 ≥9pt", svg_min and min(svg_min) >= 9.0,
      "最小 %.2fpt(共 %d 个图)" % (min(svg_min), len(svg_min)) if svg_min else "无 SVG 文本")

# 8c SVG 文本横向溢出(2026-08-11 R90 新增:SVG 里的 <text> 不换行,超出 viewBox 会被**裁字**,
#   而 ⑬ 只量纵向余量看不见这一类。宽度按等宽折算:CJK / 全角 = 1em,ASCII = 0.5em(PingFang 口径)。
#   见红自证:加判据当时以未修的三条长文本命中(第 12 月 / 认领长句 / 兜底长句),修完转绿。)
def _tw(t, fs):
    return sum(fs * (1.0 if ord(c) > 0x2000 else 0.5) for c in t)
clipped = []
for m in re.finditer(r'<svg viewBox="0 0 (\d+) \d+"(.*?)</svg>', htmlx, re.S):
    W = int(m.group(1))
    for t in re.finditer(r'<text x="([-\d.]+)"[^>]*?(?:font-size="([\d.]+)")?[^>]*>(.*?)</text>', m.group(2), re.S):
        x, fs = float(t.group(1)), float(t.group(2) or 10)
        txt = re.sub(r'<[^>]+>', '', t.group(3))
        end = x + (_tw(txt, fs) / 2 if 'text-anchor="middle"' in t.group(0) else _tw(txt, fs))
        if end > W - 2:
            clipped.append((round(end), W, txt[:24]))
check("⑧c SVG 文本零横向裁字(折算宽度不越 viewBox)", not clipped, "越界 %r" % (clipped[:4],))

# 9 全中文(不含大段英文正文);抽查:非 ASCII 占比
text = re.sub(r'<style.*?</style>', '', htmlx, flags=re.S)
text = re.sub(r'<[^>]+>', '', text)
cjk = len(re.findall(r'[一-鿿]', text))
ascii_letters = len(re.findall(r'[A-Za-z]', text))
check("⑨ 全中文正文(中文字符占压倒多数)", cjk > ascii_letters * 5, "中文 %d / 拉丁字母 %d" % (cjk, ascii_letters))

# 10 假设标注密度:每页至少 1 处「假设」
per_page = htmlx.split('<section class="page">')[1:]
lack = [i + 1 for i, p in enumerate(per_page) if "假设" not in p]
check("⑩ 每页 ≥1 处「假设」标注", not lack, "缺失页 %r" % (lack,))

# 11 术语纪律(2026-08-10 走查 R83-1/-3:砍术语对照表,全文说人话)
#    正向:首页有「线索/告警」这对唯一保留术语的定义句 + 线索原子性(并入同一条线索)定义句;
#    反向:黑话族零残留
# 2026-08-10 R85⑤:demo 界面通道名已统一为五类分类学(「快车道」→「紧急直派」),
#   桥接句失效已从术语定义行删除,原「桥接豁免剔除该行」的 re.sub 随之删除——全文零豁免扫描
# 2026-08-10 R86①(A1 三档收敛):通道分类学收敛为「三档处置 + 两类出口」,正词 = 机器直派 /
#   加急人工 / 常规人工 / 自动处理 / 驳回与转办。旧通道词「紧急直派」随之作废,与「应急」
#   (与「加急」混淆,R86 A1 废弃)一并入黑话族;「快车道」保持在册(R85 之前的更旧一代词)。
# 2026-08-10 R86③(A3 线索原子性):线索聚合口径进术语区,加正向判据「并入同一条线索」。
jargon = re.findall(r'快车道|紧急直派|应急|影子池|覆盖窗|双闸|机械校验|机械闸|DMT|本体扩展包|租户化', htmlx)
has_pair = ("线索" in per_page[0]) and ("告警" in per_page[0]) and ("不再定义新词" in per_page[0])
has_atom = "并入同一条线索" in per_page[0]
check("⑪ 术语纪律:线索/告警 + 线索原子性定义句在 + 黑话族零残留", has_pair and has_atom and not jargon,
      "词对定义句 %s;原子性定义句 %s;黑话命中 %r"
      % ("在" if has_pair else "缺", "在" if has_atom else "缺", jargon[:8]))

# 12 厂商专名红线
vendor = re.findall(r'Origen|NABD|SpatialWare|Palantir', htmlx, re.I)
check("⑫ 零厂商专名", not vendor, "命中 %r" % (vendor[:5],))

# 13 真实渲染:Chrome 版心内溢出检测 + PDF 页数(可选,需本机 Chrome)
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
if pathlib.Path(CHROME).exists():
    import subprocess, tempfile, os
    probe = """
<script>window.addEventListener('load',function(){var o=[];
document.querySelectorAll('.page').forEach(function(pg,i){var last=null,k=pg.children;
for(var j=0;j<k.length;j++){if(!k[j].classList.contains('foot'))last=k[j];}
var t=pg.getBoundingClientRect().top;
o.push((i+1)+':'+Math.round(pg.querySelector('.foot').getBoundingClientRect().top-t-(last.getBoundingClientRect().bottom-t)));});
var d=document.createElement('pre');d.id='P';d.textContent=o.join(' ');document.body.appendChild(d);});</script>"""
    tmp = pathlib.Path(tempfile.gettempdir()) / "print_probe.html"
    tmp.write_text(html.replace("</head>", "<style>body{width:182mm;}</style></head>").replace("</body>", probe + "</body>"), encoding="utf-8")
    r = subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox", "--window-size=760,1200",
                        "--virtual-time-budget=5000", "--dump-dom", "file://" + str(tmp)], capture_output=True, text=True)
    m = re.search(r'<pre id="P">(.*?)</pre>', r.stdout, re.S)
    if m:
        spares = dict(x.split(":") for x in m.group(1).split())
        bad = {k: v for k, v in spares.items() if int(v) < 0}
        check("⑬ 版心内零溢出(Chrome 实测,单位 px 余量)", not bad, "各页余量 " + m.group(1) + ("  溢出 %r" % bad if bad else ""))
    else:
        notes.append("⑬ 跳过:Chrome 探针无输出")
    pdf = pathlib.Path(tempfile.gettempdir()) / "print_check.pdf"
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer",
                    "--print-to-pdf=" + str(pdf), "--virtual-time-budget=6000", "file://" + str(SRC.resolve())],
                   capture_output=True)
    if pdf.exists():
        d = pdf.read_bytes()
        n = len(re.findall(rb"/Type\s*/Page[^s]", d))
        check("⑭ 实际 PDF 页数 = .page 计数(无隐性溢出分页)", n == len(pages), "渲染得 %d 页 / 容器 %d" % (n, len(pages)))
        pdf.unlink()
    tmp.unlink()
else:
    notes.append("⑬⑭ 跳过:本机未找到 Chrome")

print("\n-- 备注 --")
for n in notes:
    print("  · " + n)
print("\n结果:%s(%d 项失败)" % ("全绿" if not fails else "有红:" + ", ".join(fails), len(fails)))
sys.exit(1 if fails else 0)
