import { useEffect, useState } from 'react';
import type { CustomTacticStyle, Formation, PlanBRule, PlanBTrigger, PlannedSub, Player, Position, SavedTactic, SetPieceTakers, TacticStyle, Team, TeamTactics } from '@/lib/types';
import { PLAN_B_TRIGGER_LABEL, POSITION_LABEL, TACTIC_STYLE_LABEL, shortPlayerName } from '@/lib/types';
import { useTeams } from '@/stores/teams';
import { useBackendArgs } from '@/hooks/useBackendArgs';

const FOOT: Record<string, string> = { right: 'D', left: 'G', both: 'D/G' };
import type { TacticMods } from '@/lib/sim/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { pickXI } from '@/lib/sim/lineup';
import { getTacticMods } from '@/lib/sim/precompute';
import {
  customStyleProfile, formationProfile, styleProfile,
  FORMATION_MATCHUP, STYLE_MATCHUP,
  FORMATION_PROFILE_LABEL, FORMATION_PROFILE_DESC,
  STYLE_PROFILE_LABEL, STYLE_PROFILE_DESC,
} from '@/lib/sim/matchup';
import type { FormationProfile, StyleProfile } from '@/lib/sim/matchup';
import { FormationEditor } from './FormationEditor';
import type { FormationEditorResult } from './FormationEditor';

const FORMATIONS: Formation[] = ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2', '4-1-4-1', '3-4-3', '4-3-2-1', '4-5-1', '4-4-1-1', '3-4-1-2', '5-4-1', '3-6-1', '4-1-2-1-2', '3-4-2-1', '4-2-2-2', '4-2-4'];
const TACTIC_STYLES: TacticStyle[] = ['possession', 'tiki-taka', 'football-total', 'contre-attaque', 'direct', 'long-ball', 'ailes', 'pressing', 'gegenpressing', 'bloc-median', 'ultra-defensif', 'chaos'];

type SlotDef = { pos: string; x: number; y: number };

const FORMATION_LAYOUT: Record<Formation, SlotDef[]> = {
  '4-3-3': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'CM', x: 22, y: 50 }, { pos: 'CM', x: 50, y: 47 }, { pos: 'CM', x: 78, y: 50 },
    { pos: 'LW', x: 12, y: 23 }, { pos: 'ST', x: 50, y: 18 }, { pos: 'RW', x: 88, y: 23 },
  ],
  '4-4-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'LM', x: 8, y: 50 }, { pos: 'CM', x: 34, y: 49 }, { pos: 'CM', x: 66, y: 49 }, { pos: 'RM', x: 92, y: 50 },
    { pos: 'ST', x: 34, y: 20 }, { pos: 'ST', x: 66, y: 20 },
  ],
  '3-5-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 },
    { pos: 'LM', x: 8, y: 50 }, { pos: 'DM', x: 30, y: 60 }, { pos: 'CM', x: 50, y: 46 }, { pos: 'CM', x: 70, y: 50 }, { pos: 'RM', x: 92, y: 50 },
    { pos: 'ST', x: 34, y: 20 }, { pos: 'ST', x: 66, y: 20 },
  ],
  '4-2-3-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'DM', x: 34, y: 58 }, { pos: 'DM', x: 66, y: 58 },
    { pos: 'LW', x: 12, y: 35 }, { pos: 'AM', x: 50, y: 34 }, { pos: 'RW', x: 88, y: 35 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '5-3-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 6, y: 70 }, { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 }, { pos: 'RB', x: 94, y: 70 },
    { pos: 'CM', x: 24, y: 47 }, { pos: 'DM', x: 50, y: 60 }, { pos: 'CM', x: 76, y: 47 },
    { pos: 'ST', x: 34, y: 20 }, { pos: 'ST', x: 66, y: 20 },
  ],
  '4-1-4-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'DM', x: 50, y: 60 },
    { pos: 'LM', x: 8, y: 46 }, { pos: 'CM', x: 34, y: 45 }, { pos: 'CM', x: 66, y: 45 }, { pos: 'RM', x: 92, y: 46 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '3-4-3': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 },
    { pos: 'LM', x: 8, y: 51 }, { pos: 'CM', x: 34, y: 49 }, { pos: 'CM', x: 66, y: 49 }, { pos: 'RM', x: 92, y: 51 },
    { pos: 'LW', x: 12, y: 23 }, { pos: 'ST', x: 50, y: 18 }, { pos: 'RW', x: 88, y: 23 },
  ],
  '4-3-2-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'CM', x: 22, y: 57 }, { pos: 'CM', x: 50, y: 55 }, { pos: 'CM', x: 78, y: 57 },
    { pos: 'AM', x: 34, y: 34 }, { pos: 'AM', x: 66, y: 34 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '4-5-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'LM', x: 8, y: 46 }, { pos: 'CM', x: 28, y: 44 }, { pos: 'DM', x: 50, y: 60 }, { pos: 'CM', x: 72, y: 44 }, { pos: 'RM', x: 92, y: 46 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '4-4-1-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'LM', x: 8, y: 51 }, { pos: 'CM', x: 34, y: 50 }, { pos: 'CM', x: 66, y: 50 }, { pos: 'RM', x: 92, y: 51 },
    { pos: 'AM', x: 50, y: 30 },
    { pos: 'ST', x: 50, y: 16 },
  ],
  '3-4-1-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 },
    { pos: 'LM', x: 8, y: 52 }, { pos: 'CM', x: 34, y: 50 }, { pos: 'CM', x: 66, y: 50 }, { pos: 'RM', x: 92, y: 52 },
    { pos: 'AM', x: 50, y: 34 },
    { pos: 'ST', x: 34, y: 18 }, { pos: 'ST', x: 66, y: 18 },
  ],
  '5-4-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 6, y: 70 }, { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 }, { pos: 'RB', x: 94, y: 70 },
    { pos: 'LM', x: 8, y: 48 }, { pos: 'CM', x: 34, y: 46 }, { pos: 'CM', x: 66, y: 46 }, { pos: 'RM', x: 92, y: 48 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '3-6-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 },
    { pos: 'LM', x: 6, y: 47 }, { pos: 'DM', x: 24, y: 60 }, { pos: 'CM', x: 38, y: 44 }, { pos: 'CM', x: 62, y: 44 }, { pos: 'DM', x: 76, y: 60 }, { pos: 'RM', x: 94, y: 47 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '4-1-2-1-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'DM', x: 50, y: 60 },
    { pos: 'CM', x: 28, y: 47 }, { pos: 'CM', x: 72, y: 47 },
    { pos: 'AM', x: 50, y: 33 },
    { pos: 'ST', x: 34, y: 18 }, { pos: 'ST', x: 66, y: 18 },
  ],
  '3-4-2-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 },
    { pos: 'LM', x: 8, y: 52 }, { pos: 'CM', x: 34, y: 54 }, { pos: 'CM', x: 66, y: 54 }, { pos: 'RM', x: 92, y: 52 },
    { pos: 'AM', x: 34, y: 32 }, { pos: 'AM', x: 66, y: 32 },
    { pos: 'ST', x: 50, y: 16 },
  ],
  '4-2-2-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'DM', x: 34, y: 58 }, { pos: 'DM', x: 66, y: 58 },
    { pos: 'AM', x: 28, y: 36 }, { pos: 'AM', x: 72, y: 36 },
    { pos: 'ST', x: 34, y: 18 }, { pos: 'ST', x: 66, y: 18 },
  ],
  '4-2-4': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'CM', x: 34, y: 50 }, { pos: 'CM', x: 66, y: 50 },
    { pos: 'LW', x: 10, y: 22 }, { pos: 'ST', x: 36, y: 16 }, { pos: 'ST', x: 64, y: 16 }, { pos: 'RW', x: 90, y: 22 },
  ],
};

// ── Analyse tactique (matchups) ───────────────────────────────────────────────

