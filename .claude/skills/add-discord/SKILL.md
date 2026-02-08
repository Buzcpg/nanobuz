---
name: add-discord
description: Add Discord as a channel to NanoClaw. The bot creates text channels automatically from a user-provided list, maps channel IDs to names in SQLite, and registers each as its own NanoClaw group with isolated context. Supports slash commands, thread-aware replies, and category organization. Can replace WhatsApp or run alongside it. Triggers on "discord", "add discord", "add-discord".
---

# Add Discord Integration

This skill adds Discord as a messaging channel for NanoClaw. It supports:

1. **Auto Channel Creation** - Bot creates text channels from a list you provide; each gets its own conversation context and memory
2. **Slash Commands** - Optional `/ask` command for quick one-off questions
3. **Alongside or Replace** - Run Discord alongside WhatsApp/Telegram, or replace WhatsApp entirely

## Initial Questions

Ask the user:

> How do you want to use Discord with NanoClaw?
>
> **Option 1: Alongside WhatsApp**
> - Keep WhatsApp (and Telegram if configured) as-is
> - Add Discord as an additional channel
> - Messages route to the agent and responses come back to Discord
>
> **Option 2: Replace WhatsApp**
> - Remove WhatsApp entirely
> - Discord becomes the primary messaging channel

Store their choice. Then ask:

> Do you want a **slash command** (`/ask`) for quick questions?
>
> - `/ask what time is it in Tokyo` — agent responds in the channel
> - Great for quick lookups without prefixing every message

Store their choice.

### Collect Channel List

Ask the user:

