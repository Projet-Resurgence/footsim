import type { EventKind } from './types';

export const ZONE: Record<string, { x: number; y: number }> = {
  centre: { x: 50, y: 25 },
  homeAttack: { x: 80, y: 25 },
  awayAttack: { x: 20, y: 25 },
  homeBox: { x: 88, y: 25 },
  awayBox: { x: 12, y: 25 },
  homeLeftCorner: { x: 100, y: 0 },
  homeRightCorner: { x: 100, y: 50 },
  awayLeftCorner: { x: 0, y: 0 },
  awayRightCorner: { x: 0, y: 50 },
  midfieldHome: { x: 60, y: 25 },
  midfieldAway: { x: 40, y: 25 },
};

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function eventText(
  type: EventKind,
  minute: number,
  team: string,
  playerName?: string,
): string {
  const p = playerName ?? team;
  const g = playerName ?? 'le gardien';

  switch (type) {
    case 'kickoff':
      return pick([
        `${minute}' — Coup d'envoi.`,
        `${minute}' — Le match est lancé !`,
        `${minute}' — C'est parti !`,
        `${minute}' — Le coup de sifflet retentit, la partie commence.`,
      ]);

    case 'goal':
      return pick([
        `⚽ ${minute}' — But pour ${team} ! ${p} marque.`,
        `⚽ ${minute}' — GOOOAL ! ${p} trouve le fond des filets pour ${team} !`,
        `⚽ ${minute}' — ${p} ouvre le score pour ${team} !`,
        `⚽ ${minute}' — Magnifique réalisation de ${p} (${team}) !`,
        `⚽ ${minute}' — ${team} fait trembler les filets ! C'est ${p} !`,
        `⚽ ${minute}' — But de ${p} ! ${team} exulte !`,
        `⚽ ${minute}' — ${p} ne rate pas l'occasion et inscrit le but pour ${team} !`,
      ]);

    case 'shot':
      return pick([
        `${minute}' — Tir non cadré de ${p}.`,
        `${minute}' — ${p} tente sa chance mais envoie ça à côté.`,
        `${minute}' — Frappe de ${p}, le ballon passe au-dessus.`,
        `${minute}' — ${p} ajuste mais ça file à côté du poteau.`,
        `${minute}' — Tentative de ${p} qui ne cadre pas.`,
        `${minute}' — Tir de ${p} qui ne trouve pas le cadre.`,
      ]);

    case 'shotOnTarget':
      return pick([
        `${minute}' — Frappe cadrée de ${p}.`,
        `${minute}' — ${p} oblige le gardien à intervenir !`,
        `${minute}' — Tir cadré de ${p}, le portier doit se mobiliser.`,
        `${minute}' — Belle frappe de ${p} qui teste le gardien adverse.`,
        `${minute}' — ${p} vise le cadre, le gardien est vigilant.`,
        `${minute}' — Tir puissant de ${p}, en pleine lucarne !`,
      ]);

    case 'save':
      return pick([
        `🧤 ${minute}' — Belle parade de ${g}.`,
        `🧤 ${minute}' — ${g} sort une intervention de grande classe !`,
        `🧤 ${minute}' — Arrêt décisif de ${g} !`,
        `🧤 ${minute}' — ${g} s'interpose avec brio !`,
        `🧤 ${minute}' — Magnifique réflexe de ${g} qui sauve son équipe !`,
        `🧤 ${minute}' — ${g} vole au secours des siens !`,
        `🧤 ${minute}' — Parade extraordinaire de ${g} !`,
      ]);

    case 'foul':
      return pick([
        `${minute}' — Faute de ${p}.`,
        `${minute}' — ${p} commet une faute, l'arbitre siffle.`,
        `${minute}' — L'arbitre stoppe le jeu, faute de ${p}.`,
        `${minute}' — ${p} accroche son adversaire, coup franc accordé.`,
        `${minute}' — Faute flagrante de ${p}, l'arbitre n'est pas dupe.`,
        `${minute}' — ${p} fauche son vis-à-vis.`,
      ]);

    case 'yellow':
      return pick([
        `🟨 ${minute}' — Carton jaune pour ${p} (${team}).`,
        `🟨 ${minute}' — ${p} est averti ! Un de plus et ce sera le rouge.`,
        `🟨 ${minute}' — L'arbitre sort le carton jaune pour ${p} (${team}).`,
        `🟨 ${minute}' — ${p} (${team}) écope d'un avertissement.`,
        `🟨 ${minute}' — Carton jaune ! ${p} devra faire attention.`,
      ]);

    case 'red':
      return pick([
        `🟥 ${minute}' — ${p} expulsé ! ${team} à 10.`,
        `🟥 ${minute}' — Carton rouge pour ${p} ! ${team} se retrouve en infériorité numérique.`,
        `🟥 ${minute}' — L'arbitre sort le rouge, ${p} prend sa douche prématurément.`,
        `🟥 ${minute}' — ${p} est renvoyé aux vestiaires ! ${team} devra se battre à dix.`,
        `🟥 ${minute}' — Expulsion de ${p} (${team}) ! La partie prend un nouveau tournant.`,
      ]);

    case 'corner':
      return pick([
        `${minute}' — Corner pour ${team}.`,
        `${minute}' — ${team} obtient un corner.`,
        `${minute}' — Coup de pied de coin accordé à ${team}.`,
        `${minute}' — Le ballon dévié, corner pour ${team} !`,
        `${minute}' — ${team} va tenter de tirer parti de ce corner.`,
      ]);

    case 'offside':
      return pick([
        `${minute}' — Hors-jeu signalé contre ${team}.`,
        `${minute}' — Le drapeau se lève, position de hors-jeu pour ${team}.`,
        `${minute}' — L'assistant signale le hors-jeu, l'action de ${team} est annulée.`,
        `${minute}' — ${team} piégé par le hors-jeu.`,
        `${minute}' — Hors-jeu ! ${team} ne peut pas concrétiser.`,
      ]);

    case 'keyPass':
      return pick([
        `${minute}' — Passe clé de ${p}.`,
        `${minute}' — ${p} distille un caviar pour ses coéquipiers !`,
        `${minute}' — Quelle vision de jeu de ${p} !`,
        `${minute}' — ${p} décale parfaitement son partenaire.`,
        `${minute}' — Passe décisive de ${p} qui met son coéquipier dans de bonnes dispositions.`,
        `${minute}' — ${p} fait le bon choix, la balle arrive en bonne position.`,
        `${minute}' — Superbe ouverture de ${p} dans le dos de la défense !`,
      ]);

    case 'penalty':
      return pick([
        `🔴 ${minute}' — Penalty pour ${team} ! ${p} s'élance.`,
        `🔴 ${minute}' — L'arbitre désigne le point de penalty en faveur de ${team} !`,
        `🔴 ${minute}' — Penalty ! ${team} a l'occasion de scorer depuis le point de réparation.`,
        `🔴 ${minute}' — Faute dans la surface ! ${team} obtient le penalty, ${p} se prépare.`,
        `🔴 ${minute}' — ${p} va tirer le penalty accordé à ${team} !`,
      ]);

    case 'penalty_miss':
      return pick([
        `❌ ${minute}' — Penalty raté ! ${p} expédie le ballon hors du cadre.`,
        `❌ ${minute}' — ${p} manque le penalty ! Le ballon passe à côté.`,
        `❌ ${minute}' — Quel gâchis ! ${p} rate l'occasion depuis le point de penalty.`,
        `❌ ${minute}' — ${p} tremble au moment de frapper, le penalty est raté !`,
        `❌ ${minute}' — Penalty manqué par ${p}, la balle s'en va dans les tribunes.`,
      ]);

    case 'penalty_saved':
      return pick([
        `🧤 ${minute}' — Penalty arrêté ! Le gardien${playerName ? ` ${playerName}` : ''} sort le grand jeu !`,
        `🧤 ${minute}' — ${g} repousse le penalty ! Intervention miraculeuse !`,
        `🧤 ${minute}' — ${g} devine le bon côté et stoppe le penalty !`,
        `🧤 ${minute}' — Arrêt du portier sur penalty ! ${g} est le héros de cette action.`,
        `🧤 ${minute}' — Incroyable arrêt de ${g} sur le penalty !`,
      ]);

    case 'freeKick':
      return pick([
        `${minute}' — Coup franc dangereux pour ${team}${playerName ? ` (${p})` : ''}.`,
        `${minute}' — ${team} hérite d'un coup franc bien placé.`,
        `${minute}' — Coup franc accordé à ${team}, c'est ${p} qui se charge de le frapper.`,
        `${minute}' — ${team} bénéficie d'un coup franc à l'entrée de la surface.`,
        `${minute}' — Coup franc direct pour ${team}, occasion à ne pas manquer.`,
      ]);

    case 'header':
      return pick([
        `${minute}' — Coup de tête de ${p}.`,
        `${minute}' — ${p} s'élève et place un coup de tête !`,
        `${minute}' — Belle reprise de la tête par ${p} !`,
        `${minute}' — ${p} gagne son duel aérien et tente une tête !`,
        `${minute}' — ${p} met la tête au ballon, l'action se précise.`,
      ]);

    case 'dribble':
      return pick([
        `${minute}' — Dribble réussi de ${p} !`,
        `${minute}' — ${p} se joue de son adversaire avec aisance !`,
        `${minute}' — Quelle élimination de ${p} !`,
        `${minute}' — ${p} laisse son marqueur sur place !`,
        `${minute}' — ${p} dribble son vis-à-vis et se retrouve seul face au but !`,
        `${minute}' — Magnifique feinte de ${p} qui élimine le défenseur !`,
      ]);

    case 'clearance':
      return pick([
        `${minute}' — Dégagement in extremis de ${p}.`,
        `${minute}' — ${p} sauve son équipe en dégageant en catastrophe !`,
        `${minute}' — Intervention salvatrice de ${p} devant sa propre cage !`,
        `${minute}' — ${p} sort le ballon au dernier moment.`,
        `${minute}' — Belle anticipation de ${p} qui dévie le danger.`,
        `${minute}' — Dégagement autoritaire de ${p}, l'équipe respire.`,
      ]);

    case 'crossbar':
      return pick([
        `⛔ ${minute}' — ${p} touche le poteau !`,
        `⛔ ${minute}' — Le ballon de ${p} s'écrase sur la transversale !`,
        `⛔ ${minute}' — Quel dommage ! ${p} trouve le montant !`,
        `⛔ ${minute}' — La barre transversale repousse la tentative de ${p} !`,
        `⛔ ${minute}' — Le poteau sauve le portier ! ${p} n'a pas de chance.`,
        `⛔ ${minute}' — ${p} heurte le cadre, le but est refusé par la barre !`,
      ]);

    case 'substitution':
      return pick([
        `🔄 ${minute}' — ${team} : ${p}.`,
        `🔄 ${minute}' — Changement pour ${team} : ${p} entre en jeu.`,
        `🔄 ${minute}' — ${team} procède à un remplacement : ${p}.`,
        `🔄 ${minute}' — Remplacement chez ${team}, ${p} fait son apparition.`,
        `🔄 ${minute}' — Le staff de ${team} effectue une substitution.`,
      ]);

    case 'extraTime':
      return pick([
        `⏱ Prolongations !`,
        `⏱ On joue les prolongations !`,
        `⏱ Le match se poursuit en prolongation, 30 minutes supplémentaires !`,
        `⏱ Égalité à la fin du temps réglementaire, cap sur les prolongations !`,
      ]);

    case 'halftime':
      return pick([
        `Mi-temps.`,
        `Le coup de sifflet retentit, c'est la mi-temps.`,
        `Les deux équipes rentrent aux vestiaires.`,
        `Mi-temps, les joueurs soufflent quelques instants.`,
      ]);

    case 'fulltime':
      return pick([
        `Fin du match.`,
        `C'est terminé !`,
        `Le coup de sifflet final retentit !`,
        `L'arbitre siffle la fin de la rencontre.`,
        `Le match s'achève ici !`,
      ]);

    case 'tacticChange':
      // p = label du style appliqué (transmis via le paramètre playerName)
      return pick([
        `📋 ${minute}' — Plan B activé ! ${team} passe en « ${p} ».`,
        `📋 ${minute}' — Changement tactique de ${team} : place au « ${p} ».`,
        `📋 ${minute}' — Le banc de ${team} réagit — consigne « ${p} » appliquée.`,
      ]);

    case 'coachRed':
      return pick([
        `🟥 ${minute}' — L'entraîneur de ${team} est expulsé ! Il sera suspendu au prochain match.`,
        `🟥 ${minute}' — Le coach de ${team} voit rouge ! Il doit quitter le bord du terrain.`,
        `🟥 ${minute}' — Expulsion du staff de ${team} ! L'entraîneur prend la direction des vestiaires.`,
        `🟥 ${minute}' — ${team} perd son entraîneur, expulsé par l'arbitre !`,
      ]);

    case 'injury':
      return pick([
        `🚑 ${minute}' — ${p} (${team}) sort blessé sur civière.`,
        `🚑 ${minute}' — ${p} (${team}) est à terre, les soigneurs entrent sur le terrain.`,
        `🚑 ${minute}' — Inquiétude pour ${p} (${team}), le joueur doit quitter le terrain.`,
        `🚑 ${minute}' — Blessure pour ${p}, ${team} perd un joueur.`,
        `🚑 ${minute}' — ${p} (${team}) chute et ne peut pas se relever, sortie sur civière.`,
      ]);
  }
}
