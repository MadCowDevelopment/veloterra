-- Reset claims once more after correcting failed-claim cleanup in the Edge
-- Function. Successful discoveries remain in the shared landmark catalog.
delete from public.landmark_discovery_requests
where request_day = current_date;