> List the text channels you want me to create in your Discord server.
> Give me a comma-separated list (I'll create them all automatically).
>
> Example: `general, research, schedule, code-review, writing, admin`
>
> You can have as many as you like (10+ is fine). The first one in the list will be your **main/admin** channel.
>
> **Optional:** Do you want these channels organized under a **category**?
> If so, give me the category name (e.g., "NanoClaw" or "AI Assistant").
> If not, they'll be created as top-level channels.

Parse the response into a clean array. Trim whitespace, filter empty entries, lowercase and hyphenate for Discord naming conventions:

```typescript
const channelNames = userInput.split(',').map(s => s.trim()).filter(Boolean);
// e.g. ["general", "research", "schedule", "code-review", "writing", "admin"]
// Discord channel names must be lowercase, no spaces (replaced with hyphens)
const sanitized = channelNames.map(name =>
  name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
);
```

Store the list and optional category name. The first entry becomes the main/admin channel.

### Guild ID

Then ask:

> I need your **Discord Server (Guild) ID** so I can create channels in it.
>
> To find it:
> 1. Open Discord Settings → **Advanced** → Enable **Developer Mode**
> 2. Right-click your server name in the sidebar → **Copy Server ID**
>
> Paste the Server ID here.

Store as `DISCORD_GUILD_ID` in `.env`:

```bash
echo "DISCORD_GUILD_ID=<guild_id>" >> .env
```

### Trigger Word

Then ask:

> Should the trigger word be the same as the current one (`@ASSISTANT_NAME`), or different for Discord?

Read `src/config.ts` to find the current `ASSISTANT_NAME` value before asking.

Store their choice and proceed.

---

## Prerequisites

### 1. Create a Discord Application and Bot

**USER ACTION REQUIRED**

Tell the user:

> I need you to create a Discord bot. Here's how:
>
> 1. Go to https://discord.com/developers/applications
> 2. Click **New Application**, give it a name (e.g., "NanoClaw"), click **Create**
> 3. Go to the **Bot** tab on the left sidebar
> 4. Click **Reset Token** and copy the **bot token** (you'll only see it once!)
>
> Paste the bot token here.

When the user provides the token, add it to `.env`:

```bash
echo "DISCORD_BOT_TOKEN=<token>" >> .env
```

Then tell the user:

> Now configure the bot's permissions:
>
> 1. Still on the **Bot** tab, scroll down to **Privileged Gateway Intents**
> 2. Enable **MESSAGE CONTENT INTENT** (required to read message text)
> 3. Enable **SERVER MEMBERS INTENT** (optional but recommended)
> 4. Click **Save Changes**

Wait for confirmation, then:

> Now generate an invite link:
>
> 1. Go to the **OAuth2** tab on the left sidebar
> 2. Under **OAuth2 URL Generator**, select these **Scopes**:
>    - `bot`
>    - `applications.commands` (if using slash commands)
> 3. Under **Bot Permissions**, select:
>    - **Manage Channels** (required to create channels)
>    - Send Messages
>    - Send Messages in Threads
>    - Read Message History
>    - View Channels
>    - Use Slash Commands (if using slash commands)
>    - Add Reactions
> 4. Copy the generated URL at the bottom and open it in your browser
> 5. Select your Discord server and authorize the bot
>
> Let me know when the bot has joined your server.

### 2. Install Dependencies

```bash
npm install discord.js
```

Verify:

```bash
npm ls discord.js && echo "discord.js installed" || echo "discord.js not installed"
```

---

## Implementation (Alongside WhatsApp)

If the user chose "Alongside WhatsApp", follow these steps. If they chose "Replace WhatsApp", follow these steps first, then apply the additional changes in the **Replace WhatsApp** section below.

### Step 1: Add Discord Config

Read `src/config.ts` and add these lines after the existing config constants:

```typescript
// Discord configuration
export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
export const DISCORD_ENABLED = !!DISCORD_BOT_TOKEN;
export const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '';
export const DISCORD_MAX_MESSAGE_LENGTH = 2000;  // Discord's character limit
```

### Step 2: Add Channel Mappings Table to Database (If Not Already Done)

If you haven't already added the `channel_mappings` table from the add-telegram skill, do it now.

Read `src/db.ts` and find the `initDatabase()` function. Inside the main `db.exec(...)` block, add:

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

Then add the accessor functions (if not already present from add-telegram):

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

Also add the channel-agnostic message storage function (if not already present):

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

### Step 3: Create Discord Client Module

Create a new file `src/discord-client.ts`:

```typescript
/**
 * Discord Client for NanoClaw
 * Handles Discord bot connection, message receiving, sending,
 * and channel creation/management.
 *
 * The bot creates text channels from a user-provided list,
 * stores channelId→name mappings, and routes messages by channel.
 */
import {
  Client,
  GatewayIntentBits,
  Partials,
  Message,
  TextChannel,
  ThreadChannel,
  ChannelType,
  Guild,
  CategoryChannel,
  REST,
  Routes,
  SlashCommandBuilder,
} from 'discord.js';
import {
  DISCORD_BOT_TOKEN,
  DISCORD_ENABLED,
  DISCORD_GUILD_ID,
  DISCORD_MAX_MESSAGE_LENGTH,
  ASSISTANT_NAME,
} from './config.js';
import {
  storeChannelMapping,
  getChannelMappings,
  getChannelMappingByJid,
  getAllChannelMappings,
  type ChannelMapping,
} from './db.js';
import { logger } from './logger.js';

let client: Client | null = null;

// In-memory cache of channel mappings (loaded from DB at startup)
let channelMappings: Map<string, ChannelMapping> = new Map(); // jid → mapping

export interface DiscordMessageHandler {
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
 * Build a NanoClaw-compatible JID for a Discord channel/thread.
 * Format: "dc:<guildId>:<channelId>" or "dc:<guildId>:<channelId>:<threadId>"
 */
function buildChatKey(guildId: string, channelId: string, threadId?: string): string {
  if (threadId) {
    return `dc:${guildId}:${channelId}:${threadId}`;
  }
  return `dc:${guildId}:${channelId}`;
}

/**
 * Parse a Discord chat key back into its components.
 */
export function parseChatKey(chatKey: string): { guildId: string; channelId: string; threadId?: string } | null {
  if (!chatKey.startsWith('dc:')) return null;
  const parts = chatKey.split(':');
  if (parts.length === 3) {
    return { guildId: parts[1], channelId: parts[2] };
  } else if (parts.length === 4) {
    return { guildId: parts[1], channelId: parts[2], threadId: parts[3] };
  }
  return null;
}

/**
 * Resolve a display name for a channel using stored mappings.
 */
function resolveChannelName(guildId: string, channelId: string): string | undefined {
  const jid = buildChatKey(guildId, channelId);
  const mapping = channelMappings.get(jid);
  return mapping?.channel_name;
}

/**
 * Build a display name for a channel/thread.
 * Prefers stored mapping names over runtime detection.
 */
function buildChannelName(msg: Message): string {
  const guildName = msg.guild?.name || 'DM';
  const guildId = msg.guildId || 'dm';
  const channelId = msg.channelId;

  // Try stored mapping first
  const storedName = resolveChannelName(guildId, channelId);
  if (storedName) {
    return `${guildName} #${storedName}`;
  }

  const channelName = (msg.channel as TextChannel).name || `Channel ${msg.channelId}`;

  if (msg.channel.isThread()) {
    return `${guildName} #${(msg.channel as ThreadChannel).parent?.name || 'unknown'} → ${msg.channel.name}`;
  }
  return `${guildName} #${channelName}`;
}

/**
 * Split long messages into chunks that fit Discord's 2000-char limit.
 */
