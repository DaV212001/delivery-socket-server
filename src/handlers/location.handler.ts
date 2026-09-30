import { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/socket.types';
import { LocationPayload } from '../types/order.types';
import { trackingService } from '../services/tracking.service';
import { locationUpdateSchema } from '../middlewares/validators';
import { SOCKET_ERROR_CODES, SOCKET_EVENTS } from '../config/constants';
import { logger } from '../services/logger.service';

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export class LocationHandler {
  constructor(private io: AppServer) {}

  public register(socket: AppSocket): void {
    socket.on(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE, (payload, callback) =>
      this.handleLocationUpdate(socket, payload, callback)
    );
  }

  /**
   * Handles real-time GPS coordinate pings from the driver
   */
  public async handleLocationUpdate(
    socket: AppSocket,
    rawPayload: LocationPayload,
    callback?: (response: { success: boolean; timestamp: number }) => void
  ): Promise<void> {
    try {
      // 1. Validate payload format with Zod
      const parseResult = locationUpdateSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, {
          code: SOCKET_ERROR_CODES.INVALID_PAYLOAD,
          message: 'Invalid location update payload format',
          details: { issues: parseResult.error.issues },
          timestamp: Date.now(),
        });
        return;
      }

      const location = parseResult.data;
      const orderId = location.orderId;

      // 2. Authorization check: Is socket authorized as driver for this order?
      if (!socket.data.activeOrders.has(orderId)) {
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, {
          code: SOCKET_ERROR_CODES.UNAUTHORIZED,
          message: `Cannot emit location: Socket has not joined or authenticated for Order #${orderId}`,
          orderId,
          timestamp: Date.now(),
        });
        return;
      }

      if (socket.data.role !== 'driver' && socket.data.role !== 'admin') {
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, {
          code: SOCKET_ERROR_CODES.DRIVER_MISMATCH,
          message: `Only authorized drivers can broadcast location coordinates.`,
          orderId,
          timestamp: Date.now(),
        });
        return;
      }

      // 3. Cache location in tracking service
      trackingService.recordLocation(orderId, location);

      // 4. Broadcast live coordinates to customer in the order room
      socket.to(`order:${orderId}`).emit(SOCKET_EVENTS.LOCATION_UPDATE, location);

      // 5. Acknowledge driver transmission
      callback?.({ success: true, timestamp: Date.now() });

      logger.debug(
        `📍 Location broadcasted for Order #${orderId}: [${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}] heading=${location.heading ?? 0}°`
      );
    } catch (error) {
      logger.error('Error handling location update:', error);
      socket.emit(SOCKET_EVENTS.ORDER_ERROR, {
        code: SOCKET_ERROR_CODES.SERVER_ERROR,
        message: 'Internal server error processing location update',
        timestamp: Date.now(),
      });
    }
  }
}
