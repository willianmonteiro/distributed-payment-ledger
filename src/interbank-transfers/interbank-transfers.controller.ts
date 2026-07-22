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
import { CreateInterbankTransferDto } from './dto/create-interbank-transfer.dto';
import { InterbankTransferResult, InterbankTransfersService } from './interbank-transfers.service';

interface InterbankTransferResponse {
  transferId: string;
  payerAccountId: string;
  payeeAccountRef: string;
  amountCents: number;
  status: string;
  createdAt: Date;
}

@Controller('interbank-transfers')
export class InterbankTransfersController {
  constructor(private readonly interbankTransfers: InterbankTransfersService) {}

  @Post()
  async create(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: CreateInterbankTransferDto,
  ): Promise<InterbankTransferResponse> {
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new BadRequestException(
        'Idempotency-Key header is required and must be at most 255 characters.',
      );
    }
    const result = await this.interbankTransfers.execute(idempotencyKey, {
      payerAccountId: body.payerAccountId,
      payeeAccountRef: body.payeeAccountRef,
      amount: Money.fromCents(body.amountCents),
    });
    return toResponse(result);
  }

  @Get(':id')
  async get(@Param('id', ParseUUIDPipe) id: string): Promise<InterbankTransferResponse> {
    return toResponse(await this.interbankTransfers.getTransfer(id));
  }
}

function toResponse(result: InterbankTransferResult): InterbankTransferResponse {
  return {
    transferId: result.transfer.id,
    payerAccountId: result.transfer.payerAccountId,
    payeeAccountRef: result.interbank.payeeAccountRef,
    amountCents: result.transfer.amount.cents,
    status: result.interbank.status,
    createdAt: result.transfer.createdAt,
  };
}
