/**
 * Discord Client for NanoClaw
 * Handles Discord bot connection, message receiving, sending,
 * and channel creation/management.
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
  getAllChannelMappings,
  type ChannelMapping,
} from './db.js';
import { logger } from './logger.js';

let client: Client | null = null;

// In-memory cache of channel mappings (loaded from DB at startup)
let channelMappings: Map<string, ChannelMapping> = new Map();

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
 */
function buildChannelName(msg: Message): string {
  const guildName = msg.guild?.name || 'DM';
  const guildId = msg.guildId || 'dm';
  const channelId = msg.channelId;

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

    let splitIndex = remaining.lastIndexOf('\n', DISCORD_MAX_MESSAGE_LENGTH);
    if (splitIndex < DISCORD_MAX_MESSAGE_LENGTH * 0.5) {
      splitIndex = remaining.lastIndexOf(' ', DISCORD_MAX_MESSAGE_LENGTH);
    }
    if (splitIndex < DISCORD_MAX_MESSAGE_LENGTH * 0.5) {
      splitIndex = DISCORD_MAX_MESSAGE_LENGTH;
    }

    chunks.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return chunks;
}

/**
 * Register slash commands.
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
 */
export async function createDiscordChannels(
  guild: Guild,
  channelNames: string[],
  categoryName?: string,
): Promise<Array<{ name: string; channelId: string; jid: string; folder: string }>> {
  const results: Array<{ name: string; channelId: string; jid: string; folder: string }> = [];

  const existing = getChannelMappings('discord', guild.id);
  const existingNames = new Set(existing.map((m) => m.channel_name.toLowerCase()));

  let category: CategoryChannel | undefined;
  if (categoryName) {
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
    const discordName = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    if (existingNames.has(discordName)) {
      const existingMapping = existing.find(
        (m) => m.channel_name.toLowerCase() === discordName,
      );
      if (existingMapping) {
        logger.info({ name: discordName, channelId: existingMapping.channel_id }, 'Channel exists');
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
      const channel = await guild.channels.create({
        name: discordName,
        type: ChannelType.GuildText,
        parent: category?.id,
        topic: `NanoClaw AI assistant channel`,
      });

      const channelId = channel.id;
      const jid = buildChatKey(guild.id, channelId);
      const folder = `dc-${discordName}`;

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
  logger.info({ count: channelMappings.size }, 'Loaded Discord channel mappings');
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

  client.once('ready', async () => {
    if (!client?.user) return;
    logger.info({ username: client.user.tag }, 'Discord bot connected');

    if (options?.enableSlashCommands) {
      await registerSlashCommands(client.user.id);
    }
  });

  client.on('messageCreate', (msg) => {
    try {
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

      const channelName = buildChannelName(msg);
      handler.onChatMetadata(chatKey, timestamp, channelName);
      handler.onMessage(chatKey, messageId, sender, senderName, msg.content, timestamp, false);

      logger.debug({ chatKey, sender: senderName, length: msg.content.length }, 'Discord message received');
    } catch (err) {
      logger.error({ err }, 'Error handling Discord message');
    }
  });

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

      await interaction.deferReply();

      handler.onChatMetadata(chatKey, timestamp, `Slash: ${interaction.guild?.name || 'DM'}`);
      handler.onMessage(chatKey, messageId, sender, senderName, question, timestamp, false);

      pendingInteractions.set(messageId, interaction);
      setTimeout(() => pendingInteractions.delete(messageId), 15 * 60 * 1000);
    });
  }

  client.on('error', (err) => {
    logger.error({ err }, 'Discord client error');
  });

  try {
    await client.login(DISCORD_BOT_TOKEN);
  } catch (err) {
    logger.error({ err }, 'Failed to start Discord bot');
    throw err;
  }
}

const pendingInteractions = new Map<string, any>();

/**
 * Get the Discord client instance.
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
    const targetChannelId = parsed.threadId || parsed.channelId;
    const channel = await client.channels.fetch(targetChannelId);

    if (!channel || !('send' in channel)) {
      logger.error({ chatKey, targetChannelId }, 'Discord channel not found');
      return;
    }

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