function splitMessage(text: string): string[] {
  if (text.length <= DISCORD_MAX_MESSAGE_LENGTH) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= DISCORD_MAX_MESSAGE_LENGTH) {
      chunks.push(remaining);
      break;
    }

    // Try to split at a newline near the limit
    let splitIndex = remaining.lastIndexOf('\n', DISCORD_MAX_MESSAGE_LENGTH);
    if (splitIndex < DISCORD_MAX_MESSAGE_LENGTH * 0.5) {
      // No good newline found; split at space
      splitIndex = remaining.lastIndexOf(' ', DISCORD_MAX_MESSAGE_LENGTH);
    }
    if (splitIndex < DISCORD_MAX_MESSAGE_LENGTH * 0.5) {
      // No good split point; hard split
      splitIndex = DISCORD_MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

/**
 * Register slash commands (optional).
 */
async function registerSlashCommands(applicationId: string): Promise<void> {
  const rest = new REST().setToken(DISCORD_BOT_TOKEN);

  const commands = [
    new SlashCommandBuilder()
      .setName('ask')
      .setDescription(`Ask ${ASSISTANT_NAME} a question`)
      .addStringOption((option) =>
        option
          .setName('question')
          .setDescription('Your question')
          .setRequired(true)
      ),
  ];

  try {
    await rest.put(
      Routes.applicationCommands(applicationId),
      { body: commands.map((c) => c.toJSON()) },
    );
    logger.info('Discord slash commands registered');
  } catch (err) {
    logger.error({ err }, 'Failed to register Discord slash commands');
  }
}

/**
 * Create text channels in a Discord guild from a list of names.
 * Optionally places them under a category.
 *
 * Uses discord.js: guild.channels.create({ name, type: ChannelType.GuildText, parent? })
 *
 * Stores each mapping in SQLite and registers as a NanoClaw group.
 */
export async function createDiscordChannels(
  guild: Guild,
  channelNames: string[],
  categoryName?: string,
): Promise<Array<{ name: string; channelId: string; jid: string; folder: string }>> {
  const results: Array<{ name: string; channelId: string; jid: string; folder: string }> = [];

  // Load existing mappings to avoid duplicates
  const existing = getChannelMappings('discord', guild.id);
  const existingNames = new Set(existing.map((m) => m.channel_name.toLowerCase()));

  // Create or find category if specified
  let category: CategoryChannel | undefined;
  if (categoryName) {
    // Check if category already exists
    const existingCategory = guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === categoryName.toLowerCase(),
    ) as CategoryChannel | undefined;

    if (existingCategory) {
      category = existingCategory;
      logger.info({ categoryName, categoryId: category.id }, 'Using existing Discord category');
    } else {
      category = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
      }) as CategoryChannel;
      logger.info({ categoryName, categoryId: category.id }, 'Created Discord category');
    }
  }

  for (const name of channelNames) {
    // Sanitize for Discord: lowercase, hyphens, no special chars
    const discordName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Skip if a channel with this name already exists in our mappings
    if (existingNames.has(discordName)) {
      const existingMapping = existing.find(
        (m) => m.channel_name.toLowerCase() === discordName,
      );
      if (existingMapping) {
        logger.info({ name: discordName, channelId: existingMapping.channel_id }, 'Channel already exists, skipping');
        results.push({
          name: discordName,
          channelId: existingMapping.channel_id,
          jid: existingMapping.jid,
          folder: existingMapping.group_folder,
        });
        continue;
      }
    }

    try {
      // Create the text channel via discord.js
      const channel = await guild.channels.create({
        name: discordName,
        type: ChannelType.GuildText,
        parent: category?.id,
        topic: `NanoClaw AI assistant channel — ${name}`,
      });

      const channelId = channel.id;
      const jid = buildChatKey(guild.id, channelId);
      const folder = `dc-${discordName}`;

      // Store mapping in SQLite
      const mapping: ChannelMapping = {
        platform: 'discord',
        parent_id: guild.id,
        channel_id: channelId,
        channel_name: discordName,
        jid,
        group_folder: folder,
        created_at: new Date().toISOString(),
      };
      storeChannelMapping(mapping);

      // Cache in memory
      channelMappings.set(jid, mapping);

      results.push({ name: discordName, channelId, jid, folder });
      logger.info({ name: discordName, channelId, jid, folder }, 'Created Discord channel');
    } catch (err) {
      logger.error({ name: discordName, err }, 'Failed to create Discord channel');
      throw err;
    }
  }

  return results;
}

/**
 * Load channel mappings from DB into memory cache.
 */
function loadChannelMappings(): void {
  const mappings = getAllChannelMappings('discord');
  channelMappings = new Map(mappings.map((m) => [m.jid, m]));
  logger.info({ count: channelMappings.size }, 'Loaded Discord channel mappings from DB');
}

/**
 * Initialize and start the Discord bot.
 */
