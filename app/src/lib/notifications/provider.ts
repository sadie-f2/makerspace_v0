import type {
  NotificationType,
  NotificationPayloadMap,
  NotificationReceipt,
  Recipient,
} from "./types";

/**
 * NotificationProvider — the stable interface all notification implementations
 * must satisfy. Call sites import from @/lib/notifications, never from a
 * specific implementation file.
 *
 * Implementations are responsible for:
 * - Rendering the payload into a human-readable message for their channel
 * - Delivery and returning a receipt
 * - Throwing NotificationError on delivery failure
 * - Throwing NotificationNotImplementedError for unsupported message types
 */
export interface NotificationProvider {
  /**
   * Send a notification of the given type to the recipient.
   * T is inferred from the type parameter — the payload must match the type.
   */
  send<T extends NotificationType>(
    type: T,
    to: Recipient,
    payload: NotificationPayloadMap[T],
  ): Promise<NotificationReceipt>;

  /**
   * Returns the set of notification types this provider can send.
   * Useful for health checks and admin UI.
   */
  supports(): ReadonlySet<NotificationType>;

  /**
   * Human-readable name for this provider (e.g. "smtp", "sms", "noop").
   */
  readonly name: string;
}
