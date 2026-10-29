/**
 * Socket Server Protocol & Event Constants
 * Single source of truth for all event names across Driver App, Customer App, and Server.
 */

export const SOCKET_EVENTS = {
  // Client -> Server
  JOIN_ORDER: 'order:join',
  LEAVE_ORDER: 'order:leave',
  DRIVER_LOCATION_UPDATE: 'driver:location:update',
  DRIVER_ETA_UPDATE: 'driver:eta:update',
  ORDER_STATUS_UPDATE: 'order:status:update',
  SEND_ORDER_MESSAGE: 'order:message:send',
  PING: 'ping',

  // Server -> Client
  ORDER_JOINED: 'order:joined',
  ORDER_LEFT: 'order:left',
  PEER_JOINED: 'order:peer:joined',
  PEER_LEFT: 'order:peer:left',
  LOCATION_UPDATE: 'driver:location:update', // Broadcast to customer in room
  ETA_UPDATE: 'driver:eta:update',
  STATUS_UPDATE: 'order:status:update',
  ORDER_COMPLETED: 'order:completed',
  ORDER_MESSAGE_RECEIVED: 'order:message:received',
  ORDER_ERROR: 'order:error',
  PONG: 'pong',
} as const;

/**
 * Valid active order statuses that permit location tracking and real-time communication.
 * Status codes:
 * 1: Accepted
 * 2: Driver on the way to shop
 * 3: Driver on the way to you
 * Inactive / terminal statuses (4: Delivered, 5: Cancelled) are completed/rejected from active tracking.
 */
export const ACTIVE_ORDER_STATUSES = [
  '0', // Pending / Order placed (awaiting acceptance)
  '1', // Accepted
  '2', // Driver on the way to shop
  '3', // Driver on the way to you
  'pending',
  'placed',
  'assigned',
  'accepted',
  'order_accepted',
  'driver_on_way_to_shop',
  'driver_to_shop',
  'heading_to_store',
  'at_store',
  'order_picked_up',
  'picked_up',
  'driver_on_way_to_you',
  'driver_to_you',
  'heading_to_customer',
  'arrived',
  'in_transit',
  'out_for_delivery',
] as const;

/**
 * Standard error codes emitted to clients for programmatic handling
 */
export const SOCKET_ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  ORDER_INACTIVE: 'ORDER_INACTIVE',
  DRIVER_MISMATCH: 'DRIVER_MISMATCH',
  CUSTOMER_MISMATCH: 'CUSTOMER_MISMATCH',
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVER_ERROR: 'SERVER_ERROR',
} as const;
