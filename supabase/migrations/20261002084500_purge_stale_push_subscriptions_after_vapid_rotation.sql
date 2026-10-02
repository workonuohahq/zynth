-- Current VAPID credentials no longer match the active subscriptions.
-- Revoke every existing subscription so devices re-register against the current key.

update public.zynth_push_subscriptions
set revoked_at=coalesce(revoked_at, now())
where revoked_at is null;
