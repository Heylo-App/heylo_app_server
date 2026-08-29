import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { createServer } from 'http';
import { initSocket } from './socket';

import { config } from './config/env';
import { connectDB } from './config/db';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

// Connect to MongoDB
connectDB();

// Route imports
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import momentsRoutes from './routes/moments.routes';
import chatsRoutes from './routes/chats.routes';
import voiceRoutes from './routes/voice.routes';
import moderationRoutes from './routes/moderation.routes';
import onboardingRoutes from './routes/onboarding.routes';

const app = express();

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(helmet());
app.use(cors({ origin: config.corsOrigin, credentials: true }));
app.use(morgan(config.isDev ? 'dev' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/moments', momentsRoutes);
app.use('/chats', chatsRoutes);
app.use('/voice', voiceRoutes);
app.use('/moderation', moderationRoutes);
app.use('/onboarding', onboardingRoutes);

// ---------------------------------------------------------------------------
// Error handling
// ---------------------------------------------------------------------------
app.use(notFound);
app.use(errorHandler);

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
const httpServer = createServer(app);
initSocket(httpServer);

httpServer.listen(config.port, () => {
  console.log(`
  🚀 Heylo API Server
  ───────────────────────────
  Environment : ${config.nodeEnv}
  Port        : ${config.port}
  Health      : http://localhost:${config.port}/health
  ───────────────────────────
  `);
});

export default app;
