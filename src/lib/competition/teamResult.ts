import type { Competition } from './types';
import type { CompHistoryEntry } from './types';

const PHASE_ORDER = ['group', 'league', 'lpm_playoff', 'R64', 'R32', 'R16', 'QF', 'SF', '3rd', 'F'];

export function deriveTeamPhase(teamId: string, comp: Competition): string | undefined {
  const played = comp.matches.filter(
    (m) => m.status === 'completed' && (m.homeTeamId === teamId || m.awayTeamId === teamId),
  );
  if (played.length === 0) return undefined;
  return played.reduce((best, m) => {
    const bi = PHASE_ORDER.indexOf(best);
    const mi = PHASE_ORDER.indexOf(m.phase);
    return mi > bi ? m.phase : best;
  }, played[0].phase);
}

export function deriveTeamResult(teamId: string, comp: Competition): CompHistoryEntry['result'] {
  if (comp.winner === teamId) return 'winner';

  const finalMatch = comp.matches.find((m) => m.phase === 'F' && m.status === 'completed');
  if (finalMatch && (finalMatch.homeTeamId === teamId || finalMatch.awayTeamId === teamId)) {
    return 'finalist';
  }

  if (comp.manualThird === teamId) return 'third';

  const thirdMatch = comp.matches.find((m) => m.phase === '3rd' && m.status === 'completed');
  if (thirdMatch) {
    const thirdWinner = thirdMatch.result
      ? (thirdMatch.result.home > thirdMatch.result.away ? thirdMatch.homeTeamId : thirdMatch.awayTeamId)
      : null;
    if (thirdWinner === teamId) return 'third';
    if (thirdMatch.homeTeamId === teamId || thirdMatch.awayTeamId === teamId) return 'semi';
  }

  const sfMatches = comp.matches.filter((m) => m.phase === 'SF' && m.status === 'completed');
  if (sfMatches.some((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)) return 'semi';

  const qfMatches = comp.matches.filter((m) => m.phase === 'QF' && m.status === 'completed');
  if (qfMatches.some((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)) return 'quarter';

  const r16Matches = comp.matches.filter((m) => m.phase === 'R16' && m.status === 'completed');
  if (r16Matches.some((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)) return 'round16';

  const r32Matches = comp.matches.filter((m) => m.phase === 'R32' && m.status === 'completed');
  if (r32Matches.some((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)) return 'round32';

  const r64Matches = comp.matches.filter((m) => m.phase === 'R64' && m.status === 'completed');
  if (r64Matches.some((m) => m.homeTeamId === teamId || m.awayTeamId === teamId)) return 'round64';

  return 'participant';
}
