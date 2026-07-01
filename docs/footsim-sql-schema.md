# FootSim — Full 3NF SQL Schema Design

Replaces the 6 `data TEXT` JSON-blob tables with a fully relational schema.
Target: every queryable/joinable field is a real indexed column; nested arrays &
maps become child tables (no JSON columns).

Source of truth for shapes: `src/lib/types.ts`, `src/lib/competition/types.ts`,
`src/lib/sim/types.ts`, `src/lib/gen/coach.ts`, `src/lib/competition/press.ts`,
`src/lib/competition/injuries.ts`. Validated against the live data export
(`backups/footsim_json_export_*`).

Live volumes: 57 teams, 28 500 players (500/team), 16 standalone matches,
25 competitions (up to 280 comp-matches each), 1 league.

Legend: **PK**, *FK*, `idx` = indexed.

---

## 1. Teams domain

### footsim_teams
`id` **PK** varchar(64) · `slug` varchar(128) UNIQUE `idx` · `name` · `flag` text
(base64 PNG) · `culture` · `continent` (deprecated) · `kind` · `league_id` `idx`
· `global_strength` int · `created_at` ts · `created_by` · `owner_id` `idx` ·
`player_count` int · `formation` · `published_at` ts? · `manager_discord_id`? ·
`coach_suspended` bool · `jersey_color`? · `match_outcome`? ·
`action_foot_rating` int? · `action_foot_funding` numeric? · `active_tactic_id`? ·
`updated_at` ts

- **footsim_team_continents** — *team_id*, `continent`, ordinal · PK(team_id,continent)
- **footsim_team_cultures** — *team_id*, `culture`, `weight` numeric · PK(team_id,culture)

### footsim_coaches (1:1 team)
*team_id* **PK** · `id` · `first_name` · `last_name` · `culture` · `overall` int ·
`motivation` `tactique` `offensive` `defensif` `mentalite` `gestion` int ·
`legacy_trait`?
- **footsim_coach_traits** — *team_id*, `trait`, `polarity`('positive'|'negative'), ordinal

### Tactics (covers active `tactics` + `savedTactics[]`)
**footsim_tactics** — `pk` bigserial **PK** · *team_id* `idx` · `kind`('active'|'saved')
· `saved_id`? · `saved_name`? · `style` · `formation` · `formation_label`? ·
`active_custom_style_id`? · ordinal · UNIQUE(team_id,kind,saved_id)
- **footsim_tactic_lineup** — *tactic_pk*, ordinal, `player_id` · PK(tactic_pk,ordinal)
- **footsim_tactic_bench** — *tactic_pk*, ordinal, `player_id`
- **footsim_tactic_planned_subs** — *tactic_pk*, ordinal, `out_id`,`in_id`,`minute`?
- **footsim_tactic_position_map** — *tactic_pk*, `player_id`,`position` · PK(tactic_pk,player_id)
- **footsim_tactic_token_positions** — *tactic_pk*, `player_id`,`x`,`y` numeric · PK(tactic_pk,player_id)

**footsim_custom_styles** — `pk` **PK** · `owner_kind`('team'|'tactic') · `owner_pk`
· `style_id` · `name` · `shot_freq_mult`,`foul_rate_mult`,`midfield_mult`,`attack_mult`,`defense_mult` numeric

### Players
**footsim_players** — `id` **PK** · *team_id* `idx` · `first_name` · `last_name` ·
`age` int · `position` `idx` · `preferred_foot` · `overall` int `idx` · `club_id`? ·
`ordinal` int · **23 outfield stat cols** (passing…marking, vision…work_rate,
pace…jumping) · **6 GK stat cols** (gk_reflexes…gk_throwing) nullable ·
idx(team_id,position), idx(team_id,overall desc)
- **footsim_player_alt_positions** — *player_id*, ordinal, `position`

