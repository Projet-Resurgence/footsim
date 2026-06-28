# FootSim — Migrations

## Fichiers

| Fichier | Rôle |
|---|---|
| `001_footsim_tables.sql` | DDL des 6 tables FootSim (idempotent — IF NOT EXISTS) |
| `migrate_from_github.py` | One-shot : copie toutes les données de `footsim-data` GitHub → PostgreSQL |
| `check_migration.py` | Vérifie les counts GitHub vs DB après migration |

## Tables créées

| Table | Contenu |
|---|---|
| `footsim_teams` | Métadonnées équipe (JSON blob) |
| `footsim_players` | Roster 500 joueurs par équipe (JSON blob) |
| `footsim_matches` | Fichiers match complets (JSON blob) |
| `footsim_leagues` | Ligues nationales (JSON blob) |
| `footsim_competitions` | Compétitions complètes (JSON blob) |
| `footsim_competition_index` | Résumés compétitions pour listing sans déserialiser |

## Créer les tables (env frais)

```bash
# Via psql dans le conteneur db
docker compose exec db psql -U clea -d rts -f /dev/stdin < migrations/001_footsim_tables.sql

# Ou via SQLAlchemy (déjà fait au boot pr-api via create_all)
docker compose exec pr-api python3 -c "
import sys; sys.path.insert(0, '/app/src/app'); sys.path.insert(0, '/app')
from database import init_database, db_config
init_database()
from controllers.footsim_controller import *
with db_config.engine.begin() as conn:
    for t in [FootSimTeam, FootSimPlayers, FootSimMatch, FootSimLeague, FootSimCompetition, FootSimCompetitionIndex]:
        t.__table__.create(bind=conn, checkfirst=True)
        print('OK', t.__tablename__)
"
```

## Migrer les données depuis GitHub

```bash
# Dans le conteneur pr-api (DB accessible via hostname 'db')
docker cp migrations/migrate_from_github.py projetresurgence-pr-api-1:/tmp/migrate.py

docker compose exec \
  -e GITHUB_PAT="ghp_xxx" \
  -e DB_HOST=db -e DB_PORT=5432 -e DB_NAME=rts \
  -e DB_USER=clea -e DB_PASSWORD=change_me_app_password \
  pr-api python3 /tmp/migrate.py

# Dry run d'abord :
# python3 /tmp/migrate.py --dry-run

# Seulement les équipes :
# python3 /tmp/migrate.py --only teams
```

## Vérifier la migration

```bash
docker cp migrations/check_migration.py projetresurgence-pr-api-1:/tmp/check.py

docker compose exec \
  -e GITHUB_PAT="ghp_xxx" \
  -e DB_HOST=db -e DB_NAME=rts -e DB_USER=clea -e DB_PASSWORD=change_me_app_password \
  pr-api python3 /tmp/check.py
```

## Objectif : supprimer GitHub backend

Une fois migration terminée + vérifiée :

1. Supprimer `src/lib/github/` (store, matches, competitions, leagues, api)
2. Supprimer `src/lib/idb/` (IndexedDB fallback)
3. Supprimer `src/stores/credentials.ts` (GitHub PAT)
4. Simplifier `useBackendArgs` — ne garder que `prApiToken`
5. Retirer `VITE_DATA_REPO`, `VITE_DATA_BRANCH`, `VITE_GITHUB_READ_TOKEN` des env vars
6. Mettre `VITE_PR_API_URL` obligatoire partout
