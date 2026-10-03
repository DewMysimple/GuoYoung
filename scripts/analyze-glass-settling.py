"""Track a card landmark in every video frame, then measure material settling.

Use an unchanged icon as the template and a quiet, text-free material patch.
This measures post-scroll settling separately from the card's movement, unlike
whole-screen heatmaps. Codec noise and unrelated favicon changes need inspection;
one tracked patch cannot establish correctness of the entire page.
Requires OpenCV and NumPy. All outputs remain local diagnostic artifacts.
"""
import argparse
import json
from pathlib import Path

import cv2
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("video")
parser.add_argument("reference", help="Image containing the unchanged icon")
parser.add_argument("output")
parser.add_argument("--template", type=int, nargs=4, required=True, metavar=("X", "Y", "W", "H"))
parser.add_argument("--search", type=int, nargs=4, required=True, metavar=("X", "Y", "W", "H"))
parser.add_argument("--patch", type=int, nargs=4, required=True, metavar=("DX", "DY", "W", "H"), help="Material region relative to the matched icon")
parser.add_argument("--score", type=float, default=.93)
parser.add_argument("--difference", type=float, default=1., help="Mean RGB difference from settled patch, on the 0–255 scale")
parser.add_argument("--minimum-frames", type=int, default=12)
args = parser.parse_args()
output = Path(args.output)
output.mkdir(parents=True, exist_ok=True)
reference = cv2.imread(args.reference)
if reference is None:
    raise ValueError("Cannot read reference image")
x, y, w, h = args.template
template = cv2.cvtColor(reference[y:y+h, x:x+w], cv2.COLOR_BGR2GRAY)
sx, sy, sw, sh = args.search
dx, dy, pw, ph = args.patch
video = cv2.VideoCapture(args.video)
fps = video.get(cv2.CAP_PROP_FPS)
if not video.isOpened() or fps <= 0:
    raise ValueError("Cannot decode video or determine frame rate")
rows, patches = [], []
while True:
    ok, frame = video.read()
    if not ok:
        break
    search = cv2.cvtColor(frame[sy:sy+sh, sx:sx+sw], cv2.COLOR_BGR2GRAY)
    matches = cv2.matchTemplate(search, template, cv2.TM_CCOEFF_NORMED)
    _, score, _, point = cv2.minMaxLoc(matches)
    ix, iy = point[0] + sx, point[1] + sy
    patch = None
    if score >= args.score and 0 <= ix+dx and 0 <= iy+dy and ix+dx+pw <= frame.shape[1] and iy+dy+ph <= frame.shape[0]:
        # Mild spatial smoothing reduces video codec noise. Preserve numeric
        # differences; the declared threshold affects only settling time.
        patch = cv2.GaussianBlur(frame[iy+dy:iy+dy+ph, ix+dx:ix+dx+pw], (9, 9), 0).astype(float)
    rows.append({"frame": len(rows), "seconds": len(rows)/fps, "icon": [ix, iy] if patch is not None else None, "score": score})
    patches.append(patch)
video.release()

segments, start = [], 0
while start < len(rows):
    icon, end = rows[start]["icon"], start + 1
    if icon is None:
        start = end
        continue
    while end < len(rows) and rows[end]["icon"] == icon:
        end += 1
    if end-start >= args.minimum_frames:
        anchor = patches[end-1]
        differences = [float(np.abs(patches[index]-anchor).mean()) for index in range(start, end)]
        last = max([index for index, delta in enumerate(differences) if delta > args.difference] + [-1])
        segments.append({"start": start, "end": end-1, "startSeconds": start/fps, "endSeconds": (end-1)/fps,
                         "icon": icon, "initialDifference": differences[0],
                         "lastDifferenceFrame": start+last if last >= 0 else None,
                         "settleDelayMs": (last+1)/fps*1000})
        for index, delta in zip(range(start, end), differences):
            rows[index]["differenceFromSettled"] = delta
    start = end

report = {"fps": fps, "frameCount": len(rows), "template": args.template, "search": args.search, "patch": args.patch,
          "matchThreshold": args.score, "differenceThreshold": args.difference, "segments": segments, "frames": rows}
(output/"settling-report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
chart = np.full((520, 1400, 3), 255, np.uint8)
plot_left, plot_right = 90, 1360
def plot_x(index):
    return round(plot_left + index / max(1, len(rows)-1) * (plot_right-plot_left))
for segment in segments:
    if segment["lastDifferenceFrame"] is not None:
        cv2.rectangle(chart, (plot_x(segment["start"]), 45), (plot_x(segment["lastDifferenceFrame"]), 470), (225, 240, 255), -1)
for top, label in [(50, "Tracked icon Y (px): flat means card stopped"), (290, "Material difference from settled frame (mean RGB / 255)")]:
    cv2.putText(chart, label, (90, top-15), cv2.FONT_HERSHEY_SIMPLEX, .6, (30, 30, 30), 1)
    cv2.line(chart, (plot_left, top+170), (plot_right, top+170), (100, 100, 100), 1)
for second in range(int(len(rows)/fps)+1):
    x = plot_x(second*fps)
    cv2.line(chart, (x, 45), (x, 470), (220, 220, 220), 1)
    cv2.putText(chart, f"{second}s", (x-8, 498), cv2.FONT_HERSHEY_SIMPLEX, .5, (60, 60, 60), 1)
max_y = max([row["icon"][1] for row in rows if row["icon"] is not None] + [1])
max_delta = max([row.get("differenceFromSettled", 0) for row in rows] + [1])
for index in range(1, len(rows)):
    previous, current = rows[index-1], rows[index]
    if previous["icon"] is not None and current["icon"] is not None:
        cv2.line(chart, (plot_x(index-1), round(50+previous["icon"][1]/max_y*170)), (plot_x(index), round(50+current["icon"][1]/max_y*170)), (190, 90, 30), 2)
    if "differenceFromSettled" in previous and "differenceFromSettled" in current:
        cv2.line(chart, (plot_x(index-1), round(460-previous["differenceFromSettled"]/max_delta*170)), (plot_x(index), round(460-current["differenceFromSettled"]/max_delta*170)), (30, 70, 210), 2)
cv2.putText(chart, str(max_y), (20, 220), cv2.FONT_HERSHEY_SIMPLEX, .5, (60, 60, 60), 1)
cv2.putText(chart, f"{max_delta:.1f}", (20, 300), cv2.FONT_HERSHEY_SIMPLEX, .5, (60, 60, 60), 1)
cv2.imwrite(str(output/"settling-timeline.png"), chart)
print(json.dumps({"frameCount": len(rows), "fps": fps, "segments": segments}, indent=2))
