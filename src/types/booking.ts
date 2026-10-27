

export type ResourceType = 'TABLE' | 'VIP_ROOM' | 'GARDEN';
export type PricingModel = 'NONE' | 'PER_HEAD' | 'FLAT_FEE' | 'MIN_SPEND';
export type BookingStatus =
  | 'HELD'
  | 'CONFIRMED'
  | 'FULLY_PAID'
  | 'SEATED'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'EXPIRED'
  | 'NO_SHOW';

export interface Resource {
  id: string;
  type: ResourceType;
  name: string;
  min_capacity: number;
  max_capacity: number;
  area: string | null;
  is_active: boolean;
  display_order: number;
}

export interface BookingPolicy {
  id: string;
  resource_type: ResourceType;
  slot_interval_minutes: number;
  min_lead_minutes: number;
  max_advance_days: number;
  hold_ttl_seconds: number;
  setup_buffer_minutes: number;
  teardown_buffer_minutes: number;
  auto_assign: boolean;
  requires_payment: boolean;
  deposit_percent: number;
  pricing_model: PricingModel;
  flat_fee_kobo: string | null;   // pg returns bigint as string
  min_spend_kobo: string | null;
  guest_count_change_cutoff_hours: number;
  default_duration_minutes: number;
}

export interface CreateBookingInput {
  resourceType: ResourceType;
  /** Required unless policy.auto_assign is true. */
  resourceId?: string;
  packageId?: string;
  guestCount: number;
  hostName: string;
  hostPhone: string;
  hostEmail: string;
  occasion?: string;
  specialRequests?: string;
  startAt: Date;
  /** Optional. If omitted, derived from dining_durations or policy.default_duration_minutes. */
  durationMinutes?: number;
}

export interface Booking {
  id: string;
  resource_id: string;
  resource_type: ResourceType;
  package_id: string | null;
  guest_count: number;
  host_name: string;
  host_phone: string;
  host_email: string;
  occasion: string | null;
  special_requests: string;
  manage_code: string;
  start_at: Date;
  end_at: Date;
  blocks_from: Date;
  blocks_until: Date;
  status: BookingStatus;
  hold_expires_at: Date | null;
  price_per_head_kobo: string | null;
  total_amount_kobo: string;
  deposit_amount_kobo: string;
  amount_paid_kobo: string;
  created_at: Date;
  updated_at: Date;
}