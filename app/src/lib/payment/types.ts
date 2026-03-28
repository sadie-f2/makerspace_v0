// ── Core domain types ─────────────────────────────────────────────────────────

/** Internal ID of a Stripe customer — stored as Member.stripeCustomerId */
export type StripeCustomerId = string;

/** Internal ID of a Stripe subscription item — stored as Rental.stripeSubscriptionItemId */
export type StripeSubscriptionItemId = string;

/** Internal ID of a Stripe subscription */
export type StripeSubscriptionId = string;

/** Internal ID of a Stripe PaymentIntent — stored as DayPass.stripePaymentIntentId */
export type StripePaymentIntentId = string;

/** Internal ID of a Stripe Price */
export type StripePriceId = string;

// ── Subscription result ────────────────────────────────────────────────────────

export interface CreatedSubscription {
  subscriptionId: StripeSubscriptionId;
  subscriptionItemId: StripeSubscriptionItemId;
}

// ── Payment intent result ─────────────────────────────────────────────────────

export interface CreatedPaymentIntent {
  paymentIntentId: StripePaymentIntentId;
  /** Client secret for front-end confirmation via Stripe.js */
  clientSecret: string;
}

// ── Normalised webhook events ─────────────────────────────────────────────────

export type PaymentEvent =
  | {
      type: "subscription.created";
      subscriptionId: StripeSubscriptionId;
      customerId: StripeCustomerId;
      subscriptionItemId: StripeSubscriptionItemId;
      status: string;
    }
  | {
      type: "subscription.updated";
      subscriptionId: StripeSubscriptionId;
      customerId: StripeCustomerId;
      status: string;
    }
  | {
      type: "subscription.deleted";
      subscriptionId: StripeSubscriptionId;
      customerId: StripeCustomerId;
    }
  | {
      type: "invoice.paid";
      invoiceId: string;
      customerId: StripeCustomerId;
      /** Amount in smallest currency unit (cents) */
      amount: number;
      currency: string;
      description: string;
      paidAt: Date;
    }
  | {
      type: "invoice.payment_failed";
      invoiceId: string;
      customerId: StripeCustomerId;
      amount: number;
      currency: string;
      description: string;
    }
  | {
      type: "checkout.session.completed";
      sessionId: string;
      customerId: StripeCustomerId;
      /** "payment" | "subscription" | "setup" */
      mode: string;
      paymentIntentId?: StripePaymentIntentId;
      metadata: Record<string, string>;
    }
  | {
      type: "unhandled";
      /** The raw Stripe event type string, e.g. "customer.created" */
      stripeType: string;
    };

// ── Error ─────────────────────────────────────────────────────────────────────

export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}

export class WebhookSignatureError extends Error {
  constructor(cause?: unknown) {
    super("Webhook signature verification failed");
    this.name = "WebhookSignatureError";
    this.cause = cause;
  }
}
