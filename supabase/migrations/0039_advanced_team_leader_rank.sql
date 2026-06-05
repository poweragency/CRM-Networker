-- New rank between Team Leader and Senior Team Leader.
ALTER TYPE public.marketer_rank ADD VALUE IF NOT EXISTS 'advanced_team_leader' AFTER 'team_leader';
