# Reminder / Notification cho Checklist

Phần này yêu cầu **server-side cron** — không chạy được từ client React.
Có 2 cách triển khai trên Supabase:

## Cách 1: pg_cron (đơn giản, đủ dùng)

Cần bật extension `pg_cron` ở Database → Extensions trong Dashboard.

```sql
-- ============================================================
-- A. Hàm tạo notification cho người làm
-- ============================================================
create or replace function notify_checklist_reminder()
returns void as $$
declare
  r record;
begin
  -- 10 phút trước deadline: "Chuẩn bị checklist"
  for r in
    select i.id, i.assigned_to, t.role_label
    from checklist_instances i
    join checklist_templates t on t.id = i.template_id
    where i.status in ('pending')
      and i.deadline_at between now() + interval '9 minutes' and now() + interval '11 minutes'
  loop
    insert into notifications (user_id, type, title, link, related_id)
    values (r.assigned_to, 'checklist_prep', 'Chuẩn bị checklist: ' || r.role_label, '/checklist', r.id::text)
    on conflict do nothing;
  end loop;

  -- Đến giờ deadline: "Đã đến giờ thực hiện"
  for r in
    select i.id, i.assigned_to, t.role_label
    from checklist_instances i
    join checklist_templates t on t.id = i.template_id
    where i.status in ('pending')
      and i.deadline_at between now() - interval '1 minute' and now() + interval '1 minute'
  loop
    insert into notifications (user_id, type, title, link, related_id)
    values (r.assigned_to, 'checklist_due', 'Đã đến giờ thực hiện: ' || r.role_label, '/checklist', r.id::text)
    on conflict do nothing;
  end loop;

  -- Quá hạn 10 phút: báo người làm
  for r in
    select i.id, i.assigned_to, t.role_label
    from checklist_instances i
    join checklist_templates t on t.id = i.template_id
    where i.status in ('pending', 'in_progress')
      and i.deadline_at between now() - interval '11 minutes' and now() - interval '9 minutes'
  loop
    insert into notifications (user_id, type, title, link, related_id)
    values (r.assigned_to, 'checklist_overdue_self', 'Quá hạn 10p: ' || r.role_label, '/checklist', r.id::text)
    on conflict do nothing;
  end loop;

  -- Quá hạn 20 phút: báo người duyệt + QLCS, đổi status sang overdue
  for r in
    select i.id, i.assigned_to, i.reviewer_id, i.facility_id, t.role_label
    from checklist_instances i
    join checklist_templates t on t.id = i.template_id
    where i.status in ('pending', 'in_progress')
      and i.deadline_at < now() - interval '20 minutes'
  loop
    update checklist_instances set status = 'overdue' where id = r.id;

    if r.reviewer_id is not null then
      insert into notifications (user_id, type, title, link, related_id)
      values (r.reviewer_id, 'checklist_overdue_review', 'Cần duyệt: ' || r.role_label || ' (quá hạn)', '/checklist', r.id::text)
      on conflict do nothing;
    end if;

    -- QLCS cùng cơ sở
    insert into notifications (user_id, type, title, link, related_id)
    select p.id, 'checklist_overdue_qlcs', 'CS ' || r.facility_id || ': checklist quá hạn ' || r.role_label, '/checklist', r.id::text
    from profiles p
    where p.role_code like 'QLCS\_%' escape '\'
      and p.facility_id = r.facility_id
    on conflict do nothing;
  end loop;
end;
$$ language plpgsql;

-- ============================================================
-- B. Trigger khi checklist bị đánh dấu failed → báo người duyệt + QLCS ngay
-- ============================================================
create or replace function notify_checklist_failed()
returns trigger as $$
begin
  if new.status = 'failed' and (old.status is null or old.status <> 'failed') then
    -- Báo QLCS
    insert into notifications (user_id, type, title, link, related_id)
    select p.id, 'checklist_failed', 'Checklist KHÔNG ĐẠT (CS ' || new.facility_id || ')', '/checklist', new.id::text
    from profiles p
    where p.role_code like 'QLCS\_%' escape '\'
      and p.facility_id = new.facility_id;

    -- Báo reviewer (nếu khác QLCS)
    if new.reviewer_id is not null then
      insert into notifications (user_id, type, title, link, related_id)
      values (new.reviewer_id, 'checklist_failed', 'Checklist KHÔNG ĐẠT cần xử lý', '/checklist', new.id::text);
    end if;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_checklist_failed on checklist_instances;
create trigger trg_checklist_failed
  after insert or update of status on checklist_instances
  for each row execute function notify_checklist_failed();

-- ============================================================
-- C. Lịch cron: chạy mỗi phút
-- ============================================================
select cron.schedule('checklist-reminders', '* * * * *', $$select notify_checklist_reminder()$$);
```

## Cách 2: Supabase Edge Function + Cron

Tạo edge function `checklist-reminders` (Deno/TypeScript), schedule chạy mỗi phút. Logic tương tự pg_cron nhưng có thể gọi Push API ra app mobile.

## Bước triển khai

1. Bật extension pg_cron trong Supabase Dashboard
2. Chạy SQL ở trên trong SQL Editor
3. Verify: `select * from cron.job;`
4. Theo dõi: `select * from cron.job_run_details order by start_time desc limit 10;`
5. Front-end `Header.tsx` đã có realtime subscription cho `notifications` — sẽ tự hiện chuông thông báo.
