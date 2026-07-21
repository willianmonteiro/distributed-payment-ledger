import { IsInt, IsPositive, IsUUID } from 'class-validator';

export class CreateTransferDto {
  @IsUUID()
  payerAccountId!: string;

  @IsUUID()
  payeeAccountId!: string;

  @IsInt()
  @IsPositive()
  amountCents!: number;
}
