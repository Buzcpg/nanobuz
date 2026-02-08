---
name: add-github
description: Add GitHub integration to NanoClaw. Agents can create issues, comment on PRs, check CI status, and manage repositories using the gh CLI. Guides through GitHub token setup and container configuration. Triggers on "github", "add github", "add-github".
---

# Add GitHub Integration

This skill gives NanoClaw agents the ability to interact with GitHub repositories. Agents can create issues, comment on PRs, check CI status, browse code, and manage repositories — all from WhatsApp (or any other configured channel).

Uses the official `gh` CLI which is already installed in the container base image (it comes with Claude Code).

**UX Note:** When asking the user questions, prefer using the `AskUserQuestion` tool instead of just outputting text.

## Initial Questions

Ask the user:

> What kind of GitHub access do you need?
>
> **Option 1: Read + Write (recommended)**
> - Create and comment on issues/PRs
> - Check CI status, manage releases
> - Browse code and repo info
>
> **Option 2: Read only**
> - Browse issues, PRs, CI status
> - View repo info and code
> - No write operations

Store their choice. Then ask:

> Do you want the agent to be able to **clone and push** to repositories?
>
> This requires mounting your git config into the container (read-only).
> Only enable this if you trust the agent with your git credentials.

Store their choice and proceed.

---

## Prerequisites

**USER ACTION REQUIRED**

**Use the AskUserQuestion tool** to present this:

> You'll need a GitHub Personal Access Token (classic) for the agent to use.
>
> 1. Go to https://github.com/settings/tokens
> 2. Click **Generate new token (classic)**
> 3. Give it a name (e.g., "NanoClaw")
> 4. Select scopes:
>    - `repo` — Full repository access
>    - `read:org` — Read org membership (optional, for org repos)
>    - `workflow` — Manage GitHub Actions (optional)
> 5. Click **Generate token** and copy it
>
> Paste the token here.

Wait for user to confirm and provide the token.

When the user provides the token, add it to `.env`:

```bash
# Append to .env (don't overwrite existing content)
echo "GITHUB_TOKEN=<token_from_user>" >> .env
```

Verify:

```bash
TOKEN=$(grep "^GITHUB_TOKEN=" .env | cut -d= -f2)
[ -n "$TOKEN" ] && echo "Token configured: ${TOKEN:0:10}..." || echo "Missing"
```

---

## Implementation

### Step 1: Add GitHub Token to Container Environment

Read `src/container-runner.ts`. Find the `allowedVars` array in the `buildVolumeMounts` function (around line 137):

```typescript
// Find:
const allowedVars = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'];

// Replace with:
const allowedVars = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN'];
```

This ensures the `GITHUB_TOKEN` env var is passed through to the container. The `gh` CLI respects the `GITHUB_TOKEN` environment variable natively — no additional auth configuration is needed.

### Step 2: Add GitHub Config (Optional)

Read `src/config.ts` and add these lines after the existing config constants:

```typescript
// GitHub configuration
export const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
export const GITHUB_ENABLED = !!GITHUB_TOKEN;
```

This isn't strictly required (the token is passed directly to the container via env), but it's useful for logging startup status and for future host-side GitHub integrations.

### Step 3: Verify Bash Tool Is Available

Read `container/agent-runner/src/index.ts` and verify that `Bash` is in the `allowedTools` array. The `gh` CLI is invoked via Bash, so this tool must be available.

The `Bash` tool should already be allowed. Confirm it's present:

```typescript
allowedTools: [
  'Bash',  // This enables gh CLI usage
  ...other tools...
],
```

If `Bash` is missing (unlikely), add it.

### Step 4: Verify gh CLI in Container

The `gh` CLI should already be available in the container because Claude Code includes it. Verify by checking:

```bash
# Test if gh is available in the container image
container run --rm nanoclaw-agent:latest which gh
```

If `gh` is NOT found, add it to `container/Dockerfile`. Find the `apt-get install` block and add `gh`:

```dockerfile
# Add GitHub CLI repository
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*
```

If the Dockerfile needed modification, rebuild the container:

```bash
cd container && ./build.sh && cd ..
```

### Step 5: Configure gh CLI Authentication in Container

The container's entrypoint script (in the Dockerfile) already sources env from `/workspace/env-dir/env`:

```bash
[ -f /workspace/env-dir/env ] && export $(cat /workspace/env-dir/env | xargs)
```

Since `GITHUB_TOKEN` is in the `allowedVars` array, it gets written to the env file and exported in the container. The `gh` CLI automatically uses `GITHUB_TOKEN` for authentication — no additional setup needed.

### Step 6: Update Group Memory

Append to `groups/global/CLAUDE.md`:

```markdown

## GitHub

You have access to the `gh` CLI for GitHub operations. Use it via the Bash tool.

**Common commands:**
- `gh issue list -R owner/repo` — List issues
- `gh issue create -R owner/repo --title "..." --body "..."` — Create an issue
- `gh issue comment 123 -R owner/repo --body "..."` — Comment on an issue
- `gh pr list -R owner/repo` — List PRs
- `gh pr view 123 -R owner/repo` — View PR details
- `gh pr checks 123 -R owner/repo` — Check CI status
- `gh pr review 123 -R owner/repo --approve` — Approve a PR
- `gh api repos/owner/repo/pulls/123/comments` — View PR comments via API
- `gh release list -R owner/repo` — List releases
- `gh repo view owner/repo` — View repo info
- `gh search repos "query"` — Search repositories

**Tips:**
- Always use `-R owner/repo` to specify which repository
- Use `--json` flag for structured output: `gh issue list -R owner/repo --json number,title,state`
- For bulk operations, combine with `jq`: `gh issue list -R owner/repo --json number,title | jq '.[] | .number'`
- Use `gh api` for any GitHub REST API endpoint not covered by built-in commands
```

