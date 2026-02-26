import { auth } from "@/auth"
import { NextResponse } from 'next/server'

export default auth((req) => {
    const url = req.nextUrl.clone();
    const pathname = url.pathname;

    // Handle Sandboxed Reverse Proxy Tunnels
    const match = pathname.match(/^\/preview\/(\d{4,5})\/[a-zA-Z0-9_-]+(.*)$/);
    if (match) {
        const port = match[1];
        const proxyUrl = `http://127.0.0.1:${port}${pathname}${url.search}`;

        const requestHeaders = new Headers(req.headers);

        // CRITICAL: Next.js dev server WebSocket natively rejects cross-origin connections
        // We MUST deceive the sandboxed Next.js into accepting the proxy tunnel HTTP upgrades
        // We set the Origin and Host headers to pretend the traffic originated strictly from the sandbox's own local loopback.
        requestHeaders.set('Origin', `http://127.0.0.1:${port}`);
        requestHeaders.set('Host', `127.0.0.1:${port}`);

        // Pass X-Forwarded headers so Next.js still knows the original client ip/proto if needed
        requestHeaders.set('x-forwarded-host', req.headers.get('host') || '');
        requestHeaders.set('x-forwarded-proto', req.headers.get('x-forwarded-proto') || 'https');

        return NextResponse.rewrite(proxyUrl, {
            request: {
                headers: requestHeaders
            }
        });
    }

    // Handle Authentication Guards
    const isLoggedIn = !!req.auth
    const isOnDashboard = pathname.startsWith('/dashboard')
    if (isOnDashboard) {
        if (!isLoggedIn) return NextResponse.redirect(new URL('/login', req.nextUrl))
    }
    return NextResponse.next()
})

export const config = {
    matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
}
