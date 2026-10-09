import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import { ApiErrorCode, RegisterRequestSchema } from '@livepulse/contracts';
import type { RegisterResponse } from '@livepulse/contracts';
import type { FastifyRequest } from 'fastify';

import {
  DatabaseUnavailableError,
  EmailAlreadyExistsError,
} from './auth.errors.js';
import { RegistrationService } from './registration.service.js';

@Controller('auth')
export class AuthController {
  public constructor(
    @Inject(RegistrationService)
    private readonly registration: RegistrationService,
  ) {}

  @Post('register')
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
}
