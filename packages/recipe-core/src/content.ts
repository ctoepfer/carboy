import { isObject, validateProvenance } from "./provenance.js";
import { isUuid } from "./revision.js";
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
    const props = ing["properties"];
    if (props !== undefined && isObject(props)) {
      for (const [k, v] of Object.entries(props)) {
        if (isObject(v) && v["provenance"] !== undefined) out.push(...validateProvenance(v["provenance"], `${p}/properties/${k}/provenance`));
      }
    }
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
      const steps = st["steps"];
      if (Array.isArray(steps)) steps.forEach((s, j) => isObject(s) && registerId(s["id"], `${p}/steps/${j}/id`));
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

  out.push(...validateStatistics(content["statistics"], `${base}/statistics`));
  return out;
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
