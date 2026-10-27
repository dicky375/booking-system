export type PaymentKind = 'DEPOSIT' | 'BALANCE';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED';

export interface Payment {
  id: string;
  booking_id: string;
  provider: string;
  provider_reference: string;
  kind: PaymentKind;
  amount_kobo: string;        // pg bigint → string
  status: PaymentStatus;
  raw_payload: unknown | null;
  created_at: Date;
  updated_at: Date;
}

export interface InitializeResult {
  authorizationUrl: string;
  reference: string;
  accessCode?: string;
}

export interface VerifyResult {
  status: 'success' | 'failed' | 'pending';
  amountKobo: number;
  reference: string;
  raw: unknown;
}

export interface BookingAmounts {
  totalAmountKobo: number;
  depositAmountKobo: number;
  balanceKobo: number;
}