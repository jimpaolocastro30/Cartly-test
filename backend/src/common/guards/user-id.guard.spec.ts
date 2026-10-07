import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { UserIdGuard } from './user-id.guard';

function contextWith(headers: Record<string, string | string[] | undefined>) {
  const request: { headers: typeof headers; userId?: string } = { headers };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

describe('UserIdGuard', () => {
  const guard = new UserIdGuard();

  it('allows a request with X-User-ID and attaches the trimmed ID', () => {
    const { context, request } = contextWith({ 'x-user-id': '  user-123 ' });
    expect(guard.canActivate(context)).toBe(true);
    expect(request.userId).toBe('user-123');
  });

  it('rejects a request without X-User-ID', () => {
    const { context } = contextWith({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a blank X-User-ID', () => {
    const { context } = contextWith({ 'x-user-id': '   ' });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it.each(['a/b', '..', '.', 'x'.repeat(129)])(
    'rejects an ID that is not a safe Firestore document ID (%p)',
    (userId) => {
      const { context } = contextWith({ 'x-user-id': userId });
      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    },
  );
});
