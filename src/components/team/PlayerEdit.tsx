import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { Player, Position } from '@/lib/types';
import { POSITIONS, POSITION_LABEL, POSITION_FULL } from '@/lib/types';
import { computeOverall } from '@/lib/gen/overall';
import { clamp } from '@/lib/rng';

type Props = {
  player: Player;
  onClose: () => void;
  onSave: (next: Player) => void;
  onDelete: () => void;
};

const TECH_KEYS = ['passing','crossing','dribbling','finishing','firstTouch','heading','longShots','tackling','marking'] as const;
const MENTAL_KEYS = ['vision','decisions','composure','anticipation','offTheBall','aggression','workRate'] as const;
const PHYS_KEYS = ['pace','acceleration','strength','stamina','agility','balance','jumping'] as const;
const GK_KEYS = ['reflexes','handling','aerial','oneOnOne','kicking','throwing'] as const;

const TECH_LABEL: Record<string, string> = {
  passing: 'Passes', crossing: 'Centres', dribbling: 'Dribble', finishing: 'Finition',
  firstTouch: 'Contrôle', heading: 'Tête', longShots: 'Frappe loin', tackling: 'Tacle', marking: 'Marquage',
};
const MENTAL_LABEL: Record<string, string> = {
  vision: 'Vision', decisions: 'Décisions', composure: 'Sang-froid', anticipation: 'Anticipation',
  offTheBall: 'Démarquage', aggression: 'Agressivité', workRate: 'Combativité',
};
const PHYS_LABEL: Record<string, string> = {
  pace: 'Vitesse', acceleration: 'Accélération', strength: 'Force', stamina: 'Endurance',
  agility: 'Agilité', balance: 'Équilibre', jumping: 'Détente',
};
const GK_LABEL: Record<string, string> = {
  reflexes: 'Réflexes', handling: 'Prise de balle', aerial: 'Jeu aérien',
  oneOnOne: 'Face-à-face', kicking: 'Dégagement', throwing: 'Relance main',
};

export function PlayerEdit({ player, onClose, onSave, onDelete }: Props) {
  const [draft, setDraft] = useState<Player>(player);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setDraft(player);
  }, [player]);

  function setStat(group: 'technical' | 'mental' | 'physical' | 'goalkeeping', key: string, raw: number) {
    const v = clamp(Math.round(raw) || 1, 1, 20);
    setDraft((d) => {
      if (group === 'goalkeeping') {
        if (!d.stats.goalkeeping) return d;
        return { ...d, stats: { ...d.stats, goalkeeping: { ...d.stats.goalkeeping, [key]: v } } };
      }
      return {
        ...d,
        stats: { ...d.stats, [group]: { ...d.stats[group], [key]: v } },
      };
    });
  }

  function save() {
    const next = { ...draft };
    next.overall = computeOverall(next);
    onSave(next);
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="max-h-[90vh] w-[min(96vw,720px)] overflow-y-auto rounded-lg border border-border bg-surface p-6 shadow-subtle-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex-1 space-y-3">
            <Input
              value={draft.firstName}
              onChange={(e) => setDraft({ ...draft, firstName: e.target.value })}
              placeholder="Prénom"
            />
            <Input
              value={draft.lastName}
              onChange={(e) => setDraft({ ...draft, lastName: e.target.value })}
              placeholder="Nom"
            />
            <div className="flex gap-2">
              <select
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                value={draft.position}
                onChange={(e) => setDraft({ ...draft, position: e.target.value as Position })}
              >
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>{POSITION_LABEL[p]} — {POSITION_FULL[p]}</option>
                ))}
              </select>
              <Input
                type="number"
                min={16}
                max={45}
                className="w-24"
                value={draft.age}
                onChange={(e) => setDraft({ ...draft, age: clamp(Number(e.target.value) || 16, 16, 45) })}
              />
              <select
                className="h-9 rounded-md border border-border bg-surface px-2 text-sm"
                value={draft.preferredFoot}
                onChange={(e) => setDraft({ ...draft, preferredFoot: e.target.value as Player['preferredFoot'] })}
              >
                <option value="right">Droit</option>
                <option value="left">Gauche</option>
                <option value="both">Ambidextre</option>
              </select>
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs uppercase tracking-widest text-muted">Overall</div>
            <div className="font-display text-4xl text-accent">{computeOverall(draft)}</div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Group title="Technique">
            {TECH_KEYS.map((k) => (
              <Stat key={k} label={TECH_LABEL[k]} value={draft.stats.technical[k]} onChange={(v) => setStat('technical', k, v)} />
            ))}
          </Group>
          <Group title="Mental">
            {MENTAL_KEYS.map((k) => (
              <Stat key={k} label={MENTAL_LABEL[k]} value={draft.stats.mental[k]} onChange={(v) => setStat('mental', k, v)} />
            ))}
          </Group>
          <Group title="Physique">
            {PHYS_KEYS.map((k) => (
              <Stat key={k} label={PHYS_LABEL[k]} value={draft.stats.physical[k]} onChange={(v) => setStat('physical', k, v)} />
            ))}
          </Group>
          {draft.stats.goalkeeping ? (
            <Group title="Gardien">
              {GK_KEYS.map((k) => (
                <Stat
                  key={k}
                  label={GK_LABEL[k]}
                  value={draft.stats.goalkeeping![k]}
                  onChange={(v) => setStat('goalkeeping', k, v)}
                />
              ))}
            </Group>
          ) : null}
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {confirming ? (
              <>
                <Button variant="danger" onClick={onDelete}>Confirmer la suppression</Button>
                <Button variant="ghost" onClick={() => setConfirming(false)}>Annuler</Button>
              </>
            ) : (
              <Button variant="ghost" onClick={() => setConfirming(true)}>Supprimer le joueur</Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Fermer</Button>
            <Button onClick={save}>Enregistrer</Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-md border border-border p-4">
      <div className="text-xs uppercase tracking-widest text-muted">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Stat({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const tone =
    value >= 16 ? 'bg-accent text-on-accent'
    : value >= 12 ? 'bg-accent/30 text-text'
    : value >= 8 ? 'bg-border text-text'
    : 'bg-danger/20 text-danger';
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className={`inline-flex h-7 w-9 items-center justify-center rounded text-xs font-medium ${tone}`}>
          {value}
        </span>
        <input
          type="range"
          min={1}
          max={20}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-32 accent-[--accent]"
        />
      </div>
    </label>
  );
}
