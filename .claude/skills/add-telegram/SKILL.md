---
name: add-telegram
description: Add Telegram as a channel to NanoClaw. Supports forum mode with topics — the bot creates topics automatically from a user-provided list, maps topic IDs to names in SQLite, and registers each as its own NanoClaw group with isolated context. Can replace WhatsApp or run alongside it. Triggers on "telegram", "add telegram", "add-telegram".
---

# Add Telegram Integration

This skill adds Telegram as a messaging channel for NanoClaw. It supports:

1. **Forum Mode** - Telegram group with Topics enabled; the bot creates topics from a list you provide, each gets its own conversation context and memory
2. **Standard Mode** - Each Telegram chat/group maps to one NanoClaw group
3. **Alongside or Replace** - Run Telegram alongside WhatsApp, or replace WhatsApp entirely

## Initial Questions

Ask the user:

> How do you want to use Telegram with NanoClaw?
>
> **Option 1: Alongside WhatsApp**
> - Keep WhatsApp as-is
> - Add Telegram as an additional channel
> - Messages from either channel route to the agent
> - Responses route back to the originating channel
>
> **Option 2: Replace WhatsApp**
> - Remove WhatsApp entirely
> - Telegram becomes the only messaging channel
> - Simpler setup, no WhatsApp dependency

Store their choice. Then ask:

> Do you want to use **Telegram Forum Mode** (topics)?
>
> **Forum Mode (recommended for power users):**
> - Create a Telegram group with Topics enabled
> - The bot will create topics for you automatically
> - Each topic becomes a separate conversation context with its own memory
> - Great for organizing different tasks/projects
>
> **Standard Mode:**
> - Each Telegram chat or group = one NanoClaw group
> - Simpler, more traditional setup

Store their choice.

### Forum Mode: Collect Topic List

**If the user chose Forum Mode**, ask:

