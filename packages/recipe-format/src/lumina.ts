import { Decimal, convert, unitDefinition, type Content } from "@carboy/recipe-core";

// Lumina mapping v0 (RECIPE_SCHEMA §11; PROJECT_PLAN Phase 2 "Lumina ⇄ Carboy
// round-trip fixtures"). Lumina's recipe dict (brains/recipes, as produced by
// its BeerXML importer) to Carboy content and back.
//
// - Typed quantities are authoritative; Lumina's legacy imperial floats
//   (weight_lb, batch_size_gal, …) are derived from them on export.
// - Lumina-only fields of an ingredient or addition (ppg, per-malt
//   efficiency, yeast attenuation, misc notes, …) go into the ingredient's
//   `unmapped`, each as the JSON text of the original value, so they
//   round-trip exactly and are never calculated from (Q9).
// - Anything else with no Carboy home is dropped and listed in the report:
//   nothing is lost silently, nothing is invented.
// - Nothing is defaulted: no timing, unit, or value is assumed. Placement in
//   stages follows Lumina's own `use` (Mash, Boil, Secondary, Bottle).

type Obj = { [key: string]: unknown };
type Quantity = { value: string; unit: string; provenance?: Obj };

export interface LuminaReportEntry {
  /** JSON Pointer into the Lumina dict. */
  readonly path: string;
  readonly reason: "not-mapped" | "derived" | "file-name-not-stored" | "workflow-state" | "import-metadata";
}

export type FromLuminaResult =
  | { readonly status: "mapped"; readonly content: Content; readonly report: readonly LuminaReportEntry[] }
  | { readonly status: "unsupported"; readonly reason: string; readonly path: string };

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const arr = (v: unknown): Obj[] => (Array.isArray(v) ? (v.filter(isObj) as Obj[]) : []);

/** Units Lumina's BeerXML statistics carry implicitly (BeerXML 1.0: OG/FG specific gravity, ABV percent, IBU, colour SRM). */
const STATISTIC_UNITS: Readonly<Record<string, string>> = { og: "SG", fg: "SG", abv: "%", ibu: "IBU", color: "SRM" };
/** Lumina `use` → Carboy stage kind. */
const USE_STAGE: Readonly<Record<string, string>> = { Mash: "mash", Boil: "boil", Primary: "fermentation", Secondary: "fermentation", Bottle: "packaging", Bottling: "packaging" };
const STAGE_ORDER = ["mash", "sparge", "boil", "fermentation", "packaging"];
/** Recipe-level keys that are derived on export, or dropped with a reason. */
const DERIVED_TOP = ["batch_size_gal", "method"];
const DROPPED_TOP: Readonly<Record<string, LuminaReportEntry["reason"]>> = { status: "workflow-state", source_import: "import-metadata" };
/** Quantity members Carboy keeps (value, unit, and what provenance records); the rest are derived or dropped. */
const QUANTITY_DERIVED = ["dimension", "normalized_value", "normalized_unit"];

// --- numbers ---------------------------------------------------------------

/** A JS/Python float as a normalized decimal string (shortest round-trip digits, no exponent). */
export function decimalFromNumber(n: number): string {
  const s = String(n);
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-]\d+)$/.exec(s);
  if (!m) return Decimal.parse(s).toString();
  const digits = m[2]! + (m[3] ?? "");
  const point = m[2]!.length + Number(m[4]);
  const text = point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  return Decimal.parse(m[1] + text).toString();
}
const num = (q: { value: string; unit: string }, unit?: string) => Number((unit && unit !== q.unit ? convert(q, unit) : Decimal.parse(q.value)).toString());

// --- import ----------------------------------------------------------------

