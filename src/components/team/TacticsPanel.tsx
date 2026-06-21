import { useState } from 'react';
import type { CustomTacticStyle, Formation, Player, TacticStyle, Team, TeamTactics } from '@/lib/types';
import { TACTIC_STYLE_LABEL } from '@/lib/types';
import type { TacticMods } from '@/lib/sim/types';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { pickXI } from '@/lib/sim/lineup';
import { FormationEditor } from './FormationEditor';
import type { FormationEditorResult } from './FormationEditor';

const FORMATIONS: Formation[] = ['4-3-3', '4-4-2', '3-5-2', '4-2-3-1', '5-3-2', '4-1-4-1', '3-4-3', '4-3-2-1', '4-5-1', '4-4-1-1', '3-4-1-2', '5-4-1', '3-6-1'];
const TACTIC_STYLES: TacticStyle[] = ['possession', 'contre-attaque', 'direct', 'pressing', 'ultra-defensif', 'gegenpressing', 'tiki-taka', 'long-ball', 'chaos'];

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
    { pos: 'LM', x: 8, y: 52 }, { pos: 'DM', x: 30, y: 53 }, { pos: 'CM', x: 50, y: 49 }, { pos: 'CM', x: 70, y: 53 }, { pos: 'RM', x: 92, y: 52 },
    { pos: 'ST', x: 34, y: 20 }, { pos: 'ST', x: 66, y: 20 },
  ],
  '4-2-3-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'DM', x: 34, y: 58 }, { pos: 'DM', x: 66, y: 58 },
    { pos: 'LW', x: 12, y: 40 }, { pos: 'AM', x: 50, y: 38 }, { pos: 'RW', x: 88, y: 40 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '5-3-2': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 6, y: 70 }, { pos: 'CB', x: 24, y: 72 }, { pos: 'CB', x: 50, y: 73 }, { pos: 'CB', x: 76, y: 72 }, { pos: 'RB', x: 94, y: 70 },
    { pos: 'CM', x: 24, y: 50 }, { pos: 'DM', x: 50, y: 50 }, { pos: 'CM', x: 76, y: 50 },
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
    { pos: 'AM', x: 34, y: 38 }, { pos: 'AM', x: 66, y: 38 },
    { pos: 'ST', x: 50, y: 18 },
  ],
  '4-5-1': [
    { pos: 'GK', x: 50, y: 88 },
    { pos: 'LB', x: 12, y: 70 }, { pos: 'CB', x: 34, y: 72 }, { pos: 'CB', x: 66, y: 72 }, { pos: 'RB', x: 88, y: 70 },
    { pos: 'LM', x: 8, y: 48 }, { pos: 'CM', x: 28, y: 46 }, { pos: 'DM', x: 50, y: 50 }, { pos: 'CM', x: 72, y: 46 }, { pos: 'RM', x: 92, y: 48 },
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
    { pos: 'LM', x: 6, y: 50 }, { pos: 'DM', x: 24, y: 52 }, { pos: 'CM', x: 38, y: 47 }, { pos: 'CM', x: 62, y: 47 }, { pos: 'DM', x: 76, y: 52 }, { pos: 'RM', x: 94, y: 50 },
    { pos: 'ST', x: 50, y: 18 },
  ],
};

type Props = {
  team: Team;
  players: Player[];
  onSave: (tactics: TeamTactics) => Promise<void>;
};

type PanelTab = 'formation' | 'style' | 'stylesperso';

