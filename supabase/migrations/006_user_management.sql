-- ============================================================
-- Migration 006: Quản lý người dùng
-- ============================================================
-- - Profile RLS: CEO/GĐ Khối CRUD tất cả
-- - admin_list_users(): liệt kê auth.users + profile
-- - admin_upsert_profile(): tạo/cập nhật profile theo email
-- ============================================================

drop policy if exists "Profiles: admin all" on profiles;

create policy "Profiles: admin all" on profiles
  for all using (
    current_user_role() in ('CEO', 'GD_KD', 'GD_VP')
  ) with check (
    current_user_role() in ('CEO', 'GD_KD', 'GD_VP')
  );

-- ----- Function: liệt kê người dùng (admin only) -----
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
      u.email::text             as email,
      u.created_at              as created_at,
      p.full_name               as full_name,
      p.phone                   as phone,
      p.role_code               as role_code,
      p.facility_id::text       as facility_id,
      p.is_probation            as is_probation,
      coalesce(p.active, false) as active,
      (p.id is not null)        as has_profile
    from auth.users u
    left join profiles p on p.id = u.id
    order by u.created_at desc;
end;
$$;

grant execute on function admin_list_users() to authenticated;

-- ----- Function: tạo/cập nhật profile theo email (admin only) -----
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
    full_name = excluded.full_name,
    role_code = excluded.role_code,
    facility_id = excluded.facility_id,
    phone = excluded.phone,
    is_probation = excluded.is_probation,
    active = true;

  return uid;
end;
$$;

grant execute on function admin_upsert_profile(text, text, text, text, text, boolean) to authenticated;

notify pgrst, 'reload schema';
