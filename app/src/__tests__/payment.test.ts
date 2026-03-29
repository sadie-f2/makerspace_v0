import { describe, it, expect } from "vitest";
import { stripePayment } from "../lib/payment/stripe";

// STRIPE_SECRET_KEY is not set in the test environment — all tests verify stub behavior.

describe("stripePayment — stub mode (no STRIPE_SECRET_KEY)", () => {
  it("createCustomer returns a stub customer ID", async () => {
    const id = await stripePayment.createCustomer({
      memberId: "m1",
      name: "Alice",
      email: "alice@example.com",
    });
    expect(id).toMatch(/^stub_cus_/);
  });

  it("createCustomer returns deterministic ID for the same email", async () => {
    const id1 = await stripePayment.createCustomer({ memberId: "m1", name: "Alice", email: "same@example.com" });
    const id2 = await stripePayment.createCustomer({ memberId: "m2", name: "Alice", email: "same@example.com" });
    expect(id1).toBe(id2);
  });

  it("createSubscription returns stub subscription and item IDs", async () => {
    const result = await stripePayment.createSubscription({
      customerId: "stub_cus_test",
      unitAmount: 30000,
      currency: "usd",
      description: "Studio 1",
    });
    expect(result.subscriptionId).toMatch(/^stub_sub_/);
    expect(result.subscriptionItemId).toMatch(/^stub_si_/);
  });

  it("cancelSubscription resolves without throwing", async () => {
    await expect(
      stripePayment.cancelSubscription("stub_sub_123"),
    ).resolves.toBeUndefined();
  });

  it("createPaymentIntent returns stub intent ID and client secret", async () => {
    const result = await stripePayment.createPaymentIntent({
      customerId: "stub_cus_test",
      amount: 2500,
      currency: "usd",
      description: "Day pass",
    });
    expect(result.paymentIntentId).toMatch(/^stub_pi_/);
    expect(result.clientSecret).toContain("_secret_stub");
  });

  it("constructEvent parses a raw subscription.created body when unconfigured", () => {
    const raw = JSON.stringify({
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_456",
          status: "active",
          items: { data: [{ id: "si_789" }] },
        },
      },
    });
    const event = stripePayment.constructEvent(raw, "sig_ignored");
    expect(event.type).toBe("subscription.created");
    if (event.type === "subscription.created") {
      expect(event.subscriptionId).toBe("sub_123");
      expect(event.customerId).toBe("cus_456");
    }
  });

  it("constructEvent returns unhandled for unknown event types", () => {
    const raw = JSON.stringify({ type: "some.unknown.event", data: { object: {} } });
    const event = stripePayment.constructEvent(raw, "sig_ignored");
    expect(event.type).toBe("unhandled");
  });

  it("constructEvent returns unhandled on malformed JSON", () => {
    const event = stripePayment.constructEvent("not-json", "sig_ignored");
    expect(event.type).toBe("unhandled");
  });
});
