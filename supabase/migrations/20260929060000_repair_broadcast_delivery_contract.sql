-- Repair broadcast push-state contract and preserve the final send guard.
alter table public.zynth_broadcast_recipients drop constraint if exists zynth_broadcast_recipients_push_state_check;
alter table public.zynth_broadcast_recipients add constraint zynth_broadcast_recipients_push_state_check check (push_state in ('enabled','eligible','disabled','no_device','not_requested'));

create or replace function public.zynth_admin_create_broadcast(p_admin_id uuid,p_title text,p_body text,p_audience jsonb,p_channel_in_app boolean,p_channel_push boolean,p_priority text,p_action_url text)
returns jsonb language plpgsql security definer set search_path to ''
as $$
declare b_id uuid;r record;n_id uuid;eligible boolean;state text;total integer:=0;push_eligible integer:=0;push_skipped integer:=0;
begin
 if not public.zynth_has_role(auth.uid(),'admin') or not exists(select 1 from public.users where id=auth.uid() and account_status='active') then raise exception 'ADMIN_AUTHORIZATION_REQUIRED'; end if;
 if not p_channel_in_app and not p_channel_push then raise exception 'AT_LEAST_ONE_CHANNEL_REQUIRED'; end if;
 if p_channel_push and not p_channel_in_app then raise exception 'PUSH_REQUIRES_IN_APP'; end if;
 if char_length(btrim(coalesce(p_title,'')))=0 or char_length(btrim(coalesce(p_body,'')))=0 then raise exception 'MESSAGE_REQUIRED'; end if;
 if char_length(p_title)>160 or char_length(p_body)>5000 then raise exception 'MESSAGE_TOO_LONG'; end if;
 if p_priority not in ('normal','important','urgent') then raise exception 'INVALID_PRIORITY'; end if;
 if p_action_url is not null and p_action_url<>'' and left(p_action_url,1)<>'/' then raise exception 'ACTION_URL_MUST_BE_INTERNAL'; end if;
 insert into public.zynth_broadcasts(created_by,title,body,audience,channel_in_app,channel_push,priority,action_url,status)
 values(auth.uid(),btrim(p_title),btrim(p_body),coalesce(p_audience,'{}'::jsonb),p_channel_in_app,p_channel_push,p_priority,nullif(btrim(coalesce(p_action_url,'')),''),'sending') returning id into b_id;
 for r in select * from public.zynth_broadcast_candidates(coalesce(p_audience,'{}'::jsonb)) loop
  total:=total+1;state:=r.push_state;eligible:=p_channel_push and state='enabled';
  if eligible then push_eligible:=push_eligible+1;else push_skipped:=push_skipped+1;end if;
  insert into public.notifications(user_id,title,body,type,metadata)
  values(r.user_id,p_title,p_body,'broadcast',jsonb_build_object('source','admin_broadcast','broadcast_id',b_id::text,'priority',p_priority,'action_url',coalesce(p_action_url,'/dashboard/notifications'),'broadcast_push',p_channel_push)) returning id into n_id;
  insert into public.zynth_broadcast_recipients(broadcast_id,user_id,notification_id,push_state,push_status)
  values(b_id,r.user_id,n_id,case when p_channel_push then state else 'not_requested' end,case when p_channel_push and state='enabled' then 'queued' when p_channel_push then 'skipped' else 'not_requested' end);
 end loop;
 update public.zynth_broadcasts set status='sent',recipient_count=total,push_eligible_count=push_eligible,push_skipped_count=push_skipped,sent_at=now() where id=b_id;
 return jsonb_build_object('id',b_id,'recipient_count',total,'push_eligible_count',push_eligible,'push_skipped_count',push_skipped);
exception when others then if b_id is not null then update public.zynth_broadcasts set status='failed' where id=b_id; end if; raise;
end $$;