/** Description football réel de chaque style prédéfini */
const STYLE_FLAVOR: Record<TacticStyle, string> = {
  possession: 'Conserver le ballon pour contrôler le rythme. Circulation patiente, milieu renforcé — moins de tirs, mais mieux préparés.',
  'tiki-taka': 'Passes courtes et triangles permanents (Barcelone 2009-12). Possession maximale qui épuise l\'adversaire, attaque parfois stérile.',
  'football-total': 'Permutations permanentes, tout le monde attaque et défend (Ajax 1974). Fort partout vers l\'avant, arrière-garde exposée.',
  'contre-attaque': 'Bloc qui recule puis projection éclair dans l\'espace. Peu de possession, mais des occasions franches en transition.',
  direct: 'Verticalité immédiate : moins de passes, plus de tirs. Volume d\'occasions maximal, qualité variable.',
  'long-ball': 'Longs ballons vers l\'attaquant cible en sautant le milieu. Punit les lignes hautes, pauvre en construction.',
  ailes: 'Débordements, centres et renversements d\'aile à aile. Le danger vient des couloirs et du jeu de tête — l\'axe est délaissé.',
  pressing: 'Récupération haute et organisée en bloc. Milieu adverse asphyxié, au prix de fautes plus fréquentes.',
  gegenpressing: 'Contre-pressing immédiat dans les 5 secondes après la perte (Klopp). Intensité et milieu dominants, cartons plus fréquents.',
  'bloc-median': 'Bloc compact entre les lignes, pièges à la récupération (Atlético de Simeone). Solide, discipliné, sobre devant.',
  'ultra-defensif': 'Bus garé devant la surface. Tirs très rares, défense verrouillée — fait pour tenir un résultat.',
  chaos: 'Tous azimuts : tirs et fautes en pagaille, zéro structure. Imprévisible pour tout le monde, y compris pour soi-même.',
};

const TACTIC_MOD_LABEL: Record<keyof TacticMods, string> = {
  attackMult: 'Attaque',
  midfieldMult: 'Milieu',
  defenseMult: 'Défense',
  shotFreqMult: 'Tirs',
  foulRateMult: 'Fautes',
};

/** Chips ±% générés depuis les mods réels du moteur — jamais désynchronisés du sim */
function ModChips({ mods }: { mods: TacticMods }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
      {(Object.keys(TACTIC_MOD_LABEL) as (keyof TacticMods)[]).map((k) => {
        const pct = Math.round((mods[k] - 1) * 100);
        if (pct === 0) return null;
        // fautes en plus = coût, tout le reste en plus = bénéfice
        const good = k === 'foulRateMult' ? pct < 0 : pct > 0;
        return (
          <span key={k} className={good ? 'text-green-400' : 'text-danger'}>
            {TACTIC_MOD_LABEL[k]} {pct > 0 ? '+' : ''}{pct}%
          </span>
        );
      })}
    </div>
  );
}

/** Score global d'un matchup [att, def, mid] : > 1 = favorable */
function matchupScore([att, def, mid]: [number, number, number]): number {
  return (att + def + mid) / 3;
}

function verdictLists<P extends string>(row: Record<P, [number, number, number]>, self: P): { favorable: P[]; unfavorable: P[] } {
  const favorable: P[] = [];
  const unfavorable: P[] = [];
  for (const opp of Object.keys(row) as P[]) {
    if (opp === self) continue;
    const s = matchupScore(row[opp]);
    if (s >= 1.005) favorable.push(opp);
    else if (s <= 0.995) unfavorable.push(opp);
  }
  return { favorable, unfavorable };
}

/** Formations regroupées par profil, pour illustrer les verdicts */
function formationsOfProfile(p: FormationProfile): Formation[] {
  return FORMATIONS.filter((f) => formationProfile(f) === p);
}

