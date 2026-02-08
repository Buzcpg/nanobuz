/**
 * Telegram Client for NanoClaw
 * Handles Telegram bot connection, message receiving, sending,
 * and forum topic creation/management.
 */
import { Bot, Context } from 'grammy';
import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_ENABLED,
  TELEGRAM_FORUM_CHAT_ID,
  TELEGRAM_ALLOWED_USER_IDS,
} from './config.js';
import {
  storeChannelMapping,
  getChannelMappings,
  getAllChannelMappings,
  type ChannelMapping,
} from './db.js';
import { logger } from './logger.js';

let bot: Bot | null = null;

// In-memory cache of topic mappings (loaded from DB at startup)
let topicMappings: Map<string, ChannelMapping> = new Map();

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
export function parseChatKey(
  chatKey: string,
): { chatId: number; topicId?: number } | null {
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
function resolveTopicName(
  chatId: number,
  topicId?: number,
): string | undefined {
  if (!topicId) return undefined;
  const jid = buildChatKey(chatId, topicId);
  const mapping = topicMappings.get(jid);
  return mapping?.channel_name;
}

/**
 * Build a display name for a chat/topic.
 */
function buildChatName(ctx: Context): string {
  const chatTitle = ctx.chat?.title || `Chat ${ctx.chat?.id}`;
  const chatId = ctx.chat?.id;
  const topicId = ctx.message?.message_thread_id;

  if (chatId && topicId) {
    const storedName = resolveTopicName(chatId, topicId);
    if (storedName) {
      return `${chatTitle} - ${storedName}`;
    }
  }

  const topicName = (ctx.message as any)?.reply_to_message?.forum_topic_created
    ?.name;
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
 */
export async function createForumTopics(
  chatId: number,
  topicNames: string[],
): Promise<Array<{ name: string; topicId: number; jid: string; folder: string }>> {
  if (!bot) {
    throw new Error('Telegram bot not initialized');
  }

  const results: Array<{
    name: string;
    topicId: number;
    jid: string;
    folder: string;
  }> = [];

  const existing = getChannelMappings('telegram', String(chatId));
  const existingNames = new Set(existing.map((m) => m.channel_name.toLowerCase()));

  for (const name of topicNames) {
    if (existingNames.has(name.toLowerCase())) {
      const existingMapping = existing.find(
        (m) => m.channel_name.toLowerCase() === name.toLowerCase(),
      );
      if (existingMapping) {
        logger.info({ name, topicId: existingMapping.channel_id }, 'Topic exists');
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
      const topic = await bot.api.createForumTopic(chatId, name);
      const topicId = topic.message_thread_id;
      const jid = buildChatKey(chatId, topicId);
      const folder = `tg-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

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
      topicMappings.set(jid, mapping);

      results.push({ name, topicId, jid, folder });
      logger.info({ name, topicId, jid, folder }, 'Created Telegram topic');
    } catch (err) {
      logger.error({ name, err }, 'Failed to create Telegram topic');
      throw err;
    }
  }

  return results;
}

/**
 * Load topic mappings from DB into memory cache.
 */
function loadTopicMappings(): void {
  const allMappings = getAllChannelMappings('telegram');
  topicMappings = new Map(allMappings.map((m) => [m.jid, m]));
  logger.info({ count: topicMappings.size }, 'Loaded Telegram topic mappings');
}

/**
 * Initialize and start the Telegram bot.
 */
export async function startTelegramBot(
  handler: TelegramMessageHandler,
): Promise<void> {
  if (!TELEGRAM_ENABLED) {
    logger.info('Telegram disabled (no TELEGRAM_BOT_TOKEN)');
    return;
  }

  if (TELEGRAM_ALLOWED_USER_IDS.size === 0) {
    logger.error(
      'TELEGRAM_ALLOWED_USER_IDS is empty — refusing to start Telegram bot',
    );
    throw new Error('TELEGRAM_ALLOWED_USER_IDS must not be empty');
  }

  logger.info(
    { allowedUsers: TELEGRAM_ALLOWED_USER_IDS.size },
    'Telegram user whitelist loaded',
  );

  bot = new Bot(TELEGRAM_BOT_TOKEN);

  loadTopicMappings();

  bot.on('message:text', (ctx) => {
    try {
      if (!ctx.message.text) return;

      const isFromMe = ctx.from?.id === bot?.botInfo?.id;
      if (isFromMe) return;

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

      const chatName = buildChatName(ctx);
      handler.onChatMetadata(chatKey, timestamp, chatName);
      handler.onMessage(
        chatKey,
        messageId,
        sender,
        senderName,
        text,
        timestamp,
        false,
      );

      logger.debug(
        { chatKey, sender: senderName, length: text.length },
        'Telegram message received',
      );
    } catch (err) {
      logger.error({ err }, 'Error handling Telegram message');
    }
  });

  bot.on('message:forum_topic_created', (ctx) => {
    try {
      const chatId = ctx.chat.id;
      const topicId = ctx.message.message_thread_id;
      if (topicId) {
        const chatKey = buildChatKey(chatId, topicId);
        const topicName =
          ctx.message.forum_topic_created?.name || `Topic ${topicId}`;
        const chatTitle = ctx.chat.title || `Chat ${chatId}`;
        handler.onChatMetadata(
          chatKey,
          new Date().toISOString(),
          `${chatTitle} - ${topicName}`,
        );
        logger.info({ chatKey, topicName }, 'Telegram topic created externally');
      }
    } catch (err) {
      logger.error({ err }, 'Error handling forum topic creation');
    }
  });

  bot.catch((err) => {
    logger.error(
      { err: err.error, ctx: err.ctx?.update?.update_id },
      'Telegram bot error',
    );
  });

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
export async function sendTelegramMessage(
  chatKey: string,
  text: string,
): Promise<void> {
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
export async function setTelegramTyping(
  chatKey: string,
  isTyping: boolean,
): Promise<void> {
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

/**
 * Get the bot instance for setup scripts.
 */
export function getBot(): Bot | null {
  return bot;
}

/**
 * Initialize bot without starting polling (for setup scripts).
 */
export async function initBotForSetup(): Promise<Bot> {
  if (!TELEGRAM_BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN not set');
  }
  const setupBot = new Bot(TELEGRAM_BOT_TOKEN);
  await setupBot.init();
  return setupBot;
}
