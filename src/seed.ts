import { db, schema } from './db/index.js';
import { generateApiKey, hashApiKey, getKeyPrefix } from './utils/crypto.js';

async function seed() {
  // Create test user
  const [user] = await db.insert(schema.users).values({
    email: 'test@agentscan.app',
    name: 'Test User',
    googleId: 'google-test-id-12345',
    lastLoginAt: new Date(),
  }).returning();

  console.log(`Test user created: ${user.email} (${user.id})`);

  // Create API key linked to user
  const rawKey = generateApiKey();

  await db.insert(schema.apiKeys).values({
    name: 'Test API Key',
    keyHash: hashApiKey(rawKey),
    keyPrefix: getKeyPrefix(rawKey),
    ownerEmail: 'test@agentscan.app',
    userId: user.id,
  });

  console.log('='.repeat(60));
  console.log('Test API Key created!');
  console.log(`Key: ${rawKey}`);
  console.log('Save this key — it will not be shown again.');
  console.log('='.repeat(60));

  process.exit(0);
}

seed().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
