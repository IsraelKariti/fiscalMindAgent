import crypto from 'node:crypto';
import type { Request, RequestHandler, Response } from 'express';
import { env } from '../config/env.js';

const SESSION_COOKIE = 'fm_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const sessionSecret = env.DASHBOARD_SESSION_SECRET ?? crypto.randomBytes(32).toString('hex');

function sign(payload: string): string {
  return crypto.createHmac('sha256', sessionSecret).update(payload).digest('hex');
}

function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

function isValidSession(req: Request): boolean {
  const cookie = readCookie(req, SESSION_COOKIE);
  if (!cookie) return false;
  const dot = cookie.indexOf('.');
  if (dot === -1) return false;
  const expiresAt = cookie.slice(0, dot);
  const signature = cookie.slice(dot + 1);
  if (!/^\d+$/.test(expiresAt) || Number(expiresAt) < Date.now()) return false;
  return timingSafeEqual(signature, sign(expiresAt));
}

function setSessionCookie(res: Response): void {
  const expiresAt = String(Date.now() + SESSION_TTL_MS);
  const value = `${expiresAt}.${sign(expiresAt)}`;
  res.cookie(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_TTL_MS,
    path: '/',
  });
}

export const login: RequestHandler = (req, res) => {
  if (!env.DASHBOARD_PASSWORD) {
    res.status(503).json({ error: 'Dashboard login is not configured (set DASHBOARD_PASSWORD).' });
    return;
  }
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!timingSafeEqual(password, env.DASHBOARD_PASSWORD)) {
    res.status(401).json({ error: 'Wrong password.' });
    return;
  }
  setSessionCookie(res);
  res.json({ ok: true });
};

export const logout: RequestHandler = (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { path: '/' });
  res.json({ ok: true });
};

/** GET /api/me — lets the SPA check whether it already has a valid session. */
export const me: RequestHandler = (req, res) => {
  res.json({ authenticated: isValidSession(req) });
};

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!isValidSession(req)) {
    res.status(401).json({ error: 'Not authenticated.' });
    return;
  }
  next();
};
