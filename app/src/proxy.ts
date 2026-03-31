import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Short-lived cache so we don't hit the DB on every request.
// TTL is intentionally short: once the flag clears (after reset), the user
// should be unblocked within RESET_TTL_MS at most.
const _resetCache = new Map<string, { needs: boolean; exp: number }>();
const RESET_TTL_MS = 30_000;

async function needsPasswordReset(userId: string): Promise<boolean> {
  const cached = _resetCache.get(userId);
  if (cached && cached.exp > Date.now()) return cached.needs;
  const member = await prisma.member.findUnique({
    where:  { id: userId },
    select: { requiresPasswordReset: true },
  });
  const needs = member?.requiresPasswordReset ?? false;
  _resetCache.set(userId, { needs, exp: Date.now() + RESET_TTL_MS });
  return needs;
}

// proxy.ts (Next.js 16) — runs on Node.js runtime, so auth/Prisma imports are safe.
export async function proxy(req: NextRequest) {
  // Generate a per-request nonce for Content-Security-Policy
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' trusts scripts loaded by the nonced entry script (Next.js lazy chunks)
    // 'unsafe-eval' only in dev — React uses eval() for stack trace reconstruction
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
    // 'unsafe-inline' needed for inline style= attributes (booking calendar positioning)
    `style-src 'self' 'unsafe-inline'`,
    // next/font/google self-hosts at build time → served from 'self'
    `font-src 'self'`,
    `img-src 'self' data:`,
    `connect-src 'self'`,
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
  ].join("; ");

  // Auth check for protected routes
  const isProtected = req.nextUrl.pathname.startsWith("/portal") ||
                      req.nextUrl.pathname.startsWith("/admin");

  if (isProtected) {
    const session = await auth();
    if (!session?.user) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
      return NextResponse.redirect(loginUrl);
    }
    // If the user must reset their password, gate everything except the reset page itself
    if (req.nextUrl.pathname !== "/reset-password") {
      const needs = await needsPasswordReset(session.user.id);
      if (needs) return NextResponse.redirect(new URL("/reset-password", req.url));
    }
  }

  // Pass nonce to server components; Next.js reads x-nonce for its own inline scripts
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all paths except static assets (they don't need CSP headers and
     * nonce generation would be wasteful / break caching)
     */
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
