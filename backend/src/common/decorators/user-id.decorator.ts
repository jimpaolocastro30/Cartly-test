import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** Returns the user ID validated and attached by UserIdGuard. */
export const UserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest().userId;
});
