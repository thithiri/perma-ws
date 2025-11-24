import { NextResponse } from 'next/server';

// ReplayWeb.page tries to load a service worker even when embedded in an iframe.
// This handler provides an empty service worker to suppress the 404 error.
// The service worker isn't needed for basic iframe functionality.
export async function GET() {
  // Return an empty service worker that does nothing
  const swContent = `// Empty service worker for ReplayWeb.page iframe
// This suppresses the 404 error but doesn't actually register anything
self.addEventListener('install', () => {
  self.skipWaiting();
});
self.addEventListener('activate', () => {
  self.clients.claim();
});
`;

  return new NextResponse(swContent, {
    status: 200,
    headers: {
      'Content-Type': 'application/javascript',
      'Service-Worker-Allowed': '/',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}

