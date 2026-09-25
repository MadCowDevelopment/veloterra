grant select, insert, update, delete on public.landmarks to service_role;
grant select, insert, update, delete on public.landmark_discovery_requests to service_role;

delete from public.landmark_discovery_requests
where request_day = current_date;