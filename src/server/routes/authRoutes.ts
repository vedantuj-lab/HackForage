import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../../db/index.ts';
import { profiles, userSkills, users } from '../../db/schema.ts';
import { count, eq } from 'drizzle-orm';
import {
  clearAuthCookies,
  getOrCreateFirebaseUser,
  hashPassword,
  rateLimitAuth,
  requireAuth,
  AuthRequest,
  setAuthCookies,
  signAccessToken,
  signRefreshToken,
  verifyPassword,
  verifyRefreshToken,
} from '../auth.ts';
import { adminAuth } from '../../lib/firebase-admin.ts';
import { logAudit } from '../services/auditAndNotify.ts';
import { computeProfileCompletion, sanitizeFullName } from '../services/profileCompletion.ts';

const router = Router();

async function buildUserPayload(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!user) return null;
  let [profile] = await db.select().from(profiles).where(eq(profiles.userId, userId)).limit(1);
  const [{ skillCnt }] = await db
    .select({ skillCnt: count() })
    .from(userSkills)
    .where(eq(userSkills.userId, userId));

  const cleanFullName = sanitizeFullName(user.fullName, user.email);
  const { completionPct } = computeProfileCompletion({
    fullName: cleanFullName,
    institution: user.institution,
    location: user.location,
    bio: profile?.bio ?? '',
    experienceLevel: profile?.experienceLevel ?? 'Intermediate',
    preferredRole: profile?.preferredRole ?? 'Full-Stack Developer',
    collaborationMode: profile?.collaborationMode ?? 'Hybrid',
    projectInterests: profile?.projectInterests ?? [],
    skillCount: Number(skillCnt) || 0,
  });

  if (profile && profile.completionPct !== completionPct) {
    const [synced] = await db
      .update(profiles)
      .set({ completionPct, updatedAt: new Date() })
      .where(eq(profiles.userId, userId))
      .returning();
    if (synced) profile = synced;
  }

  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    fullName: cleanFullName,
    role: user.role,
    status: user.status,
    institution: user.institution,
    location: user.location,
    profile: profile ? { ...profile, completionPct } : null,
  };
}

router.post('/register', rateLimitAuth(30, 60_000), async (req, res) => {
  try {
    const { fullName, email, password, institution, location } = req.body as {
      fullName?: string;
      email?: string;
      password?: string;
      institution?: string;
      location?: string;
    };

    if (!fullName?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Full name, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await hashPassword(password);
    const cleanFullName = sanitizeFullName(fullName, normalizedEmail);
    const cleanInst = institution?.trim() || '';
    const cleanLoc = location?.trim() || '';

    // Security rule: public registration ALWAYS creates PARTICIPANT role
    const [createdUser] = await db
      .insert(users)
      .values({
        uid: `local-${crypto.randomUUID()}`,
        email: normalizedEmail,
        passwordHash,
        fullName: cleanFullName,
        role: 'PARTICIPANT',
        status: 'ACTIVE',
        institution: cleanInst,
        location: cleanLoc,
      })
      .returning();

    const { completionPct } = computeProfileCompletion({
      fullName: cleanFullName,
      institution: cleanInst,
      location: cleanLoc,
      bio: '',
      experienceLevel: 'Intermediate',
      preferredRole: 'Full-Stack Developer',
      collaborationMode: 'Hybrid',
      projectInterests: [],
      skillCount: 0,
    });

    await db.insert(profiles).values({
      userId: createdUser.id,
      completionPct,
    });

    const accessToken = signAccessToken({
      id: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
    });
    const refreshToken = signRefreshToken({
      id: createdUser.id,
      email: createdUser.email,
      role: createdUser.role,
    });

    setAuthCookies(res, accessToken, refreshToken);
    await logAudit({
      actorId: createdUser.id,
      action: 'USER_REGISTERED',
      entityType: 'USER',
      entityId: createdUser.id,
      metadata: { role: 'PARTICIPANT' },
    });

    const userPayload = await buildUserPayload(createdUser.id);
    return res.status(201).json({ accessToken, user: userPayload });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

router.post('/login', rateLimitAuth(40, 60_000), async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email?.trim() || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'This account has been suspended by an administrator.' });
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id, email: user.email, role: user.role });
    setAuthCookies(res, accessToken, refreshToken);

    await logAudit({
      actorId: user.id,
      action: 'USER_LOGIN',
      entityType: 'USER',
      entityId: user.id,
      metadata: { method: 'password' },
    });

    const userPayload = await buildUserPayload(user.id);
    return res.json({ accessToken, user: userPayload });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed.' });
  }
});

