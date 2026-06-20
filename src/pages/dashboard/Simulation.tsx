import { useState } from 'react';
import { COACH_TRAIT_LABEL, COACH_TRAIT_DESCRIPTION, POSITIVE_TRAITS, NEGATIVE_TRAITS } from '@/lib/gen/coach';

type Tab = 'moteur' | 'entraineurs';

export default function Simulation() {
  const [tab, setTab] = useState<Tab>('moteur');

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-4xl">Comment fonctionne la simulation</h1>
        <p className="mt-2 text-muted">Documentation du moteur probabiliste et du système d'entraîneurs.</p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {(['moteur', 'entraineurs'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {t === 'moteur' ? 'Moteur de jeu' : 'Entraîneurs'}
          </button>
        ))}
      </div>

      {tab === 'moteur' && <MoteurTab />}
      {tab === 'entraineurs' && <EntraineurTab />}
    </div>
  );
}

function MoteurTab() {
  return (
    <div className="space-y-10">
      <Section title="1. Pré-calcul des forces">
        <p>
          Avant le coup d'envoi, chaque équipe reçoit quatre notes calculées depuis les stats de ses titulaires,
          puis multipliées par les bonus de l'entraîneur (si non suspendu) :
        </p>
        <Table
          headers={['Note', 'Formule']}
          rows={[
            ['Attaque', '70 % moyenne des 3 meilleurs attaquants + 30 % moyenne des AM × coachAttackMult'],
            ['Milieu', 'Moyenne de tous les milieux × coachMidfieldMult'],
            ['Défense', '80 % moyenne défenseurs + 20 % overall GK × coachDefenseMult'],
            ['Gardien', 'Overall du GK titulaire'],
          ]}
        />
        <p className="mt-3 text-sm text-muted">
          Les multiplicateurs de style tactique s'appliquent en plus des bonus entraîneur (multiplicatifs).
        </p>
      </Section>

      <Section title="2. Déroulement d'une minute">
        <p>Chaque minute simulée suit trois étapes :</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            <strong>Possession</strong> — Tirée au sort proportionnellement aux notes de milieu.
            Les cartons rouges réduisent la force de 7 % par joueur expulsé.
          </li>
          <li><strong>Événement</strong> — Tiré selon des poids pondérés (voir §3).</li>
          <li><strong>Mise à jour</strong> — Score, stats et position du ballon mis à jour.</li>
        </ol>
      </Section>

      <Section title="3. Événements et leurs probabilités">
        <p className="mb-3 text-sm text-muted">
          Poids de base par minute — le reste correspond à «&nbsp;rien ne se passe&nbsp;».
        </p>
        <Table
          headers={['Événement', 'Poids de base', 'Modificateurs']}
          rows={[
            ['Tir', '~8 %', '× (0,6 + pAttaque) × style × coachShotFreqMult'],
            ['Faute', '~8 %', '× style adverse × coachFoulRateMult'],
            ['Corner', '4 %', '—'],
            ['Hors-jeu', '3 %', '0 si règle désactivée'],
            ['Passe clé', '18 %', '35 % de chance de déclencher un tir en chaîne'],
            ['Coup franc', '3 %', '30 % → tir (× 0,75)'],
            ['Dribble', '~4 %', '40 % → tir (× 1,05), proportionnel à pAttaque'],
            ['Dégagement', '~3 %', 'Proportionnel à (1 − pAttaque)'],
          ]}
        />
        <p className="mt-3 text-sm text-muted">
          <em>pAttaque</em> = attaque possédante ÷ (attaque + défense adverse). Les passes clés sont
          attribuées aux milieux (passing + firstTouch élevés).
        </p>
      </Section>

      <Section title="4. Probabilité de but">
        <p>Quand un tir est tenté, 55 % de chances qu'il soit cadré. Si cadré :</p>
        <div className="my-4 rounded-lg border border-border bg-surface px-5 py-4 font-mono text-sm">
          pBut = sigmoid( (finition + sang-froid − 0,5 × overall_gardien) ÷ 8 ) × multiplicateur
        </div>
        <p className="text-sm text-muted">Clampé [4 %, 75 %]. Tir non cadré : 10 % chance poteau.</p>
        <Table
          headers={['Origine', 'Multiplicateur']}
          rows={[
            ['Situation normale / passe clé', '× 1,00'],
            ['Dribble', '× 1,05'],
            ['Corner / coup de tête', '× 0,85'],
            ['Coup franc', '× 0,75'],
            ['Penalty (match)', '× 1,40'],
            ['Penalty (tirs au but)', '× 1,50 — clampé [50 %, 86 %]'],
          ]}
        />
      </Section>

      <Section title="5. Styles tactiques">
        <Table
          headers={['Style', 'Tirs', 'Milieu', 'Attaque', 'Fautes adverses']}
          rows={[
            ['Possession', '−12 %', '+12 %', '=', '='],
            ['Contre-attaque', '+8 %', '−8 %', '+10 %', '='],
            ['Jeu direct', '+18 %', '=', '=', '='],
            ['Pressing', '=', '+15 %', '=', '+12 %'],
            ['Ultra-défensif', '−35 %', '−15 %', '−25 %', '+5 %'],
            ['Gegenpressing', '+10 %', '+18 %', '+5 %', '+20 %'],
            ['Tiki-taka', '−18 %', '+20 %', '−5 %', '−10 %'],
            ['Long ball', '+15 %', '−20 %', '+15 %', '+5 %'],
            ['Chaos', '+30 %', '−5 %', '+10 %', '+35 %'],
          ]}
        />
      </Section>

      <Section title="6. Cartons, expulsions et entraîneur">
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Jaune : 13–19 % à chaque faute selon l'agressivité du fautif.</li>
          <li>Rouge direct : 0,5–1 % à chaque faute.</li>
          <li>2e jaune → expulsion automatique.</li>
          <li>Chaque expulsion réduit la force de l'équipe de 7 %.</li>
          <li><strong>Carton rouge entraîneur</strong> : 8 % chance après rouge joueur, 1,5 % après carton jaune contesté.</li>
          <li>Coach expulsé → suspendu au match suivant (aucun bonus appliqué).</li>
        </ul>
      </Section>

      <Section title="7. Remplacements automatiques">
        <p className="text-sm">
          À la mi-temps : jusqu'à 2 remplacements par équipe. Remplace les titulaires les plus faibles
          par les meilleurs remplaçants du banc ayant le même profil (défenseur / milieu / attaquant).
          Banc limité à 12 joueurs, triés par overall décroissant.
        </p>
      </Section>

      <Section title="8. Règles configurables">
        <Table
          headers={['Règle', 'Effet']}
          rows={[
            ['Hors-jeu désactivé', 'Poids = 0'],
            ['Remplacements max 3 ou 5', 'Plafonne les subs auto et manuels'],
            ['Prolongations', '2 × 15 min si égalité à 90\''],
            ['But en or', 'Premier but en prolongation termine le match'],
            ['Tirs au but', '5 tirs chacun puis mort subite (max 20 rounds)'],
          ]}
        />
      </Section>

      <Section title="9. Vitesses">
        <Table
          headers={['Vitesse', 'Délai / minute']}
          rows={[
            ['× 0,5', '2 000 ms'],
            ['× 1', '1 000 ms'],
            ['× 2', '500 ms'],
            ['× 5', '200 ms'],
            ['Instant', 'Synchrone — résultat immédiat'],
          ]}
        />
      </Section>
    </div>
  );
}

