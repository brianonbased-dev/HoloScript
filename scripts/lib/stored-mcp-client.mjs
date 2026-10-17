/**
 * Stored MCP client credentials for machine callers (card tools-codebase-scope,
 * Option 1). An admin provisions a confidential client at
 * POST /oauth/admin/clients; the caller reads its id and secret from env
 * (<PREFIX>_ID / <PREFIX>_SECRET style names) or, on Windows, from Credential
 * Manager (generic credential: user = client id, password = secret), and skips
 * self-registration. Without stored credentials, callers fall back to
 * registering from loopback (dev only: a self-registered client gets `social`
 * on client_credentials).
 *
 * Never logs or returns the secret anywhere but the caller's memory.
 */
import { spawnSync } from 'node:child_process';

/** Redirect URI sent on dev loopback registration (the server requires one). */
export const DEV_LOOPBACK_REDIRECT_URI = 'http://127.0.0.1/oauth/callback';

const CRED_READ_PS = `
$ErrorActionPreference = 'Stop'
Add-Type -Namespace HoloCred -Name R -MemberDefinition @"
[StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct CRED { public int Flags; public int Type; public string TargetName; public string Comment; public long LastWritten; public int CredentialBlobSize; public IntPtr CredentialBlob; public int Persist; public int AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName; }
[DllImport("advapi32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern bool CredReadW(string t, int type, int flags, out IntPtr p);
[DllImport("advapi32.dll")] public static extern void CredFree(IntPtr p);
"@
$p = [IntPtr]::Zero
if (-not [HoloCred.R]::CredReadW($env:HOLO_CRED_TARGET, 1, 0, [ref]$p)) { exit 3 }
$c = [Runtime.InteropServices.Marshal]::PtrToStructure($p, [type][HoloCred.R+CRED])
$s = [Runtime.InteropServices.Marshal]::PtrToStringUni($c.CredentialBlob, $c.CredentialBlobSize / 2)
[HoloCred.R]::CredFree($p)
[Console]::Out.Write((@{ u = $c.UserName; p = $s } | ConvertTo-Json -Compress))
`;

/** Read a generic Windows credential; null when absent or not on Windows. */
export function readWindowsCredential(target, { platform = process.platform, spawn = spawnSync } = {}) {
  if (platform !== 'win32' || !target) return null;
  const r = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', CRED_READ_PS], {
    encoding: 'utf8',
    env: { ...process.env, HOLO_CRED_TARGET: target },
    windowsHide: true,
    timeout: 15_000,
  });
  if (r.status !== 0 || !r.stdout) return null;
  try {
    const { u, p } = JSON.parse(r.stdout);
    return u && p ? { clientId: String(u), clientSecret: String(p) } : null;
  } catch {
    return null;
  }
}

/**
 * The stored client for one caller, or null.
 * @param {{ idVar: string, secretVar: string, credentialTarget?: string,
 *   env?: Record<string,string|undefined>, readCredential?: (t: string) => ({clientId:string,clientSecret:string}|null) }} o
 */
export function readStoredMcpClient({
  idVar,
  secretVar,
  credentialTarget,
  env = process.env,
  readCredential = readWindowsCredential,
}) {
  const clientId = env[idVar]?.trim();
  const clientSecret = env[secretVar]?.trim();
  if (clientId && clientSecret) return { clientId, clientSecret, source: 'env' };
  const cred = credentialTarget ? readCredential(credentialTarget) : null;
  if (cred) return { ...cred, source: 'credential-manager' };
  return null;
}