> List the topics you want me to create in your Telegram forum group.
> Give me a comma-separated list (I'll create them all automatically).
>
> Example: `General, Research, Schedule, Code Review, Writing, Admin`
>
> You can have as many as you like (10+ is fine). The first one in the list will be your **main/admin** topic.

Parse the response into a clean array. Trim whitespace, filter empty entries:

```typescript
const topicNames = userInput.split(',').map(s => s.trim()).filter(Boolean);
// e.g. ["General", "Research", "Schedule", "Code Review", "Writing", "Admin"]
```

Store the list. The first entry becomes the main/admin topic.

### Standard Mode: Admin Channel

If Standard Mode, ask:

> Which channel should be your **admin control** (main) channel?
>
> 1. A specific Telegram chat (recommended if replacing WhatsApp)
> 2. Keep WhatsApp as main (only if running alongside)

Store their choice.

### Telegram User Whitelist (CRITICAL)

Then ask:

> **Security: Who should be allowed to talk to this bot?**
>
> Telegram bots are publicly reachable — anyone who finds your bot's username can message it.
> I need a whitelist of Telegram user IDs that are authorized to interact with the bot.
>
> **To find your Telegram user ID:**
> 1. Message @userinfobot on Telegram
> 2. It will reply with your user ID (a number like `123456789`)
>
> Paste all authorized user IDs (comma-separated). At minimum, add your own.
>
> Example: `123456789, 987654321`

Parse into a clean array:

```typescript
const allowedIds = userInput.split(',').map(s => s.trim()).filter(Boolean);
// e.g. ["123456789", "987654321"]
```

Store the list. This is **non-negotiable** — the bot MUST NOT process messages from unrecognized users.

### Trigger Word

Then ask:

> Should the trigger word be the same as the current one (`@ASSISTANT_NAME`), or different for Telegram?

Read `src/config.ts` to find the current `ASSISTANT_NAME` value before asking.

Store their choice and proceed.

---

## Prerequisites

### 1. Create a Telegram Bot

**USER ACTION REQUIRED**

Tell the user:

> I need you to create a Telegram bot. Here's how:
>
> 1. Open Telegram and search for **@BotFather**
> 2. Send `/newbot`
> 3. Follow the prompts — choose a name and username for your bot
> 4. BotFather will give you a **bot token** (looks like `123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11`)
>
> Paste the bot token here.

When the user provides the token, add it to `.env` along with the whitelist:

```bash
# Append to .env (don't overwrite existing content)
echo "TELEGRAM_BOT_TOKEN=<token>" >> .env
echo "TELEGRAM_ALLOWED_USER_IDS=<comma-separated-ids>" >> .env
```

For example:
```bash
echo "TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234..." >> .env
echo "TELEGRAM_ALLOWED_USER_IDS=123456789,987654321" >> .env
```

Verify:

```bash
TOKEN=$(grep "^TELEGRAM_BOT_TOKEN=" .env | cut -d= -f2)
[ -n "$TOKEN" ] && echo "Token configured: ${TOKEN:0:10}..." || echo "Missing"
ALLOWED=$(grep "^TELEGRAM_ALLOWED_USER_IDS=" .env | cut -d= -f2)
[ -n "$ALLOWED" ] && echo "Allowed user IDs: $ALLOWED" || echo "WARNING: No user whitelist configured!"
```

**IMPORTANT:** If `TELEGRAM_ALLOWED_USER_IDS` is empty or missing, the bot MUST refuse to start. This prevents accidental public exposure.

### 2. Set Up the Telegram Group (Forum Mode)

If the user chose Forum Mode, tell them:

> Now set up your Telegram forum group:
>
> 1. Create a new Telegram group (or use an existing one)
> 2. Go to **Group Settings → Topics** and enable Topics
> 3. Add your bot to the group
> 4. Make the bot an **admin** with these permissions:
>    - **Manage Topics** (required to create topics)
>    - **Post Messages** / **Send Messages**
>    - **Delete Messages** (optional but recommended)
> 5. Send me the **Chat ID** of the group
>
> **To find the Chat ID:** Send any message in the group, then visit:
> `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
> Look for `"chat":{"id":-100XXXXXXXXXX}` — the negative number is your Chat ID.
>
> Or forward a message from the group to @userinfobot.

Store the Chat ID as `TELEGRAM_FORUM_CHAT_ID` in `.env`:

```bash
echo "TELEGRAM_FORUM_CHAT_ID=<chat_id>" >> .env
```

If Standard Mode, tell them:

> Add your bot to any Telegram chats or groups where you want to use it.
> For group chats, make the bot an admin so it can read all messages.
>
> Let me know when you've done this.

### 3. Install Dependencies

```bash
npm install grammy
npm install --save-dev @types/node
```

Verify:

```bash
npm ls grammy && echo "grammY installed" || echo "grammY not installed"
```

---

## Implementation (Alongside WhatsApp)

If the user chose "Alongside WhatsApp", follow these steps. If they chose "Replace WhatsApp", skip to the **Replace WhatsApp** section below.

### Step 1: Add Telegram Config

Read `src/config.ts` and add these lines after the existing config constants:

```typescript
// Telegram configuration
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const TELEGRAM_ENABLED = !!TELEGRAM_BOT_TOKEN;
export const TELEGRAM_FORUM_CHAT_ID = process.env.TELEGRAM_FORUM_CHAT_ID
  ? Number(process.env.TELEGRAM_FORUM_CHAT_ID)
  : undefined;

// Telegram user whitelist — ONLY these user IDs can interact with the bot.
// Comma-separated in .env, parsed to a Set for O(1) lookups.
// If empty and Telegram is enabled, the bot MUST refuse to start.
export const TELEGRAM_ALLOWED_USER_IDS: Set<number> = new Set(
  (process.env.TELEGRAM_ALLOWED_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number)
    .filter((n) => !isNaN(n) && n > 0),
);
```

### Step 2: Add Channel Mappings Table to Database

Read `src/db.ts` and find the `initDatabase()` function. Inside the main `db.exec(...)` block (after the `task_run_logs` table), add:

```sql
    CREATE TABLE IF NOT EXISTS channel_mappings (
      platform TEXT NOT NULL,
      parent_id TEXT NOT NULL,
      channel_id TEXT NOT NULL,
      channel_name TEXT NOT NULL,
      jid TEXT NOT NULL,
      group_folder TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (platform, parent_id, channel_id)
    );
    CREATE INDEX IF NOT EXISTS idx_channel_jid ON channel_mappings(jid);
```

Then add these accessor functions after the existing DB functions (e.g., after `getAllRegisteredGroups`):

```typescript
// --- Channel mapping accessors ---

export interface ChannelMapping {
  platform: string;
  parent_id: string;
  channel_id: string;
  channel_name: string;
  jid: string;
  group_folder: string;
  created_at: string;
}

export function storeChannelMapping(mapping: ChannelMapping): void {
  db.prepare(
    `INSERT OR REPLACE INTO channel_mappings (platform, parent_id, channel_id, channel_name, jid, group_folder, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    mapping.platform,
    mapping.parent_id,
    mapping.channel_id,
    mapping.channel_name,
    mapping.jid,
    mapping.group_folder,
    mapping.created_at,
  );
}

export function getChannelMappings(platform: string, parentId: string): ChannelMapping[] {
  return db
    .prepare('SELECT * FROM channel_mappings WHERE platform = ? AND parent_id = ?')
    .all(platform, parentId) as ChannelMapping[];
}

export function getChannelMappingByJid(jid: string): ChannelMapping | undefined {
  return db
    .prepare('SELECT * FROM channel_mappings WHERE jid = ?')
    .get(jid) as ChannelMapping | undefined;
}

export function getAllChannelMappings(platform: string): ChannelMapping[] {
  return db
    .prepare('SELECT * FROM channel_mappings WHERE platform = ?')
    .all(platform) as ChannelMapping[];
}
```

Also add the channel-agnostic message storage function (after `storeMessage`):

```typescript
/**
 * Store a message from any channel (Telegram, Discord, etc.)
 * Channel-agnostic version of storeMessage.
 */
export function storeChannelMessage(
  id: string,
  chatJid: string,
  sender: string,
  senderName: string,
  content: string,
  timestamp: string,
  isFromMe: boolean,
): void {
  db.prepare(
    `INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, chatJid, sender, senderName, content, timestamp, isFromMe ? 1 : 0);
}
```

### Step 3: Create Telegram Client Module

Create a new file `src/telegram-client.ts`:

```typescript
/**
 * Telegram Client for NanoClaw
 * Handles Telegram bot connection, message receiving, sending,
 * and forum topic creation/management.
 *
 * Forum Mode: bot creates topics from a user-provided list,
 * stores topic_id→name mappings, and routes messages by topic.
 */
import { Bot, Context } from 'grammy';
import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ENABLED,
  TELEGRAM_FORUM_CHAT_ID,
  TELEGRAM_ALLOWED_USER_IDS,
  ASSISTANT_NAME,
} from './config.js';
import {
  storeChannelMapping,
  getChannelMappings,
  getAllChannelMappings,
  getChannelMappingByJid,
  type ChannelMapping,
} from './db.js';
import { logger } from './logger.js';

