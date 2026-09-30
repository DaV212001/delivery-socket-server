export type OrderPeerRole = 'driver' | 'customer' | 'admin';

export interface LocationPayload {
  orderId: string | number;
  latitude: number;
  longitude: number;
  heading?: number; // In degrees (0-360)
  speed?: number; // In meters/second or km/h
  accuracy?: number; // In meters
  altitude?: number;
  timestamp: number; // Milliseconds epoch
}

export interface EtaPayload {
  orderId: string | number;
  estimatedMinutes: number;
  remainingDistanceMeters?: number;
  polyline?: string;
  updatedAt: number;
}

export interface StatusUpdatePayload {
  orderId: string | number;
  status: string; // e.g., 'heading_to_store', 'order_picked_up', 'arrived', 'delivered'
  statusName?: string;
  notes?: string;
  timestamp: number;
}

export interface OrderMessagePayload {
  messageId?: string;
  orderId: string | number;
  senderId: string | number;
  senderRole: OrderPeerRole;
  senderName?: string;
  message: string;
  timestamp: number;
}

export interface ActiveOrder {
  id: string | number;
  orderNumber?: string;
  status: string | number;
  driverId: string | number;
  customerId: string | number;
  restaurantId?: string | number;
  restaurantName?: string;
  customerName?: string;
  driverName?: string;
  pickupLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  deliveryLocation?: {
    latitude: number;
    longitude: number;
    address?: string;
  };
  raw?: Record<string, unknown>;
  verifiedAt: number;
}

export interface OrderRoomParticipant {
  socketId: string;
  userId: string | number;
  role: OrderPeerRole;
  joinedAt: number;
}

export interface OrderTrackingState {
  order: ActiveOrder;
  lastKnownLocation?: LocationPayload;
  locationHistory: LocationPayload[];
  lastEta?: EtaPayload;
  participants: Map<string, OrderRoomParticipant>;
  createdAt: number;
  updatedAt: number;
}
