/*
 * UI prototype: Recipe Library, Recipe Editor, change review.
 * Throwaway. No framework, no build, no dependencies, no storage beyond the
 * page's memory (theme and density are remembered in localStorage when it
 * works). Nothing here is production architecture; see README.md.
 *
 * Simulated, and labelled as such in the UI:
 * - Editing applies simplified commands to an in-memory draft. Recipe Core
 *   isn't loaded, so nothing is validated by Core and no statistic is computed.
 * - Saving copies the draft into an in-memory "revision". Nothing persists.
 * - The graph pane is a stand-in: no graph library is chosen (D-017).
 *
 * Every user-visible string comes from messages.js (rule U8). Recipe text
 * is user content (U12) and is shown as written, marked with its language.
 */
(function () {
  "use strict";

  // ---------- messages ----------
  const MESSAGES = window.PROTOTYPE_MESSAGES;
  const pluralRules = new Intl.PluralRules("en");
  function t(key, params = {}) {
    let msg = MESSAGES[key];
    if (msg === undefined) {
      console.warn("missing message", key);
      return `[${key}]`;
    }
    if (typeof msg === "object") msg = msg[pluralRules.select(Number(params.count))] ?? msg.other;
    return msg.replace(/\{(\w+)\}/g, (_, k) => (params[k] ?? ""));
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const tx = (key, params) => esc(t(key, params));
  // User-written text: shown as written, with its language (U12).
  const user = (text, lang) => `<span lang="${esc(lang || "und")}" dir="auto">${esc(text)}</span>`;

  // ---------- units (display only; values are shown as stored, U10) ----------
  const UNITS = { mass: ["mg", "g", "kg", "oz", "lb"], volume: ["mL", "L", "gal"], count: ["packet", "tablet"] };
  const dimensionOf = (u) => Object.keys(UNITS).find((d) => UNITS[d].includes(u)) || null;
  const canonicalUnit = (u) => {
    const all = Object.values(UNITS).flat();
    const find = (x) => all.find((y) => y.toLowerCase() === x.toLowerCase()) || null;
    return find(u) || (/s$/i.test(u) ? find(u.slice(0, -1)) : null); // "packets"
  };
  const qty = (q) => (q ? `${q.v} ${t(`unit.${q.u}.short`, { count: q.v })}` : t("value.unknown"));
  const qtyLong = (q) => (q ? `${q.v} ${t(`unit.${q.u}.long`, { count: q.v })}` : t("value.unknown"));

  // ---------- state ----------
  const today = "2026-11-07";
  const store = {
    recipes: [],
    drafts: new Map(),     // recipe id -> { content, undo: [], redo: [] }
    selection: null,       // { type: "addition"|"stage"|"ingredient", id }
    query: "",
    filter: "all",
    graph: true,
    simulateFailure: false,
    saveError: null,
    fieldErrors: {},       // data-key -> { message, text }
    newCount: 0,
    lastDiscard: null,
    pendingFocus: null,
  };

  function resetData() {
    store.recipes = window.PROTOTYPE_DATA.build();
    store.drafts.clear();
    store.selection = null;
    store.saveError = null;
    store.fieldErrors = {};
  }

  const clone = (o) => JSON.parse(JSON.stringify(o));
  const findRecipe = (id) => store.recipes.find((r) => r.id === id) || null;
  const draftOf = (id) => store.drafts.get(id) || null;
  const working = (id) => (draftOf(id) ? draftOf(id).content : findRecipe(id));
  function ensureDraft(id) {
    if (!store.drafts.has(id)) store.drafts.set(id, { content: clone(findRecipe(id)), undo: [], redo: [] });
    return store.drafts.get(id);
  }
  const ing = (r, id) => r.ingredients.find((i) => i.id === id);
  const add = (r, id) => r.additions.find((a) => a.id === id);
  const stg = (r, id) => r.stages.find((s) => s.id === id);

  // ---------- commands (simplified stand-ins for Editor Commands) ----------
  // apply() mutates the draft and returns the inverse command, for undo.
  function apply(r, c) {
    switch (c.op) {
      case "set_addition_amount": {
        const a = add(r, c.addition); const old = a.amount; a.amount = c.amount;
        return { op: c.op, addition: c.addition, amount: old, focus: c.focus };
      }
      case "move_addition": {
        const a = add(r, c.addition); const old = a.stage; a.stage = c.stage;
        return { op: c.op, addition: c.addition, stage: old, focus: c.focus };
      }
      case "remove_addition": {
        const index = r.additions.findIndex((a) => a.id === c.addition);
        const [removed] = r.additions.splice(index, 1);
        return { op: "restore_addition", addition: removed, index, focus: `ing-${removed.id}` };
      }
      case "restore_addition": {
        r.additions.splice(c.index, 0, c.addition);
        return { op: "remove_addition", addition: c.addition.id, focus: c.focus };
      }
      case "set_ingredient_property": {
        const i = ing(r, c.ingredient); const old = i.props[c.property] ?? null;
        if (c.value == null) delete i.props[c.property]; else i.props[c.property] = c.value;
        return { op: c.op, ingredient: c.ingredient, property: c.property, value: old, focus: c.focus };
      }
      case "move_stage": {
        const from = r.stages.findIndex((s) => s.id === c.stage);
        const [s] = r.stages.splice(from, 1); r.stages.splice(c.index, 0, s);
        return { op: c.op, stage: c.stage, index: from, focus: c.focus };
      }
      case "set_name": {
        const old = r.name; r.name = c.name;
        return { op: c.op, name: old, focus: c.focus };
      }
      case "add_custom_ingredient": {
        r.ingredients.push(c.ingredient); r.additions.push(c.addition);
        return { op: "remove_custom_ingredient", ingredient: c.ingredient.id, addition: c.addition.id, focus: "add-ingredient" };
      }
      case "remove_custom_ingredient": {
        const i = r.ingredients.findIndex((x) => x.id === c.ingredient);
        const a = r.additions.findIndex((x) => x.id === c.addition);
        const [ingredient] = r.ingredients.splice(i, 1); const [addition] = r.additions.splice(a, 1);
        return { op: "add_custom_ingredient", ingredient, addition, focus: `ing-${addition.id}` };
      }
      case "add_stage": {
        r.stages.push(c.stage);
        return { op: "remove_stage", stage: c.stage.id, focus: "add-stage" };
      }
      case "remove_stage": {
        const i = r.stages.findIndex((s) => s.id === c.stage); const [stage] = r.stages.splice(i, 1);
        return { op: "add_stage", stage, focus: `stage-${stage.id}` };
      }
      default:
        throw new Error(`unknown op ${c.op}`);
    }
  }

  function run(recipeId, command, announcement) {
    const d = ensureDraft(recipeId);
    d.undo.push({ inverse: apply(d.content, command), command, announcement });
    d.redo = [];
    store.saveError = null;
    announce(announcement);
    render();
  }

  function undo(recipeId) {
    const d = draftOf(recipeId);
    if (!d || !d.undo.length) return announce(t("status.nothingToUndo"));
    const entry = d.undo.pop();
    apply(d.content, entry.inverse);
    d.redo.push(entry);
    store.pendingFocus = entry.inverse.focus;
    announce(t("status.undid", { what: entry.announcement }));
    render();
  }

  function redo(recipeId) {
    const d = draftOf(recipeId);
    if (!d || !d.redo.length) return announce(t("status.nothingToRedo"));
    const entry = d.redo.pop();
    entry.inverse = apply(d.content, entry.command);
    d.undo.push(entry);
    store.pendingFocus = entry.command.focus;
    announce(t("status.redid", { what: entry.announcement }));
    render();
  }

  // ---------- diff between the saved revision and the draft ----------
  function diff(id) {
    const base = findRecipe(id); const d = draftOf(id);
    if (!d) return [];
    const r = d.content; const out = [];
    if (base.name !== r.name) out.push({ group: "recipe", label: t("diff.recipeName"), before: base.name, after: r.name, revert: { op: "set_name", name: base.name }, userText: true });
    const stageName = (rec, sid) => (stg(rec, sid) || {}).name || t("value.unknown");
    for (const a of r.additions) {
      const b = add(base, a.id); const name = ing(r, a.ing).name;
      if (!b) { out.push({ group: "ingredients", label: name, change: "added", after: `${qty(a.amount)}, ${stageName(r, a.stage)}` }); continue; }
      if (b.amount.v !== a.amount.v || b.amount.u !== a.amount.u)
        out.push({ group: "ingredients", label: name, field: t("field.amount"), context: [stageName(r, a.stage), a.timing].filter(Boolean).join(t("list.comma")), before: qty(b.amount), after: qty(a.amount), revert: { op: "set_addition_amount", addition: a.id, amount: b.amount } });
      if (b.stage !== a.stage)
        out.push({ group: "ingredients", label: name, field: t("field.stage"), before: stageName(base, b.stage), after: stageName(r, a.stage), revert: { op: "move_addition", addition: a.id, stage: b.stage } });
    }
    for (const b of base.additions) if (!add(r, b.id)) out.push({ group: "ingredients", label: ing(base, b.ing).name, change: "removed", before: `${qty(b.amount)}, ${stageName(base, b.stage)}` });
    for (const i of r.ingredients) {
      const b = ing(base, i.id); if (!b) continue;
      for (const p of ["color", "potential", "alpha"]) {
        const x = b.props[p], y = i.props[p];
        if ((x && x.v) !== (y && y.v)) out.push({ group: "ingredients", label: i.name, field: t(`prop.${p}`), before: qty(x), after: qty(y), revert: { op: "set_ingredient_property", ingredient: i.id, property: p, value: x ?? null } });
      }
    }
    r.stages.forEach((s, index) => {
      const bi = base.stages.findIndex((x) => x.id === s.id);
      if (bi === -1) out.push({ group: "process", label: s.name, change: "added" });
      else if (bi !== index) out.push({ group: "process", label: s.name, field: t("field.position"), before: t("position", { n: bi + 1, total: base.stages.length }), after: t("position", { n: index + 1, total: r.stages.length }), revert: { op: "move_stage", stage: s.id, index: bi } });
    });
    for (const s of base.stages) if (!stg(r, s.id)) out.push({ group: "process", label: s.name, change: "removed" });
    return out;
  }

  // ---------- statistics: states only; nothing is calculated ----------
  const STATS = ["og", "mcu", "fg", "abv", "ibu", "srm"];
  const PRE_FERMENT = ["mash", "steep", "lauter", "boil", "whirlpool"];
  function statState(r, key) {
    if (["fg", "abv", "ibu", "srm"].includes(key)) return { kind: "notEnabled" };
    const property = key === "og" ? "potential" : "color";
    const preIds = new Set(r.stages.filter((s) => PRE_FERMENT.includes(s.kind)).map((s) => s.id));
    const ferm = r.additions.filter((a) => preIds.has(a.stage) && ing(r, a.ing).kind === "fermentable").map((a) => ing(r, a.ing));
    if (!ferm.length) return { kind: "noInput" };
    const missing = [...new Set(ferm.filter((i) => !i.props[property]).map((i) => i.name))];
    if (!r.batch) missing.unshift(t("field.batchVolume"));
    return missing.length ? { kind: "missing", names: missing } : { kind: "notConnected" };
  }

  // Missing information the editor lists (each links to where it's fixed).
  function advisories(r) {
    const out = [];
    if (!r.ingredients.length) out.push({ key: "advice.noIngredients", target: "add-ingredient" });
    if (!r.stages.length) out.push({ key: "advice.noStages", target: "add-stage" });
    if (r.ingredients.length && !r.ingredients.some((i) => i.kind === "culture")) out.push({ key: "advice.noCulture", target: "add-ingredient" });
    for (const s of r.stages) if (s.kind === "mash" && !s.steps.length) out.push({ key: "advice.mashNoSteps", params: { stage: s.name }, select: { type: "stage", id: s.id } });
    for (const i of r.ingredients) {
      const need = i.kind === "fermentable" ? ["color", "potential"] : i.kind === "hop" ? ["alpha"] : [];
      const missing = need.filter((p) => !i.props[p]).map((p) => t(`prop.${p}`));
      const a = r.additions.find((x) => x.ing === i.id);
      if (missing.length && a) out.push({ key: "advice.missingProperty", params: { name: i.name, list: missing.join(t("list.and")) }, select: { type: "addition", id: a.id }, focusProp: need.find((p) => !i.props[p]) });
    }
    if (!r.equipment) out.push({ key: "advice.noEquipment", info: true });
    return out;
  }

  // ---------- validation of typed input ----------
  function parseAmount(text, currentUnit) {
    const s = text.trim();
    if (!s) return { error: t("amount.error.empty") };
    const m = s.match(/^([0-9][0-9.,]*)\s*([A-Za-z]+)?$/);
    if (!m) return { error: t("amount.error.notNumber", { text: s }) };
    const [, num, rawUnit] = m;
    if (num.includes(",")) return { error: t("amount.error.comma", { text: num }) };
    if (!/^\d+(\.\d+)?$/.test(num)) return { error: t("amount.error.notNumber", { text: s }) };
    const unit = rawUnit ? canonicalUnit(rawUnit) : currentUnit;
    if (!unit) return { error: t("amount.error.unknownUnit", { unit: rawUnit, examples: UNITS[dimensionOf(currentUnit)].join(", ") }) };
    const dim = dimensionOf(currentUnit);
    if (dimensionOf(unit) !== dim) return { error: t("amount.error.dimension", { unit, expected: t(`dimension.${dim}`), examples: UNITS[dim].join(", ") }) };
    if (/^0+(\.0+)?$/.test(num)) return { error: t("amount.error.zero") };
    const v = num.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return { value: { v, u: unit } };
  }

  function parseProperty(text, property) {
    const s = text.trim();
    if (!s) return { clear: true };
    if (s.includes(",")) return { error: t("amount.error.comma", { text: s }) };
    if (!/^\d+(\.\d+)?$/.test(s)) return { error: t("property.error.notNumber", { text: s }) };
    if (property === "alpha" && Number(s) > 100) return { error: t("property.error.percent") };
    return { value: s };
  }

  // ---------- announcements ----------
  let announceTimer;
  function announce(message) {
    const el = document.getElementById("status");
    el.textContent = "";
    clearTimeout(announceTimer);
    announceTimer = setTimeout(() => { el.textContent = message; }, 50);
  }

  // ---------- routing ----------
  function route() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (parts[0] === "recipe" && parts[1]) return { view: parts[2] === "review" ? "review" : "editor", id: decodeURIComponent(parts[1]) };
    return { view: "library" };
  }
  const go = (hash) => { location.hash = hash; };
  let lastRouteKey = null;

  // ---------- rendering ----------
  // A commit on blur re-renders the view. If that happened between pointerdown
  // and click, the clicked button would be replaced and the click lost, so
  // rendering waits until the pointer is released.
  let holdRender = false; let needsRender = false; let rendering = false;
  function render() {
    if (holdRender) { needsRender = true; return; }
    const r = route();
    const routeKey = `${r.view}:${r.id || ""}`;
    const changedRoute = routeKey !== lastRouteKey;
    if (changedRoute) {
      store.selection = null; store.saveError = null; store.fieldErrors = {};
      if (lastRouteKey !== null) document.getElementById("status").textContent = ""; // old messages don't follow you
    }
    const active = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;

    renderNav(r);
    const main = document.getElementById("view");
    let html;
    if (r.view === "library") html = libraryView();
    else if (!findRecipe(r.id)) html = notFoundView();
    else if (r.view === "editor") html = editorView(r.id);
    else html = reviewView(r.id);
    rendering = true;           // removing a focused field fires focusout; ignore it
    main.innerHTML = html;
    rendering = false;
    document.title = t(`title.${r.view}`, { name: r.id && findRecipe(r.id) ? working(r.id).name : "" });

    const focusKey = store.pendingFocus || (changedRoute ? null : active);
    store.pendingFocus = null;
    lastRouteKey = routeKey;
    if (changedRoute) {
      const h1 = main.querySelector("h1");
      if (h1) h1.focus();
    } else if (focusKey) {
      const el = main.querySelector(`[data-key="${CSS.escape(focusKey)}"]`);
      if (el) {
        el.focus();
        if (el.matches("input[type=text], input[type=search]")) { try { el.setSelectionRange(el.value.length, el.value.length); } catch (_) { /* ignore */ } }
      }
    }
  }

  function renderNav(r) {
    const nav = document.getElementById("rail-links");
    const id = r.id && findRecipe(r.id) ? r.id : null;
    const changes = id ? diff(id).length : 0;
    const link = (href, label, current, extra = "") =>
      `<li><a href="${href}"${current ? ' aria-current="page"' : ""}>${label}${extra}</a></li>`;
    nav.innerHTML = [
      link("#/library", tx("nav.library"), r.view === "library"),
      id ? link(`#/recipe/${encodeURIComponent(id)}`, `${tx("nav.editor")}<span class="rail-sub">${user(working(id).name, working(id).lang)}</span>`, r.view === "editor") : "",
      id ? link(`#/recipe/${encodeURIComponent(id)}/review`, tx("nav.review"), r.view === "review",
        changes ? ` <span class="count">${tx("nav.changeCount", { count: changes })}</span>` : "") : "",
    ].join("");
  }

  function originBadge(r) {
    const kind = { example: "info", owner: "neutral", synthetic: "warning", new: "neutral" }[r.origin];
    return `<span class="badge badge-${kind}">${tx(`origin.${r.origin}`)}</span>`;
  }

  function savedState(id) {
    const r = findRecipe(id); const n = diff(id).length;
    if (n) return `<p class="save-state is-dirty" data-state="dirty"><span aria-hidden="true">●</span> ${tx("save.unsaved", { count: n })}</p>`;
    if (!r.revision) return `<p class="save-state is-new"><span aria-hidden="true">○</span> ${tx("save.neverSaved")}</p>`;
    return `<p class="save-state is-saved"><span aria-hidden="true">✓</span> ${tx("save.saved", { n: r.revision })}</p>`;
  }

  // ----- Library -----
  function libraryView() {
    const q = store.query.trim().toLowerCase();
    const rows = store.recipes.filter((r) => {
      const w = working(r.id);
      if (store.filter === "drafts" && !diff(r.id).length) return false;
      if (store.filter === "examples" && r.origin !== "example") return false;
      if (store.filter === "mine" && r.origin === "example") return false;
      return !q || `${w.name} ${w.style || ""}`.toLowerCase().includes(q);
    });
    const body = rows.map((r) => {
      const w = working(r.id); const n = diff(r.id).length;
      return `<tr>
        <th scope="row"><a href="#/recipe/${encodeURIComponent(r.id)}" data-key="open-${esc(r.id)}">${user(w.name, w.lang)}</a>
          ${n ? `<span class="badge badge-dirty"><span aria-hidden="true">●</span> ${tx("library.unsaved", { count: n })}</span>` : ""}</th>
        <td>${w.style ? user(w.style, w.lang) : `<span class="muted">${tx("value.none")}</span>`}</td>
        <td>${w.variant ? tx(`variant.${w.variant}`) : `<span class="muted">${tx("value.none")}</span>`}</td>
        <td>${originBadge(r)}</td>
        <td class="num">${r.revision ? esc(r.revision) : `<span class="muted">${tx("value.none")}</span>`}</td>
        <td>${r.updated ? esc(r.updated) : `<span class="muted">${tx("value.none")}</span>`}</td>
      </tr>`;
    }).join("");
    return `
      <div class="view-head">
        <h1 tabindex="-1">${tx("library.title")}</h1>
        <button type="button" class="btn btn-primary" data-action="new-recipe" data-key="new-recipe">${tx("library.new")}</button>
      </div>
      <p class="sim-note"><span class="badge badge-sim">${tx("sim.badge")}</span> ${tx("library.sampleNote")}</p>
      <div class="toolbar" role="search">
        <label class="field-inline"><span>${tx("library.search")}</span>
          <input type="search" value="${esc(store.query)}" data-input="query" data-key="query" autocomplete="off"></label>
        <label class="field-inline"><span>${tx("library.show")}</span>
          <select data-input="filter" data-key="filter">
            ${["all", "mine", "examples", "drafts"].map((f) => `<option value="${f}"${store.filter === f ? " selected" : ""}>${tx(`library.filter.${f}`)}</option>`).join("")}
          </select></label>
        <p class="muted result-count">${tx("library.count", { count: rows.length })}</p>
      </div>
      ${rows.length ? `<div class="table-wrap"><table class="data">
        <caption class="sr-only">${tx("library.caption")}</caption>
        <thead><tr><th scope="col">${tx("col.name")}</th><th scope="col">${tx("col.style")}</th><th scope="col">${tx("col.method")}</th>
          <th scope="col">${tx("col.source")}</th><th scope="col" class="num">${tx("col.revision")}</th><th scope="col">${tx("col.updated")}</th></tr></thead>
        <tbody>${body}</tbody></table></div>`
        : `<div class="empty"><p>${tx("library.noMatch", { query: store.query })}</p>
            <button type="button" class="btn" data-action="clear-search" data-key="clear-search">${tx("library.clearSearch")}</button></div>`}
    `;
  }

  // ----- Editor -----
  function editorView(id) {
    const r = working(id); const base = findRecipe(id); const d = draftOf(id);
    const adv = advisories(r);
    const problems = adv.filter((a) => !a.info);
    return `
      ${breadcrumb(id, false)}
      <div class="doc-head">
        <div class="doc-title">
          <h1 tabindex="-1">${user(r.name, r.lang)}</h1>
          <p class="doc-meta">${r.style ? user(r.style, r.lang) + " · " : ""}${r.variant ? tx(`variant.${r.variant}`) + " · " : ""}${tx("beverage.beer")} ${originBadge(base)}</p>
          ${savedState(id)}
        </div>
        <div class="doc-actions" role="toolbar" aria-label="${tx("editor.actions")}">
          <button type="button" class="btn" data-action="undo" data-key="undo" ${d && d.undo.length ? "" : "aria-disabled=\"true\""} aria-keyshortcuts="Control+Z">${tx("action.undo")}</button>
          <button type="button" class="btn" data-action="redo" data-key="redo" ${d && d.redo.length ? "" : "aria-disabled=\"true\""} aria-keyshortcuts="Control+Shift+Z">${tx("action.redo")}</button>
          <a class="btn" href="#/recipe/${encodeURIComponent(id)}/review" data-key="review">${tx("action.review")}</a>
          <button type="button" class="btn btn-primary" data-action="save" data-key="save" aria-keyshortcuts="Control+S">${tx("action.save")}</button>
        </div>
      </div>
      ${saveErrorBanner()}
      ${base.origin === "synthetic" ? `<p class="sim-note"><span class="badge badge-warning">${tx("origin.synthetic")}</span> ${tx("editor.syntheticNote")}</p>` : ""}
      ${statsSection(r)}
      ${adv.length ? `<section class="panel advisories" aria-labelledby="adv-h">
          <h2 id="adv-h">${problems.length ? tx("advice.title", { count: problems.length }) : tx("advice.titleNone")}</h2>
          <ul>${adv.map((a, n) => `<li class="${a.info ? "is-info" : "is-warning"}"><span class="icon" aria-hidden="true">${a.info ? "ℹ" : "!"}</span>
            <span>${a.info ? `<span class="sr-only">${tx("advice.noteLabel")}</span>` : `<span class="sr-only">${tx("advice.missingLabel")}</span>`}${tx(a.key, a.params)}</span>
            ${a.select || a.target ? `<button type="button" class="btn btn-small" data-action="advice" data-index="${n}" data-key="adv-${n}">${tx("advice.show")}</button>` : ""}</li>`).join("")}</ul>
        </section>` : ""}
      <div class="editor-grid">
        <div class="editor-main">
          ${ingredientsSection(id, r)}
          ${processSection(id, r)}
          ${notesSection(r)}
        </div>
        ${inspector(id, r)}
      </div>`;
  }

  function breadcrumb(id, review) {
    const r = working(id);
    return `<nav class="breadcrumb" aria-label="${tx("breadcrumb.label")}"><ol>
      <li><a href="#/library">${tx("nav.library")}</a></li>
      <li>${review ? `<a href="#/recipe/${encodeURIComponent(id)}">${user(r.name, r.lang)}</a>` : `<span aria-current="page">${user(r.name, r.lang)}</span>`}</li>
      ${review ? `<li><span aria-current="page">${tx("nav.review")}</span></li>` : ""}
    </ol></nav>`;
  }

  function saveErrorBanner() {
    if (!store.saveError) return "";
    return `<div class="banner banner-danger" role="alert" aria-labelledby="save-error-h">
      <h2 id="save-error-h" tabindex="-1" data-key="save-error">${tx("save.error.title")}</h2>
      <p>${tx("save.error.body")}</p>
      <p><button type="button" class="btn" data-action="save" data-key="save-retry">${tx("save.error.retry")}</button></p>
    </div>`;
  }

  function statsSection(r) {
    const stated = r.stated || {};
    const cards = STATS.map((key) => {
      const s = statState(r, key);
      let state;
      if (s.kind === "notEnabled") state = `<span class="state state-unavailable"><span aria-hidden="true">⊘</span> ${tx("stat.notEnabled")}</span>`;
      else if (s.kind === "noInput") state = `<span class="state state-unavailable"><span aria-hidden="true">–</span> ${tx("stat.noInput")}</span>`;
      else if (s.kind === "missing") state = `<span class="state state-missing"><span aria-hidden="true">!</span> ${tx("stat.missing", { list: s.names.join(t("list.comma")) })}</span>`;
      else state = `<span class="state state-sim"><span aria-hidden="true">◇</span> ${tx("stat.notConnected")}</span>`;
      const value = stated[key]
        ? `<span class="stat-value">${esc(stated[key])}${key === "abv" ? esc(t("unit.percent")) : ""}</span> <span class="badge badge-neutral">${tx("stat.statedBadge")}</span>`
        : `<span class="stat-value stat-empty" aria-hidden="true">–</span><span class="sr-only">${tx("stat.noValue")}</span>`;
      return `<li class="stat">
        <h3 class="stat-label">${tx(`stat.${key}`)}</h3>
        <p class="stat-stated">${value}</p>
        <p class="stat-calc">${state}</p>
        <details><summary>${tx("stat.why")}</summary><p>${tx(`stat.why.${s.kind}`)}</p>${stated[key] ? `<p>${tx("stat.why.stated")}</p>` : ""}</details>
      </li>`;
    }).join("");
    return `<section aria-labelledby="stats-h" class="stats-section">
      <h2 id="stats-h" class="sr-only">${tx("stats.title")}</h2>
      <ul class="stats">${cards}</ul></section>`;
  }

  const KINDS = ["fermentable", "hop", "culture", "water_agent", "other"];
  function keyProperty(i) {
    if (i.kind === "fermentable") return ["color", "potential"];
    if (i.kind === "hop") return ["alpha"];
    return [];
  }

  function amountField(id, a, name, stageName, extraClass = "") {
    const key = extraClass ? `amt-i-${a.id}` : `amt-${a.id}`; const err = store.fieldErrors[key];
    return `<div class="amount ${extraClass}">
      <input type="text" inputmode="decimal" class="input-amount${err ? " is-invalid" : ""}" value="${esc(err ? err.text : qty(a.amount))}"
        data-commit="amount" data-addition="${esc(a.id)}" data-key="${key}" data-recipe="${esc(id)}"
        aria-label="${esc(t("field.amountOf", { name, stage: stageName }))}" aria-describedby="${err ? `${key}-err ` : ""}amount-hint"
        ${err ? 'aria-invalid="true"' : ""} spellcheck="false" autocomplete="off">
      ${err ? `<p class="field-error" id="${key}-err"><span aria-hidden="true">✕</span> ${esc(err.message)}</p>` : ""}
    </div>`;
  }

  function ingredientsSection(id, r) {
    const groups = KINDS.map((kind) => {
      const rows = r.additions.filter((a) => ing(r, a.ing).kind === kind);
      if (!rows.length) return "";
      const body = rows.map((a) => {
        const i = ing(r, a.ing); const s = stg(r, a.stage);
        const selected = Boolean(store.selection && store.selection.type === "addition" && store.selection.id === a.id);
        const props = keyProperty(i).map((p) => i.props[p]
          ? `<span class="prop">${esc(qty(i.props[p]))}</span>`
          : `<span class="badge badge-missing"><span aria-hidden="true">!</span> ${tx("prop.missing", { property: t(`prop.${p}`) })}</span>`).join(" ");
        return `<tr class="${selected ? "is-selected" : ""}">
          <th scope="row"><button type="button" class="link-btn" data-action="select" data-type="addition" data-id="${esc(a.id)}" data-key="ing-${esc(a.id)}"
            aria-pressed="${selected}">${user(i.name, r.lang)}</button></th>
          <td>${amountField(id, a, i.name, s.name)}</td>
          <td><select data-commit="stage" data-addition="${esc(a.id)}" data-recipe="${esc(id)}" data-key="stg-${esc(a.id)}"
            aria-label="${esc(t("field.stageOf", { name: i.name }))}">${r.stages.map((x) => `<option value="${esc(x.id)}"${x.id === a.stage ? " selected" : ""}>${esc(x.name)}</option>`).join("")}</select></td>
          <td>${a.timing ? user(a.timing, r.lang) : `<span class="muted">${tx("value.none")}</span>`}</td>
          <td>${props || `<span class="muted">${tx("value.notApplicable")}</span>`}</td>
          <td><button type="button" class="btn btn-small btn-quiet" data-action="remove" data-addition="${esc(a.id)}" data-key="rm-${esc(a.id)}"
            aria-label="${esc(t("action.removeNamed", { name: i.name, stage: s.name }))}">${tx("action.remove")}</button></td>
        </tr>`;
      }).join("");
      return `<h3 class="group-h" id="g-${kind}">${tx(`kind.${kind}`, { count: 2 })} <span class="muted">(${esc(rows.length)})</span></h3>
        <div class="table-wrap"><table class="data editable" aria-labelledby="g-${kind}">
          <thead><tr><th scope="col">${tx("col.ingredient")}</th><th scope="col">${tx("col.amount")}</th><th scope="col">${tx("col.stage")}</th>
          <th scope="col">${tx("col.timing")}</th><th scope="col">${tx(`col.keyProperty.${kind}`)}</th><th scope="col"><span class="sr-only">${tx("col.actions")}</span></th></tr></thead>
          <tbody>${body}</tbody></table></div>`;
    }).join("");
    return `<section class="panel" aria-labelledby="ing-h">
      <div class="section-head"><h2 id="ing-h">${tx("ingredients.title")}</h2>
        <button type="button" class="btn" data-action="add-ingredient" data-key="add-ingredient">${tx("ingredients.add")}</button></div>
      <p class="hint" id="amount-hint">${tx("amount.hint")}</p>
      ${groups || `<div class="empty"><p>${tx("ingredients.empty")}</p></div>`}
    </section>`;
  }

  function processSection(id, r) {
    const total = r.stages.length;
    const selectedStage = store.selection && store.selection.type === "stage" ? store.selection.id : null;
    const highlight = store.selection && store.selection.type === "addition" ? (add(r, store.selection.id) || {}).stage : null;
    const label = (s, n) => t("stage.label", { n: n + 1, total, name: s.name, count: r.additions.filter((a) => a.stage === s.id).length });
    const graph = store.graph && total ? `<div class="graph" role="group" aria-labelledby="graph-h">
        <h3 id="graph-h" class="group-h">${tx("graph.title")} <span class="badge badge-sim">${tx("sim.badge")}</span></h3>
        <p class="hint">${tx("graph.note")}</p>
        <ol class="graph-flow">${r.stages.map((s, n) => `<li>
          <button type="button" class="node${selectedStage === s.id ? " is-selected" : ""}${highlight === s.id ? " is-related" : ""}"
            data-action="select" data-type="stage" data-id="${esc(s.id)}" data-graph="1" data-key="node-${esc(s.id)}"
            tabindex="${(selectedStage ? selectedStage === s.id : n === 0) ? 0 : -1}" aria-pressed="${selectedStage === s.id}"
            aria-label="${esc(label(s, n))}">
            <span class="node-kind">${tx(`stageKind.${s.kind}`)}</span><span class="node-name">${user(s.name, r.lang)}</span>
            <span class="node-count">${tx("stage.additions", { count: r.additions.filter((a) => a.stage === s.id).length })}</span></button>
          ${n < total - 1 ? '<span class="edge" aria-hidden="true">→</span>' : ""}</li>`).join("")}</ol>
      </div>` : "";
    const list = r.stages.map((s, n) => {
      const adds = r.additions.filter((a) => a.stage === s.id);
      const isSel = selectedStage === s.id;
      return `<li class="stage-item${isSel ? " is-selected" : ""}${highlight === s.id ? " is-related" : ""}">
        <div class="stage-head">
          <h3><button type="button" class="link-btn" data-action="select" data-type="stage" data-id="${esc(s.id)}" data-key="stage-${esc(s.id)}"
            aria-pressed="${isSel}"><span class="stage-n">${esc(n + 1)}.</span> ${user(s.name, r.lang)}</button>
            <span class="muted stage-kind">${tx(`stageKind.${s.kind}`)}</span></h3>
          <div class="stage-actions">
            <button type="button" class="btn btn-small" data-action="move-stage" data-stage="${esc(s.id)}" data-dir="-1" data-key="up-${esc(s.id)}"
              ${n === 0 ? 'aria-disabled="true"' : ""} aria-label="${esc(t("stage.moveEarlierNamed", { name: s.name }))}">${tx("stage.moveEarlier")}</button>
            <button type="button" class="btn btn-small" data-action="move-stage" data-stage="${esc(s.id)}" data-dir="1" data-key="down-${esc(s.id)}"
              ${n === total - 1 ? 'aria-disabled="true"' : ""} aria-label="${esc(t("stage.moveLaterNamed", { name: s.name }))}">${tx("stage.moveLater")}</button>
          </div>
        </div>
        ${s.steps.length ? `<ol class="steps">${s.steps.map((x) => `<li>${user(x.text, r.lang)}</li>`).join("")}</ol>`
          : s.kind === "mash" ? `<p class="missing-line"><span aria-hidden="true">!</span> ${tx("stage.noSteps")}</p>` : ""}
        ${adds.length ? `<p class="stage-adds"><span class="muted">${tx("stage.additions", { count: adds.length })}:</span>
          ${adds.map((a) => `${user(ing(r, a.ing).name, r.lang)} ${esc(qty(a.amount))}`).join(t("list.comma"))}</p>` : ""}
      </li>`;
    }).join("");
    return `<section class="panel" aria-labelledby="proc-h">
      <div class="section-head"><h2 id="proc-h">${tx("process.title")}</h2>
        <label class="switch"><input type="checkbox" data-input="graph" data-key="graph-toggle" ${store.graph ? "checked" : ""}> ${tx("process.showGraph")}</label>
        <button type="button" class="btn" data-action="add-stage" data-key="add-stage">${tx("process.addStage")}</button></div>
      ${graph}
      ${total ? `<ol class="stage-list" aria-label="${tx("process.listLabel")}">${list}</ol>` : `<div class="empty"><p>${tx("process.empty")}</p></div>`}
    </section>`;
  }

  function notesSection(r) {
    if (!r.notes.length) return "";
    return `<section class="panel" aria-labelledby="notes-h"><h2 id="notes-h">${tx("notes.title")}</h2>
      ${r.notes.map((n) => `<p class="note">${user(n.text, r.lang)}</p>`).join("")}</section>`;
  }

  function inspector(id, r) {
    const sel = store.selection;
    let body;
    if (sel && sel.type === "addition" && add(r, sel.id)) {
      const a = add(r, sel.id); const i = ing(r, a.ing); const s = stg(r, a.stage);
      const props = keyProperty(i).map((p) => {
        const key = `prop-${i.id}-${p}`; const err = store.fieldErrors[key]; const v = i.props[p];
        const base = findRecipe(id); const bi = ing(base, i.id); const changed = !bi || (bi.props[p] || {}).v !== (v || {}).v;
        const provenance = !v ? t("provenance.unknown") : changed ? t("provenance.entered") : t(`provenance.${base.origin === "owner" ? "imported" : "stated"}`);
        return `<div class="field">
          <label for="${key}">${tx(`prop.${p}`)} <span class="muted">(${tx(`unit.${{ color: v && v.u === "SRM" ? "SRM" : "degL", potential: "ppg", alpha: "%" }[p]}.short`)})</span></label>
          <input id="${key}" type="text" inputmode="decimal" value="${esc(err ? err.text : v ? v.v : "")}" placeholder="${tx("value.unknown")}"
            data-commit="property" data-ingredient="${esc(i.id)}" data-property="${p}" data-unit="${v ? esc(v.u) : { color: "degL", potential: "ppg", alpha: "%" }[p]}"
            data-recipe="${esc(id)}" data-key="${key}" aria-describedby="${key}-prov${err ? ` ${key}-err` : ""}" ${err ? 'aria-invalid="true" class="is-invalid"' : ""} autocomplete="off">
          ${err ? `<p class="field-error" id="${key}-err"><span aria-hidden="true">✕</span> ${esc(err.message)}</p>` : ""}
          <p class="provenance" id="${key}-prov">${!v ? '<span aria-hidden="true">!</span> ' : ""}${esc(provenance)}</p>
        </div>`;
      }).join("");
      body = `<h2 id="insp-h">${user(i.name, r.lang)}</h2>
        <p class="muted">${tx(`kind.${i.kind}`, { count: 1 })} · ${tx("inspector.catalogNone")}</p>
        <h3>${tx("inspector.thisAddition")}</h3>
        <div class="field"><span class="label">${tx("field.amount")}</span>${amountField(id, a, i.name, s.name, "in-inspector")}</div>
        <dl class="facts"><dt>${tx("field.stage")}</dt><dd>${user(s.name, r.lang)}</dd><dt>${tx("col.timing")}</dt><dd>${a.timing ? user(a.timing, r.lang) : tx("value.none")}</dd></dl>
        ${props ? `<h3>${tx("inspector.properties")}</h3>${props}` : ""}
        <p class="hint">${tx("inspector.unknownNote")}</p>`;
    } else if (sel && sel.type === "stage" && stg(r, sel.id)) {
      const s = stg(r, sel.id); const n = r.stages.indexOf(s);
      const adds = r.additions.filter((a) => a.stage === s.id);
      body = `<h2 id="insp-h">${user(s.name, r.lang)}</h2>
        <p class="muted">${tx(`stageKind.${s.kind}`)} · ${tx("position", { n: n + 1, total: r.stages.length })}</p>
        <h3>${tx("inspector.steps")}</h3>
        ${s.steps.length ? `<ol class="steps">${s.steps.map((x) => `<li>${user(x.text, r.lang)}</li>`).join("")}</ol>` : `<p class="missing-line"><span aria-hidden="true">!</span> ${tx("stage.noStepsAny")}</p>`}
        <p class="hint">${tx("inspector.stepsNote")}</p>
        <h3>${tx("stage.additions", { count: adds.length })}</h3>
        ${adds.length ? `<ul class="plain">${adds.map((a) => `<li><button type="button" class="link-btn" data-action="select" data-type="addition" data-id="${esc(a.id)}" data-key="insp-add-${esc(a.id)}">${user(ing(r, a.ing).name, r.lang)}</button> ${esc(qty(a.amount))}</li>`).join("")}</ul>` : `<p class="muted">${tx("value.none")}</p>`}
        <div class="button-row">
          <button type="button" class="btn btn-small" data-action="move-stage" data-stage="${esc(s.id)}" data-dir="-1" data-key="insp-up" ${n === 0 ? 'aria-disabled="true"' : ""}>${tx("stage.moveEarlier")}</button>
          <button type="button" class="btn btn-small" data-action="move-stage" data-stage="${esc(s.id)}" data-dir="1" data-key="insp-down" ${n === r.stages.length - 1 ? 'aria-disabled="true"' : ""}>${tx("stage.moveLater")}</button>
        </div>
        <p class="hint">${tx("stage.orderNote")}</p>`;
    } else {
      const err = store.fieldErrors["recipe-name"];
      body = `<h2 id="insp-h">${tx("inspector.recipe")}</h2>
        <div class="field"><label for="recipe-name">${tx("field.name")}</label>
          <input id="recipe-name" type="text" value="${esc(err ? err.text : r.name)}" lang="${esc(r.lang)}" dir="auto" data-commit="name" data-recipe="${esc(id)}" data-key="recipe-name"
            ${err ? 'aria-invalid="true" aria-describedby="recipe-name-err" class="is-invalid"' : ""} autocomplete="off">
          ${err ? `<p class="field-error" id="recipe-name-err"><span aria-hidden="true">✕</span> ${esc(err.message)}</p>` : ""}</div>
        <dl class="facts">
          <dt>${tx("field.beverage")}</dt><dd>${tx("beverage.beer")}</dd>
          <dt>${tx("field.style")}</dt><dd>${r.style ? user(r.style, r.lang) : tx("value.none")}</dd>
          <dt>${tx("field.batchVolume")}</dt><dd>${r.batch ? esc(qty(r.batch)) : tx("value.unknown")}</dd>
          <dt>${tx("field.equipment")}</dt><dd>${tx("value.noneSelected")}</dd>
          <dt>${tx("field.language")}</dt><dd>${tx("language.en")}</dd>
        </dl>
        <p class="hint">${tx("inspector.selectHint")}</p>`;
    }
    return `<aside class="inspector panel" aria-labelledby="insp-h" data-region="inspector">${body}</aside>`;
  }

  // ----- Review -----
  function reviewView(id) {
    const base = findRecipe(id); const changes = diff(id); const r = working(id);
    const groups = ["recipe", "ingredients", "process"].map((g) => {
      const items = changes.filter((c) => c.group === g);
      if (!items.length) return "";
      return `<h3 class="group-h">${tx(`diff.group.${g}`)}</h3><ul class="diff">${items.map((c, n) => {
        const idx = changes.indexOf(c);
        let text;
        if (c.change === "added") text = `<span class="chg chg-added"><span aria-hidden="true">+</span> ${tx("diff.added")}</span> ${c.after ? esc(c.after) : ""}`;
        else if (c.change === "removed") text = `<span class="chg chg-removed"><span aria-hidden="true">−</span> ${tx("diff.removed")}</span> ${c.before ? esc(c.before) : ""}`;
        else text = `${c.field ? `<span class="diff-field">${esc(c.field)}${c.context ? ` (${user(c.context, r.lang)})` : ""}:</span>` : ""}
          <span class="before"><span class="sr-only">${tx("diff.before")} </span>${c.userText ? user(c.before, r.lang) : esc(c.before)}</span>
          <span aria-hidden="true" class="arrow">→</span>
          <span class="after"><span class="sr-only">${tx("diff.after")} </span>${c.userText ? user(c.after, r.lang) : esc(c.after)}</span>`;
        return `<li><span class="diff-label">${user(c.label, r.lang)}</span> ${text}
          ${c.revert ? `<button type="button" class="btn btn-small btn-quiet" data-action="revert" data-index="${idx}" data-key="revert-${idx}"
            aria-label="${esc(t("diff.revertNamed", { name: c.label }))}">${tx("diff.revert")}</button>` : ""}</li>`;
      }).join("")}</ul>`;
    }).join("");
    const proposal = base.proposal;
    return `
      ${breadcrumb(id, true)}
      <div class="view-head"><h1 tabindex="-1">${tx("review.title")}</h1></div>
      ${saveErrorBanner()}
      <section class="panel" aria-labelledby="yours-h">
        <h2 id="yours-h">${tx("review.yours")}</h2>
        ${changes.length ? `<p>${tx(base.revision ? "review.summary" : "review.summaryFirst", { count: changes.length, n: base.revision })}</p>
          ${groups}
          <h3 class="group-h">${tx("review.statsTitle")}</h3>
          <p class="state state-sim"><span aria-hidden="true">◇</span> ${tx("review.statsNote")}</p>
          <div class="field"><label for="rev-note">${tx("review.note")} <span class="muted">${tx("field.optional")}</span></label>
            <textarea id="rev-note" rows="2" data-key="rev-note" lang="${esc(r.lang)}" dir="auto"></textarea></div>
          <div class="button-row">
            <button type="button" class="btn btn-primary" data-action="save" data-key="review-save" aria-keyshortcuts="Control+S">${tx("review.saveAs", { n: base.revision + 1 })}</button>
            <a class="btn" href="#/recipe/${encodeURIComponent(id)}" data-key="keep-editing">${tx("review.keepEditing")}</a>
            <button type="button" class="btn btn-danger" data-action="discard" data-key="discard">${tx("review.discard")}</button>
          </div>`
        : `<div class="empty"><p>${tx(base.revision ? "review.none" : "review.noneNew", { n: base.revision })}</p>
            <a class="btn" href="#/recipe/${encodeURIComponent(id)}" data-key="back-edit">${tx("review.backToEditor")}</a></div>`}
      </section>
      ${proposal ? proposalSection(id, base, proposal, changes.length) : ""}
    `;
  }

  function proposalSection(id, base, p, dirty) {
    return `<section class="panel proposal" aria-labelledby="prop-h">
      <h2 id="prop-h">${tx("proposal.title")} <span class="badge badge-sim">${tx("sim.badge")}</span></h2>
      <p class="muted">${tx("proposal.meta", { date: p.created, n: base.revision })}</p>
      <figure class="rationale"><figcaption>${tx("proposal.rationale")}</figcaption><blockquote>${user(p.rationale, base.lang)}</blockquote></figure>
      <ul class="diff">${p.changes.map((c) => {
        const a = add(base, c.addition); const i = ing(base, a.ing);
        return `<li><span class="diff-label">${user(i.name, base.lang)}</span> <span class="diff-field">${tx("field.amount")}:</span>
          <span class="before"><span class="sr-only">${tx("diff.before")} </span>${esc(qty(c.from))}</span> <span aria-hidden="true" class="arrow">→</span>
          <span class="after"><span class="sr-only">${tx("diff.after")} </span>${esc(qty(c.to))}</span></li>`;
      }).join("")}</ul>
      <p class="state state-sim"><span aria-hidden="true">◇</span> ${tx("review.statsNote")}</p>
      <p class="hint">${tx("proposal.allOrNothing")}</p>
      ${dirty ? `<p class="banner banner-warning" id="prop-blocked"><span aria-hidden="true">!</span> ${tx("proposal.blocked")}</p>` : ""}
      <div class="button-row">
        <button type="button" class="btn btn-primary" data-action="accept-proposal" data-key="accept" ${dirty ? 'aria-disabled="true" aria-describedby="prop-blocked"' : ""}>${tx("proposal.accept")}</button>
        <button type="button" class="btn" data-action="reject-proposal" data-key="reject">${tx("proposal.reject")}</button>
      </div>
    </section>`;
  }

  function notFoundView() {
    return `<h1 tabindex="-1">${tx("notFound.title")}</h1><p>${tx("notFound.body")}</p><p><a class="btn" href="#/library">${tx("notFound.back")}</a></p>`;
  }

  // ---------- actions ----------
  function save(id) {
    const changes = diff(id); const base = findRecipe(id);
    if (!changes.length) { announce(t("status.nothingToSave")); return; }
    if (store.simulateFailure) {
      store.saveError = true;
      store.pendingFocus = "save-error";
      render();
      announce(t("save.error.title"));
      return;
    }
    const d = draftOf(id);
    const saved = clone(d.content);
    saved.revision = base.revision + 1; saved.updated = today; saved.proposal = base.proposal;
    if (saved.origin === "new") saved.origin = "new";
    store.recipes[store.recipes.indexOf(base)] = saved;
    store.drafts.delete(id);
    store.saveError = null;
    announce(t("status.saved", { n: saved.revision, count: changes.length }));
    if (route().view === "review") go(`#/recipe/${encodeURIComponent(id)}`); else render();
  }

  function discard(id) {
    store.lastDiscard = { id, draft: draftOf(id) };
    store.drafts.delete(id);
    store.saveError = null;
    render();
    showUndoDiscard();
  }

  function showUndoDiscard() {
    const bar = document.getElementById("toast");
    bar.hidden = false;
    bar.innerHTML = `<span>${tx("status.discarded")}</span> <button type="button" class="btn btn-small" data-action="undo-discard" data-key="undo-discard">${tx("action.undoDiscard")}</button>
      <button type="button" class="btn btn-small btn-quiet" data-action="dismiss-toast" aria-label="${tx("action.dismissNamed")}">${tx("action.dismiss")}</button>`;
    announce(t("status.discarded"));
    bar.querySelector("button").focus();
  }

  function commitField(el) {
    const id = el.dataset.recipe; const kind = el.dataset.commit; const key = el.dataset.key;
    const r = working(id);
    if (kind === "amount") {
      const a = add(r, el.dataset.addition);
      if (el.value === qty(a.amount)) { delete store.fieldErrors[key]; return; }
      const p = parseAmount(el.value, a.amount.u);
      if (p.error) { store.fieldErrors[key] = { message: p.error, text: el.value }; render(); return; }
      delete store.fieldErrors[key];
      if (p.value.v === a.amount.v && p.value.u === a.amount.u) { render(); return; }
      run(id, { op: "set_addition_amount", addition: a.id, amount: p.value, focus: key },
        t("status.amountChanged", { name: ing(r, a.ing).name, before: qty(a.amount), after: qty(p.value) }));
    } else if (kind === "property") {
      const i = ing(r, el.dataset.ingredient); const prop = el.dataset.property; const cur = i.props[prop];
      if (el.value === (cur ? cur.v : "")) { delete store.fieldErrors[key]; return; }
      const p = parseProperty(el.value, prop);
      if (p.error) { store.fieldErrors[key] = { message: p.error, text: el.value }; render(); return; }
      delete store.fieldErrors[key];
      const value = p.clear ? null : { v: p.value, u: el.dataset.unit, origin: "entered" };
      run(id, { op: "set_ingredient_property", ingredient: i.id, property: prop, value, focus: key },
        p.clear ? t("status.propertyCleared", { name: i.name, property: t(`prop.${prop}`) })
          : t("status.propertyChanged", { name: i.name, property: t(`prop.${prop}`), after: qty(value) }));
    } else if (kind === "name") {
      if (el.value === r.name) { delete store.fieldErrors[key]; return; }
      if (!el.value.trim()) { store.fieldErrors[key] = { message: t("name.error.empty"), text: el.value }; render(); return; }
      delete store.fieldErrors[key];
      run(id, { op: "set_name", name: el.value.trim(), focus: key }, t("status.renamed", { name: el.value.trim() }));
    }
  }

  function moveStage(id, stageId, dir, key) {
    const r = working(id); const from = r.stages.findIndex((s) => s.id === stageId); const to = from + dir;
    if (to < 0 || to >= r.stages.length) { announce(t(dir < 0 ? "status.alreadyFirst" : "status.alreadyLast")); return; }
    run(id, { op: "move_stage", stage: stageId, index: to, focus: key },
      t("status.stageMoved", { name: r.stages[from].name, n: to + 1, total: r.stages.length }));
  }

  function select(type, selId) {
    store.selection = { type, id: selId };
    render();
  }

  // ---------- dialogs ----------
  function openAddIngredient(id) {
    const r = working(id);
    const dlg = document.getElementById("dlg-add");
    if (!r.stages.length) { announce(t("addIngredient.needStage")); store.pendingFocus = "add-stage"; render(); return; }
    dlg.innerHTML = `<form method="dialog" novalidate data-form="add-ingredient" data-recipe="${esc(id)}">
      <h2 id="dlg-add-h">${tx("addIngredient.title")}</h2>
      <p class="hint">${tx("addIngredient.catalogNote")}</p>
      <div class="error-summary" role="alert" hidden tabindex="-1"></div>
      <div class="field"><label for="ai-kind">${tx("addIngredient.kind")}</label>
        <select id="ai-kind" name="kind">${KINDS.map((k) => `<option value="${k}">${tx(`kind.${k}`, { count: 1 })}</option>`).join("")}</select></div>
      <div class="field"><label for="ai-name">${tx("field.name")}</label><input id="ai-name" name="name" type="text" autocomplete="off" lang="${esc(r.lang)}" dir="auto"></div>
      <div class="field"><label for="ai-amount">${tx("field.amount")}</label><input id="ai-amount" name="amount" type="text" inputmode="decimal" autocomplete="off" aria-describedby="ai-amount-hint">
        <p class="hint" id="ai-amount-hint">${tx("addIngredient.amountHint")}</p></div>
      <div class="field"><label for="ai-stage">${tx("field.stage")}</label>
        <select id="ai-stage" name="stage">${r.stages.map((s) => `<option value="${esc(s.id)}">${esc(s.name)}</option>`).join("")}</select></div>
      <div class="field"><label for="ai-timing">${tx("col.timing")} <span class="muted">${tx("field.optional")}</span></label><input id="ai-timing" name="timing" type="text" autocomplete="off" lang="${esc(r.lang)}" dir="auto"></div>
      <div class="button-row"><button type="submit" class="btn btn-primary" value="add">${tx("addIngredient.submit")}</button>
        <button type="button" class="btn" data-action="close-dialog">${tx("action.cancel")}</button></div>
    </form>`;
    dlg.setAttribute("aria-labelledby", "dlg-add-h");
    dlg.showModal();
    dlg.querySelector("#ai-name").focus();
  }

  function submitAddIngredient(form) {
    const id = form.dataset.recipe; const f = new FormData(form);
    const errors = [];
    const name = String(f.get("name")).trim();
    if (!name) errors.push({ field: "ai-name", message: t("name.error.ingredient") });
    const kind = String(f.get("kind"));
    const defaultUnit = kind === "culture" ? "packet" : "g";
    const amountText = String(f.get("amount"));
    let amount = null;
    const typedUnit = amountText.trim().match(/[A-Za-z]+$/);
    const parsed = amountText.trim() && !typedUnit ? { error: t("addIngredient.error.unit", { example: kind === "culture" ? "1 packet" : "25 g" }) }
      : parseAmount(amountText, (typedUnit && canonicalUnit(typedUnit[0])) || defaultUnit);
    if (parsed.error) errors.push({ field: "ai-amount", message: parsed.error }); else amount = parsed.value;
    form.querySelectorAll(".field-error").forEach((e) => e.remove());
    form.querySelectorAll("[aria-invalid]").forEach((e) => { e.removeAttribute("aria-invalid"); e.setAttribute("aria-describedby", (e.getAttribute("aria-describedby") || "").replace(/\S+-err/g, "").trim()); });
    const summary = form.querySelector(".error-summary");
    if (errors.length) {
      summary.hidden = false;
      summary.innerHTML = `<h3>${tx("form.errorSummary", { count: errors.length })}</h3><ul>${errors.map((e) => `<li><a href="#${e.field}" data-focus="${e.field}">${esc(e.message)}</a></li>`).join("")}</ul>`;
      for (const e of errors) {
        const input = form.querySelector(`#${e.field}`);
        input.setAttribute("aria-invalid", "true");
        input.setAttribute("aria-describedby", `${input.getAttribute("aria-describedby") || ""} ${e.field}-err`.trim());
        input.insertAdjacentHTML("afterend", `<p class="field-error" id="${e.field}-err"><span aria-hidden="true">✕</span> ${esc(e.message)}</p>`);
      }
      summary.focus();
      return;
    }
    store.newCount += 1;
    const ingredient = { id: `custom-i${store.newCount}`, kind, name, props: {} };
    const addition = { id: `custom-a${store.newCount}`, ing: ingredient.id, stage: String(f.get("stage")), amount, timing: String(f.get("timing")).trim() || null };
    document.getElementById("dlg-add").close();
    store.selection = { type: "addition", id: addition.id };
    store.pendingFocus = `ing-${addition.id}`;
    run(id, { op: "add_custom_ingredient", ingredient, addition, focus: `ing-${addition.id}` }, t("status.ingredientAdded", { name }));
  }

  function openAddStage(id) {
    const dlg = document.getElementById("dlg-add");
    const kinds = ["mash", "steep", "lauter", "boil", "whirlpool", "chilling", "fermentation", "conditioning", "packaging"];
    dlg.innerHTML = `<form method="dialog" data-form="add-stage" data-recipe="${esc(id)}">
      <h2 id="dlg-stage-h">${tx("addStage.title")}</h2>
      <div class="field"><label for="as-kind">${tx("addStage.kind")}</label>
        <select id="as-kind" name="kind">${kinds.map((k) => `<option value="${k}">${tx(`stageKind.${k}`)}</option>`).join("")}</select></div>
      <p class="hint">${tx("addStage.note")}</p>
      <div class="button-row"><button type="submit" class="btn btn-primary">${tx("addStage.submit")}</button>
        <button type="button" class="btn" data-action="close-dialog">${tx("action.cancel")}</button></div></form>`;
    dlg.setAttribute("aria-labelledby", "dlg-stage-h");
    dlg.showModal();
    dlg.querySelector("select").focus();
  }

  function submitAddStage(form) {
    const id = form.dataset.recipe; const kind = new FormData(form).get("kind");
    store.newCount += 1;
    const stage = { id: `custom-s${store.newCount}`, kind, name: t(`stageKind.${kind}`), params: null, steps: [] };
    document.getElementById("dlg-add").close();
    store.pendingFocus = `stage-${stage.id}`;
    run(id, { op: "add_stage", stage, focus: `stage-${stage.id}` }, t("status.stageAdded", { name: stage.name }));
  }

  // Command palette: every command by name (U1).
  function commands() {
    const r = route(); const id = r.id && findRecipe(r.id) ? r.id : null;
    const list = [{ key: "palette.library", run: () => go("#/library") }, { key: "library.new", run: newRecipe }];
    if (id) {
      list.push(
        { key: "action.save", shortcut: "Ctrl+S", run: () => save(id) },
        { key: "action.undo", shortcut: "Ctrl+Z", run: () => undo(id) },
        { key: "action.redo", shortcut: "Ctrl+Shift+Z", run: () => redo(id) },
        { key: "palette.editor", run: () => go(`#/recipe/${encodeURIComponent(id)}`) },
        { key: "action.review", run: () => go(`#/recipe/${encodeURIComponent(id)}/review`) },
        { key: "ingredients.add", run: () => { if (route().view !== "editor") go(`#/recipe/${encodeURIComponent(id)}`); setTimeout(() => openAddIngredient(id)); } },
        { key: "process.addStage", run: () => openAddStage(id) },
        { key: store.graph ? "palette.hideGraph" : "palette.showGraph", run: () => { store.graph = !store.graph; render(); } },
      );
    }
    list.push(
      { key: "palette.density", run: () => setPref("density", document.documentElement.dataset.density === "compact" ? "comfortable" : "compact") },
      { key: "palette.regions", shortcut: "F6", run: () => cycleRegion(1) },
    );
    return list;
  }

  function openPalette() {
    const dlg = document.getElementById("dlg-palette");
    const all = commands();
    dlg.innerHTML = `<form method="dialog" class="palette">
      <h2 id="pal-h" class="sr-only">${tx("palette.title")}</h2>
      <label for="pal-q" class="sr-only">${tx("palette.search")}</label>
      <input id="pal-q" type="text" role="combobox" aria-expanded="true" aria-controls="pal-list" aria-autocomplete="list" placeholder="${tx("palette.search")}" autocomplete="off">
      <ul id="pal-list" role="listbox" aria-label="${tx("palette.title")}"></ul>
      <p class="hint">${tx("palette.hint")}</p></form>`;
    dlg.setAttribute("aria-labelledby", "pal-h");
    const q = dlg.querySelector("#pal-q"); const ul = dlg.querySelector("#pal-list");
    let shown = all; let active = 0;
    const draw = () => {
      ul.innerHTML = shown.map((c, n) => `<li role="option" id="pal-${n}" aria-selected="${n === active}" data-n="${n}">${tx(c.key)}${c.shortcut ? ` <kbd>${esc(c.shortcut)}</kbd>` : ""}</li>`).join("")
        || `<li class="muted" role="option" aria-disabled="true">${tx("palette.none")}</li>`;
      if (shown.length) q.setAttribute("aria-activedescendant", `pal-${active}`); else q.removeAttribute("aria-activedescendant");
      const el = ul.querySelector(`[aria-selected="true"]`); if (el) el.scrollIntoView({ block: "nearest" });
    };
    const runIt = (c) => { dlg.close(); if (c) c.run(); };
    q.addEventListener("input", () => { const s = q.value.toLowerCase(); shown = all.filter((c) => t(c.key).toLowerCase().includes(s)); active = 0; draw(); });
    q.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { active = Math.min(active + 1, shown.length - 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { active = Math.max(active - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === "Enter") { e.preventDefault(); runIt(shown[active]); }
    });
    ul.addEventListener("click", (e) => { const li = e.target.closest("[data-n]"); if (li) runIt(shown[Number(li.dataset.n)]); });
    draw();
    dlg.showModal();
    q.focus();
  }

  function newRecipe() {
    store.newCount += 1;
    const id = `new-${store.newCount}`;
    store.recipes.unshift({ id, name: t("recipe.untitled"), lang: "en", beverage: "beer", style: null, variant: null, origin: "new",
      status: "draft", batch: null, equipment: null, stated: null, revision: 0, updated: null, ingredients: [], stages: [], additions: [], notes: [] });
    ensureDraft(id);
    go(`#/recipe/${encodeURIComponent(id)}`);
  }

  // F6 moves between regions, as in desktop applications.
  function cycleRegion(dir) {
    const regions = [document.querySelector(".rail"), document.querySelector("#view h1"), document.querySelector("[data-region=inspector]")].filter(Boolean);
    const current = regions.findIndex((r) => r.contains(document.activeElement));
    const next = regions[(current + dir + regions.length) % regions.length];
    const target = next.matches("h1") ? next : next.querySelector("a, button, input, select, h2") || next;
    if (target.matches("h2")) target.setAttribute("tabindex", "-1");
    target.focus();
  }

  // ---------- preferences (theme and density belong in Preferences, not here) ----------
  function setPref(name, value) {
    if (name === "theme") { if (value === "system") delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = value; }
    if (name === "density") document.documentElement.dataset.density = value;
    try { localStorage.setItem(`ui-prototype.${name}`, value); } catch (_) { /* storage unavailable: fine */ }
    const sel = document.querySelector(`[data-pref="${name}"]`); if (sel) sel.value = value;
    announce(t("status.prefChanged", { name: t(`pref.${name}`), value: t(`pref.${name}.${value}`) }));
  }
  function loadPrefs() {
    for (const name of ["theme", "density"]) {
      let v = null;
      try { v = localStorage.getItem(`ui-prototype.${name}`); } catch (_) { /* ignore */ }
      if (v) { if (name === "theme" && v !== "system") document.documentElement.dataset.theme = v; if (name === "density") document.documentElement.dataset.density = v; }
      const sel = document.querySelector(`[data-pref="${name}"]`); if (sel && v) sel.value = v;
    }
  }

  // ---------- events ----------
  function onClick(e) {
    const el = e.target.closest("[data-action]");
    if (!el) {
      const f = e.target.closest("[data-focus]");
      if (f) { e.preventDefault(); document.getElementById(f.dataset.focus).focus(); }
      return;
    }
    const id = route().id;
    if (el.getAttribute("aria-disabled") === "true") {
      e.preventDefault();
      if (el.dataset.action === "accept-proposal") announce(t("proposal.blocked"));
      else if (el.dataset.action === "undo") announce(t("status.nothingToUndo"));
      else if (el.dataset.action === "redo") announce(t("status.nothingToRedo"));
      else if (el.dataset.action === "move-stage") announce(t(el.dataset.dir === "-1" ? "status.alreadyFirst" : "status.alreadyLast"));
      return;
    }
    switch (el.dataset.action) {
      case "new-recipe": return newRecipe();
      case "clear-search": store.query = ""; store.pendingFocus = "query"; return render();
      case "select": store.pendingFocus = el.dataset.key; return select(el.dataset.type, el.dataset.id);
      case "undo": return undo(id);
      case "redo": return redo(id);
      case "save": return save(id);
      case "discard": return discard(id);
      case "undo-discard": {
        const d = store.lastDiscard; document.getElementById("toast").hidden = true;
        if (d && d.draft) { store.drafts.set(d.id, d.draft); announce(t("status.discardUndone")); store.pendingFocus = "discard"; render(); }
        return;
      }
      case "dismiss-toast": document.getElementById("toast").hidden = true; return;
      case "remove": {
        const r = working(id); const a = add(r, el.dataset.addition); const i = ing(r, a.ing);
        store.pendingFocus = "add-ingredient";
        if (store.selection && store.selection.id === a.id) store.selection = null;
        return run(id, { op: "remove_addition", addition: a.id, focus: "add-ingredient" }, t("status.removed", { name: i.name, stage: stg(r, a.stage).name }));
      }
      case "move-stage": return moveStage(id, el.dataset.stage, Number(el.dataset.dir), el.dataset.key);
      case "add-ingredient": return openAddIngredient(id);
      case "add-stage": return openAddStage(id);
      case "close-dialog": return el.closest("dialog").close();
      case "advice": {
        const a = advisories(working(id))[Number(el.dataset.index)];
        if (a.select) { store.selection = a.select; store.pendingFocus = a.focusProp ? `prop-${add(working(id), a.select.id).ing}-${a.focusProp}` : `stage-${a.select.id}`; render(); }
        else if (a.target) { const t2 = document.querySelector(`[data-key="${a.target}"]`); if (t2) t2.focus(); }
        return;
      }
      case "revert": {
        const c = diff(id)[Number(el.dataset.index)];
        store.pendingFocus = "review-save";
        return run(id, { ...c.revert, focus: "review-save" }, t("status.reverted", { name: c.label }));
      }
      case "accept-proposal": {
        const base = findRecipe(id); const p = base.proposal; const next = clone(base);
        for (const c of p.changes) add(next, c.addition).amount = c.to;
        next.revision = base.revision + 1; next.updated = today; next.proposal = null;
        store.recipes[store.recipes.indexOf(base)] = next;
        announce(t("proposal.accepted", { n: next.revision }));
        store.pendingFocus = "back-edit";
        return render();
      }
      case "reject-proposal": {
        findRecipe(id).proposal = null;
        announce(t("proposal.rejected"));
        store.pendingFocus = "back-edit";
        return render();
      }
      case "palette": return openPalette();
      case "reset": resetData(); announce(t("status.reset")); go("#/library"); return render();
      default: return undefined;
    }
  }

  function onKeydown(e) {
    const mod = e.ctrlKey || e.metaKey;
    const id = route().id && findRecipe(route().id) ? route().id : null;
    const inDialog = e.target.closest && e.target.closest("dialog");
    if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); if (!inDialog) openPalette(); return; }
    if (e.key === "F6") { e.preventDefault(); cycleRegion(e.shiftKey ? -1 : 1); return; }
    if (inDialog || !id) return;
    if (mod && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (e.target.dataset && e.target.dataset.commit) commitField(e.target);
      save(id);
      return;
    }
    // Inside a text field with uncommitted typing, Ctrl+Z belongs to the field.
    const typing = e.target.matches && e.target.matches("input[type=text], textarea") && e.target.value !== e.target.defaultValue;
    if (mod && !typing && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) { e.preventDefault(); redo(id); return; }
    if (mod && !typing && e.key.toLowerCase() === "z") { e.preventDefault(); undo(id); return; }
    if (e.target.dataset && e.target.dataset.commit) {
      if (e.key === "Enter") { e.preventDefault(); commitField(e.target); }
      else if (e.key === "Escape") { e.target.value = e.target.defaultValue; delete store.fieldErrors[e.target.dataset.key]; render(); announce(t("status.editCancelled")); }
    }
    // Graph stand-in: arrow keys move between stages (roving tabindex).
    if (e.target.dataset && e.target.dataset.graph && ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
      const nodes = [...document.querySelectorAll("[data-graph]")]; const i = nodes.indexOf(e.target);
      const next = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: nodes.length - 1 }[e.key];
      if (nodes[next]) { e.preventDefault(); nodes.forEach((n) => n.setAttribute("tabindex", "-1")); nodes[next].setAttribute("tabindex", "0"); nodes[next].focus(); }
    }
  }

  function onChange(e) {
    const el = e.target;
    if (el.dataset.commit === "stage") {
      const id = el.dataset.recipe; const r = working(id); const a = add(r, el.dataset.addition);
      const from = stg(r, a.stage).name; const to = stg(r, el.value).name;
      return run(id, { op: "move_addition", addition: a.id, stage: el.value, focus: el.dataset.key },
        t("status.movedAddition", { name: ing(r, a.ing).name, from, to }));
    }
    if (el.dataset.input === "filter") { store.filter = el.value; return render(); }
    if (el.dataset.input === "graph") { store.graph = el.checked; return render(); }
    if (el.dataset.pref) return setPref(el.dataset.pref, el.value);
    if (el.id === "sim-failure") { store.simulateFailure = el.checked; announce(t(el.checked ? "status.failureOn" : "status.failureOff")); }
    return undefined;
  }

  let searchTimer;
  function onInput(e) {
    if (e.target.dataset.input === "query") {
      store.query = e.target.value; render();
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { const el = document.querySelector(".result-count, .empty p"); if (el) announce(el.textContent); }, 600);
    }
  }

  // Commit on leaving a field (focusout bubbles; blur doesn't).
  function onFocusOut(e) {
    const el = e.target;
    // Commit only what the person typed: a field whose value still equals what
    // was rendered has nothing to commit (and may be stale after undo).
    if (rendering || !el.dataset || !el.dataset.commit || el.dataset.commit === "stage") return;
    if (el.value !== el.defaultValue && document.body.contains(el)) {
      const next = e.relatedTarget;
      if (next && next.dataset && next.dataset.key) store.pendingFocus = next.dataset.key;
      commitField(el);
    }
  }

  function onSubmit(e) {
    const form = e.target;
    if (form.dataset.form === "add-ingredient") { e.preventDefault(); submitAddIngredient(form); }
    if (form.dataset.form === "add-stage") { e.preventDefault(); submitAddStage(form); }
  }

  // ---------- start ----------
  function fillStatic() {
    document.querySelectorAll("[data-msg]").forEach((el) => { el.textContent = t(el.dataset.msg); });
    document.querySelectorAll("[data-msg-label]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.msgLabel)); });
    document.querySelectorAll("option[data-msg]").forEach((el) => { el.textContent = t(el.dataset.msg); });
  }

  document.addEventListener("DOMContentLoaded", () => {
    resetData();
    fillStatic();
    loadPrefs();
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeydown);
    document.addEventListener("change", onChange);
    document.addEventListener("input", onInput);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("submit", onSubmit);
    document.addEventListener("pointerdown", () => { holdRender = true; }, true);
    const release = () => setTimeout(() => { holdRender = false; if (needsRender) { needsRender = false; render(); } });
    document.addEventListener("pointerup", release, true);
    document.addEventListener("pointercancel", release, true);
    document.querySelectorAll("dialog").forEach((d) => d.addEventListener("close", () => {
      const r = route();
      const key = d.id === "dlg-add" ? "add-ingredient" : null;
      if (key && r.view === "editor" && !store.pendingFocus) { const b = document.querySelector(`[data-key="${key}"]`); if (b) b.focus(); }
    }));
    window.addEventListener("hashchange", render);
    render();
  });
})();
