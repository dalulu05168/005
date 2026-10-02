-- Disable login TOTP while retaining the existing password hash and sessions model.
-- Clear stored seeds and any pending challenges so no previously exposed seed can
-- be used to satisfy an authentication step.
update public.workspace_accounts
set totp_secret = null,
    totp_enabled = false,
    totp_enrolled_at = null;

delete from public.workspace_login_challenges;
