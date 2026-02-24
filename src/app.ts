import Fastify, { FastifyError, FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { keysRoutes } from './routes/keys.js';
import { devicesRoutes } from './routes/devices.js';
import { requestsRoutes } from './routes/requests.js';
import { resultsRoutes } from './routes/results.js';
import { deviceApiRoutes } from './routes/device-api.js';

export async function buildApp(opts: { logger?: boolean } = {}): Promise<FastifyInstance> {
  const fastify = Fastify({ logger: opts.logger ?? false });

  await fastify.register(cors, { origin: true });
  await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });
  await fastify.register(rateLimit, { max: 1000, timeWindow: '1 minute' });
  await fastify.register(authPlugin);

  fastify.setErrorHandler((error: FastifyError, _request, reply) => {
    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation error: ' + error.message,
        code: 'VALIDATION_ERROR',
        status: 400,
      });
    }
    if (error.statusCode === 429) {
      return reply.status(429).send({
        error: 'Rate limit exceeded',
        code: 'RATE_LIMITED',
        status: 429,
      });
    }
    return reply.status(error.statusCode ?? 500).send({
      error: error.message || 'Internal server error',
      code: 'INTERNAL_ERROR',
      status: error.statusCode ?? 500,
    });
  });

  await fastify.register(healthRoutes);
  await fastify.register(keysRoutes);
  await fastify.register(devicesRoutes);
  await fastify.register(requestsRoutes);
  await fastify.register(resultsRoutes);
  await fastify.register(deviceApiRoutes);

  return fastify;
}
