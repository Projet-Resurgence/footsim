import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import type { Player } from '@/lib/types';
import { POSITION_LABEL, POSITION_FULL } from '@/lib/types';
import { computeOverall } from '@/lib/gen/overall';

type Props = {
  player: Player;
  onClose: () => void;
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

export function PlayerView({ player, onClose }: Props) {
  const FOOT_LABEL = { right: 'Droit', left: 'Gauche', both: 'Ambidextre' };

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
          <div className="flex-1 space-y-1">
            <div className="font-display text-2xl">{player.firstName} {player.lastName}</div>
            <div className="text-sm text-muted">
              {POSITION_LABEL[player.position]} — {POSITION_FULL[player.position]}
              &nbsp;·&nbsp;{player.age} ans
              &nbsp;·&nbsp;{FOOT_LABEL[player.preferredFoot]}
            </div>
          </div>
          <div className="text-center">
            <div className="text-xs uppercase tracking-widest text-muted">Overall</div>
            <div className="font-display text-4xl text-accent">{computeOverall(player)}</div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <StatGroup title="Technique">
            {TECH_KEYS.map((k) => (
              <StatBar key={k} label={TECH_LABEL[k]} value={player.stats.technical[k]} />
            ))}
          </StatGroup>
          <StatGroup title="Mental">
            {MENTAL_KEYS.map((k) => (
              <StatBar key={k} label={MENTAL_LABEL[k]} value={player.stats.mental[k]} />
            ))}
          </StatGroup>
          <StatGroup title="Physique">
            {PHYS_KEYS.map((k) => (
              <StatBar key={k} label={PHYS_LABEL[k]} value={player.stats.physical[k]} />
            ))}
          </StatGroup>
          {player.stats.goalkeeping && (
            <StatGroup title="Gardien">
              {GK_KEYS.map((k) => (
                <StatBar key={k} label={GK_LABEL[k]} value={player.stats.goalkeeping![k]} />
              ))}
            </StatGroup>
          )}
        </div>

        <div className="mt-8 flex justify-end">
          <Button variant="ghost" onClick={onClose}>Fermer</Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function StatGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2 rounded-md border border-border p-4">
      <div className="text-xs uppercase tracking-widest text-muted">{title}</div>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const tone =
    value >= 16 ? 'bg-green-500'
    : value >= 12 ? 'bg-green-500/50'
    : value >= 8 ? 'bg-slate-400'
    : 'bg-red-500';
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <span className="w-6 text-right font-medium tabular-nums">{value}</span>
        <div className="h-2 w-32 rounded-full bg-border/40 overflow-hidden">
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${(value / 20) * 100}%` }} />
        </div>
      </div>
    </div>
  );
}
