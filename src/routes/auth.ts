import { FastifyInstance } from 'fastify';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { config } from '../config.js';
import { requireSession, type JwtPayload } from '../plugins/session-auth.js';

const googleClient = new OAuth2Client(config.googleClientId);

function signJwt(payload: JwtPayload): string {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
}

async function upsertUser(profile: { email: string; name: string | null; picture: string | null; googleId: string }) {
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.googleId, profile.googleId)).limit(1);

  if (existing) {
    await db.update(schema.users).set({
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
      lastLoginAt: new Date(),
    }).where(eq(schema.users.id, existing.id));
    return { ...existing, email: profile.email, name: profile.name, picture: profile.picture };
  }

  const [user] = await db.insert(schema.users).values({
    email: profile.email,
    name: profile.name,
    picture: profile.picture,
    googleId: profile.googleId,
    lastLoginAt: new Date(),
  }).returning();

  return user;
}

export async function authRoutes(fastify: FastifyInstance) {
  // GET /auth/google — redirect to Google OAuth
  fastify.get('/auth/google', async (_request, reply) => {
    const url = googleClient.generateAuthUrl({
      access_type: 'offline',
      scope: ['openid', 'email', 'profile'],
      client_id: config.googleClientId,
      redirect_uri: `${config.baseUrl}/auth/google/callback`,
    });
    return reply.redirect(url);
  });

  // GET /auth/google/callback — OAuth callback
  fastify.get('/auth/google/callback', async (request, reply) => {
    const { code } = request.query as { code?: string };
    if (!code) {
      return reply.status(400).send({ error: 'Missing code parameter' });
    }

    try {
      const oauthClient = new OAuth2Client(config.googleClientId, config.googleClientSecret, `${config.baseUrl}/auth/google/callback`);
      const { tokens } = await oauthClient.getToken(code);
      const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token!, audience: config.googleClientId });
      const payload = ticket.getPayload()!;

      const user = await upsertUser({
        email: payload.email!,
        name: payload.name || null,
        picture: payload.picture || null,
        googleId: payload.sub,
      });

      const token = signJwt({ userId: user.id, email: user.email, name: user.name || null });

      // Redirect to frontend with token
      return reply.redirect(`${config.frontendUrl}/auth/callback?token=${token}`);
    } catch (err: any) {
      fastify.log.error(err, 'Google OAuth callback failed');
      return reply.status(500).send({ error: 'Authentication failed' });
    }
  });

  // POST /auth/google/token — SPA flow: accept Google ID token
  fastify.post('/auth/google/token', async (request, reply) => {
    const { id_token } = request.body as { id_token?: string };
    if (!id_token) {
      return reply.status(400).send({ error: 'Missing id_token' });
    }

    try {
      const ticket = await googleClient.verifyIdToken({ idToken: id_token, audience: config.googleClientId });
      const payload = ticket.getPayload()!;

      const user = await upsertUser({
        email: payload.email!,
        name: payload.name || null,
        picture: payload.picture || null,
        googleId: payload.sub,
      });

      const token = signJwt({ userId: user.id, email: user.email, name: user.name || null });

      return { token, user: { id: user.id, email: user.email, name: user.name, picture: user.picture } };
    } catch (err: any) {
      fastify.log.error(err, 'Google token verification failed');
      return reply.status(401).send({ error: 'Invalid Google ID token' });
    }
  });

  // GET /auth/me — current user info
  fastify.get('/auth/me', { preHandler: [requireSession] }, async (request) => {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, request.user!.userId)).limit(1);
    if (!user) {
      return { error: 'User not found', status: 404 };
    }
    return { id: user.id, email: user.email, name: user.name, picture: user.picture, createdAt: user.createdAt };
  });

  // POST /auth/logout — no-op for stateless JWT (frontend discards token)
  fastify.post('/auth/logout', { preHandler: [requireSession] }, async () => {
    return { success: true };
  });
}
