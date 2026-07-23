import { Controller, Get, Param } from '@nestjs/common';
import { SettlementRecord } from './settlement.repository';
import { SettlementsService } from './settlements.service';

@Controller('settlements')
export class SettlementsController {
  constructor(private readonly settlementsService: SettlementsService) {}

  /** Ground truth for a bank's own reconciliation sweep — "what actually happened to this settlement". */
  @Get(':id')
  get(@Param('id') id: string): Promise<SettlementRecord> {
    return this.settlementsService.getSettlement(id);
  }
}
