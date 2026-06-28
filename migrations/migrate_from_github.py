#!/usr/bin/env python3
"""
FootSim data migration: GitHub (Projet-Resurgence/footsim-data) → PostgreSQL (footsim_* tables)

Usage:
    python3 migrate_from_github.py [--dry-run] [--only teams|competitions|leagues]

Env vars (or pass as args):
    GITHUB_PAT          GitHub Personal Access Token (repo scope)
    DB_HOST             PostgreSQL host         (default: localhost)
    DB_PORT             PostgreSQL port         (default: 5432)
    DB_NAME             Database name           (default: rts)
    DB_USER             Database user           (default: clea)
    DB_PASSWORD         Database password
    FOOTSIM_DATA_REPO   GitHub repo             (default: Projet-Resurgence/footsim-data)
    FOOTSIM_DATA_BRANCH Branch                  (default: main)
"""

import argparse
import base64
import json
import os
import sys
import time
from typing import Any

import psycopg2
import requests

# ─── Config ──────────────────────────────────────────────────────────────────

GITHUB_PAT   = os.getenv("GITHUB_PAT", "")
DB_HOST      = os.getenv("DB_HOST", "localhost")
DB_PORT      = int(os.getenv("DB_PORT", "5432"))
DB_NAME      = os.getenv("DB_NAME", "rts")
DB_USER      = os.getenv("DB_USER", "clea")
DB_PASSWORD  = os.getenv("DB_PASSWORD", "")
DATA_REPO    = os.getenv("FOOTSIM_DATA_REPO", "Projet-Resurgence/footsim-data")
DATA_BRANCH  = os.getenv("FOOTSIM_DATA_BRANCH", "main")

GH_API = "https://api.github.com"

# ─── GitHub helpers ───────────────────────────────────────────────────────────

def gh_headers() -> dict:
    h = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    if GITHUB_PAT:
        h["Authorization"] = f"Bearer {GITHUB_PAT}"
    return h


def gh_get(path: str) -> Any:
    url = f"{GH_API}/repos/{DATA_REPO}/contents/{path}?ref={DATA_BRANCH}"
    for attempt in range(3):
        r = requests.get(url, headers=gh_headers(), timeout=15)
        if r.status_code == 404:
            return None
        if r.status_code == 403 and "rate limit" in r.text.lower():
            wait = int(r.headers.get("Retry-After", 60))
            print(f"  [rate limit] sleeping {wait}s...")
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r.json()
    raise RuntimeError(f"gh_get failed after 3 attempts: {path}")


def gh_read_json(path: str) -> Any | None:
    meta = gh_get(path)
    if meta is None:
        return None
    if isinstance(meta, list):
        return meta  # directory listing
    # File: decode content
    if meta.get("encoding") == "base64":
        raw = base64.b64decode(meta["content"].replace("\n", ""))
        return json.loads(raw.decode("utf-8"))
    # Too large — use blob API
    blob_url = f"{GH_API}/repos/{DATA_REPO}/git/blobs/{meta['sha']}"
    r = requests.get(blob_url, headers=gh_headers(), timeout=15)
    r.raise_for_status()
    blob = r.json()
    raw = base64.b64decode(blob["content"].replace("\n", ""))
    return json.loads(raw.decode("utf-8"))


def gh_list_dir(path: str) -> list[dict]:
    items = gh_get(path)
    if not isinstance(items, list):
        return []
    return items


# ─── DB helpers ───────────────────────────────────────────────────────────────

def get_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASSWORD,
    )


def upsert_team(cur, slug: str, team: dict, players: list, dry_run: bool):
    team_json = json.dumps(team, ensure_ascii=False)
    players_json = json.dumps(players, ensure_ascii=False)
    team_id = team.get("id", slug)
    owner_id = team.get("ownerId", "")

    if dry_run:
        print(f"    [dry] UPSERT footsim_teams slug={slug} players={len(players)}")
        return

    cur.execute("""
        INSERT INTO footsim_teams (id, slug, owner_id, data, updated_at)
        VALUES (%s, %s, %s, %s, NOW())
        ON CONFLICT (slug) DO UPDATE SET
            data = EXCLUDED.data,
            owner_id = EXCLUDED.owner_id,
            updated_at = NOW()
    """, (team_id, slug, owner_id, team_json))

    cur.execute("""
        INSERT INTO footsim_players (team_slug, data, updated_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (team_slug) DO UPDATE SET
            data = EXCLUDED.data,
            updated_at = NOW()
    """, (slug, players_json))


