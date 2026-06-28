import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';

import { prapi } from '@/lib/prapi/client';
import { POSITION_LABEL, CULTURE_LABEL, CONTINENT_LABEL } from '@/lib/types';
import type { Continent, Formation } from '@/lib/types';
import type { Team, Position, Player } from '@/lib/types';
import { PlayerView } from '@/components/team/PlayerView';
import { pickXI } from '@/lib/sim/lineup';
import { TacticPitch } from '@/components/team/TeamTacticCard';

// ─── Types ───────────────────────────────────────────────────────────────────

type MatchResult = 'W' | 'D' | 'L';

type CompHistoryResult = 'winner' | 'finalist' | 'third' | 'semi' | 'quarter' | 'round16' | 'round32' | 'round64' | 'participant';

type RecentMatchSummary = {
  scoreFor: number;
  scoreAgainst: number;
  opponentName: string;
  homeAway: 'home' | 'away';
  compKind?: string;
  compScope?: string;
  compImportance?: string;
  participantCount?: number;
  opponentStrength?: number;
  cmfPoints?: number;
  playedAt: string;
};

// ─── CMF point formulas (display only) ───────────────────────────────────────

const CMF_MATCH_LIMIT = 10;

const RESULT_BASE: Record<CompHistoryResult, number> = {
  winner: 100, finalist: 65, third: 45, semi: 30,
  quarter: 22, round16: 16, round32: 11, round64: 8, participant: 8,
};
const SCOPE_MULT: Record<string, number> = { internationale: 1.5, continentale: 1.3, regionale: 1.0, autre: 0.8 };
const KIND_MULT: Record<string, number> = { officielle: 1.0, amicale: 0.2 };
const IMPORTANCE_MULT: Record<string, number> = { mineur: 0.4, regional: 0.6, tournoi: 0.8, prestige: 1.1, continental: 1.4, mondial: 2.0 };
const KIND_MATCH_MULT: Record<string, number> = { officielle: 1.5, amicale: 0.8 };
const SCOPE_MATCH_MULT: Record<string, number> = { internationale: 1.5, continentale: 1.3, regionale: 1.0, autre: 0.8 };
const IMPORTANCE_MATCH_MULT: Record<string, number> = { mineur: 0.4, regional: 0.6, tournoi: 0.8, prestige: 1.1, continental: 1.4, mondial: 2.0 };

function participantSizeMult(count?: number): number {
  if (!count) return 1.0;
  if (count <= 2) return 0.20;
  if (count <= 4) return 0.40;
  if (count <= 8) return 0.80;
  if (count <= 16) return 1.20;
  if (count <= 32) return 1.50;
  return 2.00;
}

function goalDiffBonus(sf: number, sa: number): number {
  const gap = sf - sa;
  if (gap >= 4) return 1.0;
  if (gap >= 2) return 0.5;
  if (gap >= 1) return 0.0;
  const loss = -gap;
  if (loss >= 5) return -2.0;
  if (loss >= 3) return -1.0;
  if (loss >= 2) return -0.5;
  return 0.0;
}

function entryPoints(entry: { result?: string; scope?: string; kind?: string; importance?: string; participantCount?: number }): number {
  const base = RESULT_BASE[(entry.result as CompHistoryResult) ?? 'participant'] ?? 8;
  const scope = SCOPE_MULT[entry.scope ?? 'autre'] ?? 0.8;
  const kind = KIND_MULT[entry.kind ?? 'amicale'] ?? 0.2;
  const importance = IMPORTANCE_MULT[entry.importance ?? 'tournoi'] ?? 0.8;
  const size = participantSizeMult(entry.participantCount);
  return Math.round(base * scope * kind * importance * size);
}

function matchPoints(m: RecentMatchSummary): number {
  if (m.opponentStrength == null) return m.cmfPoints ?? 0;
  const { scoreFor: sf, scoreAgainst: sa, opponentStrength: opp = 50 } = m;
  const kind = KIND_MATCH_MULT[m.compKind ?? 'amicale'] ?? 0.8;
  const scope = SCOPE_MATCH_MULT[m.compScope ?? 'autre'] ?? 0.8;
  const importance = IMPORTANCE_MATCH_MULT[m.compImportance ?? 'tournoi'] ?? 0.8;
  const oppFactor = Math.min(2.5, Math.max(0.4, (opp / 50) ** 0.75));
  const size = participantSizeMult(m.participantCount);
  const base = sf > sa ? 3 : sf === sa ? 1 : -1;
  const bonus = goalDiffBonus(sf, sa);
  return Math.round((base * scope * kind * importance * oppFactor * size + bonus) * 10) / 10;
}

type TeamRankEntry = {
  team: Team;
  points: number;
  wins: number;
  finals: number;
  thirds: number;
  participations: number;
  form: MatchResult[];
};

type PlayerEntry = {
  player: { id: string; firstName: string; lastName: string; position: string; overall: number };
  team: Team;
};

