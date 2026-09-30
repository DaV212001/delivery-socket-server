import { env } from '../config/env.config';
import {
  ActiveOrder,
  LocationPayload,
  EtaPayload,
  OrderRoomParticipant,
  OrderTrackingState,
  OrderPeerRole,
} from '../types/order.types';
import { logger } from './logger.service';

export class TrackingService {
  private activeRooms = new Map<string, OrderTrackingState>();

  /**
   * Initializes or retrieves an active tracking room for an order
   */
  public getOrCreateRoom(order: ActiveOrder): OrderTrackingState {
    const orderKey = String(order.id);
    let state = this.activeRooms.get(orderKey);

    if (!state) {
      state = {
        order,
        locationHistory: [],
        participants: new Map<string, OrderRoomParticipant>(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      this.activeRooms.set(orderKey, state);
      logger.info(`Initialized real-time tracking room for Order #${orderKey}`);
    } else {
      state.order = order; // refresh order metadata
    }

    return state;
  }

  /**
   * Retrieves an active tracking state by order ID
   */
  public getRoomState(orderId: string | number): OrderTrackingState | undefined {
    return this.activeRooms.get(String(orderId));
  }

  /**
   * Registers a participant joining an order tracking room
   */
  public addParticipant(
    orderId: string | number,
    socketId: string,
    userId: string | number,
    role: OrderPeerRole
  ): void {
    const state = this.getRoomState(orderId);
    if (!state) return;

    state.participants.set(socketId, {
      socketId,
      userId: String(userId),
      role,
      joinedAt: Date.now(),
    });
    state.updatedAt = Date.now();
  }

  /**
   * Removes a participant when they leave or disconnect
   */
  public removeParticipant(orderId: string | number, socketId: string): OrderRoomParticipant | undefined {
    const state = this.getRoomState(orderId);
    if (!state) return undefined;

    const removed = state.participants.get(socketId);
    if (removed) {
      state.participants.delete(socketId);
      state.updatedAt = Date.now();
    }
    return removed;
  }

  /**
   * Checks if an order room currently has an active driver or customer connected
   */
  public hasRoleConnected(orderId: string | number, role: OrderPeerRole): boolean {
    const state = this.getRoomState(orderId);
    if (!state) return false;

    for (const participant of state.participants.values()) {
      if (participant.role === role) return true;
    }
    return false;
  }

  /**
   * Records a driver location update and maintains a rolling breadcrumb history
   */
  public recordLocation(orderId: string | number, location: LocationPayload): void {
    const state = this.getRoomState(orderId);
    if (!state) return;

    state.lastKnownLocation = location;
    state.locationHistory.push(location);

    // Keep history capped
    if (state.locationHistory.length > env.MAX_LOCATION_HISTORY) {
      state.locationHistory.shift();
    }

    state.updatedAt = Date.now();
  }

  /**
   * Records an updated ETA from the driver
   */
  public recordEta(orderId: string | number, eta: EtaPayload): void {
    const state = this.getRoomState(orderId);
    if (!state) return;

    state.lastEta = eta;
    state.updatedAt = Date.now();
  }

  /**
   * Removes an order room completely when delivery completes or is cancelled
   */
  public closeRoom(orderId: string | number): void {
    const orderKey = String(orderId);
    if (this.activeRooms.has(orderKey)) {
      this.activeRooms.delete(orderKey);
      logger.info(`Closed tracking room for Order #${orderKey}`);
    }
  }

  /**
   * Returns summary metrics for health check and admin monitoring
   */
  public getMetrics(): {
    activeRoomsCount: number;
    activeOrders: Array<{ orderId: string; participantsCount: number; hasLocation: boolean }>;
  } {
    const ordersSummary = Array.from(this.activeRooms.entries()).map(([orderId, state]) => ({
      orderId,
      participantsCount: state.participants.size,
      hasLocation: !!state.lastKnownLocation,
    }));

    return {
      activeRoomsCount: this.activeRooms.size,
      activeOrders: ordersSummary,
    };
  }
}

export const trackingService = new TrackingService();
