// ── Credential ────────────────────────────────────────────────────────────────

/**
 * Everything the access system needs to identify a member.
 * When Brivo is active via Okta, `oktaId` is the link.
 * `fobNumber` is informational for day-pass records.
 */
export interface AccessCredential {
  memberId: string;
  name: string;
  email: string;
  oktaId?: string;
  fobNumber?: string;
}

// ── Errors ────────────────────────────────────────────────────────────────────

export class AccessError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly memberId: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "AccessError";
  }
}
