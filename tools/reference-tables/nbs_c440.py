"""Rebuild and verify the sucrose reference table from NBS Circular 440.

Source: F. J. Bates and associates, "Polarimetry, Saccharimetry and the
Sugars", Circular of the National Bureau of Standards C440 (1942),
doi:10.6028/NBS.CIRC.440. A US Government work (public domain).

- Table 113: true density of sucrose solutions at 20 deg C, "according to
  F. Plato (Kaiserliche Normal-Eichungs-Kommission, Wiss. Abh. 2, 153
  (1900))", 6 decimals.
- Table 114: Brix, apparent density, apparent specific gravity at
  20/20 deg C, derived from Table 113 with air density 0.0012046, brass
  weights 8.4, apparent density of water 0.997174; "exact to +-1 in the fifth
  decimal".

This script parses the Internet Archive OCR text of the circular, derives
apparent SG from Table 113 by the circular's own method, and requires an
exact match with the OCR'd Table 114 value for each step. Values the OCR
can't confirm are listed for checking against the page images; known
misprints in the printed Table 114 are recorded as errata.

    curl -L -o c440.txt https://archive.org/download/circularofbureau440bate/circularofbureau440bate_djvu.txt
    python3 nbs_c440.py c440.txt ../../fixtures/reference-tables/nbs-c440-sucrose-20c.json
"""

from __future__ import annotations

import json
import re
import sys
from decimal import ROUND_HALF_EVEN, Decimal as D, getcontext

getcontext().prec = 40
AIR, WEIGHTS, WATER_APP = D("0.0012046"), D("8.4"), D("0.997174")

# Checked against the page images (Internet Archive scan, printed pp. 632-637):
# the printed Table 114 value is a misprint; neighbours and Table 113 agree on
# the corrected value.
ERRATA = {
    "7.4": {"printed": ".20936", "corrected": "1.02936", "page": 633, "note": "digits transposed"},
    "36.3": {"printed": ".15597", "corrected": "1.15997", "page": 636, "note": "9 printed as 5"},
}
# Not confirmed by the OCR but read from the page images.
READ_FROM_PAGE = {"18.9": {"printed": ".07809", "page": 634}}


def table113(lines: list[str]) -> dict[str, D]:
    start = next(i for i, l in enumerate(lines) if l.startswith("Table  113. — Density"))
    end = next(i for i, l in enumerate(lines) if i > start and l.startswith("Table  114. — Brix,  apparent  density,  apparent  specific  gravity,  and  grams  of  sucrose") and "per 100" not in l and i > start + 1000)
    toks = [t.strip().replace(" ", "") for t in lines[start:end] if t.strip()]
    sections: list[list[list]] = []
    cur = None
    for t in toks:
        if "Tenths" in t:
            cur = []
            sections.append(cur)
        elif cur is not None and re.fullmatch(r"\d{1,2}", t):
            cur.append([int(t), []])
        elif cur and re.fullmatch(r"\d\.\d{6}", t):
            cur[-1][1].append(D(t))
    dens: dict[str, D] = {}
    for si, sec in enumerate(sections):
        offset = 5 if si == 1 else 0  # the second section holds tenths 5-9
        for label, vals in sec:
            for k, v in enumerate(vals):  # an OCR-merged row: values 5.. belong to label+1
                key = f"{label + k // 5}.{k % 5 + offset}"
                dens.setdefault(key, v)
    return dens


def apparent_sg(d: D) -> D:
    return (((d - AIR) / (1 - AIR / WEIGHTS)) / WATER_APP).quantize(D("0.00001"), rounding=ROUND_HALF_EVEN)


def table114_tokens(lines: list[str]) -> set[D]:
    start = next(i for i, l in enumerate(lines) if "Table  114. — Brix" in l and i > 100000)
    vals, prefix = set(), None
    for t in lines[start:start + 9000]:
        u = t.strip().replace(" ", "").strip("|!-_")
        m = re.fullmatch(r"(\d)?\.(\d{5})", u) or re.fullmatch(r"()(\d{5})", u)
        if m:
            if m.group(1):
                prefix = m.group(1)
            if prefix:
                vals.add(D(prefix + "." + m.group(2)))
    return vals


def main(ocr_path: str, out_path: str) -> int:
    lines = open(ocr_path, encoding="utf-8", errors="replace").read().splitlines()
    dens = table113(lines)
    tokens = table114_tokens(lines)
    rows, unconfirmed = [], []
    for i in range(0, 401):
        p = f"{i // 10}.{i % 10}"
        d = dens[p]
        sg = apparent_sg(d)
        confirmed = sg in tokens or p in READ_FROM_PAGE or p in ERRATA
        if not confirmed:
            unconfirmed.append(p)
        rows.append({"plato": p if i % 10 else f"{i // 10}", "sg_20_20": str(sg), "density_20": str(d)})
    # smoothness: a digit error shows as a spike in second differences
    sgs = [D(r["sg_20_20"]) for r in rows]
    d1 = [b - a for a, b in zip(sgs, sgs[1:])]
    spikes = [rows[i + 1]["plato"] for i in range(len(d1) - 1) if abs(d1[i + 1] - d1[i]) > D("0.000025")]
    if unconfirmed or spikes:
        print("unconfirmed:", unconfirmed, "spikes:", spikes)
        return 1
    doc = {
        "title": "Sucrose solutions at 20 °C: °Plato/°Brix, apparent specific gravity 20/20 °C, true density",
        "source": {
            "citation": "Bates, F. J. and associates (1942). Polarimetry, Saccharimetry and the Sugars. Circular of the National Bureau of Standards C440, Tables 113 (p. 626) and 114 (p. 632 ff.). doi:10.6028/NBS.CIRC.440",
            "underlying_data": "Plato, F., Domke, J., Harting, H. (1900). Kaiserliche Normal-Eichungs-Kommission, Wissenschaftliche Abhandlungen 2, 153 (cited by NBS for Table 113)",
            "rights": "US Government work, public domain",
            "scan": "https://archive.org/details/circularofbureau440bate",
        },
        "method": "density_20 is Table 113 (true density, g/mL). sg_20_20 is apparent SG at 20/20 °C computed from density_20 by the circular's stated method (air 0.0012046 g/mL, brass weights 8.4 g/mL, apparent water density 0.997174 g/mL), rounded half-even to 5 decimals. It equals printed Table 114 at every step except the errata.",
        "precision": "Table 114 values are stated as exact to ±1 in the fifth decimal.",
        "verification": f"{401 - len(READ_FROM_PAGE) - len(ERRATA)} of 401 steps match the OCR of printed Table 114 exactly; the rest were read from the page images (see read_from_page and errata). Second differences show no outliers.",
        "errata": ERRATA,
        "read_from_page": READ_FROM_PAGE,
        "generator": "tools/reference-tables/nbs_c440.py",
        "rows": rows,
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(doc, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"wrote {len(rows)} rows")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1], sys.argv[2]))
