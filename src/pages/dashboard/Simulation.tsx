import { useState } from 'react';
import { COACH_TRAIT_LABEL, COACH_TRAIT_DESCRIPTION, POSITIVE_TRAITS, NEGATIVE_TRAITS } from '@/lib/gen/coach';
import { POSITIONS, POSITION_LABEL, POSITION_FULL } from '@/lib/types';

type Tab = 'moteur' | 'entraineurs' | 'moral' | 'notes' | 'presse' | 'postes' | 'statistiques' | 'matchups';

const TAB_LABEL: Record<Tab, string> = {
  moteur: 'Moteur de jeu',
  entraineurs: 'Entraîneurs',
  moral: 'Moral',
  notes: 'Notes joueurs',
  presse: 'Presse',
  postes: 'Postes',
  statistiques: 'Statistiques de match',
  matchups: 'Matchups tactiques',
};

export default function Simulation() {
  const [tab, setTab] = useState<Tab>('moteur');

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="font-display text-4xl">Comment fonctionne la simulation</h1>
        <p className="mt-2 text-muted">Documentation du moteur probabiliste et du système d'entraîneurs.</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {(['moteur', 'entraineurs', 'moral', 'notes', 'presse', 'postes', 'statistiques', 'matchups'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === t ? 'border-b-2 border-accent text-accent' : 'text-muted hover:text-text'}`}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {tab === 'moteur' && <MoteurTab />}
      {tab === 'entraineurs' && <EntraineurTab />}
      {tab === 'moral' && <MoralTab />}
      {tab === 'notes' && <NotesTab />}
      {tab === 'presse' && <PresseTab />}
      {tab === 'postes' && <PostesTab />}
      {tab === 'statistiques' && <StatistiquesTab />}
      {tab === 'matchups' && <MatchupsTab />}
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
            ['Attaque', '70 % moyenne des 3 meilleurs attaquants + 30 % moyenne des AM × coachAttackMult × pénalité formation'],
            ['Milieu', 'Moyenne de tous les milieux × coachMidfieldMult × pénalité formation'],
            ['Défense', '80 % moyenne défenseurs + 20 % overall GK × coachDefenseMult × pénalité formation'],
            ['Gardien', 'Overall du GK titulaire'],
          ]}
        />
        <p className="mt-3 text-sm text-muted">
          Les multiplicateurs de style tactique s'appliquent en plus des bonus entraîneur (multiplicatifs).
        </p>
      </Section>

      <Section title="1b. Pénalités de formation">
        <p className="text-sm text-muted mb-2">
          Une formation déséquilibrée pénalise fortement les ratings. Calculé depuis le nombre réel
          de défenseurs / milieux / attaquants dans le XI titulaire (hors GK) :
        </p>
        <Table
          headers={['Zone', 'Effectif', 'Multiplicateur']}
          rows={[
            ['Attaque', '0 attaquants (ST/LW/RW)', '× 0,25 — quasi-nul'],
            ['Attaque', '1 attaquant', '× 0,75'],
            ['Attaque', '2–4 attaquants', '× 1,00 (normal)'],
            ['Attaque', '5+ attaquants', '× 1,15 (surcharge offensive)'],
            ['Milieu', '0 milieux (DM/CM/AM/LM/RM)', '× 0,30 — effondrement'],
            ['Milieu', '1 milieu', '× 0,65'],
            ['Milieu', '2–5 milieux', '× 1,00 (normal)'],
            ['Milieu', '6+ milieux', '× 1,10 (domination milieu)'],
            ['Défense', '0 défenseurs (CB/LB/RB)', '× 0,40 sur défense'],
            ['Défense', '1 défenseur', '× 0,65'],
            ['Défense', '2 défenseurs', '× 0,85'],
            ['Défense', '3–5 défenseurs', '× 1,00 (normal)'],
            ['Défense', '6+ défenseurs', '× 1,10 (bloc solide)'],
          ]}
        />
        <div className="mt-3 rounded-lg border border-warning/20 bg-warning/5 px-4 py-3 text-sm text-warning">
          Pénalité croisée : 0 milieux + surcharge défensive → rating attaque également réduit de 50 % supplémentaire
          (pas de transition possible). Une équipe 10-0-0 joue à ~12 % de son attaque théorique.
        </div>
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
            ['Tir', '~8 %', '× (0,6 + pAttaque) × shotFreqMult × coachShotFreqMult'],
            ['Faute', '~8 %', '× foulRateMult adverse × coachFoulRateMult'],
            ['Corner', '4 %', '× (1 + (shotFreqMult−1)×0,8) si shotFreqMult > 1 — jeu direct/long ball/chaos génèrent plus de corners'],
            ['Hors-jeu', '3 %', '0 si règle désactivée'],
            ['Passe clé', '18 %', '× midfieldMult — possession/tiki-taka/pressing génèrent plus de passes clés. 35 % → tir en chaîne'],
            ['Coup franc', '3 %', '30 % → tir (× 0,75)'],
            ['Dribble', '~28 %', '× pAttaque × max(1, attackMult) — contre-attaque/long ball forcent plus de courses directes. 40 % → tir (× 1,05)'],
            ['Dégagement', '~3 %', 'Proportionnel à (1 − pAttaque)'],
          ]}
        />
        <p className="mt-3 text-sm text-muted">
          <em>pAttaque</em> = attaque possédante ÷ (attaque + défense adverse). Les passes clés sont
          attribuées aux milieux (passing + firstTouch élevés). Les mods tactiques s'appliquent désormais
          aussi sur les corners, passes clés et dribbles — pas seulement sur les tirs.
        </p>
      </Section>

      <Section title="4. Probabilité de but">
        <p>Quand un tir est tenté, 55 % de chances qu'il soit cadré. Si cadré :</p>
        <div className="my-4 rounded-lg border border-border bg-surface px-5 py-4 font-mono text-sm">
          pBut = sigmoid( (finition + sang-froid − 0,5 × overall_gardien) ÷ 8 ) × multiplicateur
        </div>
        <p className="text-sm text-muted">Clampé [4 %, 75 %]. Tir non cadré : 10 % chance poteau.</p>
        <p className="text-sm text-muted mt-2">
          Le <strong>tireur</strong> est choisi parmi les 4 meilleurs ST/LW/RW/AM/CM par <strong>finition + sang-froid</strong>.
          Le <strong>gardien adverse</strong> réduit pBut via son overall.
        </p>
        <Table
          headers={['Origine', 'Multiplicateur']}
          rows={[
            ['Situation normale / passe clé', '× 1,00'],
            ['Dribble', '× 1,05'],
            ['Corner / coup de tête', '× 0,85'],
            ['Coup franc', '× 0,75'],
            ['Penalty (match)', '× 1,80'],
            ['Penalty (tirs au but)', '× 1,50 — clampé [50 %, 86 %]'],
          ]}
        />
      </Section>

      <Section title="5. Styles tactiques">
        <p className="text-sm text-muted mb-3">
          Les mods s'appliquent à la fois sur les ratings pré-calculés (attaque/milieu/défense) <em>et</em> sur
          les poids d'événements à chaque minute — un style offensif génère plus de tirs, plus de dribbles
          et plus de corners, pas seulement un rating d'attaque plus élevé.
        </p>
        <Table
          headers={['Style', 'Tirs', 'Corners', 'Passes clés', 'Dribbles', 'Milieu', 'Attaque', 'Défense', 'Fautes adverses']}
          rows={[
            ['Possession',     '−12 %', '=',     '+12 %', '=',     '+12 %', '=',     '=',     '='],
            ['Contre-attaque', '+8 %',  '=',     '−8 %',  '+10 %', '−8 %',  '+10 %', '=',     '='],
            ['Jeu direct',     '+18 %', '+14 %', '=',     '=',     '=',     '=',     '=',     '='],
            ['Pressing',       '=',     '=',     '+15 %', '=',     '+15 %', '=',     '=',     '+12 %'],
            ['Ultra-défensif', '−35 %', '=',     '−15 %', '=',     '−15 %', '−25 %', '+20 %', '+5 %'],
            ['Gegenpressing',  '+10 %', '+8 %',  '+18 %', '+5 %',  '+18 %', '+5 %',  '=',     '+20 %'],
            ['Tiki-taka',      '−18 %', '=',     '+20 %', '=',     '+20 %', '−5 %',  '+5 %',  '−10 %'],
            ['Long ball',      '+15 %', '+12 %', '−20 %', '+15 %', '−20 %', '+15 %', '−5 %',  '+5 %'],
            ['Chaos',          '+30 %', '+24 %', '−5 %',  '+10 %', '−5 %',  '+10 %', '−10 %', '+35 %'],
          ]}
        />
        <p className="mt-3 text-sm text-muted">
          Corners = dérivés de shotFreqMult (même formule). Passes clés = dérivées de midfieldMult. Dribbles = dérivés de attackMult (uniquement si {'>'} 1).
        </p>
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
    <div className={`rounded-lg border px-4 py-3 space-y-1 ${positive ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
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

function MoralTab() {
  return (
    <div className="space-y-10">
      <Section title="1. Principe général">
        <p>
          Chaque équipe engagée dans une compétition possède une valeur de <strong>moral</strong> (1–100),
          initialisée à <strong>50</strong> au début de la compétition. Ce moral évolue après chaque match
          et influence légèrement les forces en jeu — c'est un modificateur de saveur, pas un décideur.
        </p>
      </Section>

      <Section title="2. Évolution après un match">
        <Table
          headers={['Résultat', 'Gagnant', 'Perdant']}
          rows={[
            ["Victoire d'1 but", '+5', '−4'],
            ['Victoire de 2 buts', '+6', '−5'],
            ['Victoire de 3+ buts', '+7 à +9', '−6 à −8'],
            ['Match nul', '+1', '+1'],
          ]}
        />
        <p className="mt-3 text-sm text-muted">
          Le malus est plafonné à −8 même pour de lourdes défaites.
        </p>
      </Section>

      <Section title="3. Résilience des équipes en difficulté">
        <p>
          Pour éviter le spirale défaite → moral bas → défaite, deux mécanismes protègent les équipes en crise :
        </p>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          <li>
            <strong>Amortissement des pertes (B)</strong> — En dessous de 30 de moral, le malus après
            une défaite est réduit proportionnellement. À moral = 1, seulement 20 % du malus normal s'applique.
            À moral = 15, environ 60 % du malus s'applique.
          </li>
          <li>
            <strong>Courbe asymétrique (A)</strong> — Le multiplicateur de force ne descend pas aussi bas
            que la pénalité théorique le voudrait. En dessous de 30, la courbe se stabilise autour de 0,97
            au lieu de continuer à baisser.
          </li>
        </ul>
        <div className="mt-4 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-sm">
          Effet combiné : une équipe à moral 5 joue à ~97 % de sa capacité (contre ~99 % à moral 50),
          et ses défaites futures ne font presque plus baisser son moral — elle ne peut pas s'effondrer indéfiniment.
        </div>
      </Section>

      <Section title="4. Effet sur le moteur">
        <p>
          Le moral est converti en multiplicateur appliqué aux ratings <strong>attaque</strong>,
          <strong>milieu</strong> et <strong>défense</strong> avant chaque match :
        </p>
        <Table
          headers={['Moral', 'Multiplicateur', 'Label']}
          rows={[
            ['85–100', '× 1,05', 'Excellent'],
            ['70–84', '× 1,03 à 1,05', 'Bon'],
            ['55–69', '× 1,00 à 1,03', 'Correct'],
            ['40–54', '× 0,98 à 1,00', 'Fragile'],
            ['30–39', '× 0,98', 'Bas'],
            ['1–29', '× 0,97 à 0,98', 'En crise (plancher résilient)'],
          ]}
        />
      </Section>

      <Section title="5. Affichage">
        <p className="text-sm text-muted">
          Le moral de chaque équipe est visible dans l'onglet <strong>Compétitions</strong>, sur la fiche
          de chaque équipe en compétition active. Il est aussi affiché dans les classements LPM.
        </p>
      </Section>
    </div>
  );
}

function NotesTab() {
  return (
    <div className="max-w-3xl space-y-10">
      <Section title="Formule">
        <div className="rounded-lg border border-border bg-surface px-5 py-4 font-mono text-sm">
          Overall = round( Σ(stat × poids) / Σ(poids) × 5 )
        </div>
        <p className="text-sm text-muted">
          Seules les statistiques listées dans le tableau du poste comptent. Chaque stat vaut entre 1 et 20 — une moyenne pondérée à 20 donne un overall de 100.
        </p>
      </Section>

      <Section title="Statistiques disponibles">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatGroup title="Technique" stats={['Passes', 'Centres', 'Dribble', 'Finition', 'Contrôle', 'Jeu de tête', 'Frappe loin', 'Tacle', 'Marquage']} />
          <StatGroup title="Mental" stats={['Vision', 'Décisions', 'Sang-froid', 'Anticipation', 'Démarquage', 'Agressivité', 'Combativité']} />
          <StatGroup title="Physique" stats={['Vitesse', 'Accélération', 'Force', 'Endurance', 'Agilité', 'Équilibre', 'Détente']} />
          <StatGroup title="Gardien (GK uniquement)" stats={['Réflexes', 'Prise de balle', 'Jeu aérien', 'Face-à-face', 'Dégagement', 'Relance main']} />
        </div>
      </Section>

      <Section title="Poids par poste">
        <PosTable pos="GK" label="Gardien" rows={[
          ['Réflexes', 5], ['Prise de balle', 4], ['Face-à-face', 3], ['Jeu aérien', 3],
          ['Anticipation', 2], ['Décisions', 2], ['Sang-froid', 2], ['Dégagement', 2],
          ['Relance main', 2], ['Détente', 2], ['Agilité', 2],
        ]} />
        <PosTable pos="CB" label="Défenseur central" rows={[
          ['Tacle', 4], ['Marquage', 4], ['Jeu de tête', 3], ['Force', 3],
          ['Détente', 3], ['Anticipation', 3], ['Décisions', 3], ['Sang-froid', 2],
          ['Vitesse', 2], ['Passes', 1],
        ]} />
        <PosTable pos="LB/RB" label="Latéral" rows={[
          ['Tacle', 3], ['Centres', 3], ['Vitesse', 3], ['Endurance', 3],
          ['Anticipation', 2], ['Décisions', 2], ['Combativité', 2],
          ['Marquage', 2], ['Dribble', 1],
        ]} />
        <PosTable pos="DM" label="Milieu défensif" rows={[
          ['Tacle', 4], ['Marquage', 3], ['Décisions', 3], ['Anticipation', 3],
          ['Combativité', 3], ['Passes', 2], ['Sang-froid', 2], ['Endurance', 2],
        ]} />
        <PosTable pos="CM" label="Milieu central" rows={[
          ['Passes', 4], ['Vision', 3], ['Décisions', 3], ['Endurance', 2],
          ['Combativité', 2], ['Contrôle', 2], ['Dribble', 1], ['Tacle', 1],
        ]} />
        <PosTable pos="AM" label="Milieu offensif" rows={[
          ['Vision', 4], ['Dribble', 3], ['Frappe loin', 3], ['Passes', 2],
          ['Décisions', 2], ['Sang-froid', 2], ['Contrôle', 2],
        ]} />
        <PosTable pos="LM/RM" label="Milieu latéral" rows={[
          ['Centres', 3], ['Endurance', 3], ['Vitesse', 2], ['Passes', 2],
          ['Dribble', 2], ['Combativité', 2],
        ]} />
        <PosTable pos="LW/RW" label="Ailier" rows={[
          ['Vitesse', 4], ['Dribble', 4], ['Centres', 3], ['Accélération', 3],
          ['Finition', 2], ['Agilité', 2],
        ]} />
        <PosTable pos="ST" label="Buteur" rows={[
          ['Finition', 5], ['Sang-froid', 3], ['Démarquage', 3], ['Jeu de tête', 2],
          ['Vitesse', 2], ['Force', 2], ['Dribble', 1],
        ]} />
      </Section>

      <Section title="Impact direct des stats sur le moteur">
        <p className="text-sm text-muted mb-2">
          Ces stats influencent le moteur <strong>directement</strong>, en dehors de l'overall :
        </p>
        <Table
          headers={['Stat', 'Où elle s\'applique', 'Effet']}
          rows={[
            ['Finition', 'Tout tir cadré', 'Entre dans pBut = sigmoid((finition + sang-froid − 0,5 × GK) / 8)'],
            ['Sang-froid', 'Tout tir + tirs au but', 'Entre dans pBut avec finition — crucial sous pression'],
            ['Agressivité', 'Fautes', 'Augmente la prob. de jaune (13–19 %) et de rouge direct (0,5–1 %)'],
            ['Jeu de tête', 'Corners', 'Trie qui conteste le centre — hausse la prob. de tir sur corner'],
            ['Détente', 'Corners', 'Combinée avec jeu de tête pour sélectionner le meilleur en-tête'],
            ['Frappe loin', 'Coups francs', 'Trie le tireur de coup franc — hausse la prob. de tir sur FK'],
            ['Dribble', 'Dribbles', 'Trie le dribbleur + hausse la prob. de tir en sortie de dribble'],
            ['Agilité', 'Dribbles', 'Combinée avec dribble pour sélectionner le meilleur dribbleur'],
            ['Vision', 'Passes clés', 'Hausse la prob. qu\'une passe clé crée une occasion (base 35 %)'],
            ['Passes', 'Passes clés', 'Trie qui réalise la passe clé — favorise les milieux créateurs'],
            ['Première touche', 'Passes clés', 'Combinée avec passes pour sélectionner le meilleur passeur'],
            ['Tacle', 'Dégagements', 'Trie qui dégage — défenseurs avec bon tacle prioritaires'],
            ['Marquage', 'Dégagements', 'Combiné avec tacle pour sélectionner le meilleur défenseur'],
          ]}
        />
        <p className="mt-3 text-sm text-muted">
          Toutes les autres stats (vitesse, endurance, force, vision de jeu…) influencent uniquement l'<strong>overall</strong>,
          qui lui-même calcule les ratings attaque/milieu/défense de l'équipe.
        </p>
      </Section>
    </div>
  );
}

function StatGroup({ title, stats }: { title: string; stats: string[] }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
      <div className="text-xs uppercase tracking-widest text-muted">{title}</div>
      <ul className="space-y-0.5">
        {stats.map((s) => (
          <li key={s} className="text-sm text-text/80">{s}</li>
        ))}
      </ul>
    </div>
  );
}

function PosTable({ pos, label, rows }: { pos: string; label: string; rows: [string, number][] }) {
  const total = rows.reduce((s, [, w]) => s + w, 0);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <span className="rounded bg-border/40 px-2 py-0.5 font-mono text-xs font-medium">{pos}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface">
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-widest text-muted">Stat</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-widest text-muted">Poids</th>
              <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-widest text-muted">% du total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([stat, weight], i) => (
              <tr key={stat} className={i % 2 === 0 ? '' : 'bg-surface/50'}>
                <td className="px-4 py-2 font-medium">{stat}</td>
                <td className="px-4 py-2 text-muted">{weight}</td>
                <td className="px-4 py-2 text-muted">{Math.round((weight / total) * 100)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PresseTab() {
  return (
    <div className="space-y-10">
      <Section title="1. Principe général">
        <p>
          Après chaque match de compétition, le système génère automatiquement un ou plusieurs articles de presse.
          Ces articles reflètent le résultat, le moral de l'équipe, le comportement du coach et les événements marquants.
          Certains articles ont un <strong>effet direct sur le moral</strong> de l'équipe concernée.
        </p>
      </Section>

      <Section title="2. Catégories d'articles">
        <Table
          headers={['Catégorie', 'Déclencheur', 'Effet moral']}
          rows={[
            ['Victoire', 'Victoire standard', 'Aucun (moral déjà mis à jour par le match)'],
            ['Exploit', 'Victoire contre une équipe nettement plus forte', '+5 à +10 bonus supplémentaire'],
            ['Défaite', 'Défaite standard', 'Aucun effet additionnel'],
            ['Crise', 'Série de défaites ou moral très bas', '−5 à −15 choc morale'],
            ['Scandale', 'Doping, expulsion coach, comportement', '−10 à −20 choc morale'],
            ['Révolte', 'Moral effondré + défaite humiliante', '−15 à −25 choc morale'],
            ['Critique', 'Mauvaise prestation malgré victoire', '−3 à −8 choc morale'],
            ['Forme', 'Bonne dynamique sans exploit', '+3 à +8 bonus morale'],
            ['Neutralité', 'Match nul ou résultat sans relief', 'Aucun effet'],
          ]}
        />
      </Section>

      <Section title="3. Mentions de joueurs et coachs">
        <p>
          Certains articles mentionnent des joueurs ou des entraîneurs par leur nom. Ces mentions sont cliquables
          dans l'onglet <strong>Presse</strong> d'une compétition — elles ouvrent une fiche synthétique
          avec les stats de la personne au moment de l'article.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Joueurs mentionnés : nom, poste, overall, stats clés (technique / mental / physique).</li>
          <li>Coachs mentionnés : nom, overall, stats (motivation, tactique, offensif, défensif, mentalité, gestion) et traits.</li>
        </ul>
      </Section>

      <Section title="4. Effets spéciaux">
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted">
          <li>
            <strong>Choc morale (moraleShock)</strong> — Les articles hostiles (scandale, crise, révolte) appliquent
            un malus immédiat sur le moral de l'équipe, en plus du résultat du match.
          </li>
          <li>
            <strong>Bonus morale (moraleBoost)</strong> — Les articles positifs (exploit, forme) appliquent
            un bonus supplémentaire au moral.
          </li>
          <li>
            <strong>Destitution du président</strong> — Certains articles de révolte ou de scandale grave peuvent
            déclencher la destitution fictive du président. Un article de rebond est automatiquement généré
            au round suivant pour stabiliser la situation.
          </li>
          <li>
            <strong>Suspension par dopage</strong> — Un article de scandale lié au doping peut entraîner
            la suspension automatique d'un joueur pour le prochain match.
          </li>
        </ul>
      </Section>

      <Section title="5. Lecture dans l'interface">
        <p className="text-sm text-muted">
          Les articles de presse sont accessibles dans l'onglet <strong>Presse</strong> de chaque compétition active ou terminée.
          Ils sont triés du plus récent au plus ancien. Un badge indique le nombre d'articles non lus.
        </p>
      </Section>
    </div>
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


function PostesTab() {
  return (
    <div className="space-y-4 max-w-sm">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Abrév.</th>
              <th className="px-4 py-2 font-medium">Poste</th>
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((p) => (
              <tr key={p} className="border-t border-border">
                <td className="px-4 py-2">
                  <span className="rounded bg-border/40 px-2 py-0.5 font-mono text-xs font-medium">
                    {POSITION_LABEL[p]}
                  </span>
                </td>
                <td className="px-4 py-2 text-text/80">{POSITION_FULL[p]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function MatchupsTab() {
  return (
    <div className="space-y-10">
      <Section title="Principe général">
        <p>
          Chaque match applique des <strong>modificateurs croisés</strong> entre les deux équipes,
          calculés une seule fois avant le coup d'envoi. Ces ajustements s'appliquent
          <em> après</em> le calcul des ratings (overall, style tactique, moral, coach) et reflètent
          l'avantage ou le désavantage structurel qu'une équipe a face à l'autre.
        </p>
        <p className="text-muted">
          Deux couches indépendantes, multipliées ensemble. Amplitude totale ±5–10 % par couche,
          ±20 % maximum combiné — assez visible pour compter, pas assez fort pour écraser l'écart de niveau.
        </p>
      </Section>

      <Section title="Couche 1 — Formation vs Formation">
        <p className="text-sm text-muted mb-3">
          Chaque formation est classée dans un profil structurel selon le nombre de défenseurs et milieux alignés.
        </p>
        <Table
          headers={['Profil', 'Formations concernées', 'Caractéristique']}
          rows={[
            ['Pressing haut', '4-3-3 · 3-4-3 · 4-2-3-1', 'Ligne haute, pression immédiate — espaces derrière'],
            ['Milieu chargé', '3-5-2 · 4-3-2-1 · 3-6-1', 'Domination du milieu — lent à verticaliser'],
            ['Bloc défensif', '5-3-2 · 5-4-1 · 4-5-1 · 3-4-1-2', 'Organisation basse — peu de transition rapide'],
            ['Équilibré', '4-4-2 · 4-4-1-1 · 4-1-4-1', 'Ni avantage ni désavantage particulier'],
          ]}
        />
        <p className="mt-3 text-sm text-muted mb-2">Matrice des avantages :</p>
        <Table
          headers={['Mon profil', 'Contre Pressing haut', 'Contre Milieu chargé', 'Contre Bloc défensif', 'Contre Équilibré']}
          rows={[
            ['Pressing haut',  '=',                    '−7 % att, −5 % def',   '+8 % att → contre',    '+5 % att'],
            ['Milieu chargé',  '+5 % att, +7 % mid',   '=',                    '+4 % att, +6 % mid',   '+2 % att, +4 % mid'],
            ['Bloc défensif',  '+6 % att (espaces)',    '−4 % att, −4 % mid',   '=',                    '−2 % att, +2 % def'],
            ['Équilibré',      '−3 % att, +3 % def',   '−4 % att, +2 % def',   '+2 % att, +2 % def',   '='],
          ]}
        />
        <div className="mt-3 rounded-lg border border-border bg-surface/50 px-4 py-3 text-sm text-muted">
          <strong>Exemple :</strong> 5-4-1 (bloc défensif) vs 4-3-3 (pressing haut) — le bloc récupère +6 % en attaque
          car la ligne haute laisse de l'espace derrière, mais le pressing haut gagne +8 % en défense car il ferme vite les transitions.
        </div>
      </Section>

      <Section title="Couche 2 — Style tactique vs Style tactique">
        <p className="text-sm text-muted mb-3">
          Les styles nommés sont regroupés en profils de jeu pour calculer les avantages.
        </p>
        <Table
          headers={['Profil de jeu', 'Styles concernés']}
          rows={[
            ['Construction-possession', 'Possession · Tiki-taka'],
            ['Attaque directe', 'Contre-attaque · Jeu direct · Long ball'],
            ['Haute intensité', 'Pressing · Gegenpressing'],
            ['Défensif', 'Ultra-défensif'],
            ['Chaos', 'Chaos'],
          ]}
        />
        <p className="mt-4 text-sm font-medium mb-2">Logique des matchups :</p>
        <div className="space-y-2">
          {[
            { from: 'Construction-possession', beats: 'Défensif', why: 'La possession étrangle progressivement le bloc — le défensif manque d\'options pour sortir' },
            { from: 'Construction-possession', loses: 'Attaque directe', why: 'Les longs ballons exploitent les espaces derrière la ligne haute' },
            { from: 'Construction-possession', loses: 'Chaos', why: 'Le jeu anarchique désorganise les circuits de passe courts' },
            { from: 'Attaque directe', beats: 'Construction-possession', why: 'Exploite l\'espace laissé par la montée de ligne' },
            { from: 'Attaque directe', loses: 'Haute intensité', why: 'La récupération haute intercepte les longs ballons avant qu\'ils n\'arrivent' },
            { from: 'Attaque directe', loses: 'Défensif', why: 'Le bloc organisé ferme tous les couloirs directs' },
            { from: 'Haute intensité', beats: 'Attaque directe', why: 'Récupère avant que le ballon ne parte — coupe les transitions' },
            { from: 'Haute intensité', loses: 'Construction-possession', why: 'Les triangles courts absorbent le press et épuisent les pressueurs' },
            { from: 'Défensif', beats: 'Attaque directe', why: 'Bloc bas absorbe les centres et longs ballons sans se déplacer' },
            { from: 'Défensif', loses: 'Construction-possession', why: 'La possession étouffe — pas d\'espace pour sortir et contre-attaquer' },
            { from: 'Chaos', beats: 'Construction-possession', why: 'Le pressing anarchique désorganise les automatismes de passe' },
            { from: 'Chaos', loses: 'Défensif', why: 'L\'organisation basse résiste au désordre adverse' },
          ].map((r, i) => (
            <div key={i} className={`flex gap-3 rounded-lg border px-4 py-2 text-sm ${r.beats ? 'border-green-500/20 bg-green-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
              <span className={`shrink-0 font-semibold ${r.beats ? 'text-green-400' : 'text-danger'}`}>
                {r.from}
              </span>
              <span className="text-muted/60 shrink-0">{r.beats ? '▶ bat' : '▶ perd contre'}</span>
              <span className="font-medium shrink-0">{r.beats ?? r.loses}</span>
              <span className="text-muted text-xs self-center">— {r.why}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-lg border border-border bg-surface/50 px-4 py-3 text-sm text-muted">
          <strong>Amplitude :</strong> chaque avantage style donne ±4 à +8 % sur l'attaque, la défense ou le milieu.
          Deux profils identiques (possession vs possession) = pas d'effet.
        </div>
      </Section>

      <Section title="Styles personnalisés">
        <p className="text-sm text-muted mb-3">
          Les styles créés via l'éditeur custom n'ont pas de nom prédéfini. Le moteur dérive automatiquement
          un profil de jeu à partir des valeurs de leurs modificateurs :
        </p>
        <Table
          headers={['Condition (par ordre de priorité)', 'Profil dérivé']}
          rows={[
            ['defenseMult ≥ 1,12', 'Défensif'],
            ['foulRateMult ≥ 1,15 ET midfieldMult ≥ 1,10', 'Haute intensité'],
            ['midfieldMult ≥ 1,12', 'Construction-possession'],
            ['shotFreqMult ≥ 1,15 OU attackMult ≥ 1,10', 'Attaque directe'],
            ['foulRateMult ≥ 1,25 OU shotFreqMult ≥ 1,25', 'Chaos'],
            ['Aucune condition atteinte', 'Neutre — pas de matchup style appliqué'],
          ]}
        />
        <p className="mt-3 text-sm text-muted">
          Une fois le profil dérivé, les mêmes règles de matchup s'appliquent que pour un style nommé.
          Un style custom "neutre" (tous mods proches de 1) ne reçoit ni avantage ni désavantage tactique.
        </p>
      </Section>

      <Section title="Quand ces ajustements s'appliquent-ils ?">
        <p className="text-sm text-muted">
          Les matchups sont calculés une seule fois dans le worker, immédiatement après le pré-calcul
          des ratings (avant le coup d'envoi). Si l'admin change de tactique en cours de match via
          «&nbsp;Mettre à jour la tactique&nbsp;», les matchups sont recalculés avec les nouvelles données.
        </p>
      </Section>
    </div>
  );
}

function StatistiquesTab() {
  return (
    <div className="space-y-10">
      <Section title="Statistiques de match">
        <p className="text-muted text-sm">
          Chaque match produit une série de statistiques calculées en temps réel par le moteur de simulation.
          Elles sont affichées en live dans le panneau latéral et conservées dans le récapitulatif de la rencontre.
        </p>
        <Table
          headers={['Statistique', 'Description', 'Comment elle est calculée']}
          rows={[
            ['Possession', 'Part du ballon contrôlée par chaque équipe (en %)', 'À chaque tick, le camp qui gagne le duel de milieu incrémente son compteur. Le pourcentage final = ticks_domination / total_ticks × 100.'],
            ['Tirs', 'Nombre total de tentatives (cadrées ou non)', "Incrémenté à chaque fois que l'événement « tir » est déclenché, que ce soit sur action directe, corner, coup franc ou dribble converti."],
            ['Tirs cadrés', 'Tirs qui auraient obligé le gardien à intervenir sans le poteau ou un dégagement', '55 % de chance qu\'un tir soit cadré. Seuls les tirs cadrés peuvent donner lieu à un but ou un arrêt.'],
            ['xG (expected goals)', 'Buts attendus : somme des probabilités de but de chaque tir', "Pour chaque tir, pGoal = sigmoid((finition + sang-froid − 0,5 × note_GK) / 8) × multiplicateur, clampé entre 0,04 et 0,75. Cette valeur est ajoutée au total xG de l'équipe. Un xG de 2,1 signifie que l'équipe aurait dû marquer ~2 buts selon la qualité de ses occasions."],
            ['Arrêts', "Nombre d'interventions du gardien sur tirs cadrés non convertis", 'Incrémenté quand un tir cadré ne mène pas à un but ni à un poteau. Reflète la performance du portier.'],
            ['Passes', 'Nombre total de passes réalisées', "Incrémenté à chaque tick où l'équipe conserve la possession — chaque minute de contrôle du ballon compte comme une action de passe."],
            ['Fautes', "Nombre d'infractions commises", "Tirées selon le poids wFaute = 0,08 × foulRateMult de l'adversaire. Chaque faute peut mener à un carton ou un coup franc."],
            ['Corners', "Nombre de coups de pied de coin accordés", "Déclenchés par l'événement « corner » (poids 0,04 × modificateur shotFreqMult). 45 % des corners donnent lieu à une tête cadrée."],
            ['Hors-jeu', 'Nombre de positions de hors-jeu sifflées', 'Poids fixe de 0,03 par tick (0 si règle noOffside active). Événement purement narratif, sans conséquence sur le score.'],
            ['Coups francs', 'Nombre de coups francs obtenus', "Déclenchés avec un poids de 0,03 par tick. 30 % d'entre eux donnent lieu à un tir direct (multiplicateur 0,75)."],
            ['Passes clés', "Passes menant directement à une occasion franche", "Poids wPasseCle = 0,18 × midfieldMult. Les styles milieu-forts (tiki-taka, gegenpressing) en génèrent davantage."],
            ['Dribbles', "Tentatives de dribble réussies menant à une situation dangereuse", "Poids wDribble = 0,28 × pAttaque × max(1, attackMult). 40 % débouchent sur un tir (multiplicateur 1,05). La stat dribbling du joueur influence le taux de conversion."],
            ['Dégagements', "Interventions défensives pour écarter le danger", "Poids wDégagement = 0,03 × (1 − pAttaque) : plus l'équipe est sous pression, plus elle dégage."],
            ['Cartons jaunes', 'Nombre de cartons jaunes reçus', "Tirés lors des événements foul/faute : 13–19 % de chance selon l'agressivité du joueur. Deux jaunes = rouge automatique."],
            ['Cartons rouges', 'Nombre d\'expulsions directes', "0,5–1 % de chance par faute (rouge direct). Un rouge retire le joueur du terrain et pénalise la note milieu de l'équipe (×0,93 par expulsion)."],
          ]}
        />
      </Section>

      <Section title="Les xG en détail">
        <p className="text-muted text-sm">
          Les xG (expected goals) mesurent la <strong>dangerosité réelle</strong> des occasions, indépendamment de la chance ou de la performance du gardien.
          Un xG de 0,04 = tir difficile depuis l'angle (4 % de chances de but). Un xG de 0,75 = occasion quasi-immanquable.
        </p>
        <ul className="text-sm space-y-2 list-disc list-inside text-muted">
          <li><strong>Tir normal</strong> — multiplicateur ×1.0. xG ∈ [0,04 ; 0,75].</li>
          <li><strong>Penalty</strong> (en jeu) — multiplicateur ×1,4. xG ∈ [0,04 ; 0,75].</li>
          <li><strong>Corner → tête</strong> — multiplicateur ×0,85. Tir plus difficile, moins de précision.</li>
          <li><strong>Coup franc direct</strong> — multiplicateur ×0,75. Mur défensif réduit l'angle.</li>
          <li><strong>Dribble → tir</strong> — multiplicateur ×1,05. Légèrement favorisé car le défenseur est éliminé.</li>
        </ul>
        <p className="text-muted text-sm mt-2">
          Comparaison xG vs buts réels : si une équipe totalise 2,8 xG pour 1 but marqué, elle a été malchanceuse ou le gardien adverse a réalisé un match exceptionnel. Si elle marque 3 buts pour 0,9 xG, elle a sur-performé.
        </p>
      </Section>
    </div>
  );
}
