/**
 * Identity — public entry point
 *
 * All call sites import from here, never from a specific implementation.
 * Swap providers by changing the singleton assignment below.
 */

export { IdentityError, IdentityNotImplementedError } from "./types";
export type { IdentityProvider } from "./provider";

import { localIdentity } from "./local";

// Active provider — swap for oktaIdentity when Okta credentials are available
export const identity = localIdentity;
