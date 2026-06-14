import { describe, it, expect } from 'vitest';
import { buildCanonicalBytes, toHex } from './canonical';

// Golden interop vector. This MUST stay byte-for-byte identical to the Rust
// server's canonicalizer (wyrtloom-clientauth-tofu). If this test fails, the
// browser's signatures will be rejected by the server.
describe('buildCanonicalBytes', () => {
  it('matches the golden interop vector', () => {
    const bodySha256 = new Uint8Array(32).fill(0xab);
    const bytes = buildCanonicalBytes({
      method: 'POST',
      path: '/api/login',
      bodySha256,
      clientId: 'abc',
      timestamp: 1700000000,
      nonce: 'n1',
    });

    const expected =
      '0000000000000017' + // len(domain) = 23
      '777972746c6f6f6d2d636c69656e742d617574682d7631' + // "wyrtloom-client-auth-v1"
      '0000000000000004' + // len(method) = 4
      '504f5354' + // "POST"
      '000000000000000a' + // len(path) = 10
      '2f6170692f6c6f67696e' + // "/api/login"
      '0000000000000020' + // len(body_sha256) = 32
      'abababababababababababababababababababababababababababababababab' +
      '0000000000000003' + // len(client_id) = 3
      '616263' + // "abc"
      '0000000000000008' + // len(timestamp bytes) = 8
      '000000006553f100' + // 1700000000 as i64 BE
      '0000000000000002' + // len(nonce) = 2
      '6e31'; // "n1"

    expect(toHex(bytes)).toBe(expected);
  });

  it('rejects a body hash that is not 32 bytes', () => {
    expect(() =>
      buildCanonicalBytes({
        method: 'GET',
        path: '/api/board',
        bodySha256: new Uint8Array(31),
        clientId: 'abc',
        timestamp: 1,
        nonce: 'x',
      }),
    ).toThrow();
  });
});
