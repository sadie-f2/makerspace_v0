/**
 * IdentityProvider — the stable interface all credential-management
 * implementations must satisfy.
 *
 * Local provider: bcrypt passwords stored on Member.passwordHash.
 * Okta provider (future): Okta Users API + OIDC for auth.
 *
 * Call sites import from @/lib/identity, never from a specific implementation.
 */
export interface IdentityProvider {
  /**
   * Provision credentials in the identity system for a newly created member.
   * Local: hashes initialPassword and stores it on Member.passwordHash.
   * Okta: creates the user in the Okta directory.
   */
  provisionUser(params: {
    memberId: string;
    name: string;
    email: string;
    /** Plaintext. Defaults to "changeme" if omitted. */
    initialPassword?: string;
  }): Promise<void>;

  /**
   * Verify email + password — used by NextAuth CredentialsProvider authorize().
   * Returns true if credentials are valid, false otherwise.
   * Throws IdentityNotImplementedError on OIDC providers (auth is handled by
   * the OIDC flow; this code path is never reached when OktaProvider is active).
   */
  verifyCredentials(email: string, password: string): Promise<boolean>;

  /**
   * Set or reset a password for a member.
   * Local: hashes and stores on Member.passwordHash.
   * Okta: calls the Okta password reset API.
   */
  setPassword(params: {
    memberId: string;
    newPassword: string;
  }): Promise<void>;

  /**
   * Revoke a member's access. Does not delete the record.
   * Local: sets Member.deletedAt.
   * Okta: deactivates the Okta user.
   */
  deactivateUser(memberId: string): Promise<void>;

  /**
   * Restore a previously deactivated member's access.
   * Local: clears Member.deletedAt.
   * Okta: reactivates the Okta user.
   */
  reactivateUser(memberId: string): Promise<void>;

  readonly name: string;
}
