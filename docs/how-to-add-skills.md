# How to Add `/add-telegram` and `/add-discord` Skills to NanoClaw

A practical guide for contributing Telegram (forum mode with topics) and Discord bot skills to the NanoClaw project.

---

## Table of Contents

1. [Understanding NanoClaw's Skill System](#1-understanding-nanoclaws-skill-system)
2. [Architecture Overview](#2-architecture-overview)
3. [Anatomy of a Skill](#3-anatomy-of-a-skill)
4. [How to Create `/add-telegram`](#4-how-to-create-add-telegram)
5. [How to Create `/add-discord`](#5-how-to-create-add-discord)
6. [Integration Patterns Reference](#6-integration-patterns-reference)
7. [Testing & Contribution Checklist](#7-testing--contribution-checklist)

---

## 1. Understanding NanoClaw's Skill System

### What is a Skill?

A skill is a markdown file at `.claude/skills/<skill-name>/SKILL.md` that teaches **Claude Code** how to transform a NanoClaw installation. Skills are NOT pre-built code — they are **instructions** that Claude follows to modify the codebase.

When a user runs `/add-telegram` in Claude Code, Claude reads the SKILL.md and makes the described code changes to their fork. The user ends up with clean, minimal code that does exactly what they need.

### Key Rules

- **A skill PR must not modify any source files.** It only adds files under `.claude/skills/<skill-name>/`.
- The skill file contains the instructions and patterns Claude follows. Claude then edits the actual source files.
- Exception: if the skill requires companion code that runs inside the container (like MCP tool definitions), those files can live alongside the SKILL.md (see the `x-integration` skill for this pattern).

### Existing Skills to Study

| Skill | Complexity | Pattern |
|-------|-----------|---------|
| `/convert-to-docker` | Simple | Pure instructions — tells Claude which lines to find/replace in source files |
| `/add-gmail` | Medium | Instructions + asks user questions (tool mode vs. channel mode) + adds MCP server |
| `/x-integration` | Complex | Instructions + companion TypeScript files (`agent.ts`, `host.ts`, `scripts/`) that get copied into the build |

For adding Telegram and Discord, the **`/add-gmail`** pattern is the closest reference — it adds a new I/O channel with both "tool mode" (agent can interact with the platform) and "channel mode" (messages from the platform trigger the agent).

---

## 2. Architecture Overview

Understanding NanoClaw's architecture is essential for writing channel skills.

### Message Flow

```
Input Channel (WhatsApp) → SQLite DB → Polling Loop → Container (Claude Agent SDK) → Response → Output Channel (WhatsApp)
```

### Key Components

| Component | File | Role |
|-----------|------|------|
| Main process | `src/index.ts` | Connects to WhatsApp, routes messages, runs IPC watcher |
| Config | `src/config.ts` | Trigger pattern, paths, intervals |
| Database | `src/db.ts` | SQLite operations for messages, tasks, groups, sessions |
| Container runner | `src/container-runner.ts` | Builds volume mounts, spawns container processes |
| Agent runner | `container/agent-runner/src/index.ts` | Runs inside container, invokes Claude Agent SDK |
| IPC MCP | `container/agent-runner/src/ipc-mcp.ts` | MCP tools for send_message, schedule_task, etc. |
| Task scheduler | `src/task-scheduler.ts` | Polls for due tasks, runs them in containers |
| Group queue | `src/group-queue.ts` | Concurrency control, one container per group at a time |
| Types | `src/types.ts` | TypeScript interfaces (RegisteredGroup, ScheduledTask, etc.) |

### How Messages Are Processed

1. **Input**: WhatsApp client (baileys) receives message
2. **Store**: Message saved to SQLite (`messages` table) with chat_jid, sender, content, timestamp
3. **Poll**: Message loop polls SQLite every 2 seconds for new messages in registered groups
4. **Check**: Router checks if message matches trigger pattern (`@Andy`)
5. **Catch-up**: All messages since last agent interaction are gathered as context
6. **Spawn**: Container spawned with group's volume mounts, prompt piped via stdin as JSON
7. **Process**: Claude Agent SDK runs inside container with tools (Bash, Read, Write, WebSearch, MCP tools)
8. **Output**: Agent response (JSON) parsed from container stdout
9. **Send**: Response sent back via WhatsApp with `ASSISTANT_NAME:` prefix

### IPC System

The container communicates with the host via filesystem-based IPC:
- **Messages**: Container writes JSON files to `/workspace/ipc/messages/`
- **Tasks**: Container writes JSON files to `/workspace/ipc/tasks/`
- **Host**: IPC watcher polls these directories every second, processes files, and deletes them

This IPC model is critical — new channels can hook into it on the host side to send messages back through the new channel instead of WhatsApp.

---

## 3. Anatomy of a Skill

### SKILL.md Structure

```markdown
---
name: skill-name
description: What the skill does and when to trigger it.
---

# Skill Title

Brief description of what the skill adds.

## Initial Questions
Ask the user what mode/options they want.

## Prerequisites
Check what's already installed/configured.

## Step N: [Change Description]
Detailed instructions for Claude to modify specific files.
Include "find this" → "replace with this" patterns.

## Rebuild and Test
Commands to rebuild and verify.

## Troubleshooting
Common issues and fixes.
```

### The Two Design Patterns for Channel Skills

**Pattern A: Replace WhatsApp entirely**
- Remove baileys dependency and WhatsApp connection code
- Replace with new channel's client library
- Same message flow, different I/O

**Pattern B: Add alongside WhatsApp (multi-channel)**
- Keep WhatsApp as-is
- Add new channel connection in parallel
- Messages from either channel route to the same agent
- Responses route back to the originating channel
- Each channel's groups are tracked with a channel identifier

For Telegram and Discord, **Pattern B** is the recommended default, with an option for Pattern A.

---

## 4. How to Create `/add-telegram`

### Goal

Add Telegram as a channel, specifically supporting **forum mode** (topics). Each Telegram forum topic maps to a NanoClaw "group" with its own memory and context.

### Library Choice

**[grammY](https://grammy.dev/)** is the recommended Telegram Bot API framework for Node.js:
- Lightweight, TypeScript-first
- Excellent forum/topics support
- Active maintenance
- Simple bot creation with `Bot` class

Alternative: `telegraf` — also excellent, but grammY has better TypeScript support and more active development.

### Skill File: `.claude/skills/add-telegram/SKILL.md`

The SKILL.md should instruct Claude to perform these changes:

#### Initial Questions to Ask the User

1. **Mode**: "Should Telegram replace WhatsApp or run alongside it?"
   - Replace: remove baileys, convert all WhatsApp code to Telegram
   - Alongside: keep WhatsApp, add Telegram as additional channel

2. **Forum mode**: "Do you want to use Telegram forum mode (topics)? Each topic becomes a separate conversation context with its own memory."
   - Yes: map topics to groups
   - No: each Telegram group = one NanoClaw group

3. **Control channel**: "Which channel should be your admin control (main) channel?"
   - WhatsApp (keep existing)
   - A specific Telegram chat/topic
   - Both (either can be used for admin)

4. **Trigger word**: "Same trigger as WhatsApp (`@Andy`) or different for Telegram?"

#### Prerequisites

```bash
# Check if grammY is installed
npm ls grammy 2>/dev/null || echo "grammY not installed"
```

The user needs a Telegram Bot Token from [@BotFather](https://t.me/BotFather):
1. Open Telegram, search for `@BotFather`
2. Send `/newbot`, follow prompts
3. Copy the bot token
4. Add to `.env` as `TELEGRAM_BOT_TOKEN=...`

For forum mode, the bot needs to be added to a Telegram group that has **Topics enabled** (Group Settings → Topics → Enable). The bot needs admin permissions to read topic messages.

#### Step 1: Install Dependencies

```bash
npm install grammy
```

#### Step 2: Add Telegram Config (`src/config.ts`)

Add to `src/config.ts`:

```typescript
// Telegram configuration
export const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
export const TELEGRAM_ENABLED = !!TELEGRAM_BOT_TOKEN;
```

#### Step 3: Create Telegram Auth Module (`src/telegram-client.ts`)

Create a new file that handles:
- Bot initialization with grammY's `Bot` class
- Forum topic tracking (topic ID → group folder mapping)
- Message receiving and forwarding to the processing pipeline
- Message sending back to the correct chat/topic

Key grammY concepts for forum mode:
- `ctx.message.message_thread_id` — the topic ID within a forum group
- `ctx.api.sendMessage(chatId, text, { message_thread_id: topicId })` — send to specific topic
- `ctx.message.is_topic_message` — whether message is in a topic
- `ctx.message.forum_topic_created` — topic creation events

The Telegram client should:

```typescript
// Pseudo-structure for the telegram client
import { Bot } from 'grammy';

// Create bot
const bot = new Bot(TELEGRAM_BOT_TOKEN);

// Handle messages in forum topics
bot.on('message:text', async (ctx) => {
  const chatId = ctx.chat.id;
  const topicId = ctx.message.message_thread_id; // undefined if not in a topic
  const text = ctx.message.text;
  const senderName = ctx.from?.first_name || 'Unknown';

  // Build a unique JID-like identifier for this chat/topic
  // e.g., "tg:chatId:topicId" or "tg:chatId" for non-forum
  const chatKey = topicId
    ? `tg:${chatId}:${topicId}`
    : `tg:${chatId}`;

  // Store message in SQLite (same as WhatsApp flow)
  // Route through the same processing pipeline
});

// Send message to a specific chat/topic
async function sendTelegramMessage(chatKey: string, text: string) {
  const [, chatId, topicId] = chatKey.split(':');
  await bot.api.sendMessage(Number(chatId), text, {
    message_thread_id: topicId ? Number(topicId) : undefined,
  });
}
```

#### Step 4: Modify Message Storage (`src/db.ts`)

The existing `storeMessage` function is tightly coupled to WhatsApp's `proto.IWebMessageInfo` type. Add a channel-agnostic message storage function:

```typescript
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

#### Step 5: Modify Message Routing (`src/index.ts`)

The main `sendMessage` function currently only sends via WhatsApp. Add channel-aware routing:

```typescript
async function sendMessage(jid: string, text: string): Promise<void> {
  if (jid.startsWith('tg:')) {
    // Route to Telegram
    await sendTelegramMessage(jid, text);
  } else {
    // Route to WhatsApp (existing code)
    await sock.sendMessage(jid, { text });
  }
}
```

Similarly, the `setTyping` function should be made channel-aware (Telegram has `ctx.api.sendChatAction(chatId, 'typing')`).

#### Step 6: Register Telegram Groups

For forum mode, each topic should be auto-registerable. The skill should instruct Claude to either:
- Auto-register topics when the bot first sees a message in them
- Or provide a command to register topics from the main channel

The registered group entry would look like:

```json
{
  "tg:-1001234567890:42": {
    "name": "My Forum - General Topic",
    "folder": "tg-general-topic",
    "trigger": "@Andy",
    "added_at": "2026-02-08T00:00:00Z",
    "requiresTrigger": true
  }
}
```

#### Step 7: Update IPC Message Handling

In the IPC watcher (`startIpcWatcher` in `src/index.ts`), the `sendMessage` call already goes through the channel-aware `sendMessage` function, so IPC messages from agents will automatically route back to the correct Telegram chat/topic.

#### Step 8: Add Telegram-Specific Formatting to Group Memory

Add to `groups/global/CLAUDE.md`:

```markdown
## Telegram Formatting

When responding in Telegram (chat IDs starting with "tg:"), use Telegram MarkdownV2:
- **Bold**: *text*
- _Italic_: _text_
- `Code`: `text`
- ```Code blocks```: ```language\ncode```
- Escape special characters: _ * [ ] ( ) ~ ` > # + - = | { } . !
```

#### Step 9: Handle Bot Token in Container

Add the bot token to the allowed environment variables in `src/container-runner.ts`:

```typescript
const allowedVars = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'TELEGRAM_BOT_TOKEN'];
```

This is only needed if agents inside the container need to interact with Telegram directly (e.g., for a Telegram MCP tool). If all Telegram I/O goes through the host process via IPC, this isn't needed.

#### Step 10: Update `.env` and Service Config

Add `TELEGRAM_BOT_TOKEN` to the launchd plist environment variables (or systemd unit file if using Docker/Linux).

#### Rebuild and Test

```bash
npm run build
# Restart service
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
# Or on Linux:
# sudo systemctl restart nanoclaw
```

Test by sending a message in a Telegram forum topic where the bot is present.

---

## 5. How to Create `/add-discord`

### Goal

Add Discord as a channel. The bot joins a Discord server and can be interacted with in any channel. Each Discord channel (or thread) maps to a NanoClaw "group."

### Library Choice

**[discord.js](https://discord.js.org/)** is the standard Discord library for Node.js:
- Most popular, most documented
- Full API coverage including threads, forums, slash commands
- TypeScript support
- Active community

### Skill File: `.claude/skills/add-discord/SKILL.md`

#### Initial Questions to Ask the User

1. **Mode**: "Should Discord replace WhatsApp or run alongside it?"

2. **Channel mapping**: "How should Discord channels map to NanoClaw groups?"
   - Each Discord channel = one NanoClaw group
   - Each Discord thread = one NanoClaw group
   - Specific channels only (whitelist)

3. **Interaction mode**: "How should the bot be triggered?"
   - Mention-based: `@BotName message` (matches NanoClaw's trigger pattern)
   - Slash commands: `/ask message`
   - Both

4. **Control channel**: "Which channel should be admin (main)?"
   - A specific Discord channel
   - WhatsApp (keep existing)

#### Prerequisites

The user needs a Discord Bot Token:
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application", name it
3. Go to "Bot" tab, click "Add Bot"
4. Copy the bot token
5. Under "Privileged Gateway Intents", enable:
   - **Message Content Intent** (required to read message text)
   - **Server Members Intent** (for member names)
6. Go to "OAuth2" → "URL Generator":
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Send Messages`, `Read Message History`, `Use Slash Commands`
   - Copy the generated URL and open it to invite the bot to your server
7. Add to `.env` as `DISCORD_BOT_TOKEN=...`

#### Step 1: Install Dependencies

```bash
npm install discord.js
```

#### Step 2: Add Discord Config (`src/config.ts`)

```typescript
// Discord configuration
export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
export const DISCORD_ENABLED = !!DISCORD_BOT_TOKEN;
```

#### Step 3: Create Discord Client Module (`src/discord-client.ts`)

Key discord.js concepts:
- `Client` with `GatewayIntentBits.Guilds`, `GatewayIntentBits.GuildMessages`, `GatewayIntentBits.MessageContent`
- `message.channelId` — unique channel identifier
- `message.channel.isThread()` — check if message is in a thread
- `message.channel.send(text)` — send message to channel

```typescript
// Pseudo-structure for the Discord client
import { Client, GatewayIntentBits, Events } from 'discord.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return; // Ignore bot messages

  const chatKey = `dc:${message.guild?.id}:${message.channelId}`;
  const text = message.content;
  const senderName = message.member?.displayName || message.author.username;

  // Store message in SQLite
  // Route through processing pipeline
});

// Send message to a specific channel
async function sendDiscordMessage(chatKey: string, text: string) {
  const [, guildId, channelId] = chatKey.split(':');
  const channel = await client.channels.fetch(channelId);
  if (channel?.isTextBased()) {
    // Discord has a 2000 character limit per message
    // Split long messages
    const chunks = splitMessage(text, 2000);
    for (const chunk of chunks) {
      await channel.send(chunk);
    }
  }
}

client.login(DISCORD_BOT_TOKEN);
```

#### Step 4: Modify Message Storage (`src/db.ts`)

Same as Telegram — use the channel-agnostic `storeChannelMessage` function. Discord message IDs are snowflakes (large integers as strings), which work fine as the `id` field.

#### Step 5: Modify Message Routing (`src/index.ts`)

Add Discord to the channel-aware `sendMessage`:

```typescript
async function sendMessage(jid: string, text: string): Promise<void> {
  if (jid.startsWith('dc:')) {
    await sendDiscordMessage(jid, text);
  } else if (jid.startsWith('tg:')) {
    await sendTelegramMessage(jid, text);
  } else {
    await sock.sendMessage(jid, { text });
  }
}
```

#### Step 6: Register Discord Channels

Discord channels can be auto-registered on first message, or registered via main channel:

```json
{
  "dc:123456789:987654321": {
    "name": "My Server - #general",
    "folder": "dc-general",
    "trigger": "@Andy",
    "added_at": "2026-02-08T00:00:00Z",
    "requiresTrigger": true
  }
}
```

#### Step 7: Discord-Specific Considerations

- **Message length**: Discord has a 2000-character limit. Long responses must be split.
- **Formatting**: Discord uses standard Markdown (bold, italic, code blocks, etc.) — same as what Claude naturally produces.
- **Embeds**: Consider using Discord embeds for structured responses (optional enhancement).
- **Typing indicator**: `message.channel.sendTyping()` — auto-expires after 10 seconds, can be called in a loop.
- **Rate limits**: discord.js handles rate limiting automatically.
- **Reconnection**: discord.js handles reconnection automatically.

#### Step 8: Update Group Memory

Add to `groups/global/CLAUDE.md`:

```markdown
## Discord Formatting

When responding in Discord (chat IDs starting with "dc:"), use standard Markdown:
- **Bold**: **text**
- *Italic*: *text*
- `Code`: `code`
- Code blocks: ```language\ncode```
- Spoilers: ||text||
- > Block quotes

Keep messages under 2000 characters. Use multiple messages for longer content.
```

#### Rebuild and Test

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

Invite the bot to your Discord server and send a message mentioning it.

---

## 6. Integration Patterns Reference

### Pattern: Adding a New Channel (Summary)

Every new channel follows this pattern. Here's the checklist:

| Step | Files Modified | Description |
|------|---------------|-------------|
| 1 | `package.json` | Add channel library dependency |
| 2 | `src/config.ts` | Add channel token/config constants |
| 3 | `src/<channel>-client.ts` | **New file** — Channel connection, message handling, sending |
| 4 | `src/db.ts` | Add channel-agnostic message storage (if not already done) |
| 5 | `src/types.ts` | Add any new interfaces if needed |
| 6 | `src/index.ts` | Import channel client, make `sendMessage()` channel-aware, start channel in `main()` |
| 7 | `src/container-runner.ts` | Only if channel token needed inside container |
| 8 | `groups/global/CLAUDE.md` | Add formatting guidelines for the channel |
| 9 | `.env` | Add channel token |
| 10 | Service config | Add env var to launchd/systemd |

### Pattern: Channel-Aware JID Scheme

To support multiple channels, use a prefix-based JID scheme:

| Channel | JID Format | Example |
|---------|-----------|---------|
| WhatsApp | `<number>@s.whatsapp.net` or `<id>@g.us` | `1234567890@s.whatsapp.net` |
| Telegram | `tg:<chatId>` or `tg:<chatId>:<topicId>` | `tg:-1001234567890:42` |
| Discord | `dc:<guildId>:<channelId>` | `dc:123456789:987654321` |

The `sendMessage` function in `src/index.ts` routes based on prefix. The IPC watcher automatically uses this routing, so agents can send messages to any channel via the `send_message` MCP tool.

### Pattern: Extending IPC for Host-Side Actions

For actions that must run on the host (not in the container), follow the x-integration pattern:

1. **Container side** (`agent.ts`): Define MCP tools that write IPC files
2. **Host side** (`host.ts`): Handle IPC files with the actual implementation
3. **Integration**: Hook into `processTaskIpc` in `src/index.ts` via the default case

### How Container Agent Sends Messages Back

The agent inside the container has two ways to send messages:

1. **`mcp__nanoclaw__send_message` tool** — Writes a JSON file to `/workspace/ipc/messages/`. The host IPC watcher picks it up and calls `sendMessage(chatJid, text)`. Because `chatJid` contains the channel prefix, the message routes to the correct channel.

2. **Structured output `userMessage`** — Returned in the container's stdout JSON. The host reads it and calls `sendMessage(chatJid, text)` with the original chatJid.

Both paths go through the same `sendMessage` function, so channel-aware routing works automatically.

---

## 7. Testing & Contribution Checklist

### Before Submitting a Skill PR

- [ ] **No source files modified** — only files under `.claude/skills/<skill-name>/`
- [ ] **Tested on fresh clone** — run the skill on a clean NanoClaw installation
- [ ] **Questions are clear** — user can understand options without prior knowledge
- [ ] **Step-by-step instructions** — Claude can follow without ambiguity
- [ ] **Find/replace patterns** — include enough context for Claude to locate the right code
- [ ] **Rebuild instructions** — include `npm run build`, container rebuild if needed, service restart
- [ ] **Troubleshooting section** — cover common failure modes
- [ ] **Removal instructions** — how to undo the skill's changes

### Testing Telegram Forum Mode

1. Create a Telegram group
2. Enable Topics in group settings (Settings → Topics)
3. Add the bot to the group as admin
4. Create several topics
5. Send messages in different topics
6. Verify each topic has its own conversation context
7. Verify scheduled tasks work per-topic
8. Verify IPC messages route to the correct topic

### Testing Discord

1. Create a Discord server (or use an existing one)
2. Invite the bot with correct permissions
3. Send messages in different channels
4. Verify each channel has its own conversation context
5. Test with messages over 2000 characters (should split)
6. Verify typing indicators work
7. Test reconnection (restart the service)

### Testing Multi-Channel

If running alongside WhatsApp:
1. Send a message via WhatsApp — verify response comes back via WhatsApp
2. Send a message via Telegram — verify response comes back via Telegram
3. Send a message via Discord — verify response comes back via Discord
4. Schedule a task from Telegram — verify it sends results to Telegram
5. From main channel, list tasks from all channels
6. Verify group isolation (Telegram groups can't see Discord groups' data)

---

## Quick Reference: File Map

```
.claude/skills/add-telegram/
└── SKILL.md                  # Instructions for Claude to add Telegram

.claude/skills/add-discord/
└── SKILL.md                  # Instructions for Claude to add Discord

# Files the skills will MODIFY (not included in the PR):
src/config.ts                 # Add TELEGRAM_BOT_TOKEN / DISCORD_BOT_TOKEN
src/index.ts                  # Import channel clients, channel-aware sendMessage
src/db.ts                     # Add storeChannelMessage if not present
src/types.ts                  # Optional new interfaces
groups/global/CLAUDE.md       # Add formatting guidelines

# Files the skills will CREATE:
src/telegram-client.ts        # Telegram bot connection & message handling
src/discord-client.ts         # Discord bot connection & message handling
```

---

## Summary

Adding a new channel to NanoClaw follows a consistent pattern:

1. **Connect** — Initialize the channel's client library and listen for messages
2. **Store** — Save incoming messages to SQLite with a channel-prefixed JID
3. **Route** — Feed messages through the existing polling → container → agent pipeline
4. **Respond** — Make `sendMessage()` channel-aware so responses route back correctly
5. **Configure** — Add tokens to `.env` and service configuration

The skill's SKILL.md file should guide Claude Code through each of these steps with specific file paths, find/replace patterns, and verification commands. Study `/convert-to-docker` for instruction style and `/add-gmail` for channel addition patterns.
