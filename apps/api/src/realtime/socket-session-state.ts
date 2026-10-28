import type { AuthenticatedPrincipal } from '../auth/authenticated-request.js';
import type {
  AuthenticatedSession,
  BetterAuthService,
} from '../auth/better-auth.service.js';

const principalTtlMs = 15_000;

export class SocketSessionState {
  public principal: AuthenticatedPrincipal | undefined;
  public expiresAt = 0;
  public validUntil = 0;
  private pending: Promise<AuthenticatedPrincipal | undefined> | undefined;

  public constructor(
    private readonly headers: Headers,
    public readonly hasSessionCookie: boolean,
    session: AuthenticatedSession | undefined,
  ) {
    this.set(session);
  }

  public async resolve(
    authentication: Pick<BetterAuthService, 'sessionPrincipalFromHeaders'>,
    onRefresh?: () => void,
  ): Promise<AuthenticatedPrincipal | undefined> {
    if (!this.hasSessionCookie) return undefined;
    if (this.validUntil > Date.now() && this.expiresAt > Date.now()) {
      return this.principal;
    }
    if (this.pending) return this.pending;

    onRefresh?.();
    const refresh = this.refresh(authentication);
    this.pending = refresh;
    try {
      return await refresh;
    } finally {
      if (this.pending === refresh) this.pending = undefined;
    }
  }

  public invalidate(): void {
    this.validUntil = 0;
  }

  public isCached(): boolean {
    return (
      this.hasSessionCookie &&
      this.validUntil > Date.now() &&
      this.expiresAt > Date.now()
    );
  }

  private async refresh(
    authentication: Pick<BetterAuthService, 'sessionPrincipalFromHeaders'>,
  ): Promise<AuthenticatedPrincipal | undefined> {
    try {
      const session = await authentication.sessionPrincipalFromHeaders(
        this.headers,
      );
      this.set(session);
      return this.principal;
    } catch (error) {
      this.set(undefined);
      throw error;
    }
  }

  private set(session: AuthenticatedSession | undefined): void {
    this.principal = session?.principal;
    this.expiresAt = session?.expiresAt.getTime() ?? 0;
    this.validUntil = session
      ? Math.min(Date.now() + principalTtlMs, this.expiresAt)
      : 0;
  }
}