export async function startDiscordBot(
  handler: DiscordMessageHandler,
  options?: { enableSlashCommands?: boolean },
): Promise<void> {
  if (!DISCORD_ENABLED) {
    logger.info('Discord disabled (no DISCORD_BOT_TOKEN)');
    return;
  }

  // Load existing channel mappings from DB
  loadChannelMappings();

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
      GatewayIntentBits.GuildMessageTyping,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  // Handle ready event
  client.once('ready', async () => {
    if (!client?.user) return;
    logger.info({ username: client.user.tag }, 'Discord bot connected');

    // Register slash commands if requested
    if (options?.enableSlashCommands) {
      await registerSlashCommands(client.user.id);
    }
  });

  // Handle text messages
  client.on('messageCreate', (msg) => {
    try {
      // Ignore bot messages (including our own)
      if (msg.author.bot) return;
      if (!msg.content) return;

      const guildId = msg.guildId || 'dm';
      const channelId = msg.channelId;
      const threadId = msg.channel.isThread() ? msg.channelId : undefined;
      const parentChannelId = msg.channel.isThread()
        ? (msg.channel as ThreadChannel).parentId || channelId
        : channelId;

      const chatKey = buildChatKey(guildId, parentChannelId, threadId);
      const sender = msg.author.id;
      const senderName = msg.member?.displayName || msg.author.displayName || msg.author.username;
      const timestamp = msg.createdAt.toISOString();
      const messageId = `dc-${msg.id}`;

      // Store chat metadata
      const channelName = buildChannelName(msg);
      handler.onChatMetadata(chatKey, timestamp, channelName);

      // Store the message
      handler.onMessage(chatKey, messageId, sender, senderName, msg.content, timestamp, false);

      logger.debug({ chatKey, sender: senderName, length: msg.content.length }, 'Discord message received');
    } catch (err) {
      logger.error({ err }, 'Error handling Discord message');
    }
  });

  // Handle slash commands (optional)
  if (options?.enableSlashCommands) {
    client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;
      if (interaction.commandName !== 'ask') return;

      const question = interaction.options.getString('question', true);
      const guildId = interaction.guildId || 'dm';
      const channelId = interaction.channelId;
      const chatKey = buildChatKey(guildId, channelId);
      const sender = interaction.user.id;
      const senderName = interaction.user.displayName || interaction.user.username;
      const timestamp = new Date().toISOString();
      const messageId = `dc-slash-${interaction.id}`;

      // Defer the reply (gives us 15 minutes to respond)
      await interaction.deferReply();

      // Store metadata
      handler.onChatMetadata(chatKey, timestamp, `Slash: ${interaction.guild?.name || 'DM'}`);

      // Store as a message
      handler.onMessage(chatKey, messageId, sender, senderName, question, timestamp, false);

      // Store the interaction for later reply
      pendingInteractions.set(messageId, interaction);

      // Clean up old interactions after 15 minutes
      setTimeout(() => pendingInteractions.delete(messageId), 15 * 60 * 1000);
    });
  }

  // Error handler
  client.on('error', (err) => {
    logger.error({ err }, 'Discord client error');
  });

  // Login
  try {
    await client.login(DISCORD_BOT_TOKEN);
  } catch (err) {
    logger.error({ err }, 'Failed to start Discord bot');
    throw err;
  }
}

// Store pending slash command interactions for deferred replies
const pendingInteractions = new Map<string, any>();

/**
 * Get the Discord client instance (for use in setup script).
 */
export function getDiscordClient(): Client | null {
  return client;
}

/**
 * Send a message to a Discord channel/thread.
 */
export async function sendDiscordMessage(chatKey: string, text: string): Promise<void> {
  if (!client) {
    logger.error('Discord client not initialized');
    return;
  }

  const parsed = parseChatKey(chatKey);
  if (!parsed) {
    logger.error({ chatKey }, 'Invalid Discord chat key');
    return;
  }

  try {
    // Determine the actual channel to send to
    const targetChannelId = parsed.threadId || parsed.channelId;
    const channel = await client.channels.fetch(targetChannelId);

    if (!channel || !('send' in channel)) {
      logger.error({ chatKey, targetChannelId }, 'Discord channel not found or not a text channel');
      return;
    }

    // Split long messages
    const chunks = splitMessage(text);

    for (const chunk of chunks) {
      await (channel as TextChannel).send(chunk);
    }

    logger.info({ chatKey, length: text.length, chunks: chunks.length }, 'Discord message sent');
  } catch (err) {
    logger.error({ chatKey, err }, 'Failed to send Discord message');
  }
}

/**
 * Send typing indicator to a Discord channel.
 */
export async function setDiscordTyping(chatKey: string, isTyping: boolean): Promise<void> {
  if (!client || !isTyping) return;

  const parsed = parseChatKey(chatKey);
  if (!parsed) return;

  try {
    const targetChannelId = parsed.threadId || parsed.channelId;
    const channel = await client.channels.fetch(targetChannelId);
    if (channel && 'sendTyping' in channel) {
      await (channel as TextChannel).sendTyping();
    }
  } catch (err) {
    logger.debug({ chatKey, err }, 'Failed to send Discord typing indicator');
  }
}

/**
 * Stop the Discord bot gracefully.
 */
export async function stopDiscordBot(): Promise<void> {
  if (client) {
    client.destroy();
    logger.info('Discord bot stopped');
  }
}
```

### Step 4: Create Setup Script for Channel Creation

Create a new file `src/discord-setup.ts`:

```typescript
/**
 * Discord Channel Setup
 * Run once during skill execution to create channels and register groups.
 * Usage: npx tsx src/discord-setup.ts "general, research, schedule, ..." [--category "NanoClaw"]
 */
