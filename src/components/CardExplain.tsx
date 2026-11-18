import { FEATURE_COPY, type FeatureKey } from '../lib/featureCopy';

/** V20-326 (COPY CP-006 to 011): while the pointer is on a card's title (or one marked hover-title with the same key),
 *  the card's contents give way to its feature words, the same ones as its tour slide. Pure CSS (:has), no state. */
export function CardExplain({ k }: { k: FeatureKey }) {
  const c = FEATURE_COPY[k];
  return (
    <div className="card-explain" data-k={k} aria-hidden="true">
      <p className="card-explain-title">{c.title}</p>
      <p className="card-explain-body">{c.body}</p>
    </div>
  );
}
