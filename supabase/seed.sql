-- OPTIONAL: sample data so you can see the site working before adding real teams.
-- Run AFTER schema.sql. Safe to skip entirely.

insert into public.tournaments (id, name, venue, start_date, end_date, is_active)
values ('11111111-1111-1111-1111-111111111111', 'City Premier League 2026', 'Central Cricket Ground', '2026-10-01', '2026-10-20', true)
on conflict (id) do nothing;

insert into public.teams (id, tournament_id, name, short_name)
values
  ('22222222-2222-2222-2222-222222222221', '11111111-1111-1111-1111-111111111111', 'Thunder Strikers', 'TST'),
  ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Royal Warriors', 'RWR')
on conflict (id) do nothing;

insert into public.points_table (tournament_id, team_id)
values
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222221'),
  ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222')
on conflict (tournament_id, team_id) do nothing;

-- Add a few sample players to Thunder Strikers
insert into public.players (team_id, name, jersey_number, role, batting_style, bowling_style)
values
  ('22222222-2222-2222-2222-222222222221', 'Arif Hossain', 7, 'Batsman', 'Right-hand', '-'),
  ('22222222-2222-2222-2222-222222222221', 'Tanvir Ahmed', 10, 'Bowler', 'Right-hand', 'Right-arm fast'),
  ('22222222-2222-2222-2222-222222222221', 'Rakib Islam', 1, 'Wicket Keeper', 'Left-hand', '-'),
  ('22222222-2222-2222-2222-222222222221', 'Shakib Rahman', 8, 'All-Rounder', 'Right-hand', 'Right-arm off-spin')
on conflict (team_id, jersey_number) do nothing;
