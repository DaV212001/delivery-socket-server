import { SOCKET_ERROR_CODES } from '../config/constants';

export type SocketErrorCode = keyof typeof SOCKET_ERROR_CODES;

export interface SocketErrorPayload {
  code: SocketErrorCode;
  message: string;
  orderId?: string | number;
  details?: Record<string, unknown>;
  timestamp: number;
}

export class SocketAuthenticationError extends Error {
  public readonly code: SocketErrorCode;
  public readonly orderId?: string | number;
  public readonly details?: Record<string, unknown>;

  constructor(code: SocketErrorCode, message: string, orderId?: string | number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'SocketAuthenticationError';
    this.code = code;
    this.orderId = orderId;
    this.details = details;
    Object.setPrototypeOf(this, SocketAuthenticationError.prototype);
  }

  public toPayload(): SocketErrorPayload {
    return {
      code: this.code,
      message: this.message,
      orderId: this.orderId,
      details: this.details,
      timestamp: Date.now(),
    };
  }
}
