import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import { useCredentials } from '@/stores/credentials';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { listTeams, loadTeam } from '@/lib/github/store';
import { POSITION_LABEL, CULTURE_LABEL } from '@/lib/types';
import type { Team, Position } from '@/lib/types';
import type { CompHistoryEntry, CompetitionKind, CompetitionScope } from '@/lib/competition/types';
import type { RecentMatchSummary } from '@/lib/github/matches';

// ─── Points system ────────────────────────────────────────────────────────────

const RESULT_BASE: Record<CompHistoryEntry['result'], number> = {
  winner: 100,
  finalist: 60,
  third: 40,
  semi: 25,
  participant: 10,
};

const SCOPE_MULT: Record<CompetitionScope, number> = {
  internationale: 2.0,
  continentale: 1.6,
  nationale: 1.2,
  regionale: 1.0,
  autre: 0.8,
};

const KIND_MULT: Record<CompetitionKind, number> = {
  officielle: 1.5,
  amicale: 0.8,
};

function entryPoints(entry: CompHistoryEntry): number {
  const base = RESULT_BASE[entry.result] ?? 10;
  const scope = SCOPE_MULT[entry.scope ?? 'autre'];
  const kind = KIND_MULT[entry.kind ?? 'amicale'];
  return Math.round(base * scope * kind);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type MatchResult = 'W' | 'D' | 'L';

type TeamRankEntry = {
  team: Team;
  points: number;
  wins: number;
  finals: number;
  thirds: number;
  participations: number;
  form: MatchResult[]; // last 5, most recent last
};

type PlayerEntry = {
  player: { id: string; firstName: string; lastName: string; position: string; overall: number };
  team: Team;
};

type Tab = 'equipes' | 'joueurs' | 'explications';

// ─── Result label ─────────────────────────────────────────────────────────────

const RESULT_LABEL: Record<CompHistoryEntry['result'], string> = {
  winner: 'Vainqueur',
  finalist: 'Finaliste',
  third: '3e place',
  semi: 'Demi-finale',
  participant: 'Participant',
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClassementsCMF() {
  const pat = useCredentials((s) => s.githubPat);
  const { pat: effectivePat } = useBackendArgs();
  const token = pat ?? effectivePat ?? null;
  const location = useLocation();
  const isPublicRoute = location.pathname === '/classements-cmf';

  const [tab, setTab] = useState<Tab>('equipes');
  const [loading, setLoading] = useState(true);
  const [teamEntries, setTeamEntries] = useState<TeamRankEntry[]>([]);
  const [playerEntries, setPlayerEntries] = useState<PlayerEntry[]>([]);

  // player filters
  const [posFilter, setPosFilter] = useState<string>('all');
  const [playerLimit, setPlayerLimit] = useState(50);

  useEffect(() => {
    async function load() {
      try {
        const teams = await listTeams(token);
        const rankEntries: TeamRankEntry[] = [];
        const players: PlayerEntry[] = [];

        // listTeams already reads full team.json (including recentMatches + compHistory)
        // Only call loadTeam for players roster
        await Promise.all(
          teams.map(async (team) => {
            const roster = await loadTeam(team.slug, token);

            // Players
            for (const p of roster?.players ?? []) {
              players.push({ player: p, team });
            }

            // Team points: palmarès bonus + match points
            const history = team.compHistory ?? [];
            let points = 0;
            let wins = 0, finals = 0, thirds = 0;
            for (const entry of history) {
              points += entryPoints(entry);
              if (entry.result === 'winner') wins++;
              else if (entry.result === 'finalist') finals++;
              else if (entry.result === 'third') thirds++;
            }

            const recent: RecentMatchSummary[] = team.recentMatches ?? [];
            for (const m of recent) {
              points += m.cmfPoints ?? 0;
            }
            points = Math.round(points * 10) / 10;

            // recentMatches[0] = most recent — display oldest→newest left→right
            const form: MatchResult[] = recent.slice(0, 5).reverse().map((m) =>
              m.scoreFor > m.scoreAgainst ? 'W' : m.scoreFor === m.scoreAgainst ? 'D' : 'L',
            );

            rankEntries.push({
              team,
              points,
              wins,
              finals,
              thirds,
              participations: history.length,
              form,
            });
          }),
        );

        rankEntries.sort((a, b) => b.points - a.points || b.wins - a.wins || b.finals - a.finals);
        players.sort((a, b) => b.player.overall - a.player.overall);

        setTeamEntries(rankEntries);
        setPlayerEntries(players);
      } catch (err) {
        toast('error', String(err));
      } finally {
        setLoading(false);
      }
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const positions = ['all', ...Array.from(new Set(playerEntries.map((e) => e.player.position)))];
  const filteredPlayers = posFilter === 'all'
    ? playerEntries
    : playerEntries.filter((e) => e.player.position === posFilter);
  const shownPlayers = filteredPlayers.slice(0, playerLimit);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Classements CMF</h1>
          <p className="mt-1 text-muted text-sm">
            Classements officiels de la Confédération Mondiale du Football.
          </p>
        </div>
        {isPublicRoute && (
          <Link to="/my-team" className="text-sm text-muted hover:text-text transition-colors shrink-0">
            ← Retour
          </Link>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([['equipes', 'Meilleures équipes'], ['joueurs', 'Meilleurs joueurs'], ['explications', 'Explications']] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'equipes' && (
        <TeamRanking entries={teamEntries} />
      )}

      {tab === 'explications' && (
        <ExplicationsTab />
      )}

      {tab === 'joueurs' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs"
            >
              <option value="all">Tous les postes</option>
              {positions.filter((p) => p !== 'all').map((p) => (
                <option key={p} value={p}>{POSITION_LABEL[p as keyof typeof POSITION_LABEL] ?? p}</option>
              ))}
            </select>
            <span className="text-xs text-muted">{filteredPlayers.length} joueurs</span>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-bg text-left text-xs text-muted uppercase tracking-wide">
                <tr>
                  <th className="px-3 py-2 w-10 text-center">#</th>
                  <th className="px-4 py-2">Joueur</th>
                  <th className="px-4 py-2">Poste</th>
                  <th className="px-4 py-2">Nationalité</th>
                  <th className="px-4 py-2">Culture</th>
                  <th className="px-3 py-2 text-right font-bold">OVR</th>
                </tr>
              </thead>
              <tbody>
                {shownPlayers.map((e, idx) => {
                  const { player, team } = e;
                  const rank = idx + 1;
                  const rankColor =
                    rank === 1 ? 'text-yellow-500 font-bold' :
                    rank === 2 ? 'text-zinc-400 font-bold' :
                    rank === 3 ? 'text-orange-500 font-bold' :
                    'text-muted';
                  return (
                    <tr key={player.id} className="border-t border-border hover:bg-border/10 transition-colors">
                      <td className={`px-3 py-2.5 text-center tabular-nums text-sm ${rankColor}`}>{rank}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium">{player.firstName} {player.lastName}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="rounded bg-border/40 px-2 py-0.5 font-mono text-xs">
                          {POSITION_LABEL[player.position as Position]}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2 min-w-0">
                          {team.flag && (
                            <img src={team.flag} alt="" className="h-5 w-5 rounded-sm object-cover shrink-0" />
                          )}
                          <span className="truncate max-w-[120px] text-sm">{team.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted text-xs">
                        {CULTURE_LABEL[team.culture] ?? team.culture}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums font-bold text-accent">{player.overall}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filteredPlayers.length > playerLimit && (
            <div className="text-center">
              <button
                onClick={() => setPlayerLimit((l) => l + 50)}
                className="rounded-md border border-border px-4 py-2 text-sm text-muted hover:text-text transition-colors"
              >
                Afficher plus ({filteredPlayers.length - playerLimit} restants)
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Explications tab ─────────────────────────────────────────────────────────

function ExplicationsTab() {
  return (
    <div className="space-y-8 text-sm max-w-3xl">

      <section className="space-y-3">
        <h2 className="font-display text-2xl">Principe général</h2>
        <p className="text-muted leading-relaxed">
          Le classement CMF (Confédération Mondiale du Football) attribue des points aux équipes selon deux sources :
          leurs <strong className="text-text">performances en match</strong> (jusqu'aux 20 derniers matchs de compétition)
          et leurs <strong className="text-text">résultats finals</strong> dans chaque compétition (palmarès).
          Le score total est la somme des deux.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Points par match</h2>
        <p className="text-muted leading-relaxed">
          Chaque match de compétition simulé rapporte des points selon la formule :
        </p>
        <div className="rounded-lg border border-border bg-surface p-4 font-mono text-xs leading-relaxed">
          pts = base × multiplicateur_portée × multiplicateur_statut × facteur_adversaire
        </div>

        <div className="space-y-4">
          <div>
            <div className="font-medium mb-2">Base selon le résultat</div>
            <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
              <thead className="bg-bg text-muted uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Résultat</th>
                  <th className="px-4 py-2 text-right">Points de base</th>
                </tr>
              </thead>
              <tbody>
                {[['Victoire', '3'], ['Match nul', '1'], ['Défaite', '0']].map(([r, p]) => (
                  <tr key={r} className="border-t border-border">
                    <td className="px-4 py-2">{r}</td>
                    <td className="px-4 py-2 text-right font-bold text-accent">{p}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="font-medium mb-2">Multiplicateur de portée</div>
            <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
              <thead className="bg-bg text-muted uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Portée</th>
                  <th className="px-4 py-2 text-right">Multiplicateur</th>
                </tr>
              </thead>
              <tbody>
                {[['Internationale', '×2.0'], ['Continentale', '×1.6'], ['Nationale', '×1.2'], ['Régionale', '×1.0'], ['Autre', '×0.8']].map(([s, m]) => (
                  <tr key={s} className="border-t border-border">
                    <td className="px-4 py-2">{s}</td>
                    <td className="px-4 py-2 text-right font-bold text-accent">{m}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="font-medium mb-2">Multiplicateur de statut</div>
            <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
              <thead className="bg-bg text-muted uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Statut</th>
                  <th className="px-4 py-2 text-right">Multiplicateur</th>
                </tr>
              </thead>
              <tbody>
                {[['Officielle', '×1.5'], ['Amicale', '×0.8']].map(([k, m]) => (
                  <tr key={k} className="border-t border-border">
                    <td className="px-4 py-2">{k}</td>
                    <td className="px-4 py-2 text-right font-bold text-accent">{m}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="font-medium mb-2">Facteur adversaire</div>
            <p className="text-muted leading-relaxed mb-2">
              Inspiré du classement FIFA : battre une équipe forte rapporte plus, perdre contre une équipe faible coûte plus.
              Calculé depuis la force globale de l'adversaire (1–100) :
            </p>
            <div className="rounded-lg border border-border bg-surface p-4 font-mono text-xs">
              facteur = √(force_adverse / 50) — clampé entre 0.5 et 2.0
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
              <div className="rounded border border-border bg-surface px-3 py-2 text-center">
                <div className="font-bold text-text">×0.71</div>
                <div>Force 25</div>
              </div>
              <div className="rounded border border-border bg-surface px-3 py-2 text-center">
                <div className="font-bold text-text">×1.00</div>
                <div>Force 50</div>
              </div>
              <div className="rounded border border-border bg-surface px-3 py-2 text-center">
                <div className="font-bold text-text">×1.41</div>
                <div>Force 100</div>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-xs text-muted leading-relaxed">
          <strong className="text-text">Exemple :</strong> Victoire contre une équipe force 80 dans une compétition internationale officielle :<br />
          <span className="font-mono">3 × 2.0 × 1.5 × √(80/50) = 3 × 2.0 × 1.5 × 1.265 ≈ <strong className="text-accent">11.4 pts</strong></span>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Bonus palmarès</h2>
        <p className="text-muted leading-relaxed">
          En plus des points match, chaque résultat final dans une compétition rapporte un bonus permanent (non limité aux 20 derniers) :
        </p>
        <table className="w-full text-xs border border-border rounded-lg overflow-hidden">
          <thead className="bg-bg text-muted uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left">Résultat final</th>
              <th className="px-4 py-2 text-right">Base</th>
              <th className="px-4 py-2 text-right">Exemple (Internationale Officielle)</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Vainqueur', '100', '300'],
              ['Finaliste', '60', '180'],
              ['3e place', '40', '120'],
              ['Demi-finale', '25', '75'],
              ['Participant', '10', '30'],
            ].map(([r, b, ex]) => (
              <tr key={r} className="border-t border-border">
                <td className="px-4 py-2">{r}</td>
                <td className="px-4 py-2 text-right font-bold text-accent">{b}</td>
                <td className="px-4 py-2 text-right text-muted">{ex}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted">
          Les mêmes multiplicateurs portée × statut s'appliquent. Portée internationale officielle = ×2.0 × 1.5 = ×3.0.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl">Forme (5 derniers matchs)</h2>
        <p className="text-muted leading-relaxed">
          La colonne Forme affiche les 5 derniers matchs de compétition simulés.
          Les matchs 1v1 hors compétition ne sont pas comptabilisés — seuls les matchs sauvegardés
          dans une compétition active ou terminée apparaissent.
        </p>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="2,8 6,12 14,4" /></svg>
            <span>Victoire</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" className="w-4 h-4 text-yellow-400" fill="currentColor"><rect x="2" y="7" width="12" height="2" rx="1" /></svg>
            <span>Match nul</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg viewBox="0 0 16 16" className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="3" x2="13" y2="13" /><line x1="13" y1="3" x2="3" y2="13" /></svg>
            <span>Défaite</span>
          </div>
        </div>
      </section>

    </div>
  );
}

// ─── Form icons ───────────────────────────────────────────────────────────────

function FormIcon({ result }: { result: MatchResult }) {
  if (result === 'W') {
    return (
      <svg viewBox="0 0 16 16" className="w-4 h-4 text-green-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Victoire">
        <polyline points="2,8 6,12 14,4" />
      </svg>
    );
  }
  if (result === 'L') {
    return (
      <svg viewBox="0 0 16 16" className="w-4 h-4 text-red-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-label="Défaite">
        <line x1="3" y1="3" x2="13" y2="13" />
        <line x1="13" y1="3" x2="3" y2="13" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="w-4 h-4 text-yellow-400 shrink-0" fill="currentColor" aria-label="Match nul">
      <rect x="2" y="7" width="12" height="2" rx="1" />
    </svg>
  );
}

// ─── Team ranking sub-component ───────────────────────────────────────────────

function TeamRanking({ entries }: { entries: TeamRankEntry[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-12 text-center text-muted">
        Aucune équipe avec historique de compétitions.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-bg text-left text-xs text-muted uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 w-10 text-center">#</th>
            <th className="px-4 py-2">Équipe</th>
            <th className="px-3 py-2 text-center">🏆</th>
            <th className="px-3 py-2 text-center">🥈</th>
            <th className="px-3 py-2 text-center">🥉</th>
            <th className="px-3 py-2 text-center">Participations</th>
            <th className="px-3 py-2 text-center">Forme</th>
            <th className="px-3 py-2 text-right font-bold">Points</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, idx) => {
            const rank = idx + 1;
            const rankColor =
              rank === 1 ? 'text-yellow-500 font-bold' :
              rank === 2 ? 'text-zinc-400 font-bold' :
              rank === 3 ? 'text-orange-500 font-bold' :
              'text-muted';
            const isOpen = expanded === e.team.id;
            const history = e.team.compHistory ?? [];

            return (
              <>
                <tr
                  key={e.team.id}
                  className="border-t border-border hover:bg-border/10 transition-colors cursor-pointer"
                  onClick={() => history.length > 0 && setExpanded(isOpen ? null : e.team.id)}
                >
                  <td className={`px-3 py-2.5 text-center tabular-nums text-sm ${rankColor}`}>{rank}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {e.team.flag && (
                        <img src={e.team.flag} alt="" className="h-6 w-6 rounded-sm object-cover shrink-0" />
                      )}
                      <span className="font-medium truncate">{e.team.name}</span>
                      {history.length > 0 && (
                        <span className="text-xs text-muted ml-1">{isOpen ? '▲' : '▼'}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{e.wins || '—'}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{e.finals || '—'}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums">{e.thirds || '—'}</td>
                  <td className="px-3 py-2.5 text-center tabular-nums text-muted">{e.participations}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-0.5">
                      {e.form.length === 0
                        ? <span className="text-xs text-muted">—</span>
                        : e.form.map((r, i) => <FormIcon key={i} result={r} />)
                      }
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-bold text-accent">{e.points}</td>
                </tr>
                {isOpen && (
                  <tr key={`${e.team.id}-detail`} className="border-t border-border bg-bg/50">
                    <td />
                    <td colSpan={6} className="px-4 py-3">
                      <div className="space-y-1">
                        {history.map((entry, i) => (
                          <div key={i} className="flex items-center justify-between text-xs text-muted gap-4">
                            <span className="font-medium text-text truncate max-w-[200px]">{entry.compName}</span>
                            <span>{entry.year ?? '—'}</span>
                            <span className="capitalize">{entry.scope ?? 'autre'}</span>
                            <span>{entry.kind ?? 'amicale'}</span>
                            <span className="font-medium text-accent">{RESULT_LABEL[entry.result]}</span>
                            <span className="tabular-nums text-accent font-bold">+{entryPoints(entry)} pts</span>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
