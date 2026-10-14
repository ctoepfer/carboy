import { Decimal } from "./decimal.js";
import { isObject, validateProvenance } from "./provenance.js";
import { isUuid } from "./revision.js";
import { propertyRow } from "./properties.js";
import { validateQuantity } from "./quantity.js";
import { POINT_BASIS, stageKind } from "./stage-kinds.js";
import { validateStatistics } from "./statistics.js";
import { unitDefinition } from "./units.js";

// Content validation, first slice (RECIPE_SCHEMA §7): beverage, identifiers,
// references between ingredients, stages, additions, and flows, timing,
// statistics layers, and provenance wherever it appears. Hashing rules
// (null, numbers, NFC, quantity form) are checked by revision.ts.
//
// Validation reports; it never repairs or fills in values.

export const BEVERAGES = ["beer", "wine", "mead", "cider", "sake"] as const;
export const INGREDIENT_KINDS = ["fermentable", "hop", "culture", "water_agent", "fruit", "honey", "sugar", "adjunct", "nutrient", "acid", "fining", "other"] as const;
export const FLOW_KINDS = ["transfer", "addition", "loss", "dilution", "blend"] as const;
export const TIMING_BASES = ["at_start", "after_start", "before_end", "at_end"] as const;

export interface ContentIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export function validateContent(content: unknown, base = "/content"): ContentIssue[] {
  const out: ContentIssue[] = [];
  const add = (code: string, path: string, message: string) => out.push({ code, path, message });
  if (!isObject(content)) return [{ code: "invalid-content", path: base, message: "content must be an object" }];

  // Beverage
  const bev = content["beverage"];
  if (!isObject(bev) || !(BEVERAGES as readonly unknown[]).includes(bev["type"])) {
    add("unknown-beverage", `${base}/beverage/type`, `beverage.type must be one of ${BEVERAGES.join(", ")}; there is no fallback to beer`);
  }

  // Identifiers: valid UUIDs, unique across the whole document.
  const seen = new Map<string, string>();
  const registerId = (id: unknown, path: string) => {
    if (!isUuid(id)) {
      add("invalid-id", path, "id must be a lowercase RFC 9562 UUID");
      return;
    }
    const prior = seen.get(id as string);
    if (prior) add("duplicate-id", path, `id already used at ${prior}`);
    else seen.set(id as string, path);
  };

  const ingredients = arrayAt(content, "ingredients", base, add);
  const ingredientIds = new Set<string>();
  ingredients.forEach((ing, i) => {
    const p = `${base}/ingredients/${i}`;
    if (!isObject(ing)) return add("invalid-ingredient", p, "ingredient must be an object");
    registerId(ing["id"], `${p}/id`);
    if (typeof ing["id"] === "string") ingredientIds.add(ing["id"]);
    if (!(INGREDIENT_KINDS as readonly unknown[]).includes(ing["kind"])) add("unknown-ingredient-kind", `${p}/kind`, `kind must be one of ${INGREDIENT_KINDS.join(", ")}`);
    validateCatalogRefs(ing, p, add);
    const props = ing["properties"];
    if (props !== undefined && !isObject(props)) add("invalid-ingredient", `${p}/properties`, "properties must be an object");
    if (isObject(props) && (INGREDIENT_KINDS as readonly unknown[]).includes(ing["kind"])) {
      for (const [k, v] of Object.entries(props)) {
        const pp = `${p}/properties/${k}`;
        const row = propertyRow(ing["kind"] as string, k);
        if (!row) {
          add("unknown-property", pp, `${k} is not in the property table for ${String(ing["kind"])}; imported fields belong in unmapped`);
          continue;
        }
        if (checkQuantity(v, pp, add) && !row.units.includes((v as { unit: string }).unit)) add("property-unit-not-allowed", `${pp}/unit`, `${k} takes ${row.units.join(", ")}`);
        if (isObject(v) && v["provenance"] !== undefined) out.push(...validateProvenance(v["provenance"], `${pp}/provenance`));
      }
    }
    if (ing["unmapped"] !== undefined && !isObject(ing["unmapped"])) add("invalid-unmapped", `${p}/unmapped`, "unmapped holds imported fields as an object");
  });

