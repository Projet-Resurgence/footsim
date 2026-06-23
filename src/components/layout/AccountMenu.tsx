import { useState, useRef, useEffect } from 'react';
import { useSession } from '@/stores/session';
import { useCredentials } from '@/stores/credentials';
import { getAvatarUrl } from '@/lib/auth/discord';
import { getThemeOverride, setThemeOverride, modeForHour, applyTheme } from '@/lib/theme';
import { validatePat } from '@/lib/github/api';
import { toast } from '@/components/ui/Toast';
import { Spinner } from '@/components/ui/Spinner';
import type { ThemeMode } from '@/lib/theme';

function currentMode(): ThemeMode {
  return getThemeOverride() ?? modeForHour(new Date().getHours());
}

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4"/>
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
    </svg>
  );
}

export function AccountMenu() {
  const session = useSession((s) => s.session);
  const logout = useSession((s) => s.logout);
  const githubPat = useCredentials((s) => s.githubPat);
  const setPat = useCredentials((s) => s.setPat);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ThemeMode>(currentMode);
  const [patDraft, setPatDraft] = useState('');
  const [patReveal, setPatReveal] = useState(false);
  const [patBusy, setPatBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  function toggleTheme(next: ThemeMode) {
    setThemeOverride(next);
    setMode(next);
    applyTheme(next);
  }

  async function savePat() {
    const trimmed = patDraft.trim();
    if (!trimmed) return;
    setPatBusy(true);
    try {
      const ok = await validatePat(trimmed);
      if (!ok) { toast('error', 'Token GitHub invalide.'); return; }
      setPat(trimmed);
      setPatDraft('');
      toast('success', 'Token GitHub enregistré.');
    } catch (err) {
      toast('error', String(err));
    } finally {
      setPatBusy(false);
    }
  }

  function clearPat() {
    setPat(null);
    setPatDraft('');
    toast('info', 'Token GitHub effacé.');
  }

  if (!session) return null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors hover:bg-border/40"
      >
        <img
          src={getAvatarUrl(session.id, session.avatar, 64)}
          alt={session.username}
          className="h-8 w-8 rounded-full object-cover"
        />
        <span className="text-sm font-medium text-text/90 max-w-[120px] truncate">{session.username}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M6 9l6 6 6-6"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 rounded-xl border border-border bg-surface shadow-2xl z-50 overflow-hidden">
          {/* User info */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <img
              src={getAvatarUrl(session.id, session.avatar, 64)}
              alt={session.username}
              className="h-9 w-9 rounded-full object-cover shrink-0"
            />
            <span className="text-sm font-semibold truncate">{session.username}</span>
          </div>

          {/* Thème */}
          <div className="px-4 py-3 border-b border-border">
            <div className="text-xs text-muted mb-2">Thème</div>
            <div className="flex gap-2">
              <button
                onClick={() => toggleTheme('night')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                  mode === 'night' ? 'bg-accent/15 text-accent' : 'text-text/60 hover:bg-border/40'
                }`}
              >
                <MoonIcon />
                Nuit
              </button>
              <button
                onClick={() => toggleTheme('day')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                  mode === 'day' ? 'bg-accent/15 text-accent' : 'text-text/60 hover:bg-border/40'
                }`}
              >
                <SunIcon />
                Jour
              </button>
            </div>
          </div>

          {/* Token GitHub */}
          <div className="px-4 py-3 border-b border-border space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted">Token GitHub</div>
              {githubPat && (
                <span className="text-[10px] text-accent">● Actif</span>
              )}
            </div>
            <div className="flex gap-1.5">
              <input
                type={patReveal ? 'text' : 'password'}
                placeholder={githubPat ? '••••••••••••' : 'ghp_...'}
                value={patDraft}
                onChange={(e) => setPatDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && savePat()}
                className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1 text-xs text-text placeholder:text-muted/50 focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                onClick={() => setPatReveal((r) => !r)}
                className="rounded-md border border-border px-2 py-1 text-xs text-muted hover:text-text transition-colors"
              >
                {patReveal ? '🙈' : '👁'}
              </button>
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={savePat}
                disabled={patBusy || !patDraft.trim()}
                className="flex items-center gap-1 rounded-md bg-accent/10 px-2.5 py-1 text-xs text-accent hover:bg-accent/20 transition-colors disabled:opacity-40"
              >
                {patBusy ? <Spinner className="h-3 w-3" /> : null}
                Enregistrer
              </button>
              {githubPat && (
                <button
                  onClick={clearPat}
                  className="rounded-md px-2.5 py-1 text-xs text-muted hover:text-danger transition-colors"
                >
                  Effacer
                </button>
              )}
            </div>
          </div>

          {/* Déconnexion */}
          <button
            onClick={() => { logout(); setOpen(false); }}
            className="w-full px-4 py-3 text-left text-sm text-danger hover:bg-danger/5 transition-colors"
          >
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
