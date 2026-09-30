import { z } from 'zod';

export const joinOrderSchema = z.object({
  orderId: z.union([z.string(), z.number()]).transform((val) => String(val)),
  userId: z.union([z.string(), z.number()]).transform((val) => String(val)),
  role: z.enum(['driver', 'customer', 'admin']),
  token: z.string().optional(),
});

export const locationUpdateSchema = z.object({
  orderId: z.union([z.string(), z.number()]).transform((val) => String(val)),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  heading: z.number().min(0).max(360).optional(),
  speed: z.number().min(0).optional(),
  accuracy: z.number().min(0).optional(),
  altitude: z.number().optional(),
  timestamp: z.number().default(() => Date.now()),
});

export const etaUpdateSchema = z.object({
  orderId: z.union([z.string(), z.number()]).transform((val) => String(val)),
  estimatedMinutes: z.number().min(0),
  remainingDistanceMeters: z.number().min(0).optional(),
  polyline: z.string().optional(),
  updatedAt: z.number().default(() => Date.now()),
});

export const statusUpdateSchema = z.object({
  orderId: z.union([z.string(), z.number()]).transform((val) => String(val)),
  status: z.string().min(1),
  statusName: z.string().optional(),
  notes: z.string().optional(),
  timestamp: z.number().default(() => Date.now()),
});

export const orderMessageSchema = z.object({
  messageId: z.string().optional().default(() => Math.random().toString(36).substring(2, 11)),
  orderId: z.union([z.string(), z.number()]).transform((val) => String(val)),
  senderId: z.union([z.string(), z.number()]).transform((val) => String(val)),
  senderRole: z.enum(['driver', 'customer', 'admin']),
  senderName: z.string().optional(),
  message: z.string().min(1).max(1000),
  timestamp: z.number().default(() => Date.now()),
});
