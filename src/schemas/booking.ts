import { z } from 'zod';

const ResourceTypeEnum = z.enum(['TABLE', 'VIP_ROOM', 'GARDEN']);

export const CreateBookingBody = z.object({
  resourceType: ResourceTypeEnum,
  resourceId: z.string().uuid().optional(),
  packageId: z.string().uuid().optional(),
  guestCount: z.number().int().positive(),
  hostName: z.string().min(1).max(200),
  hostPhone: z.string().min(1).max(50),
  hostEmail: z.string().email(),
  occasion: z.string().max(200).optional(),
  specialRequests: z.string().max(2000).optional(),
  startAt: z.string().datetime(), // ISO 8601
  durationMinutes: z.number().int().positive().optional(),
});

export const AvailabilityQuery = z.object({
  resourceType: ResourceTypeEnum,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD'),
  partySize: z.coerce.number().int().positive(),
  serviceName: z.string().optional(),
  resourceId: z.string().uuid().optional(),
});

export const CancelBookingBody = z.object({
  reason: z.string().max(500).optional(),
});

export const InitiatePaymentBody = z.object({
  bookingId: z.string().uuid(),
  kind: z.enum(['DEPOSIT', 'BALANCE']),
  callbackUrl: z.string().url().optional(),
});

export const ManageCodeParam = z.object({
  manageCode: z.string().min(1).max(32),
});

export type CreateBookingInput = z.infer<typeof CreateBookingBody>;
export type AvailabilityQueryInput = z.infer<typeof AvailabilityQuery>;
export type CancelBookingInput = z.infer<typeof CancelBookingBody>;
export type InitiatePaymentInput = z.infer<typeof InitiatePaymentBody>;