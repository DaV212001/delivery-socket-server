import { Socket } from 'socket.io';
import { ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData } from '../types/socket.types';
import { OrderPeerRole } from '../types/order.types';
import { logger } from '../services/logger.service';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

/**
 * Socket.IO connection middleware.
 * Inspects handshake authentication metadata (token, userId, role)
 * and initializes the socket's session context.
 */
export const socketAuthMiddleware = (socket: AppSocket, next: (err?: Error) => void): void => {
  try {
    const auth = socket.handshake.auth || {};
    const query = socket.handshake.query || {};

    // Extract auth parameters from either handshake auth or query fallback
    const rawUserId = auth.userId ?? query.userId;
    const rawRole = (auth.role ?? query.role) as OrderPeerRole | undefined;
    const token = (auth.token ?? query.token ?? socket.handshake.headers.authorization)?.toString();

    const userId = rawUserId ? String(rawUserId).trim() : undefined;
    const role: OrderPeerRole | undefined = rawRole && ['driver', 'customer', 'admin'].includes(rawRole)
      ? rawRole
      : undefined;

    // Attach strongly typed user context to socket instance
    socket.data = {
      userId,
      role,
      token,
      authenticated: !!userId,
      activeOrders: new Set<string>(),
    };

    logger.debug(`Socket connected [id=${socket.id}] userId=${userId ?? 'anon'}, role=${role ?? 'unknown'}`);
    next();
  } catch (error) {
    logger.error('Error during socket authentication handshake:', error);
    next(new Error('Authentication handshake failed'));
  }
};
