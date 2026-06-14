// Browser client-auth identity for the wyrtloom API.
//
// The SPA is a real signing client. It holds a NON-EXTRACTABLE WebCrypto ECDSA
// P-256 keypair: even XSS can ask the browser to sign with it, but the raw
// private bytes can never be read back out (`extractable: false`). The keypair
// and the server-assigned `client_id` are persisted in IndexedDB so the client
// identity survives reloads. Non-extractable CryptoKeys are structured-cloneable
// and storable in IndexedDB; that is exactly the property we rely on.
//
// Two flows:
//   1. enroll()      — first run: generate a keypair, export the public key, and
//                      POST /api/enroll with an operator-provided bootstrap key.
//                      The enroll request itself is NOT signed.
//   2. signRequest() — every subsequent request: build the canonical bytes and
//                      sign them, returning the four x-wyrtloom-* header values.

import { buildCanonicalBytes, toHex } from './canonical';
import { exactBuffer, sha256 } from './sha256';
import { API_BASE, parseError } from '../api/config';

const DB_NAME = 'wyrtloom-clientauth';
const DB_VERSION = 1;
const STORE = 'identity';
const KEY = 'client'; // single record holding the keypair + client_id

interface StoredIdentity {
  clientId: string;
  keyPair: CryptoKeyPair;
}

const KEYGEN_PARAMS: EcKeyGenParams = {
  name: 'ECDSA',
  namedCurve: 'P-256',
};

const SIGN_PARAMS: EcdsaParams = {
  name: 'ECDSA',
  hash: 'SHA-256',
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
}

function idbGet(db: IDBDatabase): Promise<StoredIdentity | undefined> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve(req.result as StoredIdentity | undefined);
    req.onerror = () => reject(req.error ?? new Error('indexedDB get failed'));
  });
}

function idbPut(db: IDBDatabase, value: StoredIdentity): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('indexedDB put failed'));
  });
}

// Cache the loaded identity so we don't reopen IndexedDB on every request.
let cached: StoredIdentity | null = null;

/** Load the persisted client identity, or null if this browser has not enrolled. */
export async function loadIdentity(): Promise<StoredIdentity | null> {
  if (cached) return cached;
  const db = await openDb();
  try {
    const stored = await idbGet(db);
    if (!stored) return null;
    cached = stored;
    return stored;
  } finally {
    db.close();
  }
}

/** True if this browser already has an enrolled client identity. */
export async function hasIdentity(): Promise<boolean> {
  return (await loadIdentity()) !== null;
}

/** Generate a fresh NON-EXTRACTABLE P-256 keypair (private key never leaves the browser). */
async function generateKeyPair(): Promise<CryptoKeyPair> {
  // extractable = false: the private key can sign but its bytes can never be
  // exported. This is the core security property of the browser-as-client design.
  return crypto.subtle.generateKey(KEYGEN_PARAMS, false, ['sign']);
}

/**
 * Export the public key as STANDARD base64 of the 65-byte SEC1 uncompressed
 * point (raw format: 0x04 || X || Y). The public key is intentionally
 * extractable; only the private key is locked down.
 */
async function exportPublicKeyB64(publicKey: CryptoKey): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', publicKey));
  if (raw.length !== 65 || raw[0] !== 0x04) {
    throw new Error('unexpected SEC1 public key encoding');
  }
  let binary = '';
  for (const b of raw) binary += String.fromCharCode(b);
  return btoa(binary);
}

interface EnrollResponse {
  client_id: string;
}

/**
 * First-run enrollment. Generates a non-extractable keypair, exports the public
 * key, and POSTs it to /api/enroll with the operator-provided single-use
 * bootstrap API key. On success, persists { client_id, keyPair } in IndexedDB.
 *
 * The bootstrap key is used here ONCE and never persisted by this app.
 * The enroll request is NOT client-signed (it is how a client first authorizes).
 */
export async function enroll(
  bootstrapApiKey: string,
  clientName: string,
): Promise<void> {
  const keyPair = await generateKeyPair();
  const publicKeyB64 = await exportPublicKeyB64(keyPair.publicKey);

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/enroll`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      credentials: 'same-origin',
      body: JSON.stringify({
        api_key: bootstrapApiKey,
        client_name: clientName,
        public_key_b64: publicKeyB64,
      }),
    });
  } catch {
    throw new Error('network error: could not reach the API to enroll');
  }

  if (!res.ok) {
    throw new Error(`enrollment failed: ${await parseError(res)}`);
  }

  let parsed: EnrollResponse;
  try {
    parsed = (await res.json()) as EnrollResponse;
  } catch {
    throw new Error('enrollment failed: malformed server response');
  }
  if (!parsed || typeof parsed.client_id !== 'string' || !parsed.client_id) {
    throw new Error('enrollment failed: server did not return a client_id');
  }

  const identity: StoredIdentity = { clientId: parsed.client_id, keyPair };
  const db = await openDb();
  try {
    await idbPut(db, identity);
  } finally {
    db.close();
  }
  cached = identity;
}

/** Signature material for the four x-wyrtloom-* request headers. */
export interface SignatureMaterial {
  clientId: string;
  timestamp: string; // decimal Unix seconds
  nonce: string; // fresh per request
  signatureHex: string; // lowercase hex of the 64-byte raw signature
}

/** A fresh random nonce: 16 random bytes, lowercase hex. */
function freshNonce(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

/**
 * Sign a request. Builds the canonical bytes for (method, path, body) using the
 * enrolled identity and a fresh timestamp + nonce, then signs them with the
 * non-extractable private key. `path` is the URL path + query string exactly as
 * sent (the server canonicalizes over path_and_query).
 * `bodyBytes` is the exact request body (empty array for no body).
 */
export async function signRequest(
  method: string,
  path: string,
  bodyBytes: Uint8Array,
): Promise<SignatureMaterial> {
  const identity = await loadIdentity();
  if (!identity) {
    throw new Error('cannot sign request: this client has not enrolled');
  }

  const bodySha256 = await sha256(bodyBytes);
  const timestamp = Math.floor(Date.now() / 1000);
  const nonce = freshNonce();

  const canonical = buildCanonicalBytes({
    method,
    path,
    bodySha256,
    clientId: identity.clientId,
    timestamp,
    nonce,
  });

  const sig = new Uint8Array(
    await crypto.subtle.sign(
      SIGN_PARAMS,
      identity.keyPair.privateKey,
      exactBuffer(canonical),
    ),
  );

  return {
    clientId: identity.clientId,
    timestamp: String(timestamp),
    nonce,
    signatureHex: toHex(sig),
  };
}
