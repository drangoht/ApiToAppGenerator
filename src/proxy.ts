import { auth } from "@/auth"
import { NextResponse } from 'next/server'

export default auth((req) => {
    const url = req.nextUrl.clone();
    const pathname = url.pathname;

    // ── 1. Direct preview proxy ─────────────────────────────────────────────
    // Matches: /preview/:port/:projectId[/rest...]
    const match = pathname.match(/^\/preview\/(\d{4,5})\/[a-zA-Z0-9_-]+(.*)$/);
    if (match) {
        const port = match[1];
        const proxyUrl = `http://127.0.0.1:${port}${pathname}${url.search}`;

        const requestHeaders = new Headers(req.headers);
        // Spoof Origin & Host so Next.js dev server accepts cross-origin WebSocket upgrades
        requestHeaders.set('Origin', `http://127.0.0.1:${port}`);
        requestHeaders.set('Host', `127.0.0.1:${port}`);
        // Next.js 15+ validates Referer against Origin — delete it so there's no mismatch → 403
        requestHeaders.delete('referer');
        requestHeaders.delete('x-forwarded-host');
        requestHeaders.delete('x-forwarded-proto');
        requestHeaders.delete('forwarded');

        return NextResponse.rewrite(proxyUrl, { request: { headers: requestHeaders } });
    }

    // ── 2. Turbopack / HMR chunk proxy ──────────────────────────────────────
    // Turbopack generates /_next/… chunk URLs that do NOT include the basePath prefix.
    // These requests arrive at AppForge directly (no /preview/:port/ in path).
    // We detect them via the Referer header which DOES contain the port.
    //
    // Example: Referer = https://appforge.thognard.net/preview/3100/abc123
    //          Request  = /_next/[turbopack]_dev_client_38d.js   → 403 ❌
    //          Fix      = proxy to http://127.0.0.1:3100/_next/[turbopack]_dev_client_38d.js ✅
    if (pathname.startsWith('/_next/')) {
        const referer = req.headers.get('referer') || '';
        const refMatch = referer.match(/\/preview\/(\d{4,5})\/[a-zA-Z0-9_-]+/);
        if (refMatch) {
            const port = refMatch[1];
            const proxyUrl = `http://127.0.0.1:${port}${pathname}${url.search}`;

            const requestHeaders = new Headers(req.headers);
            requestHeaders.set('Origin', `http://127.0.0.1:${port}`);
            requestHeaders.set('Host', `127.0.0.1:${port}`);
            // Delete Referer so Next.js 15+ doesn't see the external host and block with 403
            requestHeaders.delete('referer');
            requestHeaders.delete('x-forwarded-host');
            requestHeaders.delete('x-forwarded-proto');
            requestHeaders.delete('forwarded');

            return NextResponse.rewrite(proxyUrl, { request: { headers: requestHeaders } });
        }
    }

    // ── 3. Authentication Guards ─────────────────────────────────────────────
    const isLoggedIn = !!req.auth
    const isOnDashboard = pathname.startsWith('/dashboard')
    if (isOnDashboard) {
        if (!isLoggedIn) return NextResponse.redirect(new URL('/login', req.nextUrl))
    }
    return NextResponse.next()
})

export const config = {
    // Include /_next/ so Turbopack chunks from preview iframes can be intercepted.
    // Exclude _next/static and _next/image only when no Referer from preview present
    // (those cases are handled by Next.js's own static file server directly).
    matcher: ["/((?!api/preview-status|share|api|favicon.ico).*)"],
}
