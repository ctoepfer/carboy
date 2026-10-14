// Platform probe (USABILITY §5 items 1, 2, 5): media features and Intl
// support in this webview, plus axe-core on this page when $SPIKE_AXE=1.
import { renderNav } from "./shared/nav.js";
import { axeSummary } from "./shared/axe-run.js";

const { invoke } = window.__TAURI__.core;
renderNav(document.getElementById("header"), "probe");
const auto = await invoke("auto_mode");

// 1. Media features. An unrecognized query parses to "not all".
const FEATURES = {
  "prefers-color-scheme": ["light", "dark"],
  "prefers-reduced-motion": ["no-preference", "reduce"],
  "prefers-contrast": ["no-preference", "more", "less", "custom"],
  "forced-colors": ["none", "active"],
  "prefers-reduced-transparency": ["no-preference", "reduce"],
  "inverted-colors": ["none", "inverted"],
};
const media = {};
for (const [feature, values] of Object.entries(FEATURES)) {
  const recognized = window.matchMedia(`(${feature})`).media !== "not all" || values.some((v) => window.matchMedia(`(${feature}: ${v})`).media !== "not all");
  const current = values.find((v) => window.matchMedia(`(${feature}: ${v})`).matches) ?? null;
  media[feature] = { recognized, current };
}

// 2. Intl. Each check returns a value or throws.
const intl = {};
const probe = (name, fn) => {
  try {
    intl[name] = { ok: true, value: fn() };
  } catch (e) {
    intl[name] = { ok: false, value: String(e) };
  }
};
const LONG = "1234567890.123456789012345678901234";
probe("NumberFormat formats a decimal string exactly (ECMA-402 2023)", () => {
  const out = new Intl.NumberFormat("en-US", { maximumFractionDigits: 20, useGrouping: false }).format(LONG);
  // 20 fraction digits of the input end in 0, which formatting drops. A
  // binary double would keep only about 17 significant digits.
  return { output: out, exact: out === "1234567890.1234567890123456789" };
});
probe("NumberFormat de-DE (decimal comma)", () => new Intl.NumberFormat("de-DE").format(1234.5));
probe("NumberFormat ar-EG digits", () => new Intl.NumberFormat("ar-EG").format(1234.5));
probe("NumberFormat ja-JP", () => new Intl.NumberFormat("ja-JP").format(1234.5));
probe("PluralRules categories", () =>
  Object.fromEntries(["en", "de", "ja", "ar", "pl"].map((l) => [l, new Intl.PluralRules(l).resolvedOptions().pluralCategories])),
);
probe("DateTimeFormat de-DE", () => new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2026, 9, 13))));
probe("Locale + textInfo direction (ar)", () => {
  const l = new Intl.Locale("ar");
  const info = l.getTextInfo ? l.getTextInfo() : l.textInfo;
  return info ? info.direction : "not supported";
});
probe("DisplayNames (languages, en)", () => new Intl.DisplayNames(["en"], { type: "language" }).of("ja"));
probe("ListFormat (en)", () => new Intl.ListFormat("en", { type: "conjunction" }).format(["malt", "hops", "yeast"]));
probe("Segmenter (graphemes)", () => [...new Intl.Segmenter("en", { granularity: "grapheme" }).segment("e" + String.fromCharCode(0x301) + String.fromCodePoint(0x1f37a))].length);
probe("String.prototype.normalize NFC", () => ("e" + String.fromCharCode(0x301)).normalize("NFC").length === 1);
probe("supportedLocalesOf", () => Intl.NumberFormat.supportedLocalesOf(["en-US", "de-DE", "ja-JP", "ar-EG", "he-IL", "zh-Hans-CN"]));

// Render
const mediaRows = document.getElementById("media");
for (const [k, v] of Object.entries(media)) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<th scope="row"></th><td></td><td></td>`;
  tr.children[0].textContent = k;
  tr.children[1].textContent = v.recognized ? "yes" : "no";
  tr.children[2].textContent = v.current ?? "(none matched)";
  mediaRows.append(tr);
}
const intlRows = document.getElementById("intl");
for (const [k, v] of Object.entries(intl)) {
  const tr = document.createElement("tr");
  tr.innerHTML = `<th scope="row"></th><td></td>`;
  tr.children[0].textContent = k;
  tr.children[1].textContent = (v.ok ? "" : "error: ") + JSON.stringify(v.value);
  intlRows.append(tr);
}
const failed = Object.values(intl).filter((v) => !v.ok).length;
document.getElementById("summary").textContent = `Measured ${Object.keys(media).length} media features and ${Object.keys(intl).length} Intl checks (${failed} errors).`;
await invoke("log", { message: `/probe.html: done, auto=${auto}` });
if (auto) {
  await invoke("report", {
    json: JSON.stringify({ page: "probe", userAgent: navigator.userAgent, media, intl, axe: await axeSummary("./") }, null, 2),
  });
}
