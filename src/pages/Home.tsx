import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { buildDiscordAuthUrl } from '@/lib/auth/discord';
import { useSession } from '@/stores/session';
import { useTeams } from '@/stores/teams';
import { useBackendArgs } from '@/hooks/useBackendArgs';
import { prapi } from '@/lib/prapi/client';

// ── Pitch SVG background ──────────────────────────────────────────────────────
function PitchBackground() {
  return (
    <svg viewBox="0 0 800 520" className="absolute inset-0 w-full h-full pointer-events-none"
      preserveAspectRatio="xMidYMid slice">
      <rect width="800" height="520" fill="var(--accent)" opacity="0.08" />
      {[0,1,2,3,4,5,6,7].map((i) => (
        <rect key={i} x={i*100} width="50" height="520" fill="rgba(0,0,0,0.04)" />
      ))}
      <rect x="40" y="30" width="720" height="460" fill="none" stroke="white" strokeWidth="2" opacity="0.12" />
      <line x1="400" y1="30" x2="400" y2="490" stroke="white" strokeWidth="1.5" opacity="0.12" />
      <circle cx="400" cy="260" r="70" fill="none" stroke="white" strokeWidth="1.5" opacity="0.12" />
      <circle cx="400" cy="260" r="3" fill="white" opacity="0.2" />
      <rect x="40" y="165" width="130" height="190" fill="none" stroke="white" strokeWidth="1.5" opacity="0.12" />
      <rect x="630" y="165" width="130" height="190" fill="none" stroke="white" strokeWidth="1.5" opacity="0.12" />
      <rect x="40" y="205" width="55" height="110" fill="none" stroke="white" strokeWidth="1.5" opacity="0.12" />
      <rect x="705" y="205" width="55" height="110" fill="none" stroke="white" strokeWidth="1.5" opacity="0.12" />
      <rect x="20" y="215" width="20" height="90" fill="none" stroke="white" strokeWidth="1.5" opacity="0.12" />
      <rect x="760" y="215" width="20" height="90" fill="none" stroke="white" strokeWidth="1.5" opacity="0.12" />
      <circle cx="130" cy="260" r="3" fill="white" opacity="0.18" />
      <circle cx="670" cy="260" r="3" fill="white" opacity="0.18" />
    </svg>
  );
}

// ── Floating player dots ──────────────────────────────────────────────────────
const DOTS = [
  { id:1, x:12, y:50, side:'home', delay:0 },
  { id:2, x:22, y:28, side:'home', delay:0.3 },
  { id:3, x:22, y:72, side:'home', delay:0.6 },
  { id:4, x:32, y:18, side:'home', delay:0.2 },
  { id:5, x:32, y:42, side:'home', delay:0.8 },
  { id:6, x:32, y:60, side:'home', delay:0.4 },
  { id:7, x:32, y:82, side:'home', delay:1.0 },
  { id:8, x:44, y:30, side:'home', delay:0.5 },
  { id:9, x:44, y:52, side:'home', delay:0.15 },
  { id:10, x:44, y:72, side:'home', delay:0.7 },
  { id:11, x:56, y:50, side:'home', delay:0.9 },
  { id:12, x:88, y:50, side:'away', delay:0.15 },
  { id:13, x:78, y:28, side:'away', delay:0.45 },
  { id:14, x:78, y:72, side:'away', delay:0.75 },
  { id:15, x:68, y:18, side:'away', delay:0.25 },
  { id:16, x:68, y:42, side:'away', delay:0.85 },
  { id:17, x:68, y:60, side:'away', delay:0.55 },
  { id:18, x:68, y:82, side:'away', delay:1.05 },
  { id:19, x:56, y:30, side:'away', delay:0.35 },
  { id:20, x:56, y:70, side:'away', delay:0.65 },
  { id:21, x:44, y:50, side:'away', delay:0.95 },
  { id:22, x:34, y:50, side:'away', delay:0.05 },
] as const;

