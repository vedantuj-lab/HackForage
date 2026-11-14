import { Server as HttpServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

let io: SocketIOServer | null = null;

const getJwtSecret = () => process.env.JWT_SECRET || 'hackforge-dev-jwt-secret-change-in-prod';

export function initRealtime(httpServer: HttpServer) {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || true,
      credentials: true,
    },
    path: '/socket.io',
  });

  io.use(async (socket, next) => {
    try {
      const token =
        (socket.handshake.auth?.token as string | undefined) ||
        socket.handshake.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return next(new Error('Authentication required'));
      }

      try {
        const payload = jwt.verify(token, getJwtSecret()) as { userId: string; role: string };
        socket.data.userId = payload.userId;
        socket.data.role = payload.role;
        return next();
      } catch {
        const decoded = await adminAuth.verifyIdToken(token);
        const [dbUser] = await db
          .select({ id: users.id, role: users.role })
          .from(users)
          .where(eq(users.uid, decoded.uid))
          .limit(1);
        if (!dbUser) {
          return next(new Error('User not found'));
        }
        socket.data.userId = dbUser.id;
        socket.data.role = dbUser.role;
        return next();
      }
    } catch {
      return next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.on('team:subscribe', (teamId: string) => {
      if (typeof teamId === 'string' && teamId.length > 0) {
        socket.join(`team:${teamId}`);
      }
    });

    socket.on('team:unsubscribe', (teamId: string) => {
      if (typeof teamId === 'string' && teamId.length > 0) {
        socket.leave(`team:${teamId}`);
      }
    });
  });

  return io;
}

export function emitToUser(userId: string, event: string, payload: unknown) {
  if (io) {
    io.to(`user:${userId}`).emit(event, payload);
  }
}

export function emitToTeam(teamId: string, event: string, payload: unknown) {
  if (io) {
    io.to(`team:${teamId}`).emit(event, payload);
  }
}

export function emitGlobal(event: string, payload: unknown) {
  if (io) {
    io.emit(event, payload);
  }
}
