import { NextRequest, NextResponse } from 'next/server';

// Helper function to add CORS headers to any response
function addCorsHeaders(headers: Headers): Headers {
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  headers.set('Access-Control-Allow-Headers', '*');
  return headers;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference_id: string }> | { reference_id: string } }
) {
  // Handle both Promise and direct params for Next.js compatibility
  const resolvedParams = params instanceof Promise ? await params : params;
  const { reference_id } = resolvedParams;
  const waczUrl = `https://perma-ws.storage.nami.cloud/${reference_id}/${reference_id}.wacz`;

  // Get Range header from the request
  const rangeHeader = request.headers.get('range');
  console.log(`[Proxy] Fetching WACZ file for ${reference_id} from: ${waczUrl}${rangeHeader ? ` (Range: ${rangeHeader})` : ''}`);

  try {
    // Build fetch options with Range header if present
    const fetchOptions: RequestInit = {};
    if (rangeHeader) {
      fetchOptions.headers = {
        'Range': rangeHeader,
      };
    }

    const response = await fetch(waczUrl, fetchOptions);
    console.log(`[Proxy] Response status: ${response.status}, Content-Length: ${response.headers.get('content-length')}, Content-Range: ${response.headers.get('content-range')}`);

    if (!response.ok && response.status !== 206) {
      const errorHeaders = addCorsHeaders(new Headers());
      return NextResponse.json(
        { error: `Failed to fetch WACZ file: ${response.status}` },
        { status: response.status, headers: errorHeaders }
      );
    }

    // Get the file content (this will be partial if Range was requested)
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get headers from original response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');
    const contentRange = response.headers.get('content-range');
    const acceptRanges = response.headers.get('accept-ranges') || 'bytes';

    // Create response with CORS headers
    const headers = addCorsHeaders(new Headers());
    headers.set('Content-Type', contentType);
    headers.set('Accept-Ranges', acceptRanges);
    
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }
    
    if (contentRange) {
      headers.set('Content-Range', contentRange);
    }

    // Return 206 Partial Content for range requests, 200 for full requests
    const status = response.status === 206 ? 206 : 200;
    
    console.log(`[Proxy] Successfully proxied WACZ file for ${reference_id}, status: ${status}, size: ${buffer.length} bytes`);
    return new NextResponse(buffer, {
      status,
      headers,
    });
  } catch (error) {
    console.error(`[Proxy] Error proxying WACZ file for ${reference_id}:`, error);
    const errorHeaders = addCorsHeaders(new Headers());
    return NextResponse.json(
      { error: 'Failed to proxy WACZ file' },
      { status: 500, headers: errorHeaders }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}

