import type { Decimal } from "../decimal.js";

// Formula registry (FORMULA_COVERAGE.md; D-006; owner decisions 2026-10-13).
//
// Every formula states its source, assumptions, inputs, applicability, and
// rounding. Calculations return either a computed value with the formula's
// identity, or `unavailable` with a reason: never a plausible-looking guess.

export type Beverage = "beer" | "wine" | "mead" | "cider" | "sake";

/** D-006 gate: only `enabled` formulas may produce values shown to users. */
export type FormulaStatus =
  | "enabled" // cited source meets FQ1 and fixtures pass
  | "parity-reference" // kept to compare with Lumina/BeerXML; never shown as a result
  | "unavailable"; // registered so callers can say why there is no value

export type SourceStatus = "primary-checked" | "secondary-checked" | "web-only" | "needs-source";

export interface Citation {
  /** Short reference; full entries are in docs/references/BIBLIOGRAPHY.md. */
  readonly work: string;
  readonly locator?: string;
  /** "read" = consulted directly; "via" = cited by a work we read, not yet read. */
  readonly checked: "read" | "via";
}

export interface FormulaInput {
  readonly name: string;
  readonly description: string;
  /** Accepted unit tokens; empty for dimensionless counts. */
  readonly units: readonly string[];
}

export interface FormulaDefinition {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly status: FormulaStatus;
  readonly source: { readonly status: SourceStatus; readonly citations: readonly Citation[] };
  readonly expression: string;
  readonly assumptions: readonly string[];
  readonly inputs: readonly FormulaInput[];
  readonly applicability: { readonly beverages: readonly Beverage[]; readonly notes?: string };
  readonly rounding: string;
  readonly output: { readonly name: string; readonly unit: string };
  /** Why the formula is unavailable or limited, when it is. */
  readonly limitation?: string;
}

export interface FormulaRef {
  readonly id: string;
  readonly version: number;
}

export type UnavailableReason =
  | "formula-unavailable" // registered, but no accepted source / dependency missing
  | "not-enabled" // parity reference called without opting in
  | "unsupported-beverage"
  | "missing-input"
  | "invalid-input"
  | "out-of-range"; // input outside the range the formula's source covers

export type FormulaResult =
  | {
      readonly status: "computed";
      readonly value: Decimal;
      readonly unit: string;
      readonly formula: FormulaRef;
      /** Assumptions that applied to this result, copied from the definition. */
      readonly assumptions: readonly string[];
    }
  | {
      readonly status: "unavailable";
      readonly reason: UnavailableReason;
      readonly formula: FormulaRef;
      /** Input paths or dependency ids, depending on the reason. */
      readonly details: readonly string[];
      readonly message: string;
    };

export function computed(def: FormulaDefinition, value: Decimal, unit: string = def.output.unit): FormulaResult {
  return { status: "computed", value, unit, formula: ref(def), assumptions: def.assumptions };
}

export function unavailable(def: FormulaDefinition, reason: UnavailableReason, details: readonly string[], message: string): FormulaResult {
  return { status: "unavailable", reason, formula: ref(def), details, message };
}

export function ref(def: FormulaDefinition): FormulaRef {
  return { id: def.id, version: def.version };
}

/** Common precondition: the beverage is one the formula applies to. */
export function checkBeverage(def: FormulaDefinition, beverage: Beverage): FormulaResult | undefined {
  return def.applicability.beverages.includes(beverage)
    ? undefined
    : unavailable(def, "unsupported-beverage", [beverage], `${def.title} does not apply to ${beverage}`);
}
