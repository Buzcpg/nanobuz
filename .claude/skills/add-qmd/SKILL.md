---
name: add-qmd
description: Add qmd-powered persistent memory system to NanoClaw. Implements semantic search over memories, automatic context enrichment before every agent invocation, a link library, learning loops with feedback, and procedure memory. Based on https://github.com/tobi/qmd — a local CLI search engine using BM25 + vector search + LLM reranking. Triggers on "qmd", "add qmd", "add-qmd", "memory system", "add memory".
---

# Add qmd Memory System

This skill transforms NanoClaw into a learning assistant with persistent, searchable memory powered by [qmd](https://github.com/tobi/qmd). Every interaction builds knowledge that improves future responses.

## What This Adds

1. **Semantic Memory Search** — Before every agent invocation, the host searches memory for relevant context and injects it into the prompt. The agent never starts cold.
2. **Link Library** — Any URL shared with the bot is automatically saved with a description and indexed for later retrieval.
3. **Learning Loops** — After completing tasks, the agent stores what it learned. Next time a similar task comes up, those learnings are automatically surfaced.
4. **Procedure Memory** — Step-by-step procedures are stored so the agent can follow proven approaches instead of figuring things out from scratch.
5. **Feedback System** — Track what worked and what didn't. The agent improves over time by referencing past successes and failures.
6. **IPC Memory Tools** — MCP tools inside the container let the agent search, store, and manage memories during execution.

## Architecture Overview

```
User Message
    │
    ▼
┌──────────────────────────────────┐
│  HOST: Memory Enrichment         │
│  1. qmd query "<user message>"   │
│  2. Get top 5 relevant memories  │
│  3. Prepend to agent prompt      │
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  CONTAINER: Agent Execution      │
│  - Has memory context injected   │
│  - Can search more via MCP tools │
│  - Stores new memories via IPC   │
│  - Saves links to library        │
│  - Records learnings on finish   │
└──────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────┐
│  HOST: IPC Memory Handler        │
│  - Processes memory IPC files    │
│  - Runs qmd update after writes  │
│  - Maintains the index           │
└──────────────────────────────────┘
```

### Memory Storage (Markdown Files indexed by qmd)

```
groups/global/memory/
├── learnings/           # Task learnings (auto-generated after tasks)
├── library/             # Saved links with descriptions
├── procedures/          # How-to guides learned from experience
├── facts/               # Known facts about user/environment
└── feedback/            # What worked / what failed

groups/{name}/memory/    # Per-group memory (same structure)
├── learnings/
├── library/
├── procedures/
├── facts/
└── feedback/
```

Each file is a markdown document that qmd indexes with FTS5 + vector embeddings for semantic search.

---

## Initial Questions

### Question 1: Memory Scope

Ask the user:

> How should memory be organized?
>
> **Option 1: Shared Memory (recommended)**
> - All groups share a single memory pool (`groups/global/memory/`)
> - Every group can search and learn from all past interactions
> - Best for single-user setups where context from one group helps another
>
> **Option 2: Isolated Memory**
> - Each group has its own private memory (`groups/{name}/memory/`)
> - Groups can't see each other's memories
> - Plus a global memory pool for explicitly shared knowledge
> - Best for multi-user or privacy-sensitive setups
>
> **Option 3: Hybrid (shared + per-group)**
> - Global memory pool for shared knowledge
> - Per-group memory for group-specific context
> - Agent searches both, prioritizing group-specific results
> - Most flexible, recommended for power users

Store their choice as `MEMORY_SCOPE`: `shared`, `isolated`, or `hybrid`.

### Question 2: Memory Features

Ask the user:

> Which memory features do you want enabled? (All recommended, you can disable any)
>
> 1. **Auto Memory Enrichment** — Before every agent run, search memory and include relevant context in the prompt. *(highly recommended)*
> 2. **Link Library** — Automatically save and index any URLs shared in messages. *(recommended)*
> 3. **Learning Loops** — After tasks, the agent stores what it learned for future reference. *(recommended)*
> 4. **Procedure Memory** — When the agent figures out how to do something, it saves the steps. *(recommended)*
> 5. **Feedback Tracking** — Record what worked and what didn't to improve over time. *(optional)*
>
> Enter the numbers you want (e.g., "1,2,3,4,5" for all, or "1,2,3" for core features):

Parse their response into feature flags:
- `ENABLE_AUTO_ENRICHMENT` (default: true)
- `ENABLE_LINK_LIBRARY` (default: true)
- `ENABLE_LEARNING_LOOPS` (default: true)
- `ENABLE_PROCEDURE_MEMORY` (default: true)
- `ENABLE_FEEDBACK` (default: true)

### Question 3: qmd Installation

Ask the user:

> Do you already have qmd installed?
>
> - **Yes** — I'll verify the installation
> - **No** — I'll guide you through installing it
>
> qmd requires [Bun](https://bun.sh/) runtime. If you don't have Bun, I'll install that too.

### Question 4: Embedding Model

Ask the user:

> qmd uses local AI models for semantic search. Which setup do you prefer?
>
> **Option 1: Full (recommended, ~2GB download)**
> - Embedding model + reranker + query expansion
> - Best search quality (hybrid: FTS + vector + reranking)
> - Uses: `qmd query` for best results
>
> **Option 2: Lightweight (~300MB download)**
> - Embedding model only, no reranker/query expansion
> - Good search quality, faster startup
> - Uses: `qmd vsearch` for vector search, `qmd search` for keyword search
>
> **Option 3: Text-only (no download)**
> - BM25 full-text search only, no AI models
> - Fast but keyword-based (no semantic understanding)
> - Uses: `qmd search` only

Store as `QMD_MODE`: `full`, `lightweight`, or `text_only`.

### Question 5: Memory Index Name

Ask the user:

> What should the qmd index be named? This lets you have separate indexes for different purposes.
>
> Default: `nanoclaw` (recommended)
>
> Press Enter for default, or type a custom name:

Store as `QMD_INDEX_NAME` (default: `nanoclaw`).

---

## Prerequisites

### 1. Install Bun (if not already installed)

```bash
# Check if bun is installed
bun --version 2>/dev/null && echo "Bun is installed" || echo "Bun not found"
```

If Bun is not installed:

```bash
# Install Bun (official installer)
curl -fsSL https://bun.sh/install | bash
# Or on macOS with Homebrew:
# brew install oven-sh/bun/bun
```

Verify:

```bash
bun --version
```

### 2. Install qmd

```bash
# Clone qmd repository
git clone https://github.com/tobi/qmd.git ~/.qmd-tool
cd ~/.qmd-tool

# Install dependencies
bun install

# Make qmd accessible globally
# Option A: Symlink (recommended)
sudo ln -sf ~/.qmd-tool/qmd /usr/local/bin/qmd

# Option B: Add to PATH
echo 'export PATH="$HOME/.qmd-tool:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

Verify qmd is working:

```bash
qmd --help 2>/dev/null && echo "qmd installed successfully" || echo "qmd not found in PATH"
```

If the user already has qmd installed, just verify:

```bash
which qmd && qmd status
```

### 3. Initialize qmd Index

```bash
# Initialize a named index for NanoClaw
qmd --index <QMD_INDEX_NAME> status 2>/dev/null || echo "Index will be created on first use"
```

---

## Step 1: Create Memory Directory Structure

Create the directory structure based on the user's `MEMORY_SCOPE` choice.

**For all modes** (global memory is always created):

```bash
# Create global memory directories
mkdir -p groups/global/memory/learnings
mkdir -p groups/global/memory/library
mkdir -p groups/global/memory/procedures
mkdir -p groups/global/memory/facts
mkdir -p groups/global/memory/feedback
```

**For `isolated` or `hybrid` mode**, also create per-group memory directories for each registered group. Read `data/registered_groups.json` to get the list:

```bash
# For each registered group folder:
for folder in $(cat data/registered_groups.json | grep '"folder"' | sed 's/.*: "//;s/".*//' ); do
  mkdir -p "groups/$folder/memory/learnings"
  mkdir -p "groups/$folder/memory/library"
  mkdir -p "groups/$folder/memory/procedures"
  mkdir -p "groups/$folder/memory/facts"
  mkdir -p "groups/$folder/memory/feedback"
done
```

Create initial index files for each memory category. These serve as templates and help qmd index the directories.

Create `groups/global/memory/README.md`:

```markdown
# Memory System

This directory contains the agent's persistent memory, indexed by qmd for semantic search.

## Structure

- **learnings/** — What was learned from past tasks. Each file = one learning.
- **library/** — Saved links/resources with descriptions. Searchable reference library.
- **procedures/** — Step-by-step procedures learned from experience.
- **facts/** — Known facts about the user, environment, preferences.
- **feedback/** — What worked and what didn't. Improvement tracking.

## How It Works

1. Before each agent invocation, the host searches this memory using qmd
2. Top relevant results are injected into the agent's prompt
3. The agent can also search memory during execution via MCP tools
4. After tasks, the agent stores new learnings automatically
```

---

## Step 2: Configure qmd Collections

Add the memory directories as qmd collections. Run these commands:

**For `shared` mode:**

```bash
# Add global memory as a collection
qmd --index <QMD_INDEX_NAME> add global-memory groups/global/memory "**/*.md"

# Add conversations as a collection (existing conversation archives)
qmd --index <QMD_INDEX_NAME> add conversations groups/*/conversations "**/*.md"
```

**For `hybrid` mode:**

```bash
# Add global memory
qmd --index <QMD_INDEX_NAME> add global-memory groups/global/memory "**/*.md"

# Add each group's memory
for folder in $(cat data/registered_groups.json | grep '"folder"' | sed 's/.*: "//;s/".*//' ); do
  qmd --index <QMD_INDEX_NAME> add "${folder}-memory" "groups/$folder/memory" "**/*.md"
done

# Add conversations
qmd --index <QMD_INDEX_NAME> add conversations groups/*/conversations "**/*.md"
```

**For `isolated` mode:**

```bash
# Each group gets its own collection only
for folder in $(cat data/registered_groups.json | grep '"folder"' | sed 's/.*: "//;s/".*//' ); do
  qmd --index <QMD_INDEX_NAME> add "${folder}-memory" "groups/$folder/memory" "**/*.md"
  qmd --index <QMD_INDEX_NAME> add "${folder}-conversations" "groups/$folder/conversations" "**/*.md"
done

# Global memory (accessible to all)
qmd --index <QMD_INDEX_NAME> add global-memory groups/global/memory "**/*.md"
```

Add context descriptions for better search results:

```bash
qmd --index <QMD_INDEX_NAME> context add global-memory "Shared knowledge, learnings, procedures, and facts that apply across all conversations"
qmd --index <QMD_INDEX_NAME> context add conversations "Archives of past conversations with the user"
```

Run initial indexing:

```bash
qmd --index <QMD_INDEX_NAME> update
```

Verify:

```bash
qmd --index <QMD_INDEX_NAME> status
```

---

## Step 3: Add Memory Config to `src/config.ts`

Read `src/config.ts` and add after the existing config constants:

```typescript
// --- qmd Memory System Configuration ---

/** Memory scope: 'shared' | 'isolated' | 'hybrid' */
export const MEMORY_SCOPE = '<USER_CHOICE>'; // Replace with user's choice

/** qmd index name */
export const QMD_INDEX_NAME = '<QMD_INDEX_NAME>'; // Replace with user's choice

/** qmd search mode: 'full' | 'lightweight' | 'text_only' */
export const QMD_MODE = '<QMD_MODE>'; // Replace with user's choice

/** Feature flags */
export const MEMORY_FEATURES = {
  autoEnrichment: <true/false>,    // Search memory before agent runs
  linkLibrary: <true/false>,       // Save shared URLs
  learningLoops: <true/false>,     // Store learnings after tasks
  procedureMemory: <true/false>,   // Save procedures
  feedback: <true/false>,          // Track feedback
};

/** Number of memory results to include in prompt enrichment */
export const MEMORY_ENRICHMENT_COUNT = 5;

/** Minimum relevance score (0-1) for memory results to be included */
export const MEMORY_MIN_SCORE = 0.3;

/** Path to qmd binary */
export const QMD_BINARY = process.env.QMD_PATH || 'qmd';

/** Maximum tokens of memory context to inject into prompt */
export const MEMORY_MAX_CONTEXT_TOKENS = 2000;
```

Replace the placeholder values with the user's actual choices from the Initial Questions.

---

## Step 4: Create Memory Manager Module (`src/memory-manager.ts`)

Create a new file `src/memory-manager.ts`:

```typescript
/**
 * Memory Manager for NanoClaw
 * Interfaces with qmd for semantic search over persistent memory.
 * Handles memory enrichment, storage, link library, and learning loops.
 */
import { execSync, exec } from 'child_process';
import fs from 'fs';
import path from 'path';

import {
  GROUPS_DIR,
  MEMORY_SCOPE,
  QMD_INDEX_NAME,
  QMD_MODE,
  QMD_BINARY,
  MEMORY_ENRICHMENT_COUNT,
  MEMORY_MIN_SCORE,
  MEMORY_MAX_CONTEXT_TOKENS,
  MEMORY_FEATURES,
} from './config.js';
import { logger } from './logger.js';

// --- Types ---

export interface MemorySearchResult {
  path: string;
  title: string;
  score: number;
  snippet: string;
  collection: string;
}

export interface MemoryEntry {
  category: 'learning' | 'library' | 'procedure' | 'fact' | 'feedback';
  title: string;
  content: string;
  tags?: string[];
  source?: string;       // Where this memory came from (group, task, etc.)
  relatedQuery?: string; // The original query/task that produced this memory
}

export interface LinkEntry {
  url: string;
  title: string;
  description: string;
  tags?: string[];
  savedBy?: string;       // Who shared the link
  savedFrom?: string;     // Which group/chat
}

// --- qmd Search ---

/**
 * Search memory using qmd. Returns relevant results based on query.
 * Uses the appropriate search mode based on QMD_MODE config.
 */
export function searchMemory(
  query: string,
  groupFolder?: string,
  maxResults: number = MEMORY_ENRICHMENT_COUNT,
  minScore: number = MEMORY_MIN_SCORE,
): MemorySearchResult[] {
  try {
    // Build qmd command based on mode
    let cmd: string;
    const indexArg = `--index ${QMD_INDEX_NAME}`;

    switch (QMD_MODE) {
      case 'full':
        cmd = `${QMD_BINARY} ${indexArg} query --json -n ${maxResults} --min-score ${minScore}`;
        break;
      case 'lightweight':
        cmd = `${QMD_BINARY} ${indexArg} vsearch --json -n ${maxResults} --min-score ${minScore}`;
        break;
      case 'text_only':
      default:
        cmd = `${QMD_BINARY} ${indexArg} search --json -n ${maxResults} --min-score ${minScore}`;
        break;
    }

    // Add collection filter based on scope
    if (MEMORY_SCOPE === 'isolated' && groupFolder) {
      cmd += ` -c ${groupFolder}-memory`;
    } else if (MEMORY_SCOPE === 'hybrid' && groupFolder) {
      // Search both group-specific and global — run two searches
      const groupResults = runQmdSearch(`${cmd} -c ${groupFolder}-memory`, query);
      const globalResults = runQmdSearch(`${cmd} -c global-memory`, query);

      // Merge and sort by score, deduplicate
      const merged = [...groupResults, ...globalResults]
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults);
      return merged;
    }
    // shared mode: search all collections (no -c flag)

    return runQmdSearch(cmd, query);
  } catch (err) {
    logger.error({ err, query }, 'Memory search failed');
    return [];
  }
}

function runQmdSearch(cmd: string, query: string): MemorySearchResult[] {
  try {
    // Escape query for shell
    const escapedQuery = query.replace(/'/g, "'\\''");
    const fullCmd = `${cmd} '${escapedQuery}'`;

    logger.debug({ cmd: fullCmd }, 'Running qmd search');

    const output = execSync(fullCmd, {
      encoding: 'utf-8',
      timeout: 15000,
      cwd: process.cwd(),
    });

    if (!output.trim()) return [];

    const results = JSON.parse(output);

    // qmd --json returns an array of result objects
    return (Array.isArray(results) ? results : results.results || []).map(
      (r: any) => ({
        path: r.path || r.docid || '',
        title: r.title || path.basename(r.path || ''),
        score: r.score || 0,
        snippet: r.snippet || r.content?.slice(0, 300) || '',
        collection: r.collection || '',
      }),
    );
  } catch (err: any) {
    // qmd exits with non-zero if no results — that's fine
    if (err.status === 1 && !err.stderr?.includes('Error')) {
      return [];
    }
    logger.debug({ err: err.message, cmd }, 'qmd search returned no results or error');
    return [];
  }
}

// --- Memory Enrichment ---

/**
 * Build a memory context block to prepend to the agent's prompt.
 * Searches memory for relevant past context based on the user's message.
 */
export function buildMemoryContext(
  userMessage: string,
  groupFolder: string,
): string | null {
  if (!MEMORY_FEATURES.autoEnrichment) return null;

  const results = searchMemory(userMessage, groupFolder);

  if (results.length === 0) return null;

  // Build context block
  const lines: string[] = [];
  lines.push('<memory_context>');
  lines.push(
    'The following are relevant memories from past interactions. Use these to inform your response:',
  );
  lines.push('');

  let totalChars = 0;
  const maxChars = MEMORY_MAX_CONTEXT_TOKENS * 4; // Rough char-to-token estimate

  for (const result of results) {
    const entry = formatMemoryResult(result);
    if (totalChars + entry.length > maxChars) break;

    lines.push(entry);
    lines.push('');
    totalChars += entry.length;
  }

  lines.push('</memory_context>');

  return lines.join('\n');
}

function formatMemoryResult(result: MemorySearchResult): string {
  const scorePercent = Math.round(result.score * 100);
  return [
    `### ${result.title} (${scorePercent}% relevance)`,
    `Source: ${result.path}`,
    `${result.snippet}`,
  ].join('\n');
}

// --- Memory Storage ---

/**
 * Store a new memory entry as a markdown file.
 * The file is created in the appropriate memory directory based on category and scope.
 */
export function storeMemory(
  entry: MemoryEntry,
  groupFolder: string,
): string {
  const baseDir = getMemoryDir(entry.category, groupFolder);
  fs.mkdirSync(baseDir, { recursive: true });

  // Generate filename from title
  const date = new Date().toISOString().split('T')[0];
  const slug = entry.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
  const filename = `${date}-${slug}.md`;
  const filepath = path.join(baseDir, filename);

  // Build markdown content
  const lines: string[] = [];
  lines.push(`# ${entry.title}`);
  lines.push('');
  if (entry.tags && entry.tags.length > 0) {
    lines.push(`Tags: ${entry.tags.join(', ')}`);
    lines.push('');
  }
  if (entry.source) {
    lines.push(`Source: ${entry.source}`);
  }
  if (entry.relatedQuery) {
    lines.push(`Related Query: ${entry.relatedQuery}`);
  }
  if (entry.source || entry.relatedQuery) {
    lines.push('');
  }
  lines.push(`Created: ${new Date().toISOString()}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push(entry.content);
  lines.push('');

  fs.writeFileSync(filepath, lines.join('\n'));

  logger.info(
    { category: entry.category, title: entry.title, path: filepath },
    'Memory stored',
  );

  // Trigger async reindex
  triggerReindex();

  return filepath;
}

/**
 * Save a link to the library.
 */
export function saveLink(
  link: LinkEntry,
  groupFolder: string,
): string {
  if (!MEMORY_FEATURES.linkLibrary) {
    logger.debug('Link library disabled, skipping');
    return '';
  }

  const baseDir = getMemoryDir('library', groupFolder);
  fs.mkdirSync(baseDir, { recursive: true });

  // Append to a monthly links file for organization
  const date = new Date();
  const monthFile = `links-${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}.md`;
  const filepath = path.join(baseDir, monthFile);

  // Build entry
  const entry = [
    '',
    `## ${link.title}`,
    '',
    `- **URL**: ${link.url}`,
    `- **Description**: ${link.description}`,
    link.tags && link.tags.length > 0 ? `- **Tags**: ${link.tags.join(', ')}` : '',
    link.savedBy ? `- **Saved by**: ${link.savedBy}` : '',
    link.savedFrom ? `- **From**: ${link.savedFrom}` : '',
    `- **Date**: ${date.toISOString()}`,
    '',
    '---',
  ]
    .filter(Boolean)
    .join('\n');

  // Create file with header if new, or append
  if (!fs.existsSync(filepath)) {
    const header = `# Link Library — ${date.toLocaleString('en-US', { month: 'long', year: 'numeric' })}\n\nSaved links and resources.\n`;
    fs.writeFileSync(filepath, header + entry + '\n');
  } else {
    fs.appendFileSync(filepath, entry + '\n');
  }

  logger.info({ url: link.url, title: link.title, path: filepath }, 'Link saved to library');

  // Trigger async reindex
  triggerReindex();

  return filepath;
}

/**
 * Store a learning from a completed task.
 */
export function storeLearning(
  title: string,
  whatWasLearned: string,
  originalTask: string,
  groupFolder: string,
  outcome: 'success' | 'partial' | 'failure' = 'success',
): string {
  if (!MEMORY_FEATURES.learningLoops) {
    return '';
  }

  const content = [
    `## Task`,
    `${originalTask}`,
    '',
    `## Outcome: ${outcome}`,
    '',
    `## What Was Learned`,
    `${whatWasLearned}`,
    '',
    `## Key Takeaways`,
    `- Apply these learnings when similar tasks arise`,
    `- This memory was auto-generated after task completion`,
  ].join('\n');

  return storeMemory(
    {
      category: 'learning',
      title,
      content,
      tags: ['auto-learning', outcome],
      source: `group:${groupFolder}`,
      relatedQuery: originalTask,
    },
    groupFolder,
  );
}

/**
 * Store a procedure (how-to) learned from experience.
 */
export function storeProcedure(
  title: string,
  steps: string,
  context: string,
  groupFolder: string,
): string {
  if (!MEMORY_FEATURES.procedureMemory) {
    return '';
  }

  const content = [
    `## Context`,
    `${context}`,
    '',
    `## Procedure`,
    `${steps}`,
    '',
    `## Notes`,
    `- This procedure was learned from experience`,
    `- Verified working as of ${new Date().toISOString().split('T')[0]}`,
  ].join('\n');

  return storeMemory(
    {
      category: 'procedure',
      title,
      content,
      tags: ['procedure', 'how-to'],
      source: `group:${groupFolder}`,
    },
    groupFolder,
  );
}

/**
 * Store feedback about a task outcome.
 */
export function storeFeedback(
  title: string,
  whatWorked: string,
  whatFailed: string,
  improvements: string,
  groupFolder: string,
): string {
  if (!MEMORY_FEATURES.feedback) {
    return '';
  }

  const content = [
    `## What Worked`,
    `${whatWorked}`,
    '',
    `## What Failed or Could Be Improved`,
    `${whatFailed}`,
    '',
    `## Suggested Improvements`,
    `${improvements}`,
  ].join('\n');

  return storeMemory(
    {
      category: 'feedback',
      title,
      content,
      tags: ['feedback', 'improvement'],
      source: `group:${groupFolder}`,
    },
    groupFolder,
  );
}

// --- Helpers ---

/**
 * Get the memory directory path for a given category and group.
 */
function getMemoryDir(
  category: MemoryEntry['category'] | 'library',
  groupFolder: string,
): string {
  const categoryDir =
    category === 'learning' ? 'learnings' :
    category === 'library' ? 'library' :
    category === 'procedure' ? 'procedures' :
    category === 'fact' ? 'facts' :
    'feedback';

  if (MEMORY_SCOPE === 'shared') {
    return path.join(GROUPS_DIR, 'global', 'memory', categoryDir);
  } else if (MEMORY_SCOPE === 'hybrid') {
    // Per-group for contextual memories, global for shared
    if (category === 'fact') {
      // Facts are always global (user preferences, environment info)
      return path.join(GROUPS_DIR, 'global', 'memory', categoryDir);
    }
    return path.join(GROUPS_DIR, groupFolder, 'memory', categoryDir);
  } else {
    // isolated: per-group
    return path.join(GROUPS_DIR, groupFolder, 'memory', categoryDir);
  }
}

/**
 * Trigger an async qmd reindex (non-blocking).
 */
let reindexTimeout: NodeJS.Timeout | null = null;

function triggerReindex(): void {
  // Debounce: wait 5 seconds after last write before reindexing
  if (reindexTimeout) clearTimeout(reindexTimeout);

  reindexTimeout = setTimeout(() => {
    exec(
      `${QMD_BINARY} --index ${QMD_INDEX_NAME} update`,
      { cwd: process.cwd(), timeout: 60000 },
      (err, _stdout, stderr) => {
        if (err) {
          logger.debug({ err: err.message, stderr }, 'qmd reindex failed (non-critical)');
        } else {
          logger.debug('qmd reindex completed');
        }
      },
    );
  }, 5000);
}

/**
 * Extract URLs from a message text.
 */
export function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`\[\]]+/g;
  return (text.match(urlRegex) || []).map((url) =>
    // Clean trailing punctuation
    url.replace(/[.,;:!?)]+$/, ''),
  );
}

/**
 * Full reindex of all memory collections.
 * Call this after initial setup or when collections change.
 */
export function fullReindex(): void {
  try {
    execSync(`${QMD_BINARY} --index ${QMD_INDEX_NAME} update`, {
      cwd: process.cwd(),
      timeout: 120000,
      encoding: 'utf-8',
    });
    logger.info('Full memory reindex completed');
  } catch (err) {
    logger.error({ err }, 'Full reindex failed');
  }
}

/**
 * Get memory status (collection counts, index health).
 */
export function getMemoryStatus(): string {
  try {
    return execSync(`${QMD_BINARY} --index ${QMD_INDEX_NAME} status`, {
      encoding: 'utf-8',
      timeout: 10000,
      cwd: process.cwd(),
    });
  } catch {
    return 'Memory system not initialized or qmd not available.';
  }
}
```

---

## Step 5: Create Memory IPC Tools (`src/memory-ipc.ts`)

Create a new file `src/memory-ipc.ts` that handles memory-related IPC messages from containers:

```typescript
/**
 * Memory IPC Handler
 * Processes memory operations requested by agents inside containers.
 * Memory IPC files are written to /workspace/ipc/memory/ by the container.
 */
import fs from 'fs';
import path from 'path';

import {
  storeMemory,
  saveLink,
  storeLearning,
  storeProcedure,
  storeFeedback,
  searchMemory,
} from './memory-manager.js';
import { logger } from './logger.js';

export interface MemoryIpcMessage {
  type:
    | 'store_memory'
    | 'search_memory'
    | 'save_link'
    | 'store_learning'
    | 'store_procedure'
    | 'store_feedback';
  groupFolder: string;
  timestamp: string;

  // For store_memory
  category?: 'learning' | 'library' | 'procedure' | 'fact' | 'feedback';
  title?: string;
  content?: string;
  tags?: string[];
  source?: string;
  relatedQuery?: string;

  // For save_link
  url?: string;
  description?: string;
  savedBy?: string;

  // For store_learning
  whatWasLearned?: string;
  originalTask?: string;
  outcome?: 'success' | 'partial' | 'failure';

  // For store_procedure
  steps?: string;
  context?: string;

  // For store_feedback
  whatWorked?: string;
  whatFailed?: string;
  improvements?: string;

  // For search_memory (response written back to IPC)
  query?: string;
  maxResults?: number;
}

/**
 * Process a memory IPC message from a container.
 */
export function processMemoryIpc(message: MemoryIpcMessage): void {
  logger.debug({ type: message.type, group: message.groupFolder }, 'Processing memory IPC');

  switch (message.type) {
    case 'store_memory':
      if (!message.category || !message.title || !message.content) {
        logger.error('store_memory requires category, title, and content');
        return;
      }
      storeMemory(
        {
          category: message.category,
          title: message.title,
          content: message.content,
          tags: message.tags,
          source: message.source,
          relatedQuery: message.relatedQuery,
        },
        message.groupFolder,
      );
      break;

    case 'save_link':
      if (!message.url || !message.title || !message.description) {
        logger.error('save_link requires url, title, and description');
        return;
      }
      saveLink(
        {
          url: message.url,
          title: message.title,
          description: message.description,
          tags: message.tags,
          savedBy: message.savedBy,
          savedFrom: `group:${message.groupFolder}`,
        },
        message.groupFolder,
      );
      break;

    case 'store_learning':
      if (!message.title || !message.whatWasLearned || !message.originalTask) {
        logger.error('store_learning requires title, whatWasLearned, and originalTask');
        return;
      }
      storeLearning(
        message.title,
        message.whatWasLearned,
        message.originalTask,
        message.groupFolder,
        message.outcome || 'success',
      );
      break;

    case 'store_procedure':
      if (!message.title || !message.steps) {
        logger.error('store_procedure requires title and steps');
        return;
      }
      storeProcedure(
        message.title,
        message.steps,
        message.context || '',
        message.groupFolder,
      );
      break;

    case 'store_feedback':
      if (!message.title) {
        logger.error('store_feedback requires title');
        return;
      }
      storeFeedback(
        message.title,
        message.whatWorked || '',
        message.whatFailed || '',
        message.improvements || '',
        message.groupFolder,
      );
      break;

    case 'search_memory':
      // Search results are written to an IPC response file
      if (!message.query) {
        logger.error('search_memory requires query');
        return;
      }
      const results = searchMemory(
        message.query,
        message.groupFolder,
        message.maxResults || 5,
      );
      // Write results to a response file the container can read
      writeMemorySearchResponse(message.groupFolder, message.query, results);
      break;

    default:
      logger.warn({ type: message.type }, 'Unknown memory IPC message type');
  }
}

function writeMemorySearchResponse(
  groupFolder: string,
  query: string,
  results: any[],
): void {
  // Write to the group's IPC directory so the container can read it
  const ipcDir = path.join('data', 'ipc', groupFolder);
  fs.mkdirSync(ipcDir, { recursive: true });

  const responseFile = path.join(ipcDir, 'memory_search_results.json');
  fs.writeFileSync(
    responseFile,
    JSON.stringify({ query, results, timestamp: new Date().toISOString() }, null, 2),
  );
}
```

---

## Step 6: Add Memory MCP Tools to Agent Runner

Read `container/agent-runner/src/ipc-mcp.ts` and add the following memory tools to the `tools` array inside `createIpcMcp`:

After the existing `register_group` tool, add:

```typescript
      // --- Memory System Tools ---

      tool(
        'search_memory',
        `Search the persistent memory system for relevant past context, learnings, procedures, links, or facts.
Use this proactively when:
- Starting a new task (check if you've done something similar before)
- Looking for saved links or resources
- Recalling procedures or how-tos
- Finding past learnings about a topic

The memory system uses semantic search — describe what you're looking for naturally.`,
        {
          query: z.string().describe('Natural language search query (e.g., "how to deploy to production", "links about React testing")'),
          max_results: z.number().optional().describe('Maximum results to return (default: 5)'),
        },
        async (args) => {
          // Write IPC file for host to process, then read response
          const data = {
            type: 'search_memory',
            query: args.query,
            maxResults: args.max_results || 5,
            groupFolder,
            timestamp: new Date().toISOString(),
          };

          writeIpcFile(path.join(IPC_DIR, 'memory'), data);

          // Wait for host to process and write response
          const responsePath = path.join(IPC_DIR, 'memory_search_results.json');
          let attempts = 0;
          while (attempts < 30) {
            await new Promise((r) => setTimeout(r, 500));
            if (fs.existsSync(responsePath)) {
              try {
                const response = JSON.parse(fs.readFileSync(responsePath, 'utf-8'));
                // Clean up response file
                fs.unlinkSync(responsePath);

                if (!response.results || response.results.length === 0) {
                  return {
                    content: [{ type: 'text', text: 'No relevant memories found.' }],
                  };
                }

                const formatted = response.results
                  .map(
                    (r: any, i: number) =>
                      `${i + 1}. **${r.title}** (${Math.round(r.score * 100)}% match)\n   ${r.snippet}\n   Source: ${r.path}`,
                  )
                  .join('\n\n');

                return {
                  content: [
                    {
                      type: 'text',
                      text: `Memory search results for "${args.query}":\n\n${formatted}`,
                    },
                  ],
                };
              } catch {
                // File not ready yet
              }
            }
            attempts++;
          }

          return {
            content: [
              {
                type: 'text',
                text: 'Memory search timed out. The memory system may not be running.',
              },
            ],
          };
        },
      ),

      tool(
        'store_memory',
        `Store a new memory for future reference. Use this to save:
- Learnings from completed tasks
- Facts about the user or their environment
- Procedures (how to do something step by step)
- Important context that should persist across sessions

The memory will be indexed and searchable in future interactions.`,
        {
          category: z
            .enum(['learning', 'fact', 'procedure', 'feedback'])
            .describe('Type of memory: learning=task insight, fact=known info, procedure=how-to steps, feedback=what worked/failed'),
          title: z.string().describe('Short descriptive title for the memory'),
          content: z.string().describe('The full memory content (markdown supported)'),
          tags: z.array(z.string()).optional().describe('Optional tags for categorization'),
          related_query: z.string().optional().describe('The original task/query this relates to'),
        },
        async (args) => {
          const data = {
            type: 'store_memory',
            category: args.category,
            title: args.title,
            content: args.content,
            tags: args.tags,
            relatedQuery: args.related_query,
            source: `group:${groupFolder}`,
            groupFolder,
            timestamp: new Date().toISOString(),
          };

          writeIpcFile(path.join(IPC_DIR, 'memory'), data);

          return {
            content: [
              {
                type: 'text',
                text: `Memory stored: "${args.title}" (${args.category}). It will be searchable in future interactions.`,
              },
            ],
          };
        },
      ),

      tool(
        'save_link',
        `Save a URL/link to the memory library for future reference. Use this whenever the user shares a link, mentions a useful resource, or you find something worth saving.

The link will be indexed and searchable in future interactions.`,
        {
          url: z.string().describe('The URL to save'),
          title: z.string().describe('Title/name of the resource'),
          description: z.string().describe('Brief description of what this link is about and why it is useful'),
          tags: z.array(z.string()).optional().describe('Optional tags (e.g., ["react", "testing", "tutorial"])'),
        },
        async (args) => {
          const data = {
            type: 'save_link',
            url: args.url,
            title: args.title,
            description: args.description,
            tags: args.tags,
            savedBy: 'agent',
            groupFolder,
            timestamp: new Date().toISOString(),
          };

          writeIpcFile(path.join(IPC_DIR, 'memory'), data);

          return {
            content: [
              {
                type: 'text',
                text: `Link saved to library: "${args.title}" (${args.url}). It will be searchable in future interactions.`,
              },
            ],
          };
        },
      ),

      tool(
        'store_learning',
        `Store what you learned from completing a task. Use this AFTER finishing any non-trivial task.

This creates a learning record that will be surfaced automatically when similar tasks come up in the future. This is how you get better over time.`,
        {
          title: z.string().describe('What was learned in a few words (e.g., "TypeScript strict mode requires explicit return types")'),
          what_was_learned: z.string().describe('Detailed description of the learning'),
          original_task: z.string().describe('The task that led to this learning'),
          outcome: z.enum(['success', 'partial', 'failure']).describe('How the task went'),
        },
        async (args) => {
          const data = {
            type: 'store_learning',
            title: args.title,
            whatWasLearned: args.what_was_learned,
            originalTask: args.original_task,
            outcome: args.outcome,
            groupFolder,
            timestamp: new Date().toISOString(),
          };

          writeIpcFile(path.join(IPC_DIR, 'memory'), data);

          return {
            content: [
              {
                type: 'text',
                text: `Learning recorded: "${args.title}". This will be recalled in future similar tasks.`,
              },
            ],
          };
        },
      ),
```

**IMPORTANT**: You also need to add the `memory` IPC directory constant and ensure the directory is created. At the top of `ipc-mcp.ts`, after the existing directory constants, add:

```typescript
const MEMORY_DIR = path.join(IPC_DIR, 'memory');
```

And ensure the directory is created in the `writeIpcFile` function (already handled by the `fs.mkdirSync` call).

---

## Step 7: Add Memory IPC Processing to Host

Read `src/index.ts` and find the IPC watcher function (`startIpcWatcher` or similar). Add memory IPC processing.

First, add imports at the top of `src/index.ts`:

```typescript
import {
  buildMemoryContext,
  searchMemory,
  extractUrls,
  saveLink,
  fullReindex,
} from './memory-manager.js';
import { processMemoryIpc, type MemoryIpcMessage } from './memory-ipc.js';
import { MEMORY_FEATURES } from './config.js';
```

Find where IPC files are processed (the function that reads from the IPC directories). Add a new section for memory IPC:

```typescript
    // Process memory IPC files
    const memoryDir = path.join(groupIpcDir, 'memory');
    if (fs.existsSync(memoryDir)) {
      const memoryFiles = fs.readdirSync(memoryDir)
        .filter(f => f.endsWith('.json') && !f.endsWith('.tmp'))
        .sort();

      for (const file of memoryFiles) {
        const filepath = path.join(memoryDir, file);
        try {
          const data: MemoryIpcMessage = JSON.parse(
            fs.readFileSync(filepath, 'utf-8'),
          );
          processMemoryIpc(data);
          fs.unlinkSync(filepath);
        } catch (err) {
          logger.error({ file, err }, 'Failed to process memory IPC file');
          fs.unlinkSync(filepath);
        }
      }
    }
```

---

## Step 8: Add Memory Enrichment to Agent Prompt

This is the critical integration point. Before the agent is spawned, search memory and inject context.

Find where the agent prompt is built before calling `runContainerAgent`. This is typically in the message processing function where the user's message is assembled into a prompt.

**In `src/index.ts`**, find the function that processes group messages (look for where `runContainerAgent` is called with the user's prompt). Before the agent call, add memory enrichment:

```typescript
    // --- Memory Enrichment ---
    // Search memory for relevant context before spawning the agent
    let enrichedPrompt = prompt;

    if (MEMORY_FEATURES.autoEnrichment) {
      try {
        const memoryContext = buildMemoryContext(prompt, group.folder);
        if (memoryContext) {
          enrichedPrompt = `${memoryContext}\n\n${prompt}`;
          logger.info(
            { group: group.name, memoryResults: memoryContext.split('###').length - 1 },
            'Memory context injected into prompt',
          );
        }
      } catch (err) {
        logger.debug({ err }, 'Memory enrichment failed (non-critical), proceeding without');
      }
    }

    // --- Auto Link Library ---
    // Extract and save any URLs from the user's message
    if (MEMORY_FEATURES.linkLibrary) {
      try {
        const urls = extractUrls(prompt);
        for (const url of urls) {
          saveLink(
            {
              url,
              title: url, // Will be updated with actual title if agent processes it
              description: `Shared in conversation. Original message: "${prompt.slice(0, 100)}..."`,
              tags: ['auto-saved'],
              savedBy: 'auto',
              savedFrom: `group:${group.folder}`,
            },
            group.folder,
          );
        }
      } catch (err) {
        logger.debug({ err }, 'Auto link extraction failed (non-critical)');
      }
    }
```

Then use `enrichedPrompt` instead of `prompt` when calling `runContainerAgent`.

---

## Step 9: Mount Memory IPC Directory in Container

Read `src/container-runner.ts` and find the `buildVolumeMounts` function. Add the memory IPC directory alongside the existing IPC mounts.

After the existing IPC directory mount (the `groupIpcDir` section), add:

```typescript
    // Memory IPC directory (for agent ↔ host memory communication)
    const memoryIpcDir = path.join(groupIpcDir, 'memory');
    fs.mkdirSync(memoryIpcDir, { recursive: true });
    // Memory IPC is already within the groupIpcDir mount, no additional mount needed
```

Also, for `hybrid` and `shared` memory modes, the global memory directory needs to be mounted read-only for non-main groups:

```typescript
    // Global memory directory (for memory search results)
    // This is already handled by the existing global mount for non-main groups
    // For main, it's accessible via /workspace/project/groups/global/memory
```

The existing mounts already cover this — the global directory is mounted at `/workspace/global` for non-main groups, and main has access to the whole project.

---

## Step 10: Update Agent Runner System Prompt for Memory

Read `container/agent-runner/src/index.ts` and find where the `globalClaudeMd` is loaded. After loading it, append memory system instructions:

```typescript
  // Append memory system instructions to global context
  const memoryInstructions = `

## Memory System

You have a persistent memory system powered by qmd. USE IT ACTIVELY.

### Before Starting Any Task
1. Check if relevant memories exist by using \`search_memory\` with a query about your task
2. Memory context may already be injected at the top of your prompt — read it carefully
3. Past learnings are highly valuable — they represent proven approaches

### During Task Execution
- Use \`search_memory\` whenever you need to recall past context
- Use \`save_link\` whenever a URL is shared or you find a useful resource
- Use \`store_memory\` to save important facts or context as you discover them

### After Completing a Task
- Use \`store_learning\` to record what you learned (ALWAYS do this for non-trivial tasks)
- Include: what worked, what didn't, key insights, and the approach that succeeded
- This is how you improve over time — your future self will thank you

### Memory Categories
- **learning**: Insights from completed tasks (auto-surfaced for similar future tasks)
- **fact**: Known information (user preferences, environment details, project context)
- **procedure**: Step-by-step how-to guides (surfaces when similar tasks arise)
- **feedback**: What worked/failed (helps choose better approaches)

### Link Library
- Any URL shared in messages is auto-saved to the library
- Use \`save_link\` to save additional resources with descriptions
- Use \`search_memory\` with relevant terms to find saved links

### Important
- Always check memory FIRST before starting any complex task
- Store learnings AFTER completing any non-trivial task
- Be specific in memory titles and content — vague memories are useless
- Include enough context that your future self can understand without additional info
`;

  if (globalClaudeMd) {
    globalClaudeMd += memoryInstructions;
  } else {
    globalClaudeMd = memoryInstructions;
  }
```

---

## Step 11: Update Group CLAUDE.md Files

Append the following to `groups/global/CLAUDE.md`:

```markdown

## Memory System (qmd)

You have persistent memory powered by qmd semantic search. Your memories persist across sessions.

### Memory Tools Available
- `mcp__nanoclaw__search_memory` — Search past learnings, procedures, facts, links
- `mcp__nanoclaw__store_memory` — Save new memories (learning, fact, procedure, feedback)
- `mcp__nanoclaw__save_link` — Save a URL to the link library
- `mcp__nanoclaw__store_learning` — Record what you learned from a task

### Memory-First Workflow
1. **Before any task**: Check if relevant memories exist (they may already be in your prompt context)
2. **During execution**: Search memory when you need past context or saved resources
3. **After completion**: Store what you learned for future reference

### Auto-Enrichment
Before you start, the system automatically searches memory for context related to the user's message. If relevant memories are found, they appear at the top of your prompt inside `<memory_context>` tags. READ THEM — they contain valuable past insights.

### Link Library
URLs shared in messages are auto-saved. Use `search_memory` to find them later. When you encounter useful resources, save them with `save_link` including a good description.

### Memory Files
Memory is stored as markdown files in:
- `memory/learnings/` — Task insights and learnings
- `memory/library/` — Saved links and resources
- `memory/procedures/` — Step-by-step guides
- `memory/facts/` — Known facts and preferences
- `memory/feedback/` — What worked and what didn't

You can also read/write these files directly with Read/Write tools.
```

Also append a similar but shorter version to `groups/main/CLAUDE.md`:

```markdown

## Memory System (qmd)

You have persistent, searchable memory across all sessions.

### Key Memory Tools
- `search_memory` — Find past learnings, procedures, links, facts
- `store_memory` — Save new memories
- `save_link` — Save a URL to library
- `store_learning` — Record task learnings (do this after every non-trivial task!)

### Workflow
1. Memory context is auto-injected into your prompt (look for `<memory_context>` tags)
2. Use `search_memory` proactively when working on tasks
3. Always `store_learning` after completing significant work
4. URLs shared in messages are auto-saved to the link library

### Memory from Main Channel
As the main channel, you can store memories that apply globally. Use the `fact` category for user preferences and environment details that all groups should know.
```

---

## Step 12: Create Initial Seed Memories

Create a few seed memory files to bootstrap the system:

Create `groups/global/memory/facts/system-info.md`:

```markdown
# System Information

Tags: system, environment, setup

Created: <CURRENT_DATE>

---

## NanoClaw Setup

- Platform: NanoClaw personal assistant
- Memory System: qmd (semantic search over markdown files)
- Memory Scope: <MEMORY_SCOPE>
- Search Mode: <QMD_MODE>

## Memory Guidelines

- Learnings are the most valuable memory type — they capture what was tried and what worked
- Procedures should include exact commands and steps, not vague descriptions
- Facts should be objective and verifiable
- Links should always include a description of why they're useful
- Feedback entries help the system learn from mistakes
```

Create `groups/global/memory/procedures/how-to-use-memory.md`:

```markdown
# How to Use the Memory System

Tags: memory, procedure, getting-started

Created: <CURRENT_DATE>

---

## Searching Memory

1. Use `search_memory` MCP tool with a natural language query
2. Or run `qmd --index <QMD_INDEX_NAME> query "your search"` from bash
3. Memory context is auto-injected before each agent run

## Storing New Memories

1. **After completing a task**: Use `store_learning` with title, what was learned, and outcome
2. **When finding useful info**: Use `store_memory` with category=fact
3. **When figuring out a process**: Use `store_memory` with category=procedure
4. **When someone shares a link**: Use `save_link` with URL, title, and description

## Memory Best Practices

- Be specific in titles — "TypeScript strict mode fix" not "Fixed a bug"
- Include the original context/query — "When user asked to deploy X, I learned Y"
- For procedures, include exact commands that worked
- For learnings, include what was tried that DIDN'T work too
- Tag memories for easier categorization
```

Replace `<CURRENT_DATE>`, `<MEMORY_SCOPE>`, `<QMD_MODE>`, and `<QMD_INDEX_NAME>` with actual values.

---

## Step 13: Add Scheduled Memory Maintenance Task

After setup is complete, suggest creating a scheduled task for memory maintenance:

Tell the user:

> I can set up an automatic memory maintenance task that runs daily to:
> - Re-index all memory files with qmd
> - Clean up orphaned entries
> - Summarize recent learnings
>
> Want me to set this up? (Recommended)

If yes, create the scheduled task via the agent's `schedule_task` tool:

```json
{
  "prompt": "Run memory system maintenance: 1) Execute 'qmd --index <QMD_INDEX_NAME> update' to re-index all memory files. 2) Run 'qmd --index <QMD_INDEX_NAME> cleanup' to remove orphaned data. 3) Check memory/learnings/ for any files older than 30 days that could be consolidated into summary documents. 4) Report memory status via send_message.",
  "schedule_type": "cron",
  "schedule_value": "0 3 * * *",
  "context_mode": "isolated"
}
```

---

## Step 14: Rebuild and Test

### Build

```bash
npm run build
```

If the agent-runner was modified:

```bash
cd container && ./build.sh && cd ..
```

### Run Initial Index

```bash
qmd --index <QMD_INDEX_NAME> update
qmd --index <QMD_INDEX_NAME> status
```

### Restart Service

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
# Or on Linux:
# sudo systemctl restart nanoclaw
# Or for development:
# npm run dev
```

### Verify Memory System

Test by sending these messages:

1. **Test memory search**:
   ```
   @Andy search your memory for "how to use memory system"
   ```

2. **Test link saving**:
   ```
   @Andy save this link: https://github.com/tobi/qmd — it's the search engine powering our memory
   ```

3. **Test learning storage**:
   ```
   @Andy remember that when installing npm packages, we always use --save-exact to pin versions
   ```

4. **Test memory enrichment** (send a message that should trigger memory recall):
   ```
   @Andy how do I use the memory system?
   ```
   The agent should receive auto-injected memory context about the memory system from the seed files.

### Check Logs

```bash
tail -f logs/nanoclaw.log | grep -i memory
```

Look for:
- `Memory context injected into prompt` — enrichment is working
- `Memory stored` — storage is working
- `qmd reindex completed` — indexing is working

### Verify qmd Index

```bash
qmd --index <QMD_INDEX_NAME> status
qmd --index <QMD_INDEX_NAME> search "memory system"
```

---

## Troubleshooting

### qmd command not found

```bash
# Check if qmd is in PATH
which qmd || echo "Not in PATH"

# If installed to ~/.qmd-tool:
ls -la ~/.qmd-tool/qmd

# Add to PATH:
export PATH="$HOME/.qmd-tool:$PATH"

# Or set QMD_PATH in .env:
echo "QMD_PATH=$HOME/.qmd-tool/qmd" >> .env
```

### Memory search returns no results

```bash
# Check if index has documents
qmd --index <QMD_INDEX_NAME> status

# Force reindex
qmd --index <QMD_INDEX_NAME> update

# Check collections
qmd --index <QMD_INDEX_NAME> status
```

### Slow search (vector mode)

The first search will be slow as models are loaded. Subsequent searches are fast due to caching. If consistently slow:

```bash
# Check model status
ls -la ~/.cache/qmd/

# Try text-only mode for faster searches
# Update QMD_MODE to 'text_only' in src/config.ts
```

### Memory IPC not being processed

```bash
# Check for stuck IPC files
ls -la data/ipc/*/memory/

# Check IPC watcher logs
grep -i "ipc" logs/nanoclaw.log | tail -20
```

### Container can't write memory IPC

Verify the memory IPC directory is within the mounted IPC directory:

```bash
# Should be within the group's IPC mount
ls -la data/ipc/<group-folder>/memory/
```

### qmd reindex fails

```bash
# Run manually to see errors
qmd --index <QMD_INDEX_NAME> update 2>&1

# Check if collections point to valid directories
qmd --index <QMD_INDEX_NAME> status
```

---

## Removing the Memory System

To remove the qmd memory system:

1. Remove from `src/index.ts`:
   - Delete memory imports (`buildMemoryContext`, `searchMemory`, etc.)
   - Remove memory enrichment block from message processing
   - Remove auto link extraction block
   - Remove memory IPC processing from IPC watcher

2. Delete new files:
   - `src/memory-manager.ts`
   - `src/memory-ipc.ts`

3. Remove from `src/config.ts`:
   - Delete all `MEMORY_*` and `QMD_*` constants

4. Remove from `container/agent-runner/src/ipc-mcp.ts`:
   - Delete `search_memory`, `store_memory`, `save_link`, `store_learning` tools
   - Delete `MEMORY_DIR` constant

5. Remove from agent runner `container/agent-runner/src/index.ts`:
   - Delete memory system instructions added to `globalClaudeMd`

6. Remove memory sections from:
   - `groups/global/CLAUDE.md`
   - `groups/main/CLAUDE.md`

7. Clean up:
   ```bash
   # Remove memory directories (CAUTION: deletes all memories!)
   rm -rf groups/*/memory/

   # Remove qmd index
   rm -rf ~/.cache/qmd/index-<QMD_INDEX_NAME>.sqlite

   # Optionally uninstall qmd
   rm -rf ~/.qmd-tool
   sudo rm -f /usr/local/bin/qmd
   ```

8. Cancel the memory maintenance scheduled task if created.

9. Rebuild:
   ```bash
   npm run build
   cd container && ./build.sh && cd ..
   launchctl kickstart -k gui/$(id -u)/com.nanoclaw
   ```
