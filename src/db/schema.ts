import { pgTable, uuid, text, timestamp, boolean, integer } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  name: text('name'),
  picture: text('picture'),
  googleId: text('google_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  ownerEmail: text('owner_email').notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
});

export const devices = pgTable('devices', {
  id: uuid('id').primaryKey().defaultRandom(),
  apiKeyId: uuid('api_key_id').notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  deviceToken: text('device_token').notNull(),
  deviceName: text('device_name').notNull(),
  platform: text('platform').notNull(), // ios | android
  pairedAt: timestamp('paired_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

export const scanRequests = pgTable('scan_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  apiKeyId: uuid('api_key_id').notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  message: text('message').notNull(),
  status: text('status').notNull().default('pending'), // pending | scanning | completed | expired | cancelled
  webhookUrl: text('webhook_url'),
  webhookSecret: text('webhook_secret'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
});

export const scanResults = pgTable('scan_results', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestId: uuid('request_id').notNull().references(() => scanRequests.id, { onDelete: 'cascade' }).unique(),
  pdfPath: text('pdf_path').notNull(),
  pdfSizeBytes: integer('pdf_size_bytes').notNull(),
  ocrText: text('ocr_text').notNull(),
  pageCount: integer('page_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  pickedUp: boolean('picked_up').notNull().default(false),
  pickedUpAt: timestamp('picked_up_at', { withTimezone: true }),
  autoDeleteAt: timestamp('auto_delete_at', { withTimezone: true }).notNull(),
});

export const pairingSessions = pgTable('pairing_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  apiKeyId: uuid('api_key_id').notNull().references(() => apiKeys.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  shortCode: text('short_code').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').notNull().default(false),
  deviceId: uuid('device_id').references(() => devices.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Type exports
export type User = typeof users.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
export type Device = typeof devices.$inferSelect;
export type ScanRequest = typeof scanRequests.$inferSelect;
export type ScanResult = typeof scanResults.$inferSelect;
export type PairingSession = typeof pairingSessions.$inferSelect;