function EntraineurTab() {
  return (
    <div className="space-y-10">
      <Section title="Système d'entraîneurs">
        <p>
          Chaque équipe possède un entraîneur avec 6 stats (1–20), 0–2 traits positifs et 0–3 traits négatifs.
          Les bonus sont appliqués <strong>avant le coup d'envoi</strong> lors du pré-calcul des forces, via des multiplicateurs
          cumulatifs sur les ratings attack / midfield / defense / shotFreq / foulRate.
        </p>
        <Table
          headers={['Stat', 'Effet sur les ratings']}
          rows={[
            ['Motivation (1–20)', '+0 à +6 % attaque'],
            ['Tactique (1–20)', '+0 à +10 % milieu'],
            ['Offensive (1–20)', '+0 à +8 % attaque, +0 à +4 % fréquence tirs'],
            ['Défensif (1–20)', '+0 à +8 % défense'],
            ['Mentalité (1–20)', '−0 à −10 % fautes commises'],
            ['Gestion (1–20)', 'Contribue à l\'overall — impacte les remplacements'],
          ]}
        />
        <p className="text-sm text-muted">
          L'overall de l'entraîneur = moyenne des stats × 5 + (traits positifs × 3) − (traits négatifs × 2), clampé [1, 100].
        </p>
      </Section>

      <Section title="Traits positifs (0–2 par entraîneur)">
        <div className="space-y-2">
          {POSITIVE_TRAITS.map((t) => (
            <TraitCard key={t} trait={t} positive examples={POSITIVE_EXAMPLES[t]} />
          ))}
        </div>
      </Section>

      <Section title="Traits négatifs (0–3 par entraîneur)">
        <div className="space-y-2">
          {NEGATIVE_TRAITS.map((t) => (
            <TraitCard key={t} trait={t} positive={false} examples={NEGATIVE_EXAMPLES[t]} />
          ))}
        </div>
      </Section>

      <Section title="Traits annulants">
        <p className="text-sm text-muted">
          <strong>Alcoolique</strong> et <strong>Drogué</strong> sont des traits négatifs spéciaux : en plus de leur malus
          de base, ils <strong>annulent aléatoirement 1 trait positif</strong> à chaque match. L'annulation est déterminée
          par le matchId (reproductible — même match = même trait annulé). Si le coach a 2 traits annulants,
          2 traits positifs sont supprimés ce match-là.
        </p>
        <div className="rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-sm text-warning">
          Exemple : coach Charismatique + Analyste (2 traits positifs) + Alcoolique + Drogué (2 annulants)
          → les 2 traits positifs sont annulés ce match, seuls les malus de base restent.
        </div>
      </Section>

      <Section title="Suspension">
        <p className="text-sm">
          Un entraîneur peut recevoir un carton rouge en match dans deux situations :
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li><strong>8 %</strong> de chance après chaque expulsion de joueur de son équipe.</li>
          <li><strong>1,5 %</strong> de chance après chaque carton jaune (protestation).</li>
        </ul>
        <p className="mt-2 text-sm text-muted">
          Si expulsé, l'équipe joue le match suivant sans entraîneur : <strong>aucun bonus ni malus</strong> de traits ou de stats.
          La suspension est automatiquement levée après ce match lors de la sauvegarde sur GitHub.
          L'admin peut lever ou forcer une suspension manuellement depuis l'onglet Entraîneur de l'équipe.
        </p>
      </Section>
    </div>
  );
}

