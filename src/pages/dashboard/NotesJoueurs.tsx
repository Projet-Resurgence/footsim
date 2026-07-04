export default function NotesJoueurs() {
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">Calcul des notes joueurs</h1>
        <p className="mt-2 text-muted">
          Chaque joueur a une note globale (<strong>Overall</strong>) entre 1 et 100, calculée depuis ses statistiques individuelles selon son poste.
        </p>
      </div>

      <Section title="Formule">
        <div className="rounded-lg border border-border bg-surface px-5 py-4 font-mono text-sm">
          Overall = round( Σ(stat × poids) / Σ(poids) × 5 )
        </div>
        <p className="text-sm text-muted">
          Seules les statistiques listées dans le tableau du poste comptent. Les autres stats existent mais n'influencent pas l'overall.
          Chaque stat vaut entre 1 et 20 — une moyenne pondérée à 20 donne un overall de 100.
        </p>
      </Section>

      <Section title="Statistiques disponibles">
        <div className="grid gap-4 sm:grid-cols-2">
          <StatGroup title="Technique" stats={[
            'Passes', 'Centres', 'Dribble', 'Finition', 'Contrôle',
            'Jeu de tête', 'Frappe loin', 'Tacle', 'Marquage',
          ]} />
          <StatGroup title="Mental" stats={[
            'Vision', 'Décisions', 'Sang-froid', 'Anticipation',
            'Démarquage', 'Agressivité', 'Combativité',
          ]} />
          <StatGroup title="Physique" stats={[
            'Vitesse', 'Accélération', 'Force', 'Endurance',
            'Agilité', 'Équilibre', 'Détente',
          ]} />
          <StatGroup title="Gardien (GK uniquement)" stats={[
            'Réflexes', 'Prise de balle', 'Jeu aérien',
            'Face-à-face', 'Dégagement', 'Relance main',
          ]} />
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

      <Section title="Note globale et simulation">
        <p className="text-sm text-muted">
          L'overall intervient dans la simulation comme suit :
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Les notes <strong>Attaque</strong>, <strong>Milieu</strong> et <strong>Défense</strong> de l'équipe sont calculées depuis les overalls des titulaires (voir page Simulation §1).</li>
          <li>La probabilité de but d'un tir utilise directement les stats <strong>Finition</strong> et <strong>Sang-froid</strong> du tireur, ainsi que l'overall du gardien adverse.</li>
          <li>Les remplacements automatiques à la mi-temps comparent les overalls pour choisir qui rentre.</li>
          <li>Les tirs au but utilisent <strong>Finition</strong> + <strong>Sang-froid</strong> du tireur et l'overall du gardien.</li>
        </ul>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed">{children}</div>
    </section>
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