  const process = content["process"];
  const stageKinds = new Map<string, string>();
  if (!isObject(process)) {
    add("invalid-process", `${base}/process`, "process must be an object with stages and flows");
  } else {
    const stages = arrayAt(process, "stages", `${base}/process`, add);
    stages.forEach((st, i) => {
      const p = `${base}/process/stages/${i}`;
      if (!isObject(st)) return add("invalid-stage", p, "stage must be an object");
      registerId(st["id"], `${p}/id`);
      if (typeof st["kind"] !== "string" || !stageKind(st["kind"])) add("unknown-stage-kind", `${p}/kind`, "stage kind is not in the stage-kind table");
      if (typeof st["id"] === "string" && typeof st["kind"] === "string") stageKinds.set(st["id"], st["kind"]);
      checkParameters(st["parameters"], `${p}/parameters`, add);
      const steps = st["steps"];
      if (steps !== undefined && !Array.isArray(steps)) add("invalid-stage", `${p}/steps`, "steps must be an array");
      if (Array.isArray(steps)) {
        steps.forEach((s, j) => {
          const sp = `${p}/steps/${j}`;
          if (!isObject(s)) return add("invalid-stage", sp, "a step must be an object");
          registerId(s["id"], `${sp}/id`);
          if (s["name"] !== undefined && typeof s["name"] !== "string") add("invalid-stage", `${sp}/name`, "name must be a string");
          checkParameters(s["parameters"], `${sp}/parameters`, add);
        });
      }
    });
    const flows = arrayAt(process, "flows", `${base}/process`, add);
    flows.forEach((fl, i) => {
      const p = `${base}/process/flows/${i}`;
      if (!isObject(fl)) return add("invalid-flow", p, "flow must be an object");
      registerId(fl["id"], `${p}/id`);
      if (!(FLOW_KINDS as readonly unknown[]).includes(fl["kind"])) add("unknown-flow-kind", `${p}/kind`, `kind must be one of ${FLOW_KINDS.join(", ")}`);
      for (const end of ["from", "to"] as const) {
        if (!stageKinds.has(fl[end] as string)) add("unknown-reference", `${p}/${end}`, `flow ${end} names no stage`);
      }
    });
    // Topology: branches and merges are valid (calculations may call them
    // unsupported); a flow that leads back to where it came from is not.
    const next = new Map<string, string[]>();
    const reaches = (from: string, to: string, seen = new Set<string>()): boolean =>
      from === to || (!seen.has(from) && (seen.add(from), (next.get(from) ?? []).some((n) => reaches(n, to, seen))));
    flows.forEach((fl, i) => {
      if (!isObject(fl) || !stageKinds.has(fl["from"] as string) || !stageKinds.has(fl["to"] as string)) return;
      const [a, b] = [fl["from"] as string, fl["to"] as string];
      if (reaches(b, a)) return add("process-cycle", `${base}/process/flows/${i}`, "this flow leads back to a stage it comes from");
      next.set(a, [...(next.get(a) ?? []), b]);
    });
  }

