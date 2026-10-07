import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';

export const USER_ID_HEADER = 'x-user-id';

/** Path-safe Firestore document ID: no slashes, not "." or "..", max 128 chars. */
const USER_ID_PATTERN = /^(?!\.\.?$)[^/]{1,128}$/;

@Injectable()
export class UserIdGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { userId?: string }>();
    const raw = request.headers[USER_ID_HEADER];
    const userId = (Array.isArray(raw) ? raw[0] : raw)?.trim();

    if (!userId) {
      throw new UnauthorizedException('X-User-ID header is required');
    }
    if (!USER_ID_PATTERN.test(userId)) {
      throw new UnauthorizedException('X-User-ID header is invalid');
    }

    request.userId = userId;
    return true;
  }
}
