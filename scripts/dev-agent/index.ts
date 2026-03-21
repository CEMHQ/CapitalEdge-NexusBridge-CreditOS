#!/usr/bin/env node
/**
 * NexusBridge CreditOS — Development Agent
 *
 * A Claude Opus 4.6 powered agent with full platform context and code-aware
 * tools. Runs an agentic loop until the task is complete. Saves session history
 * so you can continue work across invocations.
 *
 * Usage:
 *   node --import tsx/esm index.ts "build the admin accreditation review modal"
 *   node --import tsx/esm index.ts --continue "add expiry validation"
 *   node --import tsx/esm index.ts --session <id> "continue this session"
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  readFileSync, writeFileSync, existsSync, mkdirSync,
  readdirSync, statSync,
} from 'fs'
import { execSync } from 'child_process'
import { resolve, join, relative, dirname } from 'path'
import { createInterface } from 'readline'
import { randomUUID } from 'crypto'

// ── Config ────────────────────────────────────────────────────────────────────

const REPO_ROOT = resolve(import.meta.dirname, '../..')

// Auto-load ANTHROPIC_API_KEY from apps/portal/.env.local if not already set
if (!process.env.ANTHROPIC_API_KEY) {
  const envFile = join(REPO_ROOT, 'apps/portal/.env.local')
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
      const match = line.match(/^ANTHROPIC_API_KEY\s*=\s*(.+)$/)
      if (match) {
        process.env.ANTHROPIC_API_KEY = match[1].trim().replace(/^["']|["']$/g, '')
        break
      }
    }
  }
}
const PORTAL_ROOT = join(REPO_ROOT, 'apps/portal')
const SESSIONS_DIR = join(import.meta.dirname, '.sessions')
const MODEL = 'claude-opus-4-6'
const MAX_TOKENS = 16000
const MAX_TURNS = 40

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
let continueMode = false
let sessionId: string | null = null
let taskArg: string | null = null

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--continue' || args[i] === '-c') {
    continueMode = true
  } else if ((args[i] === '--session' || args[i] === '-s') && args[i + 1]) {
    sessionId = args[++i]
  } else if (!args[i].startsWith('-')) {
    taskArg = args[i]
  }
}

// ── Session storage ───────────────────────────────────────────────────────────

interface Session {
  id: string
  createdAt: string
  updatedAt: string
  task: string
  messages: Anthropic.MessageParam[]
  turns: number
}

function ensureSessionsDir() {
  if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true })
}

function loadSession(id: string): Session | null {
  const path = join(SESSIONS_DIR, `${id}.json`)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf-8'))
}

function saveSession(session: Session) {
  ensureSessionsDir()
  session.updatedAt = new Date().toISOString()
  writeFileSync(
    join(SESSIONS_DIR, `${session.id}.json`),
    JSON.stringify(session, null, 2),
  )
}

function listSessions(): Session[] {
  ensureSessionsDir()
  return readdirSync(SESSIONS_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(readFileSync(join(SESSIONS_DIR, f), 'utf-8')) as Session)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

function latestSession(): Session | null {
  const sessions = listSessions()
  return sessions[0] ?? null
}

// ── Platform context loader ───────────────────────────────────────────────────

function loadContext(): string {
  const sections: string[] = []

  // Load CLAUDE.md
  const claudeMd = join(REPO_ROOT, 'CLAUDE.md')
  if (existsSync(claudeMd)) {
    sections.push(`## CLAUDE.md (Project Instructions)\n\n${readFileSync(claudeMd, 'utf-8')}`)
  }

  // Load recent git log for context
  try {
    const log = execSync('git log --oneline -15', { cwd: REPO_ROOT }).toString().trim()
    sections.push(`## Recent Git History\n\`\`\`\n${log}\n\`\`\``)
  } catch { /* ignore */ }

  // Load current git status
  try {
    const status = execSync('git status --short', { cwd: REPO_ROOT }).toString().trim()
    if (status) {
      sections.push(`## Current Git Status (uncommitted changes)\n\`\`\`\n${status}\n\`\`\``)
    }
  } catch { /* ignore */ }

  // Load key implementation docs if they exist
  const keyDocs = [
    'docs/implementation plan/Phase4_Implementation_Plan.md',
    'docs/04_Developer_Guide.md',
  ]
  for (const docPath of keyDocs) {
    const full = join(REPO_ROOT, docPath)
    if (existsSync(full)) {
      const content = readFileSync(full, 'utf-8')
      // Truncate large docs
      const truncated = content.length > 8000 ? content.slice(0, 8000) + '\n\n[...truncated]' : content
      sections.push(`## ${docPath}\n\n${truncated}`)
    }
  }

  return sections.join('\n\n---\n\n')
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const tools: Anthropic.Tool[] = [
  {
    name: 'read_file',
    description: 'Read the contents of a file. Path can be absolute or relative to the repo root.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (absolute or relative to repo root)' },
        offset: { type: 'number', description: 'Line number to start reading from (1-indexed, optional)' },
        limit: { type: 'number', description: 'Number of lines to read (optional)' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file, creating it if it does not exist.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (absolute or relative to repo root)' },
        content: { type: 'string', description: 'Full content to write' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'edit_file',
    description: 'Replace an exact string in a file with new content. The old_string must be unique in the file. Use this for targeted edits instead of rewriting the whole file.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path (absolute or relative to repo root)' },
        old_string: { type: 'string', description: 'Exact text to find and replace (must be unique in file)' },
        new_string: { type: 'string', description: 'Replacement text' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences instead of just the first (default false)' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
  },
  {
    name: 'list_directory',
    description: 'List files and directories at a given path.',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory path (absolute or relative to repo root)' },
        recursive: { type: 'boolean', description: 'List recursively (default false). Use with caution on large directories.' },
      },
      required: ['path'],
    },
  },
  {
    name: 'search_code',
    description: 'Search for a regex pattern in files (like ripgrep). Returns file paths and matching lines.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'Directory or file to search in (default: apps/portal/src)' },
        file_glob: { type: 'string', description: 'Glob to filter files, e.g. "*.tsx" or "*.ts"' },
        case_insensitive: { type: 'boolean', description: 'Case-insensitive search (default false)' },
        context_lines: { type: 'number', description: 'Lines of context around matches (default 2)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'glob_files',
    description: 'Find files matching a glob pattern.',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern, e.g. "apps/portal/src/**/*.tsx"' },
        path: { type: 'string', description: 'Base directory (default: repo root)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'run_command',
    description: 'Run a shell command. Use this to run lint, build, git commands, npm install, etc. Commands run in the repo root by default.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Shell command to execute' },
        cwd: { type: 'string', description: 'Working directory (absolute or relative to repo root). Default: repo root.' },
        timeout_ms: { type: 'number', description: 'Timeout in milliseconds (default 60000)' },
      },
      required: ['command'],
    },
  },
]

