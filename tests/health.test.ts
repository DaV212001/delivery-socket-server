import http from 'http';
import { AddressInfo } from 'net';
import axios from 'axios';
import { createApp } from '../src/app';

describe('HTTP & Health Check API Tests', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll((done) => {
    const app = createApp();
    server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  test('GET / returns server informational metadata', async () => {
    const res = await axios.get(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.data.service).toContain('AMN Delivery');
    expect(res.data.status).toBe('online');
    expect(res.data.healthCheck).toBe('/health');
  });

  test('GET /health returns healthy status for Render probes', async () => {
    const res = await axios.get(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('healthy');
    expect(typeof res.data.uptimeSeconds).toBe('number');
    expect(typeof res.data.activeRooms).toBe('number');
    expect(res.data.memory).toBeDefined();
  });

  test('GET /metrics returns active rooms and summary', async () => {
    const res = await axios.get(`${baseUrl}/metrics`);
    expect(res.status).toBe(200);
    expect(res.data.activeRoomsCount).toBeDefined();
    expect(Array.isArray(res.data.activeOrders)).toBe(true);
  });

  test('GET /unknown-path returns 404', async () => {
    try {
      await axios.get(`${baseUrl}/unknown-path`);
      fail('Expected 404');
    } catch (err: any) {
      expect(err.response.status).toBe(404);
      expect(err.response.data.error).toBe('Not Found');
    }
  });
});
