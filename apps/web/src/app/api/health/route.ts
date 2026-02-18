import { NextResponse } from 'next/server';

export async function GET() {
  const mem = process.memoryUsage();
  return NextResponse.json({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024),
      heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
    version: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown',
  });
}
