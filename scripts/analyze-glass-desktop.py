"""Render every captured frame as baseline/adjacent-frame heatmaps.

Usage: python scripts/analyze-glass-desktop.py <capture directory>
Requires OpenCV and NumPy. Input must have a successful foreground-guard report.
All pixels remain visible in the heatmaps. The separate remote-change summary
excludes the exercised left cards/navigation and asynchronously loaded favicons.
"""
import cv2
import json
import numpy as np
from pathlib import Path
import re
import sys

root = Path(sys.argv[1])
report = json.loads((root / "report.json").read_text(encoding="utf-8"))
output = root / "heatmaps"
output.mkdir(exist_ok=True)
video = cv2.VideoCapture(str(root / "desktop.mkv"))
ok, baseline = video.read()
if not ok:
    sys.exit("Cannot decode the desktop recording")
snapshot = cv2.imread(str(root / "before.png"))
# Register browser coordinates to physical desktop pixels. A real wallpaper
# patch validates that the desktop recording actually contains the test page.
match = cv2.matchTemplate(baseline, snapshot[240:310, 900:1020], cv2.TM_SQDIFF_NORMED)
error, _, point, _ = cv2.minMaxLoc(match)
if error > .00001:
    sys.exit("Desktop/browser alignment failed; do not interpret this recording")
dx, dy = point[0] - 900, point[1] - 240
remote = np.ones(baseline.shape[:2], dtype=np.uint8)
remote[:dy] = 0  # Browser chrome is outside the application.
remote[dy + 130:, :round(report["cards"][0]["x"] + dx - 20)] = 0
for card in report["cards"][:4]:
    x, y, w, h = [round(card[key]) for key in ("x", "y", "width", "height")]
    remote[max(0, y + dy - 18):y + dy + h + 18,
           max(0, x + dx - 18):x + dx + w + 18] = 0
for card in report["cards"]:
    x, y = round(card["x"] + dx), round(card["y"] + dy)
    remote[max(0, y + 7):max(0, y + 50), max(0, x + 7):max(0, x + 50)] = 0
start = float(re.search(r"start: ([0-9.]+)", (root / "ffmpeg.log").read_text(encoding="utf-8")).group(1))
pointer_timing = "capture-clock"
if start < 1_000_000_000:
    start = report["recordingStarted"] / 1000
    pointer_timing = "approximate-process-start"
events = iter(report.get("observedPointerEvents") or report["events"])
next_event = next(events, None)
pointer = None
previous = baseline
frame = baseline
index = 0
rows = []
peak = {"remotePixels": -1}
visual_peak = {"pixels": -1}
while ok:
    seconds = video.get(cv2.CAP_PROP_POS_MSEC) / 1000
    while next_event and next_event["time"] / 1000 <= start + seconds:
        pointer = (round(next_event["x"] + dx), round(next_event["y"] + dy))
        next_event = next(events, None)
    panels = []
    row = {"frame": index, "seconds": seconds}
    for label, reference in (("baseline", baseline), ("previous", previous)):
        difference = np.max(cv2.absdiff(reference, frame), axis=2)
        # Every nonzero difference is visible; no tolerance hides weak changes.
        level = np.where(difference > 0, np.minimum(55 + np.log2(1 + difference.astype(float)) * 25, 255), 0).astype("uint8")
        heat = cv2.applyColorMap(level, cv2.COLORMAP_TURBO)
        heat[difference == 0] = 0
        if pointer:
            cv2.drawMarker(heat, pointer, (255, 255, 255), cv2.MARKER_CROSS, 22, 1)
        cv2.putText(heat, f"{index:04d} {seconds:.3f}s {label}; max delta {difference.max()}",
                    (15, 28), cv2.FONT_HERSHEY_SIMPLEX, .6, (255, 255, 255), 1)
        panels.append(heat)
        row[label] = {"pixels": int((difference > 0).sum()), "maxDelta": int(difference.max())}
        row[label]["remotePixels"] = int(((difference > 0) & (remote > 0)).sum())
        if label == "baseline":
            distant = difference * remote
            row.update(remotePixels=int((distant > 0).sum()), remoteMaxDelta=int(distant.max()))
    combined = np.hstack(panels)
    if not cv2.imwrite(str(output / f"{index:04d}.png"), combined):
        sys.exit(f"Cannot save heatmap for frame {index}")
    if row["baseline"]["pixels"] > visual_peak["pixels"]:
        visual_peak = {"frame": index, **row["baseline"]}
        cv2.imwrite(str(root / "peak-heatmap.png"), combined)
    if row["remotePixels"] > peak["remotePixels"]:
        peak = row
        cv2.imwrite(str(root / "peak.png"), frame)
    rows.append(row)
    previous = frame
    ok, frame = video.read()
    index += 1
video.release()
summary = {"alignment": [dx, dy], "pointerTiming": pointer_timing, "frames": index, "peak": peak,
           "visualPeak": visual_peak,
           "changedFrames": sum(row["remotePixels"] > 0 for row in rows), "rows": rows}
(root / "heatmap-report.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
viewer = """<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>整屏逐帧热力图</title><style>
body{background:#101014;color:#eee;font:16px system-ui;margin:20px}
img{width:100%;height:auto}input{width:65%}button{padding:8px;margin-right:8px}
p{line-height:1.6}output{font-variant-numeric:tabular-nums}
</style><h1>整屏逐帧热力图</h1>
<p>左：与录制首帧比较；右：与上一帧比较。黑色为完全未变化，其余色差经对数增强。
所有画面像素均参与绘图，没有遮掉任何区域。白色十字标记鼠标位置；时间精度见下方。</p>
<p id="timing"></p><button id="prev">上一帧</button><button id="next">下一帧</button>
<button id="play">播放 / 暂停</button><input aria-label="帧序号" id="slider" type="range" min="0" value="0">
<output id="label"></output><p id="metrics"></p><img id="frame" alt="当前帧双热力图">
<script>const report=REPORT_DATA;const slider=document.querySelector('#slider');
slider.max=report.frames-1;
document.querySelector('#timing').textContent=report.pointerTiming==='capture-clock'
?'鼠标按采集时钟对齐。':'鼠标按进程启动时间近似对齐，不能据此推断毫秒级因果。';
function show(){const n=+slider.value,r=report.rows[n];
document.querySelector('#frame').src='heatmaps/'+String(n).padStart(4,'0')+'.png';
document.querySelector('#label').textContent=` ${n+1} / ${report.frames} · ${r.seconds.toFixed(3)}s`;
document.querySelector('#metrics').textContent=`整屏差异：基准 ${r.baseline.pixels} 像素，相邻 ${r.previous.pixels} 像素。远端统计 ${r.remotePixels} 像素（仅统计排除了实际遍历的左侧卡片、导航及异步图标，热力图未排除）。`;}
function step(n){slider.value=Math.max(0,Math.min(+slider.max,+slider.value+n));show();}
slider.oninput=show;document.querySelector('#prev').onclick=()=>step(-1);
document.querySelector('#next').onclick=()=>step(1);let timer;
document.querySelector('#play').onclick=()=>{if(timer){clearInterval(timer);timer=null;}
else timer=setInterval(()=>step(+slider.value===+slider.max?-slider.max:1),100);};
document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();step(-1);}
if(e.key==='ArrowRight'){e.preventDefault();step(1);}});show();</script></html>"""
(root / "heatmap-viewer.html").write_text(viewer.replace("REPORT_DATA", json.dumps(summary)), encoding="utf-8")
print(json.dumps({key: value for key, value in summary.items() if key != "rows"}))
sys.exit(1 if summary["changedFrames"] else 0)
