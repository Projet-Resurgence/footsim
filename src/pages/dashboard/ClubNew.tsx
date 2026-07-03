import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Spinner } from '@/components/ui/Spinner';
import { toast } from '@/components/ui/Toast';
import type { LeagueClub, Formation } from '@/lib/types';
import { CULTURE_LABEL, CONTINENT_LABEL, CULTURES_BY_CONTINENT, type Culture, type Continent } from '@/lib/types';
import type { CultureWeight } from '@/lib/gen/names';
import { slugify } from '@/lib/slug';
import { useLeagues, assignPlayersToClub } from '@/stores/leagues';
import { useTeams } from '@/stores/teams';
import { useBackendArgs } from '@/hooks/useBackendArgs';

const LOGO_SIZE = 500;

export default function ClubNew() {
  const { leagueId: encoded = '', divisionId = '' } = useParams<{ leagueId: string; divisionId: string }>();
  const leagueId = decodeURIComponent(encoded);
  const { ownerId, prApiToken: effectivePat } = useBackendArgs();

  const loadLeague = useLeagues((s) => s.loadLeague);
  const saveLeague = useLeagues((s) => s.saveLeague);
  const fetchTeam = useTeams((s) => s.fetchTeam);
  const saveTeam = useTeams((s) => s.saveTeam);
  const navigate = useNavigate();

  const nationSlug = leagueId.includes('/') ? leagueId.split('/')[0] : '';

  const [name, setName] = useState('');
  const [logo, setLogo] = useState<string | null>(null);
  const [strength, setStrength] = useState(60);
  const [continent, setContinent] = useState<Continent>('europe');
  const [cultures, setCultures] = useState<CultureWeight[]>([{ culture: 'francais', weight: 50 }]);
  const [formation, setFormation] = useState<Formation>('4-3-3');
  const [saving, setSaving] = useState(false);

  const totalWeight = cultures.reduce((s, c) => s + c.weight, 0);

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = LOGO_SIZE;
        canvas.height = LOGO_SIZE;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, LOGO_SIZE, LOGO_SIZE);
        setLogo(canvas.toDataURL('image/png'));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  function toggleCulture(c: Culture) {
    if (cultures.some((w) => w.culture === c)) {
      if (cultures.length === 1) return;
      setCultures(cultures.filter((w) => w.culture !== c));
    } else {
      setCultures([...cultures, { culture: c, weight: 50 }]);
    }
  }

  function setWeight(c: Culture, value: number) {
    setCultures(cultures.map((w) => (w.culture === c ? { ...w, weight: value } : w)));
  }

  function distribute() {
    const equal = Math.round(100 / cultures.length);
    setCultures(cultures.map((w, i) => ({
      ...w,
      weight: i === cultures.length - 1 ? 100 - equal * (cultures.length - 1) : equal,
    })));
  }

  async function handleCreate() {
    if (!name.trim()) { toast('error', 'Nom du club requis.'); return; }
    if (!logo) { toast('error', 'Logo requis (500×500).'); return; }
    setSaving(true);
    try {
      // Load league + national roster
      const [league, rosterData] = await Promise.all([
        loadLeague(leagueId, effectivePat),
        fetchTeam(nationSlug, ownerId, null, effectivePat),
      ]);
      if (!league) throw new Error('Championnat introuvable.');
      if (!rosterData) throw new Error('Roster national introuvable. Assure-toi que l\'équipe est chargée.');

      // Collect all already-assigned player IDs across all clubs in all divisions
      const existingClubIds = league.divisions
        .flatMap((d) => d.clubs)
        .flatMap((c) => c.playerIds);

      const { assigned } = assignPlayersToClub(rosterData.players, existingClubIds, 30);
      const playerIds = assigned.map((p) => p.id);

      // Tag players with their new clubId
      const clubId = crypto.randomUUID();
      const updatedPlayers = rosterData.players.map((p) =>
        playerIds.includes(p.id) ? { ...p, clubId } : p,
      );

      const primaryCulture = cultures[0].culture;
      const newClub: LeagueClub = {
        id: clubId,
        slug: slugify(name),
        name: name.trim(),
        logo,
        culture: primaryCulture,
        cultures: cultures.length > 1 ? cultures : undefined,
        globalStrength: strength,
        formation,
        playerIds,
      };

      // Update division
      const updatedLeague = {
        ...league,
        divisions: league.divisions.map((d) =>
          d.id === divisionId ? { ...d, clubs: [...d.clubs, newClub] } : d,
        ),
      };

      // Save both
      await Promise.all([
        saveLeague(updatedLeague, effectivePat),
        saveTeam({ ...rosterData.team }, updatedPlayers, effectivePat),
      ]);

      toast('success', `Club "${name.trim()}" créé avec ${playerIds.length} joueurs.`);
      navigate(`/dashboard/leagues/${encoded}`);
    } catch (err) {
      toast('error', String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-8">
      <h1 className="font-display text-4xl">Nouveau club</h1>

      <section className="space-y-5 rounded-lg border border-border bg-surface p-6">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Nom du club</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Paris FC" />
        </label>

        {/* Logo upload */}
        <div className="space-y-2">
          <span className="block text-sm text-muted">Logo (500×500 — redimensionné auto)</span>
          <div className="flex items-center gap-4">
            {logo ? (
              <img src={logo} alt="logo" className="h-24 w-24 rounded-md border border-border object-contain" />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-md border-2 border-dashed border-border text-xs text-muted">
                500×500
              </div>
            )}
            <label className="cursor-pointer">
              <span className="rounded-md border border-border bg-surface px-3 py-2 text-sm hover:border-accent/40 transition-colors">
                Choisir un fichier
              </span>
              <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </label>
          </div>
        </div>

        {/* Formation */}
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Formation</span>
          <select
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={formation}
            onChange={(e) => setFormation(e.target.value as Formation)}
          >
            {(['4-3-3','4-4-2','3-5-2','4-2-3-1','5-3-2','4-1-4-1','3-4-3','4-3-2-1','4-5-1','4-4-1-1','3-4-1-2','5-4-1','3-6-1','4-1-2-1-2','3-4-2-1','4-2-2-2','4-2-4'] as Formation[]).map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </label>

        {/* Force */}
        <label className="block text-sm">
          <span className="mb-1 block text-muted">
            Force globale : <span className="text-text">{strength}</span>
          </span>
          <input
            type="range" min={1} max={100} value={strength}
            onChange={(e) => setStrength(Number(e.target.value))}
            className="w-full accent-[var(--accent)]"
          />
        </label>

        {/* Continent */}
        <label className="block text-sm">
          <span className="mb-1 block text-muted">Continent (cultures)</span>
          <select
            className="h-10 w-full rounded-md border border-border bg-surface px-3 text-sm"
            value={continent}
            onChange={(e) => {
              const c = e.target.value as Continent;
              setContinent(c);
              if (!cultures.some((w) => CULTURES_BY_CONTINENT[c].includes(w.culture))) {
                setCultures([{ culture: CULTURES_BY_CONTINENT[c][0], weight: 50 }]);
              }
            }}
          >
            {(Object.keys(CULTURES_BY_CONTINENT) as Continent[]).map((ct) => (
              <option key={ct} value={ct}>{CONTINENT_LABEL[ct]}</option>
            ))}
          </select>
        </label>

        {/* Culture grid */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">Cultures ({cultures.length})</span>
            {cultures.length > 1 && (
              <button onClick={distribute} className="text-xs text-accent hover:text-accent/70 transition-colors">
                Répartir également
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {CULTURES_BY_CONTINENT[continent].map((c) => {
              const active = cultures.some((w) => w.culture === c);
              return (
                <button
                  key={c}
                  onClick={() => toggleCulture(c)}
                  className={`rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors ${
                    active ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:border-accent/40'
                  }`}
                >
                  {CULTURE_LABEL[c]}
                </button>
              );
            })}
          </div>
          {cultures.length > 1 && (
            <div className="space-y-2 rounded-md border border-border bg-bg p-3">
              {cultures.map((cw) => {
                const pct = totalWeight > 0 ? Math.round((cw.weight / totalWeight) * 100) : 0;
                return (
                  <div key={cw.culture} className="space-y-0.5">
                    <div className="flex justify-between text-xs">
                      <span>{CULTURE_LABEL[cw.culture]}</span>
                      <span className="text-accent tabular-nums">{pct}%</span>
                    </div>
                    <input
                      type="range" min={1} max={200} value={cw.weight}
                      onChange={(e) => setWeight(cw.culture, Number(e.target.value))}
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-md border border-accent/20 bg-accent/5 p-3 text-xs text-muted">
          30 joueurs seront auto-assignés depuis le roster national (non encore dans un club, par overall décroissant avec brassage).
        </div>
      </section>

      <div className="flex gap-3">
        <Button onClick={handleCreate} disabled={saving} size="lg">
          {saving ? <Spinner className="mr-2" /> : null}
          Créer le club
        </Button>
        <Button variant="ghost" size="lg" onClick={() => navigate(-1)} disabled={saving}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
