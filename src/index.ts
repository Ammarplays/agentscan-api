import Fastify, { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { authPlugin } from './plugins/auth.js';
import { healthRoutes } from './routes/health.js';
import { keysRoutes } from './routes/keys.js';
import { devicesRoutes } from './routes/devices.js';
import { requestsRoutes } from './routes/requests.js';
import { resultsRoutes } from './routes/results.js';
import { deviceApiRoutes } from './routes/device-api.js';
import { startCleanupInterval } from './services/cleanup.js';

const fastify = Fastify({ logger: true });

// Plugins
await fastify.register(cors, { origin: true });
await fastify.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max
await fastify.register(rateLimit, { max: 100, timeWindow: '1 minute' });
await fastify.register(authPlugin);

// Error handler
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
  fastify.log.error(error);
  return reply.status(error.statusCode ?? 500).send({
    error: error.message || 'Internal server error',
    code: 'INTERNAL_ERROR',
    status: error.statusCode ?? 500,
  });
});

// Routes
await fastify.register(healthRoutes);
await fastify.register(keysRoutes);
await fastify.register(devicesRoutes);
await fastify.register(requestsRoutes);
await fastify.register(resultsRoutes);
await fastify.register(deviceApiRoutes);

// Start cleanup interval
startCleanupInterval(config.cleanupIntervalMs);

// Start server
try {
  await fastify.listen({ port: config.port, host: config.host });
  console.log(`AgentsCan API running on ${config.host}:${config.port}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
