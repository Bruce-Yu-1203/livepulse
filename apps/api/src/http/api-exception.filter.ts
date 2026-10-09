import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import { ApiErrorCode } from '@livepulse/contracts';
import type { ApiErrorResponse } from '@livepulse/contracts';
import type { FastifyReply, FastifyRequest } from 'fastify';

interface ErrorPayload {
  code?: unknown;
  message?: unknown;
  retryAfterMs?: unknown;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  public catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload =
      exception instanceof HttpException
        ? this.toPayload(exception.getResponse())
        : {};

    const response: ApiErrorResponse = {
      code: this.resolveCode(status, payload.code),
      message: this.resolveMessage(status, payload.code, payload.message),
      requestId: request.id,
      ...(typeof payload.retryAfterMs === 'number'
        ? { retryAfterMs: payload.retryAfterMs }
        : {}),
    };

    void reply.status(status).send(response);
  }

  private toPayload(response: string | object): ErrorPayload {
    return typeof response === 'object' ? (response as ErrorPayload) : {};
  }

  private resolveCode(
    status: number,
    candidate: unknown,
  ): ApiErrorResponse['code'] {
    if (this.isApiErrorCode(candidate)) {
      return candidate;
    }

    if (status === HttpStatus.BAD_REQUEST) {
      return ApiErrorCode.ValidationError;
    }

    if (status === HttpStatus.NOT_FOUND) {
      return ApiErrorCode.NotFound;
    }

    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      return ApiErrorCode.ServiceUnavailable;
    }

    return ApiErrorCode.InternalError;
  }

  private resolveMessage(
    status: number,
    code: unknown,
    candidate: unknown,
  ): string {
    if (
      this.isApiErrorCode(code) &&
      typeof candidate === 'string' &&
      candidate.length > 0
    ) {
      return candidate;
    }

    if (status === HttpStatus.BAD_REQUEST) {
      return 'The request is invalid';
    }

    if (status === HttpStatus.SERVICE_UNAVAILABLE) {
      return 'The service is temporarily unavailable';
    }

    return 'An unexpected error occurred';
  }

  private isApiErrorCode(
    candidate: unknown,
  ): candidate is ApiErrorResponse['code'] {
    return (
      typeof candidate === 'string' &&
      Object.values(ApiErrorCode).includes(
        candidate as (typeof ApiErrorCode)[keyof typeof ApiErrorCode],
      )
    );
  }
}
