"""Read the spike app's accessibility tree over AT-SPI: the same tree Orca
reads. Read-only, except that it moves keyboard focus to the first stage.

Run with the system Python (it needs python3-gi and AT-SPI 2):
    SPIKE_START=graph-react/index.html src-tauri/target/debug/spike-shell &
    /usr/bin/python3 spikes/phase1/tools/atspi_check.py spike-shell 4
This is not a substitute for listening with Orca; it checks names, roles,
descriptions, focusability, and live regions.
"""
import json, sys, time
import gi
gi.require_version("Atspi", "2.0")
from gi.repository import Atspi

def find_app(name, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        desk = Atspi.get_desktop(0)
        for i in range(desk.get_child_count()):
            app = desk.get_child_at_index(i)
            if app and name in (app.get_name() or ""):
                return app
        time.sleep(0.5)
    return None

def info(o):
    try:
        attrs = o.get_attributes() or {}
    except Exception:
        attrs = {}
    st = o.get_state_set()
    return {
        "role": o.get_role_name(),
        "name": o.get_name(),
        "description": o.get_description(),
        "focusable": st.contains(Atspi.StateType.FOCUSABLE),
        "enabled": st.contains(Atspi.StateType.ENABLED),
        "live": attrs.get("live") or attrs.get("container-live"),
        "roledescription": attrs.get("roledescription"),
    }

def walk(o, depth=0, out=None, limit=4000):
    out = [] if out is None else out
    if o is None or len(out) > limit or depth > 60:
        return out
    out.append((depth, o))
    for i in range(o.get_child_count()):
        walk(o.get_child_at_index(i), depth + 1, out, limit)
    return out

app = find_app(sys.argv[1])
if not app:
    print(json.dumps({"error": "app not found on the accessibility bus"})); sys.exit(1)
time.sleep(float(sys.argv[2]) if len(sys.argv) > 2 else 3)
nodes = walk(app)
items = [info(o) for _, o in nodes]
stages = [i for i in items if (i["name"] or "").startswith("Stage ")]
summary = {
    "objects": len(items),
    "stages": len(stages),
    "stage_sample": stages[:2],
    "stages_focusable": sum(1 for s in stages if s["focusable"]),
    "buttons": [(i["name"], i["enabled"]) for i in items if i["role"] in ("push button", "button")],
    "live_regions": [i for i in items if i["live"]],
    "landmarks_and_headings": [(i["role"], i["name"]) for i in items if i["role"] in ("heading", "landmark", "navigation", "toolbar", "complementary", "main")][:20],
    "links": [i["name"] for i in items if i["role"] == "link"],
    "unnamed_focusable": [(i["role"], i["description"][:60]) for i in items
                          if i["focusable"] and not (i["name"] or "").strip()
                          and i["role"] not in ("frame", "document web", "embedded", "panel", "section", "paragraph", "scroll pane")][:20],
    "form_fields": [(i["role"], i["name"]) for i in items if i["role"] in ("combo box", "entry", "spin button", "check box")],
    "graph_container": [i for i in items if (i["name"] or "").startswith("Process graph of")][:1],
}
# Focus the first stage like Tab would, then read what has focus.
if stages:
    for _, o in nodes:
        if (o.get_name() or "").startswith("Stage 1 of"):
            comp = o.get_component_iface()
            summary["grab_focus"] = bool(comp and comp.grab_focus())
            time.sleep(0.5)
            summary["focused_after_grab"] = info(o)["name"] if o.get_state_set().contains(Atspi.StateType.FOCUSED) else None
            break
print(json.dumps(summary, indent=1))
