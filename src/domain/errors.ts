export abstract class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidAmountError extends DomainError {
  constructor(value: unknown) {
    super(`Amount must be a positive integer number of cents, got ${String(value)}.`);
  }
}

export class SelfTransferError extends DomainError {
  constructor() {
    super('Payer and payee accounts must be different.');
  }
}

export class InsufficientFundsError extends DomainError {
  constructor(accountId: string) {
    super(`Account ${accountId} has insufficient funds.`);
  }
}

export class AccountNotFoundError extends DomainError {
  constructor(accountId: string) {
    super(`Account ${accountId} not found.`);
  }
}

export class TransferNotFoundError extends DomainError {
  constructor(transferId: string) {
    super(`Transfer ${transferId} not found.`);
  }
}

export class IdempotencyConflictError extends DomainError {
  constructor() {
    super('Idempotency key was already used with different parameters.');
  }
}