// ── Tool executor ─────────────────────────────────────────────────────────────

function resolvePath(p: string): string {
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return p
  return join(REPO_ROOT, p)
}

function execTool(name: string, input: Record<string, unknown>): string {
  try {
    switch (name) {

      case 'read_file': {
        const filePath = resolvePath(input.path as string)
        if (!existsSync(filePath)) return `Error: File not found: ${filePath}`
        const lines = readFileSync(filePath, 'utf-8').split('\n')
        const offset = (input.offset as number ?? 1) - 1
        const limit = input.limit as number ?? lines.length
        const slice = lines.slice(offset, offset + limit)
        const numbered = slice.map((l, i) => `${String(offset + i + 1).padStart(6)} → ${l}`).join('\n')
        return `${filePath} (lines ${offset + 1}–${offset + slice.length} of ${lines.length}):\n${numbered}`
      }

      case 'write_file': {
        const filePath = resolvePath(input.path as string)
        const dir = dirname(filePath)
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
        writeFileSync(filePath, input.content as string, 'utf-8')
        const relPath = relative(REPO_ROOT, filePath)
        return `Written: ${relPath} (${(input.content as string).split('\n').length} lines)`
      }

      case 'edit_file': {
        const filePath = resolvePath(input.path as string)
        if (!existsSync(filePath)) return `Error: File not found: ${filePath}`
        const old = input.old_string as string
        const next = input.new_string as string
        const replaceAll = (input.replace_all as boolean) ?? false
        let content = readFileSync(filePath, 'utf-8')
        const count = (content.match(new RegExp(old.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length
        if (count === 0) return `Error: old_string not found in ${input.path}`
        if (count > 1 && !replaceAll) return `Error: old_string matches ${count} locations; set replace_all=true or make the string more unique`
        content = replaceAll ? content.split(old).join(next) : content.replace(old, next)
        writeFileSync(filePath, content, 'utf-8')
        return `Edited: ${input.path} (replaced ${replaceAll ? count : 1} occurrence${replaceAll && count > 1 ? 's' : ''})`
      }

      case 'list_directory': {
        const dirPath = resolvePath(input.path as string)
        if (!existsSync(dirPath)) return `Error: Directory not found: ${dirPath}`
        const recursive = (input.recursive as boolean) ?? false
        function listDir(p: string, indent = ''): string {
          const entries = readdirSync(p).filter(e => !['node_modules', '.next', '.git', 'dist'].includes(e))
          return entries.map(entry => {
            const full = join(p, entry)
            const isDir = statSync(full).isDirectory()
            const line = `${indent}${isDir ? '📁' : '📄'} ${entry}`
            if (recursive && isDir) return `${line}\n${listDir(full, indent + '  ')}`
            return line
          }).join('\n')
        }
        return listDir(dirPath)
      }

      case 'search_code': {
        const searchPath = resolvePath((input.path as string) ?? 'apps/portal/src')
        const pattern = input.pattern as string
        const glob = input.file_glob ? `--glob "*.${(input.file_glob as string).replace(/^\*\./, '')}"` : ''
        const ci = (input.case_insensitive as boolean) ? '-i' : ''
        const ctx = input.context_lines as number ?? 2
        try {
          const result = execSync(
            `npx --yes ripgrep@latest ${ci} -C ${ctx} ${glob} "${pattern.replace(/"/g, '\\"')}" "${searchPath}"`,
            { cwd: REPO_ROOT, maxBuffer: 1024 * 512 },
          ).toString().trim()
          return result || 'No matches found'
        } catch (e: unknown) {
          const err = e as { stdout?: Buffer; status?: number }
          if (err.status === 1) return 'No matches found'
          return (err.stdout?.toString() ?? '') || `Search error: ${String(e)}`
        }
      }

      case 'glob_files': {
        const basePath = resolvePath((input.path as string) ?? '.')
        const pattern = input.pattern as string
        try {
          const result = execSync(
            `npx --yes glob-cli@latest "${pattern}"`,
            { cwd: basePath, maxBuffer: 1024 * 256 },
          ).toString().trim()
          return result || 'No files matched'
        } catch {
          // Fallback: use find
          try {
            const result = execSync(
              `find . -path "./${pattern.replace(/\*\*/g, '*')}" -not -path "*/node_modules/*" -not -path "*/.next/*"`,
              { cwd: basePath, maxBuffer: 1024 * 256 },
            ).toString().trim()
            return result || 'No files matched'
          } catch (e2) {
            return `Glob error: ${String(e2)}`
          }
        }
      }

      case 'run_command': {
        const cwd = input.cwd ? resolvePath(input.cwd as string) : REPO_ROOT
        const timeout = (input.timeout_ms as number) ?? 60000
        try {
          const result = execSync(input.command as string, {
            cwd,
            timeout,
            maxBuffer: 1024 * 1024,
            stdio: ['pipe', 'pipe', 'pipe'],
          })
          return result.toString().trim() || '(no output)'
        } catch (e: unknown) {
          const err = e as { stdout?: Buffer; stderr?: Buffer; status?: number }
          const out = [err.stdout?.toString(), err.stderr?.toString()].filter(Boolean).join('\n').trim()
          return `Exit code ${err.status ?? 1}:\n${out || String(e)}`
        }
      }

      default:
        return `Unknown tool: ${name}`
    }
  } catch (e) {
    return `Tool error (${name}): ${String(e)}`
  }
}

// ── System prompt ─────────────────────────────────────────────────────────────

function buildSystemPrompt(context: string): string {
  return `You are the NexusBridge CreditOS Development Agent — a senior full-stack engineer with deep knowledge of this platform. You help build, extend, and maintain the NexusBridge CreditOS codebase.

## Your Role
You are autonomous and action-oriented. When given a task:
1. Explore the relevant code to understand current state
2. Plan the implementation (check CLAUDE.md rules, existing patterns)
3. Implement changes file by file, verifying each step
4. Run lint and/or build to confirm correctness
5. Report what you did and any remaining steps

## Critical Rules (from CLAUDE.md)
- All API routes: validateBody → applyRateLimit → getUser → getUserRole → DB → emitAuditEvent
- Role checks use getUserRole() — never user_metadata?.role
- SUPABASE_SERVICE_ROLE_KEY only in server-only files (import 'server-only')
- Zod schemas in src/lib/validation/schemas.ts
- Rate limiters in src/lib/rate-limit/index.ts (reuse, don't create ad-hoc)
- Audit events via emitAuditEvent() from src/lib/audit/emit.ts
- Notifications via emitNotification() from src/lib/notifications/emit.ts
- Admin client via createAdminClient() from src/lib/supabase/admin.ts
- No backslash-escaped whitespace in .md files
- Tables need: id (UUID), created_at, updated_at, created_by
- Financial records are append-only

## Tech Stack
- Next.js 16 App Router, TypeScript, Tailwind CSS, shadcn/ui
- Supabase (PostgreSQL + Auth + Storage + Realtime)
- Drizzle ORM, Upstash Redis, Resend, BoldSign, n8n, Anthropic Claude API

## Portal Structure
All application code is in apps/portal/src/:
- app/(protected)/dashboard/{admin,borrower,investor,underwriter,servicing}/
- app/api/ — API routes
- components/ — Shared React components
- lib/ — Utilities (supabase, auth, rate-limit, validation, audit, notifications, email)
- db/migrations/ — SQL migrations
- db/schema/ — Drizzle schema files

## Current Phase
Phase 4 in progress. Completed: workflow automation (step 1), e-signatures/BoldSign (step 2), 506(c) compliance hardening (step 4). Pending: OCR/document intelligence (step 3), KYC/AML provider integration (Persona, OFAC), admin accreditation review modal.

---

## Platform Context

${context}
`
}

// ── Interactive prompt ────────────────────────────────────────────────────────

async function promptUser(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close()
      resolve(answer.trim())
    })
  })
}

