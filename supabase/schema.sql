-- ============================================================
-- CRICKET TOURNAMENT MANAGEMENT — SUPABASE SCHEMA
-- Run this entire file in Supabase SQL Editor (Project > SQL Editor > New Query)
-- ============================================================

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. PROFILES (extends Supabase auth.users with a role)
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'operator' check (role in ('super_admin','operator')),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. TOURNAMENTS
-- ------------------------------------------------------------
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  logo_url text,
  banner_url text,
  start_date date,
  end_date date,
  venue text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3. TEAMS
-- ------------------------------------------------------------
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  name text not null,
  short_name text,
  logo_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tournament_id, name)
);

-- ------------------------------------------------------------
-- 4. TEAM MANAGERS (1 per team)
-- ------------------------------------------------------------
create table if not exists public.team_managers (
  id uuid primary key default gen_random_uuid(),
  team_id uuid unique references public.teams(id) on delete cascade,
  name text not null,
  photo_url text,
  mobile text,
  email text,
  address text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. PLAYERS (15-20 per team, enforced in app layer + trigger below)
-- ------------------------------------------------------------
create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id) on delete cascade,
  name text not null,
  photo_url text,
  jersey_number int,
  role text check (role in ('Batsman','Bowler','All-Rounder','Wicket Keeper')),
  batting_style text,
  bowling_style text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (team_id, jersey_number)
);

-- Enforce max 20 players per team
create or replace function public.check_squad_size()
returns trigger as $$
begin
  if (select count(*) from public.players where team_id = new.team_id) >= 20 then
    raise exception 'A team cannot have more than 20 players';
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_check_squad_size on public.players;
create trigger trg_check_squad_size
before insert on public.players
for each row execute function public.check_squad_size();

-- ------------------------------------------------------------
-- 6. MATCHES
-- ------------------------------------------------------------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  team_a_id uuid references public.teams(id),
  team_b_id uuid references public.teams(id),
  match_date date,
  match_time time,
  venue text,
  overs_limit int not null default 20,
  toss_winner_id uuid references public.teams(id),
  toss_decision text check (toss_decision in ('Bat','Bowl')),
  status text not null default 'Upcoming' check (status in ('Upcoming','Live','Paused','Completed','Cancelled')),
  result_text text,
  winner_id uuid references public.teams(id),
  operator_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7. INNINGS
-- ------------------------------------------------------------
create table if not exists public.innings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.matches(id) on delete cascade,
  innings_number int not null check (innings_number in (1,2)),
  batting_team_id uuid references public.teams(id),
  bowling_team_id uuid references public.teams(id),
  total_runs int not null default 0,
  total_wickets int not null default 0,
  total_overs numeric not null default 0,      -- e.g. 18.3
  total_balls int not null default 0,          -- legal balls bowled, for accurate math
  extras_wide int not null default 0,
  extras_noball int not null default 0,
  extras_bye int not null default 0,
  extras_legbye int not null default 0,
  current_striker_id uuid references public.players(id),
  current_non_striker_id uuid references public.players(id),
  current_bowler_id uuid references public.players(id),
  is_completed boolean not null default false,
  unique (match_id, innings_number)
);

-- ------------------------------------------------------------
-- 8. BATTING SCORES (per player per innings)
-- ------------------------------------------------------------
create table if not exists public.batting_scores (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid references public.innings(id) on delete cascade,
  player_id uuid references public.players(id),
  runs int not null default 0,
  balls_faced int not null default 0,
  fours int not null default 0,
  sixes int not null default 0,
  is_out boolean not null default false,
  how_out text,
  batting_position int,
  unique (innings_id, player_id)
);

-- ------------------------------------------------------------
-- 9. BOWLING SCORES (per player per innings)
-- ------------------------------------------------------------
create table if not exists public.bowling_scores (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid references public.innings(id) on delete cascade,
  player_id uuid references public.players(id),
  overs_bowled numeric not null default 0,
  balls_bowled int not null default 0,
  runs_conceded int not null default 0,
  wickets int not null default 0,
  maidens int not null default 0,
  unique (innings_id, player_id)
);

