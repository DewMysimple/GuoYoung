"""Compare every returned desktop frame with the ORIGINAL settled card row.

Run analyze-glass-settling.py first with a stable title landmark (favicons can
load late), writing <capture>/card-0/settling-report.json. This second pass uses
raw lossless pixels: no spatial smoothing and no per-channel tolerance. A row
that remains different is reported as unrecovered, never as settled correctly.
Recovery requires 45 consecutive decoded frames with identical raw pixels.
Arrival gaps or uncertain preceding landmarks invalidate delay measurements;
elapsed milliseconds use presentation timestamps, not the nominal frame rate.
The default quiet material patches suit the dense desktop capture fixture;
inspect the regions/filmstrip before interpreting a different card layout.
"""
import argparse
import json
import subprocess
from pathlib import Path

import cv2
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("capture", type=Path)
parser.add_argument("--tracking", default="card-0/settling-report.json")
args = parser.parse_args()
root = args.capture
minimum_stable_frames = 45


def invalid(reason):
    (root / "raw-return.json").write_text(json.dumps({"status": "invalid", "invalidReasons": [reason],
                                                    "smoothing": False, "tolerance": 0}, indent=2), encoding="utf-8")
    raise SystemExit(f"Invalid return analysis: {reason}")


tracking = json.loads((root / args.tracking).read_text(encoding="utf-8"))
capture = json.loads((root / "report.json").read_text(encoding="utf-8"))
if not tracking["segments"]:
    invalid("No stable initial landmark was located")
initial = tracking["segments"][0]
fps = tracking["fps"]
segments = [s for s in tracking["segments"]
            if s["icon"] == initial["icon"] and s["end"] - s["start"] + 1 >= minimum_stable_frames]
if not np.isfinite(fps) or fps <= 0 or len(segments) < 3 or segments[0] != initial:
    invalid("Need an initial stable row and two complete returns to the same landmark")
landmarks = tracking["frames"]
if len(landmarks) != tracking["frameCount"] or any(row["frame"] != index for index, row in enumerate(landmarks)):
    invalid("Landmark tracking is incomplete or its frame indices are not continuous")
# DDA timestamps are wall-clock based. Retain nominal frame time separately.
probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                        "frame=best_effort_timestamp_time", "-of", "json", str(root / "desktop.mkv")],
                       check=True, capture_output=True, text=True)
try:
    timestamps = [float(frame["best_effort_timestamp_time"]) * 1000 for frame in json.loads(probe.stdout)["frames"]]
except (KeyError, TypeError, ValueError):
    invalid("Every decoded frame must have an ffprobe presentation timestamp")
if len(timestamps) != len(landmarks) or not all(np.isfinite(t) for t in timestamps) or any(b <= a for a, b in zip(timestamps, timestamps[1:])):
    invalid("Presentation timestamps must be complete and strictly increasing")
origin = timestamps[0]
timestamps = [value - origin for value in timestamps]
match_threshold = tracking["matchThreshold"]
arrival_checks = {}
previous = initial
for segment in segments[1:]:
    start, end = segment["start"], segment["end"]
    if not 0 < start <= end < len(landmarks) or start <= previous["end"]:
        invalid("Returned hold ranges overlap or are outside the recording")
    before = landmarks[start - 1]
    departure = next((row for row in landmarks[previous["end"] + 1:start]
                      if row["icon"] is not None and row["icon"] != initial["icon"]
                      and row["score"] >= match_threshold), None)
    reasons = []
    if departure is None:
        reasons.append("No confidently tracked departure separates the holds")
    if before["icon"] is None or before["score"] < match_threshold or before["icon"] == initial["icon"]:
        reasons.append("The preceding landmark cannot establish the first returned frame")
    if any(row["icon"] != initial["icon"] or row["score"] < match_threshold for row in landmarks[start:end + 1]):
        reasons.append("The returned hold contains missing or inconsistent landmark matches")
    arrival_gap = timestamps[start] - timestamps[start - 1]
    if arrival_gap > 1.5 * 1000 / fps:
        reasons.append("The arrival timestamp gap can conceal an unrecorded first return frame")
    arrival_checks[start] = {"valid": not reasons, "invalidReasons": reasons,
                             "departureFrame": departure["frame"] if departure else None,
                             "precedingFrame": {**before, "timestampMs": timestamps[start - 1]},
                             "arrivalFrame": {**landmarks[start], "timestampMs": timestamps[start]},
                             "arrivalGapMs": arrival_gap}
    previous = segment