router.post('/firebase', rateLimitAuth(40, 60_000), async (req, res) => {
  try {
    const { idToken } = req.body as { idToken?: string };
    if (!idToken) {
      return res.status(400).json({ error: 'Firebase ID token is required.' });
    }
    const decoded = await adminAuth.verifyIdToken(idToken);
    if (!decoded.email) {
      return res.status(400).json({ error: 'Verified Google account must include an email address.' });
    }

    const user = await getOrCreateFirebaseUser(decoded.uid, decoded.email, decoded.name);
    if (user.status === 'SUSPENDED') {
      return res.status(403).json({ error: 'This account has been suspended by an administrator.' });
    }

    const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id, email: user.email, role: user.role });
    setAuthCookies(res, accessToken, refreshToken);

    const userPayload = await buildUserPayload(user.id);
    return res.json({ accessToken, user: userPayload });
  } catch (err) {
    console.error('Firebase auth error:', err);
    return res.status(401).json({ error: 'Invalid Firebase token.' });
  }
});

router.post('/logout', (_req, res) => {
  clearAuthCookies(res);
  return res.json({ success: true });
});

router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const userPayload = await buildUserPayload(req.authUser!.id);
  const accessToken = signAccessToken({
    id: req.authUser!.id,
    email: req.authUser!.email,
    role: req.authUser!.role,
  });
  return res.json({ user: userPayload, accessToken });
});

router.post('/refresh', async (req, res) => {
  try {
    const token = req.cookies?.hf_refresh as string | undefined;
    if (!token) {
      return res.status(401).json({ error: 'Refresh token missing.' });
    }
    const payload = verifyRefreshToken(token);
    const [user] = await db.select().from(users).where(eq(users.id, payload.userId)).limit(1);
    if (!user || user.status === 'SUSPENDED') {
      clearAuthCookies(res);
      return res.status(401).json({ error: 'Session expired.' });
    }

    const accessToken = signAccessToken({ id: user.id, email: user.email, role: user.role });
    const refreshToken = signRefreshToken({ id: user.id, email: user.email, role: user.role });
    setAuthCookies(res, accessToken, refreshToken);

    const userPayload = await buildUserPayload(user.id);
    return res.json({ accessToken, user: userPayload });
  } catch {
    clearAuthCookies(res);
    return res.status(401).json({ error: 'Invalid refresh token.' });
  }
});

router.post('/forgot-password', rateLimitAuth(15, 60_000), async (req, res) => {
  try {
    const { email } = req.body as { email?: string };
    if (!email?.trim()) {
      return res.status(400).json({ error: 'Email is required.' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, normalizedEmail)).limit(1);

    let resetCode: string | undefined;
    if (user) {
      resetCode = crypto.randomBytes(16).toString('hex');
      await db
        .update(users)
        .set({
          resetToken: resetCode,
          resetTokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
    }

    return res.json({
      message: 'If an account matches that email, a password reset link has been generated.',
      ...(process.env.NODE_ENV !== 'production' && resetCode ? { resetToken: resetCode } : {}),
    });
  } catch (err) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: 'Could not process password reset request.' });
  }
});

router.post('/reset-password', rateLimitAuth(15, 60_000), async (req, res) => {
  try {
    const { token, newPassword } = req.body as { token?: string; newPassword?: string };
    if (!token || !newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'Valid reset token and password (min 8 chars) are required.' });
    }

    const [user] = await db.select().from(users).where(eq(users.resetToken, token)).limit(1);
    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Reset token is invalid or expired.' });
    }

    const passwordHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({
        passwordHash,
        resetToken: null,
        resetTokenExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, user.id));

    return res.json({ message: 'Password updated successfully. You may now sign in.' });
  } catch (err) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: 'Password reset failed.' });
  }
});

export default router;
