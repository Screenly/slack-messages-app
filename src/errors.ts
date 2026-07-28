// Transient failure (network, 5xx/429), as opposed to a genuine application
// error (misconfiguration, missing scopes) — only these are eligible for
// persistent-cache failover.
export class BackendServerError extends Error {}

export function shouldSkipBackendError(
  error: unknown,
  displayErrors: boolean
): boolean {
  return error instanceof BackendServerError && !displayErrors
}
