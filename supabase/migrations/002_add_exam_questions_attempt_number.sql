alter table public.exam_questions
add column if not exists attempt_number integer not null default 1;

create index if not exists idx_exam_questions_session_type_attempt
  on public.exam_questions(session_id, exam_type, attempt_number);
