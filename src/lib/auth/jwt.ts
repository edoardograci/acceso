import { SignJWT, jwtVerify } from 'jose';
import type { Env } from '../../env.d';

export async function createSessionJWT(payload: { userId: string; sessionId: string }, env: Env) {
    // NEVER allow production without a secret
    if (!env.JWT_SECRET) {
        if (import.meta.env.PROD) {
            throw new Error('JWT_SECRET must be set in production');
        }
        console.warn('[JWT] Using insecure default secret in development');
    }

    const secret = new TextEncoder().encode(
        env.JWT_SECRET || 'dev-only-secret-do-not-use-in-prod'
    );

    return await new SignJWT(payload)
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(secret);
}

export async function verifySessionJWT(token: string, env: Env) {
    try {
        if (!env.JWT_SECRET && import.meta.env.PROD) {
            return null; // Fail closed in production
        }

        const secret = new TextEncoder().encode(
            env.JWT_SECRET || 'dev-only-secret-do-not-use-in-prod'
        );
        const { payload } = await jwtVerify(token, secret, {
            clockTolerance: 5 // Allow 5 seconds clock skew
        });

        // Additional validation
        if (!payload.userId || !payload.sessionId) {
            return null;
        }

        return payload as { userId: string; sessionId: string };
    } catch (error) {
        // Don't log - this happens naturally on expiry
        return null;
    }
}
