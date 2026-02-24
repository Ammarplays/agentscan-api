import { db, schema } from './db/index.js';
import { generateApiKey, hashApiKey, getKeyPrefix } from './utils/crypto.js';

async function seed() {
  const rawKey = generateApiKey();

  await db.insert(schema.apiKeys).values({
    name: 'Test API Key',
    keyHash: hashApiKey(rawKey),
    keyPrefix: getKeyPrefix(rawKey),
    ownerEmail: 'test@agentscan.app',
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
