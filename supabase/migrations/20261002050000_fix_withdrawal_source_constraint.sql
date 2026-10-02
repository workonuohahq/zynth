-- Allow the combined withdrawal source used by request_withdrawal_by_source().
alter table public.withdrawal_requests
  drop constraint if exists withdrawal_requests_withdrawal_source_check;

alter table public.withdrawal_requests
  add constraint withdrawal_requests_withdrawal_source_check
  check (withdrawal_source = any (array['wallet'::text,'profit'::text,'zpa'::text,'combined'::text]));
