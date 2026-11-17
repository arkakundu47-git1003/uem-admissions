import express from 'express';
import mongoose from 'mongoose';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import { apiLimiter } from './middleware/rateLimits.js';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/error.js';

export function createApp({ performanceMiddleware } = {}) {
  const app = express();
  app.set('trust proxy', 1); // behind Render / Railway / nginx

  if (performanceMiddleware) app.use(performanceMiddleware);
  app.use(helmet());
  const origins = env.CLIENT_ORIGIN.split(',').map((s) => s.trim());
  app.use(
    cors({
      origin: (origin, cb) => (!origin || origins.includes(origin) ? cb(null, true) : cb(new Error('Not allowed by CORS'))),
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  if (env.NODE_ENV !== 'test') app.use(morgan(env.isProd ? 'combined' : 'dev'));

  // Always HTTP 200 (the host's health check must not restart the service over a database blip); read `db` for the real state.
  app.get('/health', (req, res) => {
    const db = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
    res.json({ status: db === 'connected' ? 'ok' : 'degraded', db, appEnv: env.APP_ENV, uptime: process.uptime() });
  });
  app.use('/api', apiLimiter);
  app.use('/api/v1', routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
