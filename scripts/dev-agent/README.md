# NexusBridge CreditOS — Development Agent

A Claude Opus 4.6 powered development agent with adaptive thinking, full
platform context, and code-aware tools. Give it a task and it reads, edits,
creates files, and runs commands autonomously until the work is done.

## Setup

```bash
cd scripts/dev-agent
npm install
```

Set your API key in `apps/portal/.env.local` (already there as `ANTHROPIC_API_KEY=`)
or export it in your shell:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

### Start a new task

```bash
node --import tsx/esm index.ts "build the admin accreditation review modal"
```

### Continue the most recent session

```bash
node --import tsx/esm index.ts --continue "also add expiry date validation"
```

### Resume a specific session

```bash
node --import tsx/esm index.ts --session <session-id> "next step"
```

### Interactive mode (no task argument)

```bash
node --import tsx/esm index.ts
# Prompts you for a task
```

## What it knows

The agent loads on startup:
- Full `CLAUDE.md` project instructions
- Recent git log (last 15 commits)
- Current git status (uncommitted changes)
- Phase 4 implementation plan
- Developer guide

## Tools available

| Tool | What it does |
|---|---|
| `read_file` | Read any file with optional offset/limit |
| `write_file` | Create or overwrite a file |
| `edit_file` | Targeted string replacement within a file |
| `list_directory` | List files, optionally recursive |
| `search_code` | Ripgrep search across the codebase |
| `glob_files` | Find files by pattern |
| `run_command` | Run any shell command (lint, build, git, etc.) |

## Sessions

Each run creates a session saved in `.sessions/`. Sessions preserve the full
conversation history so you can continue across multiple invocations without
losing context. Session files are gitignored.

## Examples

```bash
# Build a feature
node --import tsx/esm index.ts "build the admin accreditation review modal with approve/reject form"

# Fix a bug
node --import tsx/esm index.ts "the investor compliance page shows NaN for days until expiry, fix it"

# Apply migration
node --import tsx/esm index.ts "apply migration 0017 to supabase and verify the tables exist"

# Run the full phase
node --import tsx/esm index.ts "complete phase 4 step 3: OCR document intelligence with Ocrolus integration"

# Architecture question
node --import tsx/esm index.ts "explain how the signature webhook works end to end"
```
