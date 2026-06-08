// Browser-side client for Studio's /api/ide proxy.
// The proxy calls hs_* tools on mcp.holoscript.net server-side
// so the HOLOSCRIPT_API_KEY never reaches the browser.

async function callIdeTool<T>(tool: string, args: Record<string, unknown>): Promise<T | null> {
  try {
    const res = await fetch('/api/ide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, args }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok?: boolean; data?: T };
    return json.data ?? null;
  } catch {
    return null;
  }
}

// ─── hs_diagnostics ──────────────────────────────────────────────────────────

export interface LspDiagnostic {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info' | 'hint';
  quickFix?: string;
}

export async function getDiagnostics(code: string): Promise<LspDiagnostic[]> {
  const result = await callIdeTool<{ diagnostics: LspDiagnostic[] }>('hs_diagnostics', { code });
  return result?.diagnostics ?? [];
}

// ─── hs_autocomplete ─────────────────────────────────────────────────────────

export interface LspCompletion {
  label: string;
  kind?: string;
  detail?: string;
  insertText?: string;
  documentation?: string;
}

export async function getCompletions(
  code: string,
  line: number,
  column: number,
  triggerCharacter?: string,
): Promise<LspCompletion[]> {
  const args: Record<string, unknown> = { code, line, column };
  if (triggerCharacter) args['triggerCharacter'] = triggerCharacter;
  const result = await callIdeTool<{ completions: LspCompletion[] }>('hs_autocomplete', args);
  return result?.completions ?? [];
}

// ─── hs_hover ────────────────────────────────────────────────────────────────

export interface LspHover {
  kind?: string;
  value?: string;
  documentation?: string;
}

export async function getHover(
  code: string,
  line: number,
  column: number,
): Promise<LspHover | null> {
  const result = await callIdeTool<{ content: LspHover | null }>('hs_hover', {
    code,
    line,
    column,
  });
  return result?.content ?? null;
}
