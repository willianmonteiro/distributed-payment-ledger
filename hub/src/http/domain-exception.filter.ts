import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  BankNotFoundError,
  DomainError,
  DuplicateBankError,
  InvalidAmountError,
  SameBankSettlementError,
  SettlementNotFoundError,
} from '../domain';

const STATUS_BY_ERROR: ReadonlyArray<[new (...args: never[]) => DomainError, HttpStatus]> = [
  [BankNotFoundError, HttpStatus.NOT_FOUND],
  [SettlementNotFoundError, HttpStatus.NOT_FOUND],
  [DuplicateBankError, HttpStatus.CONFLICT],
  [InvalidAmountError, HttpStatus.BAD_REQUEST],
  [SameBankSettlementError, HttpStatus.BAD_REQUEST],
];

@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const match = STATUS_BY_ERROR.find(([type]) => exception instanceof type);
    const status = match?.[1] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    response.status(status).json({
      statusCode: status,
      error: exception.name,
      message: exception.message,
    });
  }
}
