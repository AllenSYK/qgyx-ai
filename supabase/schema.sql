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

create index if not exists quiz_sessions_user_id_created_at_idx
on quiz_sessions (user_id, created_at desc);
