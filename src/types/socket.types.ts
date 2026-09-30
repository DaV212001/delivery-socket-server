import {
  LocationPayload,
  EtaPayload,
  StatusUpdatePayload,
  OrderMessagePayload,
  OrderPeerRole,
  ActiveOrder,
} from './order.types';
import { SocketErrorPayload } from './error.types';

export interface JoinOrderRequest {
  orderId: string | number;
  userId: string | number;
  role: OrderPeerRole;
  token?: string;
}

export interface LeaveOrderRequest {
  orderId: string | number;
  userId: string | number;
}

export interface OrderJoinedResponse {
  success: boolean;
  orderId: string | number;
  role: OrderPeerRole;
  order: ActiveOrder;
  lastKnownLocation?: LocationPayload;
  lastEta?: EtaPayload;
  peerConnected: boolean;
  timestamp: number;
}

export interface PeerPresencePayload {
  orderId: string | number;
  userId: string | number;
  role: OrderPeerRole;
  timestamp: number;
}

/**
 * Events sent by Clients (Driver App, Customer App) to the Server
 */
export interface ClientToServerEvents {
  'order:join': (
    payload: JoinOrderRequest,
    callback?: (response: { success: boolean; data?: OrderJoinedResponse; error?: SocketErrorPayload }) => void
  ) => void;

  'order:leave': (payload: LeaveOrderRequest) => void;

  'driver:location:update': (
    payload: LocationPayload,
    callback?: (response: { success: boolean; timestamp: number }) => void
  ) => void;

  'driver:eta:update': (
    payload: EtaPayload,
    callback?: (response: { success: boolean; timestamp: number }) => void
  ) => void;

  'order:status:update': (
    payload: StatusUpdatePayload,
    callback?: (response: { success: boolean; timestamp: number }) => void
  ) => void;

  'order:message:send': (
    payload: OrderMessagePayload,
    callback?: (response: { success: boolean; messageId: string }) => void
  ) => void;

  ping: (callback?: () => void) => void;
}

/**
 * Events emitted by the Server to Clients
 */
export interface ServerToClientEvents {
  'order:joined': (data: OrderJoinedResponse) => void;
  'order:left': (data: { orderId: string | number; userId: string | number }) => void;
  'order:peer:joined': (data: PeerPresencePayload) => void;
  'order:peer:left': (data: PeerPresencePayload) => void;
  'driver:location:update': (data: LocationPayload) => void;
  'driver:eta:update': (data: EtaPayload) => void;
  'order:status:update': (data: StatusUpdatePayload) => void;
  'order:completed': (data: { orderId: string | number; status: string; timestamp: number }) => void;
  'order:message:received': (data: OrderMessagePayload) => void;
  'order:error': (error: SocketErrorPayload) => void;
  pong: () => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId?: string | number;
  role?: OrderPeerRole;
  token?: string;
  authenticated: boolean;
  activeOrders: Set<string>; // Set of orderIds this socket has joined and is authorized for
}
