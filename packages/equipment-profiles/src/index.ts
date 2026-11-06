import { EQUIPMENT_FIELDS, canonicalize, isUuid, isVersionNumber, validateEquipmentFields, type Json } from "@carboy/recipe-core";

// Equipment Profiles (OVERVIEW §2). A profile is the brewer's description of
// their system; each revision is a new immutable version, so the versions are
// its calibration history. A recipe never refers to a profile: it holds a
// snapshot copied from one, so changing equipment can't change saved recipes.
// No storage here; the Recipe Library keeps the versions.
//
// Nothing is assumed: a value nobody stated is absent, and there are no
// default values for anything. No hardware is involved.

export const PROFILE_FORMAT = "equipment-profile";
export const PROFILE_SCHEMA_VERSION = "0.1";

export interface EquipmentValue {
  readonly value: string;
  readonly unit: string;
  readonly provenance: { readonly origin: string; readonly confidence?: string; readonly note?: string };
  readonly measured_on?: string;
}
export type EquipmentValues = { readonly [field: string]: EquipmentValue };

export interface EquipmentProfile {
  readonly format: typeof PROFILE_FORMAT;
  readonly schema_version: typeof PROFILE_SCHEMA_VERSION;
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly fields: EquipmentValues;
  readonly notes?: string;
  readonly created_at: string;
}

export interface EquipmentSnapshot {
  readonly based_on: { readonly profile: string; readonly version: string; readonly name: string };
  readonly fields: EquipmentValues;
  readonly notes?: string;
}

export interface ProfileIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export class ProfileError extends Error {
  constructor(readonly issues: readonly ProfileIssue[]) {
    super(issues.map((i) => `${i.code} ${i.path}`).join("; "));
    this.name = "ProfileError";
  }
}

const MEMBERS = new Set(["format", "schema_version", "id", "version", "name", "fields", "notes", "created_at"]);
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function validateProfile(profile: unknown): ProfileIssue[] {
  if (typeof profile !== "object" || profile === null || Array.isArray(profile)) return [{ code: "invalid-profile", path: "", message: "a profile is an object" }];
  const p = profile as { [key: string]: unknown };
  const out: ProfileIssue[] = [];
  const add = (code: string, path: string, message: string) => out.push({ code, path, message });
  for (const k of Object.keys(p)) if (!MEMBERS.has(k)) add("unknown-member", `/${k}`, `${k} is not a member here`);
  if (p["format"] !== PROFILE_FORMAT) add("invalid-profile", "/format", `format must be "${PROFILE_FORMAT}"`);
  if (p["schema_version"] !== PROFILE_SCHEMA_VERSION) add("unsupported-profile-schema", "/schema_version", `this build reads profile schema ${PROFILE_SCHEMA_VERSION}`);
  if (!isUuid(p["id"])) add("invalid-id", "/id", "id must be a lowercase RFC 9562 UUID");
  if (!isVersionNumber(p["version"])) add("invalid-profile", "/version", "version must be a positive integer string");
  if (typeof p["name"] !== "string" || p["name"].trim() === "") add("invalid-profile", "/name", "name must be a non-empty string");
  if (p["notes"] !== undefined && typeof p["notes"] !== "string") add("invalid-profile", "/notes", "notes must be a string");
  if (typeof p["created_at"] !== "string" || !TIMESTAMP.test(p["created_at"])) add("invalid-profile", "/created_at", "created_at is a UTC timestamp with milliseconds and a Z suffix");
  out.push(...validateEquipmentFields(p["fields"], "/fields"));
  return out;
}

function checked(profile: EquipmentProfile): EquipmentProfile {
  const issues = validateProfile(profile);
  if (issues.length > 0) throw new ProfileError(issues);
  return profile;
}

const copy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export function createProfile(input: { readonly id: string; readonly name: string; readonly fields: EquipmentValues; readonly notes?: string; readonly created_at: string }): EquipmentProfile {
  return checked({
    format: PROFILE_FORMAT,
    schema_version: PROFILE_SCHEMA_VERSION,
    id: input.id,
    version: "1",
    name: input.name,
    fields: copy(input.fields),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    created_at: input.created_at,
  });
}

/** A new version from the last one. The previous version is untouched and stays in history. */
export function reviseProfile(
  previous: EquipmentProfile,
  change: { readonly name?: string; readonly set?: EquipmentValues; readonly clear?: readonly string[]; readonly notes?: string; readonly created_at: string },
): EquipmentProfile {
  const fields: { [field: string]: EquipmentValue } = { ...copy(previous.fields), ...copy(change.set ?? {}) };
  for (const name of change.clear ?? []) {
    if (fields[name] === undefined) throw new ProfileError([{ code: "unknown-reference", path: `/fields/${name}`, message: "this profile has no such value" }]);
    delete fields[name];
  }
  const notes = change.notes ?? previous.notes;
  return checked({
    ...previous,
    version: String(BigInt(previous.version) + 1n),
    name: change.name ?? previous.name,
    fields,
    ...(notes !== undefined ? { notes } : {}),
    created_at: change.created_at,
  });
}

/** The data a recipe copies (apply_equipment_snapshot). It names its source but never depends on it. */
export function snapshotProfile(profile: EquipmentProfile): EquipmentSnapshot {
  return {
    based_on: { profile: profile.id, version: profile.version, name: profile.name },
    fields: copy(profile.fields),
    ...(profile.notes !== undefined ? { notes: profile.notes } : {}),
  };
}

export interface FieldChange {
  readonly field: string;
  readonly change: "added" | "removed" | "changed";
  readonly before?: EquipmentValue;
  readonly after?: EquipmentValue;
}

/** What differs between two versions, in field-table order then by name. */
export function changedFields(before: EquipmentProfile, after: EquipmentProfile): FieldChange[] {
  const order = EQUIPMENT_FIELDS.map((f) => f.name).sort();
  const out: FieldChange[] = [];
  for (const field of order) {
    const b = before.fields[field];
    const a = after.fields[field];
    if (!b && !a) continue;
    if (b && a && canonicalize(b as unknown as Json) === canonicalize(a as unknown as Json)) continue;
    out.push({ field, change: !b ? "added" : !a ? "removed" : "changed", ...(b ? { before: b } : {}), ...(a ? { after: a } : {}) });
  }
  return out;
}
