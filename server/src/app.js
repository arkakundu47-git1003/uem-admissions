import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/error.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // behind Render / Railway / nginx

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

  app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));
  app.use('/api', rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: true,
  legacyHeaders: false
}));
  app.use('/api/v1', routes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
