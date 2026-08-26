ALTER TABLE public.finance_transactions
ADD COLUMN IF NOT EXISTS booking_status text NOT NULL DEFAULT 'booked';

CREATE INDEX IF NOT EXISTS idx_finance_transactions_owner_booking_status
ON public.finance_transactions(owner_id, booking_status, booking_date DESC);
