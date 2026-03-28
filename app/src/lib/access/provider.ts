import type { AccessCredential } from "./types";

/**
 * AccessProvider — the stable interface all building-access implementations
 * must satisfy.
 *
 * Noop provider: logs operations, returns success. Used until Brivo/Okta
 * credentials are available.
 *
 * Okta/Brivo provider (future): calls the Okta Users API to assign or remove
 * the "building-access" group. Brivo then enforces physical access via the
 * Okta Identity Connector — no direct Brivo API calls needed.
 *
 * Call sites import from @/lib/access, never from a specific implementation.
 */
export interface AccessProvider {
  /**
   * Enable building access for a member.
   * Called when a membership is approved or access is restored after suspension.
   */
  grantAccess(credential: AccessCredential): Promise<void>;

  /**
   * Revoke building access for a member.
   * Called when access is suspended or a membership lapses.
   */
  revokeAccess(credential: AccessCredential): Promise<void>;

  /**
   * Push an updated member profile to the access system.
   * Called when name or email changes — keeps the access system in sync.
   * Implementations should be idempotent; a no-op is acceptable if the
   * provider has no independent user record.
   */
  syncMember(credential: AccessCredential): Promise<void>;

  readonly name: string;
}
