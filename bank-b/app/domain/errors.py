class DomainError(Exception):
    pass


class InvalidAmountError(DomainError):
    def __init__(self, value: object) -> None:
        super().__init__(f"Amount must be a positive integer number of cents, got {value!r}.")


class AccountNotFoundError(DomainError):
    def __init__(self, account_id: str) -> None:
        super().__init__(f"Account {account_id} not found.")
