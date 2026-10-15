import { BEVERAGES, CONFIDENCES, FLOW_KINDS, INGREDIENT_KINDS, POINT_BASIS, TARGETS, TIMING_BASES, propertyRow, stageKind, targetFits, unitDefinition } from "@carboy/recipe-core";
import { CommandError } from "./diagnostics.js";
import { catalogRefArg, indexOf, insertAt, isObject, nameArg, newIdArg, oneOf, quantityArg, stringArg, type Obj } from "./util.js";

// Command catalogue v0 (EDITOR_COMMANDS §5). Each handler checks its own
// preconditions against the working copy and throws CommandError; the
// applier rejects the whole list on the first error (C2). Values written by
// a command carry the channel's origin (§4), never one the author chose.

export type Channel = "editor" | "ai_proposal" | "ai_created";

export const CHANNEL_ORIGIN: Readonly<Record<Channel, "manually_entered" | "ai_proposed">> = {
  editor: "manually_entered",
  ai_proposal: "ai_proposed",
  ai_created: "ai_proposed",
};

export interface Ctx {
  readonly c: Obj;
  readonly channel: Channel;
  /** Provenance for values this command writes. */
  readonly provenance: Obj;
}

interface OpSpec {
  /** Ops in the catalogue whose data or decision isn't there yet: refused before argument checks. */
  readonly unsupported?: true;
  readonly required: readonly string[];
  readonly optional?: readonly string[];
  /** Schema MINOR that introduced the op (default 1). */
  readonly minor?: number;
  readonly run: (ctx: Ctx, cmd: Obj) => void;
}

const unsupported = (why: string): OpSpec => ({
  unsupported: true,
  required: [],
  optional: [],
  run: () => {
    throw new CommandError("unsupported-op", why);
  },
});

// --- accessors -------------------------------------------------------------

const list = (o: Obj, key: string): Obj[] => {
  if (!Array.isArray(o[key])) o[key] = [];
  return o[key] as Obj[];
};
const objAt = (o: Obj, key: string): Obj => {
  if (!isObject(o[key])) o[key] = {};
  return o[key] as Obj;
};
const ingredients = (c: Obj) => list(c, "ingredients");
const additions = (c: Obj) => list(c, "additions");
const notes = (c: Obj) => list(c, "notes");
const stages = (c: Obj) => list(objAt(c, "process"), "stages");
const flows = (c: Obj) => list(objAt(c, "process"), "flows");

function ingredient(c: Obj, id: unknown): Obj {
  return ingredients(c)[indexOf(ingredients(c), id, "ingredient", "/ingredients")]!;
}
function addition(c: Obj, id: unknown): Obj {
  return additions(c)[indexOf(additions(c), id, "addition", "/additions")]!;
}
function stage(c: Obj, id: unknown): Obj {
  return stages(c)[indexOf(stages(c), id, "stage", "/process/stages")]!;
}
function flow(c: Obj, id: unknown): Obj {
  return flows(c)[indexOf(flows(c), id, "flow", "/process/flows")]!;
}
function stepOwner(c: Obj, id: unknown): { stage: Obj; steps: Obj[]; index: number } {
  for (const st of stages(c)) {
    const steps = list(st, "steps");
    const index = steps.findIndex((s) => s["id"] === id);
    if (index >= 0) return { stage: st, steps, index };
  }
  throw new CommandError("unknown-reference", "no step with this id", "/process/stages", { id });
}

const withProv = (ctx: Ctx, q: { value: string; unit: string }): Obj => ({ ...q, provenance: { ...ctx.provenance } });

// --- argument checks ------------------------------------------------------

function propertyValue(kind: string, property: string, value: unknown): { value: string; unit: string } {
  const row = propertyRow(kind, property);
  if (!row) throw new CommandError("unknown-property", `${property} is not in the property table for ${kind}`, undefined, { property, kind });
  const q = quantityArg(value, "value");
  if (!row.units.includes(q.unit)) throw new CommandError("unit-dimension-mismatch", `${property} takes ${row.units.join(", ")}`, undefined, { property, unit: q.unit });
  return q;
}

