-- Run this in Supabase SQL Editor

-- 1. Profiles (Public user data)
create table public.profiles (
  id uuid references auth.users not null primary key,
  full_name text,
  updated_at timestamp with time zone
);

-- 2. Households
create table public.households (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  invite_code text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 3. Household Members (Many-to-Many)
create table public.household_members (
  household_id uuid references public.households on delete cascade,
  profile_id uuid references public.profiles on delete cascade,
  primary key (household_id, profile_id)
);

-- 4. Expenses
create table public.expenses (
  id uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households on delete cascade,
  payer_id uuid references public.profiles,
  amount numeric not null,
  description text,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- 5. Payments
create table public.payments (
  id uuid default uuid_generate_v4() primary key,
  household_id uuid references public.households on delete cascade,
  payer_id uuid references public.profiles,
  payee_id uuid references public.profiles,
  amount numeric not null,
  created_at timestamp with time zone default timezone('utc'::text, now())
);

-- Enable Realtime
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table payments;
alter publication supabase_realtime add table household_members;

-- Note: RLS (Row Level Security) is disabled strictly for this simple demo. 
-- In production, you must enable RLS policies!
alter table profiles enable row level security;
create policy "Public profiles" on profiles for select using (true);
create policy "Users can insert their own profile" on profiles for insert with check (auth.uid() = id);

-- For other tables, we leave RLS off for ease of testing:
alter table households disable row level security;
alter table household_members disable row level security;
alter table expenses disable row level security;
alter table payments disable row level security;
-- 6. Triggers for Auto-Profile Creation
-- This ensures 'public.profiles' exists as soon as a user signs up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, split_part(new.email, '@', 1));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 7. Fix for existing users (Run this once if you already signed up)
-- insert into public.profiles (id, full_name)
-- select id, split_part(email, '@', 1) from auth.users
-- where id not in (select id from public.profiles);
