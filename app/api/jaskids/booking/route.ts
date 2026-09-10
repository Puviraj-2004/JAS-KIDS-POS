// API route for integrating with JASKIDS booking data.
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ ok: true });
}
