import axios, { AxiosInstance } from 'axios';
import { env } from '../config/env.config';
import { ACTIVE_ORDER_STATUSES, SOCKET_ERROR_CODES } from '../config/constants';
import { ActiveOrder, OrderPeerRole } from '../types/order.types';
import { SocketAuthenticationError } from '../types/error.types';
import { logger } from './logger.service';

interface CachedOrder {
  order: ActiveOrder;
  cachedAt: number;
}

export class OrderService {
  private httpClient: AxiosInstance;
  private orderCache = new Map<string, CachedOrder>();
  private mockOrders = new Map<string, ActiveOrder>();

  constructor() {
    this.httpClient = axios.create({
      baseURL: env.BACKEND_API_BASE_URL,
      timeout: 8000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...(env.BACKEND_API_KEY ? { 'Authorization': `Bearer ${env.BACKEND_API_KEY}` } : {}),
      },
    });

    // Populate default mock order for local dev and testing
    this.registerMockOrder({
      id: '8492',
      orderNumber: 'AMN-8492',
      status: '1', // active: assigned
      driverId: '42',
      customerId: '15',
      restaurantName: 'Chanoly Noodles (Bole Atlas)',
      customerName: 'Amanuel Tilahun',
      driverName: 'Dawit Tadesse',
      pickupLocation: { latitude: 9.0082, longitude: 38.7845, address: 'Bole Atlas' },
      deliveryLocation: { latitude: 9.0221, longitude: 38.7468, address: 'Kazanchis' },
      verifiedAt: Date.now(),
    });
  }

  /**
   * Registers or updates a mock order in-memory (useful for unit tests and local dev)
   */
  public registerMockOrder(order: ActiveOrder): void {
    const key = String(order.id);
    this.mockOrders.set(key, order);
    this.orderCache.set(key, { order, cachedAt: Date.now() });
  }

  /**
   * Checks if an order status is active and eligible for real-time tracking
   */
  public isStatusActive(status: string | number): boolean {
    const normalized = String(status).toLowerCase().trim();
    return (ACTIVE_ORDER_STATUSES as readonly string[]).includes(normalized);
  }

  /**
   * Fetches order details from cache, backend REST API, or mock repository
   */
  public async getOrderDetails(orderId: string | number, authToken?: string): Promise<ActiveOrder | null> {
    const orderKey = String(orderId);
    const now = Date.now();

    // 1. Check in-memory cache
    const cached = this.orderCache.get(orderKey);
    const ttlMs = env.ORDER_CACHE_TTL_SECONDS * 1000;
    if (cached && (now - cached.cachedAt) < ttlMs) {
      return cached.order;
    }

    // 2. If in mock mode or fallback mode with registered mock, use it
    if (env.VALIDATION_MODE === 'mock' || (env.VALIDATION_MODE === 'fallback' && this.mockOrders.has(orderKey))) {
      const mock = this.mockOrders.get(orderKey);
      if (mock) {
        this.orderCache.set(orderKey, { order: mock, cachedAt: now });
        return mock;
      }
    }

    // 3. Query backend REST API: GET /my_order_detail/{orderId}
    try {
      logger.debug(`Fetching order ${orderKey} from backend API...`);
      const response = await this.httpClient.get(`/my_order_detail/${orderKey}`, {
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      });

      if (!response.data || response.data?.success === false) {
        return null;
      }

      const res = response.data;
      if (!res) return null;

      // AMN API returns { data: [...items], order_status: { id: 15, ... } }
      // When order is not found, it returns { message: "...", data: [], order_status: null }
      const statusObj: Record<string, any> | null =
        (res.order_status && typeof res.order_status === 'object')
          ? res.order_status
          : (res.data && typeof res.data === 'object' && !Array.isArray(res.data))
            ? res.data
            : null;

      const itemsList: any[] = Array.isArray(res.data) ? res.data : [];
      const firstItem: Record<string, any> | null = itemsList.length > 0 ? itemsList[0] : null;

      // An order MUST have an order ID in statusObj or firstItem, or customer_id in statusObj
      const idVal = statusObj?.id ?? statusObj?.order_id ?? statusObj?.order_number ?? firstItem?.order_id;
      if (!idVal && !statusObj?.customer_id && !statusObj?.user_id) {
        return null;
      }

      const activeOrder: ActiveOrder = {
        id: idVal ?? orderKey,
        orderNumber: String(statusObj?.order_number ?? statusObj?.order_id ?? `AMN-${idVal ?? orderKey}`),
        status: String(statusObj?.status ?? firstItem?.order_status ?? '0'),
        driverId: String(statusObj?.driver_id ?? statusObj?.delivery_man_id ?? statusObj?.driver?.id ?? firstItem?.driver_id ?? ''),
        customerId: String(statusObj?.customer_id ?? statusObj?.user_id ?? statusObj?.customer?.id ?? firstItem?.customer_id ?? ''),
        restaurantId: statusObj?.property_id ?? statusObj?.restaurant_id ?? statusObj?.store_id ?? firstItem?.property_id,
        restaurantName: firstItem?.property ?? statusObj?.restaurant_name ?? statusObj?.property_name,
        customerName: firstItem?.customer_first_name
          ? `${firstItem.customer_first_name} ${firstItem.customer_last_name ?? ''}`.trim()
          : `${statusObj?.customer?.f_name ?? statusObj?.f_name ?? ''} ${statusObj?.customer?.l_name ?? statusObj?.l_name ?? ''}`.trim(),
        driverName: `${statusObj?.driver?.f_name ?? firstItem?.driver_name ?? ''} ${statusObj?.driver?.l_name ?? ''}`.trim(),
        pickupLocation: (statusObj?.restaurant_latitude && statusObj?.restaurant_longitude) ? {
          latitude: parseFloat(statusObj.restaurant_latitude),
          longitude: parseFloat(statusObj.restaurant_longitude),
          address: statusObj.restaurant_address ?? statusObj.location,
        } : undefined,
        deliveryLocation: (statusObj?.latitude && statusObj?.longitude) ? {
          latitude: parseFloat(statusObj.latitude),
          longitude: parseFloat(statusObj.longitude),
          address: statusObj.location ?? statusObj.delivery_address,
        } : (statusObj?.delivery_latitude && statusObj?.delivery_longitude) ? {
          latitude: parseFloat(statusObj.delivery_latitude),
          longitude: parseFloat(statusObj.delivery_longitude),
          address: statusObj.delivery_address,
        } : undefined,
        raw: res,
        verifiedAt: now,
      };

      this.orderCache.set(orderKey, { order: activeOrder, cachedAt: now });
      return activeOrder;
    } catch (error) {
      logger.warn(`Failed to fetch order ${orderKey} from backend REST API: ${(error as Error).message}`);

      // Fallback mode behavior
      if (env.VALIDATION_MODE === 'fallback') {
        const fallback = this.mockOrders.get(orderKey);
        if (fallback) {
          logger.info(`Using fallback mock data for order ${orderKey}`);
          return fallback;
        }
      }

      return null;
    }
  }

  /**
   * Primary Security & Validation Gate:
   * 1. Confirms order exists.
   * 2. Confirms order status is ACTIVE (not delivered, not cancelled).
   * 3. Confirms user ID matches assigned Driver ID (if role is driver)
   *    or Customer ID (if role is customer).
   */
  public async validateOrderAndParticipant(
    orderId: string | number,
    userId: string | number,
    role: OrderPeerRole,
    authToken?: string
  ): Promise<ActiveOrder> {
    const orderKey = String(orderId);
    const userKey = String(userId).trim();

    const order = await this.getOrderDetails(orderKey, authToken);

    // 1. Order Existence Check
    if (!order) {
      throw new SocketAuthenticationError(
        SOCKET_ERROR_CODES.ORDER_NOT_FOUND,
        `Order #${orderKey} could not be found or verified on the server.`,
        orderKey
      );
    }

    // 2. Active Status Check
    if (!this.isStatusActive(order.status)) {
      throw new SocketAuthenticationError(
        SOCKET_ERROR_CODES.ORDER_INACTIVE,
        `Order #${orderKey} is not in an active tracking status (current status: '${order.status}'). Tracking is only permitted for active deliveries.`,
        orderKey,
        { currentStatus: order.status }
      );
    }

    // 3. Role & Identity Matching Check
    if (role === 'driver') {
      const assignedDriver = String(order.driverId).trim();
      if (!assignedDriver || assignedDriver !== userKey) {
        logger.warn(
          `Unauthorized driver access attempt: userId '${userKey}' attempted to track order #${orderKey} assigned to driver '${assignedDriver}'`
        );
        throw new SocketAuthenticationError(
          SOCKET_ERROR_CODES.DRIVER_MISMATCH,
          `Driver mismatch: User ID '${userKey}' is not the assigned driver for Order #${orderKey}.`,
          orderKey,
          { assignedDriverId: assignedDriver, requestedUserId: userKey }
        );
      }
    } else if (role === 'customer') {
      const orderCustomer = String(order.customerId).trim();
      if (!orderCustomer || orderCustomer !== userKey) {
        logger.warn(
          `Unauthorized customer access attempt: userId '${userKey}' attempted to access order #${orderKey} owned by customer '${orderCustomer}'`
        );
        throw new SocketAuthenticationError(
          SOCKET_ERROR_CODES.CUSTOMER_MISMATCH,
          `Customer mismatch: User ID '${userKey}' is not the authorized customer for Order #${orderKey}.`,
          orderKey,
          { orderCustomerId: orderCustomer, requestedUserId: userKey }
        );
      }
    } else if (role !== 'admin') {
      throw new SocketAuthenticationError(
        SOCKET_ERROR_CODES.UNAUTHORIZED,
        `Invalid peer role '${role}' provided. Expected 'driver' or 'customer'.`,
        orderKey
      );
    }

    return order;
  }

  /**
   * Invalidates cached order state (e.g., when order is completed or cancelled)
   */
  public invalidateCache(orderId: string | number): void {
    this.orderCache.delete(String(orderId));
  }

  /**
   * Updates an order status in the local cache
   */
  public updateCachedStatus(orderId: string | number, newStatus: string | number): void {
    const key = String(orderId);
    const cached = this.orderCache.get(key);
    if (cached) {
      cached.order.status = newStatus;
      cached.cachedAt = Date.now();
    }
  }
}

export const orderService = new OrderService();
