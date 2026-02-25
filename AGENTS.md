# SAT Math AI Tutor - Developer Guide

## 1. Project Overview

AI-powered SAT Math tutoring application. GPT-4o generates all content: diagnostic questions, adaptive lessons, Socratic remediation, and student profiling. MVP scope: Algebra category (5 topics with prerequisite chains).

**Core Learning Loop:** Pre-Exam → Lesson → Post-Exam → (if <80%) Remediation → (up to 3 loops) → Pass/Fail

**Runtime Request Flow:**
1. Client page mounts → custom hook (`useExam`, `useLesson`, `useRemediation`) triggers API call
2. API route validates auth via Supabase server client (cookie-based session)
3. Route checks learning session state via FSM (`canTransition()`)
4. For LLM calls: builds prompt from student model + context → calls GPT-4o (streaming or structured JSON)
5. Response saved to Supabase → state machine transitions → response returned to client
6. Client hook updates React state → component re-renders

### Tech Stack
- **Framework**: Next.js 16 (App Router, TypeScript, Turbopack)
- **UI**: shadcn/ui (New York style, 17 components) + Tailwind CSS v4
- **LLM**: OpenAI GPT-4o (structured output via JSON schema + raw streaming)
- **Database/Auth**: Supabase (Postgres + Auth + RLS on all user-scoped tables)
- **Math Rendering**: KaTeX via remark-math + rehype-katex (inline `$...$`, display `$$...$$`)
- **Testing**: Vitest + jsdom + React Testing Library
- **Node**: v20 via nvm

---

## 2. Directory Structure

