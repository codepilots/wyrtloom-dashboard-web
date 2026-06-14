// SHA-256 of arbitrary bytes via WebCrypto. Used to hash the request body for
// the canonical message (an empty body hashes the zero-length byte string).

/** SHA-256 digest of `bytes`, returned as a 32-byte Uint8Array. */
export async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', exactBuffer(bytes));
  return new Uint8Array(digest);
}

/**
 * Return a plain ArrayBuffer holding exactly `bytes` (no stray trailing bytes
 * from a larger backing buffer, and never a SharedArrayBuffer). Copies into a
 * fresh buffer, which keeps WebCrypto's `BufferSource` typing happy.
 */
export function exactBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return copy.buffer;
}
