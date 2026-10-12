# ADR 0005: One BrewIO host protocol over stdio or WebSocket

- Status: Proposed
- Date: 2026-10-09
- Decision owner: Charles Toepfer

## Context

Hardware drivers (simulator, Tilt BLE, iSpindel HTTP; others stubbed) live in
Python in `codesamples/brewpanel/`, the future Pacific BrewIO. Desktop can run Python
as a sidecar; mobile cannot, and mobile cannot monitor reliably in the
background or receive iSpindel pushes. Building native mobile drivers would
create a second and third hardware implementation.

## Decision (proposed)

- One **BrewIO host** program (Python, from brewpanel) speaks one versioned
  request/response + event protocol.
- Two transports for the same protocol:
  - **stdio** when Carboy desktop supervises it as a sidecar;
  - **authenticated WebSocket** (TLS, pairing, host identity) when it runs as
    a LAN host — a Raspberry Pi or always-on PC.
- **Mobile is a LAN client only.** No native mobile device drivers until a
  demonstrated need.
- Protocol messages carry schema version, message ID, source identity, and
  observation vs. receipt timestamps. Incompatible versions fail clearly.
- State-changing commands keep BrewIO's confirmation (`SafetyGate`) and audit
  boundary. AI has no path to them.
- The protocol contract lives with Carboy (`brewio-bridge/`) until BrewIO is
  extracted; then it moves to BrewIO and Carboy depends on a released
  version.

## Consequences

- Desktop sidecar packaging (PyInstaller/Nuitka, per-OS builds, macOS signing)
  is required before hardware ships on desktop.
- Users wanting unattended monitoring or mobile hardware access need a LAN
  host; this is documented, not hidden.

## Evidence required to accept

1. Phase 1 (non-blocking track): notarized macOS build launches the sidecar
   and exchanges simulator telemetry; startup/readiness/shutdown/crash
   behavior defined.
2. Phase 9: the same protocol works over stdio and WebSocket against the
   simulator, with authentication on the network transport.
