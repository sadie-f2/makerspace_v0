// ── Errors ────────────────────────────────────────────────────────────────────

export class IdentityError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "IdentityError";
  }
}

/**
 * Thrown by verifyCredentials() on OIDC providers — credential verification
 * is handled by the provider's own auth flow, not our app.
 */
export class IdentityNotImplementedError extends Error {
  constructor(public readonly operation: string) {
    super(`Identity operation "${operation}" is not implemented by this provider`);
    this.name = "IdentityNotImplementedError";
  }
}
