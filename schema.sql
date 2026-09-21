-- ink v2 schema — run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Timestamps are bigint milliseconds (matches Date.now() in the app).
-- Deletes are soft (deleted_at set) so offline devices can't resurrect deleted items.
-- Primary keys are (user_id, id): ids are client-generated timestamps, so a
-- bare id could collide across users and break their upserts under RLS.
-- If you already ran an earlier version of this file, drop the table first:
--   drop table if exists notes;
-- The tasks feature is gone; drop its leftover table when you're ready:
--   drop table if exists tasks;

create table if not exists notes (
  id bigint not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null default '',
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  primary key (user_id, id)
);

alter table notes enable row level security;

create policy "own notes" on notes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