```
src/
├── app/                          # Next.js App Router (pages + API routes)
│   ├── page.tsx                  # Root redirect: auth → /dashboard, unauth → /login
│   ├── layout.tsx                # Root layout (Geist fonts, metadata, Toaster)
│   ├── (auth)/                   # Public auth pages (client components)
│   │   ├── login/page.tsx        # Email/password login form
│   │   ├── signup/page.tsx       # Registration form
│   │   └── callback/route.ts     # OAuth callback handler
│   ├── (app)/                    # Authenticated routes (server layout with sidebar + topbar)
│   │   ├── layout.tsx            # Auth guard, profile fetch, sidebar/topbar shell
│   │   ├── dashboard/page.tsx    # Topic grid, progress fetch, categories cached (1hr revalidate)
│   │   └── topics/[topicSlug]/   # Dynamic topic routes
│   │       ├── page.tsx          # Topic overview (server component)
│   │       ├── topic-overview.tsx # Topic UI with session start + navigation
│   │       ├── pre-exam/page.tsx # Diagnostic exam (client, examType='pre')
│   │       ├── lesson/page.tsx   # Streamed lesson content (client)
│   │       ├── post-exam/page.tsx# Assessment exam (client, examType='post')
│   │       └── review/page.tsx   # Results display + Socratic remediation chat
│   └── api/                      # Server-side API routes (all auth-protected)
│       ├── exam/
│       │   ├── generate/route.ts # POST: generate questions via GPT-4o structured output
│       │   └── submit/route.ts   # POST: grade answers, transition state, unlock topics
│       ├── lesson/
│       │   └── generate/route.ts # POST: stream lesson markdown from GPT-4o
│       ├── remediation/
│       │   ├── start/route.ts    # POST: create thread, stream initial Socratic hint
│       │   └── respond/route.ts  # POST: continue Socratic chat (JSON response)
│       ├── session/
│       │   └── start/route.ts    # POST: create learning session, init progress
│       ├── student-model/
│       │   └── update/route.ts   # POST: LLM analyzes exam results → update profile
│       ├── progress/
│       │   └── route.ts          # GET: fetch user topic progress for dashboard
│       └── videos/
│           └── search/route.ts   # GET: YouTube Data API v3 search (optional)
├── components/
│   ├── ui/                       # shadcn/ui library (17 components: Button, Card, Dialog, etc.)
│   ├── math/
│   │   ├── katex-renderer.tsx    # KatexRenderer, KatexBlock: LaTeX → HTML with preprocessing
│   │   └── markdown-renderer.tsx # MarkdownRenderer: markdown + LaTeX via remark-math/rehype-katex
│   ├── exam/
│   │   ├── exam-page.tsx         # Exam wrapper: manages load/answer/submit lifecycle
│   │   ├── question-card.tsx     # Single question: text, 4 choices, "I don't know" option
│   │   ├── exam-progress.tsx     # Progress bar (current/total)
│   │   └── exam-results.tsx      # Post-exam score, correct/incorrect breakdown, explanations
│   ├── lesson/
│   │   ├── lesson-viewer.tsx     # Renders streamed markdown + math content
│   │   └── video-section.tsx     # Embedded YouTube videos
│   ├── remediation/
│   │   └── remediation-chat.tsx  # Socratic Q&A chat interface with streaming
│   ├── dashboard/
│   │   ├── topic-grid.tsx        # Topic cards: status (locked/available/in_progress/completed)
│   │   └── progress-ring.tsx     # Circular SVG progress indicator
│   └── layout/
│       ├── sidebar.tsx           # Navigation sidebar with topic links
│       └── topbar.tsx            # Display name, sign out button
├── lib/
│   ├── utils.ts                  # cn() — clsx + tailwind-merge class merger
│   ├── supabase/
│   │   ├── client.ts             # Browser Supabase client (anon key, @supabase/ssr)
│   │   ├── server.ts             # Server Supabase client (cookie-based, @supabase/ssr)
│   │   ├── admin.ts              # Admin Supabase client (service role key)
│   │   └── middleware.ts         # updateSession(): auth check, session refresh, redirects
│   ├── openai/
│   │   ├── client.ts             # getOpenAIClient(): lazy-initialized singleton
│   │   ├── streaming.ts          # streamChatCompletion(), jsonChatCompletion<T>(),
│   │   │                         #   fixCorruptedLatex(), sanitizeLatexStrings<T>()
│   │   ├── schemas.ts            # Zod schemas + manual JSON schemas for OpenAI structured output
│   │   └── prompts/
│   │       ├── exam.ts           # buildExamPrompt(): question generation with student context
│   │       ├── lesson.ts         # buildLessonPrompt(): lesson with wrong-question targeting
│   │       ├── remediation.ts    # buildRemediationStartPrompt(), buildRemediationRespondPrompt()
│   │       └── student-model.ts  # buildStudentModelUpdatePrompt(): exam → profile analysis
│   └── learning-loop/
│       ├── state-machine.ts      # SESSION_STATES (17), canTransition(), getNextState()
│       ├── scoring.ts            # calculateScore(), isPassing() (≥80%), gradeAnswer()
│       └── progression.ts        # initializeUserProgress(), unlockNextTopic()
├── hooks/
│   ├── use-exam.ts               # generateExam, selectAnswer, selectIdk, submitExam, navigation
│   ├── use-lesson.ts             # generateLesson: streaming via getReader() + RAF throttling
│   └── use-remediation.ts        # startThread (streaming), sendMessage (JSON), reset
├── types/
│   └── database.ts               # Supabase Database type (reference only, not used as generic)
├── test/
│   └── setup.ts                  # Vitest setup: testing-library matchers, jsdom
└── middleware.ts                  # Next.js middleware: auth redirects via updateSession()
```

---

## 3. File-by-File Summary

### Core Library Files