Also append the same section to `groups/main/CLAUDE.md`.

### Step 7: Rebuild and Restart

Rebuild the container (only needed if Dockerfile was modified):

```bash
cd container && ./build.sh && cd ..
```

Compile TypeScript:

```bash
npm run build
```

Restart:

```bash
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
# Or if running manually:
# npm run dev
```

### Step 8: Test

Tell the user:

> GitHub integration is ready! Test it by sending:
>
> `@Andy list the open issues on owner/repo`
>
> Or:
>
> `@Andy what's the status of PR #123 on owner/repo?`
>
> Replace `owner/repo` with a real repository you have access to.

Monitor logs:

```bash
tail -f logs/nanoclaw.log
```

---

## Advanced: Mount Git Config for Push Access

If the user opted in during Initial Questions, mount git configuration for clone/push operations.

Read `src/container-runner.ts` and find the `buildVolumeMounts` function. After the existing mount entries, add:

```typescript
// Git config for authenticated operations (mounted read-only for security)
const gitConfigPath = path.join(homeDir, '.gitconfig');
if (fs.existsSync(gitConfigPath)) {
  mounts.push({
    hostPath: gitConfigPath,
    containerPath: '/home/node/.gitconfig',
    readonly: true,
  });
}
```

**Security note:** This gives the container read access to your git config. The mount is read-only, so the agent cannot modify your git configuration.

Rebuild:

```bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

---

## Advanced: GitHub Webhook Integration (Optional)

For users who want NanoClaw to respond to GitHub events (new issues, PR comments, CI failures), a webhook approach can be added. This goes beyond basic `gh` CLI access.

Tell the user:

> Would you like NanoClaw to react to GitHub events automatically?
>
> For example:
> - Notify you when a PR gets comments
> - Auto-triage new issues
> - Alert on CI failures
>
> This requires setting up a webhook endpoint. Skip this if you only need manual `gh` CLI access.

If they want webhooks, this would require:

1. A publicly accessible endpoint (use ngrok, Cloudflare Tunnel, or a VPS)
2. A webhook handler in `src/index.ts` (new Express/Fastify route)
3. GitHub webhook configuration in the repository settings

This is a more advanced setup. For most users, the `gh` CLI approach in the basic implementation is sufficient. Webhook integration could be a separate skill (`/add-github-webhooks`).

---

## Troubleshooting

### "gh: command not found"

The `gh` CLI should be available in the container via Claude Code. If not:

1. Check if it's in the container:
   ```bash
   container run --rm nanoclaw-agent:latest which gh
   ```
2. If missing, add to Dockerfile (see Step 4 above) and rebuild:
   ```bash
   cd container && ./build.sh && cd ..
   ```

### "authentication required" or "gh auth login" prompt

- Verify `GITHUB_TOKEN` is in `.env`:
  ```bash
  grep GITHUB_TOKEN .env
  ```
- Verify it's in the `allowedVars` array in `src/container-runner.ts`
- Rebuild and restart:
  ```bash
  npm run build
  launchctl kickstart -k gui/$(id -u)/com.nanoclaw
  ```
- Test the token directly:
  ```bash
  GITHUB_TOKEN=<your_token> gh auth status
  ```

### "Resource not accessible by integration"

- The token may not have the required scope
- Regenerate with correct scopes (at minimum: `repo`)
- For org repos, also add `read:org`

### Agent can't find gh command but it's installed

- Check the container's PATH includes the `gh` binary location
- In the container, run: `echo $PATH` and `ls -la $(which gh)`
- Ensure the entrypoint script exports environment variables before running the agent

### Rate limiting

- GitHub API has rate limits (5000 requests/hour for authenticated users)
- If hitting limits, the `gh` CLI will show an error
- Use `gh api rate_limit` to check current limits
- For heavy usage, consider a GitHub App token instead of PAT

---

## Removing GitHub Integration

1. Remove `GITHUB_TOKEN` from `.env`:
   ```bash
   # Remove the GITHUB_TOKEN line from .env
   ```

2. Remove `'GITHUB_TOKEN'` from the `allowedVars` array in `src/container-runner.ts`:
   ```typescript
   // Revert to:
   const allowedVars = ['CLAUDE_CODE_OAUTH_TOKEN', 'ANTHROPIC_API_KEY'];
   ```

3. Remove GitHub config from `src/config.ts` (if added):
   - Delete `GITHUB_TOKEN`, `GITHUB_ENABLED` constants

4. Remove "GitHub" sections from `groups/global/CLAUDE.md` and `groups/main/CLAUDE.md`

5. Remove git config mount from `src/container-runner.ts` (if added)

6. Rebuild:
   ```bash
   npm run build
   launchctl kickstart -k gui/$(id -u)/com.nanoclaw
   ```