-- ------------------------------------------------------------
-- 10. BALL EVENTS (ball-by-ball log — source of truth for scoring)
-- ------------------------------------------------------------
create table if not exists public.ball_events (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid references public.innings(id) on delete cascade,
  over_number int not null,
  ball_number int not null,          -- legal ball index within the over (1-6)
  striker_id uuid references public.players(id),
  non_striker_id uuid references public.players(id),
  bowler_id uuid references public.players(id),
  event_type text not null check (event_type in
    ('0','1','2','3','4','5','6','WD','NB','B','LB','W')),
  runs int not null default 0,
  wicket_type text check (wicket_type in
    ('Bowled','Caught','LBW','Run Out','Stumped','Hit Wicket','Retired Hurt','Other')),
  dismissed_player_id uuid references public.players(id),
  is_legal_ball boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 11. COMMENTARY
-- ------------------------------------------------------------
create table if not exists public.commentary (
  id uuid primary key default gen_random_uuid(),
  innings_id uuid references public.innings(id) on delete cascade,
  ball_event_id uuid references public.ball_events(id) on delete cascade,
  over_display text,          -- e.g. "18.3"
  text text not null,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 12. POINTS TABLE
-- ------------------------------------------------------------
create table if not exists public.points_table (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments(id) on delete cascade,
  team_id uuid references public.teams(id) on delete cascade,
  played int not null default 0,
  won int not null default 0,
  lost int not null default 0,
  no_result int not null default 0,
  points int not null default 0,
  net_run_rate numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (tournament_id, team_id)
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles enable row level security;
alter table public.tournaments enable row level security;
alter table public.teams enable row level security;
alter table public.team_managers enable row level security;
alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.innings enable row level security;
alter table public.batting_scores enable row level security;
alter table public.bowling_scores enable row level security;
alter table public.ball_events enable row level security;
alter table public.commentary enable row level security;
alter table public.points_table enable row level security;

-- Helper: is the current user a super admin?
create or replace function public.is_super_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'super_admin'
  );
$$ language sql security definer stable;

-- Helper: is the current user any authenticated staff (admin or operator)?
create or replace function public.is_staff()
returns boolean as $$
  select exists (select 1 from public.profiles where id = auth.uid());
$$ language sql security definer stable;

-- PUBLIC READ for everything tournament-related (anon + authenticated)
create policy "public read tournaments" on public.tournaments for select using (true);
create policy "public read teams" on public.teams for select using (true);
create policy "public read managers" on public.team_managers for select using (true);
create policy "public read players" on public.players for select using (true);
create policy "public read matches" on public.matches for select using (true);
create policy "public read innings" on public.innings for select using (true);
create policy "public read batting" on public.batting_scores for select using (true);
create policy "public read bowling" on public.bowling_scores for select using (true);
create policy "public read ball_events" on public.ball_events for select using (true);
create policy "public read commentary" on public.commentary for select using (true);
create policy "public read points_table" on public.points_table for select using (true);

-- PROFILES: users can read their own profile; super admin can read all
create policy "read own profile" on public.profiles for select using (auth.uid() = id or public.is_super_admin());
create policy "super admin manage profiles" on public.profiles for all using (public.is_super_admin()) with check (public.is_super_admin());

-- SUPER ADMIN: full write access to structural data
create policy "admin write tournaments" on public.tournaments for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "admin write teams" on public.teams for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "admin write managers" on public.team_managers for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "admin write players" on public.players for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "admin write points_table" on public.points_table for all using (public.is_super_admin()) with check (public.is_super_admin());

-- MATCHES: super admin full control; operators can update only matches assigned to them
create policy "admin write matches" on public.matches for all using (public.is_super_admin()) with check (public.is_super_admin());
create policy "operator update own matches" on public.matches for update
  using (operator_id = auth.uid())
  with check (operator_id = auth.uid());

-- LIVE SCORING TABLES: staff (admin or assigned operator) can write
create policy "staff write innings" on public.innings for all
  using (public.is_super_admin() or exists (
    select 1 from public.matches m where m.id = innings.match_id and m.operator_id = auth.uid()
  ))
  with check (public.is_super_admin() or exists (
    select 1 from public.matches m where m.id = innings.match_id and m.operator_id = auth.uid()
  ));

create policy "staff write batting" on public.batting_scores for all
  using (public.is_staff()) with check (public.is_staff());
create policy "staff write bowling" on public.bowling_scores for all
  using (public.is_staff()) with check (public.is_staff());
create policy "staff write ball_events" on public.ball_events for all
  using (public.is_staff()) with check (public.is_staff());
create policy "staff write commentary" on public.commentary for all
  using (public.is_staff()) with check (public.is_staff());

-- ============================================================
-- REALTIME: enable replication for live-scoring tables
-- ============================================================
alter publication supabase_realtime add table public.innings;
alter publication supabase_realtime add table public.ball_events;
alter publication supabase_realtime add table public.commentary;
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.batting_scores;
alter publication supabase_realtime add table public.bowling_scores;

-- ============================================================
-- STORAGE BUCKETS (also creatable via Dashboard > Storage)
-- ============================================================
insert into storage.buckets (id, name, public)
values
  ('team-logos','team-logos', true),
  ('player-photos','player-photos', true),
  ('tournament-images','tournament-images', true),
  ('match-media','match-media', true)
on conflict (id) do nothing;

-- Public read on all four buckets; only authenticated staff can upload
create policy "public read team-logos" on storage.objects for select using (bucket_id = 'team-logos');
create policy "public read player-photos" on storage.objects for select using (bucket_id = 'player-photos');
create policy "public read tournament-images" on storage.objects for select using (bucket_id = 'tournament-images');
create policy "public read match-media" on storage.objects for select using (bucket_id = 'match-media');

create policy "staff upload team-logos" on storage.objects for insert with check (bucket_id = 'team-logos' and public.is_staff());
create policy "staff upload player-photos" on storage.objects for insert with check (bucket_id = 'player-photos' and public.is_staff());
create policy "staff upload tournament-images" on storage.objects for insert with check (bucket_id = 'tournament-images' and public.is_staff());
create policy "staff upload match-media" on storage.objects for insert with check (bucket_id = 'match-media' and public.is_staff());

create policy "staff update own uploads" on storage.objects for update using (public.is_staff());
create policy "staff delete own uploads" on storage.objects for delete using (public.is_staff());

-- ============================================================
-- Auto-create a profile row when a new auth user signs up
-- (New users default to 'operator' — promote to 'super_admin' manually, see README)
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, new.raw_user_meta_data->>'full_name', 'operator');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
