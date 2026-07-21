import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Money } from '../domain';
import { TransferRecord } from './transfer.repository';
import { TransfersService } from './transfers.service';
import { CreateTransferDto } from './dto/create-transfer.dto';

interface TransferResponse {
  id: string;
  payerAccountId: string;
  payeeAccountId: string;
  amountCents: number;
  createdAt: Date;
}

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Post()
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateTransferDto,
  ): Promise<TransferResponse> {
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key header is required and must be at most 255 characters.',
      );
    }
    const record = await this.transfersService.execute(idempotencyKey, {
      payerAccountId: body.payerAccountId,
      payeeAccountId: body.payeeAccountId,
      amount: Money.fromCents(body.amountCents),
    });
    return toResponse(record);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<TransferResponse> {
    return toResponse(await this.transfersService.getTransfer(id));
  }
}

function toResponse(record: TransferRecord): TransferResponse {
  return {
    id: record.id,
    payerAccountId: record.payerAccountId,
    payeeAccountId: record.payeeAccountId,
    amountCents: record.amount.cents,
    createdAt: record.createdAt,
  };
}