| File | Category | Purpose | Key Exports | Dependencies | Dependents |
|------|----------|---------|-------------|--------------|------------|
| `lib/utils.ts` | Utility | Tailwind class merging | `cn()` | clsx, tailwind-merge | All components |
| `lib/supabase/client.ts` | Infrastructure | Browser DB client | `createClient()` | @supabase/ssr | Client components, hooks |
| `lib/supabase/server.ts` | Infrastructure | Server DB client | `createClient()` | @supabase/ssr, next/headers | API routes, server components |
| `lib/supabase/admin.ts` | Infrastructure | Admin DB client (bypasses RLS) | `createAdminClient()` | @supabase/supabase-js | API routes needing full access |
| `lib/supabase/middleware.ts` | Infrastructure | Auth session management | `updateSession()` | @supabase/ssr, next/server | src/middleware.ts |
| `lib/openai/client.ts` | Infrastructure | OpenAI API singleton | `getOpenAIClient()` | openai | streaming.ts |
| `lib/openai/streaming.ts` | Core Logic | LLM call wrappers | `streamChatCompletion()`, `jsonChatCompletion<T>()`, `fixCorruptedLatex()`, `sanitizeLatexStrings<T>()` | openai/client | All API routes using LLM |
| `lib/openai/schemas.ts` | Configuration | Zod + JSON schemas for structured output | `examQuestionSchema`, `examGenerationJsonSchema`, `studentModelUpdateJsonSchema`, `remediationResponseJsonSchema` | zod | API routes: exam/generate, remediation/respond, student-model/update |
| `lib/openai/prompts/exam.ts` | Core Logic | Exam prompt builder | `buildExamPrompt()` | None | api/exam/generate |
| `lib/openai/prompts/lesson.ts` | Core Logic | Lesson prompt builder | `buildLessonPrompt()` | None | api/lesson/generate |
| `lib/openai/prompts/remediation.ts` | Core Logic | Remediation prompt builders | `buildRemediationStartPrompt()`, `buildRemediationRespondPrompt()` | None | api/remediation/start, api/remediation/respond |
| `lib/openai/prompts/student-model.ts` | Core Logic | Student profile prompt builder | `buildStudentModelUpdatePrompt()` | None | api/student-model/update |
| `lib/learning-loop/state-machine.ts` | Core Logic | 17-state FSM | `SESSION_STATES`, `canTransition()`, `getNextState()`, `getStateLabel()` | None | API routes (exam/submit, lesson/generate, session/start) |
| `lib/learning-loop/scoring.ts` | Core Logic | Exam grading | `calculateScore()`, `isPassing()`, `getWrongQuestions()`, `gradeAnswer()`, `PASSING_SCORE`, `MAX_REMEDIATION_LOOPS`, `QUESTIONS_PER_EXAM` | None | api/exam/submit |
| `lib/learning-loop/progression.ts` | Core Logic | Topic unlock logic | `initializeUserProgress()`, `unlockNextTopic()` | supabase/admin | api/session/start, api/exam/submit |

### Hooks

| File | Category | Purpose | Key State | Key Methods |
|------|----------|---------|-----------|-------------|
| `hooks/use-exam.ts` | UI Logic | Exam lifecycle management | questions, currentIndex, answers (Map), results, loading, submitting | generateExam, selectAnswer, selectIdk, submitExam, goToNext, goToPrev, goToQuestion |
| `hooks/use-lesson.ts` | UI Logic | Lesson streaming | content, loading, streaming, complete | generateLesson (uses getReader() + requestAnimationFrame throttling at 60fps) |
| `hooks/use-remediation.ts` | UI Logic | Socratic chat management | messages, threadId, loading, streaming, isResolved | startThread (streaming), sendMessage (JSON), reset |

### API Routes

| Route | Method | Request | Response | LLM Call |
|-------|--------|---------|----------|----------|
| `/api/session/start` | POST | `{ topicId, topicSlug }` | `{ sessionId, topicSlug }` | None |
| `/api/exam/generate` | POST | `{ sessionId, examType }` | `{ questions[] }` | GPT-4o structured output (examGenerationJsonSchema) |
| `/api/exam/submit` | POST | `{ sessionId, examType, answers[] }` | `{ score, results[], nextState, hasWrongAnswers }` | None |
| `/api/lesson/generate` | POST | `{ sessionId, lessonType }` | Streamed markdown | GPT-4o streaming |
| `/api/remediation/start` | POST | `{ questionId, sessionId }` | Streamed text + `X-Thread-Id` header | GPT-4o streaming |
| `/api/remediation/respond` | POST | `{ threadId, message }` | `{ message, isResolved }` | GPT-4o structured output (remediationResponseJsonSchema) |
| `/api/student-model/update` | POST | `{ sessionId, examType }` | `{ update }` | GPT-4o structured output (studentModelUpdateJsonSchema) |
| `/api/progress` | GET | None | `{ progress[] }` | None |
| `/api/videos/search` | GET | `?q=topic` | `{ videos[] }` | None (YouTube Data API v3) |

---

## 4. Data Flow

