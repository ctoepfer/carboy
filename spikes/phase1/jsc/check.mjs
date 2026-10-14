// Entry for JavaScriptCore's `jsc` shell (`jsc -m check.mjs`), using only
// jsc's `read` and `print`. Run from the repository root after bundling.
import * as core from "./core.mjs";
import { runChecks } from "./checks.mjs";

const dir = "fixtures/canonical-hash/";
const vectors = JSON.parse(read(dir + "vectors.json")).vectors;
const report = runChecks(core, vectors, (input) => JSON.parse(read(dir + input)));
print(JSON.stringify({ engine: "jsc", ...report }, null, 2));
