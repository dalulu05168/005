alter table public.workspace_accounts
  add column if not exists totp_secret text,
  add column if not exists totp_enabled boolean not null default false,
  add column if not exists totp_enrolled_at timestamptz;

create table if not exists public.workspace_login_challenges (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.workspace_accounts(id) on delete cascade,
  challenge_hash text not null unique,
  purpose text not null check (purpose in ('enroll','verify')),
  failed_count integer not null default 0 check (failed_count >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists workspace_login_challenges_account_idx
  on public.workspace_login_challenges(account_id);

create index if not exists workspace_login_challenges_expires_idx
  on public.workspace_login_challenges(expires_at);

alter table public.workspace_login_challenges enable row level security;
revoke all on table public.workspace_login_challenges from anon, authenticated;
