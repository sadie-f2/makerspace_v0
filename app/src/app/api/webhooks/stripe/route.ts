import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { payment, WebhookSignatureError } from "@/lib/payment";
import { notify } from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const rawBody  = Buffer.from(await req.arrayBuffer());
  const signature = req.headers.get("stripe-signature") ?? "";

  let event;
  try {
    event = payment.constructEvent(rawBody, signature);
  } catch (err) {
    if (err instanceof WebhookSignatureError) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
    }
    throw err;
  }

  switch (event.type) {
    case "subscription.updated": {
      // Sync subscription status onto the rental record
      const rental = await prisma.rental.findFirst({
        where: { stripeSubscriptionId: event.subscriptionId, deletedAt: null },
      });
      if (rental) {
        await prisma.rental.update({
          where: { id: rental.id },
          data:  { stripeSubscriptionStatus: event.status },
        });
      }
      break;
    }

    case "subscription.deleted": {
      // Subscription cancelled outside the app — mark rental ended
      const rental = await prisma.rental.findFirst({
        where: { stripeSubscriptionId: event.subscriptionId, deletedAt: null, endDate: null },
      });
      if (rental) {
        await prisma.rental.update({
          where: { id: rental.id },
          data:  { endDate: new Date() },
        });
      }
      break;
    }

    case "invoice.paid": {
      // Find the member by Stripe customer ID and send a receipt
      const member = await prisma.member.findFirst({
        where: { stripeCustomerId: event.customerId },
        select: { name: true, email: true },
      });
      if (member) {
        await notify("payment.receipt", member, {
          amount:      event.amount,
          currency:    event.currency,
          description: event.description,
          paidAt:      event.paidAt,
        });
      }
      break;
    }

    case "invoice.payment_failed": {
      const member = await prisma.member.findFirst({
        where: { stripeCustomerId: event.customerId },
        select: { name: true, email: true },
      });
      if (member) {
        await notify("payment.failed", member, {
          amount:      event.amount,
          currency:    event.currency,
          description: event.description,
        });
      }
      break;
    }

    case "checkout.session.completed": {
      // Day-pass flow: metadata carries { dayPassId }
      const { dayPassId } = event.metadata;
      if (dayPassId && event.paymentIntentId) {
        await prisma.dayPass.update({
          where: { id: dayPassId },
          data:  { stripePaymentIntentId: event.paymentIntentId },
        });
      }
      break;
    }

    case "subscription.created":
    case "unhandled":
    default:
      break;
  }

  return NextResponse.json({ received: true });
}
