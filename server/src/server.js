import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { createPerformanceMonitor } from './services/performance.js';

async function main() {
  const performanceMonitor = createPerformanceMonitor();
  await connectDB(env.MONGODB_URI, (client) => performanceMonitor.attachMongo(client));
  if (env.PERFORMANCE_LOG) performanceMonitor.start();
  const app = createApp({ performanceMiddleware: performanceMonitor.middleware });
  const server = app.listen(env.PORT, () => console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`));

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down`);
    performanceMonitor.stop();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
