import express from 'express';
import cors from 'cors';
import { z } from 'zod';
import db from '../db/knex';
import { createBooking, transitionBooking } from '../services/booking';
import { getAvailability } from '../services/availability';
import { SlotTakenError, ValidationError } from '../utils/errors';

const app = express();

// --- CORS: allow localhost (dev) + any netlify.app subdomain (prod) ---
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  /^https:\/\/.*\.netlify\.app$/, // matches https://your-site.netlify.app
];

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (curl, mobile apps, server-to-server)
    if (!origin) return callback(null, true);
    const allowed = allowedOrigins.some((o) =>
      typeof o === 'string' ? o === origin : o.test(origin),
    );
    if (allowed) return callback(null, true);
    callback(new Error(`Blocked by CORS: ${origin}`));
  },
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
}));
app.use(express.json());

// --- Health check ---
app.get('/api/health', async (_req, res) => {
  try {
    await db.raw('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err: any) {
    res.status(500).json({ status: 'error', db: err.message });
  }
});

// --- 1. Availability ---
app.get('/api/availability', async (req, res) => {
  try {
    const { date, partySize, preference } = req.query;
    if (!date || !partySize) {
      return res.status(400).json({ error: 'Date and partySize are required' });
    }

    const resourceType = preference === 'outdoor' ? 'GARDEN' : 'TABLE';

    const slots = await getAvailability({
      resourceType,
      date: String(date),
      partySize: Number(partySize),
    });

    const times = slots.map((s) => ({
      time: s.startAt.toISOString(),
      resourceId: s.resourceId,
    }));

    res.json(times);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load availability' });
  }
});

// --- 2. Create booking ---
const bookingSchema = z.object({
  resourceType: z.enum(['TABLE', 'GARDEN']),
  startAt: z.string().datetime(),
  guestCount: z.number().int().positive(),
  hostName: z.string().min(2),
  hostEmail: z.string().email(),
  hostPhone: z.string().min(5),
  occasion: z.string().optional(),
  specialRequests: z.string().optional(),
});

app.post('/api/bookings', async (req, res) => {
  try {
    const data = bookingSchema.parse(req.body);

    const booking = await createBooking({
      resourceType: data.resourceType,
      startAt: new Date(data.startAt),
      guestCount: data.guestCount,
      hostName: data.hostName,
      hostEmail: data.hostEmail,
      hostPhone: data.hostPhone,
      occasion: data.occasion,
      specialRequests: data.specialRequests,
    });

    res.status(201).json({
      message: 'Booking created successfully',
      manageCode: booking.manage_code,
      status: booking.status,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid form data', details: err.issues });
    }
    if (err instanceof SlotTakenError) {
      return res.status(409).json({ error: 'Sorry, that time slot was just taken. Please pick another.' });
    }
    if (err instanceof ValidationError) {
      return res.status(422).json({ error: err.message });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- 3. Manager: list bookings ---
app.get('/api/admin/bookings', async (_req, res) => {
  try {
    const bookings = await db('bookings')
      .join('resources', 'resources.id', 'bookings.resource_id')
      .select(
        'bookings.id',
        'bookings.host_name',
        'bookings.host_phone',
        'bookings.guest_count',
        'bookings.start_at',
        'bookings.status',
        'bookings.manage_code',
        'resources.name as table_name',
      )
      .orderBy('bookings.start_at', 'asc');

    res.json(bookings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// --- 4. Manager: update booking status ---
app.patch('/api/admin/bookings/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const updated = await transitionBooking(id, status);
    res.json(updated);
  } catch (err: any) {
    console.error('Status update error:', err);
    res.status(400).json({ error: err.message || 'Failed to update status' });
  }
});

// --- Bind to 0.0.0.0 so Render can detect the port ---
const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`API server running on port ${PORT}`);
});