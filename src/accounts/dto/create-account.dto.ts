import { IsString, Length } from 'class-validator';

export class CreateAccountDto {
  @IsString()
  @Length(1, 120)
  ownerName!: string;
}