ox = initial["icon"][0] - tracking["template"][0]
oy = initial["icon"][1] - tracking["template"][1]
cards = [c for c in capture["cards"] if abs(c["y"] - capture["cards"][0]["y"]) < 1]
regions = [(round(c["right"] + ox - 38), round(c["y"] + oy + 58), 28, 48) for c in cards]
offsets = [0, 1, 2, 3, 6, 12, 30]
wanted = {s["start"] + d for s in segments[1:] for d in offsets}
video = cv2.VideoCapture(str(root / "desktop.mkv"))
data, images, baseline, baseline_window, index = [], {}, None, [], 0
while True:
    ok, frame = video.read()
    if not ok:
        break
    if index >= len(timestamps):
        invalid("Desktop decode contains a frame absent from the timestamp/landmark records")
    patches = []
    for x, y, width, height in regions:
        if x < 0 or y < 0 or x + width > frame.shape[1] or y + height > frame.shape[0]:
            raise ValueError("A material patch is outside the recorded desktop")
        patches.append(frame[y:y + height, x:x + width].astype(np.int16))
    if initial["end"] - minimum_stable_frames + 1 <= index <= initial["end"]:
        baseline_window.append(patches)
    if index == initial["end"]:
        baseline = patches
    if baseline is not None:
        segment = next((s for s in segments[1:] if s["start"] <= index <= s["end"]), None)
        if segment:
            diffs = [np.abs(a - b) for a, b in zip(patches, baseline)]
            data.append({"frame": index, "timestampMs": timestamps[index], "nominalTimestampMs": index * 1000 / fps,
                         "segmentStart": segment["start"], "cards": [
                {"mean": float(d.mean()), "max": int(d.max()), "changedChannels": int(np.count_nonzero(d))}
                for d in diffs]})
    if index in wanted:
        images[index] = frame
    index += 1
video.release()
if index != tracking["frameCount"] or baseline is None:
    invalid("Desktop decode and landmark tracking have different frame counts")
reference_stable = len(baseline_window) == minimum_stable_frames and all(
    all(np.array_equal(patch, reference) for patch, reference in zip(frame, baseline)) for frame in baseline_window)
if not reference_stable:
    invalid("The original row lacks the required identical raw-pixel reference tail")
summary = []
for segment in segments[1:]:
    rows = [r for r in data if r["segmentStart"] == segment["start"]]
    if len(rows) != segment["end"] - segment["start"] + 1:
        invalid("A returned hold was not fully decoded")
    per_card = []
    for card in range(len(cards)):
        changed = [r["frame"] for r in rows if r["cards"][card]["changedChannels"]]
        last_changed = max(changed) if changed else None
        first_zero = last_changed + 1 if changed else segment["start"]
        zero_tail = segment["end"] - first_zero + 1
        recovered = zero_tail >= minimum_stable_frames
        measurable = recovered and arrival_checks[segment["start"]]["valid"]
        delay_frames = first_zero - segment["start"] if measurable else None
        per_card.append({"card": card, "firstDifference": rows[0]["cards"][card],
                         "lastChangedFrame": last_changed,
                         "lastChangedTimestampMs": timestamps[last_changed] if changed else None,
                         "continuousZeroTailFrames": zero_tail,
                         "continuousZeroTailMs": timestamps[segment["end"]] - timestamps[first_zero] if zero_tail else 0,
                         "zeroTailMaxFrameGapMs": max((timestamps[i] - timestamps[i - 1]
                                                      for i in range(first_zero + 1, segment["end"] + 1)), default=0),
                         "matchesReferenceAtEnd": zero_tail > 0,
                         "recovered": recovered,
                         "strictSettlingFrames": delay_frames,
                         "strictSettlingNominalMs": delay_frames * 1000 / fps if measurable else None,
                         "strictSettlingMs": timestamps[first_zero] - timestamps[segment["start"]] if measurable else None})
    summary.append({"start": segment["start"], "end": segment["end"],
                    "startTimestampMs": timestamps[segment["start"]], "endTimestampMs": timestamps[segment["end"]],
                    "maxFrameGapMs": max(timestamps[i] - timestamps[i - 1]
                                         for i in range(segment["start"], segment["end"] + 1)),
                    "arrival": arrival_checks[segment["start"]], "cards": per_card})
valid = all(s["arrival"]["valid"] for s in summary)
recovered = all(c["recovered"] for s in summary for c in s["cards"])
result = {"status": "invalid" if not valid else "recovered" if recovered else "unrecovered",
          "decodedFrames": index, "fps": fps, "timestampSource": "ffprobe best_effort_timestamp_time",
          "minimumStableTailFrames": minimum_stable_frames, "referenceStableFrames": len(baseline_window),
          "referenceFrame": initial["end"], "referenceTimestampMs": timestamps[initial["end"]],
          "regions": regions, "smoothing": False, "tolerance": 0, "returns": summary, "frames": data}
(root / "raw-return.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
print(json.dumps({"status": result["status"], "frames": index, "returnDelayFrames": [
    [c["strictSettlingFrames"] for c in s["cards"]] for s in summary], "returnDelaysMs": [
    [c["strictSettlingMs"] for c in s["cards"]] for s in summary]}))
sheet = np.full((len(summary) * 290, 1480, 3), 245, np.uint8)
for row, segment in enumerate(segments[1:]):
    for col, offset in enumerate(offsets):
        number = segment["start"] + offset
        frame = images[number]
        card = cards[0]
        x, y = round(card["x"] + ox), round(card["y"] + oy)
        crop = frame[y:y + round(card["height"]), x:x + round(card["width"])]
        sheet[row * 290 + 40:row * 290 + 240, col * 210 + 5:col * 210 + 209] = cv2.resize(
            crop, (204, 200), interpolation=cv2.INTER_NEAREST)
        cv2.putText(sheet, f"F{number} +{timestamps[number] - timestamps[segment['start']]:.0f}ms", (col * 210 + 5, row * 290 + 25),
                    cv2.FONT_HERSHEY_SIMPLEX, .55, (30, 30, 30), 1)
cv2.imwrite(str(root / "raw-return-filmstrip.png"), sheet)
if not valid or not recovered:
    raise SystemExit(1)
