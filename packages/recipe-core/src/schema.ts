import { isObject } from "./provenance.js";

// Schema versions (RECIPE_SCHEMA §4; D-022). MINOR changes are additive, so
// every optional member or enum value records the MINOR that introduced it.
// "Write at X" means: check the content uses nothing newer than X, then
// stamp X. No content is ever converted between MINORs.

export const SCHEMA_VERSION = { major: 0, minor: 2 } as const;

/** Oldest MINOR of the current MAJOR this build can still write. */
const OLDEST_MINOR = 1;

/** Ingredient members each MINOR added (0.2: requirement and approved alternatives, INGREDIENT_CATALOG §3). */
const INGREDIENT_ADDITIONS: readonly { readonly member: string; readonly minor: number }[] = [
  { member: "group_ref", minor: 2 },
  { member: "alternatives", minor: 2 },
];

export interface SchemaUse {
  readonly path: string;
  readonly version: string;
}

export interface SchemaIssue {
  readonly code: "member-newer-than-schema" | "unsupported-schema-version";
  readonly path: string;
  readonly message: string;
}

/** The lowest schema version that can express this content, with every use of a member newer than the oldest. */
export function requiredSchemaVersion(content: unknown, base = "/content"): { version: string; uses: SchemaUse[] } {
  const uses: SchemaUse[] = [];
  let minor = OLDEST_MINOR;
  const ings = isObject(content) ? content["ingredients"] : undefined;
  if (Array.isArray(ings)) {
    ings.forEach((ing, i) => {
      if (!isObject(ing)) return;
      for (const a of INGREDIENT_ADDITIONS) {
        if (a.minor <= OLDEST_MINOR || ing[a.member] === undefined) continue;
        uses.push({ path: `${base}/ingredients/${i}/${a.member}`, version: `${SCHEMA_VERSION.major}.${a.minor}` });
        minor = Math.max(minor, a.minor);
      }
    });
  }
  return { version: `${SCHEMA_VERSION.major}.${minor}`, uses };
}

/** Issues if content can't be written (or wasn't validly written) at `version`. */
export function checkSchemaVersion(content: unknown, version: string, base = "/content"): SchemaIssue[] {
  const m = /^(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(version);
  if (!m || Number(m[1]) !== SCHEMA_VERSION.major || Number(m[2]) < OLDEST_MINOR || Number(m[2]) > SCHEMA_VERSION.minor) {
    return [
      {
        code: "unsupported-schema-version",
        path: "/envelope/schema_version",
        message: `this version writes schema ${SCHEMA_VERSION.major}.${OLDEST_MINOR} to ${SCHEMA_VERSION.major}.${SCHEMA_VERSION.minor}`,
      },
    ];
  }
  const minor = Number(m[2]);
  return requiredSchemaVersion(content, base)
    .uses.filter((u) => Number(u.version.split(".")[1]) > minor)
    .map((u) => ({ code: "member-newer-than-schema", path: u.path, message: `introduced in schema ${u.version}, newer than ${version}` }));
}
