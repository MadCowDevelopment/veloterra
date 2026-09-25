with reclassified as (
  select
    id,
    case
      when wikidata = 'Q10285' then 4
      when nullif(osm_tags ->> 'ref:whc', '') is not null or osm_tags ->> 'heritage' = '1' then 4
      when osm_tags ->> 'heritage' in ('2', '3') then 3
      when nullif(osm_tags ->> 'heritage', '') is not null or nullif(wikipedia, '') is not null then 2
      else 1
    end as new_tier
  from public.landmarks
  where classification_version < 2
), repriced as (
  select
    landmarks.id,
    reclassified.new_tier,
    greatest(
      landmarks.total_contributed,
      (array[10000, 100000, 1000000, 5000000])[reclassified.new_tier]
        * landmarks.scope_multiplier
    ) as new_cost
  from public.landmarks
  join reclassified using (id)
)
update public.landmarks
set
  tier = repriced.new_tier,
  cost_copper = repriced.new_cost,
  restored_at = case
    when public.landmarks.total_contributed = repriced.new_cost
      then coalesce(public.landmarks.restored_at, now())
    else null
  end,
  classification_version = 2,
  updated_at = now()
from repriced
where public.landmarks.id = repriced.id;