-- The initial discovery implementation retained quota claims when Overpass or
-- the catalog upsert failed. Reset today's claims once as the corrected Edge
-- Function now removes failed claims itself.
delete from public.landmark_discovery_requests
where request_day = current_date;