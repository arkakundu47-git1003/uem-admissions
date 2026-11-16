import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { Application } from '../src/models/Application.js';
import { Course } from '../src/models/Course.js';
import { Notification } from '../src/models/Misc.js';
import { createPerformanceMonitor } from '../src/services/performance.js';

describe('performance metrics', () => {
  it('records route templates, response status and aborted responses without URL values', () => {
    const records = [];
    const monitor = createPerformanceMonitor({ logger: (record) => records.push(record) });
    const req = {
      method: 'GET',
      baseUrl: '/api/v1/courses',
      originalUrl: '/api/v1/courses/private-id?email=private@example.com',
      route: { path: '/:id' },
    };
    const res = new EventEmitter();
    res.statusCode = 200;
    res.writableFinished = true;
    monitor.middleware(req, res, () => res.emit('finish'));

    res.statusCode = 503;
    res.writableFinished = false;
    monitor.middleware({ method: 'GET', baseUrl: '', route: { path: '/health' } }, res, () => res.emit('close'));
    const record = monitor.flush();
    monitor.stop();

    expect(record.http).toHaveLength(2);
    expect(record.http[0]).toMatchObject({
      route: 'GET /api/v1/courses/:id',
      count: 1,
      statuses: { 200: 1 },
    });
    expect(record.http[1]).toMatchObject({
      route: 'GET /health',
      count: 1,
      statuses: { 503: 1 },
      aborted: 1,
    });
    expect(JSON.stringify(records)).not.toContain('private-id');
    expect(JSON.stringify(records)).not.toContain('private@example.com');
    expect(record.process.memoryBytes.rss).toBeGreaterThan(0);
    expect(record.process.eventLoopDelayMs).toHaveProperty('p95');
  });

  it('records Mongo command and pool checkout durations and failures', () => {
    const records = [];
    const monitor = createPerformanceMonitor({ logger: (record) => records.push(record) });
    const client = new EventEmitter();
    monitor.attachMongo(client);
    client.emit('commandSucceeded', { commandName: 'find', duration: 12 });
    client.emit('commandFailed', { commandName: 'update', duration: 20 });
    client.emit('connectionCheckOutStarted');
    client.emit('connectionCheckedOut', { durationMS: 4, connectionId: 1 });
    client.emit('connectionCheckOutStarted');
    client.emit('connectionCheckOutFailed', { durationMS: 40 });
    client.emit('connectionCreated', { connectionId: 2 });
    client.emit('connectionReady', { connectionId: 2 });

    const record = monitor.flush();
    monitor.stop();

    expect(record.mongo.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: 'find', count: 1, failures: 0 }),
      expect.objectContaining({ command: 'update', count: 1, failures: 1 }),
    ]));
    expect(record.mongo.pool).toMatchObject({
      connections: 1,
      created: 1,
      ready: 1,
      checkoutFailures: 1,
      checkoutsInProgress: 0,
    });
    expect(record.mongo.pool.checkoutLatencyMs.count).toBe(2);
  });
});

describe('performance query indexes', () => {
  it('declares indexes for high-frequency listing filters and sorts', () => {
    expect(Application.schema.indexes().map(([keys]) => keys)).toContainEqual({ applicant: 1, updatedAt: -1 });
    expect(Course.schema.indexes().map(([keys]) => keys)).toContainEqual({ isOpen: 1, deadline: 1, name: 1 });
    expect(Notification.schema.indexes().map(([keys]) => keys)).toContainEqual({ user: 1, createdAt: -1 });
    expect(Notification.schema.indexes().map(([keys]) => keys)).toContainEqual({ user: 1, read: 1 });
  });
});