const POSITIVE_EXAMPLES: Record<string, string> = {
  motivateur: 'Une équipe avec ce trait génère ~5 % de chances en plus sur chaque action offensive.',
  tacticien: 'La domination du milieu est amplifiée — avantage à la possession et aux transitions.',
  offensif: 'Plus de tirs tentés et bonus d\'attaque : idéal combiné avec Contre-attaque ou Jeu direct.',
  defensif: 'Le bloc défensif tient mieux sous pression — efficace avec Ultra-défensif ou Pressing.',
  disciplinaire: 'Réduit les fautes de 35 % — moins de coups francs et de cards concédés.',
  opportuniste: '+12 % de tirs : l\'équipe tire plus dès qu\'une occasion se présente.',
  gestionnaire: '+5 % sur tout — le meilleur trait "généraliste" sans contre-partie.',
  charismatique: '+4 % sur tous les ratings — effets modérés mais sur l\'ensemble des phases de jeu.',
  analyste: 'Avantage tactique au milieu et en défense — lit le jeu adverse.',
  meneur: 'Attaque renforcée et moins de fautes — profil idéal pour les équipes techniques.',
};

const NEGATIVE_EXAMPLES: Record<string, string> = {
  impulsif: '+40 % de fautes — beaucoup de coups francs et de cards, risque de rouge.',
  conservateur: 'L\'équipe tire moins et attaque moins fort — matchs serrés mais peu de buts.',
  desorganise: 'Le milieu perd 7 % — pertes de balle plus fréquentes, moins de possession.',
  conflictuel: '−5 % partout — malus global, vestiaire difficile qui plombe tout le collectif.',
  imprevoyant: 'La défense tient moins bien : les attaques adverses passent plus facilement.',
  rigide: 'Milieu et attaque affaiblis — difficile à compenser même avec un bon style tactique.',
  passif: 'L\'équipe génère moins de tirs — risque de subir même en ayant la possession.',
  impatient: '+20 % fautes et −4 % défense — le coach craque en fin de match.',
  alcoolique: 'Performances instables : −10 % sur tout + 1 trait positif annulé chaque match.',
  drogue: 'Comportement imprévisible : +25 % fautes + 1 trait positif annulé chaque match.',
};

function TraitCard({ trait, positive, examples }: { trait: string; positive: boolean; examples?: string }) {
  return (
    <div className={`rounded-lg border px-4 py-3 space-y-1 ${positive ? 'border-green-500/20 bg-green-500/5' : 'border-danger/20 bg-danger/5'}`}>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${positive ? 'text-green-400' : 'text-danger'}`}>
          {COACH_TRAIT_LABEL[trait as keyof typeof COACH_TRAIT_LABEL]}
        </span>
        {(trait === 'alcoolique' || trait === 'drogue') && (
          <span className="rounded bg-warning/10 px-1.5 py-0.5 text-xs text-warning border border-warning/20">Annulant</span>
        )}
      </div>
      <p className="text-xs text-muted">{COACH_TRAIT_DESCRIPTION[trait as keyof typeof COACH_TRAIT_DESCRIPTION]}</p>
      {examples && <p className="text-xs text-muted/70 italic border-t border-border/50 pt-1 mt-1">{examples}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed">{children}</div>
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border bg-surface">
            {headers.map((h) => (
              <th key={h} className="px-4 py-2 text-left text-xs font-medium uppercase tracking-widest text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? '' : 'bg-surface/50'}>
              {row.map((cell, j) => (
                <td key={j} className={`px-4 py-2 ${j === 0 ? 'font-medium' : 'text-muted'}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
