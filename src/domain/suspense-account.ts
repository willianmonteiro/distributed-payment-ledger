/**
 * Bank A's transit account for interbank transfers. Locally, sending money to
 * Bank B is booked as an ordinary transfer to this account — see
 * migrations/005_create_interbank_transfers.sql for why.
 */
export const SUSPENSE_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';
