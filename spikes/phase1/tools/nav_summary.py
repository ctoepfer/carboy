"""Summarize the navigation test (GRAPH_REPORT finding 3) from the app's log.

Counts page loads per page from the "[webview] /<page>: ..." lines, and reads
which page wrote the final report. A clean run: the checks page loads once,
the target graph page loads once (no extra loads), and the final report
is the graph's.
"""

import json
import re
import sys

log_path, report_path = sys.argv[1], sys.argv[2]
lines = open(log_path, encoding="utf-8", errors="replace").read().splitlines()
loads = {}
for line in lines:
    # Every page logs "loaded" once per load (shared/nav.js).
    m = re.match(r"\[webview\] (/[^:]+): loaded$", line)
    if m:
        loads[m.group(1)] = loads.get(m.group(1), 0) + 1
try:
    report = json.load(open(report_path, encoding="utf-8"))
except Exception as e:  # noqa: BLE001
    report = {"error": str(e)}
summary = {
    "page_loads": loads,
    "extra_loads": sum(v - 1 for v in loads.values() if v > 1),
    "checks_completions": sum("done, auto=" in l for l in lines),
    "nav_click_logged": any("nav test: clicking" in l for l in lines),
    "final_report_is_graph": "framework" in report,
    "graph_passed": report.get("passed"),
    "graph_total": report.get("total"),
    "log_lines": len(lines),
}
print(json.dumps(summary, indent=2))
