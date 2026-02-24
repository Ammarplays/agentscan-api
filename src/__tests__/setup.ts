// This runs before all test files.
// Ensure DATABASE_URL is set to test DB before any imports.
process.env.DATABASE_URL = 'postgresql://agentscan:agentscan@localhost:5432/agentscan_test';
process.env.STORAGE_PATH = './test-storage';
process.env.BASE_URL = 'http://localhost:3000';
