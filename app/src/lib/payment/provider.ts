import type {
  StripeCustomerId,
  StripeSubscriptionId,
  CreatedSubscription,
  CreatedPaymentIntent,
  PaymentEvent,
} from "./types";

/**
 * PaymentProvider — the stable interface all payment implementations must satisfy.
 * Call sites import from @/lib/payment, never from a specific implementation file.
 */
export interface PaymentProvider {
  /**
   * Create a Stripe customer record for a member.
   * Returns the provider customer ID to store on Member.stripeCustomerId.
   */
  createCustomer(params: {
    memberId: string;
    name: string;
    email: string;
  }): Promise<StripeCustomerId>;

  /**
   * Create a recurring monthly subscription for a rental.
   * unitAmount is in the smallest currency unit (cents for USD).
   * Returns IDs to store on Rental.stripeSubscriptionItemId (and optionally subscriptionId).
   */
  createSubscription(params: {
    customerId: StripeCustomerId;
    /** Amount in cents */
    unitAmount: number;
    currency: string;
    description: string;
    metadata?: Record<string, string>;
  }): Promise<CreatedSubscription>;

  /**
   * Cancel a subscription immediately (does not prorate).
   * Pass the subscriptionId (from Rental.stripeSubscriptionId, if stored)
   * or derive it from the subscriptionItemId via the provider's records.
   */
  cancelSubscription(subscriptionId: StripeSubscriptionId): Promise<void>;

  /**
   * Create a one-time PaymentIntent (e.g. day passes).
   * Returns the PaymentIntent ID and client secret for front-end confirmation.
   */
  createPaymentIntent(params: {
    customerId: StripeCustomerId;
    /** Amount in cents */
    amount: number;
    currency: string;
    description: string;
    metadata?: Record<string, string>;
  }): Promise<CreatedPaymentIntent>;

  /**
   * Verify and parse a raw Stripe webhook payload into a normalised PaymentEvent.
   * Throws WebhookSignatureError if the signature is invalid.
   */
  constructEvent(rawBody: string | Buffer, signature: string): PaymentEvent;

  readonly name: string;
}
