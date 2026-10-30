create table public.shield_demo_payments (
  id text primary key check (id ~ '^PAY-[a-zA-Z0-9-]{5,80}$'),
  record jsonb not null check (jsonb_typeof(record)='object' and octet_length(record::text)<12000),
  updated_at timestamptz not null default now()
);
create index shield_demo_payments_updated_idx on public.shield_demo_payments(updated_at desc);
alter table public.shield_demo_payments enable row level security;
revoke all on public.shield_demo_payments from anon, authenticated;
grant select,insert,update,delete on public.shield_demo_payments to service_role;
create function public.shield_save_demo_payment(payment jsonb) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare saved jsonb;
begin
  insert into public.shield_demo_payments(id,record) values(payment->>'id',payment)
  on conflict(id) do update set record=case
    when shield_demo_payments.record#>>'{customerReport,updatedAt}' is not null
      and coalesce(excluded.record#>>'{customerReport,updatedAt}','') <= shield_demo_payments.record#>>'{customerReport,updatedAt}'
    then excluded.record || jsonb_build_object('customerReport',shield_demo_payments.record->'customerReport')
    else excluded.record end,updated_at=now()
  where shield_demo_payments.record->>'sender'=excluded.record->>'sender'
    and shield_demo_payments.record->>'receiver'=excluded.record->>'receiver'
    and shield_demo_payments.record->>'amount'=excluded.record->>'amount'
    and coalesce(shield_demo_payments.record->>'bank','')=coalesce(excluded.record->>'bank','')
    and shield_demo_payments.record->>'createdAt'=excluded.record->>'createdAt'
    and (shield_demo_payments.record->>'status' not in ('Paid','Cancelled','Held for review')
      or shield_demo_payments.record->>'status'=excluded.record->>'status');
  select record into saved from public.shield_demo_payments where id=payment->>'id';
  delete from public.shield_demo_payments where id in
    (select id from public.shield_demo_payments order by updated_at desc offset 1500);
  return saved;
end $$;
revoke all on function public.shield_save_demo_payment(jsonb) from public,anon,authenticated;
grant execute on function public.shield_save_demo_payment(jsonb) to service_role;

create policy deny_direct_browser_access on public.shield_demo_payments for all to anon,authenticated using(false) with check(false);
