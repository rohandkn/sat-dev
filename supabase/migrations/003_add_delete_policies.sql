-- Add missing DELETE policies for remediation_threads and remediation_messages.
-- Without these, RLS silently blocks deletions from the server client, causing
-- old resolved threads to accumulate and incorrectly mark questions as resolved.

create policy "Users can delete own threads" on public.remediation_threads
  for delete using (auth.uid() = user_id);

create policy "Users can delete own messages" on public.remediation_messages
  for delete using (
    exists (select 1 from public.remediation_threads t where t.id = thread_id and t.user_id = auth.uid())
  );
