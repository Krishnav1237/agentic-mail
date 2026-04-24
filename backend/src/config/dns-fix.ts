/**
 * DNS resolution fix for Windows + Docker Desktop environments.
 *
 * Problem: Docker Desktop installs a local DNS proxy at 127.0.0.1 that
 * becomes the default resolver for Node's `dns.lookup()` (which uses the
 * C-library `getaddrinfo`). This proxy cannot resolve hostnames that only
 * have AAAA (IPv6) records — like Supabase's direct-connection host —
 * causing `ENOTFOUND` even though `nslookup` (which queries 8.8.8.8
 * directly) works fine.
 *
 * Fix: We monkey-patch `dns.lookup` so that when the system resolver
 * fails, we fall back to Google Public DNS via Node's `dns.Resolver`
 * (which does its own UDP queries and bypasses `getaddrinfo` entirely).
 *
 * This file MUST be imported at the very top of the entry-point
 * (`server.ts`) before any module triggers a network connection.
 */

import dns from 'node:dns';

const fallbackResolver = new dns.Resolver();
fallbackResolver.setServers(['8.8.8.8', '8.8.4.4']);

const originalLookup = dns.lookup.bind(dns);

/**
 * Gather all available IPs (A + AAAA) for a hostname via the fallback
 * resolver and invoke the callback in the shape `dns.lookup` expects
 * depending on the `all` option.
 */
function resolveViaFallback(
  hostname: string,
  all: boolean,
  originalError: NodeJS.ErrnoException,
  callback: (...args: unknown[]) => void,
): void {
  const collected: { address: string; family: number }[] = [];

  fallbackResolver.resolve4(hostname, (_err4, addrs4) => {
    if (addrs4 && addrs4.length > 0) {
      for (const a of addrs4) collected.push({ address: a, family: 4 });
    }

    fallbackResolver.resolve6(hostname, (_err6, addrs6) => {
      if (addrs6 && addrs6.length > 0) {
        for (const a of addrs6) collected.push({ address: a, family: 6 });
      }

      if (collected.length === 0) {
        // Nothing found — propagate the original system error.
        return callback(originalError);
      }

      if (all) {
        // `dns.lookup` with `all: true` expects (err, [{address, family}])
        return callback(null, collected);
      }

      // Single-result mode — return the first entry.
      return callback(null, collected[0].address, collected[0].family);
    });
  });
}

function patchedLookup(hostname: string, optionsOrCb: unknown, maybeCallback?: unknown): void {
  const callback: (...args: unknown[]) => void =
    typeof optionsOrCb === 'function'
      ? (optionsOrCb as (...args: unknown[]) => void)
      : (maybeCallback as (...args: unknown[]) => void);

  const options: dns.LookupOptions =
    typeof optionsOrCb === 'function'
      ? {}
      : ((optionsOrCb as dns.LookupOptions) || {});

  const wantsAll = !!options.all;

  // Try the normal system resolver first.
  originalLookup(hostname, options, (...args: unknown[]) => {
    const err = args[0] as NodeJS.ErrnoException | null;
    if (!err) {
      // System resolver succeeded — pass through as-is.
      return callback(...args);
    }

    // System resolver failed — fall back to Google Public DNS.
    resolveViaFallback(hostname, wantsAll, err, callback);
  });
}

// Apply the patch globally so every module (pg, ioredis, etc.) benefits.
(dns as any).lookup = patchedLookup;

// Also tell Node to return addresses in the order DNS gives them
// (instead of always preferring IPv4), so IPv6-only hosts work.
dns.setDefaultResultOrder('verbatim');
