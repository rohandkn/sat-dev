# SAT Math AI Tutor - Developer Guide

## Project Overview
AI-powered SAT Math tutoring app. GPT-4o generates all content (questions, lessons, remediation). Core loop: Pre-Exam → Lesson → Post-Exam → Remediation → Progression. MVP scope: Algebra category (5 topics).

## Tech Stack
- **Framework**: Next.js 16 (App Router, TypeScript, Turbopack)
- **UI**: shadcn/ui + Tailwind CSS v4
- **LLM**: OpenAI GPT-4o (structured output + streaming)
- **Database/Auth**: Supabase (Postgres + Auth + RLS)
- **Math Rendering**: KaTeX (inline `$...$`, display `$$...$$`)
- **Node**: v20 via nvm (`export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"` required before any npm/node commands)

## Commands
- `npm run dev` — Start dev server
- `npm run build` — Production build
- `node ./node_modules/typescript/bin/tsc --noEmit` — Type check (npx tsc has symlink issues)

## Project Structure
```
src/
├── app/
│   ├── (auth)/login, signup, callback     # Auth pages (client components)
│   ├── (app)/                             # Authenticated routes (server layout)
│   │   ├── dashboard/                     # Topic grid + progress
│   │   └── topics/[topicSlug]/            # Topic overview (server component)
│   │       ├── pre-exam/                  # Diagnostic exam (client)
│   │       ├── lesson/                    # Streamed lesson (client)
│   │       ├── post-exam/                 # Assessment (client)
│   │       └── review/                    # Results + remediation chat (client)
│   └── api/
│       ├── exam/generate, submit          # Question generation + grading
│       ├── lesson/generate                # Streaming lesson (initial + remediation)
│       ├── remediation/start, respond     # Socratic follow-up loop
│       ├── student-model/update           # LLM updates student profile
│       └── progress/                      # Dashboard data
├── components/
│   ├── ui/           # shadcn components (17 components)
│   ├── math/         # KatexRenderer, MarkdownRenderer
│   ├── exam/         # QuestionCard, ExamProgress, ExamResults
│   ├── lesson/       # LessonViewer
│   ├── remediation/  # RemediationChat
│   ├── dashboard/    # TopicGrid, ProgressRing
│   └── layout/       # Sidebar, Topbar
├── lib/
│   ├── supabase/     # client.ts, server.ts, admin.ts, middleware.ts
│   ├── openai/
│   │   ├── client.ts, streaming.ts, schemas.ts
│   │   └── prompts/  # exam.ts, lesson.ts, remediation.ts, student-model.ts
│   └── learning-loop/
│       ├── state-machine.ts  # 17-state FSM
│       ├── scoring.ts        # Thresholds (80% pass, max 3 remediation loops)
│       └── progression.ts    # Topic unlock logic
├── hooks/            # use-exam.ts, use-lesson.ts, use-remediation.ts
└── types/            # database.ts (Supabase types, kept for reference but not used as generic)
```

## Database
- **Schema**: `supabase/migrations/001_initial_schema.sql` (10 tables, RLS on all user-scoped tables)
- **Seed**: `supabase/seed.sql` (4 categories, 5 Algebra topics)
- **Tables**: profiles, categories, topics, student_models, learning_sessions, exam_questions, remediation_threads, remediation_messages, lessons, user_topic_progress

## Key Architecture Decisions

### Supabase Client Typing
The Supabase clients (`client.ts`, `server.ts`, `admin.ts`) do NOT use the `Database` generic. Supabase JS v2.95+ with `@supabase/ssr` v0.8+ changed the type system so the old-style Database generics produce `never` types on insert/update operations. The clients are untyped but work correctly at runtime. The `types/database.ts` file is kept for reference.

### OpenAI Structured Output
JSON schemas for OpenAI's `response_format` are defined manually in `schemas.ts` (not derived from Zod). Zod v4 changed internal class names (`ZodObject` → different internals), making runtime introspection-based converters (`zodToJsonSchema`) unreliable. Three manual schemas: `examGenerationJsonSchema`, `studentModelUpdateJsonSchema`, `remediationResponseJsonSchema`.

### Learning Loop State Machine
17 states from `pre_exam_pending` → `session_passed`/`session_failed`. Key transitions:
- Post-exam ≥80% → session_passed
- Post-exam <80% → remediation_active → Socratic chat → remediation_lesson → remediation_exam
- Max 3 remediation loops before session_failed

### Streaming
Lesson generation and remediation start use raw `ReadableStream` responses (not SSE). The client reads with `res.body.getReader()`. A `TransformStream` in the API route collects the full content and saves to DB on flush.

### Student Model
Freeform text arrays (strengths, weaknesses, misconceptions) + mastery_level (0-100). Updated by LLM after each exam via `/api/student-model/update`. Called from client side after exam submission (fire-and-forget).

## Gotchas
- **nvm required**: Node is installed via nvm. Always source nvm before running commands.
- **`npx tsc` broken**: Symlink issue in node_modules/.bin. Use `node ./node_modules/typescript/bin/tsc` instead.
- **Next.js 16 middleware warning**: Shows "middleware is deprecated, use proxy" — this is a Next.js 16 change but middleware still works.
- **Build requires valid Supabase URL**: `.env.local` must have a valid HTTPS URL for `NEXT_PUBLIC_SUPABASE_URL` or static page generation fails.
- **Zod v4**: Installed via shadcn. Class names differ from v3. Don't use `instanceof z.ZodObject` etc. for runtime checks.
- **`create-next-app` in existing dir**: Fails if `.claude/` or other files exist. Create in temp dir and copy.
- **`create-next-app` React Compiler prompt**: Use `--no-react-compiler` flag to avoid interactive prompt.
