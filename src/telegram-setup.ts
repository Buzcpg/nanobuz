/**
 * Telegram Forum Setup
 * Run once to create topics and register groups.
 * Usage: npx tsx src/telegram-setup.ts "General, Research, Schedule, ..."
 */
import { Bot } from 'grammy';
import fs from 'fs';
import path from 'path';

import {
  initDatabase,
  storeChannelMapping,
  getChannelMappings,
  setRegisteredGroup,
  storeChatMetadata,
} from './db.js';
import {
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_FORUM_CHAT_ID,
  ASSISTANT_NAME,
  GROUPS_DIR,
} from './config.js';

async function main(): Promise<void> {
  const input = process.argv[2];
  if (!input) {
    console.error(
      'Usage: npx tsx src/telegram-setup.ts "General, Research, Schedule, ..."',
    );
    process.exit(1);
  }

  const topicNames = input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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

  initDatabase();

  const bot = new Bot(TELEGRAM_BOT_TOKEN);
  await bot.init();
  console.log(`Bot initialized: @${bot.botInfo.username}`);

  const existing = getChannelMappings('telegram', String(chatId));
  const existingNames = new Set(existing.map((m) => m.channel_name.toLowerCase()));

  console.log(`\nCreating ${topicNames.length} topics in chat ${chatId}...`);
  console.log(`(${existing.length} topics already mapped)\n`);

  const results: Array<{
    name: string;
    topicId: number;
    jid: string;
    folder: string;
  }> = [];

  for (const name of topicNames) {
    if (existingNames.has(name.toLowerCase())) {
      const existingMapping = existing.find(
        (m) => m.channel_name.toLowerCase() === name.toLowerCase(),
      );
      if (existingMapping) {
        console.log(
          `  ✓ "${name}" already exists (topic ${existingMapping.channel_id}), skipping`,
        );
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
      const jid = `tg:${chatId}:${topicId}`;
      const folder = `tg-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`;

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

      await new Promise((r) => setTimeout(r, 200));
    } catch (err: any) {
      console.error(`  ✗ Failed to create "${name}": ${err.message || err}`);
      process.exit(1);
    }
  }

  console.log(`\nRegistering ${results.length} NanoClaw groups...\n`);

  for (let i = 0; i < results.length; i++) {
    const { name, jid, folder } = results[i];
    const isMain = i === 0;
    const groupFolder = isMain ? 'main' : folder;

    setRegisteredGroup(jid, {
      name,
      folder: groupFolder,
      trigger: `@${ASSISTANT_NAME}`,
      added_at: new Date().toISOString(),
      requiresTrigger: isMain ? false : true,
    });

    storeChatMetadata(jid, new Date().toISOString(), name);

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
          (isMain
            ? '\nThis is the admin/main channel. You can manage groups and tasks here.\n'
            : ''),
      );
    }

    console.log(
      `  ✓ Registered "${name}" → folder: ${groupFolder} (${isMain ? 'main/admin' : 'standard'})`,
    );
  }

  console.log('\n' + '='.repeat(60));
  console.log('TELEGRAM FORUM SETUP COMPLETE');
  console.log('='.repeat(60));
  console.log(`\nChat ID: ${chatId}`);
  console.log(`Topics created: ${results.length}`);
  console.log(`\nTopic mapping:`);
  for (const r of results) {
    console.log(
      `  ${r.name.padEnd(20)} → topic:${r.topicId}  jid:${r.jid}  folder:${r.folder}`,
    );
  }
  console.log(`\nMain/admin topic: ${results[0]?.name || 'none'}`);
  console.log('\nRestart NanoClaw to activate.');

  process.exit(0);
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
