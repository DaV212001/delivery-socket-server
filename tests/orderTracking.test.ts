import http from 'http';
import { AddressInfo } from 'net';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { createServer } from '../src/server';
import { orderService } from '../src/services/order.service';
import { trackingService } from '../src/services/tracking.service';
import { SOCKET_EVENTS, SOCKET_ERROR_CODES } from '../src/config/constants';

describe('Socket.IO Active Order Location Tracking & Auth Tests', () => {
  let httpServer: http.Server;
  let ioServer: any;
  let socketUrl: string;

  beforeAll((done) => {
    // Seed active order
    orderService.registerMockOrder({
      id: '8492',
      orderNumber: 'AMN-8492',
      status: '1', // active
      driverId: '42',
      customerId: '15',
      restaurantName: 'Chanoly Noodles',
      customerName: 'Amanuel Tilahun',
      driverName: 'Dawit Tadesse',
      verifiedAt: Date.now(),
    });

    // Seed inactive order (delivered)
    orderService.registerMockOrder({
      id: '9999',
      orderNumber: 'AMN-9999',
      status: 'delivered', // inactive!
      driverId: '42',
      customerId: '15',
      restaurantName: 'Chanoly Noodles',
      verifiedAt: Date.now(),
    });

    const serverInstance = createServer();
    httpServer = serverInstance.httpServer;
    ioServer = serverInstance.io;

    httpServer.listen(0, '127.0.0.1', () => {
      const addr = httpServer.address() as AddressInfo;
      socketUrl = `http://127.0.0.1:${addr.port}`;
      done();
    });
  });

  const activeClients: ClientSocketType[] = [];

  afterEach(() => {
    while (activeClients.length > 0) {
      const client = activeClients.pop();
      if (client?.connected) {
        client.disconnect();
      }
    }
  });

  afterAll((done) => {
    ioServer.close(done);
  });

  const createClient = (authData: { userId?: string; role?: string; token?: string }): Promise<ClientSocketType> => {
    return new Promise((resolve) => {
      const socket = ClientSocket(socketUrl, {
        auth: authData,
        transports: ['websocket'],
        reconnection: false,
      });
      activeClients.push(socket);
      socket.on('connect', () => resolve(socket));
    });
  };

  test('1. Ping/pong heartbeat works', async () => {
    const client = await createClient({ userId: '42', role: 'driver' });
    const pongReceived = new Promise<void>((resolve) => {
      client.on(SOCKET_EVENTS.PONG, () => resolve());
    });

    client.emit(SOCKET_EVENTS.PING);
    await pongReceived;
    client.disconnect();
  });

  test('2. Driver with correct driverId can join active order room', async () => {
    const driverSocket = await createClient({ userId: '42', role: 'driver' });

    const joinResult = await new Promise<any>((resolve) => {
      driverSocket.emit(
        SOCKET_EVENTS.JOIN_ORDER,
        { orderId: '8492', userId: '42', role: 'driver' },
        (res: any) => resolve(res)
      );
    });

    expect(joinResult.success).toBe(true);
    expect(joinResult.data.orderId).toBe('8492');
    expect(joinResult.data.role).toBe('driver');
    expect(joinResult.data.order.status).toBe('1');

    driverSocket.disconnect();
  });

  test('3. Driver with wrong driverId is rejected with DRIVER_MISMATCH', async () => {
    const imposterDriver = await createClient({ userId: '999', role: 'driver' });

    const joinResult = await new Promise<any>((resolve) => {
      imposterDriver.emit(
        SOCKET_EVENTS.JOIN_ORDER,
        { orderId: '8492', userId: '999', role: 'driver' },
        (res: any) => resolve(res)
      );
    });

    expect(joinResult.success).toBe(false);
    expect(joinResult.error.code).toBe(SOCKET_ERROR_CODES.DRIVER_MISMATCH);
    expect(joinResult.error.message).toContain('Driver mismatch');

    imposterDriver.disconnect();
  });

  test('4. Customer with correct customerId can join active order room', async () => {
    const customerSocket = await createClient({ userId: '15', role: 'customer' });

    const joinResult = await new Promise<any>((resolve) => {
      customerSocket.emit(
        SOCKET_EVENTS.JOIN_ORDER,
        { orderId: '8492', userId: '15', role: 'customer' },
        (res: any) => resolve(res)
      );
    });

    expect(joinResult.success).toBe(true);
    expect(joinResult.data.orderId).toBe('8492');
    expect(joinResult.data.role).toBe('customer');

    customerSocket.disconnect();
  });

  test('5. Customer with wrong customerId is rejected with CUSTOMER_MISMATCH', async () => {
    const imposterCustomer = await createClient({ userId: '888', role: 'customer' });

    const joinResult = await new Promise<any>((resolve) => {
      imposterCustomer.emit(
        SOCKET_EVENTS.JOIN_ORDER,
        { orderId: '8492', userId: '888', role: 'customer' },
        (res: any) => resolve(res)
      );
    });

    expect(joinResult.success).toBe(false);
    expect(joinResult.error.code).toBe(SOCKET_ERROR_CODES.CUSTOMER_MISMATCH);
    expect(joinResult.error.message).toContain('Customer mismatch');

    imposterCustomer.disconnect();
  });

  test('6. Attempting to track a non-existent order is rejected with ORDER_NOT_FOUND', async () => {
    const driverSocket = await createClient({ userId: '42', role: 'driver' });

    const joinResult = await new Promise<any>((resolve) => {
      driverSocket.emit(
        SOCKET_EVENTS.JOIN_ORDER,
        { orderId: '123456789', userId: '42', role: 'driver' },
        (res: any) => resolve(res)
      );
    });

    expect(joinResult.success).toBe(false);
    expect(joinResult.error.code).toBe(SOCKET_ERROR_CODES.ORDER_NOT_FOUND);

    driverSocket.disconnect();
  });

  test('7. Attempting to track an inactive order is rejected with ORDER_INACTIVE', async () => {
    const driverSocket = await createClient({ userId: '42', role: 'driver' });

    const joinResult = await new Promise<any>((resolve) => {
      driverSocket.emit(
        SOCKET_EVENTS.JOIN_ORDER,
        { orderId: '9999', userId: '42', role: 'driver' },
        (res: any) => resolve(res)
      );
    });

    expect(joinResult.success).toBe(false);
    expect(joinResult.error.code).toBe(SOCKET_ERROR_CODES.ORDER_INACTIVE);

    driverSocket.disconnect();
  });

  test('8. Real-time location update: Driver emits, Customer receives in real-time', async () => {
    const driverSocket = await createClient({ userId: '42', role: 'driver' });
    const customerSocket = await createClient({ userId: '15', role: 'customer' });

    // Both join the active order room
    await new Promise((resolve) => {
      driverSocket.emit(SOCKET_EVENTS.JOIN_ORDER, { orderId: '8492', userId: '42', role: 'driver' }, resolve);
    });
    await new Promise((resolve) => {
      customerSocket.emit(SOCKET_EVENTS.JOIN_ORDER, { orderId: '8492', userId: '15', role: 'customer' }, resolve);
    });

    // Customer listens for live location update
    const locationReceived = new Promise<any>((resolve) => {
      customerSocket.on(SOCKET_EVENTS.LOCATION_UPDATE, (data) => resolve(data));
    });

    // Driver emits coordinates in Addis Ababa (Bole area)
    const testLocation = {
      orderId: '8492',
      latitude: 9.0082,
      longitude: 38.7845,
      heading: 145.5,
      speed: 24.2,
      accuracy: 5.0,
      timestamp: Date.now(),
    };

    driverSocket.emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE, testLocation);

    const receivedLocation = await locationReceived;
    expect(receivedLocation.orderId).toBe('8492');
    expect(receivedLocation.latitude).toBeCloseTo(9.0082);
    expect(receivedLocation.longitude).toBeCloseTo(38.7845);
    expect(receivedLocation.heading).toBe(145.5);

    // Verify lastKnownLocation is cached in room state
    const room = trackingService.getRoomState('8492');
    expect(room?.lastKnownLocation?.latitude).toBeCloseTo(9.0082);

    driverSocket.disconnect();
    customerSocket.disconnect();
  });

  test('9. Unauthorized user cannot broadcast location coordinates', async () => {
    const imposterSocket = await createClient({ userId: '999', role: 'driver' });

    const errorReceived = new Promise<any>((resolve) => {
      imposterSocket.on(SOCKET_EVENTS.ORDER_ERROR, (err) => resolve(err));
    });

    imposterSocket.emit(SOCKET_EVENTS.DRIVER_LOCATION_UPDATE, {
      orderId: '8492',
      latitude: 9.0082,
      longitude: 38.7845,
      timestamp: Date.now(),
    });

    const error = await errorReceived;
    expect(error.code).toBe(SOCKET_ERROR_CODES.UNAUTHORIZED);

    imposterSocket.disconnect();
  });

  test('10. Peer presence: Customer receives peer:joined when driver connects', async () => {
    const customerSocket = await createClient({ userId: '15', role: 'customer' });
    await new Promise((resolve) => {
      customerSocket.emit(SOCKET_EVENTS.JOIN_ORDER, { orderId: '8492', userId: '15', role: 'customer' }, resolve);
    });

    const peerJoinedPromise = new Promise<any>((resolve) => {
      customerSocket.on(SOCKET_EVENTS.PEER_JOINED, (data) => resolve(data));
    });

    const driverSocket = await createClient({ userId: '42', role: 'driver' });
    await new Promise((resolve) => {
      driverSocket.emit(SOCKET_EVENTS.JOIN_ORDER, { orderId: '8492', userId: '42', role: 'driver' }, resolve);
    });

    const peerEvent = await peerJoinedPromise;
    expect(peerEvent.orderId).toBe('8492');
    expect(peerEvent.userId).toBe('42');
    expect(peerEvent.role).toBe('driver');

    customerSocket.disconnect();
    driverSocket.disconnect();
  });

  test('11. Driver and customer can exchange chat messages in order room', async () => {
    const driverSocket = await createClient({ userId: '42', role: 'driver' });
    const customerSocket = await createClient({ userId: '15', role: 'customer' });

    await new Promise((resolve) => {
      driverSocket.emit(SOCKET_EVENTS.JOIN_ORDER, { orderId: '8492', userId: '42', role: 'driver' }, resolve);
    });
    await new Promise((resolve) => {
      customerSocket.emit(SOCKET_EVENTS.JOIN_ORDER, { orderId: '8492', userId: '15', role: 'customer' }, resolve);
    });

    const messageReceived = new Promise<any>((resolve) => {
      customerSocket.on(SOCKET_EVENTS.ORDER_MESSAGE_RECEIVED, (msg) => resolve(msg));
    });

    driverSocket.emit(SOCKET_EVENTS.SEND_ORDER_MESSAGE, {
      orderId: '8492',
      senderId: '42',
      senderRole: 'driver',
      senderName: 'Dawit (Driver)',
      message: 'I have arrived at the restaurant, picking up your noodles now!',
      timestamp: Date.now(),
    });

    const msg = await messageReceived;
    expect(msg.orderId).toBe('8492');
    expect(msg.senderRole).toBe('driver');
    expect(msg.message).toContain('picking up your noodles');

    driverSocket.disconnect();
    customerSocket.disconnect();
  });
});
