import path from 'path';

export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Andy';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;

// Absolute paths needed for container mounts
const PROJECT_ROOT = process.cwd();
const HOME_DIR = process.env.HOME || '/Users/user';

// HOST_WORKSPACE: For Docker-in-Docker, this is the path on the actual host
// where the workspace is mounted. When running natively, this equals PROJECT_ROOT.
// Example: Container sees /app, but actual Pi path is /home/user/nanoclaw
export const HOST_WORKSPACE = process.env.HOST_WORKSPACE || PROJECT_ROOT;

// Mount security: allowlist stored OUTSIDE project root, never mounted into containers
export const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'nanoclaw',
  'mount-allowlist.json',
);
export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const MAIN_GROUP_FOLDER = 'main';

// Host paths for Docker-in-Docker (translates container paths to host paths)
export const HOST_STORE_DIR = path.join(HOST_WORKSPACE, 'store');
export const HOST_GROUPS_DIR = path.join(HOST_WORKSPACE, 'groups');
export const HOST_DATA_DIR = path.join(HOST_WORKSPACE, 'data');

export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'ghcr.io/buzcpg/nanoclaw-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '300000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
); // 10MB default
export const IPC_POLL_INTERVAL = 1000;
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks (cron expressions, etc.)
// Uses system timezone by default
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

// Discord configuration
export const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN || '';
export const DISCORD_ENABLED = !!DISCORD_BOT_TOKEN;
export const DISCORD_GUILD_ID = process.env.DISCORD_GUILD_ID || '';
export const DISCORD_MAX_MESSAGE_LENGTH = 2000;
