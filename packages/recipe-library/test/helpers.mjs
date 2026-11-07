// Wraps a store so one step of a transaction throws, after `after` calls.
export function failing(store, op, after = 0) {
  let calls = 0;
  return {
    transaction: (fn) =>
      store.transaction((tx) =>
        fn(
          new Proxy(tx, {
            get(target, prop) {
              const v = target[prop];
              if (prop !== op) return typeof v === "function" ? v.bind(target) : v;
              return (...args) => {
                if (calls++ >= after) throw new Error("injected failure");
                return v.apply(target, args);
              };
            },
          }),
        ),
      ),
  };
}
