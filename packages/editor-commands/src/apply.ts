import { SCHEMA_VERSION, beverageAdvisories, calculateStatistics, checkSchemaVersion, scaleRecipe, validateContent, type CalculatedStatistic, type Content } from "@carboy/recipe-core";
import { CommandError, type Diagnostic } from "./diagnostics.js";
import { diffContent, type Diff } from "./diff.js";
import { CHANNEL_ORIGIN, OPS, PRESENTATION_OPS, commandProvenance, type Channel } from "./ops.js";
import { clone, isObject, type Obj } from "./util.js";

// Application semantics (EDITOR_COMMANDS §3): check the version, apply the
// commands in order to a working copy, each checking its preconditions; the
// first failure rejects the whole list (C2). Then validate the result,
// recalculate statistics into `derived`, and return the result and a diff.
// Nothing is stored here.

export interface ApplyOptions {
  readonly channel: Channel;
  /** The content schema version the commands target (§10). Defaults to this build's. */
  readonly schema_version?: string;
}

export type ApplyResult =
  | {
      readonly status: "applied";
      readonly content: Content;
      readonly derived: { readonly statistics: { readonly [name: string]: CalculatedStatistic } };
      readonly diff: Diff;
      /** Present when macros were expanded: the primitive commands actually applied. */
      readonly expanded_commands?: readonly Obj[];
      readonly diagnostics: readonly Diagnostic[];
    }
  | { readonly status: "rejected"; readonly diagnostics: readonly Diagnostic[] };

const reject = (d: Omit<Diagnostic, "severity">): ApplyResult => ({ status: "rejected", diagnostics: [{ ...d, severity: "error" }] });

export function applyCommands(base: Content, commands: readonly unknown[], options: ApplyOptions): ApplyResult {
  const version = options.schema_version ?? `${SCHEMA_VERSION.major}.${SCHEMA_VERSION.minor}`;
  if (checkSchemaVersion({}, version).length > 0) return reject({ code: "unsupported-version", message: `this applier supports schema ${SCHEMA_VERSION.major}.1 to ${SCHEMA_VERSION.major}.${SCHEMA_VERSION.minor}`, details: { schema_version: version } });
  const minor = Number(version.split(".")[1]);

  const work = clone(base) as Obj;
  const expanded: Obj[] = [];
  const notes: Diagnostic[] = [];
  let macros = false;

  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i];
    try {
      if (!isObject(cmd) || typeof cmd["op"] !== "string") throw new CommandError("invalid-argument", "a command is an object with an op");
      const op = cmd["op"];
      if (op === "scale_recipe" || op === "replace_ingredient") {
        macros = true;
        const steps = op === "scale_recipe" ? expandScale(work, cmd, i, notes) : expandReplace(work, cmd);
        for (const step of steps) {
          applyOne(work, step, options.channel, minor);
          expanded.push(step);
        }
        continue;
      }
      applyOne(work, cmd, options.channel, minor);
      expanded.push(cmd);
    } catch (e) {
      if (!(e instanceof CommandError)) throw e;
      return reject({ code: e.code, command_index: i, ...(e.path !== undefined ? { path: e.path } : {}), message: e.message, ...(e.details ? { details: e.details } : {}) });
    }
  }

  // Validate the complete result; intermediate states may be invalid.
  const issues = validateContent(work, "");
  if (issues.length > 0) {
    return {
      status: "rejected",
      diagnostics: issues.map((v) => ({ code: "validation-failed", severity: "error" as const, path: v.path, message: v.message, details: { issue: v.code } })),
    };
  }

  const before = calculateStatistics(base);
  const after = calculateStatistics(work);
  const diagnostics: Diagnostic[] = [...notes];
  for (const [name, s] of Object.entries(after.statistics)) {
    if ("unavailable" in s) {
      const code = s.unavailable.reason === "missing-input" ? "missing-input" : "unsupported-calculation";
      diagnostics.push({ code, severity: "warning", path: `/statistics/${name}`, message: s.unavailable.message, details: { statistic: name, reason: s.unavailable.reason, inputs: s.unavailable.details } });
    }
  }
  for (const a of beverageAdvisories(work, "")) diagnostics.push({ code: a.code, severity: "info", path: a.path, message: a.message });

  return {
    status: "applied",
    content: work as Content,
    derived: { statistics: after.statistics },
    diff: diffContent(base, work as Content, before.statistics, after.statistics),
    ...(macros ? { expanded_commands: expanded } : {}),
    diagnostics,
  };
}

