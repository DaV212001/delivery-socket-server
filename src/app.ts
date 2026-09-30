import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.config';
import { trackingService } from './services/tracking.service';
import { orderService } from './services/order.service';

export const createApp = (): express.Application => {
  const app = express();

  // Basic security & parsing middlewares
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  /**
   * Root informational endpoint
   */
  app.get('/', (req: Request, res: Response) => {
    res.json({
      service: 'AMN Delivery Real-Time Socket Server',
      version: '1.0.0',
      status: 'online',
      protocol: 'socket.io-v4',
      environment: env.NODE_ENV,
      healthCheck: '/health',
      docs: '/api/docs',
    });
  });

  /**
   * Render Health Check Endpoint
   * Render probes this URL to verify the container is healthy and ready for traffic
   */
  app.get('/health', (req: Request, res: Response) => {
    const memory = process.memoryUsage();
    const metrics = trackingService.getMetrics();

    res.status(200).json({
      status: 'healthy',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      activeRooms: metrics.activeRoomsCount,
      validationMode: env.VALIDATION_MODE,
      memory: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024)),
      },
    });
  });

  /**
   * Real-time metrics endpoint for monitoring and observability
   */
  app.get('/metrics', (req: Request, res: Response) => {
    const metrics = trackingService.getMetrics();
    res.json({
      timestamp: Date.now(),
      ...metrics,
    });
  });

  /**
   * REST inspection endpoint for active order tracking state
   */
  app.get('/api/orders/:id/tracking', (req: Request, res: Response) => {
    const orderId = String(req.params.id);
    const roomState = trackingService.getRoomState(orderId);

    if (!roomState) {
      return res.status(404).json({
        success: false,
        message: `Order #${orderId} does not currently have an active tracking room.`,
      });
    }

    res.json({
      success: true,
      orderId,
      status: roomState.order.status,
      participantsCount: roomState.participants.size,
      participants: Array.from(roomState.participants.values()),
      lastKnownLocation: roomState.lastKnownLocation,
      lastEta: roomState.lastEta,
      historyCount: roomState.locationHistory.length,
      createdAt: roomState.createdAt,
      updatedAt: roomState.updatedAt,
    });
  });

  /**
   * Mock Order Registration (Available in development/test/fallback mode)
   */
  if (env.VALIDATION_MODE !== 'strict') {
    app.post('/api/orders/mock', (req: Request, res: Response) => {
      const order = req.body;
      if (!order.id || !order.driverId || !order.customerId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: id, driverId, customerId',
        });
      }

      orderService.registerMockOrder({
        id: String(order.id),
        orderNumber: order.orderNumber ?? `AMN-${order.id}`,
        status: order.status ?? '1',
        driverId: String(order.driverId),
        customerId: String(order.customerId),
        restaurantName: order.restaurantName ?? 'Sample Restaurant',
        customerName: order.customerName ?? 'Sample Customer',
        driverName: order.driverName ?? 'Sample Driver',
        verifiedAt: Date.now(),
      });

      res.status(201).json({
        success: true,
        message: `Registered mock order #${order.id}`,
      });
    });
  }

  // 404 Handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      path: req.originalUrl,
    });
  });

  // Global Error Handler
  app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error('Unhandled Express error:', err);
    res.status(500).json({
      error: 'Internal Server Error',
      message: env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    });
  });

  return app;
};
