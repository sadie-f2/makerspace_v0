/**
 * Payment — public entry point
 *
 * All call sites import from here, never from a specific implementation.
 */

export type {
  StripeCustomerId,
  StripeSubscriptionId,
  StripeSubscriptionItemId,
  StripePaymentIntentId,
  StripePriceId,
  CreatedSubscription,
  CreatedPaymentIntent,
  PaymentEvent,
} from "./types";
export { PaymentError, WebhookSignatureError } from "./types";
export type { PaymentProvider } from "./provider";

import { stripePayment } from "./stripe";

export const payment = stripePayment;
