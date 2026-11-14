import 'dotenv/config';
import express from 'express';
import http from 'http';
import path from 'path';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import { ensureSeeded } from './src/db/seed.ts';
import { initRealtime } from './src/server/realtime.ts';
import authRoutes from './src/server/routes/authRoutes.ts';
import userRoutes from './src/server/routes/userRoutes.ts';
import teamRoutes from './src/server/routes/teamRoutes.ts';
import collaborationRoutes from './src/server/routes/collaborationRoutes.ts';
import adminRoutes from './src/server/routes/adminRoutes.ts';

export async function createHackForgeApp(options?: { skipVite?: boolean }) {
  const app = express();
  const httpServer = http.createServer(app);

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  initRealtime(httpServer);

  // Health probe
  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'hackforge-api' });
  });

  // Lazy single-flight seed on first API access (no eager startup DB probe)
  app.use('/api', async (req, res, next) => {
    if (req.path === '/health') return next();
    try {
      await ensureSeeded();
      next();
    } catch (err) {
      console.error('Database initialization error:', err);
      res.status(503).json({ error: 'Database is initializing or unreachable. Please retry.' });
    }
  });

  app.use('/api/auth', authRoutes);
  app.use('/api', userRoutes);
  app.use('/api', teamRoutes);
  app.use('/api', collaborationRoutes);
  app.use('/api/admin', adminRoutes);

  if (!options?.skipVite) {
    if (process.env.NODE_ENV !== 'production') {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.resolve(process.cwd(), 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return { app, httpServer };
}

if (process.argv[1] && (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'))) {
  const PORT = Number(process.env.PORT) || 3000;
  createHackForgeApp().then(({ httpServer }) => {
    httpServer.listen(PORT, '0.0.0.0', () => {
      console.log(`HackForge server listening on http://0.0.0.0:${PORT}`);
    });
  });
}
