// Entry for macOS JavaScript for Automation (`osascript -l JavaScript`),
// which runs on the system JavaScriptCore. Bundled by esbuild as an IIFE
// with the vectors embedded (osascript has no module loader or file read).
// GENERATED list of case imports: keep in step with fixtures/canonical-hash.
import * as core from "../../../packages/recipe-core/dist/index.js";
import { runChecks } from "./checks.mjs";
import vectorsDoc from "../../../fixtures/canonical-hash/vectors.json";
import c0 from "../../../fixtures/canonical-hash/cases/jcs-escapes.input.json";
import c1 from "../../../fixtures/canonical-hash/cases/jcs-key-order.input.json";
import c2 from "../../../fixtures/canonical-hash/cases/jcs-numbers.input.json";
import c3 from "../../../fixtures/canonical-hash/cases/revision-merge.input.json";
import c4 from "../../../fixtures/canonical-hash/cases/revision-minimal.input.json";
import c5 from "../../../fixtures/canonical-hash/cases/revision-typical.input.json";
import c6 from "../../../fixtures/canonical-hash/cases/rfc8785-sample.input.json";
const inputs = {"cases/jcs-escapes.input.json": c0, "cases/jcs-key-order.input.json": c1, "cases/jcs-numbers.input.json": c2, "cases/revision-merge.input.json": c3, "cases/revision-minimal.input.json": c4, "cases/revision-typical.input.json": c5, "cases/rfc8785-sample.input.json": c6};
const report = runChecks(core, vectorsDoc.vectors, (input) => inputs[input]);
// osascript prints the value of the last expression to stdout.
globalThis.__carboyReport = JSON.stringify({ engine: "JavaScriptCore (osascript)", ...report }, null, 2);