function FloatingPlayers() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {DOTS.map((d) => (
        <motion.div
          key={d.id}
          className={`absolute rounded-full ${d.side === 'home' ? 'bg-accent' : 'bg-warning'} opacity-70`}
          style={{ left: `${d.x}%`, top: `${d.y}%`, width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5 }}
          animate={{ y: [0,-5,0,3,0], x: [0,2,-2,0], scale: [1,1.2,0.9,1] }}
          transition={{ duration: 3.5 + d.id*0.11, delay: d.delay, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}
    </div>
  );
}

// ── Live ticker using real teams ──────────────────────────────────────────────
function LiveTicker() {
  const storeTeams = useTeams((s) => s.teams);
  const [idx, setIdx] = useState(0);
  const [pairs, setPairs] = useState<{ home: string; away: string; sh: number; sa: number }[]>([]);
  const [loaded, setLoaded] = useState(false);

  function buildPairs(names: string[]) {
    if (names.length < 2) return;
    const shuffled = [...names].sort(() => Math.random() - 0.5).slice(0, 10);
    const built: { home: string; away: string; sh: number; sa: number }[] = [];
    for (let i = 0; i < shuffled.length - 1; i += 2) {
      built.push({
        home: shuffled[i],
        away: shuffled[i + 1],
        sh: Math.floor(Math.random() * 4),
        sa: Math.floor(Math.random() * 4),
      });
    }
    if (built.length > 0) setPairs(built);
  }

  // On mount: fetch public team list directly (no auth required)
  useEffect(() => {
    prapi.get<{ name: string }[]>('/teams', null)
      .then((teams) => { buildPairs(teams.map((t) => t.name)); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also react if store is populated (logged-in user)
  useEffect(() => {
    if (storeTeams.length > 0) buildPairs(storeTeams.map((t) => t.name));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeTeams.length]);

  const FALLBACK = [
    { home: 'Arcadie', away: 'Veldora', sh: 2, sa: 1 },
    { home: 'Kalthorn', away: 'Nyreth', sh: 0, sa: 0 },
    { home: 'Solvanë', away: 'Drukan', sh: 3, sa: 2 },
  ];
  // Show fallback only after fetch finished and no real teams found
  const list = pairs.length > 0 ? pairs : (loaded ? FALLBACK : null);

  useEffect(() => {
    if (!list) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % list.length), 3200);
    return () => clearInterval(t);
  }, [list?.length]);

  if (!list) return (
    <div className="inline-flex items-center gap-3 rounded-full border border-border bg-surface/80 backdrop-blur-sm px-5 py-2 text-sm shadow-sm">
      <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
      <span className="text-muted text-xs">Chargement…</span>
    </div>
  );

  const m = list[idx % list.length];
  return (
    <div className="inline-flex items-center gap-4 rounded-full border border-border bg-surface/80 backdrop-blur-sm px-5 py-2 text-sm shadow-sm">
      <span className="w-2 h-2 rounded-full bg-accent animate-pulse shrink-0" />
      <AnimatePresence mode="wait">
        <motion.span key={idx} className="tabular-nums"
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.22 }}>
          <span className="font-medium">{m.home}</span>
          <span className="text-muted mx-2">·</span>
          <span className="font-display font-bold text-base">{m.sh}–{m.sa}</span>
          <span className="text-muted mx-2">·</span>
          <span className="font-medium">{m.away}</span>
        </motion.span>
      </AnimatePresence>
      <span className="text-[10px] uppercase tracking-widest text-muted shrink-0">en direct</span>
    </div>
  );
}

// ── Feature card ──────────────────────────────────────────────────────────────
function FeatureCard({ icon, title, desc, delay = 0 }: { icon: React.ReactNode; title: string; desc: string; delay?: number }) {
  return (
    <motion.div
      className="group rounded-xl border border-border bg-surface p-6 space-y-4 hover:border-accent/50 transition-all duration-300 cursor-default"
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ delay, duration: 0.45 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
    >
      <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center text-accent group-hover:bg-accent/20 transition-colors">
        {icon}
      </div>
      <div className="space-y-1.5">
        <h3 className="font-semibold text-[15px]">{title}</h3>
        <p className="text-sm text-muted leading-relaxed">{desc}</p>
      </div>
    </motion.div>
  );
}

// ── Stat badge ────────────────────────────────────────────────────────────────
function StatBadge({ value, label }: { value: string; label: string }) {
  return (
    <motion.div className="text-center"
      initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }} transition={{ duration: 0.4 }}>
      <div className="font-display text-5xl font-bold text-accent tabular-nums">{value}</div>
      <div className="text-xs text-muted uppercase tracking-widest mt-1.5">{label}</div>
    </motion.div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-xs uppercase tracking-widest text-accent font-semibold">{children}</div>;
}

// ── Icons ─────────────────────────────────────────────────────────────────────
const IconTeam = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IconBall = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>;
const IconTactic = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/></svg>;
const IconTrophy = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>;
const IconChart = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>;
const IconGlobe = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>;
const IconEngine = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>;
const IconCoach = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconMedical = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>;
const IconDiscord = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.1 18.082.114 18.105.136 18.12a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>;

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Home() {
  const isLoggedIn = useSession((s) => s.isLoggedIn());
  const isAdmin = useSession((s) => s.isAdmin());
  const session = useSession((s) => s.session);
  const refreshIfStale = useTeams((s) => s.refreshIfStale);
  const { ownerId, prApiToken: effectivePat } = useBackendArgs();
  const navigate = useNavigate();
  const heroRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  useEffect(() => {
    if (!effectivePat) return;
    refreshIfStale(ownerId, null, effectivePat);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectivePat]);

  useEffect(() => {
    if (!isLoggedIn || isAdmin || !session) return;
    async function checkManager() {
      await refreshIfStale(ownerId, null, effectivePat);
      const mine = useTeams.getState().teams.find((t) => t.managerDiscordId === session!.id);
      if (mine) navigate('/my-team', { replace: true });
    }
    checkManager();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, isAdmin, session?.id]);

  const ctaButtons = isLoggedIn ? (
    <>
      {isAdmin && (
        <Button onClick={() => navigate('/dashboard')} className="px-8 py-3 text-base">
          Dashboard admin
        </Button>
      )}
      {isAdmin && (
        <Link to="/match">
          <Button variant="ghost" className="px-6 py-3 text-base">▶ Lancer un match</Button>
        </Link>
      )}
      {!isAdmin && (
        <Button onClick={() => navigate('/my-team')} className="px-8 py-3 text-base">
          Mon équipe →
        </Button>
      )}
    </>
  ) : (
    <>
      <a href={buildDiscordAuthUrl()}>
        <Button className="px-8 py-3 text-base flex items-center gap-2">
          <IconDiscord /> Connexion Discord
        </Button>
      </a>
      <a href="#decouvrir">
        <Button variant="ghost" className="px-6 py-3 text-base">Découvrir ↓</Button>
      </a>
    </>
  );

  return (
    <div className="min-h-screen bg-bg text-text">

      {/* ── HERO ── */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
        <motion.div className="absolute inset-0" style={{ y: heroY }}>
          <PitchBackground />
          <FloatingPlayers />
          <div className="absolute inset-0 bg-gradient-to-b from-bg/20 via-bg/55 to-bg" />
        </motion.div>

        <motion.div className="relative z-10 flex flex-col items-center gap-8 px-6 text-center" style={{ opacity: heroOpacity }}>
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.5 }}>
            <LiveTicker />
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7 }} className="space-y-4">
            <h1 className="font-display text-7xl md:text-8xl lg:text-9xl tracking-tight leading-none">
              Foot<span className="text-accent">Sim</span>
            </h1>
            <p className="text-muted text-lg md:text-xl max-w-lg mx-auto leading-relaxed">
              La simulation footballistique officielle du{' '}
              <span className="text-text font-medium">Projet Résurgence</span>.
              <br className="hidden md:block" />
              Gérez vos nations, forgez vos équipes, écrivez l'histoire.
            </p>
          </motion.div>

          <motion.div className="flex flex-wrap items-center justify-center gap-3"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45, duration: 0.5 }}>
            {ctaButtons}
          </motion.div>
        </motion.div>

        {/* Scroll hint */}
        <motion.div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.3, duration: 0.6 }}>
          <motion.div className="w-5 h-8 rounded-full border-2 border-muted/25 flex items-start justify-center pt-1.5"
            animate={{ y: [0, 4, 0] }} transition={{ duration: 1.6, repeat: Infinity }}>
            <div className="w-1 h-2 rounded-full bg-muted/40" />
          </motion.div>
        </motion.div>
      </section>

      {/* ── STATS ── */}
      <section className="py-16 px-6 border-y border-border/30 bg-surface/30">
        <div className="max-w-3xl mx-auto grid grid-cols-3 gap-8 md:gap-16">
          <StatBadge value="97" label="Cultures" />
          <StatBadge value="9" label="Styles tactiques" />
          <StatBadge value="13" label="Formations" />
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="decouvrir" className="py-24 px-6">
        <div className="max-w-5xl mx-auto space-y-14">
          <motion.div className="text-center space-y-3"
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <SectionLabel>La plateforme</SectionLabel>
            <h2 className="font-display text-4xl md:text-5xl">Tout pour simuler le football sur FootSim</h2>
            <p className="text-muted max-w-xl mx-auto text-base leading-relaxed">
              Des nations aux compétitions — une plateforme complète pour chaque sélectionneur.
            </p>
          </motion.div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <FeatureCard icon={<IconGlobe />} title="Nations & Identité" delay={0}
              desc="Créez votre sélection nationale avec drapeau, couleurs et culture parmi 97 identités footballistiques du monde entier." />
            <FeatureCard icon={<IconTeam />} title="Roster génératif" delay={0.08}
              desc="Générez 23 joueurs avec 23 attributs chacun — technique, mental, physique. Chaque culture produit des profils distincts." />
            <FeatureCard icon={<IconEngine />} title="Moteur de simulation" delay={0.16}
              desc="Moteur tick-by-tick : possession, tirs, fautes, cartons, remplacements automatiques, temps additionnel et tirs au but." />
            <FeatureCard icon={<IconTactic />} title="9 styles tactiques" delay={0.24}
              desc="Possession, contre-attaque, pressing haut, gegenpressing, tiki-taka, ultra-défensif, jeu direct, long ball, chaos. Chaque style modifie réellement le déroulement du match." />
            <FeatureCard icon={<IconTrophy />} title="Compétitions" delay={0.32}
              desc="Tournois officiels ou amicaux — phases de groupes, tableaux à élimination directe, LPM (Ligue des Pays du Monde). Résultats archivés match après match." />
            <FeatureCard icon={<IconChart />} title="Classement CMF" delay={0.40}
              desc="Chaque match rapporte des points CMF selon le niveau de l'adversaire, l'importance de la compétition et l'écart au score. Suivi de la progression dans le temps." />
            <FeatureCard icon={<IconCoach />} title="Entraîneurs" delay={0.48}
              desc="Chaque sélection a son entraîneur avec ses propres attributs. Un entraîneur expulsé est suspendu pour le match suivant." />
            <FeatureCard icon={<IconMedical />} title="Blessures & Suspensions" delay={0.56}
              desc="Les joueurs se blessent en match et sont indisponibles pour les rencontres suivantes. Les cartons rouges entraînent une suspension automatique." />
            <FeatureCard icon={<IconBall />} title="Statistiques détaillées" delay={0.64}
              desc="Buteurs, passeurs décisifs, MOTM, xG, possession, corners, fautes — tout est tracé et consultable par compétition et par équipe." />
          </div>
        </div>
      </section>

      {/* ── ENGINE DETAIL ── */}
      <section className="py-24 px-6 bg-surface/30 border-y border-border/30">
        <div className="max-w-5xl mx-auto space-y-14">
          <motion.div className="text-center space-y-3"
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <SectionLabel>Sous le capot</SectionLabel>
            <h2 className="font-display text-4xl">Un moteur de jeu sérieux</h2>
            <p className="text-muted max-w-xl mx-auto">Pas un générateur de scores aléatoires — chaque minute compte.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6">
            {[
              {
                title: 'Simulation minute par minute',
                desc: 'Chaque tick représente une minute de jeu. Possession, événements (tirs, fautes, corners, dribbles, passes clés), et résolution — tout se calcule séquentiellement avec des probabilités basées sur les attributs réels des joueurs.',
                delay: 0,
              },
              {
                title: 'Influence des tactiques',
                desc: 'Le style choisi modifie directement les fréquences d\'événements : un pressing haut génère plus de fautes et de passes clés, un tiki-taka ralentit les tirs mais augmente la maîtrise du ballon, le chaos multiplie les occasions dans les deux sens.',
                delay: 0.1,
              },
              {
                title: 'Résolution des tirs',
                desc: 'Chaque tir passe par une chaîne : cadré ? But ou arrêt ou poteau. La probabilité dépend du finishing et de la composure de l\'attaquant face à l\'overall du gardien. Pénaltys, corners, coups francs ont leurs propres multiplicateurs.',
                delay: 0.2,
              },
              {
                title: 'Remplacements & cartons',
                desc: 'Les remplacements automatiques s\'effectuent à la mi-temps selon les postes. Les cartons rouges retirent le joueur du terrain et pénalisent les stats de l\'équipe pour le reste du match. Un deuxième jaune = rouge.',
                delay: 0.3,
              },
            ].map(({ title, desc, delay }) => (
              <motion.div key={title}
                className="rounded-xl border border-border bg-surface p-6 space-y-3"
                initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }} transition={{ delay, duration: 0.45 }}>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TACTIC STYLES ── */}
      <section className="py-24 px-6">
        <div className="max-w-5xl mx-auto space-y-14">
          <motion.div className="text-center space-y-3"
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <SectionLabel>Styles de jeu</SectionLabel>
            <h2 className="font-display text-4xl">9 philosophies tactiques</h2>
            <p className="text-muted max-w-xl mx-auto">Choisissez votre identité de jeu — elle change réellement les probabilités d'événements.</p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[
              { name: 'Possession', desc: 'Maîtrise du ballon, jeu lent et patient. Moins de tirs, plus de passes clés.' },
              { name: 'Contre-attaque', desc: 'Défense basse, transitions rapides. Fréquence de tirs élevée en rupture.' },
              { name: 'Jeu direct', desc: 'Passes longues vers les attaquants. Maximum de tirs, peu de construction.' },
              { name: 'Pressing haut', desc: 'Récupération haute, pression constante. Plus de fautes et de passes clés.' },
              { name: 'Ultra-défensif', desc: 'Bloc bas, priorité absolue à la solidité. Peu de tirs, défense renforcée.' },
              { name: 'Gegenpressing', desc: 'Pressing immédiat après perte. Très intensif — tirs, fautes et milieu dominants.' },
              { name: 'Tiki-taka', desc: 'Courtes passes en triangle, domination du milieu. Jeu lent mais précis.' },
              { name: 'Long ball', desc: 'Duels aériens, jeu physique. Moins de milieu, plus de frappes directes.' },
              { name: 'Chaos', desc: 'Aucune organisation définie. Tirs max, fautes max, surprises garanties.' },
            ].map(({ name, desc }, i) => (
              <motion.div key={name}
                className="rounded-lg border border-border bg-surface px-4 py-3 space-y-1 transition-colors hover:border-accent/40"
                initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }} transition={{ delay: i * 0.05, duration: 0.35 }}>
                <div className="font-medium text-sm">{name}</div>
                <div className="text-xs text-muted leading-relaxed">{desc}</div>
              </motion.div>
            ))}
            {/* Style personnalisé — pleine largeur */}
            <motion.div
              className="col-span-2 md:col-span-3 rounded-lg border border-accent/30 bg-accent/5 px-5 py-4 flex items-start gap-4 hover:border-accent/60 transition-colors"
              initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }} transition={{ delay: 0.5, duration: 0.35 }}>
              <div className="shrink-0 mt-0.5">
                <span className="text-[10px] border border-accent/40 rounded px-1.5 py-px uppercase tracking-wider text-accent font-medium">libre</span>
              </div>
              <div className="space-y-1">
                <div className="font-medium text-sm text-accent">Style personnalisé</div>
                <div className="text-xs text-muted leading-relaxed">
                  Définissez vos propres multiplicateurs — fréquence de tirs, intensité du milieu, pression défensive — pour créer une identité tactique entièrement unique qui ne correspond à aucun schéma prédéfini.
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── FORMATIONS ── */}
      <section className="py-24 px-6 bg-surface/30 border-y border-border/30">
        <div className="max-w-5xl mx-auto space-y-14">
          <motion.div className="text-center space-y-3"
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <SectionLabel>Formations</SectionLabel>
            <h2 className="font-display text-4xl">17 schémas tactiques + éditeur libre</h2>
            <p className="text-muted max-w-xl mx-auto">
              Choisissez parmi les formations prédéfinies ou placez vos 11 joueurs librement sur le terrain.
            </p>
          </motion.div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {['4-3-3','4-4-2','3-5-2','4-2-3-1','5-3-2','4-1-4-1','3-4-3','4-3-2-1','4-5-1','4-4-1-1','3-4-1-2','5-4-1','3-6-1','4-1-2-1-2','3-4-2-1','4-2-2-2','4-2-4'].map((f, i) => (
              <motion.div key={f}
                className="rounded-lg border border-border bg-surface px-3 py-3 text-center font-display font-bold text-sm hover:border-accent/50 hover:text-accent transition-colors cursor-default"
                initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.04, duration: 0.3 }}>
                {f}
              </motion.div>
            ))}
          </div>

          <motion.div
            className="rounded-xl border border-accent/30 bg-accent/5 p-6 flex flex-col md:flex-row items-start md:items-center gap-5"
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.45 }}>
            <div className="w-10 h-10 rounded-lg bg-accent/15 flex items-center justify-center text-accent shrink-0">
              <IconTactic />
            </div>
            <div className="space-y-1">
              <div className="font-semibold text-accent">Éditeur de formation libre</div>
              <p className="text-sm text-muted leading-relaxed">
                Placez chacun de vos 11 titulaires manuellement sur le terrain — ligne de défense, milieux, attaquants — sans contrainte de schéma prédéfini. Le moteur adapte les ratings offensifs, défensifs et de milieu à votre positionnement réel.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section className="py-24 px-6 bg-surface/30 border-y border-border/30">
        <div className="max-w-4xl mx-auto space-y-14">
          <motion.div className="text-center space-y-3"
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }} transition={{ duration: 0.5 }}>
            <SectionLabel>Comment ça marche</SectionLabel>
            <h2 className="font-display text-4xl">Simple à prendre en main</h2>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-10">
            {[
              { step: '01', title: 'Rejoignez votre nation', desc: 'Connectez-vous via Discord. L\'administrateur vous attribue la sélection nationale de votre pays sur FootSim.' },
              { step: '02', title: 'Construisez votre effectif', desc: 'Générez vos joueurs, personnalisez la formation, choisissez votre style tactique et définissez vos rotations.' },
              { step: '03', title: 'Disputez des matchs', desc: 'Participez aux compétitions officielles ou lancez des amicaux. Chaque résultat impacte votre classement CMF mondial.' },
            ].map(({ step, title, desc }, i) => (
              <motion.div key={step} className="relative pl-16 space-y-2"
                initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }} transition={{ delay: i * 0.15, duration: 0.5 }}>
                <div className="absolute left-0 top-0 font-display text-5xl font-bold text-accent/15 leading-none select-none">
                  {step}
                </div>
                <h3 className="font-semibold">{title}</h3>
                <p className="text-sm text-muted leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="py-28 px-6">
        <motion.div className="max-w-2xl mx-auto text-center space-y-8"
          initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }} transition={{ duration: 0.6 }}>
          <div className="space-y-4">
            <h2 className="font-display text-5xl md:text-6xl">Prêt à jouer ?</h2>
            <p className="text-muted text-lg">Guidez votre nation vers la gloire sur FootSim.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {isLoggedIn ? (
              <>
                {isAdmin && (
                  <Button onClick={() => navigate('/dashboard')} className="px-10 py-3 text-base">
                    Dashboard admin
                  </Button>
                )}
                {!isAdmin && (
                  <Button onClick={() => navigate('/my-team')} className="px-10 py-3 text-base">
                    Mon équipe →
                  </Button>
                )}
              </>
            ) : (
              <a href={buildDiscordAuthUrl()}>
                <Button className="px-10 py-3 text-base flex items-center gap-2">
                  <IconDiscord /> Se connecter avec Discord
                </Button>
              </a>
            )}
          </div>
          <p className="text-xs text-muted/50">
            Accès réservé aux membres du Projet Résurgence · Connexion via Discord uniquement
          </p>
        </motion.div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border/30 py-6 px-6 flex items-center justify-between text-xs text-muted/40">
        <span>FootSim · Projet Résurgence · {new Date().getFullYear()}</span>
        <span>97 cultures · 9 styles · 23 attributs</span>
      </footer>
    </div>
  );
}
