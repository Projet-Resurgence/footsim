export type ThemeMode = 'day' | 'night';

const OVERRIDE_KEY = 'footsim.theme_override';

export function getThemeOverride(): ThemeMode | null {
  const v = localStorage.getItem(OVERRIDE_KEY);
  return v === 'day' || v === 'night' ? v : null;
}

export function setThemeOverride(mode: ThemeMode | null): void {
  if (mode === null) localStorage.removeItem(OVERRIDE_KEY);
  else localStorage.setItem(OVERRIDE_KEY, mode);
}

export function modeForHour(hour: number): ThemeMode {
  return hour >= 6 && hour < 19 ? 'day' : 'night';
}

export function applyTheme(mode: ThemeMode): void {
  const html = document.documentElement;
  html.classList.toggle('dark', mode === 'night');
  html.dataset.theme = mode;
}

export function startThemeCycle(): () => void {
  const update = () => {
    const override = getThemeOverride();
    applyTheme(override ?? modeForHour(new Date().getHours()));
  };
  update();
  const id = window.setInterval(update, 60_000);
  return () => window.clearInterval(id);
}