let bot: Bot | null = null;

// In-memory cache of topic mappings (loaded from DB at startup)
let topicMappings: Map<string, ChannelMapping> = new Map(); // jid → mapping

export interface TelegramMessageHandler {
  onMessage: (
    chatKey: string,
    messageId: string,
    sender: string,
    senderName: string,
    content: string,
    timestamp: string,
    isFromMe: boolean,
  ) => void;
  onChatMetadata: (chatKey: string, timestamp: string, name?: string) => void;
}

/**
 * Check if a Telegram user is authorized to interact with the bot.
 * Returns false for any user not in TELEGRAM_ALLOWED_USER_IDS.
 */
function isUserAllowed(userId: number | undefined): boolean {
  if (!userId) return false;
  return TELEGRAM_ALLOWED_USER_IDS.has(userId);
}

/**
 * Build a NanoClaw-compatible JID for a Telegram chat/topic.
 * Format: "tg:<chatId>" or "tg:<chatId>:<topicId>" for forum topics.
 */
function buildChatKey(chatId: number, topicId?: number): string {
  if (topicId) {
    return `tg:${chatId}:${topicId}`;
  }
  return `tg:${chatId}`;
}

/**
 * Parse a Telegram chat key back into chatId and optional topicId.
 */
export function parseChatKey(chatKey: string): { chatId: number; topicId?: number } | null {
  if (!chatKey.startsWith('tg:')) return null;
  const parts = chatKey.split(':');
  if (parts.length === 2) {
    return { chatId: Number(parts[1]) };
  } else if (parts.length === 3) {
    return { chatId: Number(parts[1]), topicId: Number(parts[2]) };
  }
  return null;
}

/**
 * Resolve a display name for a chat/topic using stored mappings.
 */
function resolveTopicName(chatId: number, topicId?: number): string | undefined {
  if (!topicId) return undefined;
  const jid = buildChatKey(chatId, topicId);
  const mapping = topicMappings.get(jid);
  return mapping?.channel_name;
}

/**
 * Build a display name for a chat/topic.
 * Prefers stored mapping names over runtime detection.
 */
function buildChatName(ctx: Context): string {
  const chatTitle = ctx.chat?.title || `Chat ${ctx.chat?.id}`;
  const chatId = ctx.chat?.id;
  const topicId = ctx.message?.message_thread_id;

  // Try stored mapping first
  if (chatId && topicId) {
    const storedName = resolveTopicName(chatId, topicId);
    if (storedName) {
      return `${chatTitle} - ${storedName}`;
    }
  }

  // Fall back to runtime detection
  const topicName = (ctx.message as any)?.reply_to_message?.forum_topic_created?.name;
  if (topicName) {
    return `${chatTitle} - ${topicName}`;
  }
  if (topicId) {
    return `${chatTitle} - Topic ${topicId}`;
  }
  return chatTitle;
}

/**
 * Create forum topics from a list of names.
 * Uses the Telegram Bot API: createForumTopic(chat_id, name)
 * Returns: { message_thread_id, name, icon_color, icon_custom_emoji_id }
 *
 * Stores each mapping in SQLite and registers as a NanoClaw group.
 */
