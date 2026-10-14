// One navigation bar for every page in the spike shell. Pages are added here
// as capabilities appear (STATUS.md lists them).
export const PAGES = [
  { id: "recipe", href: "recipe.html", label: "Recipe" },
  { id: "library", href: "library.html", label: "Library" },
  { id: "checks", href: "index.html", label: "Core checks" },
  { id: "graph-react", href: "graph-react/index.html", label: "Process graph: React Flow" },
  { id: "graph-svelte", href: "graph-svelte/index.html", label: "Process graph: Svelte Flow" },
  { id: "probe", href: "probe.html", label: "Platform probe" },
];

export function renderNav(container, current, depth = 0) {
  const prefix = "../".repeat(depth);
  const nav = document.createElement("nav");
  nav.setAttribute("aria-label", "Spike sections");
  const ul = document.createElement("ul");
  for (const p of PAGES) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = prefix + p.href;
    a.textContent = p.label;
    if (p.id === current) a.setAttribute("aria-current", "page");
    li.append(a);
    ul.append(li);
  }
  nav.append(ul);
  container.prepend(nav);
}

// Forward page errors to the Rust side's stderr (spike diagnostics).
const tauri = window.__TAURI__;
if (tauri) {
  const log = (m) => tauri.core.invoke("log", { message: `${location.pathname}${location.search}: ${m}` }).catch(() => {});
  window.addEventListener("error", (e) => log(`error: ${e.message} at ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => log(`unhandled: ${e.reason && e.reason.stack ? e.reason.stack : e.reason}`));
  log("loaded");
}
