-- ============================================================
-- Migration 007: Fix lỗi "column reference role_code is ambiguous"
-- ============================================================
-- Nguyên nhân: trong admin_list_users() RETURNS TABLE có cột role_code,
-- nên `select role_code from profiles` ở trong function bị PostgreSQL
-- coi là ambiguous (trùng với OUT parameter).
--
-- Fix: qualify rõ profiles.role_code ở mọi nơi đọc cột này.
-- Đồng thời chuẩn hoá các function khác để an toàn.
-- ============================================================

-- ----- 1. current_user_role: qualify cho an toàn -----
create or replace function current_user_role() returns text as $$
  select profiles.role_code from profiles where profiles.id = auth.uid();
$$ language sql security definer;

-- ----- 2. current_user_facility -----
create or replace function current_user_facility() returns text as $$
  select profiles.facility_id from profiles where profiles.id = auth.uid();
$$ language sql security definer;

-- ----- 3. current_user_dept (từ migration 005) -----
create or replace function current_user_dept() returns text as $$
  select roles.dept_id from roles
  where roles.code = (select profiles.role_code from profiles where profiles.id = auth.uid())
$$ language sql security definer;

-- ----- 4. current_user_block (từ migration 005) -----
create or replace function current_user_block() returns text as $$
  select roles.block_id from roles
  where roles.code = (select profiles.role_code from profiles where profiles.id = auth.uid())
$$ language sql security definer;

-- ----- 5. admin_list_users — FIX CHÍNH -----
create or replace function admin_list_users()
returns table (
  id uuid,
  email text,
  created_at timestamptz,
  full_name text,
  phone text,
  role_code text,
  facility_id text,
  is_probation boolean,
  active boolean,
  has_profile boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role text;
begin
  -- Qualify profiles.role_code để tránh đụng OUT parameter "role_code"
  select profiles.role_code into caller_role
  from profiles
  where profiles.id = auth.uid();

  if caller_role is null or caller_role not in ('CEO', 'GD_KD', 'GD_VP') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  return query
    select
      u.id,
      u.email::text                       as email,
      u.created_at                        as created_at,
      p.full_name                         as full_name,
      p.phone                             as phone,
      p.role_code                         as role_code,
      p.facility_id::text                 as facility_id,
      p.is_probation                      as is_probation,
      coalesce(p.active, false)           as active,
      (p.id is not null)                  as has_profile
    from auth.users u
    left join profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

grant execute on function admin_list_users() to authenticated;

-- ----- 6. admin_upsert_profile — qualify cho an toàn -----
create or replace function admin_upsert_profile(
  p_email text,
  p_full_name text,
  p_role_code text,
  p_facility_id text default null,
  p_phone text default null,
  p_is_probation boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_role text;
  uid uuid;
begin
  select profiles.role_code into caller_role
  from profiles
  where profiles.id = auth.uid();

  if caller_role is null or caller_role not in ('CEO', 'GD_KD', 'GD_VP') then
    raise exception 'Permission denied' using errcode = '42501';
  end if;

  select auth.users.id into uid
  from auth.users
  where auth.users.email = p_email;

  if uid is null then
    raise exception 'User % chưa tồn tại trong auth. Yêu cầu họ đăng ký /login trước.', p_email;
  end if;

  insert into profiles (id, full_name, email, role_code, facility_id, phone, is_probation, active)
  values (uid, p_full_name, p_email, p_role_code, p_facility_id, p_phone, p_is_probation, true)
  on conflict (id) do update set
    full_name    = excluded.full_name,
    role_code    = excluded.role_code,
    facility_id  = excluded.facility_id,
    phone        = excluded.phone,
    is_probation = excluded.is_probation,
    active       = true;

  return uid;
end;
$$;

grant execute on function admin_upsert_profile(text, text, text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
