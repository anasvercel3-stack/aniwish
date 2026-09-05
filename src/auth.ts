/**
 * HMAC-SHA-256 signed tokens for protecting source endpoints.
 *
 * Token format: `${issuedAtSeconds}.${hmacHex}`
 * TTL: 5 minutes.  The /v1/proxy endpoint is intentionally left open because
 * hls.js cannot inject Authorization headers onto HLS segment requests.
 */

const TOKEN_TTL = 5 * 60; // seconds

// ─── Internal helpers ──────────────────────────────────────────────────────

async function importKey(secret: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify'],
    );
}

function bufToHex(buf: ArrayBuffer): string {
    return Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

// Constant-time string comparison — avoids timing leaks when comparing HMACs.
function safeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Issue a new signed token valid for TOKEN_TTL seconds. */
export async function createToken(secret: string): Promise<{ token: string; expiresAt: string }> {
    const ts = Math.floor(Date.now() / 1000).toString();
    const key = await importKey(secret);
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts));
    const token = `${ts}.${bufToHex(sig)}`;
    const expiresAt = new Date((parseInt(ts, 10) + TOKEN_TTL) * 1000).toISOString();
    return { token, expiresAt };
}

/**
 * Verify a token.
 * Returns false if the signature is wrong, the token is expired, or the format is invalid.
 * When TOKEN_SECRET is not configured the function always returns true (dev/preview mode).
 */
export async function verifyToken(secret: string | undefined, token: string): Promise<boolean> {
    if (!secret) return true; // dev mode — no secret configured

    const dot = token.indexOf('.');
    if (dot === -1) return false;

    const ts = token.slice(0, dot);
    const providedSig = token.slice(dot + 1);

    const issued = parseInt(ts, 10);
    if (isNaN(issued)) return false;

    const now = Math.floor(Date.now() / 1000);
    // Reject expired tokens and tokens issued more than 30 s in the future
    if (now - issued > TOKEN_TTL || issued > now + 30) return false;

    const key = await importKey(secret);
    const expectedSig = bufToHex(
        await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ts)),
    );

    return safeEqual(providedSig, expectedSig);
}
