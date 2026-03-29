import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' trusts scripts loaded by the nonced entry script (Next.js lazy chunks)
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // 'unsafe-inline' needed for inline style= attributes (used heavily in booking calendar)
    `style-src 'self' 'unsafe-inline'`,
    // next/font/google self-hosts at build time → served from 'self'
    `font-src 'self'`,
    // data: for SVG data URIs; no external images in use
    `img-src 'self' data:`,
    // Only calls its own API routes
    `connect-src 'self'`,
    // No iframes, no plugins
    `frame-ancestors 'none'`,
    `object-src 'none'`,
    // Restrict form submissions and base tag injection
    `form-action 'self'`,
    `base-uri 'self'`,
  ].join("; ");

  // Pass nonce to server components via request header
  // Next.js App Router reads x-nonce automatically and applies it to its
  // own inline streaming scripts
  const requestHeaders = new Headers(request.headers);
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
     * Match all request paths except:
     * - _next/static  (static assets — no CSP header needed, also breaks nonce)
     * - _next/image   (image optimisation)
     * - favicon.ico
     */
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
  ],
};
