import type { SqlDriver } from "./sqlite.js";

// The SqlDriver for the Tauri shell. `invoke` is passed in, so this package
// has no Tauri dependency. The shell's commands own exactly one connection,
// which is what SqlDriver requires: the SQL plugin's pool can't honour
// connection-level PRAGMAs or a transaction spanning several calls.

export type Invoke = (command: string, args: { readonly sql: string; readonly params: readonly (string | number | null)[] }) => Promise<unknown>;

export function tauriDriver(invoke: Invoke): SqlDriver {
  const call = async (command: string, sql: string, params: readonly (string | number | null)[] = []) => {
    try {
      return await invoke(command, { sql, params });
    } catch (e) {
      // Tauri rejects with the command's error string, not an Error.
      throw e instanceof Error ? e : new Error(String(e));
    }
  };
  return {
    run: (sql, params) => call("library_run", sql, params),
    all: async (sql, params) => (await call("library_all", sql, params)) as { readonly [column: string]: unknown }[],
  };
}
