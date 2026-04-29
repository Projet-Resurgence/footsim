import { motion } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { buildDiscordAuthUrl } from '@/lib/auth/discord';
import { useSession } from '@/stores/session';

export default function Home() {
  const isAdmin = useSession((s) => s.isAdmin());
  const navigate = useNavigate();
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center gap-8 px-6 text-center">
      <motion.h1
        className="font-display text-6xl tracking-tight md:text-7xl"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        FootSim
      </motion.h1>
      <motion.p
        className="max-w-xl text-muted"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.6 }}
      >
        Simulez le football du Projet Résurgence. Créez vos équipes, générez vos rosters,
        faites s’affronter les nations.
      </motion.p>
      <motion.div
        className="flex gap-3"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5 }}
      >
        {isAdmin ? (
          <>
            <Button onClick={() => navigate('/dashboard')}>Dashboard</Button>
            <Link to="/match">
              <Button variant="ghost">Lancer un match</Button>
            </Link>
          </>
        ) : (
          <a href={buildDiscordAuthUrl()}>
            <Button>Connexion Discord</Button>
          </a>
        )}
      </motion.div>
    </main>
  );
}
