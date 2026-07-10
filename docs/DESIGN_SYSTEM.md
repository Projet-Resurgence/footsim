# FootSim — Design System

Direction visuelle : **DA Projet Résurgence** — or de marque `#D5B654` comme accent principal, neutres charbon (`#0f0f0f`/`#1a1a1a`/`#2d2d2d`) hérités de `resurgence-web/styles/theme.css`, typographie éditoriale (Fraunces italique) pour les titres et les scores, chiffres tabulaires façon tableau d'affichage. Seule la pelouse reste verte (fonctionnel, pas décoratif). Propre, élégant, cohérent avec l'écosystème PR.

Sources de vérité dans le code :

| Quoi | Fichier |
|---|---|
| Jetons CSS (couleurs, thèmes) | `src/styles/globals.css` |
| Mapping Tailwind des jetons | `tailwind.config.ts` |
| Bascule jour/nuit | `src/lib/theme.ts` (jour 6h–19h, override manuel via AccountMenu) |
| Primitives UI | `src/components/ui/` (Button, Input, Spinner, Toast, Skeleton) |
| Layout & navigation | `src/components/layout/` (DashboardLayout, Sidebar, MobileTabBar, NavIcons, AccountMenu) |
| Polices | `index.html` (Google Fonts : Inter + Fraunces) |

---

## 1. Couleurs

Tous les composants consomment les **variables CSS** — jamais de hex en dur. Tailwind les expose via `bg-accent`, `text-muted`, `border-border`, etc.

### Jetons

| Jeton | Jour | Nuit | Usage |
|---|---|---|---|
| `--bg` | `#f7f8f9` | `#0f0f0f` | Fond de page |
| `--surface` | `#ffffff` | `#1a1a1a` | Cartes, panneaux, tableaux |
| `--surface-2` | `#e9ecef` | `#232323` | Surfaces élevées / zones secondaires |
| `--text` | `#1a202c` | `#f8f9fa` | Texte principal |
| `--muted` | `#718096` | `#a0a0a0` | Texte secondaire, labels |
| `--border` | `#e3e6ea` | `#2d2d2d` | Bordures, séparateurs |
| `--accent` | `#B89A3D` | `#D5B654` | **Or de marque PR** — actions primaires, états actifs, liens |
| `--on-accent` | `#17181c` | `#17181c` | Texte posé SUR un fond accent/or (jamais blanc : contraste insuffisant) |
| `--gold` | `#B89A3D` | `#E6C76A` | **Or trophée** — palmarès, podiums, points d'orgue |
| `--danger` | `#dc2626` | `#ef4444` | Suppressions, cartons rouges, erreurs |
| `--warning` | `#d97706` | `#f59e0b` | Non-sauvegardé, cartons jaunes |
| `--pitch` / `--pitch-line` | `#1F8B4C` / blanc 70 % | `#154d2c` / blanc 45 % | Terrain SVG uniquement |
| `--header-blur` | blanc translucide | noir translucide | Fond du header sticky (backdrop-blur) |

Variantes RGB (`--accent-rgb`, `--gold-rgb`, `--danger-rgb`, `--warning-rgb`) pour les opacités Tailwind (`bg-accent/10`).

### Règles d'usage

- **Un seul accent fort par écran** : l'or de marque. `--gold` reste réservé aux récompenses (trophées, 1ʳᵉ place, palmarès) — jamais pour une action courante.
- **Texte sur fond accent/or : toujours `text-on-accent`**, jamais `text-white` (or clair + blanc = illisible).
- Fonds teintés : `bg-accent/5` à `bg-accent/10` + `border-accent/30` pour les encarts mis en avant.
- Sémantique séparée de l'accent : danger/warning ne remplacent jamais l'or et inversement.
- Rangs de classement : or (`text-yellow-500`) / argent (`text-zinc-400`) / bronze (`text-orange-500`) pour 1/2/3.

### Thèmes

`html.dark` togglé par `lib/theme.ts` selon l'heure locale (jour 6h–19h), override manuel persistant dans le menu compte. Les deux thèmes ont le même soin : ne jamais styler un composant pour un seul mode.

---

## 2. Typographie

| Rôle | Police | Usage |
|---|---|---|
| Display | **Fraunces** (italique, 500–700) | Titres de pages, scores, formations (`4-3-3`), wordmark « Foot**Sim** » |
| Corps | **Inter** (400/500/600/700) | Tout le reste |

