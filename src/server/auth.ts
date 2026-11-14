import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { adminAuth } from '../lib/firebase-admin.ts';
import { db } from '../db/index.ts';
import { users, profiles } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { computeProfileCompletion, sanitizeFullName } from './services/profileCompletion.ts';

export interface AuthenticatedUser {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  role: 'PARTICIPANT' | 'TEAM_LEADER' | 'ADMIN';
  status: string;
  institution: string;
  location: string;
}

export interface AuthRequest extends Request {
  authUser?: AuthenticatedUser;
}

const getJwtSecret = () => process.env.JWT_SECRET || 'hackforge-dev-jwt-secret-change-in-prod';
const getRefreshSecret = () => process.env.JWT_REFRESH_SECRET || 'hackforge-dev-refresh-secret-change-in-prod';

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signAccessToken(user: { id: string; email: string; role: string }): string {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, getJwtSecret(), {
    expiresIn: '2h',
  });
}

export function signRefreshToken(user: { id: string; email: string; role: string }): string {
  return jwt.sign({ userId: user.id, email: user.email, role: user.role }, getRefreshSecret(), {
    expiresIn: '7d',
  });
}

export function verifyRefreshToken(token: string): { userId: string; email: string; role: string } {
  return jwt.verify(token, getRefreshSecret()) as { userId: string; email: string; role: string };
}

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('hf_access', accessToken, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 2 * 60 * 60 * 1000,
    path: '/',
  });
  res.cookie('hf_refresh', refreshToken, {
    httpOnly: true,
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie('hf_access', { path: '/' });
  res.clearCookie('hf_refresh', { path: '/' });
}

export async function getOrCreateFirebaseUser(uid: string, email: string, fullName?: string) {
  const displayName = sanitizeFullName(fullName, email);
  const result = await db
    .insert(users)
    .values({
      uid,
      email: email.toLowerCase(),
      fullName: displayName,
      role: 'PARTICIPANT',
      status: 'ACTIVE',
    })
    .onConflictDoUpdate({
      target: users.uid,
      set: {
        email: email.toLowerCase(),
        updatedAt: new Date(),
      },
    })
    .returning();

  let user = result[0];
  const sanitizedExisting = sanitizeFullName(user.fullName, user.email);
  if (sanitizedExisting !== user.fullName) {
    const [fixed] = await db
      .update(users)
      .set({ fullName: sanitizedExisting, updatedAt: new Date() })
      .where(eq(users.id, user.id))
      .returning();
    if (fixed) user = fixed;
  }

  const { completionPct } = computeProfileCompletion({
    fullName: user.fullName,
    institution: user.institution,
    location: user.location,
    bio: '',
    experienceLevel: 'Intermediate',
    preferredRole: 'Full-Stack Developer',
    collaborationMode: 'Hybrid',
    projectInterests: [],
    skillCount: 0,
  });

  await db
    .insert(profiles)
    .values({
      userId: user.id,
      completionPct,
    })
    .onConflictDoNothing({ target: profiles.userId });

  return user;
}

export async function resolveTokenToUser(token: string): Promise<AuthenticatedUser | null> {
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { userId: string };
    const [dbUser] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!dbUser) return null;
    return {
      id: dbUser.id,
      uid: dbUser.uid,
      email: dbUser.email,
      fullName: sanitizeFullName(dbUser.fullName, dbUser.email),
      role: dbUser.role as AuthenticatedUser['role'],
      status: dbUser.status,
      institution: dbUser.institution,
      location: dbUser.location,
    };
  } catch {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      if (!decoded.email) return null;
      const dbUser = await getOrCreateFirebaseUser(decoded.uid, decoded.email, decoded.name);
      return {
        id: dbUser.id,
        uid: dbUser.uid,
        email: dbUser.email,
        fullName: sanitizeFullName(dbUser.fullName, dbUser.email),
        role: dbUser.role as AuthenticatedUser['role'],
        status: dbUser.status,
        institution: dbUser.institution,
        location: dbUser.location,
      };
    } catch {
      return null;
    }
  }
}

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies?.hf_access) {
    token = String(req.cookies.hf_access);
  }

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await resolveTokenToUser(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }

  if (user.status === 'SUSPENDED') {
    return res.status(403).json({ error: 'Account is suspended. Contact an administrator.' });
  }

  req.authUser = user;
  next();
};

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.cookies?.hf_access) {
    token = String(req.cookies.hf_access);
  }

  if (token) {
    const user = await resolveTokenToUser(token);
    if (user && user.status !== 'SUSPENDED') {
      req.authUser = user;
    }
  }
  next();
};

export const requireRole = (...allowedRoles: Array<'PARTICIPANT' | 'TEAM_LEADER' | 'ADMIN'>) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.authUser.role)) {
      return res.status(403).json({
        error: `Forbidden: Requires ${allowedRoles.join(' or ')} permissions`,
      });
    }
    next();
  };
};

// Sliding-window rate limiter for auth endpoints
const rateBuckets = new Map<string, number[]>();

export const rateLimitAuth = (maxRequests = 40, windowMs = 60_000) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.headers['x-forwarded-for']?.toString() || 'local';
    const now = Date.now();
    const history = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (history.length >= maxRequests) {
      return res.status(429).json({ error: 'Too many authentication requests. Please wait a minute.' });
    }
    history.push(now);
    rateBuckets.set(key, history);
    next();
  };
};
