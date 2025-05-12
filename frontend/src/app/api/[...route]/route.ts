import { NextRequest, NextResponse } from 'next/server';

// Backend API URL (configured to match local dev server)
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

// Handler for all API routes
export async function GET(
  request: NextRequest,
  context: { params: { route: string[] } }
) {
  // Await the entire params object before accessing its properties
  const params = await context.params;
  const route = params.route.join('/');
  const url = new URL(request.url);
  const apiUrl = `${API_BASE_URL}/api/${route}${url.search}`;

  // Forward headers from the request
  const headers = new Headers(request.headers);

  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers,
    });

    const data = await response.json();
    
    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error(`Error proxying GET request to ${apiUrl}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch data from API' },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: { route: string[] } }
) {
  // Await the entire params object before accessing its properties
  const params = await context.params;
  const route = params.route.join('/');
  const apiUrl = `${API_BASE_URL}/api/${route}`;
  
  // Forward headers from the request
  const headers = new Headers(request.headers);
  
  try {
    const body = await request.json();
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data = await response.json();
    
    return NextResponse.json(data, {
      status: response.status,
    });
  } catch (error) {
    console.error(`Error proxying POST request to ${apiUrl}:`, error);
    return NextResponse.json(
      { error: 'Failed to submit data to API' },
      { status: 500 }
    );
  }
} 