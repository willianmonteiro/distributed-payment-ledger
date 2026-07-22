import { IsInt, IsNotEmpty, IsPositive, IsUUID, MaxLength } from 'class-validator';

export class CreateInterbankTransferDto {
  @IsUUID()
  payerAccountId!: string;

  @IsNotEmpty()
  @MaxLength(255)
  payeeAccountRef!: string;

  @IsInt()
  @IsPositive()
  amountCents!: number;
}