export async function createForumTopics(
  chatId: number,
  topicNames: string[],
): Promise<Array<{ name: string; topicId: number; jid: string; folder: string }>> {
  if (!bot) {
    throw new Error('Telegram bot not initialized — call startTelegramBot() first');
  }

  const results: Array<{ name: string; topicId: number; jid: string; folder: string }> = [];

  // Load existing mappings to avoid duplicates
  const existing = getChannelMappings('telegram', String(chatId));
  const existingNames = new Set(existing.map((m) => m.channel_name.toLowerCase()));

  for (const name of topicNames) {
    // Skip if a topic with this name already exists
    if (existingNames.has(name.toLowerCase())) {
      const existingMapping = existing.find(
        (m) => m.channel_name.toLowerCase() === name.toLowerCase(),
      );
      if (existingMapping) {
        logger.info({ name, topicId: existingMapping.channel_id }, 'Topic already exists, skipping');
        results.push({
          name,
          topicId: Number(existingMapping.channel_id),
          jid: existingMapping.jid,
          folder: existingMapping.group_folder,
        });
        continue;
      }
    }

    try {
      // Telegram Bot API: createForumTopic
      // Returns ForumTopic { message_thread_id, name, icon_color, icon_custom_emoji_id }
      const topic = await bot.api.createForumTopic(chatId, name);

      const topicId = topic.message_thread_id;
      const jid = buildChatKey(chatId, topicId);
      // Sanitize folder name: lowercase, replace spaces with hyphens, remove special chars
      const folder = `tg-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

      // Store mapping in SQLite
      const mapping: ChannelMapping = {
        platform: 'telegram',
        parent_id: String(chatId),
        channel_id: String(topicId),
        channel_name: name,
        jid,
        group_folder: folder,
        created_at: new Date().toISOString(),
      };
      storeChannelMapping(mapping);

      // Cache in memory
      topicMappings.set(jid, mapping);

      results.push({ name, topicId, jid, folder });
      logger.info({ name, topicId, jid, folder }, 'Created Telegram forum topic');
    } catch (err) {
      logger.error({ name, err }, 'Failed to create Telegram forum topic');
      throw err;
    }
  }

  return results;
}

/**
 * Load topic mappings from DB into memory cache.
 */
function loadTopicMappings(): void {
  const mappings = getChannelMappings('telegram', String(TELEGRAM_FORUM_CHAT_ID || ''));
  topicMappings = new Map(mappings.map((m) => [m.jid, m]));

  // Also load any other telegram mappings (multiple groups)
  const allMappings = getAllTelegramMappings();
  for (const m of allMappings) {
    if (!topicMappings.has(m.jid)) {
      topicMappings.set(m.jid, m);
    }
  }

  logger.info({ count: topicMappings.size }, 'Loaded Telegram topic mappings from DB');
}

function getAllTelegramMappings(): ChannelMapping[] {
  return getAllChannelMappings('telegram');
}

/**
 * Initialize and start the Telegram bot.
 */
export async function startTelegramBot(handler: TelegramMessageHandler): Promise<void> {
  if (!TELEGRAM_ENABLED) {
    logger.info('Telegram disabled (no TELEGRAM_BOT_TOKEN)');
    return;
  }

  // SECURITY: Refuse to start without a user whitelist
  if (TELEGRAM_ALLOWED_USER_IDS.size === 0) {
    logger.error(
      'TELEGRAM_ALLOWED_USER_IDS is empty — refusing to start Telegram bot. ' +
      'Set allowed user IDs in .env to prevent unauthorized access.',
    );
    throw new Error('TELEGRAM_ALLOWED_USER_IDS must not be empty when Telegram is enabled');
  }

  logger.info(
    { allowedUsers: TELEGRAM_ALLOWED_USER_IDS.size },
    'Telegram user whitelist loaded',
  );

  bot = new Bot(TELEGRAM_BOT_TOKEN);

  // Load existing topic mappings from DB
  loadTopicMappings();

  // Handle text messages
  bot.on('message:text', (ctx) => {
    try {
      if (!ctx.message.text) return;

      const isFromMe = ctx.from?.id === bot?.botInfo?.id;
      // Don't process our own messages
      if (isFromMe) return;

      // WHITELIST CHECK — reject messages from unauthorized users
      if (!isUserAllowed(ctx.from?.id)) {
        logger.warn(
          { userId: ctx.from?.id, username: ctx.from?.username },
          'Telegram message from unauthorized user — ignored',
        );
        return;
      }

      const chatId = ctx.chat.id;
      const topicId = ctx.message.message_thread_id;
      const chatKey = buildChatKey(chatId, topicId);
      const text = ctx.message.text;
      const senderName = ctx.from?.first_name
        ? `${ctx.from.first_name}${ctx.from.last_name ? ' ' + ctx.from.last_name : ''}`
        : ctx.from?.username || 'Unknown';
      const sender = ctx.from?.id?.toString() || 'unknown';
      const timestamp = new Date(ctx.message.date * 1000).toISOString();
      const messageId = `tg-${ctx.message.message_id}`;

      // Store chat metadata for group discovery
      const chatName = buildChatName(ctx);
      handler.onChatMetadata(chatKey, timestamp, chatName);

      // Store the message
      handler.onMessage(chatKey, messageId, sender, senderName, text, timestamp, false);

      logger.debug({ chatKey, sender: senderName, length: text.length }, 'Telegram message received');
    } catch (err) {
      logger.error({ err }, 'Error handling Telegram message');
    }
  });

  // Handle forum topic creation events (for tracking topics created outside of NanoClaw)
  bot.on('message:forum_topic_created', (ctx) => {
    try {
      const chatId = ctx.chat.id;
      const topicId = ctx.message.message_thread_id;
      if (topicId) {
        const chatKey = buildChatKey(chatId, topicId);
        const topicName = ctx.message.forum_topic_created?.name || `Topic ${topicId}`;
        const chatTitle = ctx.chat.title || `Chat ${chatId}`;
        handler.onChatMetadata(chatKey, new Date().toISOString(), `${chatTitle} - ${topicName}`);
        logger.info({ chatKey, topicName }, 'Telegram forum topic created (external)');
      }
    } catch (err) {
      logger.error({ err }, 'Error handling forum topic creation');
    }
  });

  // Error handler
  bot.catch((err) => {
    logger.error({ err: err.error, ctx: err.ctx?.update?.update_id }, 'Telegram bot error');
  });

  // Start the bot
  try {
    await bot.init();
    logger.info({ username: bot.botInfo.username }, 'Telegram bot initialized');
    bot.start({
      onStart: (info) => {
        logger.info({ username: info.username }, 'Telegram bot started polling');
      },
    });
  } catch (err) {
    logger.error({ err }, 'Failed to start Telegram bot');
    throw err;
  }
}

/**
 * Send a message to a Telegram chat/topic.
 */
export async function sendTelegramMessage(chatKey: string, text: string): Promise<void> {
  if (!bot) {
    logger.error('Telegram bot not initialized');
    return;
  }

  const parsed = parseChatKey(chatKey);
  if (!parsed) {
    logger.error({ chatKey }, 'Invalid Telegram chat key');
    return;
  }

  try {
    await bot.api.sendMessage(parsed.chatId, text, {
      message_thread_id: parsed.topicId,
    });
    logger.info({ chatKey, length: text.length }, 'Telegram message sent');
  } catch (err) {
    logger.error({ chatKey, err }, 'Failed to send Telegram message');
  }
}

/**
 * Send typing indicator to a Telegram chat/topic.
 */
export async function setTelegramTyping(chatKey: string, isTyping: boolean): Promise<void> {
  if (!bot || !isTyping) return;

  const parsed = parseChatKey(chatKey);
  if (!parsed) return;

  try {
    await bot.api.sendChatAction(parsed.chatId, 'typing', {
      message_thread_id: parsed.topicId,
    });
  } catch (err) {
    logger.debug({ chatKey, err }, 'Failed to send Telegram typing indicator');
  }
}

/**
 * Stop the Telegram bot gracefully.
 */
export async function stopTelegramBot(): Promise<void> {
  if (bot) {
    await bot.stop();
    logger.info('Telegram bot stopped');
  }
}
```

### Step 4: Create Setup Script for Topic Creation

Create a new file `src/telegram-setup.ts`:

```typescript
/**
 * Telegram Forum Setup
 * Run once during skill execution to create topics and register groups.
 * Usage: npx tsx src/telegram-setup.ts "General, Research, Schedule, ..."
 */
import { Bot } from 'grammy';
import { initDatabase } from './db.js';
import { storeChannelMapping, getChannelMappings, type ChannelMapping } from './db.js';
import { setRegisteredGroup } from './db.js';
import { storeChatMetadata } from './db.js';
import { TELEGRAM_BOT_TOKEN, TELEGRAM_FORUM_CHAT_ID, ASSISTANT_NAME, GROUPS_DIR } from './config.js';
import fs from 'fs';
import path from 'path';

async function main(): Promise<void> {
  // Parse topic names from command line argument
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: npx tsx src/telegram-setup.ts "General, Research, Schedule, ..."');
    process.exit(1);
  }

  const topicNames = input.split(',').map((s) => s.trim()).filter(Boolean);
  if (topicNames.length === 0) {
    console.error('No topic names provided');
    process.exit(1);
  }

  if (!TELEGRAM_BOT_TOKEN) {
    console.error('TELEGRAM_BOT_TOKEN not set in .env');
    process.exit(1);
  }

  if (!TELEGRAM_FORUM_CHAT_ID) {
    console.error('TELEGRAM_FORUM_CHAT_ID not set in .env');
    process.exit(1);
  }

  const chatId = TELEGRAM_FORUM_CHAT_ID;

  // Initialize database
  initDatabase();

  // Initialize bot (but don't start polling)
  const bot = new Bot(TELEGRAM_BOT_TOKEN);
  await bot.init();
  console.log(`Bot initialized: @${bot.botInfo.username}`);

  // Check existing mappings to avoid duplicates
  const existing = getChannelMappings('telegram', String(chatId));
  const existingNames = new Set(existing.map((m) => m.channel_name.toLowerCase()));

  console.log(`\nCreating ${topicNames.length} topics in chat ${chatId}...`);
  console.log(`(${existing.length} topics already mapped)\n`);

  const results: Array<{ name: string; topicId: number; jid: string; folder: string }> = [];

  for (const name of topicNames) {
    // Skip if already exists
    if (existingNames.has(name.toLowerCase())) {
      const existingMapping = existing.find(
        (m) => m.channel_name.toLowerCase() === name.toLowerCase(),
      );
      if (existingMapping) {
        console.log(`  ✓ "${name}" already exists (topic ${existingMapping.channel_id}), skipping`);
        results.push({
          name,
          topicId: Number(existingMapping.channel_id),
          jid: existingMapping.jid,
          folder: existingMapping.group_folder,
        });
        continue;
      }
    }

    try {
      // Create the forum topic via Telegram Bot API
      const topic = await bot.api.createForumTopic(chatId, name);
      const topicId = topic.message_thread_id;
      const jid = `tg:${chatId}:${topicId}`;
      const folder = `tg-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

      // Store mapping in SQLite
      storeChannelMapping({
        platform: 'telegram',
        parent_id: String(chatId),
        channel_id: String(topicId),
        channel_name: name,
        jid,
        group_folder: folder,
        created_at: new Date().toISOString(),
      });

      results.push({ name, topicId, jid, folder });
      console.log(`  ✓ Created "${name}" → topic ${topicId} → ${jid}`);

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 200));
    } catch (err: any) {
      console.error(`  ✗ Failed to create "${name}": ${err.message || err}`);
      process.exit(1);
    }
  }

  // Register each topic as a NanoClaw group and create group folders
  console.log(`\nRegistering ${results.length} NanoClaw groups...\n`);

  // Check if this is a "replace WhatsApp" setup or "alongside" setup.
  // If alongside, the first topic should NOT use 'main' folder (that's WhatsApp's).
  // Use 'tg-main' or similar to avoid conflict.
  const whatsAppMainExists = fs.existsSync(path.join(GROUPS_DIR, 'main', 'CLAUDE.md'));
  const isFirstTopicMain = !whatsAppMainExists; // Only use 'main' if no WA main exists

  for (let i = 0; i < results.length; i++) {
    const { name, jid, folder } = results[i];
    const isMain = isFirstTopicMain && i === 0;

    // Determine folder — first topic uses 'main' only if no WhatsApp main exists
    const groupFolder = isMain ? 'main' : folder;

    // Register in database
    setRegisteredGroup(jid, {
      name,
      folder: groupFolder,
      trigger: `@${ASSISTANT_NAME}`,
      added_at: new Date().toISOString(),
      requiresTrigger: isMain ? false : true,
    });

    // Store chat metadata for group discovery
    storeChatMetadata(jid, new Date().toISOString(), name);

    // Create group folder and CLAUDE.md if it doesn't exist
    const groupDir = path.join(GROUPS_DIR, groupFolder);
    if (!fs.existsSync(groupDir)) {
      fs.mkdirSync(groupDir, { recursive: true });
    }

    const claudeMdPath = path.join(groupDir, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) {
      fs.writeFileSync(
        claudeMdPath,
        `# ${name}\n\nThis is the "${name}" topic in Telegram.\n\n` +
        `Keep conversations focused on ${name.toLowerCase()}-related topics.\n` +
        (isMain ? '\nThis is the admin/main channel. You can manage groups and tasks here.\n' : ''),
      );
    }

    console.log(`  ✓ Registered "${name}" → folder: ${groupFolder} (${isMain ? 'main/admin' : 'standard'})`);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('TELEGRAM FORUM SETUP COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nChat ID: ${chatId}`);
  console.log(`Topics created: ${results.length}`);
  console.log(`\nTopic mapping:`);
  for (const r of results) {
    console.log(`  ${r.name.padEnd(20)} → topic:${r.topicId}  jid:${r.jid}  folder:${r.folder}`);
  }
  console.log(`\nMain/admin topic: ${results[0]?.name || 'none'}`);
  console.log('\nRebuild and restart NanoClaw to activate:');
  console.log('  npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw');

  process.exit(0);
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
```

### Step 5: Make sendMessage Channel-Aware

Read `src/index.ts`. Find the `sendMessage` function (around line 330):

```typescript
// Find:
async function sendMessage(jid: string, text: string): Promise<void> {
  try {
    await sock.sendMessage(jid, { text });
    logger.info({ jid, length: text.length }, 'Message sent');
  } catch (err) {
    logger.error({ jid, err }, 'Failed to send message');
  }
}

// Replace with:
async function sendMessage(jid: string, text: string): Promise<void> {
  try {
    if (jid.startsWith('tg:')) {
      await sendTelegramMessage(jid, text);
    } else {
      await sock.sendMessage(jid, { text });
      logger.info({ jid, length: text.length }, 'Message sent');
    }
  } catch (err) {
    logger.error({ jid, err }, 'Failed to send message');
  }
}
```

### Step 6: Make setTyping Channel-Aware

Find the `setTyping` function (around line 88):

```typescript
// Find:
async function setTyping(jid: string, isTyping: boolean): Promise<void> {
  try {
    await sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
  } catch (err) {
    logger.debug({ jid, err }, 'Failed to update typing status');
  }
}

// Replace with:
async function setTyping(jid: string, isTyping: boolean): Promise<void> {
  try {
    if (jid.startsWith('tg:')) {
      await setTelegramTyping(jid, isTyping);
    } else {
      await sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
    }
  } catch (err) {
    logger.debug({ jid, err }, 'Failed to update typing status');
  }
}
```

### Step 7: Add Telegram Imports and Startup

Add these imports to the top of `src/index.ts` (after the other local imports):

```typescript
import {
  sendTelegramMessage,
  setTelegramTyping,
  startTelegramBot,
  stopTelegramBot,
} from './telegram-client.js';
import { storeChannelMessage } from './db.js';
import { TELEGRAM_ENABLED } from './config.js';
```

**Note:** `storeChatMetadata` is already imported from `./db.js` — just make sure `storeChannelMessage` is added to the existing import.

**Important architectural note:** Telegram should NOT start inside the WhatsApp `connection === 'open'` callback. If WhatsApp disconnects and reconnects, the Telegram bot would be re-started (causing "409: Conflict" polling errors). Instead, start Telegram in `main()` after `connectWhatsApp()`.

In `main()` (around line 928), after `await connectWhatsApp();`, add:

```typescript
  // Start Telegram bot if configured (independent of WhatsApp connection)
  if (TELEGRAM_ENABLED) {
    await startTelegramBot({
      onMessage: (chatKey, messageId, sender, senderName, content, timestamp, isFromMe) => {
        // Only store full content for registered groups
        if (registeredGroups[chatKey]) {
          storeChannelMessage(messageId, chatKey, sender, senderName, content, timestamp, isFromMe);
        }
        // Always store chat metadata for group discovery
        storeChatMetadata(chatKey, timestamp);
      },
      onChatMetadata: (chatKey, timestamp, name) => {
        storeChatMetadata(chatKey, timestamp, name);
      },
    });
  }
```

This keeps Telegram lifecycle independent from WhatsApp reconnection cycles.

Find the `shutdown` function in `main()` (around line 920) and add `stopTelegramBot()` before `process.exit(0)`:

```typescript
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await stopTelegramBot();
    await queue.shutdown(10000);
    process.exit(0);
  };
```

### Step 8: Update getAvailableGroups to Include Telegram

Find the `getAvailableGroups` function (around line 178). It currently filters only `@g.us` JIDs. Update it to also include `tg:` JIDs:

```typescript
// Find:
    .filter((c) => c.jid !== '__group_sync__' && c.jid.endsWith('@g.us'))

// Replace with:
    .filter((c) => c.jid !== '__group_sync__' && (c.jid.endsWith('@g.us') || c.jid.startsWith('tg:')))
```

### Step 9: Update Group Memory

Append to `groups/global/CLAUDE.md`:

```markdown

## Telegram

Messages from Telegram chats use JIDs starting with `tg:`. Forum topics use `tg:<chatId>:<topicId>`.

Each topic is an isolated conversation context. Do not reference or leak information between topics.

When responding in Telegram, format messages for Telegram MarkdownV2:
- *Bold*: use *text*
- _Italic_: use _text_
- `Code`: use `code`
- Code blocks: use ```language\ncode```

Keep responses concise. Telegram displays messages in chat bubbles.

### Telegram Security

Only whitelisted Telegram user IDs can interact with the bot. Unauthorized messages are silently dropped.
The whitelist is configured via `TELEGRAM_ALLOWED_USER_IDS` in `.env` and enforced at the message handler level
before any message storage or agent processing occurs.
```

Also append the Telegram section to `groups/main/CLAUDE.md`.

**Important:** Update `docs/SECURITY.md` to add Telegram to the trust model table:

```markdown
| Telegram messages | Whitelisted input | Filtered by TELEGRAM_ALLOWED_USER_IDS before processing |
```

And add a new subsection under "Security Boundaries":

```markdown
### 6. Telegram User Whitelist

Telegram bots are publicly reachable by default — anyone can find and message them.
NanoClaw enforces a strict user ID whitelist (`TELEGRAM_ALLOWED_USER_IDS` in `.env`):

- **Checked before message storage** — unauthorized messages are never stored in the DB
- **Checked before chat metadata updates** — unauthorized users don't appear in group discovery
- **Bot refuses to start** if the whitelist is empty (prevents accidental public exposure)
- **Logged as warnings** — unauthorized attempts are logged with user ID for audit
```

### Step 10: Update Service Configuration

If using `dotenv`, ensure it's installed and imported:

```bash
npm ls dotenv 2>/dev/null || npm install dotenv
```

Then add at the very top of `src/index.ts` (before all other imports):

```typescript
import 'dotenv/config';
```

If `dotenv` is already being loaded or env vars are set via launchd/systemd, skip this step.

### Step 11: Run Topic Setup (Forum Mode)

**This is the key step.** Run the setup script to create all the topics and register them:

```bash
npm run build
npx tsx src/telegram-setup.ts "General, Research, Schedule, Code Review, Writing, Admin"
```

Replace the list with the user's actual topic names from the Initial Questions step.

The script will:
1. Connect to the Telegram Bot API
2. Create each topic in the forum group
3. Store `topicId → topicName` mappings in SQLite
4. Register each as a NanoClaw group
5. Create group folders with `CLAUDE.md` files
6. Print a summary of all mappings

**Verify the mappings were stored:**

```bash
sqlite3 store/messages.db "SELECT platform, channel_name, channel_id, jid, group_folder FROM channel_mappings WHERE platform = 'telegram'"
```

**Verify registered groups:**

```bash
sqlite3 store/messages.db "SELECT jid, name, folder, requires_trigger FROM registered_groups WHERE jid LIKE 'tg:%'"
```

### Step 12: Rebuild and Start

```bash
npm run build
```

Restart the service:

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

Or if running manually:

```bash
npm run dev
```

Check the logs for Telegram startup:

```bash
sleep 3 && tail -20 logs/nanoclaw.log | grep -i telegram
```

Tell the user:

> Telegram is now active with your forum topics! Here's what was created:
>
> | Topic | Topic ID | JID | Folder |
> |-------|----------|-----|--------|
> *(print the results table from the setup script)*
>
> Test by sending a message in any topic:
> - In the admin topic: just send `hello`
> - In other topics: `@ASSISTANT_NAME hello`
>
> Each topic has its own conversation context — messages in one topic won't affect another.
>
> Watch the logs: `tail -f logs/nanoclaw.log`

---

## Implementation (Replace WhatsApp)

If the user chose to replace WhatsApp entirely, follow all the "Alongside" steps above, then make these additional changes:

### Remove WhatsApp Dependency

1. In `src/index.ts`:
   - Remove the `connectWhatsApp()` function entirely
   - Remove all baileys imports (`makeWASocket`, `DisconnectReason`, etc.)
   - Remove `sock` variable and all `sock.*` calls
   - Remove `translateJid`, `lidToPhoneMap`, WhatsApp-specific code
   - Move the startup calls (scheduler, IPC watcher, message loop, Telegram bot) into `main()` directly instead of inside the WhatsApp `connection === 'open'` callback

2. In `main()`, replace `await connectWhatsApp()` with:

```typescript
  // Start all loops directly (no WhatsApp connection needed)
  startSchedulerLoop({
    sendMessage,
    registeredGroups: () => registeredGroups,
    getSessions: () => sessions,
    queue,
    onProcess: (groupJid, proc, containerName) => queue.registerProcess(groupJid, proc, containerName),
  });
  startIpcWatcher();
  queue.setProcessMessagesFn(processGroupMessages);
  recoverPendingMessages();
  startMessageLoop();

  // Start Telegram bot
  await startTelegramBot({
    onMessage: (chatKey, messageId, sender, senderName, content, timestamp, isFromMe) => {
      if (registeredGroups[chatKey]) {
        storeChannelMessage(messageId, chatKey, sender, senderName, content, timestamp, isFromMe);
      }
      storeChatMetadata(chatKey, timestamp);
    },
    onChatMetadata: (chatKey, timestamp, name) => {
      storeChatMetadata(chatKey, timestamp, name);
    },
  });
```

3. Remove WhatsApp dependencies:

```bash
npm uninstall @whiskeysockets/baileys qrcode-terminal
```

4. Remove WhatsApp auth files:
   - Delete `src/whatsapp-auth.ts`
   - Remove the `auth` script from `package.json`

5. Update `sendMessage` to remove the WhatsApp branch:

```typescript
async function sendMessage(jid: string, text: string): Promise<void> {
  try {
    if (jid.startsWith('tg:')) {
      await sendTelegramMessage(jid, text);
    } else {
      logger.warn({ jid }, 'Unknown channel for JID');
    }
  } catch (err) {
    logger.error({ jid, err }, 'Failed to send message');
  }
}
```

6. Update documentation:
   - `CLAUDE.md`: Change "WhatsApp" references to "Telegram"
   - `groups/main/CLAUDE.md`: Update WhatsApp formatting section to Telegram formatting
   - `README.md`: Update if desired

---

## Adding More Topics Later

To add new topics to an existing forum group after initial setup:

```bash
npx tsx src/telegram-setup.ts "New Topic 1, New Topic 2"
```

The setup script is idempotent — it skips topics that already exist and only creates new ones. After adding topics, rebuild and restart:

```bash
npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

---

## Troubleshooting

### Bot can't create topics

- Ensure the bot is an **admin** in the group with **Manage Topics** permission
- Verify Topics are enabled in the group: Group Settings → Topics
- Check the Chat ID is correct (should be a negative number like `-100XXXXXXXXXX`)
- Test the bot's admin status:
  ```bash
  curl "https://api.telegram.org/bot<TOKEN>/getChatAdministrators?chat_id=<CHAT_ID>"
  ```
  Your bot should appear in the list with `can_manage_topics: true`

### "Bad Request: not enough rights to manage topics"

The bot needs the **Manage Topics** admin permission. In the group:
1. Go to group settings → Administrators
2. Find the bot → Edit
3. Enable "Manage Topics"
4. Save

### Bot not receiving messages in topics

- The bot must be an admin (not just a member) in forum groups
- Each message in a topic has `message_thread_id` — check the JID format: `tg:<chatId>:<topicId>`
- Verify mappings: `sqlite3 store/messages.db "SELECT * FROM channel_mappings WHERE platform = 'telegram'"`

### Topics created but not registered

If topics were created in Telegram but not in NanoClaw's database, re-run the setup script. It's idempotent and will skip existing topics while registering any that are missing.

### Messages bleeding between topics

- Check that each topic has a unique JID: `tg:<chatId>:<topicId>`
- Verify each is registered as a separate group: `sqlite3 store/messages.db "SELECT jid, folder FROM registered_groups WHERE jid LIKE 'tg:%'"`
- Each folder should be unique — if two topics share a folder, they share context

### "409: Conflict: terminated by other getUpdates request"

This means another instance of the bot is running. Stop any other processes using the same bot token. Only one instance can poll at a time.

### Bot token issues

```bash
# Test the token directly
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getMe"
```

Should return JSON with `ok: true` and your bot's details.

---

## Removing Telegram Integration

To remove Telegram entirely:

1. Remove from `src/index.ts`:
   - Delete Telegram imports (`sendTelegramMessage`, `setTelegramTyping`, `startTelegramBot`, `stopTelegramBot`)
   - Remove `tg:` branches from `sendMessage()` and `setTyping()`
   - Remove `startTelegramBot()` call
   - Remove `stopTelegramBot()` from shutdown handler
   - Revert `getAvailableGroups` filter

2. Delete `src/telegram-client.ts` and `src/telegram-setup.ts`

3. Remove from `src/config.ts`:
   - Delete `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ENABLED`, `TELEGRAM_FORUM_CHAT_ID`

4. Remove from `src/db.ts`:
   - Delete `storeChannelMessage` (only if no other channels use it)
   - Delete channel mapping functions (only if no other channels use them)

5. Remove Telegram section from `groups/global/CLAUDE.md` and `groups/main/CLAUDE.md`

6. Clean up database:
   ```bash
   sqlite3 store/messages.db "DELETE FROM channel_mappings WHERE platform = 'telegram'"
   sqlite3 store/messages.db "DELETE FROM registered_groups WHERE jid LIKE 'tg:%'"
   ```

7. Uninstall dependency:
   ```bash
   npm uninstall grammy
   ```

8. Remove from `.env`:
   ```bash
   # Remove TELEGRAM_BOT_TOKEN and TELEGRAM_FORUM_CHAT_ID lines from .env
   ```

9. Rebuild:
   ```bash
   npm run build
   launchctl kickstart -k gui/$(id -u)/com.nanoclaw
   ```
