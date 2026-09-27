-- =====================================================================
-- Phase 3 — Showcase: public read API
--
-- The anonymous role has no table access. Public pages read ONLY through these
-- SECURITY DEFINER functions, which return an explicit list of public columns for
-- published testimonials in active workspaces (brief §8: "Public pages read only
-- through views or API routes that return published, consent-limited fields").
-- Consent itself is already enforced on write (Phase 2 trigger), so anything
-- published is within the client's consent.
--
-- Storage paths are never returned; the functions return booleans, and the media
-- route asks public_media_path / public_brand_path for a path it may stream.
-- =====================================================================

create or replace function public.public_workspace(p_slug text)
returns table (id uuid, name text, slug text, status public.workspace_status)
language sql stable security definer set search_path = '' as $$
  select w.id, w.name, w.slug, w.status
    from public.workspaces w
   where w.slug = lower(p_slug) and w.status <> 'deleted'
$$;

create or replace function public.public_site(p_workspace uuid)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'profile', jsonb_build_object(
      'name', coalesce(s.profile ->> 'name', ''),
      'tagline', coalesce(s.profile ->> 'tagline', ''),
      'bio', coalesce(s.profile ->> 'bio', ''),
      'services', coalesce(s.profile -> 'services', '[]'::jsonb),
      'contact_links', coalesce(s.profile -> 'contact_links', '[]'::jsonb),
      'has_photo', (s.profile ->> 'photo_url') is not null
    ),
    -- Branding and form overrides hold storage paths: expose presence only.
    'theme', (coalesce(s.theme, '{}'::jsonb) - 'branding' - 'form') || jsonb_build_object(
      'branding', jsonb_build_object(
        'site_name', coalesce(s.theme #>> '{branding,site_name}', ''),
        'has_logo_light', (s.theme #>> '{branding,logo_light}') is not null,
        'has_logo_dark', (s.theme #>> '{branding,logo_dark}') is not null,
        'has_favicon', (s.theme #>> '{branding,favicon}') is not null
      )
    ),
    'layout', coalesce(s.layout, '{}'::jsonb),
    'seo', (coalesce(s.seo, '{}'::jsonb) - 'og_image') || jsonb_build_object('has_og_image', (s.seo ->> 'og_image') is not null),
    'updated_at', s.updated_at
  )
  from public.site_settings s
  join public.workspaces w on w.id = s.workspace_id
  where s.workspace_id = p_workspace and w.status = 'active'
$$;

create or replace function public.public_testimonials(p_workspace uuid)
returns table (
  id uuid,
  quote text,
  headline text,
  name text,
  role text,
  company text,
  rating int,
  date date,
  platform text,
  has_photo boolean,
  has_logo boolean,
  featured boolean,
  sort_order int,
  tag_ids uuid[],
  version bigint
)
language sql stable security definer set search_path = '' as $$
  select t.id,
         t.display_quote,
         t.headline,
         t.display_name,
         t.display_role,
         t.display_company,
         t.rating,
         coalesce(t.date, t.published_at::date),
         case
           when t.source = 'upwork_review' then 'upwork'
           when t.source = 'form' then (select p.platform::text from public.projects p where p.id = t.project_id)
           else null
         end,
         t.photo_url is not null,
         t.logo_url is not null,
         t.featured,
         t.sort_order,
         coalesce(array(select tt.tag_id from public.testimonial_tags tt where tt.testimonial_id = t.id), '{}'),
         floor(extract(epoch from t.updated_at))::bigint
    from public.testimonials t
    join public.workspaces w on w.id = t.workspace_id
   where t.workspace_id = p_workspace
     and w.status = 'active'
     and t.visibility = 'published'
     and coalesce(btrim(t.display_quote), '') <> ''
   order by t.featured desc, t.sort_order asc, coalesce(t.date, t.published_at::date) desc nulls last, t.created_at desc
$$;

create or replace function public.public_tags(p_workspace uuid)
returns table (id uuid, name text, type text, color text)
language sql stable security definer set search_path = '' as $$
  select distinct g.id, g.name, g.type, g.color
    from public.tags g
    join public.testimonial_tags tt on tt.tag_id = g.id
    join public.testimonials t on t.id = tt.testimonial_id and t.visibility = 'published'
    join public.workspaces w on w.id = g.workspace_id and w.status = 'active'
   where g.workspace_id = p_workspace
   order by g.name
$$;

create or replace function public.public_collection(p_workspace uuid, p_slug text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'slug', c.slug,
    'intro_text', c.intro_text,
    'testimonial_ids', coalesce(
      (select jsonb_agg(ci.testimonial_id order by ci.sort_order, ci.created_at)
         from public.collection_items ci
         join public.testimonials t on t.id = ci.testimonial_id and t.visibility = 'published'
        where ci.collection_id = c.id),
      '[]'::jsonb)
  )
  from public.collections c
  join public.workspaces w on w.id = c.workspace_id and w.status = 'active'
  where c.workspace_id = p_workspace and c.slug = lower(p_slug)
$$;

-- Storage path for a published testimonial's photo/logo, or null. Used only by the media route.
create or replace function public.public_media_path(p_testimonial uuid, p_kind text)
returns text
language sql stable security definer set search_path = '' as $$
  select case p_kind when 'photo' then t.photo_url when 'logo' then t.logo_url end
    from public.testimonials t
    join public.workspaces w on w.id = t.workspace_id and w.status = 'active'
   where t.id = p_testimonial and t.visibility = 'published'
     and left(case p_kind when 'photo' then t.photo_url when 'logo' then t.logo_url end, 37) = t.workspace_id::text || '/'
$$;

-- Storage path for a workspace branding asset, or null.
create or replace function public.public_brand_path(p_workspace uuid, p_kind text)
returns text
language sql stable security definer set search_path = '' as $$
  select path from (
    select case p_kind
             when 'owner_photo' then s.profile ->> 'photo_url'
             when 'logo_light' then s.theme #>> '{branding,logo_light}'
             when 'logo_dark' then s.theme #>> '{branding,logo_dark}'
             when 'favicon' then s.theme #>> '{branding,favicon}'
             when 'og_image' then s.seo ->> 'og_image'
           end as path,
           s.workspace_id
      from public.site_settings s
      join public.workspaces w on w.id = s.workspace_id and w.status = 'active'
     where s.workspace_id = p_workspace
  ) x
  where left(x.path, 37) = x.workspace_id::text || '/'
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public_workspace(text)', 'public_site(uuid)', 'public_testimonials(uuid)', 'public_tags(uuid)',
    'public_collection(uuid, text)', 'public_media_path(uuid, text)', 'public_brand_path(uuid, text)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated, service_role', f);
  end loop;
end $$;
