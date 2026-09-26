alter table public.zynth_trader_mt5_credentials
 add column if not exists previous_mt5_login text,
 add column if not exists previous_mt5_server text,
 add column if not exists previous_investor_password_ciphertext text,
 add column if not exists change_requested_at timestamptz,
 add column if not exists change_requested boolean not null default false;
update public.zynth_trader_mt5_credentials set change_requested=false where change_requested is null;