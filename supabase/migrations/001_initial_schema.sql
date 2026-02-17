-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Profiles table (extends auth.users)
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  display_name text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
create policy "Users can view own profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can update own profile" on public.profiles for update using (auth.uid() = id);
create policy "Users can insert own profile" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Categories
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  slug text not null unique,
  description text,
  display_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Topics
create table public.topics (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references public.categories on delete cascade,
  name text not null,
  slug text not null unique,
  description text,
  display_order integer not null default 0,
  prerequisite_topic_id uuid references public.topics,
  created_at timestamptz not null default now()
);

-- Student models (per-user per-topic understanding)
create table public.student_models (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users on delete cascade,
  topic_id uuid not null references public.topics on delete cascade,
  strengths text[] not null default '{}',
  weaknesses text[] not null default '{}',
  misconceptions text[] not null default '{}',
  mastery_level integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, topic_id)
);

alter table public.student_models enable row level security;
create policy "Users can view own student models" on public.student_models for select using (auth.uid() = user_id);
create policy "Users can insert own student models" on public.student_models for insert with check (auth.uid() = user_id);
create policy "Users can update own student models" on public.student_models for update using (auth.uid() = user_id);

-- Learning sessions
create table public.learning_sessions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users on delete cascade,
  topic_id uuid not null references public.topics on delete cascade,
  state text not null default 'pre_exam_pending',
  session_number integer not null default 1,
  pre_exam_score real,
  post_exam_score real,
  remediation_exam_score real,
  remediation_loop_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.learning_sessions enable row level security;
create policy "Users can view own sessions" on public.learning_sessions for select using (auth.uid() = user_id);
create policy "Users can insert own sessions" on public.learning_sessions for insert with check (auth.uid() = user_id);
create policy "Users can update own sessions" on public.learning_sessions for update using (auth.uid() = user_id);

-- Exam questions
create table public.exam_questions (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.learning_sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  exam_type text not null check (exam_type in ('pre', 'post', 'remediation')),
  question_number integer not null,
  question_text text not null,
  choices jsonb not null,
  correct_answer text not null,
  explanation text not null,
  user_answer text,
  is_correct boolean,
  is_idk boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.exam_questions enable row level security;
create policy "Users can view own questions" on public.exam_questions for select using (auth.uid() = user_id);
create policy "Users can insert own questions" on public.exam_questions for insert with check (auth.uid() = user_id);
create policy "Users can update own questions" on public.exam_questions for update using (auth.uid() = user_id);

-- Remediation threads
create table public.remediation_threads (
  id uuid primary key default uuid_generate_v4(),
  question_id uuid not null references public.exam_questions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  session_id uuid not null references public.learning_sessions on delete cascade,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.remediation_threads enable row level security;
create policy "Users can view own threads" on public.remediation_threads for select using (auth.uid() = user_id);
create policy "Users can insert own threads" on public.remediation_threads for insert with check (auth.uid() = user_id);
create policy "Users can update own threads" on public.remediation_threads for update using (auth.uid() = user_id);

-- Remediation messages
create table public.remediation_messages (
  id uuid primary key default uuid_generate_v4(),
  thread_id uuid not null references public.remediation_threads on delete cascade,
  role text not null check (role in ('assistant', 'user')),
  content text not null,
  created_at timestamptz not null default now()
);

alter table public.remediation_messages enable row level security;
create policy "Users can view own messages" on public.remediation_messages
  for select using (
    exists (select 1 from public.remediation_threads t where t.id = thread_id and t.user_id = auth.uid())
  );
create policy "Users can insert own messages" on public.remediation_messages
  for insert with check (
    exists (select 1 from public.remediation_threads t where t.id = thread_id and t.user_id = auth.uid())
  );

-- Lessons
create table public.lessons (
  id uuid primary key default uuid_generate_v4(),
  session_id uuid not null references public.learning_sessions on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  lesson_type text not null check (lesson_type in ('initial', 'remediation')),
  content text not null default '',
  video_links jsonb not null default '[]',
  key_concepts text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.lessons enable row level security;
create policy "Users can view own lessons" on public.lessons for select using (auth.uid() = user_id);
create policy "Users can insert own lessons" on public.lessons for insert with check (auth.uid() = user_id);
create policy "Users can update own lessons" on public.lessons for update using (auth.uid() = user_id);

-- User topic progress
create table public.user_topic_progress (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users on delete cascade,
  topic_id uuid not null references public.topics on delete cascade,
  status text not null default 'locked' check (status in ('locked', 'available', 'in_progress', 'completed')),
  best_score real,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, topic_id)
);

alter table public.user_topic_progress enable row level security;
create policy "Users can view own progress" on public.user_topic_progress for select using (auth.uid() = user_id);
create policy "Users can insert own progress" on public.user_topic_progress for insert with check (auth.uid() = user_id);
create policy "Users can update own progress" on public.user_topic_progress for update using (auth.uid() = user_id);

-- Indexes
create index idx_student_models_user on public.student_models(user_id);
create index idx_learning_sessions_user on public.learning_sessions(user_id);
create index idx_learning_sessions_topic on public.learning_sessions(topic_id);
create index idx_exam_questions_session on public.exam_questions(session_id);
create index idx_remediation_threads_session on public.remediation_threads(session_id);
create index idx_remediation_messages_thread on public.remediation_messages(thread_id);
create index idx_user_topic_progress_user on public.user_topic_progress(user_id);
create index idx_topics_category on public.topics(category_id);
