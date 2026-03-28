// ── Recipients ───────────────────────────────────────────────────────────────

export interface Recipient {
  name: string;
  email: string;
}

// ── Message types & payloads ─────────────────────────────────────────────────

export type NotificationType =
  | "welcome"
  | "rental.approved"
  | "rental.rejected"
  | "rental.end.approved"
  | "waitlist.offered"
  | "booking.confirmed"
  | "booking.cancelled"
  | "booking.reminder"
  | "payment.receipt"
  | "payment.failed"
  | "access.suspended"
  | "access.restored"
  | "membership.expiring";

export interface WelcomePayload {
  loginUrl: string;
}

export interface RentalApprovedPayload {
  resourceName: string;
  startDate: Date;
  monthlyRate: number;
}

export interface RentalRejectedPayload {
  resourceName: string;
  note?: string;
}

export interface RentalEndApprovedPayload {
  resourceName: string;
  endDate: Date;
}

export interface WaitlistOfferedPayload {
  resourceName: string;
  resourceType: string;
  offerExpiresAt?: Date;
}

export interface BookingConfirmedPayload {
  resourceName: string;
  startAt: Date;
  endAt: Date;
}

export interface BookingCancelledPayload {
  resourceName: string;
  startAt: Date;
}

export interface BookingReminderPayload {
  resourceName: string;
  startAt: Date;
}

export interface PaymentReceiptPayload {
  amount: number;
  currency: string;
  description: string;
  paidAt: Date;
}

export interface PaymentFailedPayload {
  amount: number;
  currency: string;
  description: string;
}

export interface AccessSuspendedPayload {
  reason?: string;
}

export interface AccessRestoredPayload {
  note?: string;
}

export interface MembershipExpiringPayload {
  expiresAt: Date;
  tierName: string;
}

// Map from type → payload shape
export interface NotificationPayloadMap {
  "welcome":              WelcomePayload;
  "rental.approved":      RentalApprovedPayload;
  "rental.rejected":      RentalRejectedPayload;
  "rental.end.approved":  RentalEndApprovedPayload;
  "waitlist.offered":     WaitlistOfferedPayload;
  "booking.confirmed":    BookingConfirmedPayload;
  "booking.cancelled":    BookingCancelledPayload;
  "booking.reminder":     BookingReminderPayload;
  "payment.receipt":      PaymentReceiptPayload;
  "payment.failed":       PaymentFailedPayload;
  "access.suspended":     AccessSuspendedPayload;
  "access.restored":      AccessRestoredPayload;
  "membership.expiring":  MembershipExpiringPayload;
}

// ── Result & errors ───────────────────────────────────────────────────────────

export interface NotificationReceipt {
  messageId: string;
  channel: string;  // "smtp", "sms", "noop", etc.
  sentAt: Date;
}

export class NotificationError extends Error {
  constructor(
    message: string,
    public readonly type: NotificationType,
    public readonly channel: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NotificationError";
  }
}

export class NotificationNotImplementedError extends Error {
  constructor(public readonly type: NotificationType) {
    super(`Notification type "${type}" is not implemented by this provider`);
    this.name = "NotificationNotImplementedError";
  }
}
