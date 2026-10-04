-- Your Personal Psych — Supabase setup (run once in Supabase SQL Editor)
-- Creates a patients registry: every new signup automatically gets a row
-- whose userid (UUID primary key) is generated at account creation.
-- That same userid is sent to the Streamlit agent on every login, which
-- keys all sessions, records and history off it.

-- 1. Registry table: userid is the primary key, generated per signup
create table if not exists public.profiles (
  userid uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz default now()
);

-- 2. Auto-create the row on every signup (runs as superuser, always fires)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (userid, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      split_part(new.email, '@', 1)
    )
  )
  on conflict (userid) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3. Row-level security: users can only read/update their own row
alter table public.profiles enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = userid);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = userid);