### Learning Session Lifecycle
```
User clicks "Start" on topic
  → POST /api/session/start
    → initializeUserProgress() for all topics in category (idempotent)
    → Creates learning_sessions record (state: 'pre_exam_pending')
    → Ensures student_models record exists
    → Updates user_topic_progress to 'in_progress', increments attempts
    → Returns sessionId

Pre-Exam
  → POST /api/exam/generate { sessionId, examType: 'pre' }
    → Validates session ownership + state
    → Fetches student_models (strengths/weaknesses)
    → Fetches prior wrong exam_questions
    → buildExamPrompt() → GPT-4o structured output → 5 questions
    → Inserts into exam_questions, transitions state to 'pre_exam_active'
  → POST /api/exam/submit { sessionId, examType: 'pre', answers[] }
    → gradeAnswer() for each, calculateScore()
    → Updates exam_questions with user answers
    → getNextState(): 100% → session_passed (skip lesson), <100% → lesson_pending
    → If passed: unlockNextTopic(), update user_topic_progress to 'completed'
  → POST /api/student-model/update (fire-and-forget from client)

Lesson
  → POST /api/lesson/generate { sessionId, lessonType: 'initial' }
    → Fetches wrong questions from pre-exam
    → buildLessonPrompt() → GPT-4o streaming
    → TransformStream collects full content, saves to lessons table on flush
    → Transitions state to lesson_active → lesson_completed

Post-Exam (same as pre-exam flow)
  → Score ≥80% → session_passed → unlockNextTopic()
  → Score <80% → remediation_active (loop count++)

Remediation Loop (max 3 iterations)
  → User reviews wrong questions
  → POST /api/remediation/start { questionId, sessionId }
    → Creates remediation_threads record
    → Streams initial Socratic hint via GPT-4o
    → Saves to remediation_messages on flush
  → POST /api/remediation/respond { threadId, message }
    → Saves user message, fetches conversation history
    → GPT-4o structured output → { message, isResolved }
    → If resolved: marks thread resolved
  → POST /api/lesson/generate { sessionId, lessonType: 'remediation' }
    → Includes insights from remediation conversations
  → POST /api/exam/generate + submit (examType: 'remediation')
    → ≥80% → session_passed
    → <80% and loop <3 → back to remediation_active
    → <80% and loop ≥3 → session_failed
```

### Database Access Patterns
- **Browser client** (`supabase/client.ts`): Used in client components for auth operations (login, signup, signout)
- **Server client** (`supabase/server.ts`): Used in API routes and server components. Reads cookies for auth. All queries scoped by RLS to `auth.uid()`
- **Admin client** (`supabase/admin.ts`): Used in `progression.ts` for cross-user operations (topic initialization). Bypasses RLS via service role key

### Streaming Pattern
Lesson and remediation-start use raw `ReadableStream` (not SSE):
- API route creates `TransformStream`, writes chunks to writable side
- `streamChatCompletion()` pipes GPT-4o delta chunks
- `flush()` callback saves full collected content to DB
- Client reads with `res.body.getReader()` + `TextDecoder`
- `useLesson` throttles UI updates with `requestAnimationFrame` (60fps)

---

## 5. Entry Points

### Main Runtime Entry
- `src/middleware.ts` — Intercepts all requests for auth validation
- `src/app/layout.tsx` — Root HTML layout (fonts, metadata, Toaster provider)

### Page Entry Points
| Path | Type | Component |
|------|------|-----------|
| `/` | Redirect | → `/dashboard` (auth) or `/login` (unauth) |
| `/login` | Client | Email/password form |
| `/signup` | Client | Registration form |
| `/callback` | Route Handler | OAuth callback |
| `/dashboard` | Server | Topic grid with progress |
| `/topics/[topicSlug]` | Server | Topic overview |
| `/topics/[topicSlug]/pre-exam` | Client | Diagnostic exam |
| `/topics/[topicSlug]/lesson` | Client | Streamed lesson |
| `/topics/[topicSlug]/post-exam` | Client | Assessment exam |
| `/topics/[topicSlug]/review` | Client | Results + remediation chat |

### API Route Entry Points
All listed under Section 3 API Routes table. No background jobs or cron tasks.

---

## 6. Environment + Configuration

### Required Environment Variables
| Variable | Scope | Purpose |
|----------|-------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Client + Server | Supabase project URL (must be valid HTTPS for build) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + Server | Public anon key for browser auth |
| `OPENAI_API_KEY` | Server only | GPT-4o API key |

### Optional Environment Variables
| Variable | Scope | Purpose | Fallback |
|----------|-------|---------|----------|
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Admin client for cross-user DB operations | Required if using admin client |
| `YOUTUBE_API_KEY` | Server only | YouTube Data API v3 for video search | Returns empty array |

### External Services

