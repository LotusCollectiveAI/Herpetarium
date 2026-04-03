-- P1-A: Arena scratch notes — player memory across games
ALTER TABLE coach_runs ADD COLUMN current_scratch_notes JSONB;
ALTER TABLE coach_sprints ADD COLUMN scratch_notes_snapshot JSONB;
