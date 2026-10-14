import type { Json } from "./canonical.js";

// Value provenance (RECIPE_SCHEMA §6; invariant 7). Every value says where
// it came from; origins are never merged or upgraded silently.

export const VALUE_ORIGINS = ["declared", "imported", "inferred", "calculated", "measured", "manually_entered", "ai_proposed"] as const;
export type ValueOrigin = (typeof VALUE_ORIGINS)[number];

export const CONFIDENCES = ["confirmed", "estimated", "ambiguous"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

export const RESOLUTIONS = ["preserve", "manual", "reinterpret", "retain_both"] as const;

/** Allowed `source` members. Anything else (file names, paths) is refused. */
export const SOURCE_MEMBERS = ["format", "field", "original_display"] as const;

export interface Provenance {
  readonly origin: ValueOrigin;
  readonly confidence?: Confidence;
  readonly source?: { readonly format?: string; readonly field?: string; readonly original_display?: string };
  readonly formula?: { readonly id: string; readonly version: string };
  readonly assumptions?: readonly { readonly id: string; readonly value: Json }[];
  readonly resolution?: (typeof RESOLUTIONS)[number];
  readonly note?: string;
}

export interface ProvenanceIssue {
  readonly code:
    | "invalid-provenance"
    | "unknown-origin"
    | "unknown-confidence"
    | "calculated-without-formula"
    | "source-member-not-allowed";
  readonly path: string;
  readonly message: string;
}

const MEMBERS = new Set(["origin", "confidence", "source", "formula", "assumptions", "resolution", "note"]);

export function validateProvenance(p: unknown, path: string): ProvenanceIssue[] {
  const out: ProvenanceIssue[] = [];
  const add = (code: ProvenanceIssue["code"], at: string, message: string) => out.push({ code, path: at, message });
  if (!isObject(p)) return [{ code: "invalid-provenance", path, message: "provenance must be an object" }];
  for (const k of Object.keys(p)) if (!MEMBERS.has(k)) add("invalid-provenance", `${path}/${k}`, `unknown provenance member "${k}"`);
  if (!(VALUE_ORIGINS as readonly unknown[]).includes(p["origin"])) add("unknown-origin", `${path}/origin`, `origin must be one of ${VALUE_ORIGINS.join(", ")}`);
  if (p["confidence"] !== undefined && !(CONFIDENCES as readonly unknown[]).includes(p["confidence"])) {
    add("unknown-confidence", `${path}/confidence`, `confidence must be one of ${CONFIDENCES.join(", ")}`);
  }
  if (p["origin"] === "calculated") {
    const f = p["formula"];
    if (!isObject(f) || typeof f["id"] !== "string" || typeof f["version"] !== "string") {
      add("calculated-without-formula", `${path}/formula`, 'a calculated value needs formula { "id", "version" }');
    }
  }
  const src = p["source"];
  if (src !== undefined) {
    if (!isObject(src)) add("invalid-provenance", `${path}/source`, "source must be an object");
    else
      for (const k of Object.keys(src)) {
        if (!(SOURCE_MEMBERS as readonly string[]).includes(k)) {
          add("source-member-not-allowed", `${path}/source/${k}`, `source may hold only ${SOURCE_MEMBERS.join(", ")} (no file names or paths)`);
        }
      }
  }
  if (p["resolution"] !== undefined && !(RESOLUTIONS as readonly unknown[]).includes(p["resolution"])) {
    add("invalid-provenance", `${path}/resolution`, `resolution must be one of ${RESOLUTIONS.join(", ")}`);
  }
  return out;
}

export function isObject(v: unknown): v is { [key: string]: unknown } {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