function stageKindArg(v: unknown): string {
  if (typeof v !== "string" || !stageKind(v)) throw new CommandError("unknown-stage-kind", "kind is not in the stage-kind table", undefined, { kind: v });
  return v;
}

/** Stage and step parameters: interim rule until the stage-kind table has parameter rows (RECIPE_CORE §7). */
function parameters(v: unknown): Obj {
  if (v === undefined) return {};
  if (!isObject(v)) throw new CommandError("invalid-argument", "parameters must be an object of quantities", undefined, { argument: "parameters" });
  const out: Obj = {};
  for (const [k, q] of Object.entries(v)) out[nameArg(k, "parameter name")] = quantityArg(q, `parameters.${k}`);
  return out;
}

const isDuration = (q: unknown) => isObject(q) && typeof q["unit"] === "string" && unitDefinition(q["unit"])?.dimension === "duration";

/** Timing per RECIPE_SCHEMA §7.2, checked against the stage kind it will sit in. */
function timingArg(v: unknown, kind: string): Obj {
  if (!isObject(v)) throw new CommandError("invalid-argument", "timing must be an object", undefined, { argument: "timing" });
  for (const k of Object.keys(v)) if (!["basis", "offset", "point", "contact"].includes(k)) throw new CommandError("unknown-member", `timing has no member ${k}`, undefined, { member: `timing.${k}` });
  const basis = oneOf(v["basis"], TIMING_BASES, "timing.basis");
  const needsOffset = basis === "after_start" || basis === "before_end";
  const out: Obj = { basis };
  if (needsOffset) {
    const off = quantityArg(v["offset"], "timing.offset");
    if (!isDuration(off)) throw new CommandError("unit-dimension-mismatch", "timing.offset is a duration", undefined, { argument: "timing.offset" });
    out["offset"] = off;
  } else if (v["offset"] !== undefined) {
    throw new CommandError("invalid-argument", `${basis} takes no offset`, undefined, { argument: "timing.offset" });
  }
  if (v["point"] !== undefined) {
    const allowed = stageKind(kind)?.points ?? [];
    if (typeof v["point"] !== "string" || !allowed.includes(v["point"])) throw new CommandError("invalid-timing-point", `a ${kind} stage allows points: ${allowed.join(", ") || "none"}`, undefined, { point: v["point"], stage_kind: kind });
    if (!(POINT_BASIS[v["point"]] ?? []).includes(basis)) throw new CommandError("invalid-argument", `${v["point"]} uses basis ${(POINT_BASIS[v["point"]] ?? []).join(" or ")}`, undefined, { argument: "timing.basis" });
    out["point"] = v["point"];
  }
  if (v["contact"] !== undefined) {
    const contact = quantityArg(v["contact"], "timing.contact");
    if (!isDuration(contact)) throw new CommandError("unit-dimension-mismatch", "timing.contact is a duration", undefined, { argument: "timing.contact" });
    out["contact"] = contact;
  }
  return out;
}

function amountArg(v: unknown, arg = "amount"): { value: string; unit: string } {
  const q = quantityArg(v, arg);
  const dim = unitDefinition(q.unit)?.dimension;
  if (dim !== "mass" && dim !== "volume" && dim !== "count") throw new CommandError("unit-dimension-mismatch", `${arg} is a mass, volume, or count`, undefined, { argument: arg, unit: q.unit });
  return q;
}

const stageKindOf = (c: Obj, id: unknown): string => String(stage(c, id)["kind"]);

/**
 * Place an addition within its stage. Additions are kept grouped in stage
 * order, so a stage with no additions yet gets its first one after the
 * additions of earlier stages.
 */