### Team carried-over history / state
- **footsim_team_comp_history** — *team_id*, ordinal, comp_id, comp_name, year?, format, kind?, scope?, importance?, result, phase?, participant_count?, finish_rank?, cmf_zone_bonus?
- **footsim_team_recent_matches** — *team_id*, ordinal, match_id, played_at, opponent_slug, opponent_name, home_away, home_team_id?, away_team_id?, score_for, score_against, cmf_points?, opponent_strength?, comp_kind?, comp_scope?, comp_importance?, participant_count?
  - **footsim_team_recent_match_scorers** — *(team_id,recent_ordinal)*, ordinal, minute, player_id, player_name, assist_id?, assist_name?
  - **footsim_team_recent_match_cards** — *(team_id,recent_ordinal)*, ordinal, minute, player_id, player_name, type
- **footsim_team_injuries** — *team_id*, id, player_id, player_name, cause, severity, matches_remaining, description, round_occurred
- **footsim_team_suspensions** — *team_id*, id, subject_id, subject_name, matches_remaining, reason, round_occurred

---

## 2. Matches domain (de-duplicated — no embedded rosters)

### footsim_matches
`id` **PK** · `comp_id`? *FK* `idx` · `home_team_id` `idx` · `away_team_id` `idx` ·
`played_at` ts · `speed` · `status` · `minute`,`half`,`added_time`,`home_added_time`,`away_added_time` int ·
`score_home`,`score_away` int · `penalty_home`?,`penalty_away`? · `leg1_home`?,`leg1_away`? ·
`possession_home`,`possession_away`,`possession_ticks_home`,`possession_ticks_away` int ·
counter pairs (shots, shots_on_target, saves, passes, fouls, corners, offsides,
freekicks, dribbles, clearances, key_passes)_home/away int · `xg_home`,`xg_away` numeric ·
`coach_ejected_home`,`coach_ejected_away` bool · rules (no_offside,max_subs,golden_goal,extra_time,penalties) ·
`home_subs`,`away_subs` int · corruption(side?,bribe?,accepted?,honored?,refused?) · `ball_x`,`ball_y` numeric

- **footsim_match_events** — *match_id* `idx`, `event_id` int, minute, half, type, side?, player_id?, assist_id?, replaced_id?, text, ball_x?, ball_y? · PK(match_id,event_id)
- **footsim_match_side_lists** — *match_id*, side, `list_kind`('onPitch'|'bench'|'availableBench'|'yellowCards'|'redCards'|'matchInjuries'), ordinal, player_id
- **footsim_match_player_counts** — *match_id*, player_id, `kind`('keyPasses'|'saves'|'dribbles'|'clearances'), value int · PK(match_id,player_id,kind)
- **footsim_match_input_sides** — *match_id*, side, formation, formation_label?, tactic_style?, morale?, has_tactic? + its own lineup/bench/plannedSubs/positionMap/tokenPositions/unavailable child tables (mirror of Tactics)

> The de-dup: `match.home/away.team` + `.players` (full rosters, ~1.2 MB/match) are
> dropped — rebuilt from `footsim_teams`/`footsim_players` on GET via the team refs.

---

## 3. Competitions domain

### footsim_competitions
`id` **PK** · name · format · year? · kind? · scope? · importance? · current_round int ·
status · created_at ts · winner? · host_team_id? · manual_third? · draw_revealed bool ·
cmf_debut_generated bool · config(legs_per_match,third_place_match,groups_count?,qualify_per_group?,best_thirds?) ·
match_rules(5) · knockout_rules(5)? · updated_at
> `footsim_competition_index` is **dropped** — `CompetitionSummary[]` is derived from
> this table (+ team-id count) via a thin query / SQL VIEW `footsim_competition_summary`.

- **footsim_competition_team_ids** — *comp_id*, ordinal, team_id · PK(comp_id,team_id)
- **footsim_competition_disqualified** — *comp_id*, team_id
- **footsim_competition_team_snapshot** — *comp_id*, team_id, name, flag text, slug?, global_strength? · PK(comp_id,team_id)
- **footsim_competition_morale** — *comp_id*, team_id, morale int · PK(comp_id,team_id)
- **footsim_competition_groups** — *comp_id*, group_id, name · PK(comp_id,group_id)
  - **footsim_competition_group_teams** — *(comp_id,group_id)*, ordinal, team_id
