import { describe, it, expect, beforeEach } from "vitest";
import { smtpNotifications } from "../lib/notifications/smtp";
import type { NotificationType } from "../lib/notifications/types";

// SMTP_HOST is not set in the test environment — all tests verify stub behavior.

describe("smtpNotifications — stub mode (no SMTP_HOST)", () => {
  beforeEach(() => {
    delete process.env.SMTP_HOST;
  });

  it("supports() returns all 13 notification types", () => {
    const supported = smtpNotifications.supports();
    expect(supported.size).toBe(13);
    const expected: NotificationType[] = [
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
    ];
    for (const t of expected) expect(supported.has(t)).toBe(true);
  });

  it("send() resolves and returns a stub receipt without throwing", async () => {
    const receipt = await smtpNotifications.send(
      "welcome",
      { name: "Test User", email: "test@example.com" },
      { loginUrl: "http://localhost:3000/login" },
    );
    expect(receipt.channel).toBe("smtp");
    expect(receipt.messageId).toMatch(/^stub-/);
    expect(receipt.sentAt).toBeInstanceOf(Date);
  });

  const ALL_PAYLOADS: Record<NotificationType, unknown> = {
    "email.confirm":       { code: "A3F2" },
    "welcome":             { loginUrl: "http://localhost:3000" },
    "rental.approved":     { resourceName: "Studio 1", startDate: new Date(), monthlyRate: 300 },
    "rental.rejected":     { resourceName: "Studio 1" },
    "rental.end.approved": { resourceName: "Studio 1", endDate: new Date() },
    "waitlist.offered":    { resourceName: "Studio 1", resourceType: "studio" },
    "booking.confirmed":   { resourceName: "Room A", startAt: new Date(), endAt: new Date() },
    "booking.cancelled":   { resourceName: "Room A", startAt: new Date() },
    "booking.reminder":    { resourceName: "Room A", startAt: new Date() },
    "payment.receipt":     { amount: 30000, currency: "usd", description: "Rental", paidAt: new Date() },
    "payment.failed":      { amount: 30000, currency: "usd", description: "Rental" },
    "access.suspended":    {},
    "access.restored":     {},
    "membership.expiring": { expiresAt: new Date(), tierName: "Standard" },
  };

  it.each(Object.keys(ALL_PAYLOADS) as NotificationType[])(
    "send('%s') resolves without throwing in stub mode",
    async (type) => {
      const receipt = await smtpNotifications.send(
        type,
        { name: "Test", email: "t@test.com" },
        ALL_PAYLOADS[type] as never,
      );
      expect(receipt.channel).toBe("smtp");
    },
  );
});
