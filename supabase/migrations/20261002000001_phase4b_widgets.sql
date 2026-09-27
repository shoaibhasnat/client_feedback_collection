-- Phase 4b — Embeddable widget (brief §5.3, §10.6: snippets carry the workspace public key).
--
-- The embed page calls this with the anon key. It returns the widget's config plus, for a
-- collection source, the published testimonial ids in order — never anything private.
-- Suspended workspaces return only their status so the widget can show a neutral message.

create or replace function public.public_widget(p_key text, p_widget uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'workspace', jsonb_build_object('id', w.id, 'name', w.name, 'slug', w.slug, 'status', w.status),
    'config', case when w.status = 'active' then wd.config end,
    'collection_ids', case
      when w.status = 'active' and wd.config -> 'source' ->> 'type' = 'collection' then coalesce(
        (select jsonb_agg(ci.testimonial_id order by ci.sort_order, ci.created_at)
           from public.collection_items ci
           join public.collections c on c.id = ci.collection_id and c.workspace_id = w.id
           join public.testimonials t on t.id = ci.testimonial_id and t.visibility = 'published'
          where c.id::text = wd.config -> 'source' ->> 'id'),
        '[]'::jsonb)
    end
  )
  from public.workspaces w
  join public.widgets wd on wd.workspace_id = w.id and wd.id = p_widget
  where w.public_key = p_key and w.status in ('active', 'suspended')
$$;

revoke all on function public.public_widget(text, uuid) from public;
grant execute on function public.public_widget(text, uuid) to anon, authenticated, service_role;
