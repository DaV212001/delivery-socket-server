import { Server, Socket } from 'socket.io';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from '../types/socket.types';
import { OrderMessagePayload } from '../types/order.types';
import { orderMessageSchema } from '../middlewares/validators';
import { SOCKET_ERROR_CODES, SOCKET_EVENTS } from '../config/constants';
import { logger } from '../services/logger.service';

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export class ChatHandler {
  constructor(private io: AppServer) {}

  public register(socket: AppSocket): void {
    socket.on(SOCKET_EVENTS.SEND_ORDER_MESSAGE, (payload, callback) =>
      this.handleSendMessage(socket, payload, callback)
    );
  }

  /**
   * Handles peer-to-peer delivery communication between authorized driver and customer
   */
  public async handleSendMessage(
    socket: AppSocket,
    rawPayload: OrderMessagePayload,
    callback?: (response: { success: boolean; messageId: string }) => void
  ): Promise<void> {
    try {
      const parseResult = orderMessageSchema.safeParse(rawPayload);
      if (!parseResult.success) {
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, {
          code: SOCKET_ERROR_CODES.INVALID_PAYLOAD,
          message: 'Invalid message payload',
          timestamp: Date.now(),
        });
        return;
      }

      const msg = parseResult.data;
      const orderId = msg.orderId;

      // Ensure sender is in the order room
      if (!socket.data.activeOrders.has(orderId)) {
        socket.emit(SOCKET_EVENTS.ORDER_ERROR, {
          code: SOCKET_ERROR_CODES.UNAUTHORIZED,
          message: `Cannot send message: Not in active room for Order #${orderId}`,
          orderId,
          timestamp: Date.now(),
        });
        return;
      }

      const orderRoom = `order:${orderId}`;
      const messageId = msg.messageId || Math.random().toString(36).substring(2, 11);

      const broadcastPayload: OrderMessagePayload = {
        messageId,
        orderId,
        senderId: msg.senderId,
        senderRole: msg.senderRole,
        senderName: msg.senderName,
        message: msg.message,
        timestamp: Date.now(),
      };

      // Broadcast to everyone in the room (including sender or to other peers)
      this.io.to(orderRoom).emit(SOCKET_EVENTS.ORDER_MESSAGE_RECEIVED, broadcastPayload);
      callback?.({ success: true, messageId });

      logger.debug(
        `💬 Chat message in Order #${orderId} from ${msg.senderRole} (${msg.senderId}): "${msg.message.substring(0, 30)}..."`
      );
    } catch (error) {
      logger.error('Error handling chat message:', error);
    }
  }
}
