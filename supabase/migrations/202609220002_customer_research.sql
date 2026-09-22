-- Phase 2: professional research recorded directly against a customer.
begin;

create table public.customer_research (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null default public.current_organization_id()
    references public.organizations(id),
  customer_id uuid not null,
  body text not null check (length(btrim(body)) > 0),
  created_by uuid not null default auth.uid() references auth.users(id),
  author_email text not null default (auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  constraint customer_research_customer_organization_fk
    foreign key (customer_id, organization_id)
    references public.customers(id, organization_id) on delete cascade
);

create index customer_research_customer_created_idx on public.customer_research(customer_id, created_at desc);
create index customer_research_organization_idx on public.customer_research(organization_id);

alter table public.customer_research enable row level security;
revoke all on public.customer_research from anon, authenticated;
grant select, insert, update, delete on public.customer_research to authenticated;
create policy tenant_select on public.customer_research for select to authenticated
  using (organization_id = (select public.current_organization_id()));
create policy tenant_insert on public.customer_research for insert to authenticated
  with check (organization_id = (select public.current_organization_id()));
create policy tenant_update on public.customer_research for update to authenticated
  using (organization_id = (select public.current_organization_id()))
  with check (organization_id = (select public.current_organization_id()));
create policy tenant_admin_delete on public.customer_research for delete to authenticated
  using (organization_id = (select public.current_organization_id()) and exists (
    select 1 from public.organization_members where user_id = (select auth.uid())
      and organization_id = public.current_organization_id() and role = 'admin'
  ));

create trigger customer_research_touch_customer after insert or update or delete on public.customer_research
  for each row execute function public.touch_related_customer();

commit;