function placeAddition(c: Obj, ad: Obj, position: unknown): void {
  const arr = additions(c);
  const order = new Map(stages(c).map((s, i) => [s["id"], i]));
  const rank = order.get(ad["stage"]) ?? Infinity;
  if (!arr.some((e) => e["stage"] === ad["stage"]) && (position === undefined || position === "first" || position === "last")) {
    const after = arr.reduce((at, e, i) => ((order.get(e["stage"]) ?? Infinity) <= rank ? i + 1 : at), 0);
    arr.splice(after, 0, ad);
    return;
  }
  insertAt(arr, ad, position, (e) => e["stage"] === ad["stage"]);
}

/** Does an existing timing still fit a stage of `kind`? */
function timingFits(timing: unknown, kind: string): boolean {
  try {
    timingArg(timing, kind);
    return true;
  } catch {
    return false;
  }
}

/** Display order must follow flow direction: no flow from a later stage to an earlier one. */
function checkStageOrder(c: Obj): void {
  const order = new Map(stages(c).map((s, i) => [s["id"], i]));
  for (const f of flows(c)) {
    if ((order.get(f["from"]) ?? 0) > (order.get(f["to"]) ?? 0)) throw new CommandError("topology-invalid", "a stage would come after a stage it flows into", "/process/flows", { flow: f["id"] });
  }
}

// --- the catalogue ---------------------------------------------------------