- Classe display : `font-display` (définie dans `globals.css`, toujours italique).
- Échelle des titres de page : `text-3xl sm:text-4xl` (recalibrage mobile systématique).
- Héro accueil : `text-6xl sm:text-7xl md:text-8xl lg:text-9xl`.
- **Chiffres alignés** : `tabular-nums` obligatoire pour scores, stats, classements, minutes.
- Labels/eyebrows : `text-xs uppercase tracking-widest text-muted` (ou `text-accent` pour les section labels).
- Wordmark : `Foot<span class="text-accent">Sim</span>`.

---

## 3. Formes, élévation, mouvement

### Rayons

| Élément | Rayon |
|---|---|
| Boutons, inputs, petits chips | `rounded-lg` (10 px via config) |
| Cartes, panneaux | `rounded-xl` / `rounded-2xl` |
| Pills (ticker, badges) | `rounded-full` |
| Grands panneaux marketing (CTA accueil) | `rounded-3xl` |

### Ombres

Discrètes uniquement : `shadow-subtle-sm` (cartes), `shadow-subtle-md` (hover), boutons primaires `shadow-sm shadow-accent/25`. Pas d'ombres dures.

### Carte standard

`.fs-card` (globals.css) ou l'équivalent Tailwind : `bg-surface border border-border rounded-xl`, hover `border-accent/40-50` + élévation douce. Icône de carte : conteneur `w-10 h-10 rounded-xl bg-accent/10 text-accent`.

### Animation — règles STRICTES (perf)

- **Aucune boucle infinie framer-motion** (rAF JS 60 fps continu = CPU cuit pendant les matchs). Boucles continues → CSS pur dans `globals.css` : `.fs-float` (points-joueurs accueil), `.fs-pulse` (porteur de balle), `.fs-token` (déplacement joueurs), `fs-weather-fall`, `.fs-wiggle`, `.fs-event-in`.
- framer-motion réservé aux animations **bornées one-shot** : entrées `whileInView` (once: true), keyframes de trajectoire de balle, cartons, transitions de score.
- Apparition de page : fade opacité seule 0.28 s (`main > *`, `.fade-in`) — jamais de transform (casse les `position:fixed` descendants).
- Tout respecte `prefers-reduced-motion`.
- Modale ouverte depuis une carte animée framer → `createPortal(document.body)` obligatoire.

---

## 4. Composants UI

### Button (`components/ui/Button.tsx`)

Base : `rounded-lg`, `gap-2`, `active:scale-[0.98]`, `select-none`.

| Variante | Style | Usage |
|---|---|---|
| `primary` | fond accent, texte `on-accent`, ombre accent | Action principale (1 max par zone) |
| `gold` | fond or | Actions liées aux trophées/palmarès |
| `outline` | bordure, hover accent | Action secondaire visible |
| `soft` | `bg-accent/10 text-accent` | Action contextuelle douce (nav flottante) |
| `ghost` | transparent, hover `border/60` | Actions tertiaires, barres d'outils |
| `danger` | fond danger | Suppressions |

Tailles : `sm` (h-8) / `md` (h-10, défaut) / `lg` (h-12).

### Input (`components/ui/Input.tsx`)

`h-10 rounded-lg border-border bg-surface`, hover `border-muted/50`, focus ring accent.

### Tableaux

- Toujours dans un wrapper `overflow-x-auto rounded-lg border border-border bg-surface` (ou `.fs-table-wrap`).
- `thead` : `text-xs text-muted uppercase tracking-wide`.
- Colonnes secondaires masquées sur mobile : `hidden sm:table-cell`.
- `min-w-[…]` sur la table si besoin — le wrapper scrolle, jamais la page.

### Onglets (pattern pages)

Rangée `flex gap-1 border-b border-border overflow-x-auto`, boutons `shrink-0 whitespace-nowrap px-3 sm:px-4 py-2 text-sm`, actif = `border-b-2 border-accent text-accent`. **Jamais** de rangée d'onglets sans `overflow-x-auto` ou `flex-wrap`.

### Scoreboard (`components/match/Scoreboard.tsx`)

- Score central `font-display tabular-nums`, minute en label uppercase.
- **Météo + arbitre dans la ligne méta pleine largeur** sous le score (`border-t`, centrée, wrap) — jamais dans la colonne centrale (écrase les noms sur mobile).
- Mobile : équipes en colonne (drapeau au-dessus du nom), nom sur 2 lignes max (`line-clamp-2`), les deux côtés en `flex-1`.

