/**
 * Access Control — public entry point
 *
 * All call sites import from here, never from a specific implementation.
 * Swap providers by changing the singleton assignment below.
 */

export { AccessError } from "./types";
export type { AccessCredential } from "./types";
export type { AccessProvider } from "./provider";

import { noopAccess } from "./noop";

// Active provider — swap for oktaAccess when Okta/Brivo credentials are available
export const access = noopAccess;
