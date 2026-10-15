import { isUuid, validateQuantity } from "@carboy/recipe-core";
import { CommandError } from "./diagnostics.js";

export type Obj = { [key: string]: unknown };

export function isObject(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

/** A quantity argument: exactly { value, unit } strings that pass the document rules. No coercion. */
export function quantityArg(v: unknown, arg: string): { value: string; unit: string } {
  if (!isObject(v) || typeof v["value"] !== "string" || typeof v["unit"] !== "string" || Object.keys(v).some((k) => k !== "value" && k !== "unit")) {
    throw new CommandError("invalid-quantity", `${arg} must be { value, unit } with a decimal string value`, undefined, { argument: arg });
  }
  const issues = validateQuantity({ value: v["value"], unit: v["unit"] });
  if (issues.length > 0) throw new CommandError("invalid-quantity", issues.map((i) => i.message).join("; "), undefined, { argument: arg, issues: issues.map((i) => i.code) });
  return { value: v["value"], unit: v["unit"] };
}

export function stringArg(v: unknown, arg: string, opts: { nonEmpty?: boolean } = {}): string {
  if (typeof v !== "string" || (opts.nonEmpty && v.trim() === "")) {
    throw new CommandError("invalid-argument", `${arg} must be a${opts.nonEmpty ? " non-empty" : ""} string`, undefined, { argument: arg });
  }
  return v;
}

export function oneOf<T extends string>(v: unknown, allowed: readonly T[], arg: string): T {
  if (!(allowed as readonly unknown[]).includes(v)) throw new CommandError("invalid-argument", `${arg} must be one of ${allowed.join(", ")}`, undefined, { argument: arg });
  return v as T;
}

/** Name used as an object key (parameters, statistics): lowercase identifier. */
export function nameArg(v: unknown, arg: string): string {
  if (typeof v !== "string" || !/^[a-z][a-z0-9_]*$/.test(v)) throw new CommandError("invalid-argument", `${arg} must be a lowercase identifier`, undefined, { argument: arg });
  return v;
}

export function catalogRefArg(v: unknown, arg: string): { catalog: string; item: string; version: string } {
  if (!isObject(v) || Object.keys(v).some((k) => !["catalog", "item", "version"].includes(k)) || !["catalog", "item", "version"].every((k) => typeof v[k] === "string" && v[k] !== "")) {
    throw new CommandError("invalid-argument", `${arg} is { catalog, item, version } with non-empty strings`, undefined, { argument: arg });
  }
  return { catalog: v["catalog"] as string, item: v["item"] as string, version: v["version"] as string };
}

/** Every entity ID in the content, for duplicate checks. */
export function allIds(c: Obj): Set<string> {
  const ids = new Set<string>();
  const take = (arr: unknown) => Array.isArray(arr) && arr.forEach((e) => isObject(e) && typeof e["id"] === "string" && ids.add(e["id"]));
  take(c["ingredients"]);
  take(c["additions"]);
  take(c["notes"]);
  const p = c["process"];
  if (isObject(p)) {
    take(p["stages"]);
    take(p["flows"]);
    if (Array.isArray(p["stages"])) p["stages"].forEach((s) => isObject(s) && take(s["steps"]));
  }
  return ids;
}

export function newIdArg(c: Obj, v: unknown): string {
  if (!isUuid(v)) throw new CommandError("invalid-argument", "id must be a lowercase RFC 9562 UUID", undefined, { argument: "id" });
  if (allIds(c).has(v as string)) throw new CommandError("duplicate-id", "id is already used in this recipe", undefined, { id: v });
  return v as string;
}

/** Index of the entity with this ID, or unknown-reference. */
export function indexOf(arr: Obj[], id: unknown, what: string, base: string): number {
  const i = arr.findIndex((e) => e["id"] === id);
  if (i < 0) throw new CommandError("unknown-reference", `no ${what} with this id`, base, { id });
  return i;
}

export type Position = "first" | "last" | { readonly before: string } | { readonly after: string };

/**
 * Insert `item` into `arr` at a position relative to the members selected by
 * `inScope` (all members by default). Positions never use numeric indexes.
 */
export function insertAt(arr: Obj[], item: Obj, position: unknown, inScope: (e: Obj) => boolean = () => true): void {
  const scope = arr.map((e, i) => [e, i] as const).filter(([e]) => inScope(e));
  let at: number;
  if (position === undefined || position === "last") at = scope.length ? scope[scope.length - 1]![1] + 1 : arr.length;
  else if (position === "first") at = scope.length ? scope[0]![1] : arr.length;
  else if (isObject(position) && Object.keys(position).length === 1 && (typeof position["before"] === "string" || typeof position["after"] === "string")) {
    const ref = (position["before"] ?? position["after"]) as string;
    const hit = scope.find(([e]) => e["id"] === ref);
    if (!hit) throw new CommandError("invalid-position", "position names no entity in the same list", undefined, { id: ref });
    at = position["before"] !== undefined ? hit[1] : hit[1] + 1;
  } else {
    throw new CommandError("invalid-position", 'position is "first", "last", { before: id }, or { after: id }');
  }
  arr.splice(at, 0, item);
}
