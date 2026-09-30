import { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/socket.types';
import { EtaPayload, StatusUpdatePayload } from '../types/order.types';
import { trackingService } from '../services/tracking.service';
import { orderService } from '../services/order.service';
import { etaUpdateSchema, statusUpdateSchema } from '../middlewares/validators';
import { SOCKET_ERROR_CODES, SOCKET_EVENTS } from '../config/constants';
import { logger } from '../services/logger.service';

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export class StatusHandler {
  constructor(private io: AppServer) {}

  public register(socket: AppSocket): void {
    socket.on(SOCKET_EVENTS.DRIVER_ETA_UPDATE, (payload, callback) =>
      this.handleEtaUpdate(socket, payload, callback)
    );
    socket.on(SOCKET_EVENTS.ORDER_STATUS_UPDATE, (payload, callback) =>
      this.handleStatusUpdate(socket, payload, callback)
    );
  }

  /**
   * Handles driver ETA and route progress updates
   */
  public async handleEtaUpdate(
    socket: AppSocket,
    rawPayload: EtaPayload,
    callback?: (response: { success: boolean; timestamp: number }) => void
  ): Promise<void> {
    try {
      const parseResult = etaUpdateSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, {
          code: SOCKET_ERROR_CODES.INVALID_PAYLOAD,
          message: 'Invalid ETA payload format',
          timestamp: Date.now(),
        });
        return;
      }

      const eta = parseResult.data;
      const orderId = eta.orderId;

      if (!socket.data.activeOrders.has(orderId)) {
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, {
          code: SOCKET_ERROR_CODES.UNAUTHORIZED,
          message: `Cannot emit ETA: Not joined to Order #${orderId}`,
          orderId,
          timestamp: Date.now(),
        });
        return;
      }

      trackingService.recordEta(orderId, eta);
      socket.to(`order:${orderId}`).emit(SOCKET_EVENTS.ETA_UPDATE, eta);
      callback?.({ success: true, timestamp: Date.now() });

      logger.debug(`⏱️ ETA updated for Order #${orderId}: ${eta.estimatedMinutes} mins`);
    } catch (error) {
      logger.error('Error handling ETA update:', error);
    }
  }

  /**
   * Handles order workflow transitions (e.g. heading_to_store -> picked_up -> delivered)
   */
  public async handleStatusUpdate(
    socket: AppSocket,
    rawPayload: StatusUpdatePayload,
    callback?: (response: { success: boolean; timestamp: number }) => void
  ): Promise<void> {
    try {
      const parseResult = statusUpdateSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, {
          code: SOCKET_ERROR_CODES.INVALID_PAYLOAD,
          message: 'Invalid status update payload',
          timestamp: Date.now(),
        });
        return;
      }

      const { orderId, status, statusName, notes, timestamp } = parseResult.data;

      if (!socket.data.activeOrders.has(orderId)) {
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, {
          code: SOCKET_ERROR_CODES.UNAUTHORIZED,
          message: `Cannot update status: Not authorized for Order #${orderId}`,
          orderId,
          timestamp: Date.now(),
        });
        return;
      }

      const orderRoom = `order:${orderId}`;

      // Broadcast status transition to the room
      this.io.to(orderRoom).emit(SOCKET_EVENTS.STATUS_UPDATE, {
        orderId,
        status,
        statusName,
        notes,
        timestamp,
      });

      // Update cache
      orderService.updateCachedStatus(orderId, status);

      // Check if terminal status reached (delivered / cancelled / completed)
      const terminalStatuses = ['delivered', 'cancelled', 'canceled', 'completed', '4', '5'];
      if (terminalStatuses.includes(status.toLowerCase())) {
        logger.info(`🏁 Order #${orderId} reached terminal status: '${status}'. Broadcasting completion and closing room.`);
        this.io.to(orderRoom).emit(SOCKET_EVENTS.ORDER_COMPLETED, {
          orderId,
          status,
          timestamp: Date.now(),
        });

        // Close room and purge from active memory
        setTimeout(() => {
          trackingService.closeRoom(orderId);
          orderService.invalidateCache(orderId);
        }, 5000); // 5-second grace period for in-flight acknowledgements
      }

      callback?.({ success: true, timestamp: Date.now() });
    } catch (error) {
      logger.error('Error handling status update:', error);
    }
  }
}
