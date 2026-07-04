import { Link } from 'react-router-dom';

export default function NoAccess() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-3xl sm:text-4xl">Accès réservé</h1>
      <p className="max-w-md text-muted">
        FootSim est en accès restreint. Seul l’administrateur du Projet Résurgence peut
        gérer équipes et matchs.
      </p>
      <Link to="/" className="text-accent text-sm underline">
        Retour à l’accueil
      </Link>
    </main>
  );
}
