import { describe, it, expect, beforeAll } from 'vitest';
import { buildCanonicalBytes, toHex } from './canonical';
import { buildUrl, signedPath } from '../api/client';

// Query-string signing interop guard.
//
// The browser signs the path the server canonicalizes over (`path_and_query`)
// and sends the SAME URL. `signedPath()` derives `pathname + search` from the
// resolved request URL, and that exact string is both what we sign and the path
// portion of what we fetch. If a future change ever hand-built a query that
// encoded differently from what is actually sent (instead of going through
// `buildUrl` / `URLSearchParams`), the signed bytes would cover one string while
// the wire carried another — a self-inflicted 401 the golden vector alone would
// not catch (it has no query). This test locks the round-trip invariant:
//   signed path  ===  sent path  ===  the string the canonical bytes cover.
//
// `signedPath()` resolves relative URLs against `window.location.origin`, so we
// provide a minimal window shim (these tests run in Node, no DOM environment).
beforeAll(() => {
  if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
    (globalThis as { window: unknown }).window = {
      location: { origin: 'http://localhost' },
    };
  }
});

describe('query-string signing round-trip', () => {
  it('signs the exact pathname+search that is sent (with a query)', () => {
    // Build the request exactly the way the API client does for
    // `getBoard(token, ['Todo','Running'])`: a `query` object run through
    // `buildUrl` (which uses URLSearchParams), NOT a hand-concatenated string.
    const path = '/board';
    const query = { states: ['Todo', 'Running'].join(',') };

    // 1. The URL the client would actually fetch.
    const sentUrl = buildUrl(path, query);
    expect(sentUrl).toBe('/api/board?states=Todo%2CRunning');

    // 2. The path the client signs over (its real signedPath logic).
    const signed = signedPath(sentUrl);

    // 3. The path portion the wire actually carries (parse the sent URL the same
    //    way the browser/server would). This is the "sent" side of the invariant.
    const sentPath =
      ((u) => u.pathname + u.search)(new URL(sentUrl, 'http://localhost'));

    // Core invariant: signed string === sent string (no strip / re-encode drift).
    expect(signed).toBe(sentPath);
    expect(signed).toBe('/api/board?states=Todo%2CRunning');

    // And the canonical bytes that get signed are produced over that EXACT
    // string — so the integrity-protected query is covered verbatim.
    const bodySha256 = new Uint8Array(32); // empty-body GET (sha256 of "")
    const overSigned = buildCanonicalBytes({
      method: 'GET',
      path: signed,
      bodySha256,
      clientId: 'abc',
      timestamp: 1700000000,
      nonce: 'n1',
    });
    const overSent = buildCanonicalBytes({
      method: 'GET',
      path: sentPath,
      bodySha256,
      clientId: 'abc',
      timestamp: 1700000000,
      nonce: 'n1',
    });
    expect(toHex(overSigned)).toBe(toHex(overSent));

    // Guard against a silent strip/re-encode: the signed path MUST still contain
    // the encoded query, and the canonical bytes MUST embed it. A change that
    // dropped `?states=...` would fail here.
    expect(signed).toContain('?states=Todo%2CRunning');
    expect(toHex(overSigned)).toContain(
      toHex(new TextEncoder().encode('/api/board?states=Todo%2CRunning')),
    );
  });

  it('round-trips a query without a leading-path query (no query case)', () => {
    // No query → no `?` appended; signed path === sent path === bare path.
    const sentUrl = buildUrl('/board');
    const signed = signedPath(sentUrl);
    const sentPath =
      ((u) => u.pathname + u.search)(new URL(sentUrl, 'http://localhost'));
    expect(signed).toBe(sentPath);
    expect(signed).toBe('/api/board');
  });
});
