create extension if not exists pgcrypto;

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text default 'user' check (role in ('admin', 'user')),
  created_at timestamptz default now()
);

alter table profiles add column if not exists last_login_at timestamptz;
alter table profiles add column if not exists last_login_ip text;
alter table profiles add column if not exists ip_address text;
alter table profiles add column if not exists ip_country text;
alter table profiles add column if not exists ip_region text;
alter table profiles add column if not exists ip_city text;
alter table profiles add column if not exists membership_level text default 'free';
alter table profiles add column if not exists membership_expire_at timestamptz;
alter table profiles add column if not exists is_banned boolean default false;
alter table profiles add column if not exists ban_reason text;
alter table profiles add column if not exists banned_at timestamptz;

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

alter table uploaded_files add column if not exists ip_address text;
alter table uploaded_files add column if not exists ip_country text;
alter table uploaded_files add column if not exists ip_region text;
alter table uploaded_files add column if not exists ip_city text;

alter table quiz_questions add column if not exists tags jsonb default '[]'::jsonb;
alter table wrong_questions add column if not exists subject text;
alter table wrong_questions add column if not exists question_type text;
alter table wrong_questions add column if not exists error_type text;
alter table wrong_questions add column if not exists error_reason text;
alter table wrong_questions add column if not exists improvement_suggestion text;
alter table wrong_questions add column if not exists tags jsonb default '[]'::jsonb;

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

create table if not exists analysis_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id uuid references quiz_sessions(id) on delete set null,
  image_url text,
  source_type text default 'image' check (source_type in ('image', 'pdf')),
  mode text default 'analysis' check (mode in ('quiz', 'analysis', 'quiz_analysis')),
  recognized_text text,
  answer text,
  explanation text,
  knowledge_points jsonb default '[]'::jsonb,
  common_mistakes jsonb default '[]'::jsonb,
  similar_ideas jsonb default '[]'::jsonb,
  tags jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

alter table analysis_records add column if not exists ip_address text;
alter table analysis_records add column if not exists ip_country text;
alter table analysis_records add column if not exists ip_region text;
alter table analysis_records add column if not exists ip_city text;

create table if not exists quiz_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  session_id uuid references quiz_sessions(id) on delete set null,
  analysis_record_id uuid references analysis_records(id) on delete set null,
  quiz_title text,
  mode text default 'quiz' check (mode in ('quiz', 'analysis', 'quiz_analysis')),
  questions jsonb not null default '[]'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  score int default 0,
  wrong_questions jsonb default '[]'::jsonb,
  current_index int default 0,
  is_completed boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table quiz_records add column if not exists ip_address text;
alter table quiz_records add column if not exists ip_country text;
alter table quiz_records add column if not exists ip_region text;
alter table quiz_records add column if not exists ip_city text;
alter table quiz_records add column if not exists is_saved boolean default false;

create table if not exists ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  mode text check (mode in ('quiz', 'analysis', 'quiz_analysis')),
  prompt_tokens int,
  completion_tokens int,
  total_tokens int,
  model text,
  status text default 'success' check (status in ('success', 'failed')),
  error_message text,
  ip_address text,
  ip_country text,
  ip_region text,
  ip_city text,
  created_at timestamptz default now()
);

alter table ai_usage_logs add column if not exists job_id uuid;
alter table ai_usage_logs add column if not exists action text;
alter table ai_usage_logs add column if not exists tokens_used int;

create table if not exists analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  status text not null default 'queued',
  progress int not null default 0,
  stage text,
  image_url text,
  language text default 'zh',
  image_hash text,
  ocr_hash text,
  detected_text text,
  original_explanation jsonb,
  quiz_result jsonb,
  quiz_answers jsonb default '{}'::jsonb,
  wrong_explanations jsonb default '{}'::jsonb,
  pdf_url text,
  error_message text,
  is_saved boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table analysis_jobs add column if not exists original_explanation jsonb;
alter table analysis_jobs add column if not exists language text default 'zh';
alter table analysis_jobs add column if not exists quiz_result jsonb;
alter table analysis_jobs add column if not exists quiz_answers jsonb default '{}'::jsonb;
alter table analysis_jobs add column if not exists wrong_explanations jsonb default '{}'::jsonb;
alter table analysis_jobs add column if not exists image_hash text;
alter table analysis_jobs add column if not exists ocr_hash text;
alter table analysis_jobs add column if not exists detected_text text;
alter table analysis_jobs add column if not exists pdf_url text;
alter table analysis_jobs add column if not exists is_saved boolean default false;
alter table analysis_jobs add column if not exists error_message text;
alter table analysis_jobs add column if not exists updated_at timestamptz default now();

create table if not exists payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  order_no text unique,
  plan_type text,
  amount numeric,
  credits int default 0,
  status text not null default 'pending',
  payment_method text default 'unknown',
  pay_type text,
  trade_no text,
  uploaded_screenshot_url text,
  extracted_amount numeric,
  extracted_trade_no text,
  extracted_paid_at timestamptz,
  ai_risk_score int,
  ai_review_result text,
  risk_level int default 0,
  is_suspicious boolean default false,
  reviewed boolean default false,
  review_result text,
  reject_reason text,
  screenshot_hash text,
  plan text,
  provider text not null default 'epay',
  paid_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table payment_orders add column if not exists order_no text;
