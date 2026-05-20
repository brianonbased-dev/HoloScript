type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function firstParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? '' : value ?? '';
}

export default async function QuestProofUnavailablePage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const target = firstParam(params.target) || 'unknown route';
  const runId = firstParam(params.runId);
  const reason =
    firstParam(params.reason) ||
    'This route is not promoted for headset proof until it reaches a deterministic first viewport.';
  const dashboardHref = runId ? `/quest-proof?runId=${encodeURIComponent(runId)}` : '/quest-proof';

  return (
    <main
      data-quest-proof-unavailable
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: 24,
        background: '#05070d',
        color: '#f8fafc',
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <section
        style={{
          width: 'min(100%, 680px)',
          border: '1px solid rgba(148, 163, 184, 0.28)',
          borderRadius: 8,
          padding: 24,
          background: 'rgba(15, 23, 42, 0.82)',
          boxShadow: '0 24px 80px rgba(0, 0, 0, 0.42)',
        }}
      >
        <p
          style={{
            margin: '0 0 12px',
            color: '#67e8f9',
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: 0,
            textTransform: 'uppercase',
          }}
        >
          Quest proof unavailable
        </p>
        <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.12 }}>
          {target} is intentionally held out of headset proof.
        </h1>
        <p style={{ margin: '16px 0 0', color: '#cbd5e1', fontSize: 15, lineHeight: 1.6 }}>
          {reason}
        </p>
        <dl
          style={{
            display: 'grid',
            gap: 10,
            margin: '20px 0 0',
            color: '#94a3b8',
            fontSize: 13,
          }}
        >
          <div>
            <dt style={{ color: '#e2e8f0', fontWeight: 700 }}>Route</dt>
            <dd style={{ margin: '4px 0 0', fontFamily: 'ui-monospace, SFMono-Regular, monospace' }}>
              {target}
            </dd>
          </div>
          {runId && (
            <div>
              <dt style={{ color: '#e2e8f0', fontWeight: 700 }}>Run</dt>
              <dd
                style={{
                  margin: '4px 0 0',
                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                }}
              >
                {runId}
              </dd>
            </div>
          )}
        </dl>
        <a
          href={dashboardHref}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            minHeight: 44,
            marginTop: 24,
            borderRadius: 8,
            background: '#22d3ee',
            color: '#082f49',
            padding: '0 16px',
            fontSize: 14,
            fontWeight: 800,
            textDecoration: 'none',
          }}
        >
          Back to Quest proof dashboard
        </a>
      </section>
    </main>
  );
}
