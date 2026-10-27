import * as crypto from 'crypto';

const SECRET = process.env.PAYSTACK_SECRET_KEY ?? '';
const MODE = process.env.PAYSTACK_MODE ?? 'mock'; // 'mock' | 'real'

export const isMockMode = MODE === 'mock' || !SECRET;

// ============================================================================
// Initialize
// ============================================================================

export interface InitializeParams {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface InitializeResponse {
  authorizationUrl: string;
  reference: string;
  accessCode?: string;
}

export async function initializeTransaction(
  params: InitializeParams,
): Promise<InitializeResponse> {
  if (isMockMode) {
    return {
      authorizationUrl: `https://mock-paystack.local/checkout/${params.reference}`,
      reference: params.reference,
      accessCode: 'mock_access_code',
    };
  }

  // Real Paystack call
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SECRET}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email: params.email,
      amount: params.amountKobo,
      reference: params.reference,
      callback_url: params.callbackUrl,
      metadata: params.metadata,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Paystack initialize failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    status: boolean;
    data: { authorization_url: string; reference: string; access_code: string };
  };

  if (!json.status) throw new Error('Paystack initialize returned status=false');

  return {
    authorizationUrl: json.data.authorization_url,
    reference: json.data.reference,
    accessCode: json.data.access_code,
  };
}

// ============================================================================
// Verify
// ============================================================================

export interface VerifyResponse {
  status: 'success' | 'failed' | 'pending';
  amountKobo: number;
  reference: string;
  raw: unknown;
}

export async function verifyTransaction(
  reference: string,
): Promise<VerifyResponse> {
  if (isMockMode) {
    // In mock mode, a reference that contains "fail" simulates failure.
    const failed = reference.includes('fail');
    return {
      status: failed ? 'failed' : 'success',
      amountKobo: 0, // populated by caller from DB; mock doesn't need it
      reference,
      raw: { mock: true, reference, failed },
    };
  }

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${SECRET}` },
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Paystack verify failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as {
    status: boolean;
    data: { status: string; amount: number; reference: string };
  };

  if (!json.status) throw new Error('Paystack verify returned status=false');

  const mapped: 'success' | 'failed' | 'pending' =
    json.data.status === 'success'
      ? 'success'
      : json.data.status === 'failed'
        ? 'failed'
        : 'pending';

  return {
    status: mapped,
    amountKobo: json.data.amount,
    reference: json.data.reference,
    raw: json.data,
  };
}

// ============================================================================
// Webhook signature
// ============================================================================

/**
 * Verify the x-paystack-signature header.
 * Paystack uses HMAC-SHA512 over the RAW request body, keyed with your secret key.
 * Do NOT JSON.parse the body before verifying — it must be the exact bytes.
 */
export function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined,
): boolean {
  if (!signature) return false;

  // In mock mode, accept a well-known test signature.
  if (isMockMode) {
    return signature === 'mock-signature';
  }

  if (!SECRET) return false;

  const expected = crypto
    .createHmac('sha512', SECRET)
    .update(rawBody)
    .digest('hex');

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');

  return a.length === b.length && crypto.timingSafeEqual(a, b);
}