---

## 5. Layout & navigation

### Desktop

- Sidebar fixe 240 px (`bg-surface border-r`) : marque (ballon + wordmark), items avec icône (`NavIcons.tsx`) + barrette active verticale accent, footer discret.
- Header sticky : `var(--header-blur)` + `backdrop-blur`, menu compte à droite (avatar, thème jour/nuit, déconnexion).
- Contenu : `px-10 py-8`.

### Mobile (< md)

- **MobileTabBar** : barre d'onglets fixe en bas, 5 destinations max, safe-area (`env(safe-area-inset-bottom)`).
- **Bouton Match dédié** : action « Jouer un match » surélevée au centre en FAB circulaire accent (48 px, ombre verte) — geste principal à portée de pouce.
- Dimensionnement onglets : `flex-1 min-w-0 max-w-24` — **jamais** de largeur en % qui peut dépasser 100 % cumulés.
- Header mobile : hamburger 40 px + wordmark ; tiroir latéral 288 px, coins droits arrondis, backdrop flouté.
- `main` : `overflow-x-clip` — un contenu trop large ne crée **jamais** de scroll horizontal de page (sinon la barre fixed paraît décalée). Les débordements se gèrent dans des wrappers `overflow-x-auto` locaux.
- Padding bas du contenu : `pb-24 md:pb-8` (dégagement barre d'onglets).

### Cibles tactiles

Global (`globals.css`, `@media (pointer: coarse)`) : boutons/inputs/selects ≥ **44 px**. Échappatoire pour les UI denses (contrôles de match) : classe `.fs-compact` sur l'élément ou un parent.

---

## 6. Responsive — conventions

- Mobile-first sur les nouvelles vues ; breakpoints utilisés : `sm` (640) / `md` (768) / `lg` (1024).
- Titres de page : `text-3xl sm:text-4xl`.
- Headers de page avec actions : `flex flex-wrap items-center justify-between gap-3`.
- Grilles : toujours une colonne de base (`grid gap-4 sm:grid-cols-2 lg:grid-cols-3`).
- Headers riches (drapeau + infos) : `flex-col sm:flex-row`.
- Densité tables < 640 px : gérée globalement dans `globals.css` (font 13 px, paddings réduits).
- Interdit : largeur fixe > ~300 px sans wrapper scrollable ; `justify-between` sans `gap` + wrap quand un côté peut être long.

---

## 7. Page d'accueil (référence de ton)

- Héro plein écran (`min-h-[100svh]`) : terrain SVG rayé + faisceaux de projecteurs, 22 points-joueurs `.fs-float` (CSS), parallaxe légère au scroll, dégradé vers `--bg`.
- Ticker de scores : pill `bg-surface/80 backdrop-blur` alimentée par les vraies équipes (`prapi.get('/teams')`), point vert pulsant.
- Nav flottante : wordmark + bouton contextuel (`soft`) connexion / dashboard / mon équipe.
- Chiffres affichés = réalité moteur : **97 cultures · 12 styles · 17 formations**. Toute stat marketing doit rester synchrone avec `lib/types.ts` / `lib/sim`.
- CTA final : panneau `rounded-3xl` dégradé vert → or, bordure `border-accent/25`.

---

## 8. Ton & copie

- UI en **français** (langue admin), vocabulaire football réel : sélection, effectif, XI, mi-temps, prolongations, TAB.
- Boutons = verbe d'action exact (« Lancer un match », « Sauvegarder ») ; jamais de jargon technique côté joueur.
- Emojis fonctionnels tolérés dans les zones de jeu (⚽ 🟨 🟥 📋 ⚔) — pas dans le marketing de l'accueil.

## 9. Checklist nouvelle vue

1. Jetons uniquement (aucune couleur en dur, sauf terrain via `--pitch`).
2. Titre `font-display text-3xl sm:text-4xl`, chiffres `tabular-nums`.
3. Tables wrappées, onglets scrollables, header wrappable.
4. Testé aux deux thèmes + à 375 px de large.
5. Aucune boucle framer infinie ; entrées `whileInView once`.
6. Cibles tactiles ≥ 44 px (ou `.fs-compact` justifié).
7. `npx vitest run` + `npx tsc --noEmit` + `npx vite build`.
