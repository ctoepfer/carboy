// The automated run, identical for both candidates ($SPIKE_AUTO=1).
import { audit, keyboardMove, send, viewportFrames, waitFor } from "./measure.js";
import { largeRecipe } from "./process.js";

const nodeEls = (root) => [...root.querySelectorAll(".react-flow__node, .svelte-flow__node")];
const visible = (el) => el.style.visibility !== "hidden" && el.getBoundingClientRect().width > 0;

export async function runAuto({ framework, versions, root, setRecipe, setViewport }) {
  const report = { framework, versions, userAgent: navigator.userAgent, steps: {} };
  const step = async (name, fn) => {
    try {
      report.steps[name] = { ok: true, ...(await fn()) };
    } catch (e) {
      report.steps[name] = { ok: false, error: String(e && e.stack ? e.stack : e) };
    }
  };

  await step("small: render", async () => {
    const t0 = performance.now();
    await waitFor(() => nodeEls(root).length === 8 && nodeEls(root).every(visible));
    return { ms: Math.round(performance.now() - t0) };
  });
  await step("small: audit", async () => audit(root, ".react-flow__node, .svelte-flow__node"));
  await step("keyboard: focus, Enter selects, arrows move", async () => keyboardMove(nodeEls(root)[0]));
  await step("non-drag alternative: Move later", async () => {
    const node = nodeEls(root)[1];
    node.focus();
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const button = await waitFor(() => {
      const b = document.getElementById("move-later");
      return b && !b.disabled ? b : null;
    }, 3000);
    const before = root.dataset.order;
    button.click();
    await waitFor(() => root.dataset.order !== before, 3000);
    return { before, after: root.dataset.order, announced: document.getElementById("announce")?.textContent ?? "" };
  });
  await step("large: render", async () => {
    const big = largeRecipe();
    const t0 = performance.now();
    setRecipe(big);
    await waitFor(() => nodeEls(root).length === big.stages.length && nodeEls(root).every(visible));
    return { stages: big.stages.length, additions: big.stages.length * big.stages[0].additions.length, ms: Math.round(performance.now() - t0) };
  });
  await step("large: audit", async () => audit(root, ".react-flow__node, .svelte-flow__node"));
  await step("large: viewport pan/zoom, 60 frames", async () => viewportFrames(setViewport));
  report.passed = Object.values(report.steps).filter((s) => s.ok).length;
  report.total = Object.keys(report.steps).length;
  await send(report);
  return report;
}
