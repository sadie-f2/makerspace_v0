import Stripe from "stripe";
import type { PaymentProvider } from "./provider";
import type {
  StripeCustomerId,
  StripeSubscriptionId,
  CreatedSubscription,
  CreatedPaymentIntent,
  PaymentEvent,
} from "./types";
import { PaymentError, WebhookSignatureError } from "./types";

// ── Client ────────────────────────────────────────────────────────────────────

function makeClient(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2026-03-25.dahlia" });
}

// Lazily initialised so missing env vars don't crash at import time
let _client: Stripe | null | undefined;
function client(): Stripe | null {
  if (_client === undefined) _client = makeClient();
  return _client;
}

// ── Event normalisation ───────────────────────────────────────────────────────

function normalise(event: Stripe.Event): PaymentEvent {
  switch (event.type) {
    case "customer.subscription.created": {
      const sub = event.data.object as Stripe.Subscription;
      const item = sub.items.data[0];
      return {
        type:               "subscription.created",
        subscriptionId:     sub.id,
        customerId:         sub.customer as string,
        subscriptionItemId: item?.id ?? "",
        status:             sub.status,
      };
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      return {
        type:           "subscription.updated",
        subscriptionId: sub.id,
        customerId:     sub.customer as string,
        status:         sub.status,
      };
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      return {
        type:           "subscription.deleted",
        subscriptionId: sub.id,
        customerId:     sub.customer as string,
      };
    }
    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice;
      return {
        type:        "invoice.paid",
        invoiceId:   inv.id!,
        customerId:  inv.customer as string,
        amount:      inv.amount_paid,
        currency:    inv.currency,
        description: inv.description ?? (inv as any).lines?.data?.[0]?.description ?? "Payment",
        paidAt:      new Date((inv.status_transitions?.paid_at ?? Math.floor(Date.now() / 1000)) * 1000),
      };
    }
    case "invoice.payment_failed": {
      const inv = event.data.object as Stripe.Invoice;
      return {
        type:        "invoice.payment_failed",
        invoiceId:   inv.id!,
        customerId:  inv.customer as string,
        amount:      inv.amount_due,
        currency:    inv.currency,
        description: inv.description ?? (inv as any).lines?.data?.[0]?.description ?? "Payment",
      };
    }
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      return {
        type:            "checkout.session.completed",
        sessionId:       session.id,
        customerId:      session.customer as string,
        mode:            session.mode,
        paymentIntentId: (session.payment_intent as string | null) ?? undefined,
        metadata:        session.metadata ?? {},
      };
    }
    default:
      return { type: "unhandled", stripeType: event.type };
  }
}

// ── Stub helpers ──────────────────────────────────────────────────────────────

function stubCustomerId(email: string): StripeCustomerId {
  const id = `stub_cus_${Buffer.from(email).toString("base64url").slice(0, 12)}`;
  console.log(`[payment:stripe stub] createCustomer email=${email} → ${id}`);
  return id;
}

// ── Implementation ────────────────────────────────────────────────────────────

export const stripePayment: PaymentProvider = {
  name: "stripe",

  async createCustomer({ memberId, name, email }): Promise<StripeCustomerId> {
    const stripe = client();
    if (!stripe) return stubCustomerId(email);

    try {
      const customer = await stripe.customers.create({
        name,
        email,
        metadata: { memberId },
      });
      return customer.id;
    } catch (err) {
      throw new PaymentError(`Failed to create customer for ${email}`, "createCustomer", err);
    }
  },

  async createSubscription({ customerId, unitAmount, currency, description, metadata }): Promise<CreatedSubscription> {
    const stripe = client();
    if (!stripe) {
      const subId  = `stub_sub_${Date.now()}`;
      const itemId = `stub_si_${Date.now()}`;
      console.log(`[payment:stripe stub] createSubscription customerId=${customerId} amount=${unitAmount} → ${subId}`);
      return { subscriptionId: subId, subscriptionItemId: itemId };
    }

    try {
      // Create a one-off product + price for this rental (each rental has its own rate)
      const product = await stripe.products.create({ name: description });
      const price = await stripe.prices.create({
        product:    product.id,
        currency,
        unit_amount: unitAmount,
        recurring:  { interval: "month" },
      });

      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items:    [{ price: price.id }],
        metadata: metadata ?? {},
      });
      const item = subscription.items.data[0];
      return {
        subscriptionId:     subscription.id,
        subscriptionItemId: item.id,
      };
    } catch (err) {
      throw new PaymentError(
        `Failed to create subscription for customer ${customerId}`,
        "createSubscription",
        err,
      );
    }
  },

  async cancelSubscription(subscriptionId: StripeSubscriptionId): Promise<void> {
    const stripe = client();
    if (!stripe) {
      console.log(`[payment:stripe stub] cancelSubscription subscriptionId=${subscriptionId}`);
      return;
    }

    try {
      await stripe.subscriptions.cancel(subscriptionId);
    } catch (err) {
      throw new PaymentError(
        `Failed to cancel subscription ${subscriptionId}`,
        "cancelSubscription",
        err,
      );
    }
  },

  async createPaymentIntent({ customerId, amount, currency, description, metadata }): Promise<CreatedPaymentIntent> {
    const stripe = client();
    if (!stripe) {
      const id     = `stub_pi_${Date.now()}`;
      const secret = `${id}_secret_stub`;
      console.log(`[payment:stripe stub] createPaymentIntent customerId=${customerId} amount=${amount} → ${id}`);
      return { paymentIntentId: id, clientSecret: secret };
    }

    try {
      const intent = await stripe.paymentIntents.create({
        customer:    customerId,
        amount,
        currency,
        description,
        metadata:    metadata ?? {},
        automatic_payment_methods: { enabled: true },
      });
      return {
        paymentIntentId: intent.id,
        clientSecret:    intent.client_secret!,
      };
    } catch (err) {
      throw new PaymentError(
        `Failed to create payment intent for customer ${customerId}`,
        "createPaymentIntent",
        err,
      );
    }
  },

  constructEvent(rawBody: string | Buffer, signature: string): PaymentEvent {
    const stripe = client();
    const secret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !secret) {
      // In development without Stripe configured, accept a pre-parsed JSON body
      console.warn("[payment:stripe stub] constructEvent called without credentials — parsing raw body directly");
      try {
        const parsed = JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString());
        return normalise(parsed as Stripe.Event);
      } catch {
        return { type: "unhandled", stripeType: "parse_error" };
      }
    }

    try {
      const event = stripe.webhooks.constructEvent(rawBody, signature, secret);
      return normalise(event);
    } catch (err) {
      throw new WebhookSignatureError(err);
    }
  },
};
