import { NextResponse } from 'next/server';
import { readFileSync, statSync, existsSync } from 'fs';
import { join } from 'path';

export const dynamic = 'force-dynamic';

/**
 * Diagnostic endpoint — returns the *actual* runtime state of the installation
 * so users can tell whether a fresh installer was loaded or an old node.exe
 * is still serving stale files. Bypasses cached JS chunks entirely.
 *
 * Open: http://localhost:5666/timetracker/api/diagnostic
 *
 * Red flags:
 * - packageVersion !== envVersion  → server runs old build, package.json is new
 * - serverBootAt older than installer run → process never restarted
 * - buildMtime older than expected → installer didn't replace .next/
 */
export async function GET() {
  const cwd = process.cwd();

  // package.json from disk (NOT env var) — survives cached JS chunks
  let packageVersion: string | null = null;
  try {
    const pkgPath = join(cwd, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    packageVersion = pkg.version ?? null;
  } catch {
    packageVersion = null;
  }

  // BUILD_ID — proves which build is running on disk
  let buildId: string | null = null;
  let buildMtime: string | null = null;
  try {
    const buildIdPath = join(cwd, '.next', 'BUILD_ID');
    if (existsSync(buildIdPath)) {
      buildId = readFileSync(buildIdPath, 'utf8').trim();
      buildMtime = statSync(buildIdPath).mtime.toISOString();
    }
  } catch {
    // ignore
  }

  const uptimeSeconds = Math.floor(process.uptime());
  const serverBootAt = new Date(Date.now() - uptimeSeconds * 1000).toISOString();

  return NextResponse.json({
    packageVersion,
    envVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? null,
    buildId,
    buildMtime,
    serverBootAt,
    uptimeSeconds,
    pid: process.pid,
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version,
    cwd,
    checkedAt: new Date().toISOString(),
  });
}
