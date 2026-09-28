create table if not exists public.zynth_broadcast_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  category text not null default 'custom',
  title text not null check (char_length(btrim(title)) between 1 and 160),
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  action_url text,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.zynth_broadcast_templates enable row level security;
revoke all on public.zynth_broadcast_templates from anon,authenticated;
create index if not exists idx_zynth_broadcast_templates_created on public.zynth_broadcast_templates(created_at desc);

create or replace function public.zynth_admin_broadcast_user_directory(p_admin_id uuid,p_query text)
returns table(user_id uuid,full_name text,email text,role text,funded boolean,push_state text)
language plpgsql security definer set search_path to ''
as $$
begin
 if not public.zynth_has_role(auth.uid(),'admin') or not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 return query
 select c.user_id,c.full_name,c.email,c.role,c.funded,c.push_state
 from public.zynth_broadcast_candidates('{}'::jsonb) c
 where coalesce(p_query,'')='' or coalesce(c.full_name,'') ilike '%'||p_query||'%' or coalesce(c.email,'') ilike '%'||p_query||'%'
 order by c.full_name nulls last,c.email
 limit 50;
end $$;

create or replace function public.zynth_admin_save_broadcast_draft(
 p_admin_id uuid,p_id uuid,p_title text,p_body text,p_audience jsonb,p_channel_in_app boolean,p_channel_push boolean,p_priority text,p_action_url text
) returns uuid language plpgsql security definer set search_path to ''
as $$
declare v_id uuid;
begin
 if not public.zynth_has_role(auth.uid(),'admin') or not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if char_length(btrim(coalesce(p_title,'')))>160 or char_length(btrim(coalesce(p_body,'')))>5000 then raise exception 'MESSAGE_TOO_LONG'; end if;
 if p_priority not in ('normal','important','urgent') then raise exception 'INVALID_PRIORITY'; end if;
 if p_id is null then
  insert into public.zynth_broadcasts(created_by,title,body,audience,channel_in_app,channel_push,priority,action_url,status)
  values(auth.uid(),coalesce(nullif(btrim(p_title),''),'Untitled broadcast'),coalesce(nullif(btrim(p_body),''),' '),coalesce(p_audience,'{}'::jsonb),coalesce(p_channel_in_app,true),coalesce(p_channel_push,true),p_priority,nullif(btrim(coalesce(p_action_url,'')),''),'draft') returning id into v_id;
 else
  update public.zynth_broadcasts set title=coalesce(nullif(btrim(p_title),''),'Untitled broadcast'),body=coalesce(nullif(btrim(p_body),''),' '),audience=coalesce(p_audience,'{}'::jsonb),channel_in_app=coalesce(p_channel_in_app,true),channel_push=coalesce(p_channel_push,true),priority=p_priority,action_url=nullif(btrim(coalesce(p_action_url,'')),'')
  where id=p_id and created_by=auth.uid() and status='draft' returning id into v_id;
  if v_id is null then raise exception 'DRAFT_NOT_FOUND'; end if;
 end if;
 return v_id;
end $$;

create or replace function public.zynth_admin_broadcast_drafts(p_admin_id uuid)
returns table(id uuid,title text,body text,audience jsonb,channel_in_app boolean,channel_push boolean,priority text,action_url text,created_at timestamptz)
language plpgsql security definer set search_path to ''
as $$
begin
 if not public.zynth_has_role(auth.uid(),'admin') or not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 return query select b.id,b.title,b.body,b.audience,b.channel_in_app,b.channel_push,b.priority,b.action_url,b.created_at from public.zynth_broadcasts b where b.created_by=auth.uid() and b.status='draft' order by b.created_at desc;
end $$;

create or replace function public.zynth_admin_delete_broadcast_draft(p_admin_id uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path to ''
as $$
begin
 if not public.zynth_has_role(auth.uid(),'admin') or not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 delete from public.zynth_broadcasts where id=p_id and created_by=auth.uid() and status='draft';
 return found;
end $$;

create or replace function public.zynth_admin_broadcast_templates(p_admin_id uuid)
returns table(id uuid,name text,category text,title text,body text,priority text,action_url text,created_at timestamptz)
language plpgsql security definer set search_path to ''
as $$
begin
 if not public.zynth_has_role(auth.uid(),'admin') or not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 return query select t.id,t.name,t.category,t.title,t.body,t.priority,t.action_url,t.created_at from public.zynth_broadcast_templates t order by t.created_at desc;
end $$;

create or replace function public.zynth_admin_save_broadcast_template(p_admin_id uuid,p_id uuid,p_name text,p_category text,p_title text,p_body text,p_priority text,p_action_url text)
returns uuid language plpgsql security definer set search_path to ''
as $$
declare v_id uuid;
begin
 if not public.zynth_has_role(auth.uid(),'admin') or not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if char_length(btrim(coalesce(p_name,'')))=0 or char_length(btrim(coalesce(p_title,'')))=0 or char_length(btrim(coalesce(p_body,'')))=0 then raise exception 'TEMPLATE_REQUIRED'; end if;
 if p_priority not in ('normal','important','urgent') then raise exception 'INVALID_PRIORITY'; end if;
 if p_id is null then insert into public.zynth_broadcast_templates(name,category,title,body,priority,action_url,created_by) values(btrim(p_name),coalesce(nullif(btrim(p_category),''),'custom'),btrim(p_title),btrim(p_body),p_priority,nullif(btrim(coalesce(p_action_url,'')),''),auth.uid()) returning id into v_id;
 else update public.zynth_broadcast_templates set name=btrim(p_name),category=coalesce(nullif(btrim(p_category),''),'custom'),title=btrim(p_title),body=btrim(p_body),priority=p_priority,action_url=nullif(btrim(coalesce(p_action_url,'')),'') ,updated_at=now() where id=p_id returning id into v_id; end if;
 return v_id;
end $$;

create or replace function public.zynth_admin_delete_broadcast_template(p_admin_id uuid,p_id uuid)
returns boolean language plpgsql security definer set search_path to ''
as $$
begin
 if not public.zynth_has_role(auth.uid(),'admin') or not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 delete from public.zynth_broadcast_templates where id=p_id;
 return found;
end $$;

revoke all on public.zynth_broadcast_templates from anon,authenticated;
revoke all on function public.zynth_admin_broadcast_user_directory(uuid,text),public.zynth_admin_save_broadcast_draft(uuid,uuid,text,text,jsonb,boolean,boolean,text,text),public.zynth_admin_broadcast_drafts(uuid),public.zynth_admin_delete_broadcast_draft(uuid,uuid),public.zynth_admin_broadcast_templates(uuid),public.zynth_admin_save_broadcast_template(uuid,uuid,text,text,text,text,text,text),public.zynth_admin_delete_broadcast_template(uuid,uuid) from public,anon,authenticated;
grant execute on function public.zynth_admin_broadcast_user_directory(uuid,text),public.zynth_admin_save_broadcast_draft(uuid,uuid,text,text,jsonb,boolean,boolean,text,text),public.zynth_admin_broadcast_drafts(uuid),public.zynth_admin_delete_broadcast_draft(uuid,uuid),public.zynth_admin_broadcast_templates(uuid),public.zynth_admin_save_broadcast_template(uuid,uuid,text,text,text,text,text,text),public.zynth_admin_delete_broadcast_template(uuid,uuid) to authenticated;
