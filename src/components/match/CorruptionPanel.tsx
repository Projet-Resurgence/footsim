import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { generateRefOffer, acceptOffer, mergeBothDeals, getBothSidesMessage, refusedByRef, type CorruptionOffer } from '@/lib/sim/corruption';
import type { CorruptionDeal } from '@/lib/sim/types';

type Props = {
  homeTeamName: string;
  awayTeamName: string;
  deal: CorruptionDeal | null;
  onDeal: (d: CorruptionDeal | null) => void;
};

type SideDeal = { accepted: boolean; deal: CorruptionDeal };

export function CorruptionPanel({ homeTeamName, awayTeamName, deal, onDeal }: Props) {
  const [enabled, setEnabled] = useState(false);
  const [offer, setOffer] = useState<CorruptionOffer | null>(null);
  const [contacted, setContacted] = useState(false);
  const [refused, setRefused] = useState(false);
  const [reportedToAuthorities, setReportedToAuthorities] = useState(false);
  const [homeState, setHomeState] = useState<SideDeal | null>(null);
  const [awayState, setAwayState] = useState<SideDeal | null>(null);
  const [bothMessage, setBothMessage] = useState<string | null>(null);

  function contactRef() {
    const o = generateRefOffer();
    setContacted(true);
    if (!o) {
      // Ref not approachable — check if he reports the approach
      const reported = refusedByRef();
      setRefused(true);
      setReportedToAuthorities(reported);
    } else {
      setOffer(o);
    }
  }

  function acceptSide(side: 'home' | 'away') {
    if (!offer) return;
    // 20% chance ref refuses and reports despite seemingly accepting the approach
    const refRefused = refusedByRef();
    const sideDeal = { ...acceptOffer(side, offer), refusedByRef: refRefused };
    const nextHome = side === 'home' ? { accepted: true, deal: sideDeal } : homeState;
    const nextAway = side === 'away' ? { accepted: true, deal: sideDeal } : awayState;
    if (side === 'home') setHomeState({ accepted: true, deal: sideDeal });
    else setAwayState({ accepted: true, deal: sideDeal });

    if (nextHome?.accepted && nextAway?.accepted) {
      setBothMessage(getBothSidesMessage());
      onDeal(mergeBothDeals(nextHome.deal, nextAway.deal));
    } else {
      onDeal(sideDeal);
    }
    if (refRefused) {
      setReportedToAuthorities(true);
    }
  }

  function cancelSide(side: 'home' | 'away') {
    const nextHome = side === 'home' ? null : homeState;
    const nextAway = side === 'away' ? null : awayState;
    if (side === 'home') setHomeState(null);
    else setAwayState(null);
    setBothMessage(null);

    if (nextHome?.accepted && nextAway?.accepted) {
      onDeal(mergeBothDeals(nextHome.deal, nextAway.deal));
    } else if (nextHome?.accepted && nextHome.deal) {
      onDeal(nextHome.deal);
    } else if (nextAway?.accepted && nextAway.deal) {
      onDeal(nextAway.deal);
    } else {
      onDeal(null);
    }
  }

  function toggle(v: boolean) {
    setEnabled(v);
    if (!v) reset();
  }

  function reset() {
    setOffer(null);
    setContacted(false);
    setRefused(false);
    setReportedToAuthorities(false);
    setHomeState(null);
    setAwayState(null);
    setBothMessage(null);
    onDeal(null);
  }

  return (
    <section className="rounded-lg border border-danger/30 bg-danger/5 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium text-danger">⚠ Corruption arbitrale</div>
          <div className="text-xs text-muted mt-0.5">30% révélation post-match → tapis vert. L'arbitre peut refuser et dénoncer (30%).</div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} className="h-4 w-4" />
          Activer
        </label>
      </div>

      {enabled && !contacted && (
        <Button size="sm" variant="ghost" onClick={contactRef} className="border-danger/40 text-danger hover:bg-danger/10">
          Contacter l'arbitre
        </Button>
      )}

      {enabled && contacted && refused && !reportedToAuthorities && (
        <div className="rounded-md bg-surface border border-border p-3 text-sm text-muted italic">
          L'arbitre n'est pas intéressé pour ce match.
        </div>
      )}

      {enabled && contacted && refused && reportedToAuthorities && (
        <div className="rounded-md bg-danger/10 border border-danger/40 p-3 space-y-1">
          <div className="text-sm font-medium text-danger">⚠ L'arbitre a refusé et dénoncé</div>
          <div className="text-xs text-muted">Une enquête CMF est ouverte. Le prochain match de votre équipe risque un tapis vert (50%).</div>
        </div>
      )}

      {enabled && deal?.refusedByRef && (
        <div className="rounded-md bg-danger/10 border border-danger/40 p-3 space-y-1">
          <div className="text-sm font-medium text-danger">⚠ Enquête CMF en cours</div>
          <div className="text-xs text-muted">L'arbitre a accepté l'argent puis dénoncé. Le prochain match risque un tapis vert (50%).</div>
        </div>
      )}

      {enabled && contacted && offer && (
        <div className="space-y-3">
          <div className="rounded-md bg-surface border border-warning/30 p-4 space-y-2">
            <div className="text-xs uppercase tracking-widest text-warning">L'arbitre est approchable</div>
            <p className="text-sm italic text-muted">"{offer.message}"</p>
            <div className="text-sm font-medium">
              Montant demandé : <span className="text-warning">{offer.amount}M€</span>
            </div>
          </div>

          {/* Home side — independent decision */}
          <div className="rounded-md border border-border bg-surface p-3 space-y-2">
            <div className="text-xs font-medium">{homeTeamName}</div>
            {homeState?.accepted ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-accent">✓ Deal accepté</span>
                <button onClick={() => cancelSide('home')} className="text-xs text-muted hover:text-danger transition-colors">Annuler</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => acceptSide('home')}>Accepter</Button>
                <Button size="sm" variant="ghost" onClick={() => cancelSide('home')}>Refuser</Button>
              </div>
            )}
          </div>

          {/* Away side — independent decision */}
          <div className="rounded-md border border-border bg-surface p-3 space-y-2">
            <div className="text-xs font-medium">{awayTeamName}</div>
            {awayState?.accepted ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-accent">✓ Deal accepté</span>
                <button onClick={() => cancelSide('away')} className="text-xs text-muted hover:text-danger transition-colors">Annuler</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => acceptSide('away')}>Accepter</Button>
                <Button size="sm" variant="ghost" onClick={() => cancelSide('away')}>Refuser</Button>
              </div>
            )}
          </div>
        </div>
      )}

      {deal && (
        <div className="rounded-md bg-surface border border-danger/20 p-3 space-y-1">
          <div className="text-sm font-medium text-danger">
            {deal.side === 'both' ? 'Double deal actif' : 'Deal actif'}
          </div>
          <div className="text-xs text-muted">
            {deal.side === 'both' ? (
              <>
                Les deux équipes ont versé <span className="font-medium text-warning">{deal.bribe}M€</span> au total.
                {bothMessage && <span className="block italic mt-1">"{bothMessage}"</span>}
                <span className="block mt-1">L'arbitre joue en neutre — mais le match sera tendu.</span>
              </>
            ) : (
              <>
                {deal.side === 'home' ? homeTeamName : awayTeamName} a versé{' '}
                <span className="font-medium text-warning">{deal.bribe}M€</span>. L'arbitre favorisera cette équipe.
              </>
            )}
          </div>
          <button onClick={reset} className="text-xs text-muted hover:text-danger transition-colors mt-1 block">
            Annuler tout
          </button>
        </div>
      )}
    </section>
  );
}
