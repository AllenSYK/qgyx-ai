create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now()
);

create table if not exists user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  remaining int default 5 check (remaining >= 0),
  total_purchased int default 0 check (total_purchased >= 0),
  updated_at timestamptz default now()
);

create table if not exists quiz_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  image_analysis text,
  quiz jsonb,
  created_at timestamptz default now()
);

alter table quiz_sessions add column if not exists source_type text default 'image';
alter table quiz_sessions add column if not exists question_count int default 0;
alter table quiz_sessions add column if not exists correct_count int;
alter table quiz_sessions add column if not exists accuracy numeric;

create table if not exists uploaded_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id uuid references quiz_sessions(id) on delete set null,
  file_name text,
  file_type text,
  file_size int,
  source_kind text default 'image' check (source_kind in ('image', 'pdf')),
  status text default 'processed',
  created_at timestamptz default now()
);

create table if not exists quiz_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references quiz_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  question_order int default 1,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  answer_index int not null check (answer_index between 0 and 3),
  explanation text,
  knowledge_point text,
  difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  created_at timestamptz default now()
);

create table if not exists wrong_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id uuid references quiz_sessions(id) on delete set null,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  answer_index int not null check (answer_index between 0 and 3),
  user_answer_index int not null check (user_answer_index between 0 and 3),
  explanation text,
  knowledge_point text,
  difficulty text default 'medium' check (difficulty in ('easy', 'medium', 'hard')),
  practiced_count int default 0,
  created_at timestamptz default now()
);

create table if not exists study_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id uuid references quiz_sessions(id) on delete set null,
  quiz_title text,
  question_count int default 0,
  correct_count int default 0,
  accuracy numeric default 0,
  knowledge_points jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, role)
  values (new.id, new.email, 'user')
  on conflict (id) do nothing;

  insert into user_credits (user_id, remaining, total_purchased)
  values (new.id, 5, 0)
  on conflict (user_id) do nothing;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure handle_new_user();

create or replace function is_admin(user_id uuid)
returns boolean as $$
  select exists (
    select 1
    from profiles
    where id = user_id and role = 'admin'
  );
$$ language sql security definer set search_path = public;

alter table profiles enable row level security;
alter table user_credits enable row level security;
alter table quiz_sessions enable row level security;
alter table uploaded_files enable row level security;
alter table quiz_questions enable row level security;
alter table wrong_questions enable row level security;
alter table study_records enable row level security;

drop policy if exists "Users can read own profile" on profiles;
create policy "Users can read own profile"
on profiles for select
using (auth.uid() = id or is_admin(auth.uid()));

drop policy if exists "Users can create own profile" on profiles;
create policy "Users can create own profile"
on profiles for insert
with check (auth.uid() = id and role = 'user');

drop policy if exists "Users can update own profile email" on profiles;
create policy "Users can update own profile email"
on profiles for update
using (auth.uid() = id)
with check (auth.uid() = id and role = 'user');

drop policy if exists "Admins can update profiles" on profiles;
create policy "Admins can update profiles"
on profiles for update
using (is_admin(auth.uid()))
with check (role in ('admin', 'user'));

drop policy if exists "Users can read own credits" on user_credits;
create policy "Users can read own credits"
on user_credits for select
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can create own initial credits" on user_credits;
create policy "Users can create own initial credits"
on user_credits for insert
with check (auth.uid() = user_id and remaining = 5 and total_purchased = 0);

drop policy if exists "Admins can manage credits" on user_credits;
create policy "Admins can manage credits"
on user_credits for all
using (is_admin(auth.uid()))
with check (is_admin(auth.uid()));

drop policy if exists "Users can read own quiz sessions" on quiz_sessions;
create policy "Users can read own quiz sessions"
on quiz_sessions for select
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can create own quiz sessions" on quiz_sessions;
create policy "Users can create own quiz sessions"
on quiz_sessions for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can read own uploaded files" on uploaded_files;
create policy "Users can read own uploaded files"
on uploaded_files for select
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can create own uploaded files" on uploaded_files;
create policy "Users can create own uploaded files"
on uploaded_files for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can read own quiz questions" on quiz_questions;
create policy "Users can read own quiz questions"
on quiz_questions for select
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can create own quiz questions" on quiz_questions;
create policy "Users can create own quiz questions"
on quiz_questions for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can read own wrong questions" on wrong_questions;
create policy "Users can read own wrong questions"
on wrong_questions for select
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can create own wrong questions" on wrong_questions;
create policy "Users can create own wrong questions"
on wrong_questions for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own wrong questions" on wrong_questions;
create policy "Users can update own wrong questions"
on wrong_questions for update
using (auth.uid() = user_id or is_admin(auth.uid()))
with check (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can read own study records" on study_records;
create policy "Users can read own study records"
on study_records for select
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can create own study records" on study_records;
create policy "Users can create own study records"
on study_records for insert
with check (auth.uid() = user_id);

create index if not exists quiz_sessions_user_id_created_at_idx
on quiz_sessions (user_id, created_at desc);

create index if not exists uploaded_files_user_id_created_at_idx
on uploaded_files (user_id, created_at desc);

create index if not exists quiz_questions_session_id_idx
on quiz_questions (session_id, question_order);

create index if not exists wrong_questions_user_id_created_at_idx
on wrong_questions (user_id, created_at desc);

create index if not exists wrong_questions_knowledge_point_idx
on wrong_questions (knowledge_point);

create index if not exists study_records_user_id_created_at_idx
on study_records (user_id, created_at desc);
