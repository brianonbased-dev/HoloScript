'use client';

/**
 * BloomLegend — scope read-out for the paper flower (F.037). It labels the bloom
 * as a structural-readiness proxy and keeps empirical claim support unverified.
 */
import type { BakedScene } from './bakedTypes';

export function BloomLegend({ scene }: { scene: BakedScene }) {
  const petals = scene.paperPetals ?? [];
  const matched = petals.filter((p) => p.health !== null);
  const wilted = petals.filter((p) => p.bloomHealth === 'wilted');
  const aggregate = scene.aggregate ?? 0;
  const basis = scene.healthBasis ?? 'structural-readiness-proxy';
  const claimSupport = scene.claimSupport ?? 'unverified';

  return (
    <div className="absolute bottom-3 left-3 z-20 max-w-xs rounded-lg border border-white/10 bg-black/55 p-3 text-xs text-gray-200 backdrop-blur">
      <div className="mb-1 font-semibold text-fuchsia-200">Structural readiness bloom</div>
      <div className="mb-2 text-gray-400">
        {matched.length} of {petals.length} petals bound to audit tokens · readiness proxy{' '}
        <span className="font-mono text-emerald-300">{(aggregate * 100).toFixed(0)}%</span>
      </div>
      {wilted.length > 0 ? (
        <div>
          <div className="mb-1 text-amber-300">Proxy wilt ({wilted.length}):</div>
          <ul className="space-y-0.5">
            {wilted.map((p) => (
              <li key={p.index} className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-amber-600" />
                <span>
                  {p.title.replace(/^Petal\s+\S+:?\s*/, '')} ·{' '}
                  <span className="font-mono text-amber-300">{((p.health ?? 0) * 100).toFixed(0)}%</span>
                  {p.retired ? ' · retired' : ` · ${p.failing} failing`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="text-emerald-300">No proxy-driven wilt in this audit snapshot.</div>
      )}
      <div className="mt-2 text-[10px] text-gray-500">
        basis: {basis} · empirical claim support: {claimSupport}
      </div>
    </div>
  );
}
