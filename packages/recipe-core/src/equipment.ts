import { Decimal } from "./decimal.js";
import { isObject, validateProvenance } from "./provenance.js";
import { convert, validateQuantity } from "./quantity.js";
import { isUuid } from "./revision.js";
import { unitDefinition } from "./units.js";

// Equipment snapshot (RECIPE_SCHEMA §7.5; OVERVIEW §5): the equipment
// assumptions a recipe was written for, copied in as data, never a reference.
//
// The field table is closed, like the ingredient property table (Q9). There
// are no defaults: a value that isn't known is absent. No formula reads these
// fields yet, so an equipment snapshot changes no calculated result; the
// efficiency a calculation uses stays `targets.efficiency`.

export interface EquipmentField {
  readonly name: string;
  readonly dimension: "volume" | "fraction" | "mass" | "duration";
  /** A value that can't be zero. Losses, dead space, and top-ups can. */
  readonly positive?: boolean;
  /** Upper bound as a fraction. */
  readonly atMostOne?: boolean;
}

export const EQUIPMENT_FIELDS: readonly EquipmentField[] = [
  // Sizes
  { name: "batch_size", dimension: "volume", positive: true },
  { name: "batch_capacity", dimension: "volume", positive: true },
  { name: "mash_capacity", dimension: "volume", positive: true },
  { name: "boil_capacity", dimension: "volume", positive: true },
  { name: "pre_boil_volume", dimension: "volume", positive: true },
  { name: "boil_time", dimension: "duration", positive: true },
  // Mash tun
  { name: "mash_tun_weight", dimension: "mass", positive: true },
  // Relative to water, so it needs no unit token (0.12 for stainless steel means 0.12 cal/g/°C).
  { name: "mash_tun_specific_heat", dimension: "fraction", positive: true },
  { name: "mash_tun_deadspace", dimension: "volume" },
  // Boil. A rate is a volume or a fraction lost in one hour: there are no per-time unit tokens.
  { name: "boil_off_per_hour", dimension: "volume" },
  { name: "boil_off_fraction_per_hour", dimension: "fraction", atMostOne: true },
  { name: "kettle_top_up", dimension: "volume" },
  // An adjustment, not a share, so it can pass 100 %.
  { name: "hop_utilization_adjustment", dimension: "fraction", positive: true },
  // After the boil
  { name: "trub_chiller_loss", dimension: "volume" },
  { name: "cooling_loss", dimension: "fraction", atMostOne: true },
  { name: "fermenter_top_up", dimension: "volume" },
  // Assumptions
  { name: "brewhouse_efficiency", dimension: "fraction", atMostOne: true },
];

const BY_NAME: ReadonlyMap<string, EquipmentField> = new Map(EQUIPMENT_FIELDS.map((f) => [f.name, f]));

export function equipmentField(name: string): EquipmentField | undefined {
  return BY_NAME.get(name);
}

export interface EquipmentIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

const SNAPSHOT_MEMBERS = new Set(["based_on", "fields", "notes"]);
const BASED_ON_MEMBERS = new Set(["profile", "version", "name"]);
const VALUE_MEMBERS = new Set(["value", "unit", "provenance", "measured_on"]);

/** A version number as stored: a positive integer string (numbers don't appear in hashed documents). */
export function isVersionNumber(v: unknown): v is string {
  return typeof v === "string" && /^[1-9]\d*$/.test(v);
}

/** A calendar date, YYYY-MM-DD, that exists. */
export function isCalendarDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** The named values of a profile or snapshot. Shared, so both follow one rule. */
export function validateEquipmentFields(fields: unknown, path: string): EquipmentIssue[] {
  const out: EquipmentIssue[] = [];
  const add = (code: string, at: string, message: string) => out.push({ code, path: at, message });
  if (!isObject(fields)) return [{ code: "invalid-equipment", path, message: "fields must be an object of named values" }];
  for (const [name, v] of Object.entries(fields)) {
    const p = `${path}/${name}`;
    const row = BY_NAME.get(name);
    if (!row) {
      add("unknown-equipment-field", p, `${name} is not in the equipment field table`);
      continue;
    }
    if (!isObject(v) || typeof v["value"] !== "string" || typeof v["unit"] !== "string") {
      add("invalid-quantity", p, "a value is { value, unit, provenance } with a decimal string value");
      continue;
    }
    for (const k of Object.keys(v)) if (!VALUE_MEMBERS.has(k)) add("unknown-member", `${p}/${k}`, `${k} is not a member here`);
    const prov = v["provenance"];
    if (prov === undefined) add("missing-provenance", `${p}/provenance`, "every equipment value says where it came from");
    else for (const i of validateProvenance(prov, `${p}/provenance`)) add(i.code, i.path, i.message);
    if (v["measured_on"] !== undefined) {
      if (!isObject(prov) || prov["origin"] !== "measured") add("measured-on-not-measured", `${p}/measured_on`, "only a measured value has a measurement date");
      else if (!isCalendarDate(v["measured_on"])) add("invalid-date", `${p}/measured_on`, "measured_on is a calendar date, YYYY-MM-DD");
    }
    const q = { value: v["value"], unit: v["unit"] };
    const issues = validateQuantity(q);
    for (const i of issues) add(i.code, `${p}/${i.code === "unknown-unit" ? "unit" : "value"}`, i.message);
    if (issues.length > 0) continue;
    if (unitDefinition(q.unit)?.dimension !== row.dimension) {
      add("equipment-unit-not-allowed", `${p}/unit`, `${name} is a ${row.dimension}`);
      continue;
    }
    if (row.positive && Decimal.parse(q.value).isZero()) add("equipment-value-out-of-range", `${p}/value`, `${name} is greater than zero`);
    if (row.atMostOne && convert(q, "fraction").compare(Decimal.parse("1")) > 0) add("equipment-value-out-of-range", `${p}/value`, `${name} is at most 100 %`);
  }
  return out;
}

export function validateEquipmentSnapshot(snapshot: unknown, path: string): EquipmentIssue[] {
  if (!isObject(snapshot)) return [{ code: "invalid-content", path, message: "equipment must be an object" }];
  const out: EquipmentIssue[] = [];
  const add = (code: string, at: string, message: string) => out.push({ code, path: at, message });
  for (const k of Object.keys(snapshot)) if (!SNAPSHOT_MEMBERS.has(k)) add("unknown-member", `${path}/${k}`, `${k} is not a member here`);
  if (snapshot["notes"] !== undefined && typeof snapshot["notes"] !== "string") add("invalid-equipment", `${path}/notes`, "notes must be a string");
  const from = snapshot["based_on"];
  if (from !== undefined) {
    const fp = `${path}/based_on`;
    if (!isObject(from)) add("invalid-equipment", fp, "based_on names the profile version this was copied from");
    else {
      for (const k of Object.keys(from)) if (!BASED_ON_MEMBERS.has(k)) add("unknown-member", `${fp}/${k}`, `${k} is not a member here`);
      if (!isUuid(from["profile"])) add("invalid-id", `${fp}/profile`, "profile must be a lowercase RFC 9562 UUID");
      if (!isVersionNumber(from["version"])) add("invalid-equipment", `${fp}/version`, "version must be a positive integer string");
      if (typeof from["name"] !== "string" || from["name"].trim() === "") add("invalid-equipment", `${fp}/name`, "name must be a non-empty string");
    }
  }
  out.push(...validateEquipmentFields(snapshot["fields"], `${path}/fields`));
  return out;
}
