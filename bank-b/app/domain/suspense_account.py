"""
Bank B's own transit account. Crediting a payee for money arriving from Bank A
still has to keep Bank B's local double-entry ledger balanced, so the credit
is paired with a debit to this account instead of appearing out of nowhere —
see migrations/003_create_incoming_transfers.sql.
"""

SUSPENSE_ACCOUNT_ID = "00000000-0000-0000-0000-000000000001"
