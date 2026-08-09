#!/usr/bin/env python3
"""print.html 形制自检(W2-PDF)。零依赖,只用标准库。"""
import re, sys, pathlib

SRC = pathlib.Path(__file__).with_name("print.html")
html = SRC.read_text(encoding="utf-8")
fails, notes = [], []

def check(name, ok, detail=""):
    print(("  PASS  " if ok else "  FAIL  ") + name + (("  -> " + detail) if detail else ""))
    if not ok:
        fails.append(name)

print("== print.html 形制自检 ==  文件:%s  字节:%d" % (SRC, len(html.encode("utf-8"))))

# 1 零外链
links = re.findall(r'https?://[^\s"\'<>)]*', html)
check("① 零外链(无 http:// 或 https://)", not links, "命中 %r" % (links[:5],))

# 2 零 <img>
imgs = re.findall(r'<img\b', html, re.I)
check("② 零 <img>(证据/图示全 inline SVG)", not imgs, "命中 %d 处" % len(imgs))

# 2b 确有 inline SVG
svgs = re.findall(r'<svg\b', html, re.I)
check("②b inline SVG 存在", len(svgs) >= 4, "共 %d 个 <svg>" % len(svgs))

# 3 零 R 编号残留(正文里的内部索引 R1..R99);排除 R&D / RBAC 等误伤
rnums = re.findall(r'R\d{1,2}', html)
misfire = [m for m in re.findall(r'R&D|RBAC|RTL', html)]
check("③ 零内部 R 编号残留(正则 R\\d{1,2})", not rnums, "命中 %r" % (rnums[:10],))
notes.append("误伤自查:R&D/RBAC/RTL 类词命中 %d 处(不计入 R\\d 正则,已确认无误伤)" % len(misfire))

# 3b 其它内部索引抽查(HW-xx / A-xx / PM-Bx 之类不应出现在评审稿)
other_idx = re.findall(r'\bHW-\d+|\bPM-B\d|判官标注件|反审 [FM]\d+', html)
check("③b 零其它内部索引(HW-/PM-B/判官标注件/反审)", not other_idx, "命中 %r" % (other_idx[:8],))

# 4 页数(2026-08-10 走查 R83-11:页数弹性放开;硬约束只剩 题面①≤3页 + 全文上限 12)
pages = re.findall(r'<section class="page">', html)
p1 = len(re.findall(r'交付① 平台规划', html))
check("④ 页数:交付① ≤3 且全文 ≤12", p1 <= 3 and len(pages) <= 12,
      "交付① %d 页 / 全文 %d 页" % (p1, len(pages)))
notes.append("页容器 = %d(交付① %d 页 + 交付② %d 页)" % (len(pages), p1, len(pages) - p1))

# 5 禁色值(黑金)
bad_color = re.findall(r'#d4af37|#ffd700|gold|黑金', html, re.I)
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

# 9 全中文(不含大段英文正文);抽查:非 ASCII 占比
text = re.sub(r'<style.*?</style>', '', html, flags=re.S)
text = re.sub(r'<[^>]+>', '', text)
cjk = len(re.findall(r'[一-鿿]', text))
ascii_letters = len(re.findall(r'[A-Za-z]', text))
check("⑨ 全中文正文(中文字符占压倒多数)", cjk > ascii_letters * 5, "中文 %d / 拉丁字母 %d" % (cjk, ascii_letters))

# 10 假设标注密度:每页至少 1 处「假设」
per_page = html.split('<section class="page">')[1:]
lack = [i + 1 for i, p in enumerate(per_page) if "假设" not in p]
check("⑩ 每页 ≥1 处「假设」标注", not lack, "缺失页 %r" % (lack,))

# 11 术语纪律(2026-08-10 走查 R83-1/-3:砍术语对照表,全文说人话)
#    正向:首页有「线索/告警」这对唯一保留术语的定义句;反向:黑话族零残留
# R83 E4 桥接豁免:术语定义行里「演示界面快车道=本文紧急直派」是唯一许可的交叉命名点,扫描时剔除该行
html_scan = re.sub(r'<p class="tt">全文只需要记一对词.*?</p>', '', html, flags=re.S)
jargon = re.findall(r'快车道|影子池|覆盖窗|双闸|机械校验|机械闸|DMT|本体扩展包|租户化', html_scan)
has_pair = ("线索" in per_page[0]) and ("告警" in per_page[0]) and ("不再定义新词" in per_page[0])
check("⑪ 术语纪律:线索/告警定义句在 + 黑话族零残留", has_pair and not jargon,
      "定义句 %s;黑话命中 %r" % ("在" if has_pair else "缺", jargon[:8]))

# 12 厂商专名红线
vendor = re.findall(r'Origen|NABD|SpatialWare|Palantir', html, re.I)
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
