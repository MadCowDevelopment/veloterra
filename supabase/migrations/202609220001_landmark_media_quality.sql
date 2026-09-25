-- Classification v3 requires Wikimedia evidence for categories that commonly
-- contain minor local features. Existing discovery coverage remains valid
-- because the policy only removes candidates from the stored OSM result.
delete from public.landmarks as landmark
where landmark.category in ('bridge', 'tower', 'natural', 'garden', 'landmark')
  and nullif(btrim(landmark.wikidata), '') is null
  and nullif(btrim(landmark.wikipedia), '') is null
  and nullif(btrim(landmark.osm_tags ->> 'wikimedia_commons'), '') is null
  and landmark.total_contributed = 0
  and not exists (
    select 1
    from public.landmark_contributions as contribution
    where contribution.landmark_id = landmark.id
  );

update public.landmarks
set classification_version = 3,
    updated_at = now()
where classification_version < 3;

update public.landmark_discovery_areas
set classification_version = 3
where classification_version < 3;