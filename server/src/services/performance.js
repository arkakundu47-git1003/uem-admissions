import { createHistogram, monitorEventLoopDelay } from 'node:perf_hooks';

const METRICS_INTERVAL_MS = 60_000;
const EVENT_LOOP_RESOLUTION_MS = 20;

const toMilliseconds = (nanoseconds) => Number(nanoseconds) / 1e6;

function histogramSummary(histogram) {
  if (!histogram.count) return { count: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  return {
    count: histogram.count,
    p50Ms: toMilliseconds(histogram.percentile(50)),
    p95Ms: toMilliseconds(histogram.percentile(95)),
    p99Ms: toMilliseconds(histogram.percentile(99)),
    maxMs: toMilliseconds(histogram.max),
  };
}

function newLatencyStats() {
  return { histogram: createHistogram(), failures: 0 };
}

function recordDuration(stats, durationMs) {
  if (Number.isFinite(durationMs) && durationMs >= 0) {
    stats.histogram.record(Math.max(1, Math.round(durationMs * 1e6)));
  }
}

// Requests that never reached a route (login required, rate limited, blocked by CORS, unknown URL) are grouped by status.
function routeLabel(req, res) {
  const routePath = req.route?.path;
  if (typeof routePath !== 'string') return `${req.method} <unmatched ${res.statusCode || 0}>`;
  return `${req.method} ${req.baseUrl || ''}${routePath}`;
}

export function createPerformanceMonitor({
  logger = (record) => console.log(JSON.stringify(record)),
  intervalMs = METRICS_INTERVAL_MS,
  eventLoopResolutionMs = EVENT_LOOP_RESOLUTION_MS,
} = {}) {
  const routes = new Map();
  const commands = new Map();
  const eventLoopDelay = monitorEventLoopDelay({ resolution: eventLoopResolutionMs });
  eventLoopDelay.enable();

  const pool = {
    connections: 0,
    checkoutsInProgress: 0,
    checkoutFailures: 0,
    checkoutLatency: createHistogram(),
    checkoutCount: 0,
    created: 0,
    ready: 0,
    closed: 0,
  };

  let previousCpu = process.cpuUsage();
  let previousWallTime = process.hrtime.bigint();
  let timer;

  function getStats(map, key) {
    if (!map.has(key)) map.set(key, { ...newLatencyStats(), statuses: Object.create(null), aborted: 0 });
    return map.get(key);
  }

  function middleware(req, res, next) {
    const started = process.hrtime.bigint();
    let recorded = false;

    const record = (aborted) => {
      if (recorded) return;
      recorded = true;
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const stats = getStats(routes, routeLabel(req, res));
      recordDuration(stats, durationMs);
      const status = String(res.statusCode || 0);
      stats.statuses[status] = (stats.statuses[status] || 0) + 1;
      if (aborted) stats.aborted += 1;
      if (aborted || Number(status) >= 400) stats.failures += 1;
    };

    res.once('finish', () => record(false));
    res.once('close', () => {
      if (!res.writableFinished) record(true);
    });
    next();
  }

  function attachMongo(client) {
    client.on('commandSucceeded', (event) => {
      const stats = getStats(commands, event.commandName);
      recordDuration(stats, event.duration);
    });
    client.on('commandFailed', (event) => {
      const stats = getStats(commands, event.commandName);
      stats.failures += 1;
      recordDuration(stats, event.duration);
    });
    client.on('connectionCheckOutStarted', () => {
      pool.checkoutsInProgress += 1;
    });
    client.on('connectionCheckedOut', (event) => {
      pool.checkoutsInProgress = Math.max(0, pool.checkoutsInProgress - 1);
      recordDuration({ histogram: pool.checkoutLatency }, event.durationMS);
    });
    client.on('connectionCheckOutFailed', (event) => {
      pool.checkoutsInProgress = Math.max(0, pool.checkoutsInProgress - 1);
      pool.checkoutFailures += 1;
      recordDuration({ histogram: pool.checkoutLatency }, event.durationMS);
    });
    client.on('connectionCreated', (event) => {
      if (event.connectionId !== '<monitor>') pool.created += 1;
    });
    client.on('connectionReady', (event) => {
      if (event.connectionId !== '<monitor>') {
        pool.ready += 1;
        pool.connections += 1;
      }
    });
    client.on('connectionClosed', (event) => {
      if (event.connectionId !== '<monitor>') {
        pool.closed += 1;
        pool.connections = Math.max(0, pool.connections - 1);
      }
    });
  }

  function flush() {
    const now = process.hrtime.bigint();
    const wallMicroseconds = Number(now - previousWallTime) / 1e3;
    const cpu = process.cpuUsage(previousCpu);
    const cpuPercent = wallMicroseconds > 0 ? ((cpu.user + cpu.system) / wallMicroseconds) * 100 : 0;
    previousCpu = process.cpuUsage();
    previousWallTime = now;

    const routeMetrics = [...routes].map(([route, stats]) => ({
      route,
      ...histogramSummary(stats.histogram),
      failures: stats.failures,
      aborted: stats.aborted,
      statuses: { ...stats.statuses },
    }));
    const commandMetrics = [...commands].map(([command, stats]) => ({
      command,
      ...histogramSummary(stats.histogram),
      failures: stats.failures,
    }));
    const memory = process.memoryUsage();
    const output = {
      type: 'performance',
      at: new Date().toISOString(),
      intervalMs,
      process: {
        cpuPercent: Math.round(cpuPercent * 10) / 10,
        memoryBytes: {
          rss: memory.rss,
          heapUsed: memory.heapUsed,
          heapTotal: memory.heapTotal,
          external: memory.external,
        },
        eventLoopDelayMs: {
          p50: toMilliseconds(eventLoopDelay.percentile(50)),
          p95: toMilliseconds(eventLoopDelay.percentile(95)),
          p99: toMilliseconds(eventLoopDelay.percentile(99)),
          max: toMilliseconds(eventLoopDelay.max),
        },
      },
      http: routeMetrics,
      mongo: {
        commands: commandMetrics,
        pool: {
          connections: pool.connections,
          created: pool.created,
          ready: pool.ready,
          closed: pool.closed,
          checkoutsInProgress: pool.checkoutsInProgress,
          checkoutFailures: pool.checkoutFailures,
          checkoutLatencyMs: histogramSummary(pool.checkoutLatency),
        },
      },
    };

    logger(output);
    routes.clear();
    commands.clear();
    pool.created = 0;
    pool.ready = 0;
    pool.closed = 0;
    pool.checkoutFailures = 0;
    pool.checkoutLatency.reset();
    eventLoopDelay.reset();
    return output;
  }

  function start() {
    if (!timer) {
      timer = setInterval(flush, intervalMs);
      timer.unref();
    }
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
    eventLoopDelay.disable();
  }

  return { middleware, attachMongo, flush, start, stop };
}
