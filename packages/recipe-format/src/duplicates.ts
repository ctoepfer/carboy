// Duplicate member names (I-JSON, RFC 7493 §2.3, which RFC 8785 requires).
// JSON.parse keeps the last of duplicate names without telling anyone, so
// one file could mean different recipes to different readers. This scanner
// finds them; call it only on text JSON.parse has already accepted.
//
// Names are compared after escape processing, code point by code point
// (no Unicode normalization), as I-JSON specifies.

type Frame = { readonly kind: "object"; readonly names: Set<string>; name: string | undefined; expectName: boolean } | { readonly kind: "array"; index: number };

/** JSON Pointers of every member whose name repeats an earlier one in the same object. */
export function duplicateMembers(text: string): string[] {
  const found: string[] = [];
  const stack: Frame[] = [];
  const pointer = (last: string) => "/" + stack.slice(0, -1).map(segment).concat(escape(last)).join("/");

  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === '"') {
      const end = stringEnd(text, i);
      const top = stack[stack.length - 1];
      if (top?.kind === "object" && top.expectName) {
        const name = JSON.parse(text.slice(i, end)) as string;
        if (top.names.has(name)) found.push(pointer(name));
        top.names.add(name);
        top.name = name;
        top.expectName = false;
      }
      i = end;
      continue;
    }
    if (ch === "{") stack.push({ kind: "object", names: new Set(), name: undefined, expectName: true });
    else if (ch === "[") stack.push({ kind: "array", index: 0 });
    else if (ch === "}" || ch === "]") stack.pop();
    else if (ch === ",") {
      const top = stack[stack.length - 1];
      if (top?.kind === "object") top.expectName = true;
      else if (top?.kind === "array") top.index++;
    }
    i++;
  }
  return found;
}

/** Index just past the closing quote of the string starting at `start`. */
function stringEnd(text: string, start: number): number {
  let i = start + 1;
  while (text[i] !== '"') i += text[i] === "\\" ? 2 : 1;
  return i + 1;
}

function segment(f: Frame): string {
  return f.kind === "array" ? String(f.index) : escape(f.name ?? "");
}

function escape(name: string): string {
  return name.replace(/~/g, "~0").replace(/\//g, "~1");
}
