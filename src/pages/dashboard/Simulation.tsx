export default function Simulation() {
  return (
    <div className="max-w-3xl space-y-10">
      <div>
        <h1 className="font-display text-4xl">Comment fonctionne la simulation</h1>
        <p className="mt-2 text-muted">
          Chaque match est simulé minute par minute via un moteur probabiliste. Voici comment les décisions sont prises.
        </p>
      </div>

      <Section title="1. Pré-calcul des forces">
        <p>
          Avant le coup d'envoi, chaque équipe reçoit quatre notes calculées depuis les stats de ses titulaires :
        </p>
        <Table
          headers={['Note', 'Formule']}
          rows={[
            ['Attaque', '70 % moyenne des 3 meilleurs attaquants + 30 % moyenne des milieux offensifs (AM)'],
            ['Milieu', 'Moyenne de tous les milieux'],
            ['Défense', '80 % moyenne des défenseurs + 20 % note du gardien'],
            ['Gardien', 'Note globale (overall) du GK titulaire'],
          ]}
        />
        <p className="mt-3 text-sm text-muted">
          Ces notes sont ensuite multipliées par les modificateurs tactiques du style de jeu choisi (voir §5).
        </p>
      </Section>

      <Section title="2. Déroulement d'une minute">
        <p>Chaque minute simulée suit trois étapes :</p>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm">
          <li>
            <strong>Possession</strong> — L'équipe qui a le ballon est tirée au sort : probabilité proportionnelle
            aux notes de milieu de chaque côté. Les cartons rouges réduisent la force de 7 % par joueur expulsé.
          </li>
          <li>
            <strong>Événement</strong> — Un événement est tiré selon des poids pondérés (voir §3).
          </li>
          <li>
            <strong>Mise à jour</strong> — Le score, les stats et la position du ballon sont mis à jour.
          </li>
        </ol>
      </Section>

      <Section title="3. Événements et leurs probabilités">
        <p className="mb-3 text-sm text-muted">
          Poids de base par minute — la somme ne fait pas 100 %, le reste correspond à «&nbsp;rien ne se passe&nbsp;».
        </p>
        <Table
          headers={['Événement', 'Poids de base', 'Modificateurs']}
          rows={[
            ['Tir', '~8 %', 'Multiplié par (0,6 + pAttaque) × style tactique'],
            ['Faute', '~8 %', 'Multiplié par le style tactique adverse'],
            ['Corner', '4 %', '—'],
            ['Hors-jeu', '3 %', '0 si règle hors-jeu désactivée'],
            ['Passe décisive', '10 %', '—'],
            ['Coup franc', '3 %', '—'],
            ['Dribble', '~4 %', 'Proportionnel à pAttaque'],
            ['Dégagement', '~3 %', 'Proportionnel à (1 − pAttaque)'],
          ]}
        />
        <p className="mt-3 text-sm text-muted">
          <em>pAttaque</em> = attaque de l'équipe possédante ÷ (attaque + défense adverse).
        </p>
        <p className="mt-2 text-sm text-muted">
          Certains événements peuvent déclencher un tir en chaîne : corner (45 % → coup de tête → 35 % tir),
          faute grave (15 % → penalty), coup franc (30 % → tir), dribble réussi (40 % → tir).
        </p>
      </Section>

      <Section title="4. Probabilité de but">
        <p>
          Quand un tir est tenté, 55 % de chances qu'il soit cadré. Si cadré, la probabilité de marquer est :
        </p>
        <div className="my-4 rounded-lg border border-border bg-surface px-5 py-4 font-mono text-sm">
          pBut = sigmoid( (finition + sang-froid − 0,5 × overall_gardien) ÷ 8 ) × multiplicateur
        </div>
        <p className="text-sm text-muted">
          Résultat clampé entre 4 % et 75 %. Les tirs non cadrés ont 10 % de chance de toucher le poteau.
        </p>
        <Table
          headers={['Origine du tir', 'Multiplicateur']}
          rows={[
            ['Situation normale', '× 1,00'],
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
          ]}
        />
      </Section>

      <Section title="6. Cartons et expulsions">
        <p className="text-sm">
          À chaque faute, le fautif risque un carton selon son niveau d'agressivité&nbsp;:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted">
          <li>Probabilité jaune : de base 13 %, jusqu'à 19 % pour les joueurs très agressifs.</li>
          <li>Probabilité rouge direct : de base 0,5 %, jusqu'à 1 % pour les très agressifs.</li>
          <li>Deuxième carton jaune → expulsion automatique.</li>
          <li>Chaque joueur expulsé réduit la force de son équipe de 7 % (milieu, attaque, défense).</li>
        </ul>
      </Section>

      <Section title="7. Remplacements automatiques">
        <p className="text-sm">
          À la mi-temps, le moteur effectue jusqu'à 2 remplacements par équipe (dans la limite du max configuré).
          Il remplace les titulaires les plus faibles par les meilleurs remplaçants du banc ayant le même
          profil de poste (défenseur, milieu ou attaquant). Si aucun remplaçant compatible n'est disponible,
          le meilleur du banc est quand même utilisé.
        </p>
        <p className="mt-2 text-sm text-muted">
          Le banc est limité à 12 joueurs, sélectionnés automatiquement parmi les non-titulaires par note globale décroissante.
        </p>
      </Section>

      <Section title="8. Règles configurables">
        <Table
          headers={['Règle', 'Effet']}
          rows={[
            ['Hors-jeu désactivé', 'Supprime les événements hors-jeu (poids = 0)'],
            ['Remplacements max 3 ou 5', 'Plafonne les remplacements automatiques et manuels'],
            ['Prolongations', 'Ajoute 2 × 15 min si égalité à 90\''],
            ['But en or', 'Premier but en prolongation met fin au match immédiatement'],
            ['Tirs au but', 'Séance de penalties si toujours à égalité — 5 tirs chacun puis mort subite'],
          ]}
        />
      </Section>

      <Section title="9. Vitesses de simulation">
        <Table
          headers={['Vitesse', 'Délai par minute simulée']}
          rows={[
            ['× 0,5', '2 000 ms — très lent, cinématique'],
            ['× 1', '1 000 ms — temps réel ralenti'],
            ['× 2', '500 ms'],
            ['× 5', '200 ms — rapide'],
            ['Instant', 'Synchrone — résultat immédiat, aucune animation'],
          ]}
        />
      </Section>
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
