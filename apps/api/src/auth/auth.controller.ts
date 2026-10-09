import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiErrorCode,
  LoginRequestSchema,
  RegisterRequestSchema,
} from '@livepulse/contracts';
import type {
  CsrfResponse,
  CurrentUserResponse,
  LoginResponse,
  RefreshResponse,
  RegisterResponse,
} from '@livepulse/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

import {
  DatabaseUnavailableError,
  EmailAlreadyExistsError,
  InvalidCredentialsError,
  InvalidSessionError,
} from './auth.errors.js';
import { AccessTokenGuard } from './access-token.guard.js';
import type { AuthenticatedRequest } from './authenticated-request.js';
import {
  accessCookieName,
  csrfCookieName,
  refreshCookieName,
} from './auth-token.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { RegistrationService } from './registration.service.js';
import { type EstablishedSession, SessionService } from './session.service.js';

@Controller('auth')
export class AuthController {
  public constructor(
    @Inject(RegistrationService)
    private readonly registration: RegistrationService,
    @Inject(SessionService) private readonly sessions: SessionService,
  ) {}

  @Get('csrf')
  public csrf(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): CsrfResponse {
    const csrfToken = this.sessions.createCsrfToken(
      request.cookies[refreshCookieName],
    );
    this.setCsrfCookie(reply, csrfToken);

    return { requestId: request.id };
  }

  @Post('register')
  @UseGuards(CsrfGuard)
  public async register(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
  ): Promise<RegisterResponse> {
    const parsed = RegisterRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpException(
        {
          code: ApiErrorCode.ValidationError,
          message: 'The registration request is invalid',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const user = await this.registration.register(parsed.data);

      return {
        requestId: request.id,
        user: {
          ...user,
          createdAt: user.createdAt.toISOString(),
        },
      };
    } catch (error) {
      if (error instanceof EmailAlreadyExistsError) {
        throw new HttpException(
          {
            code: ApiErrorCode.EmailAlreadyExists,
            message: error.message,
          },
          HttpStatus.CONFLICT,
        );
      }

      if (error instanceof DatabaseUnavailableError) {
        throw new HttpException(
          {
            code: ApiErrorCode.ServiceUnavailable,
            message: error.message,
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      throw error;
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('login')
  @UseGuards(CsrfGuard)
  public async login(
    @Body() body: unknown,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<LoginResponse> {
    const parsed = LoginRequestSchema.safeParse(body);

    if (!parsed.success) {
      throw new HttpException(
        {
          code: ApiErrorCode.ValidationError,
          message: 'The login request is invalid',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const session = await this.sessions.login(parsed.data);
      this.setCookies(reply, session);

      return {
        accessTokenExpiresAt: session.access.expiresAt.toISOString(),
        refreshTokenExpiresAt: session.refresh.expiresAt.toISOString(),
        requestId: request.id,
        user: {
          ...session.user,
          createdAt: session.user.createdAt.toISOString(),
        },
      };
    } catch (error) {
      this.throwSessionError(error);
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  @UseGuards(CsrfGuard)
  public async refresh(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<RefreshResponse> {
    try {
      const session = await this.sessions.refresh(
        request.cookies[refreshCookieName],
      );
      this.setCookies(reply, session);

      return {
        accessTokenExpiresAt: session.access.expiresAt.toISOString(),
        refreshTokenExpiresAt: session.refresh.expiresAt.toISOString(),
        requestId: request.id,
      };
    } catch (error) {
      if (error instanceof InvalidSessionError) {
        this.clearCookies(reply);
      }

      this.throwSessionError(error);
    }
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  @UseGuards(CsrfGuard)
  public async logout(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    try {
      await this.sessions.logout(request.cookies[refreshCookieName]);
    } catch (error) {
      this.clearCookies(reply);
      this.throwSessionError(error);
    }

    this.clearCookies(reply);
  }

  @Get('me')
  @UseGuards(AccessTokenGuard)
  public async me(
    @Req() request: AuthenticatedRequest,
  ): Promise<CurrentUserResponse> {
    try {
      const user = await this.sessions.currentUser(request.auth.userId);

      return {
        requestId: request.id,
        user: {
          ...user,
          createdAt: user.createdAt.toISOString(),
        },
      };
    } catch (error) {
      this.throwSessionError(error);
    }
  }

  private setCookies(reply: FastifyReply, session: EstablishedSession): void {
    const shared = {
      httpOnly: true,
      sameSite: 'strict' as const,
      secure: this.sessions.secureCookies,
    };

    void reply.setCookie(accessCookieName, session.access.token, {
      ...shared,
      expires: session.access.expiresAt,
      path: '/',
    });
    void reply.setCookie(refreshCookieName, session.refresh.token, {
      ...shared,
      expires: session.refresh.expiresAt,
      path: '/api/v1/auth',
    });
    this.setCsrfCookie(reply, session.csrfToken);
  }

  private setCsrfCookie(reply: FastifyReply, token: string): void {
    void reply.setCookie(csrfCookieName, token, {
      sameSite: 'strict',
      secure: this.sessions.secureCookies,
      path: '/',
    });
  }

  private clearCookies(reply: FastifyReply): void {
    void reply.clearCookie(accessCookieName, { path: '/' });
    void reply.clearCookie(csrfCookieName, { path: '/' });
    void reply.clearCookie(refreshCookieName, { path: '/api/v1/auth' });
  }

  private throwSessionError(error: unknown): never {
    if (error instanceof InvalidCredentialsError) {
      throw new HttpException(
        {
          code: ApiErrorCode.InvalidCredentials,
          message: error.message,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (error instanceof InvalidSessionError) {
      throw new HttpException(
        {
          code: ApiErrorCode.InvalidSession,
          message: error.message,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (error instanceof DatabaseUnavailableError) {
      throw new HttpException(
        {
          code: ApiErrorCode.ServiceUnavailable,
          message: error.message,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    throw error;
  }
}
