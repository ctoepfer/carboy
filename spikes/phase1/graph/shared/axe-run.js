// Spike: run axe-core (MPL-2.0) on the current page when $SPIKE_AXE=1 and
// return a compact summary for the page's report (USABILITY §5 item 5).
// Automated rules find only part of the problems; the manual matrix in
// USABILITY §1.5 is the evidence.
export async function axeSummary(base) {
  const tauri = window.__TAURI__;
  if (!tauri) return undefined;
  const on = await tauri.core.invoke("spike_env", { name: "SPIKE_AXE" });
  if (on !== "1") return undefined;
  if (!window.axe) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = `${base}shared/axe.min.js`;
      s.onload = resolve;
      s.onerror = () => reject(new Error("axe.min.js failed to load"));
      document.head.append(s);
    });
  }
  const r = await window.axe.run(document, { resultTypes: ["violations", "incomplete"] });
  const brief = (list) => list.map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, help: v.help }));
  return { version: window.axe.version, violations: brief(r.violations), incomplete: brief(r.incomplete), passes: r.passes.length };
}
