import { config } from 'dotenv';
import { resolve } from 'node:path';

// Loaded before the Nest app boots. NODE_ENV=test both selects the test
// database below and unlocks DbService#truncateAllTables.
config({ path: resolve(__dirname, '../.env') });

process.env.NODE_ENV = 'test';
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// The mock PSP delivers real HTTP webhooks back to this API, so the suite needs
// the app listening on a real, fixed port that matches this callback URL — an
// in-memory supertest server (no open socket) can't receive them.
process.env.PORT = '3100';
process.env.PSP_CALLBACK_URL = 'http://localhost:3100/api/webhooks/payouts';
// Fast timers: the default 2.5s/8s delays exist to make the async flow
// observable to a human in the UI, not to slow down a test suite.
process.env.PSP_PROCESSING_DELAY_MS = '30';
process.env.PSP_SETTLEMENT_DELAY_MS = '80';