  const additions = arrayAt(content, "additions", base, add);
  additions.forEach((ad, i) => {
    const p = `${base}/additions/${i}`;
    if (!isObject(ad)) return add("invalid-addition", p, "addition must be an object");
    registerId(ad["id"], `${p}/id`);
    if (!ingredientIds.has(ad["ingredient"] as string)) add("unknown-reference", `${p}/ingredient`, "addition names no ingredient");
    const kind = stageKinds.get(ad["stage"] as string);
    if (kind === undefined) add("unknown-reference", `${p}/stage`, "addition names no stage");
    if (!isObject(ad["amount"])) add("missing-amount", `${p}/amount`, "an addition needs an amount");
    else checkQuantity(ad["amount"], `${p}/amount`, add);
    const t = ad["timing"];
    if (t !== undefined) {
      if (!isObject(t) || !(TIMING_BASES as readonly unknown[]).includes(t["basis"])) {
        add("invalid-timing", `${p}/timing/basis`, `basis must be one of ${TIMING_BASES.join(", ")}`);
      } else {
        const needsOffset = t["basis"] === "after_start" || t["basis"] === "before_end";
        const off = t["offset"];
        if (needsOffset && !isDuration(off)) add("invalid-timing", `${p}/timing/offset`, `${String(t["basis"])} needs a duration offset`);
        if (!needsOffset && off !== undefined) add("invalid-timing", `${p}/timing/offset`, `${String(t["basis"])} takes no offset`);
        if (t["contact"] !== undefined && !isDuration(t["contact"])) add("invalid-timing", `${p}/timing/contact`, "contact must be a duration");
        const point = t["point"];
        if (point !== undefined) {
          const allowed = kind !== undefined ? (stageKind(kind)?.points ?? []) : [];
          if (typeof point !== "string" || !allowed.includes(point)) {
            add("timing-point-not-allowed", `${p}/timing/point`, kind ? `a ${kind} stage allows points: ${allowed.join(", ") || "none"}` : "unknown stage");
          } else if (!(POINT_BASIS[point] ?? []).includes(t["basis"] as string)) {
            add("invalid-timing", `${p}/timing/basis`, `${point} uses basis ${(POINT_BASIS[point] ?? []).join(" or ")}`);
          }
        }
      }
    }
    const amount = ad["amount"];
    if (isObject(amount) && amount["provenance"] !== undefined) out.push(...validateProvenance(amount["provenance"], `${p}/amount/provenance`));
  });

  const notes = arrayAt(content, "notes", base, add);
  notes.forEach((n, i) => isObject(n) && registerId(n["id"], `${base}/notes/${i}/id`));

  const targets = content["targets"];
  if (targets !== undefined && !isObject(targets)) add("invalid-content", `${base}/targets`, "targets must be an object");
  if (isObject(targets)) {
    for (const [k, v] of Object.entries(targets)) {
      const tp = `${base}/targets/${k}`;
      if (!checkQuantity(v, tp, add)) continue;
      const rule = TARGET_RULES[k];
      if (rule && !rule.check(v as { value: string; unit: string })) add("invalid-target", tp, rule.message);
    }
  }

  out.push(...validateStatistics(content["statistics"], `${base}/statistics`));
  return out;
}

/** Origins an approved alternative may have: the brewer's own, or an accepted AI suggestion (INGREDIENT_CATALOG §3). */
const ALTERNATIVE_ORIGINS = ["manually_entered", "ai_proposed"];
const ALTERNATIVE_MEMBERS = new Set(["catalog_ref", "note", "provenance"]);

// catalog_ref = preferred product, group_ref = requirement, alternatives[] =
// approved stand-ins (schema 0.2). References only: none of them changes a
// calculation, which reads the snapshot's properties.
function validateCatalogRefs(ing: { [key: string]: unknown }, p: string, add: (c: string, p: string, m: string) => void): void {
  for (const member of ["catalog_ref", "group_ref"]) if (ing[member] !== undefined) checkRef(ing[member], `${p}/${member}`, add);
  const alts = ing["alternatives"];
  if (alts === undefined) return;
  if (!Array.isArray(alts)) return add("invalid-alternatives", `${p}/alternatives`, "alternatives must be an array");
  const preferred = refKey(ing["catalog_ref"]);
  const seen = new Set<string>();
  alts.forEach((alt, j) => {
    const ap = `${p}/alternatives/${j}`;
    if (!isObject(alt)) return add("invalid-alternatives", ap, "an alternative must be an object");
    for (const k of Object.keys(alt)) if (!ALTERNATIVE_MEMBERS.has(k)) add("unknown-member", `${ap}/${k}`, "alternatives hold catalog_ref, note, and provenance only");
    if (!checkRef(alt["catalog_ref"], `${ap}/catalog_ref`, add)) return;
    const key = refKey(alt["catalog_ref"])!;
    if (key === preferred) add("alternative-is-preferred", `${ap}/catalog_ref`, "the preferred product is not its own alternative");
    else if (seen.has(key)) add("duplicate-alternative", `${ap}/catalog_ref`, "product already listed as an alternative");
    seen.add(key);
    if (alt["note"] !== undefined && typeof alt["note"] !== "string") add("invalid-alternatives", `${ap}/note`, "note must be a string");
    const prov = alt["provenance"];
    if (prov !== undefined) {
      if (isObject(prov) && !ALTERNATIVE_ORIGINS.includes(prov["origin"] as string)) {
        add("alternative-origin-not-allowed", `${ap}/provenance/origin`, `an alternative is approved by the brewer: origin ${ALTERNATIVE_ORIGINS.join(" or ")}`);
      } else {
        for (const issue of validateProvenance(prov, `${ap}/provenance`)) add(issue.code, issue.path, issue.message);
      }
    }
  });
}

