import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Backend server URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Proxy WebSocket connections
  if (pathname.startsWith('/ws')) {
    // For WebSocket connections, we'll return a rewrite
    // This tells the browser to connect directly to our backend server
    const url = new URL(pathname, API_BASE_URL);
    url.search = request.nextUrl.search;
    
    return NextResponse.rewrite(url);
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/ws/:path*'],
}; 