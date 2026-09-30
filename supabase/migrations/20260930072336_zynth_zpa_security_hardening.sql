-- ZPA security hardening follow-up.
-- Keep trigger workers and direct tables inaccessible to client roles; only authenticated RPCs expose the intended surfaces.

revoke execute on function public.zynth_process_zpa() from public, anon, authenticated;
revoke execute on function public.zynth_zpa_on_first_investment() from public, anon, authenticated;

drop policy if exists "zpa settings deny direct" on public.zynth_zpa_settings;
create policy "zpa settings deny direct" on public.zynth_zpa_settings for all to authenticated using (false) with check (false);

drop policy if exists "zpa milestones deny direct" on public.zynth_zpa_milestones;
create policy "zpa milestones deny direct" on public.zynth_zpa_milestones for all to authenticated using (false) with check (false);

do $$
begin
  if exists(select 1 from cron.job where jobname='zynth-zpa-processor') then
    perform cron.unschedule((select jobid from cron.job where jobname='zynth-zpa-processor' limit 1));
  end if;
  perform cron.schedule('zynth-zpa-processor','*/15 * * * *','select public.zynth_process_zpa();');
end $$;