type Tab = 'equipes' | 'joueurs' | 'explications';

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClassementsCMF({ embedded }: { embedded?: boolean }) {
  const location = useLocation();
  const isPublicRoute = !embedded && location.pathname === '/classements-cmf';

  const [tab, setTab] = useState<Tab>('equipes');
  const [loading, setLoading] = useState(true);
  const [pageLoading, setPageLoading] = useState(false);
  const [teamEntries, setTeamEntries] = useState<TeamRankEntry[]>([]);
  const [viewingPlayer, setViewingPlayer] = useState<Player | null>(null);
  const [pagination, setPagination] = useState({ page: 1, per_page: 100, total: 0, pages: 1 });

  // team filters
  const [continentFilter, setContinentFilter] = useState<Continent | 'all'>('all');

  // player tab state
  const [playerPage, setPlayerPage] = useState(1);
  const [playerPageLoading, setPlayerPageLoading] = useState(false);
  const [playerEntries, setPlayerEntries] = useState<PlayerEntry[]>([]);
  const [playerPagination, setPlayerPagination] = useState({ page: 1, per_page: 100, total: 0, pages: 1 });
  const [posFilter, setPosFilter] = useState<string>('all');
  const [playerTabLoaded, setPlayerTabLoaded] = useState(false);

  async function loadTeamPage(page: number, isInitial = false) {
    if (isInitial) setLoading(true); else setPageLoading(true);
    try {
      const data = await prapi.rankings(page, 100);
      setTeamEntries(data.teams as TeamRankEntry[]);
      setPagination(data.pagination);
    } catch (err) {
      toast('error', String(err));
    } finally {
      if (isInitial) setLoading(false); else setPageLoading(false);
    }
  }

  async function loadPlayerPage(page: number, position?: string) {
    setPlayerPageLoading(true);
    try {
      const data = await prapi.rankingsPlayers(page, 100, position === 'all' ? undefined : position);
      setPlayerEntries(data.players.map((p) => ({
        player: p as unknown as PlayerEntry['player'],
        team: { slug: p.teamSlug, name: p.teamName, flag: p.teamFlag, culture: p.culture } as unknown as Team,
      })));
      setPlayerPagination(data.pagination);
      setPlayerPage(page);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setPlayerPageLoading(false);
      setPlayerTabLoaded(true);
    }
  }

  useEffect(() => { loadTeamPage(1, true); }, []);

  // Lazy-load players tab on first open
  useEffect(() => {
    if (tab === 'joueurs' && !playerTabLoaded) {
      loadPlayerPage(1);
    }
  }, [tab]);

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  const ALL_POSITIONS = ['GK','CB','LB','RB','DM','CM','AM','LM','RM','LW','RW','ST'];


  return (
    <>
    <div className="max-w-5xl space-y-6 min-w-0">
      {!embedded && (
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
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border overflow-x-auto scrollbar-none">
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
        <TeamRanking
          entries={teamEntries}
          continentFilter={continentFilter}
          onContinentFilter={setContinentFilter}
          pagination={pagination}
          pageLoading={pageLoading}
          onPageChange={(p) => loadTeamPage(p)}
        />
      )}

      {tab === 'explications' && (
        <ExplicationsTab />
      )}

      {tab === 'joueurs' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={posFilter}
              onChange={(e) => { setPosFilter(e.target.value); loadPlayerPage(1, e.target.value); }}
              className="h-8 rounded-md border border-border bg-surface px-2 text-xs"
            >
              <option value="all">Tous les postes</option>
              {ALL_POSITIONS.map((p) => (
                <option key={p} value={p}>{POSITION_LABEL[p as keyof typeof POSITION_LABEL] ?? p}</option>
              ))}
            </select>
            {playerPagination.total > 0 && (
              <span className="text-xs text-muted">{playerPagination.total} joueurs</span>
            )}
            {playerPageLoading && <Spinner className="h-4 w-4" />}
          </div>

          {!playerTabLoaded ? (
            <div className="flex justify-center py-12"><Spinner className="h-6 w-6" /></div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                <table className="w-full text-sm min-w-[400px]">
                  <thead className="bg-bg text-left text-xs text-muted uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 w-10 text-center">#</th>
                      <th className="px-3 py-2">Joueur</th>
                      <th className="px-3 py-2 hidden sm:table-cell">Poste</th>
                      <th className="px-3 py-2">Équipe</th>
                      <th className="px-3 py-2 hidden md:table-cell">Culture</th>
                      <th className="px-3 py-2 text-right font-bold">OVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {playerEntries.map((e, idx) => {
                      const { player, team } = e;
                      const rank = (playerPagination.page - 1) * playerPagination.per_page + idx + 1;
                      const rankColor =
                        rank === 1 ? 'text-yellow-500 font-bold' :
                        rank === 2 ? 'text-zinc-400 font-bold' :
                        rank === 3 ? 'text-orange-500 font-bold' :
                        'text-muted';
                      return (
                        <tr key={player.id} className="border-t border-border hover:bg-border/10 transition-colors cursor-pointer" onClick={() => setViewingPlayer(player as unknown as Player)}>
                          <td className={`px-3 py-2.5 text-center tabular-nums text-sm ${rankColor}`}>{rank}</td>
                          <td className="px-3 py-2.5">
                            <div className="font-medium leading-tight">{player.firstName} {player.lastName}</div>
                            <div className="sm:hidden text-xs text-muted mt-0.5">
                              <span className="rounded bg-border/40 px-1.5 py-0.5 font-mono">{POSITION_LABEL[player.position as Position]}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 hidden sm:table-cell">
                            <span className="rounded bg-border/40 px-2 py-0.5 font-mono text-xs">
                              {POSITION_LABEL[player.position as Position]}
                            </span>
                          </td>
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2 min-w-0">
                              {team.flag && (
                                <img src={team.flag} alt="" className="h-5 w-5 rounded-sm object-cover shrink-0" />
                              )}
                              <span className="truncate max-w-[100px] text-sm">{team.name}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-muted text-xs hidden md:table-cell">
                            {CULTURE_LABEL[team.culture] ?? team.culture}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-bold text-accent">{player.overall}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {playerPagination.pages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button
                    onClick={() => loadPlayerPage(playerPage - 1, posFilter)}
                    disabled={playerPage <= 1 || playerPageLoading}
                    className="px-3 py-1.5 rounded-md border border-border text-sm text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >←</button>
                  {Array.from({ length: playerPagination.pages }, (_, i) => i + 1).map((p) => (
                    <button
                      key={p}
                      onClick={() => loadPlayerPage(p, posFilter)}
                      disabled={playerPageLoading}
                      className={`w-8 h-8 rounded-md border text-sm transition-colors disabled:opacity-40 ${
                        p === playerPage ? 'border-accent bg-accent/10 text-accent font-bold' : 'border-border text-muted hover:text-text'
                      }`}
                    >{p}</button>
                  ))}
                  <button
                    onClick={() => loadPlayerPage(playerPage + 1, posFilter)}
                    disabled={playerPage >= playerPagination.pages || playerPageLoading}
                    className="px-3 py-1.5 rounded-md border border-border text-sm text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >→</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
    {viewingPlayer && (
      <PlayerView player={viewingPlayer} onClose={() => setViewingPlayer(null)} />
    )}
  </>
  );
}

// ─── Explications tab ─────────────────────────────────────────────────────────

function ExplicationsTab() {
  return (
    <div className="space-y-8 text-sm max-w-3xl min-w-0">

      <section className="space-y-3">
        <h2 className="font-display text-2xl">Principe général</h2>
        <p className="text-muted leading-relaxed">
          Le classement CMF (Confédération Mondiale du Football) attribue des points aux équipes selon deux sources :
          leurs <strong className="text-text">performances en match</strong> (jusqu'aux 10 derniers matchs de compétition)
          et leurs <strong className="text-text">résultats finals</strong> dans chaque compétition (palmarès).
          Le score total est la somme des deux.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Points par match</h2>
        <p className="text-muted leading-relaxed">
          Chaque match de compétition simulé rapporte des points selon la formule :
        </p>
        <div className="rounded-lg border border-border bg-surface p-4 font-mono text-xs leading-relaxed overflow-x-auto whitespace-nowrap">
          pts = base × mult_portée × mult_statut × mult_importance × facteur_adv × mult_participants + bonus_écart
        </div>

        <div className="space-y-4">
          <div>
            <div className="font-medium mb-2">Base selon le résultat</div>
            <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-xs min-w-[260px]">
              <thead className="bg-bg text-muted uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Résultat</th>
                  <th className="px-4 py-2 text-right">Points de base</th>
                </tr>
              </thead>
              <tbody>
                {[['Victoire', '3'], ['Match nul', '1'], ['Défaite', '−1']].map(([r, p]) => (
                  <tr key={r} className="border-t border-border">
                    <td className="px-4 py-2">{r}</td>
                    <td className="px-4 py-2 text-right font-bold text-accent">{p}</td>
                  </tr>
                ))}
                <tr className="border-t border-border bg-accent/5">
                  <td className="px-4 py-2 text-muted" colSpan={2}>
                    <span className="font-medium text-text">Bonus/malus écart de buts</span>
                    <div className="mt-1 space-y-0.5 text-xs">
                      <div>Victoire 2–3 buts → <span className="font-bold text-accent">+0.5 pt</span></div>
                      <div>Victoire 4+ buts → <span className="font-bold text-accent">+1.0 pt</span></div>
                      <div>Défaite 2 buts → <span className="font-bold text-danger">−0.5 pt</span></div>
                      <div>Défaite 3–4 buts → <span className="font-bold text-danger">−1.0 pt</span></div>
                      <div>Défaite 5+ buts → <span className="font-bold text-danger">−2.0 pts</span></div>
                      <div className="mt-1 text-muted">Le total CMF est clampé à 0</div>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table></div>
          </div>

          <div>
            <div className="font-medium mb-2">Multiplicateur de portée</div>
            <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-xs min-w-[260px]">
              <thead className="bg-bg text-muted uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Portée</th>
                  <th className="px-4 py-2 text-right">Multiplicateur</th>
                </tr>
              </thead>
              <tbody>
                {[['Internationale', '×1.5'], ['Continentale', '×1.3'], ['Régionale', '×1.0'], ['Autre', '×0.8']].map(([s, m]) => (
                  <tr key={s} className="border-t border-border">
                    <td className="px-4 py-2">{s}</td>
                    <td className="px-4 py-2 text-right font-bold text-accent">{m}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          <div>
            <div className="font-medium mb-2">Multiplicateur de statut</div>
            <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-xs min-w-[260px]">
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
            </table></div>
          </div>

          <div>
            <div className="font-medium mb-2">Multiplicateur d'importance</div>
            <p className="text-muted leading-relaxed mb-2 text-xs">
              Défini manuellement sur chaque compétition. Permet de distinguer un tournoi mineur d'une Coupe du Monde.
              Si non défini, le niveau <strong className="text-text">Tournoi international</strong> s'applique par défaut (×0.8).
            </p>
            <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-xs min-w-[260px]">
              <thead className="bg-bg text-muted uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Importance</th>
                  <th className="px-4 py-2 text-left text-muted">Exemple</th>
                  <th className="px-4 py-2 text-right">Multiplicateur</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Mineur', 'Tournoi amical test', '×0.4'],
                  ['Régional', 'Coupe régionale officielle', '×0.6'],
                  ['Tournoi international', 'Tournoi entre sélections', '×0.8'],
                  ['Prestige (LPM)', 'Ligue Préliminaire Mondiale', '×1.1'],
                  ['Continental', 'Euro, CAN, Copa América…', '×1.4'],
                  ['Mondial', 'Coupe du Monde', '×2.0'],
                ].map(([imp, ex, m]) => (
                  <tr key={imp} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{imp}</td>
                    <td className="px-4 py-2 text-muted">{ex}</td>
                    <td className="px-4 py-2 text-right font-bold text-accent">{m}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>

          <div>
            <div className="font-medium mb-2">Facteur adversaire</div>
            <p className="text-muted leading-relaxed mb-2">
              Inspiré du classement FIFA et adapté au CMF : battre une équipe forte rapporte plus, perdre contre une équipe faible coûte plus.
              Calculé depuis la force globale de l'adversaire (1–100) — la même échelle que le classement CMF :
            </p>
            <div className="rounded-lg border border-border bg-surface p-4 font-mono text-xs">
              facteur = (force_adverse / 50)^0.75 — clampé entre 0.4 et 2.5
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted">
              <div className="rounded border border-border bg-surface px-3 py-2 text-center">
                <div className="font-bold text-text">×0.59</div>
                <div>Force 25</div>
              </div>
              <div className="rounded border border-border bg-surface px-3 py-2 text-center">
                <div className="font-bold text-text">×1.00</div>
                <div>Force 50</div>
              </div>
              <div className="rounded border border-border bg-surface px-3 py-2 text-center">
                <div className="font-bold text-text">×1.68</div>
                <div>Force 100</div>
              </div>
            </div>
          </div>

          <div>
            <div className="font-medium mb-2">Multiplicateur de participants</div>
            <p className="text-muted leading-relaxed mb-2">
              Plus une compétition regroupe d'équipes, plus elle est prestigieuse — et plus les points gagnés valent.
              Ce facteur valorise les performances dans les grands tournois face à des adversaires plus nombreux.
            </p>
            <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-xs min-w-[260px]">
              <thead className="bg-bg text-muted uppercase tracking-wide">
                <tr>
                  <th className="px-4 py-2 text-left">Nombre d'équipes</th>
                  <th className="px-4 py-2 text-left text-muted">Exemple</th>
                  <th className="px-4 py-2 text-right">Multiplicateur</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['2 équipes', '1v1 / duel direct', '×0.20'],
                  ['3–4 équipes', 'Mini-tournoi', '×0.40'],
                  ['5–8 équipes', 'Petit groupe', '×0.80'],
                  ['9–16 équipes', 'Championnat standard', '×1.20'],
                  ['17–32 équipes', 'Grand tournoi', '×1.50'],
                  ['33+ équipes', 'Compétition mondiale', '×2.00'],
                ].map(([n, ex, m]) => (
                  <tr key={n} className="border-t border-border">
                    <td className="px-4 py-2 font-medium">{n}</td>
                    <td className="px-4 py-2 text-muted">{ex}</td>
                    <td className="px-4 py-2 text-right font-bold text-accent">{m}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        </div>

        <div className="rounded-lg border border-accent/30 bg-accent/5 p-4 text-xs text-muted leading-relaxed space-y-2">
          <div>
            <strong className="text-text">Exemple :</strong> Victoire 3–0 vs force 80, CdM 32 éq. (Intl · Off · Mondial) :
            <div className="font-mono overflow-x-auto whitespace-nowrap mt-1">(3×1.5×1.2×2.0×(80/50)^0.75×1.30)+1.0 ≈ <strong className="text-accent">22.1 pts</strong></div>
          </div>
          <div>
            <strong className="text-text">Exemple :</strong> Défaite 0–3 vs force 60, amical 1v1 (Intl · Amicale · Tournoi) :
            <div className="font-mono overflow-x-auto whitespace-nowrap mt-1">max(0, 0×1.5×0.2×0.8×√(60/50)×0.70−1.0) = <strong className="text-accent">0 pt</strong></div>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Bonus palmarès</h2>
        <p className="text-muted leading-relaxed">
          En plus des points match, chaque résultat final dans une compétition rapporte un bonus permanent (non limité aux 10 derniers) :
        </p>
        <div className="overflow-x-auto rounded-lg border border-border"><table className="w-full text-xs min-w-[280px]">
          <thead className="bg-bg text-muted uppercase tracking-wide">
            <tr>
              <th className="px-4 py-2 text-left">Résultat</th>
              <th className="px-4 py-2 text-right">Base</th>
              <th className="px-4 py-2 text-right hidden sm:table-cell">Exemple ×1.98</th>
            </tr>
          </thead>
          <tbody>
            {[
              ['Vainqueur', '100', '198'],
              ['Finaliste', '65', '129'],
              ['3e place', '45', '89'],
              ['Demi-finale', '30', '59'],
              ['Quart de finale', '22', '44'],
              ['8e de finale', '16', '32'],
              ['16e de finale', '11', '22'],
              ['32e de finale', '8', '16'],
              ['Participant', '8', '16'],
            ].map(([r, b, ex]) => (
              <tr key={r} className="border-t border-border">
                <td className="px-4 py-2">{r}</td>
                <td className="px-4 py-2 text-right font-bold text-accent">{b}</td>
                <td className="px-4 py-2 text-right text-muted hidden sm:table-cell">{ex}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="text-xs text-muted">
          Les mêmes multiplicateurs portée × statut × importance × participants s'appliquent. Intl · Off · Prestige · 16 éq. = ×1.5 × 1.0 × 1.1 × 1.2 = ×1.98.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-2xl">Bonus de zone LPM</h2>
        <p className="text-muted leading-relaxed">
          À la clôture de la <strong className="text-text">Ligue Préliminaire Mondiale</strong>, chaque équipe reçoit un bonus CMF
          unique selon sa zone de classement final. Ces points s'ajoutent au classement CMF comme une entrée distincte
          (visible dans l'historique de l'équipe).
        </p>
        <div className="space-y-3">
          <div className="rounded-lg border border-yellow-400/40 bg-yellow-400/5 p-4 space-y-2">
            <div className="flex items-center gap-2 font-medium text-yellow-400">
              <span className="text-lg">★</span>
              <span>Zone Or — Rangs 1 à 24</span>
            </div>
            <p className="text-xs text-muted">Qualifiés directement. Bonus décroissant linéairement.</p>
            <div className="grid grid-cols-4 gap-2 text-xs mt-2">
              {[[1,80],[5,70],[10,57],[15,44],[20,31],[24,20]].map(([r,p]) => (
                <div key={r} className="rounded border border-border bg-surface px-2 py-1.5 text-center">
                  <div className="font-bold text-yellow-400">+{p} pts</div>
                  <div className="text-muted">{r === 24 ? '24e' : r === 1 ? '1er' : `${r}e`}</div>
                </div>
              ))}
            </div>
            <div className="font-mono text-xs text-muted mt-1">80 − (rang − 1) × (60 / 23)</div>
          </div>

          <div className="rounded-lg border border-orange-400/40 bg-orange-400/5 p-4 space-y-2">
            <div className="flex items-center gap-2 font-medium text-orange-400">
              <span className="text-lg">⚠</span>
              <span>Zone Rouge — Barrages A/R</span>
            </div>
            <p className="text-xs text-muted">Équipes ayant disputé les barrages de qualification.</p>
            <div className="grid grid-cols-2 gap-2 text-xs mt-2">
              <div className="rounded border border-border bg-surface px-3 py-2 text-center">
                <div className="font-bold text-accent">+8 pts</div>
                <div className="text-muted">Qualifié (barrage passé)</div>
              </div>
              <div className="rounded border border-border bg-surface px-3 py-2 text-center">
                <div className="font-bold text-danger">−5 pts</div>
                <div className="text-muted">Éliminé (barrage perdu)</div>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-red-900/40 bg-red-900/5 p-4 space-y-2">
            <div className="flex items-center gap-2 font-medium text-danger">
              <span className="text-lg">✕</span>
              <span>Zone Noire — Rangs 41 à 48</span>
            </div>
            <p className="text-xs text-muted">Éliminés en phase de groupes. Malus décroissant.</p>
            <div className="grid grid-cols-4 gap-2 text-xs mt-2">
              {[[41,-10],[43,-13],[45,-16],[48,-20]].map(([r,p]) => (
                <div key={r} className="rounded border border-border bg-surface px-2 py-1.5 text-center">
                  <div className="font-bold text-danger">{p} pts</div>
                  <div className="text-muted">{r === 41 ? '41e' : `${r}e`}</div>
                </div>
              ))}
            </div>
            <div className="font-mono text-xs text-muted mt-1">−10 − (rang − 41) × (10 / 7)</div>
          </div>
        </div>
        <p className="text-xs text-muted">
          Ces bonus sont distribués via le bouton <strong className="text-text">★ Points CMF LPM</strong> sur la page de la compétition une fois celle-ci terminée.
          Chaque équipe ne peut recevoir ce bonus qu'une seule fois par édition.
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

// ─── Expanded team detail ─────────────────────────────────────────────────────

const RESULT_BADGE: Record<CompHistoryResult, { label: string; cls: string }> = {
  winner:    { label: '🏆 Vainqueur',    cls: 'border-warning/50 bg-warning/10 text-warning' },
  finalist:  { label: '🥈 Finaliste',    cls: 'border-zinc-400/40 bg-zinc-400/10 text-zinc-300' },
  third:     { label: '🥉 3e place',     cls: 'border-orange-400/40 bg-orange-400/10 text-orange-300' },
  semi:      { label: 'Demi-finale',     cls: 'border-border bg-surface text-muted' },
  quarter:   { label: 'Quart de finale', cls: 'border-border bg-surface text-muted' },
  round16:   { label: '8e de finale',    cls: 'border-border bg-surface text-muted' },
  round32:   { label: '16e de finale',   cls: 'border-border bg-surface text-muted' },
  round64:   { label: '32e de finale',   cls: 'border-border bg-surface text-muted' },
  participant:{ label: 'Participant',    cls: 'border-border bg-surface text-muted' },
};

const SCOPE_SHORT: Record<string, string> = {
  internationale: 'Intl', continentale: 'Cont', nationale: 'Nat', regionale: 'Rég', autre: 'Autre',
};


function MatchList({ matches, label }: { matches: RecentMatchSummary[]; label: string }) {
  const total = matches.reduce((s, m) => s + matchPoints(m), 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-muted">{label}</span>
        <span className="text-xs tabular-nums text-accent font-bold">{total >= 0 ? '+' : ''}{Math.round(total * 10) / 10} pts</span>
      </div>
      {matches.length === 0 ? (
        <p className="text-xs text-muted py-1">Aucun match.</p>
      ) : (
        <div className="space-y-1">
          {matches.map((m, i) => {
            const won = m.scoreFor > m.scoreAgainst;
            const drew = m.scoreFor === m.scoreAgainst;
            const result: MatchResult = won ? 'W' : drew ? 'D' : 'L';
            const pts = matchPoints(m);
            return (
              <div key={i} className="flex items-center gap-2 text-xs">
                <FormIcon result={result} />
                <span className="font-mono tabular-nums shrink-0 text-muted w-8">{m.scoreFor}–{m.scoreAgainst}</span>
                <span className="truncate text-muted flex-1">vs {m.opponentName}</span>
                <span className="text-[10px] text-muted shrink-0">{m.homeAway === 'home' ? 'D' : 'E'}</span>
                <span className={`tabular-nums shrink-0 font-medium ${pts > 0 ? 'text-accent' : 'text-muted'}`}>
                  {pts > 0 ? `+${pts}` : pts}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function LineupSection({ players, formation, formationLabel, lineup, tokenPositions }: {
  players: Player[];
  formation: Formation;
  formationLabel?: string;
  lineup?: string[];
  tokenPositions?: Record<string, { x: number; y: number }>;
}) {
  const byId = new Map(players.map((p) => [p.id, p]));
  let starters: Player[];
  if (lineup && lineup.length === 11) {
    const resolved = lineup.map((id) => byId.get(id)).filter(Boolean) as Player[];
    starters = resolved.length === 11 ? resolved : pickXI(players, formation).lineup;
  } else {
    starters = pickXI(players, formation).lineup;
  }
  const starterIds = new Set(starters.map((p) => p.id));
  const bench = players.filter((p) => !starterIds.has(p.id)).sort((a, b) => b.overall - a.overall).slice(0, 12);

  return (
    <div className="space-y-3">
      <div className="mx-auto" style={{ maxWidth: 220 }}>
        <TacticPitch formation={formation} lineup={starters.map((p) => p.id)} players={starters} tokenPositions={tokenPositions} />
        <div className="text-center text-[10px] text-muted mt-1 uppercase tracking-widest">{formationLabel ?? formation}</div>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="bg-bg px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted flex items-center justify-between">
          <span>XI titulaires · {formation}</span>
          <span className="text-accent font-mono">{starters.length}/11</span>
        </div>
        <table className="w-full text-sm">
          <tbody>
            {starters.map((p, i) => (
              <tr key={p.id} className="border-t border-border">
                <td className="w-8 px-3 py-2 text-center text-xs text-muted tabular-nums">{i + 1}</td>
                <td className="px-3 py-2"><span className="rounded bg-border/40 px-1.5 py-0.5 font-mono text-xs">{POSITION_LABEL[p.position]}</span></td>
                <td className="px-3 py-2 font-medium">{p.firstName} {p.lastName}</td>
                <td className="px-3 py-2 text-right tabular-nums font-bold text-accent">{p.overall}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {bench.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="bg-bg px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted">Banc ({bench.length})</div>
          <table className="w-full text-sm">
            <tbody>
              {bench.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-3 py-2"><span className="rounded bg-border/40 px-1.5 py-0.5 font-mono text-xs">{POSITION_LABEL[p.position]}</span></td>
                  <td className="px-3 py-2 text-text/80">{p.firstName} {p.lastName}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">{p.overall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ExpandedTeamDetail({ entry }: { entry: TeamRankEntry }) {
  const history = entry.team.compHistory ?? [];
  const sorted = [...(entry.team.recentMatches ?? [])].sort((a, b) => b.playedAt.localeCompare(a.playedAt));
  const recentOfficial = sorted.filter((m) => m.compKind === 'officielle').slice(0, CMF_MATCH_LIMIT);
  const recentFriendly = sorted.filter((m) => m.compKind !== 'officielle').slice(0, CMF_MATCH_LIMIT);
  const palmaresTotal = history.reduce((s, e) => s + entryPoints(e), 0);

  const [lineup, setLineup] = useState<{
    players: Player[]; formation: Formation; formationLabel?: string;
    lineup?: string[]; tokenPositions?: Record<string, { x: number; y: number }>;
  } | null>(null);
  const [lineupLoading, setLineupLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLineupLoading(true);
    prapi.rankingsTeamLineup(entry.team.slug).then((data) => {
      if (!cancelled) setLineup(data);
    }).catch(() => {}).finally(() => { if (!cancelled) setLineupLoading(false); });
    return () => { cancelled = true; };
  }, [entry.team.slug]);

  return (
    <div className="space-y-5">
      {/* ── Palmarès + Matchs ── */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-muted">Palmarès</span>
            <span className="text-xs tabular-nums text-accent font-bold">+{Math.round(palmaresTotal)} pts bonus</span>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-muted py-2">Aucun résultat de compétition enregistré.</p>
          ) : (
            <div className="space-y-1.5">
              {[...history].sort((a, b) => (b.year ?? 0) - (a.year ?? 0)).map((e, i) => {
                const badge = RESULT_BADGE[e.result] ?? RESULT_BADGE.participant;
                const pts = entryPoints(e);
                return (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <span className="text-muted w-8 tabular-nums shrink-0">{e.year ?? '—'}</span>
                    <span className={`rounded border px-1.5 py-0.5 font-medium shrink-0 ${badge.cls}`}>{badge.label}</span>
                    <span className="truncate text-muted flex-1">{e.compName}</span>
                    <span className="text-[10px] text-muted shrink-0">{SCOPE_SHORT[e.scope ?? 'autre'] ?? e.scope}</span>
                    <span className="tabular-nums font-bold text-accent shrink-0">{pts > 0 ? '+' : ''}{pts}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <MatchList matches={recentOfficial} label="10 derniers matchs officiels" />
          {recentFriendly.length > 0 && (
            <>
              <div className="border-t border-border/40" />
              <MatchList matches={recentFriendly} label="10 derniers matchs amicaux" />
            </>
          )}
          {entry.form.length > 0 && (
            <div className="flex items-center gap-1 pt-1 border-t border-border">
              <span className="text-[10px] text-muted mr-1">Forme :</span>
              {entry.form.map((r, i) => <FormIcon key={i} result={r} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Lineup ── */}
      <div className="border-t border-border" />
      {lineupLoading ? (
        <div className="flex justify-center py-4"><Spinner className="h-5 w-5" /></div>
      ) : lineup && lineup.players.length > 0 ? (
        <LineupSection
          players={lineup.players}
          formation={lineup.formation}
          formationLabel={lineup.formationLabel}
          lineup={lineup.lineup}
          tokenPositions={lineup.tokenPositions}
        />
      ) : (
        <p className="text-xs text-muted text-center py-2">Aucun joueur enregistré.</p>
      )}
    </div>
  );
}

// ─── Team ranking sub-component ───────────────────────────────────────────────

function TeamRanking({ entries, continentFilter, onContinentFilter, pagination, pageLoading, onPageChange }: {
  entries: TeamRankEntry[];
  continentFilter: Continent | 'all';
  onContinentFilter: (c: Continent | 'all') => void;
  pagination: { page: number; per_page: number; total: number; pages: number };
  pageLoading: boolean;
  onPageChange: (page: number) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  // Collect continents present in data
  const availableContinents = Array.from(new Set(
    entries.flatMap((e) => e.team.continents ?? (e.team.continent ? [e.team.continent] : []))
  )) as Continent[];

  const filtered = continentFilter === 'all'
    ? entries
    : entries.filter((e) => {
        const conts = e.team.continents ?? (e.team.continent ? [e.team.continent] : []);
        return conts.includes(continentFilter);
      });

  const rankOffset = (pagination.page - 1) * pagination.per_page;
  const ranked = filtered.map((e, idx) => ({ ...e, rank: rankOffset + idx + 1 }));

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-surface p-12 text-center text-muted">
        Aucune équipe avec historique de compétitions.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {availableContinents.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted">Continent :</span>
          <button
            onClick={() => onContinentFilter('all')}
            className={`px-3 py-1 rounded-full text-xs border transition-colors ${continentFilter === 'all' ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-text'}`}
          >
            Tous
          </button>
          {availableContinents.map((c) => (
            <button
              key={c}
              onClick={() => onContinentFilter(c)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${continentFilter === c ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:text-text'}`}
            >
              {CONTINENT_LABEL[c]}
            </button>
          ))}
        </div>
      )}
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full text-sm min-w-[340px]">
        <thead className="bg-bg text-left text-xs text-muted uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 w-10 text-center">#</th>
            <th className="px-3 py-2">Équipe</th>
            <th className="px-2 py-2 text-center hidden sm:table-cell">🏆</th>
            <th className="px-2 py-2 text-center hidden sm:table-cell">🥈</th>
            <th className="px-2 py-2 text-center hidden sm:table-cell">🥉</th>
            <th className="px-2 py-2 text-center hidden md:table-cell">Partic.</th>
            <th className="px-2 py-2 text-center hidden sm:table-cell">Forme</th>
            <th className="px-3 py-2 text-right font-bold">Pts</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((e) => {
            const rank = e.rank;
            const rankColor =
              rank === 1 ? 'text-yellow-500 font-bold' :
              rank === 2 ? 'text-zinc-400 font-bold' :
              rank === 3 ? 'text-orange-500 font-bold' :
              'text-muted';
            const isOpen = expanded === e.team.id;

            return (
              <>
                <tr
                  key={e.team.id}
                  className="border-t border-border hover:bg-border/10 transition-colors cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : e.team.id)}
                >
                  <td className={`px-3 py-2.5 text-center tabular-nums text-sm ${rankColor}`}>{rank}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      {e.team.flag && (
                        <img src={e.team.flag} alt="" className="h-6 w-6 rounded-sm object-cover shrink-0" />
                      )}
                      <span className="font-medium truncate">{e.team.name}</span>
                      <span className="text-xs text-muted ml-1">{isOpen ? '▲' : '▼'}</span>
                    </div>
                    {/* mobile: form + palmarès séparés */}
                    <div className="sm:hidden flex items-center gap-1 mt-0.5">
                      {e.form.map((r, i) => <FormIcon key={i} result={r} />)}
                      {(e.wins > 0 || e.finals > 0 || e.thirds > 0) && (
                        <span className="text-[10px] text-muted ml-1 flex items-center gap-0.5">
                          {e.wins > 0 && <span>🏆{e.wins}</span>}
                          {e.finals > 0 && <span>🥈{e.finals}</span>}
                          {e.thirds > 0 && <span>🥉{e.thirds}</span>}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2.5 text-center tabular-nums hidden sm:table-cell">{e.wins || '—'}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums hidden sm:table-cell">{e.finals || '—'}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums hidden sm:table-cell">{e.thirds || '—'}</td>
                  <td className="px-2 py-2.5 text-center tabular-nums text-muted hidden md:table-cell">{e.participations}</td>
                  <td className="px-2 py-2.5 hidden sm:table-cell">
                    <div className="flex items-center justify-center gap-0.5">
                      {e.form.length === 0
                        ? <span className="text-xs text-muted">—</span>
                        : e.form.map((r, i) => <FormIcon key={i} result={r} />)
                      }
                    </div>
                  </td>
                  <td className="pl-4 pr-3 py-2.5 text-right tabular-nums font-bold text-accent">{e.points}</td>
                </tr>
                {isOpen && (
                  <tr key={`${e.team.id}-detail`} className="border-t border-border bg-bg/30">
                    <td />
                    <td colSpan={7} className="px-3 py-4">
                      <ExpandedTeamDetail entry={e} />
                    </td>
                  </tr>
                )}
              </>
            );
          })}
        </tbody>
      </table>
    </div>

    {/* Pagination */}
    {pagination.pages > 1 && (
      <div className="flex items-center justify-center gap-2 pt-2">
        <button
          onClick={() => onPageChange(pagination.page - 1)}
          disabled={pagination.page <= 1 || pageLoading}
          className="px-3 py-1.5 rounded-md border border-border text-sm text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          ←
        </button>
        {Array.from({ length: pagination.pages }, (_, i) => i + 1).map((p) => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            disabled={pageLoading}
            className={`w-8 h-8 rounded-md border text-sm transition-colors disabled:opacity-40 ${
              p === pagination.page
                ? 'border-accent bg-accent/10 text-accent font-bold'
                : 'border-border text-muted hover:text-text'
            }`}
          >
            {p}
          </button>
        ))}
        <button
          onClick={() => onPageChange(pagination.page + 1)}
          disabled={pagination.page >= pagination.pages || pageLoading}
          className="px-3 py-1.5 rounded-md border border-border text-sm text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          →
        </button>
        {pageLoading && <span className="text-xs text-muted ml-1">Chargement…</span>}
      </div>
    )}
    </div>
  );
}
