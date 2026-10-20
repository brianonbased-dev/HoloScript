/**
 * User-scoped HoloMesh routes answer 404 { code: 'no_holomesh_agent' } when the
 * signed-in user has no HoloMesh agent of their own (#570): Studio no longer
 * answers them under its server key. That is a normal state, not an error, and
 * pages show a "Join HoloMesh" prompt for it.
 */
export const NO_HOLOMESH_AGENT = 'no_holomesh_agent';

export function isNoHoloMeshAgentBody(body: unknown): boolean {
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === NO_HOLOMESH_AGENT
  );
}

/** True for a 404 whose JSON body says no_holomesh_agent. Does not consume `res`. */
export async function isNoHoloMeshAgentResponse(res: Response): Promise<boolean> {
  if (res.status !== 404) return false;
  try {
    return isNoHoloMeshAgentBody(await res.clone().json());
  } catch {
    return false;
  }
}
