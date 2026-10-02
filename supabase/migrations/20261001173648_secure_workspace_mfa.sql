alter table public.workspace_accounts add column if not exists totp_last_step bigint not null default -1;
alter table public.workspace_accounts add column if not exists recovery_hashes jsonb not null default '[]'::jsonb;
alter table public.workspace_sessions add column if not exists mfa_verified boolean not null default false;
alter table public.workspace_login_challenges add column if not exists encrypted_seed text;

-- All MFA updates are atomic and callable only by the existing server role.
create or replace function public.workspace_complete_mfa(p_challenge_hash text,p_step bigint,p_recovery_hash text,p_token_hash text,p_expires timestamptz,p_recovery_hashes jsonb default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare c public.workspace_login_challenges%rowtype; a public.workspace_accounts%rowtype; sid uuid;
begin
 select * into c from public.workspace_login_challenges where challenge_hash=p_challenge_hash for update;
 if c.id is null or c.expires_at<=now() or c.failed_count>=5 then return null; end if;
 select * into a from public.workspace_accounts where id=c.account_id for update;
 if a.disabled then return null; end if;
 if c.purpose='enroll' then
   if a.totp_enabled or c.encrypted_seed is null or p_step is null or p_recovery_hashes is null then return null; end if;
   update public.workspace_accounts set totp_secret=c.encrypted_seed,totp_enabled=true,totp_last_step=p_step,totp_enrolled_at=now(),recovery_hashes=p_recovery_hashes where id=a.id;
   delete from public.workspace_sessions where account_id=a.id;
 else
   if not a.totp_enabled then return null; end if;
   if p_recovery_hash is not null then
     if not (a.recovery_hashes ? p_recovery_hash) then return null; end if;
     update public.workspace_accounts set recovery_hashes=recovery_hashes-p_recovery_hash where id=a.id;
   else
     if p_step is null or p_step<=a.totp_last_step then return null; end if;
     update public.workspace_accounts set totp_last_step=p_step where id=a.id;
   end if;
 end if;
 delete from public.workspace_login_challenges where account_id=a.id;
 insert into public.workspace_sessions(account_id,token_hash,expires_at,mfa_verified) values(a.id,p_token_hash,p_expires,true) returning id into sid;
 return sid;
end $$;
revoke all on function public.workspace_complete_mfa(text,bigint,text,text,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.workspace_complete_mfa(text,bigint,text,text,timestamptz,jsonb) to service_role;

create or replace function public.workspace_fail_mfa(p_hash text)
returns void language sql security invoker set search_path=public as $$
 update public.workspace_login_challenges set failed_count=failed_count+1 where challenge_hash=p_hash;
$$;
revoke all on function public.workspace_fail_mfa(text) from public,anon,authenticated;
grant execute on function public.workspace_fail_mfa(text) to service_role;
