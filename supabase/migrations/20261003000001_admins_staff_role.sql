-- A third staff role: "staff".
--
-- The Android admin app adds a narrow role below manager (lib/admin-api/
-- permissions.ts holds exactly what it may do; docs/admin-api/permissions.md
-- is the same table for people). Owners named in ADMIN_EMAILS stay owners and
-- have no admins row; everyone else is an admins row with role owner, manager
-- or staff. The web admin does not let staff in yet (lib/admin.ts): they use
-- the app, whose API enforces the staff matrix.
--
-- public.admins predates the migrations folder, so how `role` is constrained
-- is not written down here. This handles each shape it can have:
--   an enum         gains the value 'staff'
--   text + CHECK    every CHECK that mentions role is replaced by one
--                   allowing owner, manager and staff
--   plain text      gets that CHECK (it only ever held owner and manager)
-- Re-running it is safe.

do $$
declare
  v_type oid;
  v_kind "char";
  v_name text;
  v_schema text;
  c record;
begin
  if to_regclass('public.admins') is null then
    raise exception 'public.admins does not exist: create the staff table first';
  end if;

  select a.atttypid into v_type
  from pg_attribute a
  where a.attrelid = 'public.admins'::regclass and a.attname = 'role' and not a.attisdropped;
  if v_type is null then
    raise exception 'public.admins has no role column';
  end if;

  select t.typtype, t.typname, n.nspname into v_kind, v_name, v_schema
  from pg_type t join pg_namespace n on n.oid = t.typnamespace
  where t.oid = v_type;

  if v_kind = 'e' then
    execute format('alter type %I.%I add value if not exists %L', v_schema, v_name, 'staff');
  elsif v_kind = 'd' then
    raise exception 'public.admins.role is the domain %.%: add ''staff'' to its CHECK by hand', v_schema, v_name;
  else
    for c in
      select con.conname
      from pg_constraint con
      where con.conrelid = 'public.admins'::regclass
        and con.contype = 'c'
        and pg_get_constraintdef(con.oid) ~* '\mrole\M'
    loop
      execute format('alter table public.admins drop constraint %I', c.conname);
    end loop;
    alter table public.admins
      add constraint admins_role_check check (role in ('owner', 'manager', 'staff'));
  end if;
end
$$;

comment on column public.admins.role is
  'owner (everything), manager (the manager scope) or staff (the narrow app role). Matrix: lib/admin-api/permissions.ts.';
