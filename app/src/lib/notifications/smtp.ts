import nodemailer from "nodemailer";
import type { NotificationProvider } from "./provider";
import type {
  NotificationType,
  NotificationPayloadMap,
  NotificationReceipt,
  Recipient,
} from "./types";
import { NotificationError, NotificationNotImplementedError } from "./types";

// ── Transport ─────────────────────────────────────────────────────────────────

function makeTransport() {
  if (!process.env.SMTP_HOST) return null;
  const port   = parseInt(process.env.SMTP_PORT ?? "2525");
  const secure = port === 465;
  return nodemailer.createTransport({
    host:       process.env.SMTP_HOST,
    port,
    secure,
    requireTLS: !secure,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
}

const FROM = () =>
  `${process.env.SMTP_FROM_NAME ?? "Artisans Asylum"} <${process.env.SMTP_FROM ?? "noreply@artisansasylum.com"}>`;

const BASE_URL = () => process.env.AUTH_URL ?? "http://localhost:3000";

// ── Templates ─────────────────────────────────────────────────────────────────

function wrap(body: string): string {
  return `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">${body}<hr style="margin-top:2em"><p style="color:#888;font-size:12px">Artisans Asylum · <a href="mailto:info@artisansasylum.com">info@artisansasylum.com</a></p></div>`;
}

type RenderedMessage = { subject: string; html: string };

function render<T extends NotificationType>(
  type: T,
  to: Recipient,
  payload: NotificationPayloadMap[T],
): RenderedMessage {
  const p = payload as NotificationPayloadMap[NotificationType];

  switch (type) {
    case "email.confirm": {
      const { code } = p as NotificationPayloadMap["email.confirm"];
      return {
        subject: "Confirm your email — Artisans Asylum",
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Enter this code to confirm your email address and activate your account:</p>
          <p style="font-size:2em;letter-spacing:0.2em;font-weight:bold;text-align:center">${code}</p>
          <p style="color:#888;font-size:12px">This code expires in 24 hours.</p>
        `),
      };
    }
    case "welcome": {
      const { loginUrl } = p as NotificationPayloadMap["welcome"];
      return {
        subject: "Welcome to Artisans Asylum",
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Your Artisans Asylum member account has been created.</p>
          <p><a href="${loginUrl}">Log in to your member portal</a></p>
          <p>Questions? Stop by the front desk or email <a href="mailto:info@artisansasylum.com">info@artisansasylum.com</a>.</p>
        `),
      };
    }
    case "rental.approved": {
      const { resourceName, startDate, monthlyRate } = p as NotificationPayloadMap["rental.approved"];
      return {
        subject: `Your rental of ${resourceName} has been approved`,
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Your rental request for <strong>${resourceName}</strong> has been approved.</p>
          <p>Start date: ${startDate.toLocaleDateString()}<br>Monthly rate: $${monthlyRate.toFixed(2)}</p>
          <p><a href="${BASE_URL()}/portal/rentals">View your rentals</a></p>
        `),
      };
    }
    case "rental.rejected": {
      const { resourceName, note } = p as NotificationPayloadMap["rental.rejected"];
      return {
        subject: `Rental request update for ${resourceName}`,
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Your rental request for <strong>${resourceName}</strong> was not approved at this time.</p>
          ${note ? `<p>Note from staff: ${note}</p>` : ""}
          <p>Questions? Contact the front desk.</p>
        `),
      };
    }
    case "rental.end.approved": {
      const { resourceName, endDate } = p as NotificationPayloadMap["rental.end.approved"];
      return {
        subject: `Your rental of ${resourceName} has ended`,
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Your rental of <strong>${resourceName}</strong> has been ended as requested.</p>
          <p>End date: ${endDate.toLocaleDateString()}</p>
        `),
      };
    }
    case "waitlist.offered": {
      const { resourceName, resourceType, offerExpiresAt } = p as NotificationPayloadMap["waitlist.offered"];
      return {
        subject: `A ${resourceType} is available for you`,
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Good news — a space has become available: <strong>${resourceName}</strong>.</p>
          ${offerExpiresAt ? `<p>This offer expires on ${offerExpiresAt.toLocaleDateString()}.</p>` : ""}
          <p>Contact the front desk or <a href="${BASE_URL()}/portal/waitlist">view your waitlist</a> to accept.</p>
        `),
      };
    }
    case "booking.confirmed": {
      const { resourceName, startAt, endAt } = p as NotificationPayloadMap["booking.confirmed"];
      return {
        subject: `Booking confirmed: ${resourceName}`,
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Your booking for <strong>${resourceName}</strong> is confirmed.</p>
          <p>${startAt.toLocaleString()} – ${endAt.toLocaleString()}</p>
          <p><a href="${BASE_URL()}/portal/bookings">View your bookings</a></p>
        `),
      };
    }
    case "booking.cancelled": {
      const { resourceName, startAt } = p as NotificationPayloadMap["booking.cancelled"];
      return {
        subject: `Booking cancelled: ${resourceName}`,
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Your booking for <strong>${resourceName}</strong> on ${startAt.toLocaleString()} has been cancelled.</p>
        `),
      };
    }
    case "booking.reminder": {
      const { resourceName, startAt } = p as NotificationPayloadMap["booking.reminder"];
      return {
        subject: `Reminder: ${resourceName} booking coming up`,
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Just a reminder — you have a booking for <strong>${resourceName}</strong> at ${startAt.toLocaleString()}.</p>
        `),
      };
    }
    case "payment.receipt": {
      const { amount, currency, description, paidAt } = p as NotificationPayloadMap["payment.receipt"];
      return {
        subject: "Payment receipt — Artisans Asylum",
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>We received your payment of <strong>${(amount / 100).toFixed(2)} ${currency.toUpperCase()}</strong> for ${description} on ${paidAt.toLocaleDateString()}.</p>
          <p>Thank you!</p>
        `),
      };
    }
    case "payment.failed": {
      const { amount, currency, description } = p as NotificationPayloadMap["payment.failed"];
      return {
        subject: "Payment failed — action required",
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>A payment of ${(amount / 100).toFixed(2)} ${currency.toUpperCase()} for ${description} could not be processed.</p>
          <p>Please update your payment method to avoid interruption to your membership.</p>
          <p><a href="${BASE_URL()}/portal">Log in to your portal</a></p>
        `),
      };
    }
    case "access.suspended": {
      const { reason } = p as NotificationPayloadMap["access.suspended"];
      return {
        subject: "Your Artisans Asylum access has been suspended",
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Your building access has been suspended${reason ? `: ${reason}` : "."}.</p>
          <p>Contact the front desk to resolve this.</p>
        `),
      };
    }
    case "access.restored": {
      const { note } = p as NotificationPayloadMap["access.restored"];
      return {
        subject: "Your Artisans Asylum access has been restored",
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Your building access has been restored${note ? `: ${note}` : "."}.</p>
          <p>Welcome back!</p>
        `),
      };
    }
    case "membership.expiring": {
      const { expiresAt, tierName } = p as NotificationPayloadMap["membership.expiring"];
      return {
        subject: "Your Artisans Asylum membership is expiring soon",
        html: wrap(`
          <p>Hi ${to.name},</p>
          <p>Your <strong>${tierName}</strong> membership expires on ${expiresAt.toLocaleDateString()}.</p>
          <p>Contact the front desk to renew.</p>
        `),
      };
    }
    default:
      throw new NotificationNotImplementedError(type);
  }
}

// ── SMTP implementation ───────────────────────────────────────────────────────

const SUPPORTED: ReadonlySet<NotificationType> = new Set([
  "email.confirm",
  "welcome",
  "rental.approved",
  "rental.rejected",
  "rental.end.approved",
  "waitlist.offered",
  "booking.confirmed",
  "booking.cancelled",
  "booking.reminder",
  "payment.receipt",
  "payment.failed",
  "access.suspended",
  "access.restored",
  "membership.expiring",
] satisfies NotificationType[]);

export const smtpNotifications: NotificationProvider = {
  name: "smtp",

  supports: () => SUPPORTED,

  async send(type, to, payload) {
    const { subject, html } = render(type, to, payload);
    const transport = makeTransport();

    if (!transport) {
      // Stub: log and return a fake receipt when SMTP is not configured
      console.log(`[notifications:smtp stub] type=${type} to=${to.email} subject=${subject}`);
      return { messageId: `stub-${Date.now()}`, channel: "smtp", sentAt: new Date() };
    }

    try {
      const info = await transport.sendMail({ from: FROM(), to: to.email, subject, html });
      return { messageId: info.messageId, channel: "smtp", sentAt: new Date() };
    } catch (err) {
      throw new NotificationError(
        `Failed to send "${type}" to ${to.email}`,
        type,
        "smtp",
        err,
      );
    }
  },
};