**Supabase** — Primary database + authentication
- PostgreSQL with 10 tables, RLS on all user-scoped tables
- Email/password auth with cookie-based sessions
- Trigger: `handle_new_user()` auto-creates profile on signup
- Schema: `supabase/migrations/001_initial_schema.sql`
- Seed data: `supabase/seed.sql` (4 categories, 5 Algebra topics with prerequisites)

**OpenAI GPT-4o** — Content generation
- Structured output: exam questions, remediation responses, student model updates
- Streaming: lessons, remediation start messages
- Temperature: 0.3 (exams), 0.7 (lessons/remediation)
- Max tokens: 4096 (lessons), 1024 (remediation start)

**YouTube Data API v3** — Optional video search
- Searches for SAT math tutorial videos per topic
- Gracefully disabled if API key not set

### Configuration Files
| File | Purpose |
|------|---------|
| `tsconfig.json` | TypeScript: target ES2017, path alias `@/*` → `./src/*` |
| `next.config.ts` | Next.js 16 (minimal, no custom config) |
| `components.json` | shadcn/ui: New York style, RSC enabled, Lucide icons |
| `vitest.config.ts` | Vitest: jsdom environment, React plugin |
| `postcss.config.mjs` | Tailwind CSS v4 |
| `eslint.config.mjs` | Next.js + TypeScript rules |

---

## 7. Architectural Risks and Technical Debt

### Supabase Type Safety Loss
Supabase clients (`client.ts`, `server.ts`, `admin.ts`) do NOT use the `Database` generic. Supabase JS v2.95+ with `@supabase/ssr` v0.8+ changed the type system so old-style Database generics produce `never` types on insert/update. Clients are untyped but work correctly at runtime. `types/database.ts` is kept for reference only.
**Risk:** Silent type mismatches at compile time; errors only caught at runtime.

### LaTeX Corruption in JSON Parsing
JSON parser interprets `\n` in `\neq` as newline, corrupting LaTeX commands. `fixCorruptedLatex()` and `sanitizeLatexStrings<T>()` in `streaming.ts` restore known commands. Prompts require `$...$` delimiters for all math.
**Risk:** Incomplete pattern coverage; novel LaTeX commands not in the fix list will remain corrupted.

### Markdown/LaTeX Preprocessing Fragility
Both `MarkdownRenderer` and `KatexRenderer` contain 150+ lines of regex to fix LLM-generated formatting issues (malformed delimiters, missing spaces, broken brackets). Preprocessing is stateful with iterative loops.
**Risk:** Adding new patterns may break existing ones. Edge cases may render incorrectly.

### OpenAI Structured Output Schemas Manually Defined
JSON schemas in `schemas.ts` are hand-written (not derived from Zod) because Zod v4 changed internals making `zodToJsonSchema` unreliable.
**Risk:** Schemas can drift from Zod validation schemas if one is updated without the other.

### No Structured Logging or Error Tracking
Error handling across API routes is `console.error()` → return 500 response. No centralized error tracking, rate limiting, or audit logging.
**Risk:** Production issues hard to diagnose; API abuse could exhaust OpenAI quota.

### Streaming Content Partial Save
If lesson stream is interrupted mid-transmission, `TransformStream.flush()` saves whatever was collected. Client checks for existing content before regenerating.
**Risk:** User may receive truncated lessons on connection drop.

### Remediation Resolution is LLM-Determined
Socratic chat resolution (`isResolved: true`) is decided by GPT-4o, not objective testing. Prompt heuristic: "After 4-5 exchanges, explain and mark resolved."
**Risk:** Subjective; student may not actually understand the concept.

### Student Model as Free-Text Arrays
`strengths`, `weaknesses`, `misconceptions` are unstructured text arrays written by LLM. No validation of quality or consistency.
**Risk:** Low-quality profiles degrade lesson customization.

### Non-Atomic Topic Progression
`unlockNextTopic()` runs as a separate call after exam pass. If it fails, topic is passed but next topic stays locked.
**Risk:** Inconsistent state requiring manual intervention.

### Race Condition in Exam Generation
State transitions are checked at API call time. Concurrent requests could generate duplicate question sets. A "belt-and-suspenders" check returns existing questions if already generated.
**Risk:** If race check fails, duplicate questions created.

---

## 8. Build and Test Commands

