create or replace function public.protect_primary_account_mfa_binding()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if old.username='chennan118'
     and old.totp_enabled
     and (not new.totp_enabled or new.totp_secret is null) then
    raise exception 'Primary account MFA binding cannot be cleared implicitly';
  end if;
  return new;
end
$$;

drop trigger if exists protect_primary_account_mfa_binding_trg
on public.workspace_accounts;

create trigger protect_primary_account_mfa_binding_trg
before update of totp_enabled, totp_secret
on public.workspace_accounts
for each row
execute function public.protect_primary_account_mfa_binding();
