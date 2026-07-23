import { IsInt, IsPositive } from 'class-validator';

export class DevSeedDto {
  @IsInt()
  @IsPositive()
  amountCents!: number;
}