function FormationAnalysis({ formation }: { formation: Formation }) {
  const profile = formationProfile(formation);
  const row = FORMATION_MATCHUP[profile];
  const { favorable, unfavorable } = verdictLists(row, profile);
  return (
    <div className="rounded-lg border border-border bg-bg p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="rounded bg-accent/15 px-2 py-0.5 font-medium text-accent">{FORMATION_PROFILE_LABEL[profile]}</span>
        <span className="text-muted">Profil tactique du {formation}</span>
      </div>
      <p className="text-muted">{FORMATION_PROFILE_DESC[profile]}</p>
      <div className="grid gap-1 sm:grid-cols-2">
        <div>
          <span className="text-green-400 font-medium">✓ Favorable contre</span>
          <ul className="mt-0.5 space-y-0.5 text-muted">
            {favorable.length === 0 && <li>—</li>}
            {favorable.map((p) => (
              <li key={p}>{FORMATION_PROFILE_LABEL[p]} <span className="opacity-60">({formationsOfProfile(p).slice(0, 3).join(', ')})</span></li>
            ))}
          </ul>
        </div>
        <div>
          <span className="text-danger font-medium">✗ Défavorable contre</span>
          <ul className="mt-0.5 space-y-0.5 text-muted">
            {unfavorable.length === 0 && <li>—</li>}
            {unfavorable.map((p) => (
              <li key={p}>{FORMATION_PROFILE_LABEL[p]} <span className="opacity-60">({formationsOfProfile(p).slice(0, 3).join(', ')})</span></li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** Styles prédéfinis regroupés par profil de matchup */
function stylesOfProfile(p: StyleProfile): TacticStyle[] {
  return TACTIC_STYLES.filter((s) => styleProfile(s) === p);
}

/** Listes fort/faible contre pour un profil de style — partagé entre styles prédéfinis et perso */
function StyleMatchupVerdicts({ profile }: { profile: StyleProfile }) {
  const row = STYLE_MATCHUP[profile];
  const { favorable, unfavorable } = verdictLists(row, profile);
  return (
    <div className="grid gap-1 sm:grid-cols-2">
      <div>
        <span className="text-green-400 font-medium">✓ Fort contre</span>
        <ul className="mt-0.5 space-y-0.5 text-muted">
          {favorable.length === 0 && <li>—</li>}
          {favorable.map((p) => (
            <li key={p}>{STYLE_PROFILE_LABEL[p]} <span className="opacity-60">({stylesOfProfile(p).map((s) => TACTIC_STYLE_LABEL[s]).join(', ')})</span></li>
          ))}
        </ul>
      </div>
      <div>
        <span className="text-danger font-medium">✗ Faible contre</span>
        <ul className="mt-0.5 space-y-0.5 text-muted">
          {unfavorable.length === 0 && <li>—</li>}
          {unfavorable.map((p) => (
            <li key={p}>{STYLE_PROFILE_LABEL[p]} <span className="opacity-60">({stylesOfProfile(p).map((s) => TACTIC_STYLE_LABEL[s]).join(', ')})</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function StyleAnalysis({ style }: { style: TacticStyle }) {
  const profile = styleProfile(style);
  return (
    <div className="rounded-lg border border-border bg-bg p-3 space-y-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-medium">{TACTIC_STYLE_LABEL[style]}</span>
        <span className="rounded bg-accent/15 px-2 py-0.5 text-accent">{STYLE_PROFILE_LABEL[profile]}</span>
      </div>
      <p className="text-muted">{STYLE_FLAVOR[style]}</p>
      <ModChips mods={getTacticMods(style)} />
      <p className="text-muted">{STYLE_PROFILE_DESC[profile]}</p>
      <StyleMatchupVerdicts profile={profile} />
    </div>
  );
}

type Props = {
  team: Team;
  players: Player[];
  onSave: (tactics: TeamTactics) => Promise<void>;
  onSaveStyles?: (styles: CustomTacticStyle[], activeId?: string) => void;
};

type PanelTab = 'formation' | 'style' | 'stylesperso' | 'consignes' | 'remplacements';

export function TacticsPanel({ team, players, onSave, onSaveStyles }: Props) {
  const [panelTab, setPanelTab] = useState<PanelTab>('formation');
  const [formation, setFormation] = useState<Formation>(team.tactics?.formation ?? team.formation);
  const [formationLabel, setFormationLabel] = useState<string | undefined>(team.tactics?.formationLabel);
  const [style, setStyle] = useState<TacticStyle>(team.tactics?.style ?? 'possession');
  const [customStyles, setCustomStyles] = useState<CustomTacticStyle[]>(
    team.customStyles ?? team.tactics?.customStyles ?? [],
  );
  const [activeCustomStyleId, setActiveCustomStyleId] = useState<string | undefined>(team.tactics?.activeCustomStyleId);

  const [lineup, setLineup] = useState<(string | null)[]>(
    team.tactics?.lineup?.length === 11 ? [...team.tactics.lineup] : Array(11).fill(null),
  );
  const [benchOrder, setBenchOrder] = useState<string[]>(team.tactics?.bench ?? []);
  const [plannedSubs, setPlannedSubs] = useState<PlannedSub[]>(team.tactics?.plannedSubs ?? []);
  const [planB, setPlanB] = useState<PlanBRule[]>(team.tactics?.planB ?? []);
  const [takers, setTakers] = useState<SetPieceTakers>(team.tactics?.setPieceTakers ?? {});
  const [captainId, setCaptainId] = useState<string | undefined>(team.tactics?.captainId);
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [freeEditor, setFreeEditor] = useState(false);

  function changeFormation(f: Formation) {
    setFormation(f);
    setFormationLabel(undefined);
    setLineup(Array(11).fill(null));
    setPositionMap(undefined);
  }

  const [positionMap, setPositionMap] = useState<Record<string, Position> | undefined>(
    team.tactics?.positionMap,
  );
  const [tokenPositions, setTokenPositions] = useState<Record<string, { x: number; y: number }> | undefined>(
    team.tactics?.tokenPositions,
  );

  function applyFreeEditor(result: FormationEditorResult) {
    setFormation(result.closestPredefined);
    setFormationLabel(result.formation !== result.closestPredefined ? result.formation : undefined);
    setLineup(result.lineup);
    setPositionMap(Object.keys(result.positionMap).length > 0 ? result.positionMap : undefined);
    setTokenPositions(Object.keys(result.tokenPositions).length > 0 ? result.tokenPositions : undefined);
    setFreeEditor(false);
  }

  function fillBestXI() {
    // If free-editor formation exists, preserve token positions — only swap players
    if (tokenPositions && positionMap && lineup.some(Boolean)) {
      const available = [...players].sort((a, b) => b.overall - a.overall);
      const picked = new Set<string>();
      const nextLineup: (string | null)[] = lineup.map((id) => {
        if (!id) return null;
        const slotPos = positionMap[id];
        if (!slotPos) return null;
        // Find best available player for this position (exact match first, then same family)
        const isGK = slotPos === 'GK';
        const families: Record<string, string[]> = {
          GK: ['GK'],
          CB: ['CB', 'LB', 'RB'], LB: ['LB', 'CB', 'RB'], RB: ['RB', 'CB', 'LB'],
          DM: ['DM', 'CM'], CM: ['CM', 'DM', 'AM'], AM: ['AM', 'CM', 'DM'],
          LM: ['LM', 'CM', 'LW'], RM: ['RM', 'CM', 'RW'],
          LW: ['LW', 'LM', 'ST'], RW: ['RW', 'RM', 'ST'], ST: ['ST', 'LW', 'RW'],
        };
        const family = families[slotPos] ?? [slotPos];
        let best = available.find((p) => !picked.has(p.id) && p.position === slotPos);
        if (!best) best = available.find((p) => !picked.has(p.id) && family.includes(p.position));
        if (!best) best = available.find((p) => !picked.has(p.id) && (isGK ? p.position === 'GK' : p.position !== 'GK'));
        if (!best) return id; // keep original if no candidate
        picked.add(best.id);
        return best.id;
      });
      // Remap tokenPositions and positionMap to new player IDs
      const nextTokenPositions: Record<string, { x: number; y: number }> = {};
      const nextPositionMap: Record<string, Position> = {};
      lineup.forEach((oldId, i) => {
        const newId = nextLineup[i];
        if (!oldId || !newId) return;
        if (tokenPositions[oldId]) nextTokenPositions[newId] = tokenPositions[oldId];
        if (positionMap[oldId]) nextPositionMap[newId] = positionMap[oldId];
      });
      setLineup(nextLineup);
      setTokenPositions(nextTokenPositions);
      setPositionMap(nextPositionMap);
      return;
    }
    // Standard formation: let pickXI decide, clear custom positions
    const { lineup: auto } = pickXI(players, formation);
    setLineup(auto.map((p) => p.id));
    setTokenPositions(undefined);
    setPositionMap(undefined);
  }

  function assignPlayer(slotIdx: number, playerId: string) {
    const next = [...lineup];
    const existing = next.indexOf(playerId);
    const evictedId = next[slotIdx]; // player being replaced
    if (existing !== -1) next[existing] = null;
    next[slotIdx] = playerId;
    setLineup(next);
    setPickingSlot(null);
    // If we have custom token positions, transfer coords/positionMap from the replaced slot
    if (tokenPositions) {
      const newTokenPositions = { ...tokenPositions };
      const newPositionMapState = positionMap ? { ...positionMap } : undefined;
      // Give new player the slot's existing coords
      if (evictedId && newTokenPositions[evictedId]) {
        newTokenPositions[playerId] = newTokenPositions[evictedId];
        delete newTokenPositions[evictedId];
      }
      if (newPositionMapState && evictedId && newPositionMapState[evictedId]) {
        newPositionMapState[playerId] = newPositionMapState[evictedId];
        delete newPositionMapState[evictedId];
      }
      // If player was swapped from another slot, that slot's old occupant gets the evicted player's coords
      if (existing !== -1 && evictedId && tokenPositions[next[existing] ?? ''] === undefined) {
        // existing slot is now null (player moved), nothing to do
      }
      setTokenPositions(newTokenPositions);
      setPositionMap(newPositionMapState);
    } else {
      setPositionMap(undefined);
      setTokenPositions(undefined);
    }
  }

  function clearSlot(slotIdx: number) {
    const next = [...lineup];
    const evictedId = next[slotIdx];
    next[slotIdx] = null;
    setLineup(next);
    setPickingSlot(null);
    if (tokenPositions && evictedId) {
      const newTokenPositions = { ...tokenPositions };
      delete newTokenPositions[evictedId];
      setTokenPositions(Object.keys(newTokenPositions).length > 0 ? newTokenPositions : undefined);
      if (positionMap) {
        const newPM = { ...positionMap };
        delete newPM[evictedId];
        setPositionMap(Object.keys(newPM).length > 0 ? newPM : undefined);
      }
    } else {
      setPositionMap(undefined);
      setTokenPositions(undefined);
    }
  }

  async function save(overrideStyles?: CustomTacticStyle[], overrideActiveId?: string) {
    const filled = lineup.filter(Boolean) as string[];
    if (filled.length < 11) return;
    setSaving(true);
    try {
      const filledSet = new Set(filled);
      const validBench = benchOrder.filter((id) => !filledSet.has(id));
      const validPlannedSubs = plannedSubs.filter((s) => filledSet.has(s.outId) && players.some((p) => p.id === s.inId));
      const cs = overrideStyles ?? customStyles;
      const acid = overrideActiveId !== undefined ? overrideActiveId : activeCustomStyleId;
      const hasTakers = takers.penalty || takers.freeKick || takers.corner;
      await onSave({ style, formation, lineup: filled, bench: validBench.length ? validBench : undefined, plannedSubs: validPlannedSubs.length ? validPlannedSubs : undefined, formationLabel, positionMap, tokenPositions, customStyles: cs, activeCustomStyleId: acid, planB: planB.length ? planB : undefined, setPieceTakers: hasTakers ? takers : undefined, captainId });
    } finally {
      setSaving(false);
    }
  }

  function saveCustomStyles(next: CustomTacticStyle[], activeId?: string) {
    setCustomStyles(next);
    setActiveCustomStyleId(activeId);
    if (onSaveStyles) {
      onSaveStyles(next, activeId);
    } else {
      save(next, activeId);
    }
  }

  const layout = FORMATION_LAYOUT[formation];
  const filledCount = lineup.filter(Boolean).length;
  const filledSet = new Set(lineup.filter(Boolean) as string[]);
  // Auto bench: proportional by position family (mirrors StartingXI logic)
  const nonStartersAll = players.filter((p) => !filledSet.has(p.id));
  const bestN = (arr: Player[], n: number) => [...arr].sort((a, b) => b.overall - a.overall).slice(0, n);
  const starterList = players.filter((p) => filledSet.has(p.id));
  const starterDef = starterList.filter((p) => ['CB', 'LB', 'RB'].includes(p.position)).length;
  const starterMid = starterList.filter((p) => ['DM', 'CM', 'AM', 'LM', 'RM'].includes(p.position)).length;
  const starterAtt = starterList.filter((p) => ['LW', 'RW', 'ST'].includes(p.position)).length;
  const familyTotal = starterDef + starterMid + starterAtt || 10;
  const outfieldSlots = 11; // 12 bench - 1 GK
  const defSlots = Math.max(1, Math.round((starterDef / familyTotal) * outfieldSlots));
  const attSlots = Math.max(1, Math.round((starterAtt / familyTotal) * outfieldSlots));
  const midSlots = Math.max(1, outfieldSlots - defSlots - attSlots);
  const gkPool = nonStartersAll.filter((p) => p.position === 'GK');
  const defPool = nonStartersAll.filter((p) => ['CB', 'LB', 'RB'].includes(p.position));
  const midPool = nonStartersAll.filter((p) => ['DM', 'CM', 'AM', 'LM', 'RM'].includes(p.position));
  const attPool = nonStartersAll.filter((p) => ['LW', 'RW', 'ST'].includes(p.position));
  const pickedGk = bestN(gkPool, 1);
  const pickedDef = bestN(defPool, defSlots);
  const pickedMid = bestN(midPool, midSlots);
  const pickedAtt = bestN(attPool, attSlots);
  const pickedSet = new Set([...pickedGk, ...pickedDef, ...pickedMid, ...pickedAtt].map((p) => p.id));
  const remainder = nonStartersAll.filter((p) => !pickedSet.has(p.id)).sort((a, b) => b.overall - a.overall);
  const autoBench = [...pickedGk, ...pickedDef, ...pickedMid, ...pickedAtt, ...remainder].slice(0, 12);
  const playerMap = new Map(players.map((p) => [p.id, p]));
  // Bench = custom order (filtered to non-starters) + remaining not in custom order, capped at 12
  const validBenchIds = benchOrder.filter((id) => !filledSet.has(id) && playerMap.has(id));
  const validBenchSet = new Set(validBenchIds);
  const remainingBench = autoBench.filter((p) => !validBenchSet.has(p.id));
  const bench = [
    ...validBenchIds.map((id) => playerMap.get(id)!),
    ...remainingBench,
  ].slice(0, 12);

  if (freeEditor) {
    // If we have saved token positions from a previous free editor session, restore them.
    // Otherwise fall back to the current formation's predefined slot coords.
    const outfieldSlots: { x: number; y: number }[] = (() => {
      const currentLineup = lineup.filter(Boolean) as string[];
      if (tokenPositions && currentLineup.length > 0) {
        // Return coords in lineup order (GK first, skip GK for outfield slots)
        const outfieldIds = currentLineup.filter((id) => {
          const p = players.find((pl) => pl.id === id);
          return p && p.position !== 'GK';
        });
        if (outfieldIds.length > 0) {
          return outfieldIds.map((id) => tokenPositions[id] ?? { x: 50, y: 50 });
        }
      }
      const formationSlots = FORMATION_LAYOUT[formation] ?? FORMATION_LAYOUT['4-3-3'];
      return formationSlots.filter((s) => s.pos !== 'GK').map((s) => ({ x: s.x, y: s.y }));
    })();
    return (
      <FormationEditor
        players={players}
        initialLineup={lineup.filter(Boolean) as string[]}
        initialSlots={outfieldSlots}
        onSave={applyFreeEditor}
        onCancel={() => setFreeEditor(false)}
      />
    );
  }

  const activeCustomStyle = activeCustomStyleId
    ? customStyles.find((s) => s.id === activeCustomStyleId)
    : undefined;

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {(['formation', 'style', 'stylesperso', 'consignes', 'remplacements'] as PanelTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setPanelTab(t)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${panelTab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {t === 'formation' ? 'Formation' : t === 'style' ? 'Style de jeu' : t === 'stylesperso' ? 'Styles perso' : t === 'consignes' ? 'Consignes' : 'Remplacements'}
            {t === 'stylesperso' && customStyles.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">{customStyles.length}</span>
            )}
            {t === 'consignes' && (planB.length > 0 || captainId) && (
              <span className="ml-1.5 rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">{planB.length + (captainId ? 1 : 0)}</span>
            )}
            {t === 'remplacements' && plannedSubs.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">{plannedSubs.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Active custom style badge */}
      {activeCustomStyle && (
        <div className="flex items-center justify-between rounded border border-accent/30 bg-accent/5 px-3 py-2 text-xs">
          <span className="text-accent">🎨 Style actif : <strong>{activeCustomStyle.name}</strong></span>
          <button
            onClick={() => saveCustomStyles(customStyles, undefined)}
            className="text-muted hover:text-danger transition-colors"
          >
            Désactiver
          </button>
        </div>
      )}

      {/* ── Formation tab ── */}
      {panelTab === 'formation' && (
        <div className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-muted">Formation</span>
              <button onClick={() => setFreeEditor(true)} className="text-xs text-accent hover:underline">
                ✏️ Éditeur libre
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {FORMATIONS.map((f) => (
                <Button key={f} size="sm" variant={formation === f && !formationLabel ? 'primary' : 'ghost'} onClick={() => changeFormation(f)}>
                  {f}
                </Button>
              ))}
            </div>
            {formationLabel && (
              <div className="mt-3 flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-muted">Personnalisée</span>
                <div className="h-px flex-1 bg-border" />
                <button
                  onClick={() => { /* keep formationLabel + lineup, just display it active */ setFormation(formation); }}
                  className={`rounded border px-2 py-0.5 text-xs font-mono font-medium transition-colors ${formationLabel ? 'border-accent bg-accent/10 text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'}`}
                  title={`Formation personnalisée (moteur : ${formation})`}
                >
                  {formationLabel}
                </button>
                <button onClick={() => { setFormationLabel(undefined); }} className="text-[10px] text-muted hover:text-danger transition-colors" title="Supprimer formation personnalisée">✕</button>
              </div>
            )}
          </div>

          <FormationAnalysis formation={formation} />

          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            <div className="relative shrink-0" style={{ width: 280, height: 400, background: 'var(--pitch)', borderRadius: 8, border: '2px solid var(--pitch-line)' }}>
              <div style={{ position: 'absolute', top: '50%', left: '8%', right: '8%', height: 1, background: 'var(--pitch-line)', opacity: 0.5 }} />
              <div style={{ position: 'absolute', top: '50%', left: '50%', width: 60, height: 60, transform: 'translate(-50%,-50%)', borderRadius: '50%', border: '1px solid var(--pitch-line)', opacity: 0.5 }} />
              <div style={{ position: 'absolute', top: '4%', left: '25%', right: '25%', height: '14%', border: '1px solid var(--pitch-line)', opacity: 0.4 }} />
              <div style={{ position: 'absolute', bottom: '4%', left: '25%', right: '25%', height: '14%', border: '1px solid var(--pitch-line)', opacity: 0.4 }} />
              {layout.map((slot, i) => {
                const playerId = lineup[i];
                const player = playerId ? playerMap.get(playerId) : null;
                const filled = !!player;
                // Use free-editor token coords when available for this player
                const tok = playerId && tokenPositions ? tokenPositions[playerId] : undefined;
                const sx = tok ? tok.x : slot.x;
                const sy = tok ? tok.y : slot.y;
                const assignedPos = playerId && positionMap ? positionMap[playerId] : undefined;
                const displayPos = assignedPos ?? (slot.pos as keyof typeof POSITION_LABEL);
                return (
                  <button
                    key={i}
                    onClick={() => setPickingSlot(i)}
                    style={{ position: 'absolute', left: `${sx}%`, top: `${sy}%`, transform: 'translate(-50%, -50%)', zIndex: 1 }}
                    className="flex flex-col items-center gap-0.5 group"
                    title={filled ? `${player.firstName} ${player.lastName}` : slot.pos}
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-all ${filled ? 'border-white bg-white/20 text-white shadow-md' : 'border-white/40 bg-black/20 text-white/60 group-hover:border-white group-hover:bg-black/40'}`}>
                      {filled ? (POSITION_LABEL[displayPos] ?? displayPos) : '+'}
                    </div>
                    <span className="max-w-[56px] truncate rounded bg-black/40 px-0.5 text-center text-[9px] leading-tight text-white/90">
                      {filled ? shortPlayerName(player) : POSITION_LABEL[displayPos] ?? slot.pos}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <Button variant="ghost" size="sm" onClick={fillBestXI} className="self-start">
                ⚡ Meilleure XI
              </Button>
              <Button onClick={() => save()} disabled={saving || filledCount < 11}>
                {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
                {filledCount < 11 ? `Sauvegarder (${filledCount}/11)` : 'Sauvegarder la tactique'}
              </Button>
            </div>
          </div>

          <BenchEditor
            bench={bench}
            autoBench={autoBench}
            allPlayers={players}
            filledSet={filledSet}

            onChange={setBenchOrder}
          />
        </div>
      )}

      {/* ── Style de jeu tab ── */}
      {panelTab === 'style' && (
        <div className="space-y-4">
          {activeCustomStyle && (
            <p className="text-xs text-warning">Un style personnalisé est actif — le style prédéfini ci-dessous sera ignoré en match.</p>
          )}
          <div className="flex flex-wrap gap-2">
            {TACTIC_STYLES.map((s) => (
              <Button key={s} size="sm" variant={style === s && !activeCustomStyle ? 'primary' : 'ghost'} onClick={() => { setStyle(s); saveCustomStyles(customStyles, undefined); }}>
                {TACTIC_STYLE_LABEL[s]}
              </Button>
            ))}
          </div>
          <StyleAnalysis style={style} />
          <Button onClick={() => save()} disabled={saving || filledCount < 11}>
            {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
            Sauvegarder
          </Button>
        </div>
      )}

      {/* ── Styles perso tab ── */}
      {panelTab === 'stylesperso' && (
        <CustomStylesPanel
          customStyles={customStyles}
          activeId={activeCustomStyleId}
          onChange={saveCustomStyles}
          onSaveTactics={() => save()}
          saving={saving}
          canSave={filledCount >= 11}
        />
      )}

      {panelTab === 'consignes' && (
        <ConsignesPanel
          players={players}
          lineup={lineup.filter(Boolean) as string[]}
          otherTactics={(team.savedTactics ?? [])
            .filter((t) => t.id !== (team.tactics as SavedTactic | undefined)?.id)
            .map((t) => ({ id: t.id, name: t.name }))}
          selfTeamId={team.id}
          captainId={captainId}
          onCaptain={setCaptainId}
          takers={takers}
          onTakers={setTakers}
          planB={planB}
          onPlanB={setPlanB}
          onSave={() => save()}
          saving={saving}
          canSave={filledCount >= 11}
        />
      )}

      {panelTab === 'remplacements' && (
        <PlannedSubsPanel
          plannedSubs={plannedSubs}
          onChange={setPlannedSubs}
          lineup={lineup.filter(Boolean) as string[]}
          bench={bench.map((p) => p.id)}
          players={players}
          onSave={() => save()}
          saving={saving}
          canSave={filledCount >= 11}
        />
      )}

      {pickingSlot !== null && (
        <PlayerPicker
          slotDef={(() => {
            const base = layout[pickingSlot];
            const currentPlayerId = lineup[pickingSlot];
            const overridePos = currentPlayerId && positionMap ? positionMap[currentPlayerId] : undefined;
            return overridePos ? { ...base, pos: overridePos } : base;
          })()}
          players={players}
          currentId={lineup[pickingSlot]}
          takenIds={lineup.filter(Boolean) as string[]}
          onPick={(id) => assignPlayer(pickingSlot, id)}
          onClear={() => clearSlot(pickingSlot)}
          onClose={() => setPickingSlot(null)}
        />
      )}
    </div>
  );
}

// ── Bench Editor ─────────────────────────────────────────────────────────────

function BenchEditor({
  bench,
  autoBench,
  allPlayers,
  filledSet,
  onChange,
}: {
  bench: Player[];
  autoBench: Player[];
  allPlayers: Player[];
  filledSet: Set<string>;
  onChange: (ids: string[]) => void;
}) {
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [swappingId, setSwappingId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const benchSet = new Set(bench.map((p) => p.id));

  function addToBench(id: string) {
    if (benchSet.has(id) || filledSet.has(id) || bench.length >= 12) return;
    onChange([...bench.map((p) => p.id), id]);
    setAddingPlayer(false);
    setSearch('');
  }

  function swapWith(newId: string) {
    if (!swappingId || newId === swappingId) { setSwappingId(null); setSearch(''); return; }
    const ids = bench.map((p) => p.id);
    const idx = ids.indexOf(swappingId);
    if (idx === -1) { setSwappingId(null); setSearch(''); return; }
    ids[idx] = newId;
    onChange(ids);
    setSwappingId(null);
    setSearch('');
  }

  function openSwap(id: string) {
    setAddingPlayer(false);
    setSwappingId((prev) => (prev === id ? null : id));
    setSearch('');
  }

  function openAdd() {
    setSwappingId(null);
    setAddingPlayer((v) => !v);
    setSearch('');
  }

  const searchLower = search.toLowerCase();

  // For add: exclude starters + current bench
  const availableToAdd = allPlayers
    .filter((p) => !filledSet.has(p.id) && !benchSet.has(p.id))
    .filter((p) => search === '' || `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchLower))
    .sort((a, b) => b.overall - a.overall);

  // For swap: exclude starters + current bench except the one being swapped out
  const availableToSwap = allPlayers
    .filter((p) => !filledSet.has(p.id) && (!benchSet.has(p.id) || p.id === swappingId))
    .filter((p) => p.id !== swappingId)
    .filter((p) => search === '' || `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchLower))
    .sort((a, b) => b.overall - a.overall);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">Banc ({bench.length}/12)</span>
        <div className="flex gap-2">
          {swappingId && (
            <button onClick={() => { setSwappingId(null); setSearch(''); }} className="text-xs text-muted hover:text-text">
              Annuler
            </button>
          )}
          {!swappingId && (
            <button
              onClick={() => { onChange(autoBench.map((p) => p.id).slice(0, 12)); }}
              className="text-xs text-muted hover:text-text"
              title="Remplir automatiquement avec les meilleurs joueurs disponibles"
            >
              ⚡ Meilleur banc
            </button>
          )}
          {bench.length < 12 && !swappingId && (
            <button onClick={openAdd} className="text-xs text-accent hover:underline">
              {addingPlayer ? 'Annuler' : '+ Ajouter'}
            </button>
          )}
        </div>
      </div>

      {/* Add panel */}
      {addingPlayer && (
        <div className="rounded-lg border border-border bg-bg p-2 space-y-2">
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un joueur…"
            className="w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {availableToAdd.slice(0, 20).map((p) => (
              <button
                key={p.id}
                onClick={() => addToBench(p.id)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-border/40 transition-colors"
              >
                <span>{p.firstName} {p.lastName}</span>
                <span className="text-xs text-muted">{POSITION_LABEL[p.position]} · {p.overall} · {p.age}a · {FOOT[p.preferredFoot]}</span>
              </button>
            ))}
            {availableToAdd.length === 0 && <p className="text-xs text-muted px-2 py-2">Aucun joueur disponible.</p>}
          </div>
        </div>
      )}

      {/* Swap panel */}
      {swappingId && (
        <div className="rounded-lg border border-accent/40 bg-accent/5 p-2 space-y-2">
          <p className="text-xs text-accent px-1">Choisir le remplaçant :</p>
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher…"
            className="w-full rounded border border-border bg-surface px-2 py-1 text-sm outline-none focus:border-accent"
          />
          <div className="max-h-40 overflow-y-auto space-y-0.5">
            {availableToSwap.slice(0, 20).map((p) => (
              <button
                key={p.id}
                onClick={() => swapWith(p.id)}
                className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent/20 transition-colors"
              >
                <span>{p.firstName} {p.lastName}</span>
                <span className="text-xs text-muted">{POSITION_LABEL[p.position]} · {p.overall} · {p.age}a · {FOOT[p.preferredFoot]}</span>
              </button>
            ))}
            {availableToSwap.length === 0 && <p className="text-xs text-muted px-2 py-2">Aucun joueur disponible.</p>}
          </div>
        </div>
      )}

      {bench.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          {bench.map((p, idx) => (
            <div
              key={p.id}
              className={`flex items-center gap-1 px-3 py-1.5 border-t first:border-t-0 border-border transition-colors text-sm ${swappingId === p.id ? 'bg-accent/10 border-accent/30' : 'hover:bg-border/10'}`}
            >
              <span className="w-5 text-center text-xs text-muted tabular-nums">{idx + 1}</span>
              <span className="rounded bg-border/40 px-1.5 py-0.5 font-mono text-xs shrink-0">
                {POSITION_LABEL[p.position]}
              </span>
              <button
                onClick={() => openSwap(p.id)}
                className={`flex-1 truncate text-left hover:text-accent transition-colors ${swappingId === p.id ? 'text-accent font-medium' : ''}`}
                title="Cliquer pour remplacer ce joueur"
              >
                {p.firstName} {p.lastName}
              </button>
              <span className="text-xs text-muted tabular-nums">{p.overall} · {p.age}a · {FOOT[p.preferredFoot]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Custom Styles Panel ───────────────────────────────────────────────────────

const DEFAULT_MODS: TacticMods = { shotFreqMult: 1, foulRateMult: 1, midfieldMult: 1, attackMult: 1, defenseMult: 1 };
const BUDGET_MAX = 30;
const SLIDER_MIN = 70;  // -30%
const SLIDER_MAX = 130; // +30%

const MOD_LABELS: Record<keyof TacticMods, string> = {
  attackMult: 'Attaque',
  midfieldMult: 'Milieu',
  defenseMult: 'Défense',
  shotFreqMult: 'Fréquence tirs',
  foulRateMult: 'Fréquence fautes',
};

/** Budget cost: bonus costs 1pt/%, malus gives back 0.5pt/% */
function budgetCost(mods: TacticMods): number {
  return (Object.keys(DEFAULT_MODS) as (keyof TacticMods)[]).reduce((sum, k) => {
    const pct = Math.round((mods[k] - 1) * 100);
    return sum + (pct > 0 ? pct : pct * 0.5);
  }, 0);
}

function ModSlider({ label, value, onChange, budgetLeft, invert }: { label: string; value: number; onChange: (v: number) => void; budgetLeft: number; invert?: boolean }) {
  const pct = Math.round((value - 1) * 100);
  const displayPct = invert ? -pct : pct;
  const color = displayPct > 0 ? 'text-green-400' : displayPct < 0 ? 'text-danger' : 'text-muted';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={`font-mono font-medium ${color}`}>{displayPct > 0 ? '+' : ''}{displayPct}%</span>
      </div>
      <input
        type="range"
        min={SLIDER_MIN} max={SLIDER_MAX} step={5}
        value={Math.round(value * 100)}
        onChange={(e) => {
          const next = Number(e.target.value) / 100;
          // block increase when budget exhausted (decrease always allowed)
          if (next > value && budgetLeft <= 0) return;
          onChange(next);
        }}
        className="w-full accent-accent"
      />
    </div>
  );
}

function CustomStyleEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial?: CustomTacticStyle;
  onSave: (s: CustomTacticStyle) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [mods, setMods] = useState<TacticMods>(initial?.mods ?? { ...DEFAULT_MODS });

  const spent = budgetCost(mods);
  const remaining = BUDGET_MAX - spent;
  const overBudget = remaining < 0;

  function setMod(key: keyof TacticMods, v: number) {
    const next = { ...mods, [key]: v };
    if (budgetCost(next) <= BUDGET_MAX) setMods(next);
  }

  function handleSave() {
    if (!name.trim() || overBudget) return;
    onSave({ id: initial?.id ?? crypto.randomUUID(), name: name.trim(), mods });
  }

  return (
    <div className="space-y-4 rounded-lg border border-border bg-bg p-4">
      <div>
        <label className="block text-xs text-muted mb-1">Nom du style</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Mon pressing offensif" />
      </div>
      {/* Budget bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted">Budget</span>
          <span className={overBudget ? 'text-danger font-medium' : remaining < 10 ? 'text-warning' : 'text-muted'}>
            {Math.round(spent)} / {BUDGET_MAX} pts {overBudget ? '— dépassé !' : `(${Math.round(remaining)} restants)`}
          </span>
        </div>
        <div className="h-1.5 rounded-full bg-border overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${overBudget ? 'bg-danger' : remaining < 10 ? 'bg-warning' : 'bg-accent'}`}
            style={{ width: `${Math.min(100, (spent / BUDGET_MAX) * 100)}%` }}
          />
        </div>
        <p className="text-[10px] text-muted">+1 pt par % de bonus · malus rend 0.5 pt · max ±30% par slider</p>
      </div>
      {/* Profil matchup détecté — détermine comment ce style réagit aux styles adverses */}
      {(() => {
        const profile = customStyleProfile(mods);
        return (
          <div className="rounded border border-border bg-surface px-3 py-2 text-xs space-y-2">
            <div>
              <span className="text-muted">Profil matchup détecté : </span>
              {profile
                ? <span className="rounded bg-accent/15 px-1.5 py-0.5 font-medium text-accent">{STYLE_PROFILE_LABEL[profile]}</span>
                : <span className="text-muted">neutre (aucun axe dominant)</span>}
            </div>
            <p className="text-[10px] text-muted">
              {profile
                ? STYLE_PROFILE_DESC[profile]
                : 'Sans axe dominant, ce style ne subit ni ne crée d\'avantage de matchup contre les styles adverses.'}
            </p>
            {profile && <StyleMatchupVerdicts profile={profile} />}
          </div>
        );
      })()}
      <div className="space-y-3">
        {(Object.keys(MOD_LABELS) as (keyof TacticMods)[]).map((k) => (
          <ModSlider key={k} label={MOD_LABELS[k]} value={mods[k]} onChange={(v) => setMod(k, v)} budgetLeft={remaining} invert={k === 'foulRateMult'} />
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={handleSave} disabled={!name.trim() || overBudget}>Enregistrer</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Annuler</Button>
      </div>
    </div>
  );
}

function CustomStylesPanel({
  customStyles,
  activeId,
  onChange,
  onSaveTactics,
  saving,
  canSave,
}: {
  customStyles: CustomTacticStyle[];
  activeId?: string;
  onChange: (styles: CustomTacticStyle[], activeId?: string) => void;
  onSaveTactics: () => void;
  saving: boolean;
  canSave: boolean;
}) {
  const [editing, setEditing] = useState<CustomTacticStyle | null | 'new'>(null);

  function handleSaveStyle(s: CustomTacticStyle) {
    const exists = customStyles.some((x) => x.id === s.id);
    const next = exists ? customStyles.map((x) => (x.id === s.id ? s : x)) : [...customStyles, s];
    onChange(next, activeId);
    setEditing(null);
  }

  function handleDelete(id: string) {
    const next = customStyles.filter((s) => s.id !== id);
    onChange(next, activeId === id ? undefined : activeId);
  }

  function handleActivate(id: string) {
    onChange(customStyles, activeId === id ? undefined : id);
  }

  if (editing === 'new') {
    return <CustomStyleEditor onSave={handleSaveStyle} onCancel={() => setEditing(null)} />;
  }
  if (editing) {
    return <CustomStyleEditor initial={editing} onSave={handleSaveStyle} onCancel={() => setEditing(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{customStyles.length} style(s) créé(s)</span>
        <Button size="sm" onClick={() => setEditing('new')}>+ Nouveau style</Button>
      </div>

      {customStyles.length === 0 && (
        <p className="text-xs text-muted py-4 text-center">Aucun style personnalisé. Crée-en un pour remplacer les styles prédéfinis.</p>
      )}

      <div className="space-y-2">
        {customStyles.map((s) => {
          const isActive = s.id === activeId;
          const profile = customStyleProfile(s.mods);
          return (
            <div
              key={s.id}
              className={`rounded-lg border p-3 space-y-2 transition-colors ${isActive ? 'border-accent bg-accent/5' : 'border-border bg-bg'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`flex items-center gap-2 font-medium text-sm ${isActive ? 'text-accent' : ''}`}>
                  {s.name}
                  <span
                    className="rounded bg-border/40 px-1.5 py-0.5 text-[10px] font-normal text-muted"
                    title={profile ? STYLE_PROFILE_DESC[profile] : 'Aucun axe dominant — pas de matchup de style'}
                  >
                    {profile ? STYLE_PROFILE_LABEL[profile] : 'Neutre'}
                  </span>
                </span>
                <div className="flex gap-2">
                  <button onClick={() => handleActivate(s.id)} className={`text-xs px-2 py-0.5 rounded border transition-colors ${isActive ? 'border-accent text-accent' : 'border-border text-muted hover:border-accent hover:text-accent'}`}>
                    {isActive ? '✓ Actif' : 'Activer'}
                  </button>
                  <button onClick={() => setEditing(s)} className="text-xs text-muted hover:text-text transition-colors">Modifier</button>
                  <button onClick={() => handleDelete(s.id)} className="text-xs text-muted hover:text-danger transition-colors">✕</button>
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted">
                {(Object.keys(MOD_LABELS) as (keyof TacticMods)[]).map((k) => {
                  const pct = Math.round((s.mods[k] - 1) * 100);
                  if (pct === 0) return null;
                  return (
                    <span key={k} className={pct > 0 ? 'text-green-400' : 'text-danger'}>
                      {MOD_LABELS[k]} {pct > 0 ? '+' : ''}{pct}%
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Button onClick={onSaveTactics} disabled={saving || !canSave}>
        {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
        Sauvegarder la tactique
      </Button>
    </div>
  );
}

// ── Player picker ─────────────────────────────────────────────────────────────

type PickerProps = {
  slotDef: SlotDef;
  players: Player[];
  currentId: string | null;
  takenIds: string[];
  onPick: (id: string) => void;
  onClear: () => void;
  onClose: () => void;
};

function posMatchScore(player: Player, slotPos: string): number {
  if (player.position === slotPos) return 3;
  if (player.altPositions.includes(slotPos as Player['position'])) return 2;
  return 0;
}

function PlayerPicker({ slotDef, players, currentId, takenIds, onPick, onClear, onClose }: PickerProps) {
  const [search, setSearch] = useState('');

  const sorted = [...players]
    .sort((a, b) => {
      const diff = posMatchScore(b, slotDef.pos) - posMatchScore(a, slotDef.pos);
      return diff !== 0 ? diff : b.overall - a.overall;
    })
    .filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm space-y-3 rounded-lg border border-border bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Poste : {slotDef.pos}</span>
          <button onClick={onClose} className="text-muted hover:text-text text-lg leading-none">✕</button>
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          autoFocus
        />
        <div className="max-h-72 space-y-0.5 overflow-y-auto">
          {sorted.map((p) => {
            const isCurrent = p.id === currentId;
            const isTaken = takenIds.includes(p.id) && !isCurrent;
            const matchScore = posMatchScore(p, slotDef.pos);
            return (
              <button
                key={p.id}
                onClick={() => !isTaken && onPick(p.id)}
                disabled={isTaken}
                className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors ${isCurrent ? 'bg-accent/20 text-accent' : isTaken ? 'cursor-not-allowed opacity-35' : 'hover:bg-border'}`}
              >
                <span className="flex items-center gap-2">
                  {matchScore === 3 && <span className="text-accent text-xs">●</span>}
                  {matchScore === 2 && <span className="text-warning text-xs">◐</span>}
                  {matchScore === 0 && <span className="text-xs opacity-0">●</span>}
                  {p.firstName} {p.lastName}
                </span>
                <span className="text-xs text-muted">{POSITION_LABEL[p.position]} · {p.overall} · {p.age}a · {FOOT[p.preferredFoot]}</span>
              </button>
            );
          })}
        </div>
        {currentId && (
          <Button variant="ghost" size="sm" onClick={onClear} className="w-full">
            Retirer du poste
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Consignes Panel : capitaine, tireurs désignés, plans B ───────────────────

/** Sélecteur avec recherche intégrée — le XI de départ (s'il est fait) passe en tête avec un badge */
function PlayerSearchSelect({ players, xiIds, value, onChange, placeholder }: {
  players: Player[];
  xiIds: Set<string>;
  value?: string;
  onChange: (id: string | undefined) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = value ? players.find((p) => p.id === value) : undefined;
  const searchLower = search.toLowerCase();
  const sorted = [...players]
    .sort((a, b) => {
      const ax = xiIds.has(a.id) ? 1 : 0;
      const bx = xiIds.has(b.id) ? 1 : 0;
      if (ax !== bx) return bx - ax;
      return b.overall - a.overall;
    })
    .filter((p) => search === '' || `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchLower));

  function pick(id: string | undefined) {
    onChange(id);
    setOpen(false);
    setSearch('');
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setSearch(''); }}
        className="flex w-full items-center justify-between gap-2 rounded border border-border bg-surface px-2 py-1.5 text-left text-sm outline-none focus:border-accent"
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="shrink-0 rounded bg-border/40 px-1 font-mono text-[10px]">{POSITION_LABEL[selected.position]}</span>
            <span className="truncate">{selected.firstName} {selected.lastName}</span>
            {xiIds.has(selected.id) && <span className="shrink-0 rounded bg-accent/15 px-1 text-[9px] font-medium text-accent">XI</span>}
            <span className="shrink-0 text-xs text-muted">({selected.overall})</span>
          </span>
        ) : (
          <span className="text-muted">{placeholder}</span>
        )}
        <span className="shrink-0 text-[10px] text-muted">▾</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => { setOpen(false); setSearch(''); }} />
          <div className="absolute z-20 mt-1 w-full min-w-[220px] space-y-1 rounded border border-border bg-surface p-2 shadow-lg">
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un joueur…"
              className="w-full rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
            />
            <div className="max-h-52 space-y-0.5 overflow-y-auto">
              <button
                type="button"
                onClick={() => pick(undefined)}
                className={`w-full rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-border/40 ${!value ? 'text-accent' : 'text-muted'}`}
              >
                {placeholder}
              </button>
              {sorted.map((p) => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => pick(p.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-border/40 ${p.id === value ? 'bg-accent/10 text-accent' : ''}`}
                >
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 rounded bg-border/40 px-1 font-mono text-[10px]">{POSITION_LABEL[p.position]}</span>
                    <span className="truncate">{p.firstName} {p.lastName}</span>
                    {xiIds.has(p.id) && <span className="shrink-0 rounded bg-accent/15 px-1 text-[9px] font-medium text-accent">XI</span>}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{p.overall} · {p.age}a</span>
                </button>
              ))}
              {sorted.length === 0 && <p className="px-2 py-2 text-xs text-muted">Aucun joueur.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const PLAN_B_TRIGGERS: PlanBTrigger[] = ['losing', 'winning', 'drawing', 'redCard'];

function ConsignesPanel({
  players, lineup, otherTactics, selfTeamId, captainId, onCaptain, takers, onTakers, planB, onPlanB, onSave, saving, canSave,
}: {
  players: Player[];
  /** XI de départ (ids) — priorisé dans les sélecteurs quand il est défini */
  lineup: string[];
  /** autres tactiques sauvegardées de l'équipe — cibles des plans B */
  otherTactics: { id: string; name: string }[];
  selfTeamId: string;
  captainId?: string;
  onCaptain: (id: string | undefined) => void;
  takers: SetPieceTakers;
  onTakers: (t: SetPieceTakers) => void;
  planB: PlanBRule[];
  onPlanB: (rules: PlanBRule[]) => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
}) {
  const outfield = players.filter((p) => p.position !== 'GK');
  const xiIds = new Set(lineup);
  const hasTactics = otherTactics.length > 0;

  // Liste d'équipes pour la condition adversaire des plans B
  const teams = useTeams((s) => s.teams);
  const refreshIfStale = useTeams((s) => s.refreshIfStale);
  const { ownerId, prApiToken } = useBackendArgs();
  useEffect(() => {
    if (ownerId) refreshIfStale(ownerId, null, prApiToken);
  }, [ownerId, prApiToken, refreshIfStale]);
  const opponentOptions = teams
    .filter((t) => t.id !== selfTeamId)
    .map((t) => ({ id: t.id, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  function patchRule(id: string, patch: Partial<PlanBRule>) {
    onPlanB(planB.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  return (
    <div className="space-y-6">
      {/* Capitaine */}
      <div className="space-y-2">
        <div className="text-sm font-medium">Capitaine</div>
        <p className="text-xs text-muted">
          Tant qu'il est sur le terrain : fautes de l'équipe −7 %, cartons jaunes −10 %,
          et le momentum adverse après un but encaissé est réduit de moitié (résilience).
        </p>
        <PlayerSearchSelect players={players} xiIds={xiIds} value={captainId} onChange={onCaptain} placeholder="— Aucun capitaine —" />
      </div>

      {/* Tireurs désignés */}
      <div className="space-y-2 border-t border-border pt-4">
        <div className="text-sm font-medium">Tireurs désignés</div>
        <p className="text-xs text-muted">
          Prioritaires sur la sélection automatique s'ils sont sur le terrain. Penalties : finition + sang-froid.
          Coups francs : frappe de loin. Corners : la qualité de centre améliore la conversion des têtes.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {([['penalty', 'Penalties'], ['freeKick', 'Coups francs'], ['corner', 'Corners']] as const).map(([k, label]) => (
            <div key={k} className="space-y-1">
              <label className="text-xs text-muted">{label}</label>
              <PlayerSearchSelect
                players={outfield}
                xiIds={xiIds}
                value={takers[k]}
                onChange={(id) => onTakers({ ...takers, [k]: id })}
                placeholder="Auto"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Plans B */}
      <div className="space-y-2 border-t border-border pt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Plans B conditionnels</div>
          {planB.length < 3 && (
            <button
              onClick={() => onPlanB([...planB, {
                id: crypto.randomUUID(), trigger: 'losing', fromMinute: 70,
                ...(hasTactics
                  ? { tacticId: otherTactics[0].id, tacticName: otherTactics[0].name }
                  : { style: 'chaos' as TacticStyle }),
              }])}
              className="text-xs text-accent hover:underline"
            >
              + Ajouter un plan B
            </button>
          )}
        </div>
        <p className="text-xs text-muted">
          Bascule automatique vers une autre tactique sauvegardée en cours de match (son style est appliqué —
          la formation et le XI restent ceux du coup d'envoi). Chaque règle se déclenche une seule fois,
          dès que sa condition est vraie à partir de la minute choisie. L'événement apparaît dans le fil du match.
        </p>
        {!hasTactics && (
          <p className="text-xs text-warning">
            Aucune autre tactique sauvegardée — les plans B basculent sur un style en attendant.
          </p>
        )}
        {planB.length === 0 && (
          <p className="text-xs text-muted py-2 text-center">Aucun plan B. Exemple : « Si mené à la 70ᵉ → Tactique offensive ».</p>
        )}
        <div className="space-y-2">
          {planB.map((rule, idx) => (
            <div key={rule.id} className="space-y-1.5 rounded-lg border border-border bg-bg p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-4 text-center text-muted tabular-nums">{idx + 1}.</span>
                <select
                  value={rule.trigger}
                  onChange={(e) => patchRule(rule.id, { trigger: e.target.value as PlanBTrigger })}
                  className="rounded border border-border bg-surface px-2 py-1 outline-none focus:border-accent"
                >
                  {PLAN_B_TRIGGERS.map((t) => <option key={t} value={t}>{PLAN_B_TRIGGER_LABEL[t]}</option>)}
                </select>
                <span className="text-muted">dès la</span>
                <input
                  type="number" min={1} max={120}
                  value={rule.fromMinute}
                  onChange={(e) => patchRule(rule.id, { fromMinute: Math.max(1, Math.min(120, Number(e.target.value) || 1)) })}
                  className="w-14 rounded border border-border bg-surface px-2 py-1 text-center outline-none focus:border-accent"
                />
                <span className="text-muted">ᵉ →</span>
                {hasTactics ? (
                  <select
                    value={rule.tacticId ?? ''}
                    onChange={(e) => {
                      const t = otherTactics.find((x) => x.id === e.target.value);
                      if (t) patchRule(rule.id, { tacticId: t.id, tacticName: t.name, style: undefined });
                    }}
                    className="flex-1 min-w-[140px] rounded border border-border bg-surface px-2 py-1 outline-none focus:border-accent"
                  >
                    {/* règle legacy encore sur un style : option affichée tant qu'elle n'est pas migrée */}
                    {!rule.tacticId && rule.style && (
                      <option value="">Style : {TACTIC_STYLE_LABEL[rule.style]}</option>
                    )}
                    {otherTactics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                ) : (
                  <select
                    value={rule.style ?? 'chaos'}
                    onChange={(e) => patchRule(rule.id, { style: e.target.value as TacticStyle, tacticId: undefined, tacticName: undefined })}
                    className="flex-1 min-w-[140px] rounded border border-border bg-surface px-2 py-1 outline-none focus:border-accent"
                  >
                    {TACTIC_STYLES.map((s) => <option key={s} value={s}>{TACTIC_STYLE_LABEL[s]}</option>)}
                  </select>
                )}
                <button onClick={() => onPlanB(planB.filter((r) => r.id !== rule.id))} className="text-muted hover:text-danger transition-colors">✕</button>
              </div>
              {/* Condition adversaire : restreint ou annule la règle contre une équipe précise */}
              <div className="flex flex-wrap items-center gap-2 pl-6">
                <select
                  value={rule.vsMode ?? ''}
                  onChange={(e) => {
                    const mode = (e.target.value || undefined) as PlanBRule['vsMode'];
                    patchRule(rule.id, mode
                      ? { vsMode: mode }
                      : { vsMode: undefined, vsTeamId: undefined, vsTeamName: undefined });
                  }}
                  className="rounded border border-border bg-surface px-2 py-1 outline-none focus:border-accent"
                >
                  <option value="">Contre tous les adversaires</option>
                  <option value="only">Seulement contre…</option>
                  <option value="except">Sauf contre…</option>
                </select>
                {rule.vsMode && (
                  <select
                    value={rule.vsTeamId ?? ''}
                    onChange={(e) => {
                      const opp = opponentOptions.find((t) => t.id === e.target.value);
                      patchRule(rule.id, { vsTeamId: opp?.id, vsTeamName: opp?.name });
                    }}
                    className="flex-1 min-w-[140px] rounded border border-border bg-surface px-2 py-1 outline-none focus:border-accent"
                  >
                    <option value="">— Choisir l'équipe —</option>
                    {opponentOptions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Button onClick={onSave} disabled={saving || !canSave}>
        {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
        Sauvegarder la tactique
      </Button>
    </div>
  );
}

// ── Planned Subs Panel ────────────────────────────────────────────────────────

function PlannedSubsPanel({
  plannedSubs,
  onChange,
  lineup,
  bench,
  players,
  onSave,
  saving,
  canSave,
}: {
  plannedSubs: PlannedSub[];
  onChange: (subs: PlannedSub[]) => void;
  lineup: string[];
  bench: string[];
  players: Player[];
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
}) {
  const [pickingIdx, setPickingIdx] = useState<{ subIdx: number; field: 'out' | 'in' } | null>(null);
  const [search, setSearch] = useState('');
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const lineupSet = new Set(lineup);
  const benchSet = new Set(bench);
  const benchPlayers = players.filter((p) => benchSet.has(p.id));

  function addSub() {
    onChange([...plannedSubs, { outId: '', inId: '' }]);
  }

  function removeSub(idx: number) {
    onChange(plannedSubs.filter((_, i) => i !== idx));
  }

  function updateSub(idx: number, patch: Partial<PlannedSub>) {
    onChange(plannedSubs.map((s, i) => i === idx ? { ...s, ...patch } : s));
  }

  function pickPlayer(subIdx: number, field: 'out' | 'in') {
    setPickingIdx({ subIdx, field });
    setSearch('');
  }

  function selectPlayer(id: string) {
    if (!pickingIdx) return;
    updateSub(pickingIdx.subIdx, { [pickingIdx.field === 'out' ? 'outId' : 'inId']: id });
    setPickingIdx(null);
    setSearch('');
  }

  const pickerPool = pickingIdx?.field === 'out'
    ? players.filter((p) => lineupSet.has(p.id))
    : benchPlayers;

  const filtered = pickerPool
    .filter((p) => search === '' || `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => b.overall - a.overall);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Définis des remplacements prévus. Ceux sans minute s'appliquent à la mi-temps. Ceux avec une minute s'appliquent dès ce moment en jeu.
      </p>

      <div className="space-y-2">
        {plannedSubs.map((sub, idx) => {
          const outP = sub.outId ? playerMap.get(sub.outId) : null;
          const inP = sub.inId ? playerMap.get(sub.inId) : null;
          return (
            <div key={idx} className="rounded-lg border border-border bg-bg p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted w-4 tabular-nums">{idx + 1}.</span>
                {/* Sortant */}
                <button
                  onClick={() => pickPlayer(idx, 'out')}
                  className={`flex-1 rounded border px-2 py-1 text-left text-xs transition-colors ${outP ? 'border-border hover:border-accent/50' : 'border-dashed border-border text-muted hover:border-accent hover:text-accent'}`}
                >
                  {outP
                    ? <span className="flex items-center gap-1.5"><span className="font-mono text-[10px] bg-border/40 rounded px-1">{POSITION_LABEL[outP.position]}</span>{outP.lastName} <span className="text-muted">{outP.overall}</span></span>
                    : '+ Sortant'}
                </button>
                <span className="text-muted text-xs">→</span>
                {/* Entrant */}
                <button
                  onClick={() => pickPlayer(idx, 'in')}
                  className={`flex-1 rounded border px-2 py-1 text-left text-xs transition-colors ${inP ? 'border-border hover:border-accent/50' : 'border-dashed border-border text-muted hover:border-accent hover:text-accent'}`}
                >
                  {inP
                    ? <span className="flex items-center gap-1.5"><span className="font-mono text-[10px] bg-border/40 rounded px-1">{POSITION_LABEL[inP.position]}</span>{inP.lastName} <span className="text-muted">{inP.overall}</span></span>
                    : '+ Entrant'}
                </button>
                {/* Minute optionnelle */}
                <input
                  type="number"
                  min={46}
                  max={120}
                  placeholder="MT"
                  value={sub.minute ?? ''}
                  onChange={(e) => updateSub(idx, { minute: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-14 rounded border border-border bg-surface px-2 py-1 text-xs text-center outline-none focus:border-accent"
                  title="Minute (vide = mi-temps)"
                />
                <button onClick={() => removeSub(idx)} className="text-muted hover:text-danger text-xs transition-colors">✕</button>
              </div>
            </div>
          );
        })}
      </div>

      {plannedSubs.length < 5 && (
        <button onClick={addSub} className="text-xs text-accent hover:underline">
          + Ajouter un remplacement prévu
        </button>
      )}

      {/* Picker modal */}
      {pickingIdx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setPickingIdx(null)}>
          <div className="w-full max-w-xs space-y-3 rounded-lg border border-border bg-surface p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{pickingIdx.field === 'out' ? 'Joueur sortant (titulaire)' : 'Joueur entrant (banc)'}</span>
              <button onClick={() => setPickingIdx(null)} className="text-muted hover:text-text">✕</button>
            </div>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher…"
              className="w-full rounded border border-border bg-bg px-2 py-1 text-sm outline-none focus:border-accent"
            />
            <div className="max-h-60 overflow-y-auto space-y-0.5">
              {filtered.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPlayer(p.id)}
                  className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-border/40 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] bg-border/40 rounded px-1">{POSITION_LABEL[p.position]}</span>
                    {p.firstName} {p.lastName}
                  </span>
                  <span className="text-xs text-muted">{p.overall}</span>
                </button>
              ))}
              {filtered.length === 0 && <p className="text-xs text-muted px-2 py-2">Aucun joueur.</p>}
            </div>
          </div>
        </div>
      )}

      <div className="pt-4">
        <Button onClick={onSave} disabled={saving || !canSave}>
          {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
          Sauvegarder la tactique
        </Button>
      </div>
    </div>
  );
}
