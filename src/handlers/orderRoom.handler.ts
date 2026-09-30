import { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  JoinOrderRequest,
  LeaveOrderRequest,
} from '../types/socket.types';
import { orderService } from '../services/order.service';
import { trackingService } from '../services/tracking.service';
import { logger } from '../services/logger.service';
import { joinOrderSchema } from '../middlewares/validators';
import { SocketAuthenticationError } from '../types/error.types';
import { SOCKET_ERROR_CODES, SOCKET_EVENTS } from '../config/constants';

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export class OrderRoomHandler {
  constructor(private io: AppServer) {}

  /**
   * Registers room-related event listeners on the socket
   */
  public register(socket: AppSocket): void {
    socket.on(SOCKET_EVENTS.JOIN_ORDER, (payload, callback) => this.handleJoin(socket, payload, callback));
    socket.on(SOCKET_EVENTS.LEAVE_ORDER, (payload) => this.handleLeave(socket, payload));
    socket.on('disconnecting', () => this.handleDisconnecting(socket));
  }

  /**
   * Handles client request to join an active order tracking room
   * Validates active order status, driver ID, and customer ID.
   */
  public async handleJoin(
    socket: AppSocket,
    rawPayload: JoinOrderRequest,
    callback?: (response: {
      success: boolean;
      data?: any;
      error?: any;
    }) => void
  ): Promise<void> {
    try {
      // 1. Validate payload format
      const parseResult = joinOrderSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        const errorPayload = {
          code: SOCKET_ERROR_CODES.INVALID_PAYLOAD,
          message: 'Invalid join order payload format',
          details: { issues: parseResult.error.issues },
          timestamp: Date.now(),
        };
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, errorPayload);
        callback?.({ success: false, error: errorPayload });
        return;
      }

      const { orderId, userId, role, token } = parseResult.data;

      // 2. Security & Active Status Authentication Gate
      // Verifies order is active, driver matches order.driver_id, customer matches order.customer_id
      const effectiveToken = token || socket.data.token;
      const order = await orderService.validateOrderAndParticipant(
        orderId,
        userId,
        role,
        effectiveToken
      );

      // 3. Join Socket.IO Rooms
      const orderRoom = `order:${orderId}`;
      const roleRoom = `order:${orderId}:${role}`;
      await socket.join([orderRoom, roleRoom]);

      // 4. Update socket tracking metadata
      socket.data.userId = userId;
      socket.data.role = role;
      socket.data.activeOrders.add(orderId);

      // 5. Update Tracking State & Participants
      const roomState = trackingService.getOrCreateRoom(order);
      trackingService.addParticipant(orderId, socket.id, userId, role);

      const oppositeRole = role === 'driver' ? 'customer' : 'driver';
      const peerConnected = trackingService.hasRoleConnected(orderId, oppositeRole);

      const joinedResponse = {
        success: true,
        orderId,
        role,
        order,
        lastKnownLocation: roomState.lastKnownLocation,
        lastEta: roomState.lastEta,
        peerConnected,
        timestamp: Date.now(),
      };

      // 6. Notify Client
      socket.emit(SOCKET_EVENTS.ORDER_JOINED, joinedResponse);
      callback?.({ success: true, data: joinedResponse });

      // 7. Notify other participants in the room
      socket.to(orderRoom).emit(SOCKET_EVENTS.PEER_JOINED, {
        orderId,
        userId,
        role,
        timestamp: Date.now(),
      });

      logger.info(
        `✅ ${role.toUpperCase()} (ID: ${userId}) authenticated & joined tracking for Order #${orderId} [peerConnected: ${peerConnected}]`
      );
    } catch (error) {
      if (error instanceof SocketAuthenticationError) {
        const errorPayload = error.toPayload();
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, errorPayload);
        callback?.({ success: false, error: errorPayload });
        logger.warn(`⛔ Unauthorized room join rejected: ${error.message}`);
      } else {
        const err = error as Error;
        const errorPayload = {
          code: SOCKET_ERROR_CODES.SERVER_ERROR,
          message: err.message || 'Internal server error validating order',
          orderId: rawPayload?.orderId,
          timestamp: Date.now(),
        };
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, errorPayload);
        callback?.({ success: false, error: errorPayload });
        logger.error(`Error in handleJoin:`, error);
      }
    }
  }

  /**
   * Handles client request to leave an order room
   */
  public async handleLeave(socket: AppSocket, payload: LeaveOrderRequest): Promise<void> {
    const orderId = String(payload.orderId);
    const orderRoom = `order:${orderId}`;

    socket.leave(orderRoom);
    socket.leave(`order:${orderId}:${socket.data.role}`);
    socket.data.activeOrders.delete(orderId);

    const removed = trackingService.removeParticipant(orderId, socket.id);
    if (removed) {
      socket.to(orderRoom).emit(SOCKET_EVENTS.PEER_LEFT, {
        orderId,
        userId: removed.userId,
        role: removed.role,
        timestamp: Date.now(),
      });
      socket.emit(SOCKET_EVENTS.ORDER_LEFT, { orderId, userId: removed.userId });
      logger.info(`Participant ${removed.role} (${removed.userId}) left Order #${orderId}`);
    }
  }

  /**
   * Handles unexpected disconnect or navigation away
   */
  public handleDisconnecting(socket: AppSocket): void {
    for (const orderId of socket.data.activeOrders) {
      const removed = trackingService.removeParticipant(orderId, socket.id);
      if (removed) {
        socket.to(`order:${orderId}`).emit(SOCKET_EVENTS.PEER_LEFT, {
          orderId,
          userId: removed.userId,
          role: removed.role,
          timestamp: Date.now(),
        });
        logger.info(`Socket disconnected: removed ${removed.role} (${removed.userId}) from Order #${orderId}`);
      }
    }
  }
}
