alter table public.zynth_trader_mt5_credentials
  add column if not exists credential_reset_required boolean not null default false;

-- Force a one-time credential re-entry after the MT5 encryption key rotation.
-- Existing ciphertext is intentionally preserved for audit/recovery; it is not assumed decryptable
-- under the new key. Traders must submit fresh credentials, which are encrypted with the new key.
update public.zynth_trader_mt5_credentials
set credential_reset_required=true,
    status='pending',
    change_requested=false,
    change_requested_at=null,
    rejection_reason='Security credential reset required. Please resubmit your MT5 credentials.'
where credential_reset_required=false;

create index if not exists idx_zynth_trader_mt5_reset_required
  on public.zynth_trader_mt5_credentials(credential_reset_required)
  where credential_reset_required=true;
