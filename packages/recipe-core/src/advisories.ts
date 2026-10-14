import { isObject } from "./provenance.js";

// Beverage advisories: completeness hints for a recipe in progress, ported
// from Lumina (`brains/recipes/validation.py`, `validate_recipe` and
// `_validate_type_specific_sources`). They never make content invalid: an
// unfinished recipe stays editable. Sake has no rule (none in the source).

export interface Advisory {
  readonly code: "beer-without-fermentable" | "beer-without-hops" | "mead-without-honey" | "cider-without-fruit" | "wine-without-fruit-or-sugar" | "no-culture";
  readonly path: string;
  readonly message: string;
}

/** Lumina requires a culture for these (`_requires_yeast`). */
const NEEDS_CULTURE = ["beer", "wine", "mead", "cider"];

export function beverageAdvisories(content: unknown, base = "/content"): Advisory[] {
  if (!isObject(content) || !isObject(content["beverage"])) return [];
  const type = content["beverage"]["type"];
  const ings = Array.isArray(content["ingredients"]) ? content["ingredients"] : [];
  const has = (...kinds: string[]) => ings.some((i) => isObject(i) && kinds.includes(i["kind"] as string));
  const path = `${base}/ingredients`;
  const out: Advisory[] = [];
  const add = (code: Advisory["code"], message: string) => out.push({ code, path, message });

  if (type === "beer") {
    if (!has("fermentable")) add("beer-without-fermentable", "a beer recipe usually includes at least one fermentable");
    if (!has("hop")) add("beer-without-hops", "a beer recipe usually includes at least one hop");
  }
  if (type === "mead" && !has("honey")) add("mead-without-honey", "a mead recipe includes honey");
  if (type === "cider" && !has("fruit")) add("cider-without-fruit", "a cider recipe includes apple or other fruit juice");
  if (type === "wine" && !has("fruit", "sugar")) add("wine-without-fruit-or-sugar", "a wine recipe includes fruit, juice, or another sugar source");
  if (NEEDS_CULTURE.includes(type as string) && !has("culture")) add("no-culture", "no yeast or other culture");
  return out;
}
