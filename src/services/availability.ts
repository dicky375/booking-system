import type { Knex } from 'knex';
import db from '../db/knex';
import {
  BookingPolicy,
  Resource,
  ResourceType,
} from '../types/booking';
import {
  addMinutes,
  subMinutes,
  combineVenueDateAndTime,
  venueDayOfWeek,
} from '../utils/time';
import { PolicyError } from '../utils/errors';

interface Slot {
  startAt: Date;
  endAt: Date;
  blocksFrom: Date;
  blocksUntil: Date;
  resourceId: string;
  resourceName: string;
}

interface AvailabilityArgs {
  resourceType: ResourceType;
  date: string;
  partySize: number;
  resourceId?: string;
  serviceName?: string;
  now?: Date;
}

export async function getAvailability(args: AvailabilityArgs): Promise<Slot[]> {
  const now = args.now ?? new Date();

  const policy = await loadPolicy(args.resourceType);

  // FIX: filter resources by party size at load time.
  const resources = await loadResources(
    args.resourceType,
    args.partySize,
    args.resourceId,
  );

  if (resources.length === 0) return [];

  const durationMinutes = await resolveDuration(args.resourceType, args.partySize, policy);

  const dayOfWeek = venueDayOfWeek(args.date);
  const hours = await loadOpeningHours(args.resourceType, dayOfWeek, args.serviceName);
  if (hours.length === 0) return [];

  const closures = await loadClosures(args.date, args.resourceType);
  if (closures.length > 0) return [];

  const resourceIds = resources.map((r) => r.id);
  const candidates: Slot[] = [];

  for (const h of hours) {
    const openAt = combineVenueDateAndTime(args.date, h.open_time);
    const lastSeatingAt = combineVenueDateAndTime(args.date, h.last_seating_time);

    for (
      let slotStart = new Date(openAt);
      slotStart.getTime() <= lastSeatingAt.getTime();
      slotStart = addMinutes(slotStart, policy.slot_interval_minutes)
    ) {
      const slotEnd = addMinutes(slotStart, durationMinutes);

      if (!isWithinLeadWindow(slotStart, now, policy)) continue;

      const blocksFrom = subMinutes(slotStart, policy.setup_buffer_minutes);
      const blocksUntil = addMinutes(slotEnd, policy.teardown_buffer_minutes);

      // FIX: pick the smallest resource that fits AND is free.
      const freeResourceIds = await findFreeResources(
        resourceIds,
        blocksFrom,
        blocksUntil,
      );

      if (freeResourceIds.length > 0) {
        // resources are already ordered by display_order; among the free ones,
        // pick the one with the smallest max_capacity that fits the party.
        const freeSet = new Set(freeResourceIds);
        const chosen = resources
          .filter((r) => freeSet.has(r.id))
          .sort((a, b) => a.max_capacity - b.max_capacity)[0];

        candidates.push({
          startAt: slotStart,
          endAt: slotEnd,
          blocksFrom,
          blocksUntil,
          resourceId: chosen.id,
          resourceName: chosen.name,
        });
      }
    }
  }

  return candidates;
}

// ---------- internals ----------

async function loadPolicy(resourceType: ResourceType): Promise<BookingPolicy> {
  const row = await db('booking_policies')
    .where({ resource_type: resourceType })
    .first<BookingPolicy>();
  if (!row) throw new PolicyError(`No booking_policies row for ${resourceType}`);
  return row;
}

async function loadResources(
  resourceType: ResourceType,
  partySize: number,
  resourceId?: string,
): Promise<Resource[]> {
  const q = db('resources')
    .where({ type: resourceType, is_active: true })
    .andWhere('min_capacity', '<=', partySize)
    .andWhere('max_capacity', '>=', partySize)
    .orderBy('display_order', 'asc');
  if (resourceId) q.andWhere({ id: resourceId });
  return (await q) as Resource[];
}

async function resolveDuration(
  resourceType: ResourceType,
  partySize: number,
  policy: BookingPolicy,
): Promise<number> {
  if (resourceType !== 'TABLE') return policy.default_duration_minutes;

  const row = await db('dining_durations')
    .where('party_size_min', '<=', partySize)
    .andWhere('party_size_max', '>=', partySize)
    .first<{ duration_minutes: number }>();

  return row?.duration_minutes ?? policy.default_duration_minutes;
}

async function loadOpeningHours(
  resourceType: ResourceType,
  dayOfWeek: number,
  serviceName?: string,
) {
  const q = db('opening_hours')
    .where({ day_of_week: dayOfWeek })
    .andWhere((b: Knex.QueryBuilder) =>
      b.whereNull('resource_type').orWhere('resource_type', resourceType),
    );
  if (serviceName) q.andWhere({ service_name: serviceName });
  return q.select('open_time', 'last_seating_time', 'service_name');
}

async function loadClosures(date: string, resourceType: ResourceType) {
  return db('closures')
    .where({ date })
    .andWhere((b: Knex.QueryBuilder) =>
      b.whereNull('resource_type').orWhere('resource_type', resourceType),
    )
    .select('id');
}

function isWithinLeadWindow(slotStart: Date, now: Date, policy: BookingPolicy): boolean {
  const earliest = addMinutes(now, policy.min_lead_minutes);
  const latest = new Date(now.getTime() + policy.max_advance_days * 86_400_000);
  return slotStart.getTime() >= earliest.getTime() && slotStart.getTime() <= latest.getTime();
}

async function findFreeResources(
  resourceIds: string[],
  blocksFrom: Date,
  blocksUntil: Date,
): Promise<string[]> {
  if (resourceIds.length === 0) return [];

  const busy = await db('bookings')
    .whereIn('resource_id', resourceIds)
    .whereIn('status', ['HELD', 'CONFIRMED', 'FULLY_PAID', 'SEATED'])
    .whereRaw(
      `tstzrange(blocks_from, blocks_until, '[)') && tstzrange(?, ?, '[)')`,
      [blocksFrom, blocksUntil],
    )
    .distinct('resource_id')
    .pluck('resource_id');

  const busySet = new Set(busy as string[]);
  return resourceIds.filter((id) => !busySet.has(id));
}

