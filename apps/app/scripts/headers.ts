/**
 * After `expo export`: adds the full CSP to `dist/_headers` as `Content-Security-Policy-Report-Only`,
 * with the exact Supabase host of this build (ADR-0008, section 17; ADR-0012, section 13, item 1). No
 * wildcard: `*.supabase.co` would let the page talk to anyone's project. It becomes the enforced
 * policy, with `Permissions-Policy`, only after a clean run on the hosted app. The minimal enforced
 * CSP in `public/_headers` stays as it is.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const enforcedLine =
  "  Content-Security-Policy: frame-ancestors 'none'; object-src 'none'; base-uri 'self'";

export function reportOnlyCsp(supabaseUrl: string): string {
  const { origin, protocol } = new URL(supabaseUrl);
  if (protocol !== 'https:' && protocol !== 'http:') {
    throw new Error(`EXPO_PUBLIC_SUPABASE_URL must be http or https, got ${protocol}`);
  }
  const realtime = origin.replace(/^http/, 'ws');
  return [
    "default-src 'self'",
    "script-src 'self'",
    // react-native-web writes styles at run time, and index.html has a <style>.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${origin}`,
    `connect-src 'self' ${origin} ${realtime}`,
    "font-src 'self' data:",
    "worker-src 'self'",
    "manifest-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
  ].join('; ');
}

export function withReportOnlyCsp(headers: string, supabaseUrl: string): string {
  const lines = headers.split(/\r?\n/);
  const at = lines.indexOf(enforcedLine);
  if (at === -1) throw new Error('public/_headers lost its Content-Security-Policy line');
  lines.splice(at + 1, 0, `  Content-Security-Policy-Report-Only: ${reportOnlyCsp(supabaseUrl)}`);
  return lines.join('\n');
}

// Node 24 sets `main` when this file is the one being run; a test that imports it gets undefined.
if ((import.meta as { main?: boolean }).main) {
  const file = new URL('../dist/_headers', import.meta.url);
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!url) {
    // ponytail: report-only enforces nothing, so a build without the URL keeps the minimal CSP.
    console.warn('EXPO_PUBLIC_SUPABASE_URL is not set: dist/_headers keeps only the minimal CSP.');
  } else {
    writeFileSync(file, withReportOnlyCsp(readFileSync(file, 'utf8'), url));
  }
}
