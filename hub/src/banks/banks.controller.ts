import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { Bank } from '../domain';
import { BanksService } from './banks.service';
import { CreateBankDto } from './dto/create-bank.dto';

@Controller('banks')
export class BanksController {
  constructor(private readonly banksService: BanksService) {}

  /** Onboarding a new participant: one call, no code changes anywhere in the Hub or any other bank. */
  @Post()
  create(@Body() body: CreateBankDto): Promise<Bank> {
    return this.banksService.registerBank(body.id, body.name, body.baseUrl);
  }

  @Get()
  list(): Promise<Bank[]> {
    return this.banksService.listBanks();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Bank> {
    return this.banksService.getBank(id);
  }

  @Get(':id/reserve-balance')
  async reserveBalance(
    @Param('id') id: string,
  ): Promise<{ bankId: string; balanceCents: number }> {
    const balance = await this.banksService.getReserveBalance(id);
    return { bankId: id, balanceCents: balance.cents };
  }
}