// ── Pretty print ──────────────────────────────────────────────────────────────

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const CYAN = '\x1b[36m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const BLUE = '\x1b[34m'
const MAGENTA = '\x1b[35m'
const RED = '\x1b[31m'

function banner(text: string, color = CYAN) {
  console.log(`\n${color}${BOLD}${'─'.repeat(60)}${RESET}`)
  console.log(`${color}${BOLD}  ${text}${RESET}`)
  console.log(`${color}${BOLD}${'─'.repeat(60)}${RESET}\n`)
}

function toolBanner(name: string, input: Record<string, unknown>) {
  const preview = Object.entries(input)
    .map(([k, v]) => `${k}=${String(v).slice(0, 60)}`)
    .join(', ')
  console.log(`\n${YELLOW}${BOLD}⚙  ${name}${RESET}${DIM}(${preview})${RESET}`)
}

// ── Main agent loop ───────────────────────────────────────────────────────────

async function run() {
  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
  })

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(`${RED}Error: ANTHROPIC_API_KEY not set.${RESET}`)
    console.error(`Add it to apps/portal/.env.local or set it in your environment.`)
    process.exit(1)
  }

  // ── Resolve task and session ──────────────────────────────────────────────

  let session: Session | null = null

  if (sessionId) {
    session = loadSession(sessionId)
    if (!session) {
      console.error(`${RED}Session not found: ${sessionId}${RESET}`)
      process.exit(1)
    }
    banner(`Resuming session ${session.id.slice(0, 8)}…`, BLUE)
    console.log(`${DIM}Original task: ${session.task}${RESET}\n`)
  } else if (continueMode) {
    session = latestSession()
    if (!session) {
      console.error(`${RED}No sessions found to continue.${RESET}`)
      process.exit(1)
    }
    banner(`Continuing latest session ${session.id.slice(0, 8)}…`, BLUE)
    console.log(`${DIM}Original task: ${session.task}${RESET}\n`)
  }

  let task = taskArg
  if (!task && session) {
    task = await promptUser(`${CYAN}Add a follow-up instruction (or press Enter to continue same task): ${RESET}`)
    if (!task) task = `Continue the previous task: ${session.task}`
  }
  if (!task) {
    task = await promptUser(`${CYAN}What should I build? ${RESET}`)
  }
  if (!task) {
    console.error(`${RED}No task provided.${RESET}`)
    process.exit(1)
  }

  // ── Load context ──────────────────────────────────────────────────────────

  console.log(`${DIM}Loading platform context…${RESET}`)
  const context = loadContext()
  const systemPrompt = buildSystemPrompt(context)

  // ── Initialize or restore session ─────────────────────────────────────────

  if (!session) {
    session = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      task,
      messages: [],
      turns: 0,
    }
  }

  // Add new user message
  if (session.messages.length === 0 || taskArg || continueMode) {
    session.messages.push({ role: 'user', content: task })
  }

  banner(`NexusBridge Dev Agent  •  Session ${session.id.slice(0, 8)}`, CYAN)
  console.log(`${BOLD}Task:${RESET} ${task}\n`)
  console.log(`${DIM}Model: ${MODEL}  |  Max turns: ${MAX_TURNS}${RESET}\n`)

  // ── Agentic loop ──────────────────────────────────────────────────────────

  let turns = 0

  while (turns < MAX_TURNS) {
    turns++
    session.turns++
    console.log(`${DIM}Turn ${turns}…${RESET}`)

    // Stream the response
    let fullText = ''
    let stopReason: string | null = null
    const contentBlocks: Anthropic.ContentBlock[] = []

    try {
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        thinking: { type: 'adaptive' },
        system: systemPrompt,
        tools,
        messages: session.messages,
      })

      let inThinkingBlock = false
      let inTextBlock = false
      let thinkingText = ''

      stream.on('content_block_start', (event) => {
        if (event.content_block.type === 'thinking') {
          inThinkingBlock = true
          process.stdout.write(`${DIM}[thinking…]${RESET} `)
        } else if (event.content_block.type === 'text') {
          inTextBlock = true
          if (inThinkingBlock) {
            inThinkingBlock = false
            if (thinkingText) process.stdout.write('\n')
          }
          process.stdout.write(`${GREEN}`)
        } else if (event.content_block.type === 'tool_use') {
          if (inThinkingBlock || inTextBlock) process.stdout.write('\n')
          inThinkingBlock = false
          inTextBlock = false
        }
      })

      stream.on('content_block_delta', (event) => {
        if (event.delta.type === 'thinking_delta') {
          thinkingText += event.delta.thinking
          process.stdout.write(`${DIM}.${RESET}`)
        } else if (event.delta.type === 'text_delta') {
          fullText += event.delta.text
          process.stdout.write(event.delta.text)
        }
      })

      stream.on('content_block_stop', () => {
        if (inTextBlock) {
          process.stdout.write(`${RESET}`)
          inTextBlock = false
        }
      })

      const finalMessage = await stream.finalMessage()
      stopReason = finalMessage.stop_reason
      contentBlocks.push(...finalMessage.content)

      if (fullText && !fullText.endsWith('\n')) process.stdout.write('\n')

    } catch (e) {
      console.error(`\n${RED}API error: ${String(e)}${RESET}`)
      saveSession(session)
      break
    }

    // Append assistant response to history
    session.messages.push({ role: 'assistant', content: contentBlocks })

    // ── Handle tool calls ─────────────────────────────────────────────────

    if (stopReason === 'tool_use') {
      const toolUseBlocks = contentBlocks.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
      )

      const toolResults: Anthropic.ToolResultBlockParam[] = []

      for (const toolCall of toolUseBlocks) {
        toolBanner(toolCall.name, toolCall.input as Record<string, unknown>)
        const result = execTool(toolCall.name, toolCall.input as Record<string, unknown>)

        // Truncate very long tool results to avoid blowing context
        const MAX_RESULT_CHARS = 12000
        const truncated = result.length > MAX_RESULT_CHARS
          ? result.slice(0, MAX_RESULT_CHARS) + `\n\n[...truncated ${result.length - MAX_RESULT_CHARS} chars]`
          : result

        const preview = truncated.split('\n').slice(0, 6).join('\n')
        console.log(`${DIM}${preview}${truncated.split('\n').length > 6 ? '\n  …' : ''}${RESET}\n`)

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolCall.id,
          content: truncated,
        })
      }

      session.messages.push({ role: 'user', content: toolResults })
      saveSession(session)
      continue
    }

    // ── Done ──────────────────────────────────────────────────────────────

    saveSession(session)

    if (stopReason === 'end_turn') {
      banner('Task complete', GREEN)
      console.log(`${DIM}Session saved: ${session.id}${RESET}`)
      console.log(`${DIM}To continue: node --import tsx/esm index.ts --session ${session.id} "next instruction"${RESET}\n`)
      break
    }

    if (stopReason === 'max_tokens') {
      console.log(`\n${YELLOW}Max tokens reached. Run --continue to keep going.${RESET}`)
      break
    }

    console.log(`\n${MAGENTA}Stop reason: ${stopReason}${RESET}`)
    break
  }

  if (turns >= MAX_TURNS) {
    console.log(`\n${YELLOW}Max turns (${MAX_TURNS}) reached. Run --continue to keep going.${RESET}`)
  }
}

run().catch(e => {
  console.error(e)
  process.exit(1)
})
