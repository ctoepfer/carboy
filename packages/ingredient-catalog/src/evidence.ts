import type { Evidence, Relation, RelationStatus } from "./model.js";

// Status comes from evidence and is never stored as a fact (§2.4). Superseded
// entries stay in the document and stop counting.

/** Secondary or anecdotal: a map of what to check, not support on its own (§2.6). */
const WEAK_KINDS: readonly string[] = ["compiled", "community"];
/** The only kinds that can establish identity: never function or marketing (D-030). */
const IDENTITY_KINDS: readonly string[] = ["genomic", "manufacturer"];

export function inForce(evidence: readonly Evidence[]): readonly Evidence[] {
  return evidence.filter((e) => e.superseded_by === undefined);
}

export function relationStatus(relation: Pick<Relation, "type" | "evidence">): RelationStatus {
  const live = inForce(relation.evidence);
  const supports = live.filter((e) => e.stance === "supports");
  const contradicts = live.filter((e) => e.stance === "contradicts");
  if (supports.length > 0 && contradicts.length > 0) return "contested";
  if (contradicts.length > 0) return "refuted";
  if (supports.every((e) => WEAK_KINDS.includes(e.kind))) return "unreviewed";
  if (relation.type === "same_strain" && !supports.some((e) => IDENTITY_KINDS.includes(e.kind))) return "unreviewed";
  return "supported";
}

/** A claim with nothing behind it but compilations and anecdote. */
export function onlyWeakEvidence(relation: Pick<Relation, "evidence">): boolean {
  return inForce(relation.evidence).every((e) => WEAK_KINDS.includes(e.kind));
}

/** A positive identity claim with no genomic or maker evidence. */
export function identityUnsupported(relation: Pick<Relation, "type" | "evidence">): boolean {
  if (relation.type !== "same_strain") return false;
  const supports = inForce(relation.evidence).filter((e) => e.stance === "supports");
  return supports.length > 0 && !supports.some((e) => IDENTITY_KINDS.includes(e.kind));
}
