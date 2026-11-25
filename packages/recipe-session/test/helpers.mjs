// A test host: ids from a counter, a fake clock, and timers that fire when the clock moves.
export function host(library, extra = {}) {
  let t = Date.UTC(2026, 10, 24, 12, 0, 0);
  let n = 0;
  const timers = new Map();
  let id = 0;
  const h = {
    library,
    newId: () => `0192f3a0-0000-7000-8000-${String(++n).padStart(12, "0")}`,
    now: () => t,
    setTimer: (fn, ms) => (timers.set(++id, { fn, at: t + ms }), id),
    clearTimer: (k) => timers.delete(k),
    advance(ms) {
      t += ms;
      for (const [k, v] of [...timers]) if (v.at <= t) (timers.delete(k), v.fn());
    },
    ...extra,
  };
  return h;
}
