/**
 * Notifications — public entry point
 *
 * All call sites import from here, never from a specific implementation.
 * Swap providers by changing the singleton assignment below.
 */

export type {
  NotificationType,
  NotificationPayloadMap,
  NotificationReceipt,
  Recipient,
} from "./types";
export { NotificationError, NotificationNotImplementedError } from "./types";
export type { NotificationProvider } from "./provider";

import { smtpNotifications } from "./smtp";
import type { NotificationProvider } from "./provider";
import type { NotificationType, NotificationPayloadMap, Recipient } from "./types";

// Active provider — replace with a multi-cast or different implementation as needed
export const notifications: NotificationProvider = smtpNotifications;

/**
 * Convenience wrapper — most call sites only need this.
 */
export function notify<T extends NotificationType>(
  type: T,
  to: Recipient,
  payload: NotificationPayloadMap[T],
) {
  return notifications.send(type, to, payload);
}
