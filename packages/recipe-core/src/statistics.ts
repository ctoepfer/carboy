import { isObject, validateProvenance, type Provenance, type ValueOrigin } from "./provenance.js";
import { validateQuantity, type Quantity } from "./quantity.js";
import type { FormulaDefinition, FormulaResult } from "./formulas/registry.js";

// Statistics layers (RECIPE_SCHEMA §8–§9).
//
// content.statistics holds only stated values: declared, imported_estimate,
// measured. Recipe Core's results are the `calculated` layer and live in
// `derived`, never in content. Layers are never merged: a measured value
// does not overwrite an estimate, and an estimate is never shown as measured.

export const STORED_LAYERS = ["declared", "imported_estimate", "measured"] as const;
export type StoredLayer = (typeof STORED_LAYERS)[number];
export type Layer = StoredLayer | "calculated";

/** Origins each stored layer may hold. `calculated` belongs to no stored layer. */
const LAYER_ORIGINS: Record<StoredLayer, readonly ValueOrigin[]> = {
  declared: ["declared", "manually_entered", "inferred", "ai_proposed", "imported"],
  imported_estimate: ["imported"],
  measured: ["measured"],
};

export interface StatisticValue extends Quantity {
  readonly provenance?: Provenance;
}

export interface StatisticEntry {
  readonly declared?: StatisticValue;
  readonly imported_estimate?: StatisticValue;
  readonly measured?: StatisticValue;
  readonly display?: Layer;
}

export interface StatisticIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export function validateStatistics(stats: unknown, path: string): StatisticIssue[] {
  if (stats === undefined) return [];
  if (!isObject(stats)) return [{ code: "invalid-statistics", path, message: "statistics must be an object" }];
  const out: StatisticIssue[] = [];
  for (const [name, entry] of Object.entries(stats)) {
    const p = `${path}/${name}`;
    if (!isObject(entry)) {
      out.push({ code: "invalid-statistics", path: p, message: "a statistic must be an object of layers" });
      continue;
    }
    for (const key of Object.keys(entry)) {
      if (key === "calculated") {
        out.push({ code: "calculated-in-content", path: `${p}/calculated`, message: "calculated values live in derived, never in content (§8)" });
      } else if (key !== "display" && !(STORED_LAYERS as readonly string[]).includes(key)) {
        out.push({ code: "unknown-layer", path: `${p}/${key}`, message: `layers are ${STORED_LAYERS.join(", ")} (and display)` });
      }
    }
    for (const layer of STORED_LAYERS) {
      const v = entry[layer];
      if (v === undefined) continue;
      const lp = `${p}/${layer}`;
      if (!isObject(v) || typeof v["value"] !== "string" || typeof v["unit"] !== "string") {
        out.push({ code: "invalid-statistics", path: lp, message: "a layer value is a quantity { value, unit, provenance? }" });
        continue;
      }
      for (const q of validateQuantity({ value: v["value"], unit: v["unit"] })) out.push({ code: q.code, path: lp, message: q.message });
      const prov = v["provenance"];
      if (prov !== undefined) {
        out.push(...validateProvenance(prov, `${lp}/provenance`));
        const origin = isObject(prov) ? prov["origin"] : undefined;
        if (origin === "calculated") {
          out.push({ code: "calculated-in-content", path: `${lp}/provenance/origin`, message: "calculated values live in derived, never in content (§8)" });
        } else if (typeof origin === "string" && !LAYER_ORIGINS[layer].includes(origin as ValueOrigin)) {
          out.push({ code: "origin-layer-mismatch", path: `${lp}/provenance/origin`, message: `the ${layer} layer can't hold a value with origin "${origin}"` });
        }
      }
    }
    const display = entry["display"];
    if (display !== undefined) {
      if (display !== "calculated" && !(STORED_LAYERS as readonly unknown[]).includes(display)) {
        out.push({ code: "unknown-layer", path: `${p}/display`, message: "display names a layer" });
      } else if (display !== "calculated" && entry[display as StoredLayer] === undefined) {
        out.push({ code: "display-layer-missing", path: `${p}/display`, message: `display is "${String(display)}" but that layer is empty` });
      }
    }
  }
  return out;
}

/** A calculated-layer entry for `derived.statistics`. */
export type CalculatedStatistic =
  | { readonly value: string; readonly unit: string; readonly provenance: Provenance & { readonly origin: "calculated" } }
  | { readonly unavailable: { readonly reason: string; readonly formula: { readonly id: string; readonly version: string }; readonly details: readonly string[]; readonly message: string } };

/** Turn a formula result into its derived entry. An unavailable result stays unavailable. */
export function toCalculatedStatistic(result: FormulaResult): CalculatedStatistic {
  const formula = { id: result.formula.id, version: String(result.formula.version) };
  if (result.status === "computed") {
    return { value: result.value.toString(), unit: result.unit, provenance: { origin: "calculated", formula } };
  }
  return { unavailable: { reason: result.reason, formula, details: result.details, message: result.message } };
}

/**
 * Is a cached calculated value from the running formula version? A stale
 * value is recalculated and the change shown (§8); it is never kept
 * silently.
 */
export function isCalculatedCurrent(cached: CalculatedStatistic, running: FormulaDefinition): boolean {
  const f = "provenance" in cached ? cached.provenance.formula : cached.unavailable.formula;
  return f !== undefined && f.id === running.id && f.version === String(running.version);
}

export type DisplayedStatistic =
  | { readonly status: "shown"; readonly layer: Layer; readonly value: string; readonly unit: string; readonly provenance?: Provenance }
  | { readonly status: "unknown" };

/**
 * Which value the UI shows: the explicit `display` layer if it has a value;
 * otherwise declared, then imported_estimate, then calculated (Lumina's rule,
 * §8). Measured is shown only when chosen explicitly. With nothing to show
 * the result is `unknown`, never zero.
 */
export function displayedStatistic(entry: StatisticEntry | undefined, calculated?: CalculatedStatistic): DisplayedStatistic {
  const layerValue = (layer: Layer): DisplayedStatistic | undefined => {
    if (layer === "calculated") {
      if (!calculated || !("provenance" in calculated)) return undefined;
      return { status: "shown", layer, value: calculated.value, unit: calculated.unit, provenance: calculated.provenance };
    }
    const v = entry?.[layer];
    if (!v) return undefined;
    return { status: "shown", layer, value: v.value, unit: v.unit, ...(v.provenance ? { provenance: v.provenance } : {}) };
  };
  if (entry?.display) {
    const chosen = layerValue(entry.display);
    if (chosen) return chosen;
  }
  return layerValue("declared") ?? layerValue("imported_estimate") ?? layerValue("calculated") ?? { status: "unknown" };
}