export function fromLumina(dict: unknown, options: { readonly newId: () => string }): FromLuminaResult {
  if (!isObj(dict)) return { status: "unsupported", reason: "not-a-recipe", path: "" };
  const bev = beverageFrom(dict["beverage_type"]);
  if (!bev) return { status: "unsupported", reason: "unsupported-beverage", path: "/beverage_type" };

  const report: LuminaReportEntry[] = [];
  const drop = (path: string, reason: LuminaReportEntry["reason"] = "not-mapped") => report.push({ path, reason });
  const ingredients: Obj[] = [];
  const additions: Obj[] = [];
  const stages = new Map<string, Obj>();
  const stageId = (kind: string) => {
    if (!stages.has(kind)) stages.set(kind, { id: options.newId(), kind, parameters: {}, steps: [] });
    return stages.get(kind)!["id"] as string;
  };
  const process = isObj(dict["process"]) ? dict["process"] : {};
  const pq = isObj(process["quantities"]) ? process["quantities"] : {};

  // Recipe level.
  const beverage: Obj = { type: bev };
  if (typeof dict["style"] === "string" && dict["style"].trim()) beverage["style_text"] = dict["style"];
  const targets: Obj = {};
  if (isObj(pq["batch_size"])) targets["batch_volume"] = quantityFrom(pq["batch_size"], "/process/quantities/batch_size", drop);
  if (isObj(pq["boil_size"])) targets["boil_volume"] = quantityFrom(pq["boil_size"], "/process/quantities/boil_size", drop);
  for (const k of DERIVED_TOP) if (k in dict) drop(`/${k}`, "derived");
  for (const [k, reason] of Object.entries(DROPPED_TOP)) if (k in dict) drop(`/${k}`, reason);

  // Ingredients with one addition each.
  const item = (src: Obj, path: string, kind: string, consumed: string[], props: Obj, stageKind: string | undefined, timing: Obj | undefined) => {
    const id = options.newId();
    const unmapped: Obj = {};
    for (const [k, v] of Object.entries(src)) if (!["name", "quantity", ...consumed].includes(k)) unmapped[k] = JSON.stringify(v);
    const ing: Obj = { id, kind, name: String(src["name"] ?? ""), properties: props };
    if (Object.keys(unmapped).length) ing["unmapped"] = unmapped;
    ingredients.push(ing);
    if (!isObj(src["quantity"])) return drop(`${path}/quantity`);
    const ad: Obj = { id: options.newId(), ingredient: id, stage: stageId(stageKind ?? "boil"), amount: quantityFrom(src["quantity"], `${path}/quantity`, drop) };
    if (timing) ad["timing"] = timing;
    additions.push(ad);
  };
  const prop = (value: unknown, unit: string, field: string): Obj => ({ value: decimalFromNumber(value as number), unit, provenance: { origin: "imported", source: { format: "lumina", field } } });
  const boilTiming = (min: unknown): Obj | undefined => {
    const n = typeof min === "string" ? Number(min) : (min as number);
    if (typeof n !== "number" || Number.isNaN(n)) return undefined;
    return n === 0 ? { basis: "at_end" } : { basis: "before_end", offset: { value: decimalFromNumber(n), unit: "min" } };
  };

  const mashFermentables = dict["method"] !== "extract";
  arr(dict["fermentables"]).forEach((f, i) => {
    const props: Obj = {};
    if (typeof f["color_lovibond"] === "number") props["color"] = prop(f["color_lovibond"], "degL", "color_lovibond");
    item(f, `/fermentables/${i}`, "fermentable", ["weight_lb", "color_lovibond"], props, mashFermentables ? "mash" : "boil", undefined);
  });
  arr(dict["hops"]).forEach((h, i) => {
    const props: Obj = {};
    if (typeof h["alpha_acid"] === "number") props["alpha_acid"] = prop(h["alpha_acid"], "fraction", "alpha_acid");
    item(h, `/hops/${i}`, "hop", ["weight_oz", "alpha_acid", "boil_time_min"], props, "boil", boilTiming(h["boil_time_min"]));
  });
  // `use` places the addition in a stage and is also kept verbatim (Primary and Secondary share a stage).
  arr(dict["botanicals"]).forEach((b, i) => item(b, `/botanicals/${i}`, "adjunct", ["weight_oz"], {}, USE_STAGE[String(b["use"])], undefined));
  arr(dict["additions"]).forEach((m, i) => {
    const stage = USE_STAGE[String(m["use"])];
    const timing = stage === "boil" ? boilTiming(m["time_min"]) : undefined;
    item(m, `/additions/${i}`, miscKind(m["type"]), timing ? ["time_min"] : [], {}, stage, timing);
  });
  if (isObj(dict["yeast"]) && Object.keys(dict["yeast"]).length) item(dict["yeast"], "/yeast", "culture", [], {}, "fermentation", undefined);
  const water = isObj(dict["water"]) ? dict["water"] : {};
  arr(water["treatments"]).forEach((t, i) => item({ ...t, name: t["salt"] }, `/water/treatments/${i}`, "water_agent", ["salt", "phase"], {}, t["phase"] === "sparge" ? "sparge" : "mash", undefined));
  for (const k of Object.keys(water)) if (k !== "treatments") drop(`/water/${k}`);

  // Process.
  arr(process["mash_steps"]).forEach((s, i) => {
    const params: Obj = {};
    if (typeof s["step_temp_f"] === "number") params["temperature"] = { value: decimalFromNumber(s["step_temp_f"]), unit: "F" };
    if (typeof s["step_time_min"] === "number") params["duration"] = { value: decimalFromNumber(s["step_time_min"]), unit: "min" };
    const step: Obj = { id: options.newId(), parameters: params };
    if (typeof s["name"] === "string") step["name"] = s["name"];
    stageId("mash");
    (stages.get("mash")!["steps"] as Obj[]).push(step);
    for (const k of Object.keys(s)) if (!["name", "step_temp_f", "step_time_min"].includes(k)) drop(`/process/mash_steps/${i}/${k}`);
  });
  arr(process["fermentation_steps"]).forEach((s, i) => {
    const params: Obj = {};
    if (typeof s["temp_f"] === "number") params["temperature"] = { value: decimalFromNumber(s["temp_f"]), unit: "F" };
    if (typeof s["days"] === "number") params["duration"] = { value: decimalFromNumber(s["days"]), unit: "day" };
    const step: Obj = { id: options.newId(), parameters: params };
    if (typeof s["stage"] === "string") step["name"] = s["stage"];
    stageId("fermentation");
    (stages.get("fermentation")!["steps"] as Obj[]).push(step);
    for (const k of Object.keys(s)) if (!["stage", "temp_f", "days"].includes(k) && !(k === "notes" && s[k] === "")) drop(`/process/fermentation_steps/${i}/${k}`);
  });
  if (isObj(pq["boil_time"])) {
    stageId("boil");
    (stages.get("boil")!["parameters"] as Obj)["duration"] = quantityFrom(pq["boil_time"], "/process/quantities/boil_time", drop);
  }
  for (const k of Object.keys(process)) {
    if (k === "quantities") {
      for (const q of Object.keys(pq)) if (!["batch_size", "boil_size", "boil_time"].includes(q)) drop(`/process/quantities/${q}`);
    } else if (["boil_time_min", "boil_size_gal", "mash_temp_f", "mash_time_min", "fermentation_temp_f"].includes(k)) drop(`/process/${k}`, "derived");
    else if (!["mash_steps", "fermentation_steps"].includes(k)) drop(`/process/${k}`);
  }

  // Stated statistics (calculated values are never imported into content).
  const statistics: Obj = {};
  for (const [name, entry] of Object.entries(isObj(dict["statistics"]) ? dict["statistics"] : {})) {
    if (name === "batch_volume" || name === "boil_volume") {
      drop(`/statistics/${name}`, "derived");
      continue;
    }
    if (!isObj(entry)) continue;
    const out: Obj = {};
    for (const [layer, v] of Object.entries(entry)) {
      const unit = isObj(v) ? (typeof v["unit"] === "string" && unitDefinition(v["unit"]) ? v["unit"] : STATISTIC_UNITS[name]) : undefined;
      if (!["declared", "imported_estimate", "measured"].includes(layer) || !isObj(v) || typeof v["value"] !== "number" || !unit) {
        drop(`/statistics/${name}/${layer}`);
        continue;
      }
      out[layer] = { value: decimalFromNumber(v["value"]), unit, provenance: { origin: layer === "measured" ? "measured" : "imported", source: { format: typeof v["source"] === "string" ? v["source"] : "lumina", field: `statistics.${name}.${layer}` } } };
    }
    if (Object.keys(out).length) statistics[name] = out;
  }

  const notes = (Array.isArray(dict["notes"]) ? dict["notes"] : []).filter((n): n is string => typeof n === "string").map((text) => ({ id: options.newId(), text }));
  for (const k of Object.keys(dict)) {
    if (!["name", "beverage_type", "style", "process", "fermentables", "hops", "botanicals", "additions", "yeast", "water", "statistics", "notes", ...DERIVED_TOP, ...Object.keys(DROPPED_TOP)].includes(k)) drop(`/${k}`);
  }

  // Stages in process order, linked by transfers.
  const ordered = STAGE_ORDER.filter((k) => stages.has(k)).map((k) => stages.get(k)!);
  const flows = ordered.slice(1).map((s, i) => ({ id: options.newId(), kind: "transfer", from: ordered[i]!["id"], to: s["id"] }));
  const byStage = (a: Obj) => STAGE_ORDER.indexOf(String(ordered.find((s) => s["id"] === a["stage"])?.["kind"]));
  const content = {
    name: String(dict["name"] ?? ""),
    beverage,
    targets,
    ingredients,
    process: { stages: ordered, flows },
    additions: additions.map((a, i) => [a, i] as const).sort(([x, i], [y, j]) => byStage(x) - byStage(y) || i - j).map(([a]) => a),
    statistics,
    calculation_settings: {},
    notes,
  };
  return { status: "mapped", content: content as unknown as Content, report };
}