function applyOne(work: Obj, cmd: Obj, channel: Channel, minor: number): void {
  const op = cmd["op"] as string;
  const spec = OPS[op];
  if (!spec) throw new CommandError("unknown-op", "no such op", undefined, { op });
  if (channel !== "editor" && PRESENTATION_OPS.has(op)) throw new CommandError("op-not-permitted", "AI channels may not submit presentation commands", undefined, { op });
  if (spec.unsupported) return spec.run({ c: work, channel, provenance: {} }, cmd);
  if ((spec.minor ?? 1) > minor) throw new CommandError("unsupported-version", `${op} needs schema ${SCHEMA_VERSION.major}.${spec.minor} or later`, undefined, { op });
  const allowed = new Set(["op", "provenance", ...spec.required, ...(spec.optional ?? [])]);
  for (const k of Object.keys(cmd)) if (!allowed.has(k)) throw new CommandError("unknown-member", `${op} has no argument ${k}`, undefined, { member: k });
  for (const k of spec.required) if (cmd[k] === undefined) throw new CommandError("invalid-argument", `${op} needs ${k}`, undefined, { argument: k });
  spec.run({ c: work, channel, provenance: { origin: CHANNEL_ORIGIN[channel], ...commandProvenance(cmd["provenance"]) } }, cmd);
}

// --- macros (§5.8): expanded against the working copy at their place in the list.

function expandScale(work: Obj, cmd: Obj, index: number, notes: Diagnostic[]): Obj[] {
  for (const k of Object.keys(cmd)) if (!["op", "batch_volume", "provenance"].includes(k)) throw new CommandError(k === "scope" ? "unsupported-op" : "unknown-member", k === "scope" ? "scale_recipe scope is not defined yet" : `scale_recipe has no argument ${k}`, undefined, { member: k });
  const bv = cmd["batch_volume"];
  if (!isObject(bv) || typeof bv["value"] !== "string" || typeof bv["unit"] !== "string") throw new CommandError("invalid-quantity", "batch_volume must be { value, unit }", undefined, { argument: "batch_volume" });
  const r = scaleRecipe(work, { value: bv["value"], unit: bv["unit"] }, "");
  if (r.status === "unavailable") throw new CommandError("invalid-argument", r.message, undefined, { reason: r.reason });
  for (const n of r.notScaled) notes.push({ code: "not-scaled", severity: "warning", command_index: index, path: n.path, message: "left unchanged by scaling; review it", details: { reason: n.reason } });
  for (const n of r.notes) notes.push({ code: n.code, severity: "info", command_index: index, path: n.path, message: "hop amount scaled linearly; utilization changes are not modelled" });
  const prov = cmd["provenance"] !== undefined ? { provenance: cmd["provenance"] } : {};
  return r.commands.map((c) => ({ ...c, ...prov }) as Obj);
}

function expandReplace(work: Obj, cmd: Obj): Obj[] {
  for (const k of Object.keys(cmd)) if (!["op", "ingredient", "with", "provenance"].includes(k)) throw new CommandError("unknown-member", `replace_ingredient has no argument ${k}`, undefined, { member: k });
  const body = cmd["with"];
  if (!isObject(body)) throw new CommandError("invalid-argument", "with is an add_ingredient body", undefined, { argument: "with" });
  const ingredients = (Array.isArray(work["ingredients"]) ? work["ingredients"] : []) as Obj[];
  if (!ingredients.some((g) => g["id"] === cmd["ingredient"])) throw new CommandError("unknown-reference", "no ingredient with this id", "/ingredients", { id: cmd["ingredient"] });
  const prov = cmd["provenance"] !== undefined ? { provenance: cmd["provenance"] } : {};
  const out: Obj[] = [{ ...body, op: "add_ingredient", ...prov }];
  const additions = (Array.isArray(work["additions"]) ? work["additions"] : []) as Obj[];
  // Re-point each addition, keeping its ID, stage, amount, timing, and place in its stage.
  for (const ad of additions.filter((a) => a["ingredient"] === cmd["ingredient"])) {
    const sameStage = additions.filter((a) => a["stage"] === ad["stage"]);
    const prev = sameStage[sameStage.indexOf(ad) - 1];
    const amount = isObject(ad["amount"]) ? { value: ad["amount"]["value"], unit: ad["amount"]["unit"] } : ad["amount"];
    out.push({ op: "remove_addition", addition: ad["id"] });
    out.push({ op: "add_addition", id: ad["id"], ingredient: body["id"], stage: ad["stage"], amount, timing: ad["timing"], position: prev ? { after: prev["id"] } : "first", ...prov });
  }
  out.push({ op: "remove_ingredient", ingredient: cmd["ingredient"] });
  return out;
}

/**
 * The empty template for new recipes (C6, §8). `calculation_settings` stays
 * empty until the formula registry defines per-beverage defaults (Needs
 * confirmation).
 */
export function emptyTemplate(beverage: string, name: string): Content {
  return {
    name,
    beverage: { type: beverage },
    targets: {},
    ingredients: [],
    process: { stages: [], flows: [] },
    additions: [],
    statistics: {},
    calculation_settings: {},
    notes: [],
  } as unknown as Content;
}
