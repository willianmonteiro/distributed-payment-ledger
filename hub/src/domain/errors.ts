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

export class BankNotFoundError extends DomainError {
  constructor(bankId: string) {
    super(`Bank ${bankId} not found.`);
  }
}

export class DuplicateBankError extends DomainError {
  constructor(bankId: string) {
    super(`Bank ${bankId} is already registered.`);
  }
}

export class SameBankSettlementError extends DomainError {
  constructor() {
    super('Payer bank and payee bank must be different.');
  }
}

export class SettlementNotFoundError extends DomainError {
  constructor(settlementId: string) {
    super(`Settlement ${settlementId} not found.`);
  }
}
