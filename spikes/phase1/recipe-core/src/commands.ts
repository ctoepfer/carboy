import { originalGravity, type GravitySource } from "./gravity.js";
import type { Json } from "./jcs.js";
import type { Quantity } from "./units.js";

// Spike subset of the editor command contract (EDITOR_COMMANDS.md): one
// command, set_addition_amount, with §2 encoding rules, §3 all-or-nothing
// application, §6 diagnostics, and a §7-style semantic diff with
// recalculated OG. Content shape is a spike subset of RECIPE_SCHEMA §7;
// `ppg` and `efficiency` are spike-only properties (the property table is a
// Phase 2 deliverable).

export interface SpikeContent {
  [key: string]: Json;
}

export interface Diagnostic {
  code: string;
  severity: "error" | "warning" | "info";
  command_index?: number;
  path?: string;
  message: string;
  details?: { [key: string]: Json };
}

export type ApplyResult =
  | { status: "applied"; content: SpikeContent; diff: Diff; diagnostics: Diagnostic[] }
  | { status: "rejected"; diagnostics: Diagnostic[] };

export interface Diff {
  entities: { type: string; id: string; change: "changed"; label: { [k: string]: string }; fields: { path: string; before: Json; after: Json }[] }[];
  statistics: { statistic: string; before: string | null; after: string | null; formula: { id: string; version: string } }[];
}

const DECIMAL = /^-?(0|[1-9]\d*)(\.\d*[1-9])?$/;
const MASS_UNITS = new Set(["kg", "g", "lb", "oz"]);

interface Ingredient { id: string; name: string; properties?: { ppg?: string; efficiency?: string } }
interface Addition { id: string; ingredient: string; amount: Quantity }

function additions(c: SpikeContent): Addition[] {
  return (c.additions as unknown as Addition[]) ?? [];
}
function ingredients(c: SpikeContent): Ingredient[] {
  return (c.ingredients as unknown as Ingredient[]) ?? [];
}

/** OG for a spike content document (Lumina parity variant). */
export function contentOg(c: SpikeContent): string | null {
  const ing = new Map(ingredients(c).map((i) => [i.id, i]));
  const sources: GravitySource[] = additions(c).map((a) => {
    const p = ing.get(a.ingredient)?.properties ?? {};
    const s: GravitySource = { amount: a.amount };
    if (p.ppg !== undefined) s.ppg = p.ppg;
    if (p.efficiency !== undefined) s.efficiency = p.efficiency;
    return s;
  });
  const targets = c.targets as { batch_volume?: Quantity } | undefined;
  const r = originalGravity(sources, targets?.batch_volume);
  return r.status === "computed" ? r.og.round(3).toString() : null;
}

export function applyCommands(base: SpikeContent, commands: Json[]): ApplyResult {
  const content = JSON.parse(JSON.stringify(base)) as SpikeContent; // content is plain JSON; no host clone API needed
  const changed: Diff["entities"] = [];
  for (let i = 0; i < commands.length; i++) {
    const cmd = commands[i] as { [k: string]: Json };
    const reject = (code: string, message: string, details?: { [k: string]: Json }): ApplyResult => ({
      status: "rejected",
      diagnostics: [{ code, severity: "error", command_index: i, message, ...(details ? { details } : {}) }],
    });
    if (typeof cmd !== "object" || cmd === null || Array.isArray(cmd)) return reject("invalid-argument", "A command must be an object.");
    if (cmd.op !== "set_addition_amount") return reject("unknown-op", "This command is not supported.", { op: String(cmd.op) });
    for (const k of Object.keys(cmd)) {
      if (!["op", "addition", "amount"].includes(k)) return reject("unknown-member", "The command has a member it doesn't define.", { member: k });
    }
    const amount = cmd.amount as { value?: Json; unit?: Json } | undefined;
    if (!amount || typeof amount !== "object" || typeof amount.value !== "string" || typeof amount.unit !== "string" || !DECIMAL.test(amount.value)) {
      return reject("invalid-quantity", "The amount must be a quantity with a decimal-string value.");
    }
    if (!MASS_UNITS.has(amount.unit)) return reject("unit-dimension-mismatch", "This addition needs a mass unit.", { unit: amount.unit });
    if (amount.value.startsWith("-")) return reject("invalid-quantity", "An amount can't be negative.");
    const list = additions(content);
    const index = list.findIndex((a) => a.id === cmd.addition);
    if (index < 0) return reject("unknown-reference", "The addition doesn't exist.", { id: String(cmd.addition) });
    const add = list[index]!;
    const before = { ...add.amount };
    add.amount = { value: amount.value, unit: amount.unit };
    const name = ingredients(content).find((g) => g.id === add.ingredient)?.name ?? "";
    changed.push({ type: "addition", id: add.id, change: "changed", label: { ingredient: name }, fields: [{ path: "amount", before, after: { ...add.amount } }] });
  }
  return {
    status: "applied",
    content,
    diff: {
      entities: changed,
      statistics: [{ statistic: "og", before: contentOg(base), after: contentOg(content), formula: { id: "gravity.og.points-lumina-parity", version: "spike-1" } }],
    },
    diagnostics: [],
  };
}
