"""Stop desktop diagnostics when their own test window loses the foreground."""
import ctypes
from ctypes import wintypes
import json
from pathlib import Path
import sys
import threading
import time

user32 = ctypes.windll.user32
user32.GetForegroundWindow.restype = ctypes.c_void_p
user32.SetForegroundWindow.argtypes = [ctypes.c_void_p]
user32.IsWindow.argtypes = [ctypes.c_void_p]
user32.IsWindowVisible.argtypes = [ctypes.c_void_p]
user32.GetClientRect.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.RECT)]
user32.ClientToScreen.argtypes = [ctypes.c_void_p, ctypes.POINTER(wintypes.POINT)]
matches = []
callback_type = ctypes.WINFUNCTYPE(ctypes.c_bool, ctypes.c_void_p, ctypes.c_void_p)


@callback_type
def find_window(hwnd, _):
    title = ctypes.create_unicode_buffer(512)
    user32.GetWindowTextW(ctypes.c_void_p(hwnd), title, len(title))
    if title.value.startswith("Mysimple glass desktop diagnostic"):
        matches.append(hwnd)
    return True


user32.EnumWindows(find_window, 0)
if len(matches) != 1:
    sys.exit("Expected exactly one diagnostic browser window")
target = matches[0]
user32.SetForegroundWindow(target)
time.sleep(.2)
if user32.GetForegroundWindow() != target:
    sys.exit("Diagnostic window is not in the foreground; capture was not started")
widgets = []


@callback_type
def find_viewport(hwnd, _):
    name = ctypes.create_unicode_buffer(128)
    user32.GetClassNameW(ctypes.c_void_p(hwnd), name, len(name))
    if name.value == "Chrome_RenderWidgetHostHWND" and user32.IsWindowVisible(hwnd):
        rect = wintypes.RECT()
        origin = wintypes.POINT(0, 0)
        user32.GetClientRect(hwnd, ctypes.byref(rect))
        user32.ClientToScreen(hwnd, ctypes.byref(origin))
        widgets.append({"x": origin.x, "y": origin.y, "width": rect.right, "height": rect.bottom})
    return True


user32.EnumChildWindows(ctypes.c_void_p(target), find_viewport, 0)
if not widgets:
    sys.exit("Cannot locate the diagnostic browser's native viewport")
viewport = max(widgets, key=lambda item: item["width"] * item["height"])
if len(sys.argv) > 1:
    Path(sys.argv[1]).write_text(json.dumps(viewport), encoding="utf-8")


def move_pointer():
    for line in sys.stdin:
        point = json.loads(line)
        if user32.GetForegroundWindow() != target:
            return
        user32.SetCursorPos(round(viewport["x"] + point["x"]), round(viewport["y"] + point["y"]))


threading.Thread(target=move_pointer, daemon=True).start()
print("ready", flush=True)
while user32.IsWindow(target):
    if user32.GetForegroundWindow() != target:
        sys.exit("Diagnostic window lost foreground; recording is invalid")
    time.sleep(.05)
