// Canonical request encoder for wyrtloom client-auth v1.
//
// MUST match the Rust server byte-for-byte. The server builds a length-prefixed
// message: a leading domain tag, then each field in a fixed order, where EVERY
// field (including the domain tag) is written as an 8-byte big-endian unsigned
// length followed by its raw bytes. The resulting bytes are what gets signed
// with the client's ECDSA P-256 key.
//
// Field order (after the domain tag):
//   1. method        — UTF-8 (e.g. "POST", "GET")
//   2. path          — UTF-8, path only, NO query string
//   3. body_sha256   — 32 raw bytes (SHA-256 of the request body bytes)
//   4. client_id     — UTF-8
//   5. timestamp     — i64 Unix seconds as 8 bytes big-endian two's-complement
//   6. nonce         — UTF-8

/** ASCII domain tag prefixed to every canonical message. */
export const DOMAIN_TAG = 'wyrtloom-client-auth-v1';

const textEncoder = new TextEncoder();

/**
 * Inputs to the canonical encoder. `bodySha256` is the raw 32-byte SHA-256 of
 * the request body; `timestamp` is the i64 Unix-seconds value.
 */
export interface CanonicalInput {
  method: string;
  path: string;
  bodySha256: Uint8Array;
  clientId: string;
  timestamp: number;
  nonce: string;
}

/**
 * Build the canonical request bytes that get signed. Pure function — no crypto,
 * no I/O — so it can be unit-tested against the golden interop vector.
 */
export function buildCanonicalBytes(input: CanonicalInput): Uint8Array {
  const domain = textEncoder.encode(DOMAIN_TAG);
  const method = textEncoder.encode(input.method);
  const path = textEncoder.encode(input.path);
  const clientId = textEncoder.encode(input.clientId);
  const nonce = textEncoder.encode(input.nonce);

  if (input.bodySha256.length !== 32) {
    throw new Error('bodySha256 must be exactly 32 bytes');
  }

  // timestamp as 8 bytes big-endian two's-complement (i64).
  const tsBytes = new Uint8Array(8);
  new DataView(tsBytes.buffer).setBigInt64(0, BigInt(input.timestamp), false);

  const fields: Uint8Array[] = [
    domain,
    method,
    path,
    input.bodySha256,
    clientId,
    tsBytes,
    nonce,
  ];

  // Total length: each field contributes an 8-byte length prefix + its bytes.
  let total = 0;
  for (const f of fields) total += 8 + f.length;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;
  for (const f of fields) {
    view.setBigUint64(offset, BigInt(f.length), false);
    offset += 8;
    out.set(f, offset);
    offset += f.length;
  }
  return out;
}

/** Lowercase hex encoding of a byte array. */
export function toHex(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
}
