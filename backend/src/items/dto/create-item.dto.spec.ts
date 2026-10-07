import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateItemDto } from './create-item.dto';

async function errorsFor(body: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateItemDto, body);
  const errors = await validate(dto);
  return errors.flatMap((e) => Object.values(e.constraints ?? {}));
}

describe('CreateItemDto', () => {
  it('accepts a valid item', async () => {
    expect(await errorsFor({ name: 'Milk', quantity: 2 })).toEqual([]);
  });

  it('trims the name', () => {
    expect(plainToInstance(CreateItemDto, { name: '  Milk  ', quantity: 1 }).name).toBe('Milk');
  });

  it.each([[''], ['   ']])('rejects an empty name (%p)', async (name) => {
    expect(await errorsFor({ name, quantity: 1 })).toContain('Item name cannot be empty');
  });

  it('rejects a missing name', async () => {
    expect(await errorsFor({ quantity: 1 })).toContain('Item name cannot be empty');
  });

  it('rejects quantity 0', async () => {
    expect(await errorsFor({ name: 'Milk', quantity: 0 })).toContain('Quantity must be at least 1');
  });

  it('rejects a negative quantity', async () => {
    expect(await errorsFor({ name: 'Milk', quantity: -3 })).toContain(
      'Quantity must be at least 1',
    );
  });

  it('rejects a non-integer quantity', async () => {
    expect(await errorsFor({ name: 'Milk', quantity: 1.5 })).toContain(
      'Quantity must be a whole number',
    );
  });

  it('rejects a missing quantity', async () => {
    expect(await errorsFor({ name: 'Milk' })).toContain('Quantity must be a whole number');
  });
});