function beverageFrom(v: unknown): string | undefined {
  const t = String(v ?? "").toLowerCase();
  if (t === "beer" || t.endsWith("_beer")) return "beer";
  return ["wine", "mead", "cider"].includes(t) ? t : undefined;
}

function miscKind(type: unknown): string {
  return ({ Fining: "fining", "Water Agent": "water_agent", Spice: "adjunct", Herb: "adjunct", Flavor: "adjunct" } as Record<string, string>)[String(type)] ?? "other";
}

/** A Lumina typed quantity to a Carboy quantity; Lumina's status and source go into provenance. */
function quantityFrom(q: Obj, path: string, drop: (p: string, r?: LuminaReportEntry["reason"]) => void): Quantity {
  const p = isObj(q["provenance"]) ? q["provenance"] : {};
  const source: Obj = { format: typeof p["source_format"] === "string" ? p["source_format"] : "lumina" };
  if (typeof q["source_field"] === "string") source["field"] = q["source_field"];
  if (typeof q["original_display"] === "string") source["original_display"] = q["original_display"];
  const prov: Obj = { origin: p["origin"] === "inferred" ? "inferred" : "imported", source };
  if (q["status"] === "ambiguous") prov["confidence"] = "ambiguous";
  else if (q["status"] === "inferred") prov["confidence"] = "estimated";
  for (const k of QUANTITY_DERIVED) if (k in q) drop(`${path}/${k}`, "derived");
  if (typeof p["source_filename"] === "string") drop(`${path}/provenance/source_filename`, "file-name-not-stored");
  for (const k of ["adapter_profile", "resolution"]) if (p[k] !== null && p[k] !== undefined) drop(`${path}/provenance/${k}`);
  return { value: Decimal.parse(String(q["value"])).toString(), unit: String(q["unit"]), provenance: prov };
}

