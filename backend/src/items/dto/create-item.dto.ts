import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class CreateItemDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: 'Item name must be a string' })
  @IsNotEmpty({ message: 'Item name cannot be empty' })
  @MaxLength(200, { message: 'Item name must be at most 200 characters' })
  name!: string;

  @IsInt({ message: 'Quantity must be a whole number' })
  @Min(1, { message: 'Quantity must be at least 1' })
  quantity!: number;
}
