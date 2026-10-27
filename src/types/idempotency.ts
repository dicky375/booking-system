export interface IdempotencyRecord {
  key: string;
  endpoint: string;
  request_fingerprint: string | null;
  response_body: unknown | null;
  response_status: number | null;
  state: 'IN_FLIGHT' | 'COMPLETED' | 'FAILED';
  created_at: Date;
  expires_at: Date;
}

export interface IdempotencyOptions {
  /**
   * How long to remember a key. Default: 24 hours.
   * After this, the same key can be reused for a fresh request.
   */
  ttlSeconds?: number;

  /**
   * Header name to read the idempotency key from.
   * Default: 'Idempotency-Key'.
   */
  headerName?: string;

  /**
   * Whether to include the endpoint name in the uniqueness check.
   * Set true (default) so keys are scoped per endpoint.
   */
  scopeByEndpoint?: boolean;

  /**
   * Called when a stored response is replayed. Useful for logging.
   */
  onReplay?: (key: string, status: number) => void;

  /**
   * Called when a request with the same key is already in flight.
   */
  onConflict?: (key: string) => void;
}