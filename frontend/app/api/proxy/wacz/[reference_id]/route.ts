import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ reference_id: string }> | { reference_id: string } }
) {
  // Handle both Promise and direct params for Next.js compatibility
  const resolvedParams = params instanceof Promise ? await params : params;
  const { reference_id } = resolvedParams;
  const waczUrl = `https://perma-ws.storage.nami.cloud/${reference_id}/${reference_id}.wacz`;

  console.log(`[Proxy] Fetching WACZ file for ${reference_id} from: ${waczUrl}`);

  try {
    const response = await fetch(waczUrl);
    console.log(`[Proxy] Response status: ${response.status}, Content-Length: ${response.headers.get('content-length')}`);

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch WACZ file: ${response.status}` },
        { status: response.status }
      );
    }

    // Get the file content
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Get content type from original response
    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const contentLength = response.headers.get('content-length');

    // Create response with CORS headers
    const headers = new Headers();
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', '*');
    headers.set('Content-Type', contentType);
    if (contentLength) {
      headers.set('Content-Length', contentLength);
    }

    console.log(`[Proxy] Successfully proxied WACZ file for ${reference_id}, size: ${buffer.length} bytes`);
    return new NextResponse(buffer, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error(`[Proxy] Error proxying WACZ file for ${reference_id}:`, error);
    return NextResponse.json(
      { error: 'Failed to proxy WACZ file' },
      { status: 500 }
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