export function TacticsPanel({ team, players, onSave }: Props) {
  const [panelTab, setPanelTab] = useState<PanelTab>('formation');
  const [formation, setFormation] = useState<Formation>(team.tactics?.formation ?? team.formation);
  const [formationLabel, setFormationLabel] = useState<string | undefined>(team.tactics?.formationLabel);
  const [style, setStyle] = useState<TacticStyle>(team.tactics?.style ?? 'possession');
  const [customStyles, setCustomStyles] = useState<CustomTacticStyle[]>(team.tactics?.customStyles ?? []);
  const [activeCustomStyleId, setActiveCustomStyleId] = useState<string | undefined>(team.tactics?.activeCustomStyleId);
  const [lineup, setLineup] = useState<(string | null)[]>(
    team.tactics?.lineup?.length === 11 ? [...team.tactics.lineup] : Array(11).fill(null),
  );
  const [pickingSlot, setPickingSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [freeEditor, setFreeEditor] = useState(false);

  function changeFormation(f: Formation) {
    setFormation(f);
    setFormationLabel(undefined);
    setLineup(Array(11).fill(null));
  }

  function applyFreeEditor(result: FormationEditorResult) {
    setFormation(result.closestPredefined);
    setFormationLabel(result.formation !== result.closestPredefined ? result.formation : undefined);
    setLineup(result.lineup);
    setFreeEditor(false);
  }

  function fillBestXI() {
    const { lineup: auto } = pickXI(players, formation);
    setLineup(auto.map((p) => p.id));
  }

  function assignPlayer(slotIdx: number, playerId: string) {
    const next = [...lineup];
    const existing = next.indexOf(playerId);
    if (existing !== -1) next[existing] = null;
    next[slotIdx] = playerId;
    setLineup(next);
    setPickingSlot(null);
  }

  function clearSlot(slotIdx: number) {
    const next = [...lineup];
    next[slotIdx] = null;
    setLineup(next);
    setPickingSlot(null);
  }

  async function save() {
    const filled = lineup.filter(Boolean) as string[];
    if (filled.length < 11) return;
    setSaving(true);
    try {
      await onSave({ style, formation, lineup: filled, formationLabel, customStyles, activeCustomStyleId });
    } finally {
      setSaving(false);
    }
  }

  function saveCustomStyles(next: CustomTacticStyle[], activeId?: string) {
    setCustomStyles(next);
    setActiveCustomStyleId(activeId);
  }

  const layout = FORMATION_LAYOUT[formation];
  const playerMap = new Map(players.map((p) => [p.id, p]));
  const filledCount = lineup.filter(Boolean).length;
  const filledSet = new Set(lineup.filter(Boolean) as string[]);
  const BENCH_POS_ORDER: Record<string, number> = {
    GK: 0, CB: 1, LB: 1, RB: 1, DM: 2, CM: 2, LM: 2, RM: 2, AM: 2, LW: 3, RW: 3, ST: 3,
  };
  const bench = players
    .filter((p) => !filledSet.has(p.id))
    .sort((a, b) => {
      const po = (BENCH_POS_ORDER[a.position] ?? 4) - (BENCH_POS_ORDER[b.position] ?? 4);
      return po !== 0 ? po : b.overall - a.overall;
    })
    .slice(0, 12);

  if (freeEditor) {
    return (
      <FormationEditor
        players={players}
        initialLineup={lineup.filter(Boolean) as string[]}
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
        {(['formation', 'style', 'stylesperso'] as PanelTab[]).map((t) => (
          <button
            key={t}
            onClick={() => setPanelTab(t)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${panelTab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {t === 'formation' ? 'Formation' : t === 'style' ? 'Style de jeu' : 'Styles perso'}
            {t === 'stylesperso' && customStyles.length > 0 && (
              <span className="ml-1.5 rounded-full bg-accent/20 px-1.5 text-[10px] text-accent">{customStyles.length}</span>
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
                return (
                  <button
                    key={i}
                    onClick={() => setPickingSlot(i)}
                    style={{ position: 'absolute', left: `${slot.x}%`, top: `${slot.y}%`, transform: 'translate(-50%, -50%)', zIndex: 1 }}
                    className="flex flex-col items-center gap-0.5 group"
                    title={filled ? `${player.firstName} ${player.lastName}` : slot.pos}
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-all ${filled ? 'border-white bg-white/20 text-white shadow-md' : 'border-white/40 bg-black/20 text-white/60 group-hover:border-white group-hover:bg-black/40'}`}>
                      {filled ? `${player.firstName[0]}${player.lastName[0]}` : '+'}
                    </div>
                    <span className="max-w-[56px] truncate rounded bg-black/40 px-0.5 text-center text-[9px] leading-tight text-white/90">
                      {filled ? player.lastName : slot.pos}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-1 flex-col gap-4">
              <Button variant="ghost" size="sm" onClick={fillBestXI} className="self-start">
                ⚡ Meilleure XI
              </Button>
              <Button onClick={save} disabled={saving || filledCount < 11}>
                {saving ? <Spinner className="mr-2 h-4 w-4" /> : null}
                {filledCount < 11 ? `Sauvegarder (${filledCount}/11)` : 'Sauvegarder la tactique'}
              </Button>
            </div>
          </div>

          {bench.length > 0 && (
            <div className="space-y-2">
              <span className="text-sm text-muted">Banc ({bench.length})</span>
              <div className="max-h-48 overflow-y-auto space-y-0.5 rounded-lg border border-border">
                {bench.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-3 py-1.5 text-sm hover:bg-border/40 transition-colors">
                    <span>{p.firstName} {p.lastName}</span>
                    <span className="text-xs text-muted">{p.position} · {p.overall}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
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
          <p className="text-xs text-muted">
            {style === 'possession' && 'Milieu renforcé (+12%), fréquence de tirs réduite.'}
            {style === 'contre-attaque' && 'Attaque boostée (+10%), moins de possession.'}
            {style === 'direct' && 'Fréquence de tirs maximale (+18%).'}
            {style === 'pressing' && 'Pressing intense — milieu (+15%), fautes adverses.'}
            {style === 'ultra-defensif' && 'Bloc bas — tirs très rares (−35%), défense renforcée.'}
            {style === 'gegenpressing' && 'Récupération haute intensité — milieu (+18%), fautes élevées.'}
            {style === 'tiki-taka' && 'Passes courtes — possession maximale (+20%), peu de tirs.'}
            {style === 'long-ball' && 'Ballons longs — attaque boostée (+15%), milieu réduit.'}
            {style === 'chaos' && 'Tous azimuts — tirs (+30%) et fautes (+35%) extrêmes.'}
          </p>
          <Button onClick={save} disabled={saving || filledCount < 11}>
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

      {pickingSlot !== null && (
        <PlayerPicker
          slotDef={layout[pickingSlot]}
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

function ModSlider({ label, value, onChange, budgetLeft }: { label: string; value: number; onChange: (v: number) => void; budgetLeft: number }) {
  const pct = Math.round((value - 1) * 100);
  const color = pct > 0 ? 'text-green-400' : pct < 0 ? 'text-danger' : 'text-muted';
  // effectiveMax: current value + remaining budget (each +1% costs 1pt from budget)
  const effectiveMax = Math.max(SLIDER_MIN, Math.min(SLIDER_MAX, Math.round(100 + pct + budgetLeft)));

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={`font-mono font-medium ${color}`}>{pct > 0 ? '+' : ''}{pct}%</span>
      </div>
      <input
        type="range"
        min={SLIDER_MIN} max={effectiveMax} step={5}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
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
      <div className="space-y-3">
        {(Object.keys(MOD_LABELS) as (keyof TacticMods)[]).map((k) => (
          <ModSlider key={k} label={MOD_LABELS[k]} value={mods[k]} onChange={(v) => setMod(k, v)} budgetLeft={remaining} />
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
          return (
            <div
              key={s.id}
              className={`rounded-lg border p-3 space-y-2 transition-colors ${isActive ? 'border-accent bg-accent/5' : 'border-border bg-bg'}`}
            >
              <div className="flex items-center justify-between">
                <span className={`font-medium text-sm ${isActive ? 'text-accent' : ''}`}>{s.name}</span>
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
                <span className="text-xs text-muted">{p.position} · {p.overall}</span>
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
