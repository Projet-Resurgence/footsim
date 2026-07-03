import { useState } from 'react';
import { createPortal } from 'react-dom';
import { POSITION_LABEL, TACTIC_STYLE_LABEL } from '@/lib/types';
import type { MatchState, TacticMods } from '@/lib/sim/types';
import { generateTacticalReport } from '@/lib/report/tacticalReport';
import type { ReportSide, TacticalReport } from '@/lib/report/tacticalReport';
import { useSession } from '@/stores/session';

type Props = {
  state: MatchState;
  home: ReportSide;
  away: ReportSide;
  onClose: () => void;
};

export function TacticalReportModal({ state, home, away, onClose }: Props) {
  // Non-admin : le compte-rendu est réservé au camp que le joueur manage —
  // jamais celui de l'équipe adverse. Admin : les deux onglets.
  const session = useSession((s) => s.session);
  const isAdmin = useSession((s) => s.isAdmin());
  const mySide: 'home' | 'away' | null =
    home.team.managerDiscordId && home.team.managerDiscordId === session?.id ? 'home'
    : away.team.managerDiscordId && away.team.managerDiscordId === session?.id ? 'away'
    : null;
  const lockedSide = isAdmin ? null : mySide;
  const [side, setSide] = useState<'home' | 'away'>(lockedSide ?? 'home');

  if (!isAdmin && !mySide) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
          <h2 className="font-display text-xl">Compte-rendu tactique</h2>
          <p className="text-sm text-muted">
            Le compte-rendu tactique est réservé aux managers des équipes de ce match.
          </p>
          <button onClick={onClose} className="text-sm text-accent hover:underline">Fermer</button>
        </div>
      </div>,
      document.body,
    );
  }

  const effectiveSide = lockedSide ?? side;
  const report = generateTacticalReport(state, home, away, effectiveSide);

  // Portal vers <body> : la modale est rendue depuis une carte animée (transform
  // framer-motion) — sans portal, le position:fixed est piégé dans la carte
  // (containing block) et les matchs voisins se superposent à la pop-up.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 border-b border-border bg-bg">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-xl truncate">Compte-rendu tactique</h2>
            <div className="text-xs text-muted mt-0.5">
              {report.partial ? 'Analyse à la mi-temps' : 'Analyse post-match'} · {report.teamName} vs {report.oppName}
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-text text-xl leading-none shrink-0">✕</button>
        </div>

        {/* onglets adverses seulement pour l'admin — un manager ne voit que son camp */}
        {!lockedSide && (
          <div className="flex gap-2 px-5 pt-4">
            <SideTab label={home.team.name} active={effectiveSide === 'home'} onClick={() => setSide('home')} />
            <SideTab label={away.team.name} active={effectiveSide === 'away'} onClick={() => setSide('away')} />
          </div>
        )}

        <div className="p-5 space-y-5">
          <Verdict report={report} />

          <Section title="Points forts" icon={<IconCheck />}>
            <List items={report.strengths} tone="pos" />
          </Section>

          <Section title="Points faibles" icon={<IconWarning />}>
            <List items={report.weaknesses} tone="neg" />
          </Section>

          <div className="grid gap-4 sm:grid-cols-2 sm:items-start" style={{ gridAutoRows: '1fr' }}>
            <Section title="Meilleurs joueurs" subtitle={report.teamName} icon={<IconStar />}>
              <PlayerList entries={report.bestPlayers} />
            </Section>
            <Section title="Moins performants" subtitle={report.teamName} icon={<IconTrendDown />}>
              <PlayerList entries={report.worstPlayers} />
            </Section>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 sm:items-start" style={{ gridAutoRows: '1fr' }}>
            <Section title="Meilleurs joueurs adverses" subtitle={report.oppName} icon={<IconStar />}>
              <PlayerList entries={report.bestOppPlayers} />
            </Section>
            <Section title="Points faibles adverses" subtitle={report.oppName} icon={<IconTarget />}>
              <PlayerList entries={report.worstOppPlayers} />
            </Section>
          </div>

          <Section title="Axes d'amélioration" icon={<IconWrench />}>
            <List items={report.improvements} tone="neutral" />
          </Section>

          {report.counterTactic && (
            <Section title="Tactique proposée" icon={<IconCompass />}>
              <div className="rounded-md border border-accent/30 bg-accent/5 p-3 text-sm space-y-3">
                <div>
                  <div className="flex items-center gap-2 font-medium mb-1">
                    {report.counterTactic.savedTactic && (
                      <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] uppercase tracking-widest text-accent shrink-0">
                        Sauvegardée
                      </span>
                    )}
                    <span className="truncate">
                      {report.counterTactic.savedTactic?.name ?? `${report.counterTactic.formation} · ${TACTIC_STYLE_LABEL[report.counterTactic.style]}`}
                    </span>
                  </div>
                  <div className="text-muted">{report.counterTactic.text}</div>
                </div>
                <ModsGrid mods={report.counterTactic.customMods} />
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SideTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-t-md px-4 py-2 text-sm font-medium transition-colors ${
        active ? 'bg-surface border border-b-0 border-border text-text' : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}

function Verdict({ report }: { report: TacticalReport }) {
  const tone = report.verdict.worked === true ? 'pos' : report.verdict.worked === false ? 'neg' : 'neutral';
  const icon = report.verdict.worked === true ? <IconTrendUp /> : report.verdict.worked === false ? <IconTrendDown /> : <IconDash />;
  return (
    <div className={`rounded-md border p-3 text-sm ${toneClasses(tone)}`}>
      <div className="flex items-center gap-1.5 font-medium mb-1">{icon} Verdict tactique</div>
      <div>{report.verdict.text}</div>
    </div>
  );
}

function Section({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-widest text-muted mb-0.5">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{title}</span>
      </div>
      {subtitle && <div className="text-[10px] text-muted/60 truncate mb-1.5">{subtitle}</div>}
      {!subtitle && <div className="mb-1.5" />}
      <div className="flex-1">{children}</div>
    </div>
  );
}

function toneClasses(tone: 'pos' | 'neg' | 'neutral') {
  if (tone === 'pos') return 'border-accent/30 bg-accent/5';
  if (tone === 'neg') return 'border-danger/30 bg-danger/5';
  return 'border-border bg-bg';
}

function List({ items, tone }: { items: string[]; tone: 'pos' | 'neg' | 'neutral' }) {
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className={`flex items-start gap-2 rounded-md border p-2 text-sm ${toneClasses(tone)}`}>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function PlayerList({ entries }: { entries: TacticalReport['worstPlayers'] }) {
  if (entries.length === 0) return <p className="text-xs text-muted py-2">Aucune donnée disponible.</p>;
  return (
    <div className="space-y-1">
      {entries.map((p) => (
        <div key={p.playerId} className="flex items-center gap-2 text-xs rounded-md border border-border p-2">
          <span className="rounded bg-border/40 px-1.5 py-0.5 font-mono text-[10px] shrink-0">
            {POSITION_LABEL[p.position as keyof typeof POSITION_LABEL] ?? p.position}
          </span>
          <span className="flex-1 truncate font-medium">{p.playerName}</span>
          <span className="tabular-nums text-warning font-bold">{p.rating.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

const MOD_LABEL: Record<keyof TacticMods, string> = {
  shotFreqMult: 'Fréquence de tirs',
  midfieldMult: 'Contrôle milieu',
  attackMult: 'Impact attaque',
  foulRateMult: 'Intensité / fautes',
  defenseMult: 'Solidité défensive',
};

function ModsGrid({ mods }: { mods: TacticMods }) {
  const entries = Object.entries(mods) as [keyof TacticMods, number][];
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {entries.map(([key, value]) => {
        const pct = Math.round((value - 1) * 100);
        // Fewer fouls is the good outcome, not more — invert sign/tone for foulRateMult
        // so a +30% raw increase (bad) reads as "-30%" in red, matching the manual editor.
        const invert = key === 'foulRateMult';
        const displayPct = invert ? -pct : pct;
        const sign = displayPct > 0 ? '+' : '';
        const tone = displayPct > 2 ? 'text-accent' : displayPct < -2 ? 'text-danger' : 'text-muted';
        return (
          <div key={key} className="rounded border border-border/60 bg-bg px-2 py-1.5">
            <div className="text-[9px] uppercase tracking-widest text-muted truncate">{MOD_LABEL[key]}</div>
            <div className={`text-sm font-bold tabular-nums ${tone}`}>{sign}{displayPct}%</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Icons (inline SVG, 14×14, currentColor) ─────────────────────────────────

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function IconCheck() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconWarning() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function IconStar() {
  return (
    <svg {...ICON_PROPS}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function IconTrendDown() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
      <polyline points="16 17 22 17 22 11" />
    </svg>
  );
}

function IconTrendUp() {
  return (
    <svg {...ICON_PROPS}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function IconTarget() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" />
    </svg>
  );
}

function IconWrench() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M14.7 6.3a4 4 0 0 0-5.66 4.6L2.3 17.6a1 1 0 0 0 0 1.42l2.68 2.68a1 1 0 0 0 1.42 0l6.7-6.74a4 4 0 0 0 4.6-5.66l-2.4 2.4-2.83-2.83Z" />
    </svg>
  );
}

function IconCompass() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="12" cy="12" r="9" />
      <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" />
    </svg>
  );
}

function IconDash() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}