export const OPS: Readonly<Record<string, OpSpec>> = {
  // §5.1 Recipe
  set_name: { required: ["name"], run: (x, a) => void (x.c["name"] = stringArg(a["name"], "name", { nonEmpty: true })) },
  set_beverage_type: { required: ["type"], run: (x, a) => void (objAt(x.c, "beverage")["type"] = oneOf(a["type"], BEVERAGES, "type")) },
  set_style: unsupported("style codes need the style system's data, which is not in Carboy yet (D-020)"),
  set_style_text: { required: ["text"], minor: 2, run: (x, a) => void (objAt(x.c, "beverage")["style_text"] = stringArg(a["text"], "text", { nonEmpty: true })) },
  clear_style: {
    required: [],
    run: (x) => {
      const bev = objAt(x.c, "beverage");
      delete bev["style"];
      delete bev["style_text"];
    },
  },
  add_note: {
    required: ["id", "text"],
    optional: ["position"],
    run: (x, a) => insertAt(notes(x.c), { id: newIdArg(x.c, a["id"]), text: stringArg(a["text"], "text") }, a["position"]),
  },
  set_note: { required: ["note", "text"], run: (x, a) => void (notes(x.c)[indexOf(notes(x.c), a["note"], "note", "/notes")]!["text"] = stringArg(a["text"], "text")) },
  remove_note: { required: ["note"], run: (x, a) => void notes(x.c).splice(indexOf(notes(x.c), a["note"], "note", "/notes"), 1) },

  // §5.2 Targets and stated statistics
  set_target: {
    required: ["name", "quantity"],
    run: (x, a) => {
      const name = oneOf(a["name"], Object.keys(TARGETS), "name");
      const q = quantityArg(a["quantity"], "quantity");
      if (!targetFits(name, q)) throw new CommandError("unit-dimension-mismatch", `${name} needs a ${TARGETS[name]!.dimension}${TARGETS[name]!.positive ? " greater than zero" : ""}`, undefined, { argument: "quantity" });
      objAt(x.c, "targets")[name] = withProv(x, q);
    },
  },
  clear_target: {
    required: ["name"],
    run: (x, a) => {
      const t = objAt(x.c, "targets");
      if (typeof a["name"] !== "string" || !(a["name"] in t)) throw new CommandError("unknown-reference", "no such target", "/targets", { name: a["name"] });
      delete t[a["name"]];
    },
  },
  set_stated_statistic: {
    required: ["statistic", "layer", "quantity"],
    run: (x, a) => {
      const name = nameArg(a["statistic"], "statistic");
      const layer = oneOf(a["layer"], ["declared", "measured"] as const, "layer");
      // Measured values come from batch readings (Phase 7); neither the editor nor an AI may label a value measured (C7).
      if (layer === "measured") throw new CommandError("op-not-permitted", "measured values come only from batch readings", undefined, { layer });
      objAt(objAt(x.c, "statistics"), name)[layer] = withProv(x, quantityArg(a["quantity"], "quantity"));
    },
  },
  clear_stated_statistic: {
    required: ["statistic", "layer"],
    run: (x, a) => {
      const entry = objAt(x.c, "statistics")[a["statistic"] as string];
      const layer = oneOf(a["layer"], ["declared", "measured"] as const, "layer");
      if (!isObject(entry) || entry[layer] === undefined) throw new CommandError("unknown-reference", "no such stated value", "/statistics", { statistic: a["statistic"], layer });
      delete entry[layer];
    },
  },
  set_statistic_display: {
    required: ["statistic", "layer"],
    run: (x, a) => void (objAt(objAt(x.c, "statistics"), nameArg(a["statistic"], "statistic"))["display"] = oneOf(a["layer"], ["declared", "imported_estimate", "measured", "calculated"] as const, "layer")),
  },
  clear_statistic_display: {
    required: ["statistic"],
    run: (x, a) => {
      const entry = objAt(x.c, "statistics")[a["statistic"] as string];
      if (!isObject(entry) || entry["display"] === undefined) throw new CommandError("unknown-reference", "no display choice for this statistic", "/statistics", { statistic: a["statistic"] });
      delete entry["display"];
    },
  },

  // §5.3 Ingredients
  add_ingredient: {
    required: ["id", "kind", "name"],
    optional: ["properties", "catalog_ref"],
    run: (x, a) => {
      const id = newIdArg(x.c, a["id"]);
      const kind = oneOf(a["kind"], INGREDIENT_KINDS, "kind");
      const ing: Obj = { id, kind, name: stringArg(a["name"], "name", { nonEmpty: true }), properties: {} };
      if (a["properties"] !== undefined) {
        if (!isObject(a["properties"])) throw new CommandError("invalid-argument", "properties must be an object", undefined, { argument: "properties" });
        for (const [k, v] of Object.entries(a["properties"])) (ing["properties"] as Obj)[k] = withProv(x, propertyValue(kind, k, v));
      }
      if (a["catalog_ref"] !== undefined) ing["catalog_ref"] = catalogRefArg(a["catalog_ref"], "catalog_ref");
      ingredients(x.c).push(ing);
    },
  },
  set_ingredient_name: { required: ["ingredient", "name"], run: (x, a) => void (ingredient(x.c, a["ingredient"])["name"] = stringArg(a["name"], "name", { nonEmpty: true })) },
  set_ingredient_property: {
    required: ["ingredient", "property", "value"],
    run: (x, a) => {
      const ing = ingredient(x.c, a["ingredient"]);
      const prop = stringArg(a["property"], "property");
      objAt(ing, "properties")[prop] = withProv(x, propertyValue(String(ing["kind"]), prop, a["value"]));
    },
  },
  clear_ingredient_property: {
    required: ["ingredient", "property"],
    run: (x, a) => {
      const props = objAt(ingredient(x.c, a["ingredient"]), "properties");
      if (typeof a["property"] !== "string" || !(a["property"] in props)) throw new CommandError("unknown-reference", "the ingredient has no such property", undefined, { property: a["property"] });
      delete props[a["property"]];
    },
  },
  set_ingredient_catalog_ref: { required: ["ingredient", "catalog_ref"], run: (x, a) => void (ingredient(x.c, a["ingredient"])["catalog_ref"] = catalogRefArg(a["catalog_ref"], "catalog_ref")) },
  clear_ingredient_catalog_ref: { required: ["ingredient"], run: (x, a) => void delete ingredient(x.c, a["ingredient"])["catalog_ref"] },
  // Schema 0.2 (INGREDIENT_CATALOG §3): requirement and approved alternatives.
  set_ingredient_group_ref: { required: ["ingredient", "group_ref"], minor: 2, run: (x, a) => void (ingredient(x.c, a["ingredient"])["group_ref"] = catalogRefArg(a["group_ref"], "group_ref")) },
  clear_ingredient_group_ref: { required: ["ingredient"], minor: 2, run: (x, a) => void delete ingredient(x.c, a["ingredient"])["group_ref"] },
  set_ingredient_alternatives: {
    required: ["ingredient", "alternatives"],
    minor: 2,
    run: (x, a) => {
      const ing = ingredient(x.c, a["ingredient"]);
      if (!Array.isArray(a["alternatives"])) throw new CommandError("invalid-argument", "alternatives must be an array", undefined, { argument: "alternatives" });
      ing["alternatives"] = a["alternatives"].map((alt, i) => {
        if (!isObject(alt) || Object.keys(alt).some((k) => k !== "catalog_ref" && k !== "note")) throw new CommandError("invalid-argument", "an alternative is { catalog_ref, note? }", undefined, { argument: `alternatives[${i}]` });
        const out: Obj = { catalog_ref: catalogRefArg(alt["catalog_ref"], `alternatives[${i}].catalog_ref`), provenance: { ...x.provenance } };
        if (alt["note"] !== undefined) out["note"] = stringArg(alt["note"], `alternatives[${i}].note`);
        return out;
      });
      if ((ing["alternatives"] as Obj[]).length === 0) delete ing["alternatives"];
    },
  },
  remove_ingredient: {
    required: ["ingredient"],
    run: (x, a) => {
      const i = indexOf(ingredients(x.c), a["ingredient"], "ingredient", "/ingredients");
      const users = additions(x.c).filter((ad) => ad["ingredient"] === a["ingredient"]).map((ad) => ad["id"]);
      if (users.length) throw new CommandError("entity-referenced", "additions still use this ingredient; remove them in the same list", `/ingredients/${i}`, { additions: users });
      ingredients(x.c).splice(i, 1);
    },
  },

  // §5.4 Additions
  add_addition: {
    required: ["id", "ingredient", "stage", "amount", "timing"],
    optional: ["position"],
    run: (x, a) => {
      const id = newIdArg(x.c, a["id"]);
      ingredient(x.c, a["ingredient"]);
      const kind = stageKindOf(x.c, a["stage"]);
      const ad: Obj = { id, ingredient: a["ingredient"], stage: a["stage"], amount: withProv(x, amountArg(a["amount"])), timing: timingArg(a["timing"], kind) };
      placeAddition(x.c, ad, a["position"]);
    },
  },
  set_addition_amount: { required: ["addition", "amount"], run: (x, a) => void (addition(x.c, a["addition"])["amount"] = withProv(x, amountArg(a["amount"]))) },
  set_addition_timing: {
    required: ["addition", "timing"],
    run: (x, a) => {
      const ad = addition(x.c, a["addition"]);
      ad["timing"] = timingArg(a["timing"], stageKindOf(x.c, ad["stage"]));
    },
  },
  move_addition: {
    required: ["addition", "stage"],
    optional: ["timing", "position"],
    run: (x, a) => {
      const arr = additions(x.c);
      const i = indexOf(arr, a["addition"], "addition", "/additions");
      const ad = arr[i]!;
      const kind = stageKindOf(x.c, a["stage"]);
      if (a["timing"] !== undefined) ad["timing"] = timingArg(a["timing"], kind);
      else if (!timingFits(ad["timing"], kind)) throw new CommandError("invalid-timing-point", "the addition's timing doesn't fit the target stage; give a timing", undefined, { stage_kind: kind });
      arr.splice(i, 1);
      ad["stage"] = a["stage"];
      placeAddition(x.c, ad, a["position"]);
    },
  },
  reorder_addition: {
    required: ["addition", "position"],
    run: (x, a) => {
      const arr = additions(x.c);
      const [ad] = arr.splice(indexOf(arr, a["addition"], "addition", "/additions"), 1);
      placeAddition(x.c, ad!, a["position"]);
    },
  },
  remove_addition: { required: ["addition"], run: (x, a) => void additions(x.c).splice(indexOf(additions(x.c), a["addition"], "addition", "/additions"), 1) },

  // §5.5 Process stages and steps
  add_stage: {
    required: ["id", "kind"],
    optional: ["name", "parameters", "position"],
    run: (x, a) => {
      const st: Obj = { id: newIdArg(x.c, a["id"]), kind: stageKindArg(a["kind"]) };
      if (a["name"] !== undefined) st["name"] = stringArg(a["name"], "name");
      st["parameters"] = withProvAll(x, parameters(a["parameters"]));
      st["steps"] = [];
      insertAt(stages(x.c), st, a["position"]);
      checkStageOrder(x.c);
    },
  },
  set_stage_name: { required: ["stage", "name"], run: (x, a) => void (stage(x.c, a["stage"])["name"] = stringArg(a["name"], "name")) },
  set_stage_parameter: {
    required: ["stage", "parameter", "value"],
    run: (x, a) => void (objAt(stage(x.c, a["stage"]), "parameters")[nameArg(a["parameter"], "parameter")] = withProv(x, quantityArg(a["value"], "value"))),
  },
  clear_stage_parameter: { required: ["stage", "parameter"], run: (x, a) => clearMember(objAt(stage(x.c, a["stage"]), "parameters"), a["parameter"], "parameter") },
  move_stage: {
    required: ["stage", "position"],
    run: (x, a) => {
      const arr = stages(x.c);
      const [st] = arr.splice(indexOf(arr, a["stage"], "stage", "/process/stages"), 1);
      insertAt(arr, st!, a["position"]);
      checkStageOrder(x.c);
    },
  },
  remove_stage: {
    required: ["stage"],
    run: (x, a) => {
      const i = indexOf(stages(x.c), a["stage"], "stage", "/process/stages");
      const refs = [
        ...additions(x.c).filter((ad) => ad["stage"] === a["stage"]).map((e) => e["id"]),
        ...list(stages(x.c)[i]!, "steps").map((e) => e["id"]),
        ...flows(x.c).filter((f) => f["from"] === a["stage"] || f["to"] === a["stage"]).map((e) => e["id"]),
      ];
      if (refs.length) throw new CommandError("entity-referenced", "additions, steps, or flows still reference this stage; remove them in the same list", `/process/stages/${i}`, { references: refs });
      stages(x.c).splice(i, 1);
    },
  },
  add_step: {
    required: ["id", "stage", "parameters"],
    optional: ["name", "position"],
    run: (x, a) => {
      const id = newIdArg(x.c, a["id"]);
      const st = stage(x.c, a["stage"]);
      const step: Obj = { id };
      if (a["name"] !== undefined) step["name"] = stringArg(a["name"], "name");
      step["parameters"] = withProvAll(x, parameters(a["parameters"]));
      insertAt(list(st, "steps"), step, a["position"]);
    },
  },
  set_step_parameter: {
    required: ["step", "parameter", "value"],
    run: (x, a) => {
      const { steps, index } = stepOwner(x.c, a["step"]);
      objAt(steps[index]!, "parameters")[nameArg(a["parameter"], "parameter")] = withProv(x, quantityArg(a["value"], "value"));
    },
  },
  clear_step_parameter: {
    required: ["step", "parameter"],
    run: (x, a) => {
      const { steps, index } = stepOwner(x.c, a["step"]);
      clearMember(objAt(steps[index]!, "parameters"), a["parameter"], "parameter");
    },
  },
  move_step: {
    required: ["step", "position"],
    run: (x, a) => {
      const { steps, index } = stepOwner(x.c, a["step"]);
      const [step] = steps.splice(index, 1);
      insertAt(steps, step!, a["position"]);
    },
  },
  remove_step: {
    required: ["step"],
    run: (x, a) => {
      const { steps, index } = stepOwner(x.c, a["step"]);
      steps.splice(index, 1);
    },
  },

  // §5.6 Flows
  add_flow: {
    required: ["id", "kind", "from", "to"],
    optional: ["amount"],
    run: (x, a) => {
      const f: Obj = { id: newIdArg(x.c, a["id"]), kind: oneOf(a["kind"], FLOW_KINDS, "kind"), from: a["from"], to: a["to"] };
      stage(x.c, a["from"]);
      stage(x.c, a["to"]);
      if (a["amount"] !== undefined) f["amount"] = withProv(x, quantityArg(a["amount"], "amount"));
      flows(x.c).push(f);
      checkStageOrder(x.c);
    },
  },
  set_flow_amount: { required: ["flow", "amount"], run: (x, a) => void (flow(x.c, a["flow"])["amount"] = withProv(x, quantityArg(a["amount"], "amount"))) },
  clear_flow_amount: { required: ["flow"], run: (x, a) => clearMember(flow(x.c, a["flow"]), "amount", "amount") },
  remove_flow: { required: ["flow"], run: (x, a) => void flows(x.c).splice(indexOf(flows(x.c), a["flow"], "flow", "/process/flows"), 1) },

  // §5.7 Equipment and water: field lists are Needs confirmation (Phase 3).
  apply_equipment_snapshot: unsupported("equipment fields are not defined yet (Phase 3)"),
  set_equipment_field: unsupported("equipment fields are not defined yet (Phase 3)"),
  clear_equipment_field: unsupported("equipment fields are not defined yet (Phase 3)"),
  clear_equipment: unsupported("equipment fields are not defined yet (Phase 3)"),
  set_water_profile: unsupported("water profiles are not defined yet"),
  clear_water_profile: unsupported("water profiles are not defined yet"),

  // §5.9 Presentation: waits for RECIPE_SCHEMA Q4 (layout as revision or sidecar).
  set_node_layout: unsupported("presentation commands wait for RECIPE_SCHEMA Q4"),
  set_node_collapsed: unsupported("presentation commands wait for RECIPE_SCHEMA Q4"),
  set_viewport: unsupported("presentation commands wait for RECIPE_SCHEMA Q4"),
};

export const PRESENTATION_OPS = new Set(["set_node_layout", "set_node_collapsed", "set_viewport"]);

function withProvAll(x: Ctx, params: Obj): Obj {
  const out: Obj = {};
  for (const [k, q] of Object.entries(params)) out[k] = withProv(x, q as { value: string; unit: string });
  return out;
}

function clearMember(o: Obj, name: unknown, what: string): void {
  if (typeof name !== "string" || !(name in o)) throw new CommandError("unknown-reference", `no such ${what}`, undefined, { [what]: name });
  delete o[name];
}

/** The optional command `provenance`: confidence and note only (§4). */
export function commandProvenance(v: unknown): Obj {
  if (v === undefined) return {};
  if (!isObject(v)) throw new CommandError("invalid-argument", "provenance must be an object", undefined, { argument: "provenance" });
  const out: Obj = {};
  for (const [k, val] of Object.entries(v)) {
    if (k === "confidence") out[k] = oneOf(val, CONFIDENCES, "provenance.confidence");
    else if (k === "note") out[k] = stringArg(val, "provenance.note");
    else throw new CommandError("invalid-argument", "a command may set provenance confidence and note only; the channel sets the origin", undefined, { argument: `provenance.${k}` });
  }
  return out;
}
