import { Decimal } from "./decimal.js";
import type { Quantity } from "./quantity.js";
import { isObject } from "./provenance.js";
import { factorOf, unitDefinition } from "./units.js";

// Scaling policy v1 (EDITOR_COMMANDS §5.8 `scale_recipe`), ported from
// Lumina (`brains/recipes/state.py` `_scale_batch`): weighed fermentables,
// fruit, honey, sugar sources, hops, and botanicals (here: adjuncts) are
// multiplied by new/old batch volume; yeast is not scaled ("review pitch
// rate"). Carboy adds what Lumina left implicit: counted amounts, dosed
// agents (water agents, nutrients, acids, finings, other), and equipment
// volumes are listed for review instead of scaled, and hop scaling notes
// that utilization changes are not modelled.
//
// The result is the macro's expansion into primitive commands; it never
// edits content. Each new amount is amount × (new × f_new × f_old_den) ÷
// (old × f_old × f_new_den): exact rationals and one division, rounded
// half-even to 34 significant digits (RECIPE_CORE §2).

/** Kinds scaled linearly (Lumina `_scale_batch`). */
const LINEAR_KINDS = ["fermentable", "sugar", "honey", "fruit", "hop", "adjunct"];

export type ScaleCommand =
  | { readonly op: "set_target"; readonly name: "batch_volume"; readonly quantity: Quantity }
  | { readonly op: "set_addition_amount"; readonly addition: string; readonly amount: Quantity };

export interface NotScaled {
  readonly path: string;
  /** culture: pitch rate is the brewer's call; count: whole units; review-dose: dose may follow another volume; equipment-volume: boil-off and losses are not linear. */
  readonly reason: "culture" | "count" | "review-dose" | "equipment-volume";
}

export type ScaleResult =
  | {
      readonly status: "scaled";
      /** new ÷ old batch volume (rounded to 34 significant digits for display; amounts use the exact fraction). */
      readonly ratio: Decimal;
      readonly commands: readonly ScaleCommand[];
      readonly notScaled: readonly NotScaled[];
      readonly notes: readonly { readonly path: string; readonly code: "hop-utilization-not-modelled" }[];
    }
  | { readonly status: "unavailable"; readonly reason: "missing-batch-volume" | "invalid-batch-volume"; readonly message: string };

export function scaleRecipe(content: unknown, batchVolume: Quantity, base = "/content"): ScaleResult {
  const c = isObject(content) ? content : {};
  const targets = isObject(c["targets"]) ? c["targets"] : {};
  const old = targets["batch_volume"];
  if (!isObject(old)) return { status: "unavailable", reason: "missing-batch-volume", message: "the recipe has no batch volume to scale from" };
  const from = volume(old);
  const to = volume(batchVolume);
  if (!from || !to) return { status: "unavailable", reason: "invalid-batch-volume", message: "both batch volumes must be volumes greater than zero" };

  // ratio = num / den, exactly.
  const num = to.value.mul(to.factor.num).mul(from.factor.den);
  const den = from.value.mul(from.factor.num).mul(to.factor.den);
  const unchanged = num.equals(den);

  const commands: ScaleCommand[] = [{ op: "set_target", name: "batch_volume", quantity: { value: batchVolume.value, unit: batchVolume.unit } }];
  const notScaled: NotScaled[] = [];
  const notes: { path: string; code: "hop-utilization-not-modelled" }[] = [];
  const kinds = new Map<string, string>();
  for (const ing of Array.isArray(c["ingredients"]) ? c["ingredients"] : []) {
    if (isObject(ing) && typeof ing["id"] === "string") kinds.set(ing["id"], String(ing["kind"]));
  }

  (Array.isArray(c["additions"]) ? c["additions"] : []).forEach((ad, i) => {
    if (!isObject(ad) || !isObject(ad["amount"])) return;
    const path = `${base}/additions/${i}/amount`;
    const kind = kinds.get(ad["ingredient"] as string) ?? "";
    const amount = ad["amount"] as { value: string; unit: string };
    const dim = unitDefinition(amount.unit)?.dimension;
    if (kind === "culture") return void notScaled.push({ path, reason: "culture" });
    if (dim === "count") return void notScaled.push({ path, reason: "count" });
    if (!LINEAR_KINDS.includes(kind) || (dim !== "mass" && dim !== "volume")) return void notScaled.push({ path, reason: "review-dose" });
    if (kind === "hop") notes.push({ path, code: "hop-utilization-not-modelled" });
    if (unchanged) return;
    const value = Decimal.parse(amount.value).mul(num).div(den);
    commands.push({ op: "set_addition_amount", addition: ad["id"] as string, amount: { value: value.toString(), unit: amount.unit } });
  });

  for (const [name, t] of Object.entries(targets)) {
    if (name !== "batch_volume" && isObject(t) && unitDefinition(String(t["unit"]))?.dimension === "volume") {
      notScaled.push({ path: `${base}/targets/${name}`, reason: "equipment-volume" });
    }
  }
  return { status: "scaled", ratio: num.div(den), commands, notScaled, notes };
}

function volume(q: unknown): { value: Decimal; factor: { num: Decimal; den: Decimal } } | undefined {
  if (!isObject(q) || typeof q["value"] !== "string" || typeof q["unit"] !== "string") return undefined;
  const u = unitDefinition(q["unit"]);
  const factor = u && u.dimension === "volume" ? factorOf(u) : undefined;
  let value: Decimal;
  try {
    value = Decimal.parse(q["value"]);
  } catch {
    return undefined;
  }
  return factor && value.sign() > 0 ? { value, factor } : undefined;
}
