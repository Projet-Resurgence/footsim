import { POSITIONS, POSITION_LABEL, POSITION_FULL } from '@/lib/types';

export default function Postes() {
  return (
    <div className="space-y-6 max-w-sm">
      <h1 className="font-display text-3xl">Postes</h1>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-bg text-left text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Abrév.</th>
              <th className="px-4 py-2 font-medium">Poste</th>
            </tr>
          </thead>
          <tbody>
            {POSITIONS.map((p) => (
              <tr key={p} className="border-t border-border">
                <td className="px-4 py-2">
                  <span className="rounded bg-border/40 px-2 py-0.5 font-mono text-xs font-medium">
                    {POSITION_LABEL[p]}
                  </span>
                </td>
                <td className="px-4 py-2 text-text/80">{POSITION_FULL[p]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