def upsert_match(cur, match_id: str, match: dict, dry_run: bool):
    match_json = json.dumps(match, ensure_ascii=False)
    if dry_run:
        print(f"    [dry] UPSERT footsim_matches id={match_id}")
        return
    cur.execute("""
        INSERT INTO footsim_matches (id, data, created_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data
    """, (match_id, match_json))


def upsert_competition(cur, comp: dict, dry_run: bool):
    comp_id = comp.get("id", "")
    comp_json = json.dumps(comp, ensure_ascii=False)
    summary = {
        "id": comp.get("id"),
        "name": comp.get("name"),
        "format": comp.get("format"),
        "status": comp.get("status"),
        "teamCount": len(comp.get("teamIds", [])),
        "createdAt": comp.get("createdAt"),
        "winner": comp.get("winner"),
        "year": comp.get("year"),
        "teamIds": comp.get("teamIds", []),
        "kind": comp.get("kind"),
        "scope": comp.get("scope"),
        "importance": comp.get("importance"),
    }
    summary_json = json.dumps(summary, ensure_ascii=False)

    if dry_run:
        print(f"    [dry] UPSERT footsim_competitions id={comp_id} name={comp.get('name')}")
        return

    cur.execute("""
        INSERT INTO footsim_competitions (id, data, updated_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    """, (comp_id, comp_json))

    cur.execute("""
        INSERT INTO footsim_competition_index (id, data, updated_at)
        VALUES (%s, %s, NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    """, (comp_id, summary_json))


def upsert_league(cur, league_id: str, nation_slug: str, league: dict, dry_run: bool):
    league_json = json.dumps(league, ensure_ascii=False)
    if dry_run:
        print(f"    [dry] UPSERT footsim_leagues id={league_id} nation={nation_slug}")
        return
    cur.execute("""
        INSERT INTO footsim_leagues (id, nation_slug, data, updated_at)
        VALUES (%s, %s, %s, NOW())
        ON CONFLICT (id) DO UPDATE SET
            data = EXCLUDED.data,
            nation_slug = EXCLUDED.nation_slug,
            updated_at = NOW()
    """, (league_id, nation_slug, league_json))


# ─── Migration tasks ──────────────────────────────────────────────────────────

def migrate_teams(cur, dry_run: bool):
    print("\n── Teams ──────────────────────────────────────────")
    team_dirs = gh_list_dir("data/teams")
    ok = skip = err = 0

    for entry in team_dirs:
        if entry["type"] != "dir":
            continue
        slug = entry["name"]
        print(f"  {slug}...", end=" ", flush=True)

        team = gh_read_json(f"data/teams/{slug}/team.json")
        if not team:
            print("SKIP (no team.json)")
            skip += 1
            continue

        players = gh_read_json(f"data/teams/{slug}/players.json") or []

        # recentMatches saved separately in matches — strip to keep team row lean
        team_clean = {k: v for k, v in team.items() if k != "recentMatches"}

        try:
            upsert_team(cur, slug, team_clean, players, dry_run)
            print(f"OK ({len(players)} players)")
            ok += 1
        except Exception as e:
            print(f"ERROR: {e}")
            err += 1

    print(f"\nTeams: {ok} ok, {skip} skipped, {err} errors")
    return err == 0


def migrate_competitions(cur, dry_run: bool):
    print("\n── Competitions ────────────────────────────────────")
    files = gh_list_dir("data/competitions")
    ok = skip = err = 0

    for entry in files:
        if entry["type"] != "file" or not entry["name"].endswith(".json"):
            continue
        if entry["name"] == "index.json":
            continue  # rebuilt from individual files

        comp_id = entry["name"].replace(".json", "")
        print(f"  {comp_id}...", end=" ", flush=True)

        comp = gh_read_json(f"data/competitions/{comp_id}.json")
        if not comp:
            print("SKIP")
            skip += 1
            continue

        try:
            upsert_competition(cur, comp, dry_run)
            print(f"OK ({comp.get('name', '?')})")
            ok += 1
        except Exception as e:
            print(f"ERROR: {e}")
            err += 1

    print(f"\nCompetitions: {ok} ok, {skip} skipped, {err} errors")
    return err == 0


