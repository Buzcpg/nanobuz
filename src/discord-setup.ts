/**
 * Discord Channel Setup
 * Run once to create channels and register groups.
 * Usage: npx tsx src/discord-setup.ts "general, research, ..." [--category "NanoClaw"]
 */
import { Client, GatewayIntentBits, ChannelType, CategoryChannel } from 'discord.js';
import fs from 'fs';
import path from 'path';

import {
  initDatabase,
  storeChannelMapping,
  getChannelMappings,
  setRegisteredGroup,
  storeChatMetadata,
} from './db.js';
import { DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, ASSISTANT_NAME, GROUPS_DIR } from './config.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let channelInput = '';
  let categoryName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) {
      categoryName = args[i + 1];
      i++;
    } else if (!channelInput) {
      channelInput = args[i];
    }
  }

  if (!channelInput) {
    console.error('Usage: npx tsx src/discord-setup.ts "general, research, ..." [--category "NanoClaw"]');
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

  initDatabase();

  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  await client.login(DISCORD_BOT_TOKEN);

  await new Promise<void>((resolve) => {
    client.once('ready', () => {
      console.log(`Bot connected: ${client.user?.tag}`);
      resolve();
    });
  });

  const guild = await client.guilds.fetch(DISCORD_GUILD_ID);
  if (!guild) {
    console.error(`Guild not found: ${DISCORD_GUILD_ID}`);
    process.exit(1);
  }
  console.log(`Guild: ${guild.name} (${guild.id})`);

  const existing = getChannelMappings('discord', guild.id);
  const existingNames = new Set(existing.map((m) => m.channel_name.toLowerCase()));

  let category: CategoryChannel | undefined;
  if (categoryName) {
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
    const name = rawName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

    if (existingNames.has(name)) {
      const existingMapping = existing.find((m) => m.channel_name.toLowerCase() === name);
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
      const channel = await guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: category?.id,
        topic: `NanoClaw AI assistant`,
      });

      const channelId = channel.id;
      const jid = `dc:${guild.id}:${channelId}`;
      const folder = `dc-${name}`;

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

      await new Promise((r) => setTimeout(r, 300));
    } catch (err: any) {
      console.error(`  ✗ Failed to create "#${name}": ${err.message || err}`);
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

    storeChatMetadata(jid, new Date().toISOString(), `${guild.name} #${name}`);

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
          (isMain ? '\nThis is the admin/main channel. You can manage groups and tasks here.\n' : ''),
      );
    }

    console.log(`  ✓ Registered #${name} → folder: ${groupFolder} (${isMain ? 'main/admin' : 'standard'})`);
  }

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
  console.log('\nRestart NanoClaw to activate.');

  client.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
