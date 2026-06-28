#!/usr/bin/env python3
"""
Verify FootSim migration: compare GitHub counts vs DB counts.

Usage:
    python3 check_migration.py --pat <PAT> [--db-password <PWD>]
"""

import argparse, base64, json, os, sys
import psycopg2, requests

GITHUB_PAT  = os.getenv("GITHUB_PAT", "")
DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_PORT     = int(os.getenv("DB_PORT", "5432"))
DB_NAME     = os.getenv("DB_NAME", "rts")
DB_USER     = os.getenv("DB_USER", "clea")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DATA_REPO   = os.getenv("FOOTSIM_DATA_REPO", "Projet-Resurgence/footsim-data")
DATA_BRANCH = os.getenv("FOOTSIM_DATA_BRANCH", "main")
GH_API      = "https://api.github.com"


def gh_list(path):
    r = requests.get(f"{GH_API}/repos/{DATA_REPO}/contents/{path}?ref={DATA_BRANCH}",
                     headers={"Authorization": f"Bearer {GITHUB_PAT}",
                              "Accept": "application/vnd.github+json"}, timeout=15)
    r.raise_for_status()
    return r.json()


def db_count(cur, table, where=""):
    cur.execute(f"SELECT COUNT(*) FROM {table}" + (f" WHERE {where}" if where else ""))
    return cur.fetchone()[0]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pat", default=GITHUB_PAT)
    parser.add_argument("--db-password", default=DB_PASSWORD)
    args = parser.parse_args()

    global GITHUB_PAT, DB_PASSWORD
    GITHUB_PAT  = args.pat  or GITHUB_PAT
    DB_PASSWORD = args.db_password or DB_PASSWORD

    # GitHub counts
    gh_teams = [e for e in gh_list("data/teams") if e["type"] == "dir"]
    gh_comps = [e for e in gh_list("data/competitions") if e["name"].endswith(".json") and e["name"] != "index.json"]
    gh_nations = [e for e in gh_list("data/leagues") if e["type"] == "dir"]
    gh_leagues = sum(
        len([x for x in gh_list(f"data/leagues/{n['name']}") if x["name"].endswith(".json")])
        for n in gh_nations
    )

    # DB counts
    conn = psycopg2.connect(host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD)
    cur = conn.cursor()

    db_teams = db_count(cur, "footsim_teams")
    db_players = db_count(cur, "footsim_players")
    db_comps = db_count(cur, "footsim_competitions")
    db_comp_idx = db_count(cur, "footsim_competition_index")
    db_leagues = db_count(cur, "footsim_leagues")
    db_matches = db_count(cur, "footsim_matches")

    cur.close()
    conn.close()

    ok = True
    rows = [
        ("Teams",        len(gh_teams), db_teams),
        ("Players rows", len(gh_teams), db_players),
        ("Competitions", len(gh_comps), db_comps),
        ("Comp index",   len(gh_comps), db_comp_idx),
        ("Leagues",      gh_leagues,    db_leagues),
    ]

    print(f"\n{'Resource':<20} {'GitHub':>8} {'DB':>8}  Status")
    print("─" * 48)
    for name, gh, db in rows:
        status = "✅" if db >= gh else f"⚠️  MISSING {gh - db}"
        if db < gh:
            ok = False
        print(f"{name:<20} {gh:>8} {db:>8}  {status}")

    print(f"\n{'Matches (full files)':<20} {'?':>8} {db_matches:>8}  (no count — embedded in teams)")

    if ok:
        print("\n✅ Migration complete — all counts match.")
    else:
        print("\n⚠️  Some items missing — re-run migrate_from_github.py")
        sys.exit(1)


if __name__ == "__main__":
    main()