- **footsim_competition_standings** — *comp_id*, team_id, played,won,drawn,lost,goals_for,goals_against,points int · PK(comp_id,team_id) · idx(comp_id,points desc)
- **footsim_competition_player_stats** — *comp_id*, player_id, player_name, team_id, team_name, overall, position, goals,assists,clean_sheets,saves,yellow_cards,red_cards int, avg_rating numeric, motm_count int · PK(comp_id,player_id) · idx(comp_id,goals desc), idx(comp_id,assists desc)
  - **footsim_competition_player_match_ratings** — *(comp_id,player_id)*, ordinal, rating numeric
- **footsim_competition_awards** — *comp_id* **PK**, top_scorer?, top_assister?, best_gk?, best_player?
- **footsim_competition_injuries** / **_suspensions** — same cols as team injuries/suspensions
- **footsim_competition_pending** — *comp_id*, kind('presidencyRebound'|'refusalWalkover'|'cmfEnquete'|'drameHommage'), key_id, round int, match_id?, walkover_applied?

### Comp matches (bracket)
**footsim_comp_matches** — *comp_id*, `id`, home_team_id?, away_team_id?, home_from_match?,
away_from_match?, round int, phase, group_id?, leg int, status, result_home?,result_away?,
pen_home?,pen_away?, match_file_id?, simulated_at? · PK(comp_id,id) · idx(comp_id,round)
- **footsim_comp_match_summary** — *(comp_id,match_id)* **PK** · motm(player_id?,player_name?,team_id?,team_name?,rating?) · MatchStatSnapshot pairs (16 ×{home,away}) as columns
  - **footsim_comp_match_goals** — *(comp_id,match_id)*, side, ordinal, minute, player_id, player_name, assist_id?, assist_name?
  - **footsim_comp_match_cards** — *(comp_id,match_id)*, side, ordinal, minute, player_id, player_name, type

### ⚠️ Press (the heaviest sub-tree — see decision below)
**footsim_competition_press** — *comp_id*, id, round, team_id?, category, headline, body,
morale_before?, morale_after?, morale_shock?, morale_boost?, president_destitue?, created_at,
journalist_name?, journalist_outlet?, match_id?
- **footsim_press_mentions** — *(press pk)*, ordinal, type('player'|'coach'), name, overall, position?, + player stat-group rows / coach stat cols + trait rows
- **footsim_press_match_snapshots** — *(press pk)*, slot('main'|'extra'), ordinal, home/away team id+name+score, stat pairs, motm
- **footsim_press_cmf_snapshot** (+ favorite_teams, playoff_pairs child tables)

---

## 4. Leagues domain

**footsim_leagues** — id **PK**, nation_slug `idx`, name, created_at, created_by, owner_id
- **footsim_league_divisions** — *league_id*, division_id, name
- **footsim_league_clubs** — *division_id*, club_id, slug, name, logo text, culture, global_strength, formation (+ club_cultures, club_player_ids, club_tactics)
- **footsim_league_season** — *league_id* PK, status, start_date?, current_day int
  - **footsim_division_seasons** — schedule (MatchSlot[][]), results (Record), table (StandingsRow[]) → child tables

---

## Indexing summary
- Rankings/leaderboards: `idx(comp_id, points desc)`, `idx(comp_id, goals desc)`, `idx(comp_id, assists desc)`, `idx(players: team_id, overall desc)`.
- Lookups: unique `teams.slug`, `players.team_id`, `matches.comp_id`, `matches.home/away_team_id`, `leagues.nation_slug`, `comp_matches(comp_id,round)`.
- All FKs `ON DELETE CASCADE` so deleting a team/comp/match cleans its children in one statement.

## Table count
~55 tables. The relational **core** (teams, players+stats, matches+events,
competitions, comp_matches, standings, comp_player_stats, injuries, suspensions,
leagues) is ~30 and carries ~all query value. The **display/replay leaves**
(press sub-tree ~8 tables, match event stream, per-player tick maps, free-editor
token coords) are ~20 tables with near-zero relational query value.