/** A catalog reference: non-empty `catalog`, `item`, and `version` strings. */
function checkRef(ref: unknown, path: string, add: (c: string, p: string, m: string) => void): boolean {
  if (!isObject(ref)) {
    add("invalid-catalog-ref", path, "a catalog reference is an object { catalog, item, version }");
    return false;
  }
  let ok = true;
  for (const k of ["catalog", "item", "version"]) {
    if (typeof ref[k] !== "string" || ref[k] === "") {
      add("invalid-catalog-ref", `${path}/${k}`, `${k} must be a non-empty string`);
      ok = false;
    }
  }
  return ok;
}

/** Product identity for comparing references: catalog and item, not version. */
function refKey(ref: unknown): string | undefined {
  return isObject(ref) && typeof ref["catalog"] === "string" && typeof ref["item"] === "string" ? JSON.stringify([ref["catalog"], ref["item"]]) : undefined;
}

/** Targets the calculator reads. The full target list is fixed with the formula coverage table (D-006). */
const TARGET_RULES: Readonly<Record<string, { check: (q: { value: string; unit: string }) => boolean; message: string }>> = {
  batch_volume: { check: (q) => unitDefinition(q.unit)?.dimension === "volume" && Decimal.parse(q.value).sign() > 0, message: "batch volume is a volume greater than zero" },
  efficiency: { check: (q) => unitDefinition(q.unit)?.dimension === "fraction", message: "efficiency is a fraction (fraction or %)" },
};

/** A quantity as stored: { value, unit } strings that pass validateQuantity. Reports and returns false otherwise. */
function checkQuantity(v: unknown, path: string, add: (c: string, p: string, m: string) => void): boolean {
  if (!isObject(v) || typeof v["value"] !== "string" || typeof v["unit"] !== "string") {
    add("invalid-quantity", path, "a quantity is { value, unit } with a decimal string value");
    return false;
  }
  const issues = validateQuantity({ value: v["value"], unit: v["unit"] });
  for (const i of issues) add(i.code, `${path}/${i.code === "unknown-unit" ? "unit" : "value"}`, i.message);
  return issues.length === 0;
}

/** Stage and step parameters: an object of quantities (names are not tabled yet; rows come with the formulas that read them). */
function checkParameters(params: unknown, path: string, add: (c: string, p: string, m: string) => void): void {
  if (params === undefined) return;
  if (!isObject(params)) return add("invalid-stage", path, "parameters must be an object of quantities");
  for (const [k, v] of Object.entries(params)) {
    checkQuantity(v, `${path}/${k}`, add);
    if (isObject(v) && v["provenance"] !== undefined) for (const i of validateProvenance(v["provenance"], `${path}/${k}/provenance`)) add(i.code, i.path, i.message);
  }
}

function arrayAt(obj: { [key: string]: unknown }, key: string, base: string, add: (c: string, p: string, m: string) => void): unknown[] {
  const v = obj[key];
  if (v === undefined) return [];
  if (!Array.isArray(v)) {
    add("invalid-content", `${base}/${key}`, `${key} must be an array`);
    return [];
  }
  return v;
}

function isDuration(v: unknown): boolean {
  return isObject(v) && typeof v["unit"] === "string" && unitDefinition(v["unit"])?.dimension === "duration";
}
