// Automated measurements, shared by both candidates. In an automated run
// ($SPIKE_AUTO=1 on the Rust side) a page runs them and sends the report.

export const isAuto = async () => Boolean(window.__TAURI__ && (await window.__TAURI__.core.invoke("auto_mode")));

const frame = () => new Promise((r) => requestAnimationFrame(() => r()));

export async function waitFor(fn, timeoutMs = 20000) {
  const start = performance.now();
  for (;;) {
    const v = fn();
    if (v) return v;
    if (performance.now() - start > timeoutMs) throw new Error("timeout");
    await frame();
  }
}

/** Accessibility facts readable from the DOM. Screen-reader output needs a manual Orca check. */
export function audit(root, nodeSelector) {
  const nodes = [...root.querySelectorAll(nodeSelector)];
  const focusable = nodes.filter((n) => n.tabIndex >= 0).length;
  const labelled = nodes.filter((n) => (n.getAttribute("aria-label") || "").trim().length > 0).length;
  const described = nodes.filter((n) => n.getAttribute("aria-describedby")).length;
  const roles = [...new Set(nodes.map((n) => n.getAttribute("role")))];
  const roledesc = [...new Set(nodes.map((n) => n.getAttribute("aria-roledescription")))];
  const live = root.querySelectorAll("[aria-live]").length;
  return { nodes: nodes.length, focusable, labelled, described, roles, roledesc, liveRegions: live };
}

/** Focus a node, select it with Enter, move it with ArrowRight x5; report position change. */
export async function keyboardMove(nodeEl) {
  const before = nodeEl.style.transform;
  nodeEl.focus();
  const key = (k) => nodeEl.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
  key("Enter");
  await frame();
  const selected = nodeEl.classList.contains("selected");
  for (let i = 0; i < 5; i++) {
    key("ArrowRight");
    await frame();
  }
  await frame();
  return { focused: document.activeElement === nodeEl, selected, moved: nodeEl.style.transform !== before, before, after: nodeEl.style.transform };
}

/** Time N frames of programmatic zoom and pan (setViewport). */
export async function viewportFrames(setViewport, frames = 60) {
  const t0 = performance.now();
  let worst = 0;
  let last = t0;
  for (let i = 0; i < frames; i++) {
    setViewport({ x: -i * 10, y: -i * 4, zoom: 0.5 + (i % 30) / 60 });
    await frame();
    const now = performance.now();
    worst = Math.max(worst, now - last);
    last = now;
  }
  return { frames, totalMs: Math.round(performance.now() - t0), worstFrameMs: Math.round(worst) };
}

export async function send(report) {
  const tauri = window.__TAURI__;
  if (tauri && (await isAuto())) await tauri.core.invoke("report", { json: JSON.stringify(report, null, 2) });
}