**Prerequisites:** Node v20 via nvm
```bash
export NVM_DIR="$HOME/.nvm" && . "$NVM_DIR/nvm.sh"
```

### Development
```bash
npm run dev              # Start dev server (Turbopack)
```

### Build
```bash
npm run build            # Production build (requires valid NEXT_PUBLIC_SUPABASE_URL)
```

### Type Check
```bash
node ./node_modules/typescript/bin/tsc --noEmit    # npx tsc has symlink issues
```

### Tests
```bash
npm test                 # Vitest watch mode
npm run test:run         # Single run
```

**Existing test files:**
- `src/lib/learning-loop/__tests__/scoring.test.ts` — 20 test cases for scoring logic
- `src/app/api/exam/submit/__tests__/route.test.ts` — Exam submission route tests

### Lint
```bash
npm run lint             # ESLint
```

---

## Database Schema

10 tables with RLS on all user-scoped tables. Schema in `supabase/migrations/001_initial_schema.sql`, seed data in `supabase/seed.sql`.

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `profiles` | User metadata (extends auth.users) | display_name, onboarding_completed |
| `categories` | Exam categories (4 seeded) | name, slug, display_order |
| `topics` | Topics per category (5 Algebra seeded) | name, slug, category_id, prerequisite_topic_id, display_order |
| `student_models` | Per-user per-topic learning profile | strengths[], weaknesses[], misconceptions[], mastery_level (0-100) |
| `learning_sessions` | Session state tracking (17 states) | state, session_number, pre/post/remediation_exam_score, remediation_loop_count |
| `exam_questions` | Generated questions + answers | exam_type, question_text, choices (JSONB), correct_answer, user_answer, is_correct, is_idk |
| `lessons` | Streamed lesson content | lesson_type, content, video_links (JSONB), key_concepts[] |
| `remediation_threads` | Socratic chat sessions per wrong question | question_id, is_resolved |
| `remediation_messages` | Conversation history | thread_id, role (assistant/user), content |
| `user_topic_progress` | Progress tracking | status (locked/available/in_progress/completed), best_score, attempts |

**Indexes:** On user_id, session_id, thread_id, category_id for all relevant tables.
**Trigger:** `handle_new_user()` auto-creates profiles record on auth.users insert.

---

## Key Architecture Decisions

### OpenAI Structured Output
JSON schemas for OpenAI's `response_format` are defined manually in `schemas.ts` (not derived from Zod). Zod v4 changed internal class names, making `zodToJsonSchema` unreliable. Three manual schemas: `examGenerationJsonSchema`, `studentModelUpdateJsonSchema`, `remediationResponseJsonSchema`.

### Learning Loop State Machine
17 states from `pre_exam_pending` → `session_passed`/`session_failed`:
- Pre-exam 100% → skip lesson, `session_passed`
- Post-exam ≥80% → `session_passed`
- Post-exam <80% → `remediation_active` → Socratic chat → remediation lesson → remediation exam
- Max 3 remediation loops before `session_failed`

### Streaming Architecture
Lesson generation and remediation start use raw `ReadableStream` responses (not SSE). The client reads with `res.body.getReader()`. A `TransformStream` in the API route collects full content and saves to DB on `flush()`.

### Student Model
Freeform text arrays (strengths, weaknesses, misconceptions) + mastery_level (0-100). Updated by LLM after each exam via `/api/student-model/update`. Called fire-and-forget from client after exam submission.

---

## Gotchas
- **nvm required**: Node is installed via nvm. Always source nvm before running commands.
- **`npx tsc` broken**: Symlink issue in node_modules/.bin. Use `node ./node_modules/typescript/bin/tsc` instead.
- **Next.js 16 middleware warning**: Shows "middleware is deprecated, use proxy" — middleware still works.
- **Build requires valid Supabase URL**: `.env.local` must have a valid HTTPS URL for `NEXT_PUBLIC_SUPABASE_URL` or static page generation fails.
- **Zod v4**: Installed via shadcn. Class names differ from v3. Don't use `instanceof z.ZodObject` etc. for runtime checks.
- **Supabase clients untyped**: Do NOT add `Database` generic back — it causes `never` types on insert/update with current Supabase versions.
- **LaTeX in JSON**: All OpenAI structured output responses must go through `sanitizeLatexStrings()` to fix JSON-corrupted LaTeX commands.
