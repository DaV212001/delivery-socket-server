import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createApp } from './app';
import { env } from './config/env.config';
import { logger } from './services/logger.service';
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from './types/socket.types';
import { socketAuthMiddleware } from './middlewares/socketAuth.middleware';
import { OrderRoomHandler } from './handlers/orderRoom.handler';
import { LocationHandler } from './handlers/location.handler';
import { StatusHandler } from './handlers/status.handler';
import { ChatHandler } from './handlers/chat.handler';
import { SOCKET_EVENTS } from './config/constants';

export const createServer = () => {
  const app = createApp();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: env.SOCKET_PING_INTERVAL_MS,
    pingTimeout: env.SOCKET_PING_TIMEOUT_MS,
    transports: ['websocket', 'polling'], // WebSocket first, fallback to long-polling
  });

  // Apply authentication middleware on socket connection handshake
  io.use(socketAuthMiddleware);

  // Initialize modular handlers
  const roomHandler = new OrderRoomHandler(io);
  const locationHandler = new LocationHandler(io);
  const statusHandler = new StatusHandler(io);
  const chatHandler = new ChatHandler(io);

  // Client connection lifecycle
  io.on('connection', (socket) => {
    logger.info(`🔌 Socket connected: ${socket.id} (user: ${socket.data.userId ?? 'anon'}, role: ${socket.data.role ?? 'unknown'})`);

    // Register handlers
    roomHandler.register(socket);
    locationHandler.register(socket);
    statusHandler.register(socket);
    chatHandler.register(socket);

    // Heartbeat ping/pong
    socket.on(SOCKET_EVENTS.PING, (callback) => {
      socket.emit(SOCKET_EVENTS.PONG);
      callback?.();
    });

    socket.on('disconnect', (reason) => {
      logger.info(`❌ Socket disconnected: ${socket.id} (reason: ${reason})`);
    });
  });

  return { app, httpServer, io };
};

// Start listening if run directly
if (process.env.NODE_ENV !== 'test') {
  const { httpServer } = createServer();

  httpServer.listen(env.PORT, env.HOST, () => {
    logger.info('====================================================');
    logger.info(`🚀 AMN Delivery Socket Server is running!`);
    logger.info(`📡 Port: ${env.PORT} | Host: ${env.HOST}`);
    logger.info(`🌐 Environment: ${env.NODE_ENV}`);
    logger.info(`🔒 Validation Mode: ${env.VALIDATION_MODE}`);
    logger.info(`🏥 Health Check: http://${env.HOST}:${env.PORT}/health`);
    logger.info('====================================================');
  });

  // Graceful shutdown on Render deployments (SIGTERM / SIGINT)
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}. Gracefully terminating socket server...`);
    httpServer.close(() => {
      logger.info('HTTP & Socket.IO server closed. Exiting process.');
      process.exit(0);
    });

    // Force exit if not terminated within 10 seconds
    setTimeout(() => {
      logger.error('Forcefully exiting after shutdown timeout.');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
