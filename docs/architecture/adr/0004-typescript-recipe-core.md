# ADR 0004: Pure TypeScript Recipe Core with cross-language fixture parity

- Status: Proposed
- Date: 2026-10-09
- Decision owner: Charles Toepfer

## Context

Existing recipe logic is Python: Lumina's recipes brain (~9.8k lines,
including ~260 lines of beer formulas in `stats_hooks.py`) and brewconvert
(MIT, ~3k+ lines, BeerXML and conversion diagnostics). iOS cannot run a
Python sidecar, and embedding Python in-process on mobile would need custom
native plugins per platform (port sizing from the maintainers' reuse review).

## Decision (proposed)

- Write Recipe Core and Recipe Format in **pure TypeScript** with no DOM,
  Node, or shell dependencies, so they run unchanged inside the webview on all
  platforms with no binding layer.
- **Port** the beer formulas, typed quantity/provenance model, statistics
  layering, and import validation rules from Lumina; **port** BeerXML
  import/export and the diagnostics/report model from brewconvert.
- Keep Lumina and brewconvert as the Python implementations. A **shared
  fixture suite** (input files, expected recipe model, expected statistics,
  expected conversion reports) is the contract that keeps the TypeScript and
  Python implementations in agreement. Discrepancies are investigated, not
  assumed to be either side's fault.
- Use decimal arithmetic for quantities (matching brewconvert's `Decimal`),
  with a documented precision and rounding policy; round only for display.

## Alternatives considered

| Option | Why not |
|---|---|
| Python core (sidecar) | No iOS path; makes import/export depend on Python. |
| Rust core (native + WASM + PyO3 for Lumina) | One implementation for everyone, but three binding layers and a third language maintained in depth, for a small formula set. Revisit if Lumina and Carboy need byte-identical behavior at scale. |
| TypeScript calculations + Python brewconvert for formats | Import/export unavailable on iOS; two runtimes for one feature. |

## Consequences

- Two implementations of format logic (Python and TypeScript) must be kept in
  agreement; the fixture suite and CI are mandatory, not optional.
- The brewconvert port is the largest reuse cost; size it in Phase 0.

## Evidence required to accept

1. Phase 0 sizing of the brewconvert port and Lumina formula port.
2. Phase 1: the same Recipe Core build computes a verified result on desktop,
   Android, and iOS.
3. A first parity fixture passes against both Lumina/brewconvert and the
   TypeScript core.
