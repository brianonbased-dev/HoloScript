'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface SkillMeta {
  name: string;
  fileName: string;
  path: string;
  size: number;
  modifiedAt: string;
  actions: string[];
  traits: string[];
  states: number;
  description: string;
}

const STUDIO_URL = process.env.NEXT_PUBLIC_STUDIO_URL || 'https://studio.holoscript.net';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AcademyHoloClawLitePage() {
  const [skills, setSkills] = useState<SkillMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch('/api/holoclaw');
        const data = await res.json();
        if (cancelled) return;
        setSkills(data.skills || []);
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message || 'Failed to load skills');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="min-h-screen bg-studio-bg text-studio-text p-6 md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">HoloClaw Lite (Academy)</h1>
          <p className="text-sm text-studio-muted">
            Read-only skill visibility for learning contexts.
          </p>
        </header>

        <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 md:p-5">
          <p className="text-sm font-semibold text-amber-300">
            Read-only in Academy; manage in Studio.
          </p>
          <p className="mt-2 text-xs text-amber-100/90">
            Skill installation, run/stop/status lifecycle controls are intentionally disabled in Academy.
            Use Studio or CLI for operational control.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={`${STUDIO_URL}/holoclaw`}
              className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-semibold text-black hover:bg-amber-300"
            >
              Open Studio HoloClaw
            </a>
            <code className="rounded-lg border border-studio-border bg-studio-panel px-3 py-1.5 text-[11px] text-studio-muted">
              holoscript daemon compositions/holoclaw.hsplus --always-on --debug
            </code>
          </div>
        </section>

        {error && (
          <section className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">
            {error}
          </section>
        )}

        <section className="rounded-xl border border-studio-border bg-studio-panel/60 p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Installed skills (read-only)</h2>
            <span className="text-xs text-studio-muted">{skills.length} total</span>
          </div>

          {loading ? (
            <p className="text-sm text-studio-muted">Loading skills...</p>
          ) : skills.length === 0 ? (
            <p className="text-sm text-studio-muted">No skills found.</p>
          ) : (
            <ul className="space-y-2">
              {skills.map((skill) => (
                <li
                  key={skill.path}
                  className="rounded-lg border border-studio-border bg-[#0f172a] px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{skill.name}</p>
                      <p className="text-[11px] text-studio-muted">{skill.path}</p>
                    </div>
                    <span className="text-[11px] text-studio-muted">{formatBytes(skill.size)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="text-xs text-studio-muted">
          <Link href="/" className="hover:text-studio-text">
            ← Back to Academy Home
          </Link>
        </footer>
      </div>
    </main>
  );
}
