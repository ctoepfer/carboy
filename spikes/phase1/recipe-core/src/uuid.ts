// UUIDv7 (RFC 9562 §5.7): 48-bit Unix milliseconds, version 7, variant 10,
// 74 random bits. Time and randomness are injected so tests are deterministic.
export function uuidv7(unixMs: number, random: Uint8Array = crypto.getRandomValues(new Uint8Array(10))): string {
  if (random.length < 10) throw new Error("uuidv7 needs 10 random bytes");
  const b = new Uint8Array(16);
  let t = BigInt(unixMs);
  for (let i = 5; i >= 0; i--) {
    b[i] = Number(t & 0xffn);
    t >>= 8n;
  }
  b.set(random.subarray(0, 10), 6);
  b[6] = 0x70 | ((b[6] ?? 0) & 0x0f);
  b[8] = 0x80 | ((b[8] ?? 0) & 0x3f);
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
