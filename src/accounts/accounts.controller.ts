import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { Account } from '../domain';
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';

@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  create(@Body() body: CreateAccountDto): Promise<Account> {
    return this.accountsService.createAccount(body.ownerName);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<Account> {
    return this.accountsService.getAccount(id);
  }

  @Get(':id/balance')
  async balance(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ accountId: string; balanceCents: number }> {
    const balance = await this.accountsService.getBalance(id);
    return { accountId: id, balanceCents: balance.cents };
  }

  @Get(':id/statement')
  async statement(@Param('id', ParseUUIDPipe) id: string): Promise<{
    accountId: string;
    entries: { transferId: string; amountCents: number; createdAt: Date }[];
  }> {
    const lines = await this.accountsService.getStatement(id);
    return {
      accountId: id,
      entries: lines.map((line) => ({
        transferId: line.transferId,
        amountCents: line.amount.cents,
        createdAt: line.createdAt,
      })),
    };
  }
}
