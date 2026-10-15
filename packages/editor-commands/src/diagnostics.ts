// Result and diagnostic shape (EDITOR_COMMANDS §6). Codes are the contract;
// messages are for people. User text appears only in `details`.

export type Severity = "error" | "warning" | "info";

export interface Diagnostic {
  readonly code: string;
  readonly severity: Severity;
  /** Zero-based index of the submitted command that caused it, when there is one. */
  readonly command_index?: number;
  /** JSON Pointer into the base content (command errors) or the result (validation). */
  readonly path?: string;
  readonly message: string;
  readonly details?: { readonly [key: string]: unknown };
}

/** Thrown by a command handler; the applier turns it into an error diagnostic and rejects the list. */
export class CommandError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly path?: string,
    readonly details?: { readonly [key: string]: unknown },
  ) {
    super(message);
    this.name = "CommandError";
  }
}
