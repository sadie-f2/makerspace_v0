import type { AccessProvider } from "./provider";
import type { AccessCredential } from "./types";

/**
 * Noop access provider — logs every operation and returns success.
 * Used until the Okta/Brivo integration is configured.
 *
 * To activate the real provider: create src/lib/access/okta.ts,
 * implement AccessProvider, and swap the singleton in index.ts.
 */
export const noopAccess: AccessProvider = {
  name: "noop",

  async grantAccess({ memberId, email }: AccessCredential) {
    console.log(`[access:noop] grantAccess memberId=${memberId} email=${email}`);
  },

  async revokeAccess({ memberId, email }: AccessCredential) {
    console.log(`[access:noop] revokeAccess memberId=${memberId} email=${email}`);
  },

  async syncMember({ memberId, email }: AccessCredential) {
    console.log(`[access:noop] syncMember memberId=${memberId} email=${email}`);
  },
};
