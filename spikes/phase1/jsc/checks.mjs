// Engine-neutral checks for Recipe Core (mobile option 1). Entries supply
// the bundled core, the vector list, and a way to load a vector's input.
export function runChecks(core, vectors, loadInput) {
  const results = [];
  const check = (name, fn) => {
    try {
      const ok = fn();
      results.push({ name, ok: ok === true });
    } catch (e) {
      results.push({ name, ok: false, error: String(e) });
    }
  };
  const hex = (bytes) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  for (const v of vectors) {
    check(`vector ${v.name}`, () => {
      const doc = loadInput(v.input);
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
  return { passed, total: results.length, failures: results.filter((r) => !r.ok) };
}
