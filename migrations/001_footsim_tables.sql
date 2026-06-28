-- FootSim tables migration
-- Run as app user (clea) — no superuser needed
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT)

CREATE TABLE IF NOT EXISTS footsim_teams (
    id          VARCHAR(64)  PRIMARY KEY,
    slug        VARCHAR(128) UNIQUE NOT NULL,
    owner_id    VARCHAR(64)  NOT NULL DEFAULT '',
    data        TEXT         NOT NULL,
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_footsim_teams_owner ON footsim_teams (owner_id);
CREATE INDEX IF NOT EXISTS idx_footsim_teams_slug  ON footsim_teams (slug);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS footsim_players (
    team_slug   VARCHAR(128) PRIMARY KEY,
    data        TEXT         NOT NULL,
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS footsim_matches (
    id          VARCHAR(64)  PRIMARY KEY,
    data        TEXT         NOT NULL,
    created_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS footsim_leagues (
    id          VARCHAR(128) PRIMARY KEY,
    nation_slug VARCHAR(128) NOT NULL DEFAULT '',
    data        TEXT         NOT NULL,
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_footsim_leagues_nation ON footsim_leagues (nation_slug);

-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS footsim_competitions (
    id          VARCHAR(64)  PRIMARY KEY,
    data        TEXT         NOT NULL,
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────

-- Flattened summary index — avoids deserializing full competition blobs for list views
CREATE TABLE IF NOT EXISTS footsim_competition_index (
    id          VARCHAR(64)  PRIMARY KEY,
    data        TEXT         NOT NULL,
    updated_at  TIMESTAMP    NOT NULL DEFAULT NOW()
);