alter table payment_orders add column if not exists plan_type text;
alter table payment_orders add column if not exists credits int default 0;
alter table payment_orders add column if not exists payment_method text default 'unknown';
alter table payment_orders add column if not exists pay_type text;
alter table payment_orders add column if not exists trade_no text;
alter table payment_orders add column if not exists uploaded_screenshot_url text;
alter table payment_orders add column if not exists extracted_amount numeric;
alter table payment_orders add column if not exists extracted_trade_no text;
alter table payment_orders add column if not exists extracted_paid_at timestamptz;
alter table payment_orders add column if not exists ai_risk_score int;
alter table payment_orders add column if not exists ai_review_result text;
alter table payment_orders add column if not exists risk_level int default 0;
alter table payment_orders add column if not exists is_suspicious boolean default false;
alter table payment_orders add column if not exists reviewed boolean default false;
alter table payment_orders add column if not exists review_result text;
alter table payment_orders add column if not exists reject_reason text;
alter table payment_orders add column if not exists screenshot_hash text;
alter table payment_orders add column if not exists paid_at timestamptz;
alter table payment_orders add column if not exists updated_at timestamptz default now();
alter table payment_orders add column if not exists plan text;
alter table payment_orders add column if not exists provider text default 'epay';
alter table payment_orders alter column amount type numeric using amount::numeric;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_orders_order_no_key'
  ) then
    alter table payment_orders
    add constraint payment_orders_order_no_key unique (order_no);
  end if;
end;
$$;

do $$
begin
  alter table payment_orders drop constraint if exists payment_orders_status_check;
  alter table payment_orders
  add constraint payment_orders_status_check check (status in ('pending', 'reviewing', 'paid', 'rejected', 'failed'));
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_orders_pay_type_check'
  ) then
    alter table payment_orders
    add constraint payment_orders_pay_type_check check (pay_type is null or pay_type in ('alipay', 'wechat'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_orders_payment_method_check'
  ) then
    alter table payment_orders
    add constraint payment_orders_payment_method_check check (payment_method is null or payment_method in ('wechat', 'alipay', 'unknown'));
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'quiz_records_user_session_key'
  ) then
    alter table quiz_records
    add constraint quiz_records_user_session_key unique (user_id, session_id);
  end if;
end;
$$;

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
alter table analysis_records enable row level security;
alter table quiz_records enable row level security;
alter table ai_usage_logs enable row level security;
alter table analysis_jobs enable row level security;
alter table payment_orders enable row level security;

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

drop policy if exists "Users can read own analysis records" on analysis_records;
create policy "Users can read own analysis records"
on analysis_records for select
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can create own analysis records" on analysis_records;
create policy "Users can create own analysis records"
on analysis_records for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own analysis records" on analysis_records;
create policy "Users can delete own analysis records"
on analysis_records for delete
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can read own quiz records" on quiz_records;
create policy "Users can read own quiz records"
on quiz_records for select
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can create own quiz records" on quiz_records;
create policy "Users can create own quiz records"
on quiz_records for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own quiz records" on quiz_records;
create policy "Users can update own quiz records"
on quiz_records for update
using (auth.uid() = user_id or is_admin(auth.uid()))
with check (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can delete own quiz records" on quiz_records;
create policy "Users can delete own quiz records"
on quiz_records for delete
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can read own ai usage logs" on ai_usage_logs;
create policy "Users can read own ai usage logs"
on ai_usage_logs for select
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can create own ai usage logs" on ai_usage_logs;
create policy "Users can create own ai usage logs"
on ai_usage_logs for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can read own analysis jobs" on analysis_jobs;
create policy "Users can read own analysis jobs"
on analysis_jobs for select
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can create own analysis jobs" on analysis_jobs;
create policy "Users can create own analysis jobs"
on analysis_jobs for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own analysis jobs" on analysis_jobs;
create policy "Users can update own analysis jobs"
on analysis_jobs for update
using (auth.uid() = user_id or is_admin(auth.uid()))
with check (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can delete own analysis jobs" on analysis_jobs;
create policy "Users can delete own analysis jobs"
on analysis_jobs for delete
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can read own payment orders" on payment_orders;
create policy "Users can read own payment orders"
on payment_orders for select
using (auth.uid() = user_id or is_admin(auth.uid()));

drop policy if exists "Users can create own payment orders" on payment_orders;
create policy "Users can create own payment orders"
on payment_orders for insert
with check (auth.uid() = user_id);

drop policy if exists "Admins can manage payment orders" on payment_orders;
create policy "Admins can manage payment orders"
on payment_orders for all
using (is_admin(auth.uid()))
with check (is_admin(auth.uid()));

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

create index if not exists wrong_questions_tags_idx
on wrong_questions using gin (tags);

create index if not exists study_records_user_id_created_at_idx
on study_records (user_id, created_at desc);

create index if not exists analysis_records_user_id_created_at_idx
on analysis_records (user_id, created_at desc);

create index if not exists quiz_records_user_id_created_at_idx
on quiz_records (user_id, created_at desc);

create index if not exists ai_usage_logs_user_id_created_at_idx
on ai_usage_logs (user_id, created_at desc);

create index if not exists ai_usage_logs_action_created_at_idx
on ai_usage_logs (action, created_at desc);

create index if not exists analysis_jobs_user_id_created_at_idx
on analysis_jobs (user_id, created_at desc);

create index if not exists analysis_jobs_image_hash_idx
on analysis_jobs (image_hash);

create index if not exists analysis_jobs_ocr_hash_idx
on analysis_jobs (ocr_hash);

create index if not exists analysis_jobs_status_idx
on analysis_jobs (status);

create index if not exists payment_orders_user_id_created_at_idx
on payment_orders (user_id, created_at desc);

create index if not exists payment_orders_order_no_idx
on payment_orders (order_no);

create unique index if not exists payment_orders_extracted_trade_no_unique_idx
on payment_orders (extracted_trade_no)
where extracted_trade_no is not null and extracted_trade_no <> '';

create unique index if not exists payment_orders_screenshot_hash_unique_idx
on payment_orders (screenshot_hash)
where screenshot_hash is not null and screenshot_hash <> '';
