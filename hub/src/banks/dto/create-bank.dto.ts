import { IsString, IsUrl, Length } from 'class-validator';

export class CreateBankDto {
  @IsString()
  @Length(1, 64)
  id!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsUrl({ require_tld: false })
  baseUrl!: string;
}
