// Mobile option 1 (SPIKE_PLAN "Mobile investigation"): run Recipe Core under
// JavaScriptCore's command-line shell (`jsc -m check.mjs`), the engine of
// iOS WKWebView, without the app shell. Uses only jsc's own `read` and
// `print`; run from the repository root after bundling Recipe Core into
// spikes/phase1/jsc/core.mjs.
import * as core from "./core.mjs";

const results = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    results.push({ name, ok: detail === true || (detail && detail.ok !== false), detail });
  } catch (e) {
    results.push({ name, ok: false, detail: String(e) });
  }
};
const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const dir = "fixtures/canonical-hash/";
const vectors = JSON.parse(read(dir + "vectors.json")).vectors;

for (const v of vectors) {
  check(`vector ${v.name}`, () => {
    const doc = JSON.parse(read(dir + v.input));
    let input = doc;
    if (v.kind === "revision") {
      const { content_hash: _h, ...envelope } = doc.envelope;
      input = { envelope, content: doc.content };
    }
    return hex(core.canonicalBytes(input)) === v.canonical_utf8_hex && core.canonicalSha256(input) === v.sha256;
  });
}
check("decimal division, 34 digits", () => core.Decimal.parse("2").div(core.Decimal.parse("3")).toString() === "0.6666666666666666666666666666666667");
check("unit conversion, oz to kg", () => core.convert({ value: "2.92", unit: "oz" }, "kg").toString() === "0.082780607525");
check("temperature, 98.6 F to C", () => core.convert({ value: "98.6", unit: "F" }, "C").toString() === "37");
check("gravity.sg-plato, 12 P", () => core.sgFromPlato("beer", { value: "12", unit: "Plato" }).value.toString() === "1.04837");
check("gravity.og.mass-method", () => core.originalGravityMassMethod("beer", { value: "2.88", unit: "kg" }, { value: "20", unit: "L" }).value.toString() === "1.05543");
check("color.mcu", () => core.maltColorUnits("beer", [{ mass: { value: "10", unit: "lb" }, color: { value: "2", unit: "degL" } }], { value: "5", unit: "US gal" }).value.toString() === "4");

const passed = results.filter((r) => r.ok).length;
print(JSON.stringify({ engine: typeof describe === "function" ? "jsc" : "other", passed, total: results.length, failures: results.filter((r) => !r.ok) }, null, 2));