def migrate_leagues(cur, dry_run: bool):
    print("\n── Leagues ─────────────────────────────────────────")
    nation_dirs = gh_list_dir("data/leagues")
    ok = skip = err = 0

    for nation_entry in nation_dirs:
        if nation_entry["type"] != "dir":
            continue
        nation_slug = nation_entry["name"]
        league_files = gh_list_dir(f"data/leagues/{nation_slug}")

        for entry in league_files:
            if entry["type"] != "file" or not entry["name"].endswith(".json"):
                continue
            league_id = f"{nation_slug}/{entry['name'].replace('.json', '')}"
            print(f"  {league_id}...", end=" ", flush=True)

            league = gh_read_json(f"data/leagues/{nation_slug}/{entry['name']}")
            if not league:
                print("SKIP")
                skip += 1
                continue

            try:
                upsert_league(cur, league_id, nation_slug, league, dry_run)
                print("OK")
                ok += 1
            except Exception as e:
                print(f"ERROR: {e}")
                err += 1

    print(f"\nLeagues: {ok} ok, {skip} skipped, {err} errors")
    return err == 0


def migrate_match_history(cur, dry_run: bool):
    """Extract recentMatches embedded in team.json and save full match files if they exist."""
    print("\n── Match history (embedded in teams) ───────────────")
    team_dirs = gh_list_dir("data/teams")
    ok = skip = 0

    for entry in team_dirs:
        if entry["type"] != "dir":
            continue
        slug = entry["name"]
        team = gh_read_json(f"data/teams/{slug}/team.json")
        if not team or not team.get("recentMatches"):
            continue

        for rm in team["recentMatches"]:
            match_id = rm.get("matchId", "")
            if not match_id:
                continue
            # Check if full match file exists
            match_data = gh_read_json(f"data/matches/{match_id}.json")
            if match_data:
                try:
                    upsert_match(cur, match_id, match_data, dry_run)
                    ok += 1
                except Exception:
                    pass
            else:
                skip += 1

    print(f"Matches: {ok} upserted, {skip} no file (summary only in team.json)")


# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Migrate FootSim data from GitHub to PostgreSQL")
    parser.add_argument("--dry-run", action="store_true", help="Print what would be done, don't write")
    parser.add_argument("--only", choices=["teams", "competitions", "leagues", "matches"], help="Run only one section")
    parser.add_argument("--pat", help="GitHub PAT (overrides env GITHUB_PAT)")
    parser.add_argument("--db-password", help="DB password (overrides env DB_PASSWORD)")
    args = parser.parse_args()

    global GITHUB_PAT, DB_PASSWORD
    if args.pat:
        GITHUB_PAT = args.pat
    if args.db_password:
        DB_PASSWORD = args.db_password

    if not GITHUB_PAT:
        print("ERROR: GITHUB_PAT required (--pat or env var)", file=sys.stderr)
        sys.exit(1)

    print(f"{'[DRY RUN] ' if args.dry_run else ''}Migrating {DATA_REPO}@{DATA_BRANCH} → {DB_USER}@{DB_HOST}:{DB_PORT}/{DB_NAME}")

    conn = get_conn()
    conn.autocommit = False
    cur = conn.cursor()

    try:
        only = args.only
        success = True

        if not only or only == "teams":
            success &= migrate_teams(cur, args.dry_run)

        if not only or only == "competitions":
            success &= migrate_competitions(cur, args.dry_run)

        if not only or only == "leagues":
            success &= migrate_leagues(cur, args.dry_run)

        if not only or only == "matches":
            migrate_match_history(cur, args.dry_run)

        if not args.dry_run:
            conn.commit()
            print("\n✅ Committed.")
        else:
            conn.rollback()
            print("\n[dry run] Rolled back — no changes written.")

        if not success:
            print("⚠️  Some items had errors. Check output above.", file=sys.stderr)
            sys.exit(1)

    except Exception as e:
        conn.rollback()
        print(f"\n❌ Fatal: {e}", file=sys.stderr)
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