// --- export ----------------------------------------------------------------

/** Carboy content back to a Lumina recipe dict. Values Lumina derives (legacy floats) are recomputed. */
export function toLumina(content: Content): Obj {
  const c = content as unknown as Obj;
  const bev = isObj(c["beverage"]) ? c["beverage"] : {};
  const stages = isObj(c["process"]) ? arr(c["process"]["stages"]) : [];
  const kindOf = new Map(stages.map((s) => [s["id"], String(s["kind"])]));
  const ings = arr(c["ingredients"]);
  const adds = arr(c["additions"]);
  const targets = isObj(c["targets"]) ? c["targets"] : {};
  const method = adds.some((a) => kindOf.get(a["stage"]) === "mash" && ings.find((g) => g["id"] === a["ingredient"])?.["kind"] === "fermentable") ? "all_grain" : "extract";
  const out: Obj = { name: c["name"], method };
  if (bev["style_text"] !== undefined) out["style"] = bev["style_text"];
  const batch = targets["batch_volume"] as Quantity | undefined;
  if (batch) out["batch_size_gal"] = num(batch, "US gal");

  const restore = (ing: Obj): Obj => Object.fromEntries(Object.entries(isObj(ing["unmapped"]) ? ing["unmapped"] : {}).map(([k, v]) => [k, JSON.parse(String(v))]));
  const additionOf = (ing: Obj) => adds.find((a) => a["ingredient"] === ing["id"]);
  const qty = (a: Obj | undefined) => (a && isObj(a["amount"]) ? quantityTo(a["amount"] as Quantity) : undefined);
  const timeMin = (a: Obj | undefined): number | undefined => {
    const t = a && isObj(a["timing"]) ? a["timing"] : undefined;
    if (!t) return undefined;
    return t["basis"] === "at_end" ? 0 : isObj(t["offset"]) ? num(t["offset"] as Quantity, "min") : undefined;
  };
  const props = (ing: Obj) => (isObj(ing["properties"]) ? ing["properties"] : {}) as { [k: string]: Quantity };

  const fermentables: Obj[] = [], hops: Obj[] = [], botanicals: Obj[] = [], misc: Obj[] = [], treatments: Obj[] = [];
  let yeast: Obj | undefined;
  for (const ing of ings) {
    const a = additionOf(ing);
    const q = qty(a);
    const base: Obj = { name: ing["name"], ...restore(ing) };
    const amount = a ? (a["amount"] as Quantity) : undefined;
    switch (ing["kind"]) {
      case "fermentable":
        fermentables.push({ ...base, ...(amount ? { weight_lb: num(amount, "lb") } : {}), ...(props(ing)["color"] ? { color_lovibond: num(props(ing)["color"]!) } : {}), ...(q ? { quantity: q } : {}) });
        break;
      case "hop": {
        const t = timeMin(a);
        hops.push({ ...base, ...(amount ? { weight_oz: num(amount, "oz") } : {}), ...(props(ing)["alpha_acid"] ? { alpha_acid: num(props(ing)["alpha_acid"]!, "fraction") } : {}), ...(t !== undefined ? { boil_time_min: t } : {}), ...(q ? { quantity: q } : {}) });
        break;
      }
      case "culture":
        yeast = { ...base, ...(q ? { quantity: q } : {}) };
        break;
      case "water_agent":
        treatments.push({ phase: a && kindOf.get(a["stage"]) === "sparge" ? "sparge" : "mash", salt: ing["name"], ...restore(ing), ...(q ? { quantity: q } : {}) });
        break;
      case "adjunct":
        botanicals.push({ ...base, ...(amount && unitDefinition(amount.unit)?.dimension === "mass" ? { weight_oz: num(amount, "oz") } : {}), ...(q ? { quantity: q } : {}) });
        break;
      default: {
        const t = timeMin(a);
        misc.push({ ...base, ...(t !== undefined ? { time_min: String(t) } : {}), ...(q ? { quantity: q } : {}) });
      }
    }
  }
  out["fermentables"] = fermentables;
  out["hops"] = hops;
  if (botanicals.length) out["botanicals"] = botanicals;
  out["additions"] = misc;
  out["yeast"] = yeast ?? {};
  out["water"] = treatments.length ? { treatments } : {};

  // Process.
  const stage = (kind: string) => stages.find((s) => s["kind"] === kind);
  const steps = (kind: string) => arr(stage(kind)?.["steps"]);
  const param = (s: Obj, name: string, unit: string) => (isObj(s["parameters"]) && isObj(s["parameters"][name]) ? num(s["parameters"][name] as Quantity, unit) : undefined);
  const process: Obj = {};
  const boilDuration = stage("boil") && isObj(stage("boil")!["parameters"]) ? (stage("boil")!["parameters"] as Obj)["duration"] : undefined;
  if (isObj(boilDuration)) process["boil_time_min"] = num(boilDuration as Quantity, "min");
  const mash = steps("mash").map((s) => ({ ...(s["name"] !== undefined ? { name: s["name"] } : {}), step_temp_f: param(s, "temperature", "F"), step_time_min: param(s, "duration", "min") }));
  if (mash.length) process["mash_temp_f"] = mash[0]!.step_temp_f;
  if (targets["boil_volume"]) process["boil_size_gal"] = num(targets["boil_volume"] as Quantity, "US gal");
  const quantities: Obj = {};
  if (batch) quantities["batch_size"] = quantityTo(batch);
  if (targets["boil_volume"]) quantities["boil_size"] = quantityTo(targets["boil_volume"] as Quantity);
  if (isObj(boilDuration)) quantities["boil_time"] = quantityTo(boilDuration as Quantity);
  process["quantities"] = quantities;
  if (mash.length) {
    process["mash_steps"] = mash;
    process["mash_time_min"] = mash[0]!.step_time_min;
  }
  const ferm = steps("fermentation").map((s) => ({ stage: s["name"], temp_f: param(s, "temperature", "F"), days: param(s, "duration", "day"), notes: "" }));
  if (ferm.length) {
    process["fermentation_temp_f"] = ferm[0]!.temp_f;
    process["fermentation_steps"] = ferm;
  }
  out["process"] = process;

  // Statistics, including the volumes Lumina also states there.
  const stats: Obj = {};
  for (const [name, entry] of Object.entries(isObj(c["statistics"]) ? c["statistics"] : {})) {
    if (!isObj(entry)) continue;
    const e: Obj = {};
    for (const layer of ["declared", "imported_estimate", "measured"]) {
      const v = entry[layer] as Quantity | undefined;
      if (!v) continue;
      const src = isObj(v.provenance) && isObj(v.provenance["source"]) ? v.provenance["source"]["format"] : undefined;
      e[layer] = { value: num(v), unit: STATISTIC_UNITS[name] === v.unit ? null : v.unit, source: src ?? null };
    }
    stats[name] = e;
  }
  for (const [name, key] of [["batch_volume", "batch_volume"], ["boil_volume", "boil_volume"]] as const) {
    const t = targets[key] as Quantity | undefined;
    if (t) stats[name] = { declared: { value: num(t, "US gal"), unit: "gal", source: (isObj(t.provenance) && isObj(t.provenance["source"]) ? t.provenance["source"]["format"] : null) ?? null } };
  }
  out["statistics"] = stats;
  out["notes"] = arr(c["notes"]).map((n) => n["text"]);
  out["beverage_type"] = bev["type"] === "beer" ? `${method}_beer` : bev["type"];
  return out;
}

/** A Carboy quantity as a Lumina typed quantity (derived members recomputed; file names are never stored). */
function quantityTo(q: Quantity): Obj {
  const dim = unitDefinition(q.unit)?.dimension;
  const base = { mass: "kg", volume: "L", duration: "s" }[dim as string];
  const p = isObj(q.provenance) ? q.provenance : {};
  const src = isObj(p["source"]) ? p["source"] : {};
  return {
    value: q.value,
    unit: q.unit,
    dimension: dim ?? null,
    normalized_value: base ? convert(q, base).toString() : null,
    normalized_unit: base === "s" ? "sec" : (base ?? null),
    status: p["confidence"] === "ambiguous" ? "ambiguous" : p["confidence"] === "estimated" ? "inferred" : "explicit",
    source_field: src["field"] ?? null,
    original_display: src["original_display"] ?? null,
    provenance: { origin: p["origin"] ?? "imported", source_filename: null, source_format: src["format"] === "lumina" ? null : (src["format"] ?? null), adapter_profile: null, resolution: null },
  };
}
