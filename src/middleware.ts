import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
    // Expected format: /preview/{port}/{projectId}/...
    const url = request.nextUrl.clone();
    const pathname = url.pathname;

    const match = pathname.match(/^\/preview\/(\d{4,5})\/[a-zA-Z0-9_-]+(.*)$/);

    if (match) {
        const port = match[1];
        const remainingPath = match[2] || '/';

        // Rewrite the request to the internal docker localhost port
        // Make sure to preserve the entire basePath structure so Next.js assets map correctly
        const proxyUrl = `http://127.0.0.1:${port}${pathname}${url.search}`;

        return NextResponse.rewrite(proxyUrl);
    }

    return NextResponse.next();
}

export const config = {
    // Only run middleware on preview routes
    matcher: ['/preview/:path*'],
}