import { Client, GatewayIntentBits, ChannelType, CategoryChannel, Guild } from 'discord.js';
import { initDatabase } from './db.js';
import { storeChannelMapping, getChannelMappings, type ChannelMapping } from './db.js';
import { setRegisteredGroup } from './db.js';
import { storeChatMetadata } from './db.js';
import { DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, ASSISTANT_NAME, GROUPS_DIR } from './config.js';
import fs from 'fs';
import path from 'path';

async function main(): Promise<void> {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let channelInput = '';
  let categoryName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) {
      categoryName = args[i + 1];
      i++; // skip next arg
    } else if (!channelInput) {
      channelInput = args[i];
    }
  }

  if (!channelInput) {
    console.error('Usage: npx tsx src/discord-setup.ts "general, research, schedule, ..." [--category "NanoClaw"]');
    process.exit(1);
  }

  const channelNames = channelInput.split(',').map((s) => s.trim()).filter(Boolean);
  if (channelNames.length === 0) {
    console.error('No channel names provided');
    process.exit(1);
  }

  if (!DISCORD_BOT_TOKEN) {
    console.error('DISCORD_BOT_TOKEN not set in .env');
    process.exit(1);
  }

  if (!DISCORD_GUILD_ID) {
    console.error('DISCORD_GUILD_ID not set in .env');
    process.exit(1);
  }

  // Initialize database
  initDatabase();

  // Initialize Discord client
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  await client.login(DISCORD_BOT_TOKEN);

  // Wait for ready
  await new Promise<void>((resolve) => {
    client.once('ready', () => {
      console.log(`Bot connected: ${client.user?.tag}`);
      resolve();
    });
  });

  // Get the guild
  const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
  if (!guild) {
    console.error(`Guild not found: ${DISCORD_GUILD_ID}`);
    process.exit(1);
  }
  console.log(`Guild: ${guild.name} (${guild.id})`);

  // Check existing mappings
  const existing = getChannelMappings('discord', guild.id);
  const existingNames = new Set(existing.map((m) => m.channel_name.toLowerCase()));

  // Create or find category if specified
  let category: CategoryChannel | undefined;
  if (categoryName) {
    // Fetch all channels to check for existing category
    await guild.channels.fetch();
    const existingCategory = guild.channels.cache.find(
      (ch) => ch.type === ChannelType.GuildCategory && ch.name.toLowerCase() === categoryName.toLowerCase(),
    ) as CategoryChannel | undefined;

    if (existingCategory) {
      category = existingCategory;
      console.log(`\nUsing existing category: "${category.name}"`);
    } else {
      category = await guild.channels.create({
        name: categoryName,
        type: ChannelType.GuildCategory,
      }) as CategoryChannel;
      console.log(`\nCreated category: "${category.name}"`);
    }
  }

  console.log(`\nCreating ${channelNames.length} channels...`);
  console.log(`(${existing.length} channels already mapped)\n`);

  const results: Array<{ name: string; channelId: string; jid: string; folder: string }> = [];

  for (const rawName of channelNames) {
    // Sanitize for Discord naming: lowercase, hyphens, no special chars
    const name = rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    // Skip if already exists
    if (existingNames.has(name)) {
      const existingMapping = existing.find(
        (m) => m.channel_name.toLowerCase() === name,
      );
      if (existingMapping) {
        console.log(`  ✓ "#${name}" already exists (${existingMapping.channel_id}), skipping`);
        results.push({
          name,
          channelId: existingMapping.channel_id,
          jid: existingMapping.jid,
          folder: existingMapping.group_folder,
        });
        continue;
      }
    }

    try {
      // Create the text channel via discord.js API
      // guild.channels.create({ name, type, parent?, topic? })
      const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category?.id,
        topic: `NanoClaw AI assistant — ${rawName}`,
      });

      const channelId = channel.id;
      const jid = `dc:${guild.id}:${channelId}`;
      const folder = `dc-${name}`;

      // Store mapping in SQLite
      storeChannelMapping({
        platform: 'discord',
        parent_id: guild.id,
        channel_id: channelId,
        channel_name: name,
        jid,
        group_folder: folder,
        created_at: new Date().toISOString(),
      });

      results.push({ name, channelId, jid, folder });
      console.log(`  ✓ Created #${name} → ${channelId} → ${jid}`);

      // Small delay to avoid rate limiting
      await new Promise((r) => setTimeout(r, 300));
    } catch (err: any) {
      console.error(`  ✗ Failed to create "#${name}": ${err.message || err}`);
      process.exit(1);
    }
  }

  // Register each channel as a NanoClaw group and create group folders
  console.log(`\nRegistering ${results.length} NanoClaw groups...\n`);

  const isFirstChannelMain = true; // First channel = main/admin channel

  for (let i = 0; i < results.length; i++) {
    const { name, jid, folder } = results[i];
    const isMain = isFirstChannelMain && i === 0;

    // Determine folder — first channel uses 'main' if it's the admin channel
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
    storeChatMetadata(jid, new Date().toISOString(), `${guild.name} #${name}`);

    // Create group folder and CLAUDE.md if it doesn't exist
    const groupDir = path.join(GROUPS_DIR, groupFolder);
    if (!fs.existsSync(groupDir)) {
      fs.mkdirSync(groupDir, { recursive: true });
    }

    const claudeMdPath = path.join(groupDir, 'CLAUDE.md');
    if (!fs.existsSync(claudeMdPath)) {
      fs.writeFileSync(
        claudeMdPath,
        `# ${name}\n\nThis is the #${name} channel in Discord (${guild.name}).\n\n` +
        `Keep conversations focused on ${name.replace(/-/g, ' ')}-related topics.\n` +
        (isMain ? '\nThis is the admin/main channel. You can manage groups and tasks here.\n' : '') +
        '\n## Discord Formatting\n\n' +
        '- **Bold**: use **text**\n' +
        '- *Italic*: use *text*\n' +
        '- `Code`: use `code`\n' +
        '- Code blocks: use ```language\\ncode```\n' +
        '- Keep responses under 2000 characters when possible.\n',
      );
    }

    console.log(`  ✓ Registered #${name} → folder: ${groupFolder} (${isMain ? 'main/admin' : 'standard'})`);
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('DISCORD CHANNEL SETUP COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nGuild: ${guild.name} (${guild.id})`);
  if (category) console.log(`Category: ${category.name}`);
  console.log(`Channels created: ${results.length}`);
  console.log(`\nChannel mapping:`);
  for (const r of results) {
    console.log(`  #${r.name.padEnd(20)} → ${r.channelId}  jid:${r.jid}  folder:${r.folder}`);
  }
  console.log(`\nMain/admin channel: #${results[0]?.name || 'none'}`);
  console.log('\nRebuild and restart NanoClaw to activate:');
  console.log('  npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw');

  client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
```

### Step 5: Make sendMessage Channel-Aware

Read `src/index.ts`. Find the `sendMessage` function (around line 330).

If `sendMessage` already handles `tg:` (from add-telegram), add the `dc:` branch:

```typescript
async function sendMessage(jid: string, text: string): Promise<void> {
  try {
    if (jid.startsWith('tg:')) {
      await sendTelegramMessage(jid, text);
    } else if (jid.startsWith('dc:')) {
      await sendDiscordMessage(jid, text);
    } else {
      await sock.sendMessage(jid, { text });
      logger.info({ jid, length: text.length }, 'Message sent');
    }
  } catch (err) {
    logger.error({ jid, err }, 'Failed to send message');
  }
}
```

If `sendMessage` is still in its original form, replace it entirely:

```typescript
async function sendMessage(jid: string, text: string): Promise<void> {
  try {
    if (jid.startsWith('dc:')) {
      await sendDiscordMessage(jid, text);
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

Find the `setTyping` function (around line 88). Add the `dc:` branch:

```typescript
async function setTyping(jid: string, isTyping: boolean): Promise<void> {
  try {
    if (jid.startsWith('tg:')) {
      await setTelegramTyping(jid, isTyping);
    } else if (jid.startsWith('dc:')) {
      await setDiscordTyping(jid, isTyping);
    } else {
      await sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
    }
  } catch (err) {
    logger.debug({ jid, err }, 'Failed to update typing status');
  }
}
```

If no Telegram integration exists, replace just the original:

```typescript
async function setTyping(jid: string, isTyping: boolean): Promise<void> {
  try {
    if (jid.startsWith('dc:')) {
      await setDiscordTyping(jid, isTyping);
    } else {
      await sock.sendPresenceUpdate(isTyping ? 'composing' : 'paused', jid);
    }
  } catch (err) {
    logger.debug({ jid, err }, 'Failed to update typing status');
  }
}
```

### Step 7: Add Discord Imports and Startup

Add these imports to the top of `src/index.ts`:

```typescript
import {
  sendDiscordMessage,
  setDiscordTyping,
  startDiscordBot,
  stopDiscordBot,
} from './discord-client.js';
import { DISCORD_ENABLED } from './config.js';
```

Ensure `storeChannelMessage` and `storeChatMetadata` are imported from `./db.js`.

Find the `connectWhatsApp` function, in the `connection === 'open'` block (around line 757-760), after `startMessageLoop()` (and after Telegram startup if present), add:

```typescript
      // Start Discord bot if configured
      if (DISCORD_ENABLED) {
        startDiscordBot({
          onMessage: (chatKey, messageId, sender, senderName, content, timestamp, isFromMe) => {
            if (registeredGroups[chatKey]) {
              storeChannelMessage(messageId, chatKey, sender, senderName, content, timestamp, isFromMe);
            }
            storeChatMetadata(chatKey, timestamp);
          },
          onChatMetadata: (chatKey, timestamp, name) => {
            storeChatMetadata(chatKey, timestamp, name);
          },
        }, {
          enableSlashCommands: true  // Set to false if user declined slash commands
        }).catch((err) => logger.error({ err }, 'Failed to start Discord bot'));
      }
```

Find the `shutdown` function in `main()` and add `stopDiscordBot()`:

```typescript
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await stopDiscordBot();
    // await stopTelegramBot();  // if Telegram is also configured
    await queue.shutdown(10000);
    process.exit(0);
  };
```

### Step 8: Update getAvailableGroups to Include Discord

Find the `getAvailableGroups` function (around line 178). Update the filter to include `dc:` JIDs:

```typescript
// If already including tg:, add dc: as well:
    .filter((c) => c.jid !== '__group_sync__' && (c.jid.endsWith('@g.us') || c.jid.startsWith('tg:') || c.jid.startsWith('dc:')))

// If starting from the original, just add dc::
    .filter((c) => c.jid !== '__group_sync__' && (c.jid.endsWith('@g.us') || c.jid.startsWith('dc:')))
```

### Step 9: Update Group Memory

Append to `groups/global/CLAUDE.md`:

```markdown

## Discord

Messages from Discord channels use JIDs starting with `dc:`. Format: `dc:<guildId>:<channelId>` or `dc:<guildId>:<channelId>:<threadId>` for threads.

Each channel is an isolated conversation context. Do not reference or leak information between channels.

When responding in Discord, use Discord markdown formatting:
- **Bold**: use **text**
- *Italic*: use *text*
- `Code`: use `code`
- Code blocks: use ```language\ncode```
- > Blockquote: use > text
- Spoiler: use ||text||

**Important:** Discord has a 2000-character limit per message. Your responses will be automatically split if they exceed this limit, but try to keep responses concise.
```

Also append the same to `groups/main/CLAUDE.md`.

### Step 10: Update Service Configuration

Ensure `.env` has the tokens:

```bash
grep "DISCORD_BOT_TOKEN" .env || echo "WARNING: DISCORD_BOT_TOKEN not in .env"
grep "DISCORD_GUILD_ID" .env || echo "WARNING: DISCORD_GUILD_ID not in .env"
```

If using `dotenv` for env loading, ensure it's installed and imported:

```bash
npm ls dotenv 2>/dev/null || npm install dotenv
```

Add at the very top of `src/index.ts` (if not already present):

```typescript
import 'dotenv/config';
```

### Step 11: Run Channel Setup

**This is the key step.** Run the setup script to create all the channels and register them:

```bash
npm run build
npx tsx src/discord-setup.ts "general, research, schedule, code-review, writing, admin" --category "NanoClaw"
```

Replace the list with the user's actual channel names from the Initial Questions step. Omit `--category` if they didn't want a category.

The script will:
1. Connect to Discord as the bot
2. Create a category (if specified)
3. Create each text channel under the category
4. Store `channelId → channelName` mappings in SQLite
5. Register each as a NanoClaw group
6. Create group folders with `CLAUDE.md` files
7. Print a summary of all mappings

**Verify the mappings were stored:**

```bash
sqlite3 store/messages.db "SELECT platform, channel_name, channel_id, jid, group_folder FROM channel_mappings WHERE platform = 'discord'"
```

**Verify registered groups:**

```bash
sqlite3 store/messages.db "SELECT jid, name, folder, requires_trigger FROM registered_groups WHERE jid LIKE 'dc:%'"
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

Check the logs for Discord startup:

```bash
sleep 3 && tail -20 logs/nanoclaw.log | grep -i discord
```

Tell the user:

> Discord is now active with your channels! Here's what was created:
>
> | Channel | Channel ID | JID | Folder |
> |---------|-----------|-----|--------|
> *(print the results table from the setup script)*
>
> Test by sending a message in any channel:
> - In the admin channel: just send `hello`
> - In other channels: `@ASSISTANT_NAME hello`
> - Slash command: `/ask what's the weather?`
>
> Each channel has its own conversation context — messages in one channel won't affect another.
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
   - Move startup calls into `main()` directly

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

  // Start Discord bot
  await startDiscordBot({
    onMessage: (chatKey, messageId, sender, senderName, content, timestamp, isFromMe) => {
      if (registeredGroups[chatKey]) {
        storeChannelMessage(messageId, chatKey, sender, senderName, content, timestamp, isFromMe);
      }
      storeChatMetadata(chatKey, timestamp);
    },
    onChatMetadata: (chatKey, timestamp, name) => {
      storeChatMetadata(chatKey, timestamp, name);
    },
  }, {
    enableSlashCommands: true
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
    if (jid.startsWith('dc:')) {
      await sendDiscordMessage(jid, text);
    } else if (jid.startsWith('tg:')) {
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
   - `CLAUDE.md`: Change "WhatsApp" references to "Discord"
   - `groups/main/CLAUDE.md`: Update formatting section for Discord
   - `README.md`: Update if desired

---

## Adding More Channels Later

To add new channels to an existing Discord server after initial setup:

```bash
npx tsx src/discord-setup.ts "new-channel-1, new-channel-2" --category "NanoClaw"
```

The setup script is idempotent — it skips channels that already exist and only creates new ones. After adding channels, rebuild and restart:

```bash
npm run build && launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

---

## Troubleshooting

### Bot can't create channels

- Ensure the bot has **Manage Channels** permission in the server
- Check the bot's role hierarchy — it can only create channels below its highest role
- Verify the Guild ID is correct: `grep DISCORD_GUILD_ID .env`
- Test the bot's permissions:
  ```bash
  curl -H "Authorization: Bot YOUR_TOKEN" "https://discord.com/api/v10/guilds/GUILD_ID"
  ```

### "Missing Permissions" error during setup

The bot needs the **Manage Channels** permission. Either:
1. Re-invite the bot with the correct permissions (regenerate the OAuth2 URL)
2. Or manually give the bot's role the **Manage Channels** permission in Server Settings → Roles

### Bot not coming online

- Verify the bot token is correct: `grep DISCORD_BOT_TOKEN .env`
- Test the token:
  ```bash
  curl -H "Authorization: Bot YOUR_TOKEN" https://discord.com/api/v10/users/@me
  ```
  Should return your bot's user object.

### Bot not receiving messages

- Ensure **MESSAGE CONTENT INTENT** is enabled in the Discord Developer Portal → Bot tab
- Verify the bot has **Read Message History** and **View Channels** permissions in the server
- Check if the bot is in the channel: look at the member list
- Check logs: `tail -f logs/nanoclaw.log | grep -i discord`

### Bot not responding

- Verify the channel is registered: `sqlite3 store/messages.db "SELECT * FROM registered_groups WHERE jid LIKE 'dc:%'"`
- Check the trigger pattern matches (e.g., `@Andy` at start of message)
- For main channel: ensure `requires_trigger` is `0`
- Check container logs: `cat groups/main/logs/container-*.log | tail -50`

### Messages bleeding between channels

- Check that each channel has a unique JID: `dc:<guildId>:<channelId>`
- Verify each is registered as a separate group: `sqlite3 store/messages.db "SELECT jid, folder FROM registered_groups WHERE jid LIKE 'dc:%'"`
- Each folder should be unique — if two channels share a folder, they share context

### Messages truncated

Discord has a 2000-character limit. The client automatically splits long messages. If you see split messages, this is expected behavior. To improve readability, instruct the agent to be more concise in `groups/global/CLAUDE.md`.

### "Used disallowed intents" error

This means you haven't enabled **MESSAGE CONTENT INTENT** in the Discord Developer Portal:
1. Go to https://discord.com/developers/applications
2. Select your app → Bot tab
3. Enable **MESSAGE CONTENT INTENT**
4. Save and restart the bot

### Slash commands not appearing

- Slash commands can take up to an hour to propagate globally
- Check the logs for registration errors: `grep "slash" logs/nanoclaw.log`
- Ensure `applications.commands` scope was selected when inviting the bot
- Try removing and re-inviting the bot with the correct scopes

### Rate limiting during channel creation

Discord has a rate limit of ~2 channel creates per second per guild. The setup script includes a 300ms delay between creations. If you hit limits with very large lists (50+), increase the delay or create in batches.

---

## Removing Discord Integration

To remove Discord entirely:

1. Remove from `src/index.ts`:
   - Delete Discord imports (`sendDiscordMessage`, `setDiscordTyping`, `startDiscordBot`, `stopDiscordBot`)
   - Remove `dc:` branches from `sendMessage()` and `setTyping()`
   - Remove `startDiscordBot()` call
   - Remove `stopDiscordBot()` from shutdown handler
   - Revert `getAvailableGroups` filter

2. Delete `src/discord-client.ts` and `src/discord-setup.ts`

3. Remove from `src/config.ts`:
   - Delete `DISCORD_BOT_TOKEN`, `DISCORD_ENABLED`, `DISCORD_GUILD_ID`, `DISCORD_MAX_MESSAGE_LENGTH`

4. Remove from `src/db.ts`:
   - Delete `storeChannelMessage` (only if no other channels use it)
   - Delete channel mapping functions (only if no other channels use them)

5. Remove Discord section from `groups/global/CLAUDE.md` and `groups/main/CLAUDE.md`

6. Clean up database:
   ```bash
   sqlite3 store/messages.db "DELETE FROM channel_mappings WHERE platform = 'discord'"
   sqlite3 store/messages.db "DELETE FROM registered_groups WHERE jid LIKE 'dc:%'"
   ```

7. Uninstall dependency:
   ```bash
   npm uninstall discord.js
   ```

8. Remove from `.env`:
   ```bash
   # Remove DISCORD_BOT_TOKEN and DISCORD_GUILD_ID lines from .env
   ```

9. Optionally delete the channels from Discord:
   - The channels created by the bot will remain in the server
   - Delete them manually or via Discord settings

10. Remove from Discord Developer Portal (optional):
    - Go to https://discord.com/developers/applications
    - Delete the application, or just kick the bot from your server

11. Rebuild:
    ```bash
    npm run build
    launchctl kickstart -k gui/$(id -u)/com.nanoclaw
    ```
