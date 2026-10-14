import type { Json } from "./canonical.js";
import { validateContent } from "./content.js";
import { createRevision, verifyRevision, type Content, type Revision } from "./revision.js";
import { SCHEMA_VERSION } from "./schema.js";

// Migrations across schema MAJORs (RECIPE_SCHEMA §4). A document with an
// older MAJOR is migrated forward through ordered steps into a NEW revision:
// same recipe_id, parent = the original revision, origin "migration". The
// original stays in history unchanged. MINOR changes are additive and never
// need a migration.

export interface Migration {
  /** The MAJOR this step reads. */
  readonly fromMajor: number;
  /** The "MAJOR.MINOR" this step writes. */
  readonly toVersion: string;
  readonly description: string;
  /** Pure: receives a copy of the content and returns the migrated content. */
  readonly migrate: (content: Content) => Content;
}

/** Production migrations, in order. None yet: the schema has only MAJOR 0. */
export const MIGRATIONS: readonly Migration[] = [];

export interface MigrationIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export type MigrateResult =
  | { readonly status: "migrated"; readonly revision: Revision; readonly steps: readonly string[] }
  | { readonly status: "not-needed" | "newer-major" | "no-migration-path" | "unverified-original"; readonly message: string }
  | { readonly status: "migration-failed"; readonly step: string; readonly message: string }
  | { readonly status: "invalid-result"; readonly issues: readonly MigrationIssue[] };

export interface MigrateOptions {
  /** Identity of the new revision (UUIDv7 and RFC 3339 time, chosen by the caller). */
  readonly revision_id: string;
  readonly created_at: string;
  readonly migrations?: readonly Migration[];
  readonly target?: { readonly major: number; readonly minor: number };
  /** Checks the migrated content; defaults to validateContent. */
  readonly validate?: (content: Content) => readonly MigrationIssue[];
}

export function migrateRevision(original: Revision, options: MigrateOptions): MigrateResult {
  const migrations = options.migrations ?? MIGRATIONS;
  const target = options.target ?? SCHEMA_VERSION;
  const validate = options.validate ?? ((c: Content) => validateContent(c));

  if (verifyRevision(original).status !== "valid") {
    return { status: "unverified-original", message: "the original revision doesn't verify; it is not migrated" };
  }
  let major = Number(original.envelope.schema_version.split(".")[0]);
  if (major === target.major) return { status: "not-needed", message: `already schema ${target.major}.x` };
  if (major > target.major) return { status: "newer-major", message: `schema ${original.envelope.schema_version} is newer than ${target.major}.x` };

  let content = clone(original.content);
  let version = original.envelope.schema_version;
  const steps: string[] = [];
  while (major < target.major) {
    const step = migrations.find((m) => m.fromMajor === major);
    if (!step) return { status: "no-migration-path", message: `no migration from schema ${major}.x` };
    try {
      content = step.migrate(clone(content));
    } catch (e) {
      return { status: "migration-failed", step: step.description, message: e instanceof Error ? e.message : String(e) };
    }
    steps.push(step.description);
    version = step.toVersion;
    major = Number(version.split(".")[0]);
  }

  const issues = validate(content);
  if (issues.length > 0) return { status: "invalid-result", issues };
  const revision = createRevision(
    {
      schema_version: version,
      recipe_id: original.envelope.recipe_id,
      revision_id: options.revision_id,
      parents: [original.envelope.revision_id],
      created_at: options.created_at,
      origin: "migration",
    },
    content,
  );
  return { status: "migrated", revision, steps };
}

function clone(c: Content): Content {
  return JSON.parse(JSON.stringify(c as Json)) as Content;
}
