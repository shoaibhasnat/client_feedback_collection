-- =====================================================================
-- Security fix — storage path traversal across workspaces
--
-- Stored media paths were checked with "starts with {workspace_id}/". Storage clients resolve
-- "." / ".." segments (including %2e%2e) before the request is sent, so a path such as
--   {my_ws}/../{other_ws}/clients/…/photo.webp
-- passed the check but addressed ANOTHER workspace's file. Owners can write these columns
-- through the API, and the public media routes / form image signing use the service role,
-- so this was a cross-tenant read primitive.
--
-- Every path the app generates has the shape
--   {workspace uuid}/{folder}/…/{name}[.ext]    (folders/names: letters, digits, "-" and "_")
-- so paths are now validated against that exact shape. No "." inside folders, no "..",
-- no "%", no backslashes, no empty segments.
-- =====================================================================

create or replace function public.is_workspace_path(p text, ws uuid)
returns boolean
language sql immutable set search_path = '' as $$
  select p is not null
     and ws is not null
     and left(p, 37) = ws::text || '/'
     and p ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(/[A-Za-z0-9_-]+)*/[A-Za-z0-9_-]+(\.[A-Za-z0-9]{1,10})?$'
$$;

grant execute on function public.is_workspace_path(text, uuid) to anon, authenticated, service_role;

-- ---------- Testimonials: strict paths + a form testimonial stays linked to its submission ----------
create or replace function public.enforce_testimonial_rules()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  reason text;
begin
  -- Unlinking would turn a client's testimonial into a "manual" one whose consent the owner sets.
  if tg_op = 'UPDATE' and old.submission_id is not null and new.submission_id is distinct from old.submission_id then
    raise exception 'A testimonial from a client form stays linked to its submission.' using errcode = 'P0001';
  end if;

  if new.submission_id is not null then
    select s.consent_level into new.consent_level
      from public.submissions s
     where s.id = new.submission_id and s.workspace_id = new.workspace_id;
  end if;

  if new.photo_url is not null and not public.is_workspace_path(new.photo_url, new.workspace_id) then
    raise exception 'photo_url must be a file in this workspace' using errcode = 'P0001';
  end if;
  if new.logo_url is not null and not public.is_workspace_path(new.logo_url, new.workspace_id) then
    raise exception 'logo_url must be a file in this workspace' using errcode = 'P0001';
  end if;
  if new.video_url is not null and not public.is_workspace_path(new.video_url, new.workspace_id) then
    raise exception 'video_url must be a file in this workspace' using errcode = 'P0001';
  end if;
  if new.video_thumbnail_url is not null and not public.is_workspace_path(new.video_thumbnail_url, new.workspace_id) then
    raise exception 'video_thumbnail_url must be a file in this workspace' using errcode = 'P0001';
  end if;
  if new.proof_url is not null and not public.is_workspace_path(new.proof_url, new.workspace_id)
     and new.proof_url !~ '^https?://[^\s]+$' then
    raise exception 'proof_url must be a file in this workspace or an http(s) link' using errcode = 'P0001';
  end if;

  if new.visibility = 'published' then
    reason := public.consent_violation(new.consent_level, new.display_name, new.display_role,
                                       new.display_company, new.photo_url, new.logo_url);
    if reason is null and new.video_url is not null and new.consent_level in ('partial', 'anonymous', 'private') then
      reason := 'Video shows the client, so it can only be published with Full consent.';
    end if;
    if reason is not null then
      raise exception 'consent_violation: %', reason using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

-- ---------- Public media: only strictly valid paths are ever released ----------
create or replace function public.public_media_path(p_testimonial uuid, p_kind text)
returns text
language sql stable security definer set search_path = '' as $$
  select x.path from (
    select case p_kind
             when 'photo' then t.photo_url
             when 'logo' then t.logo_url
             when 'video' then t.video_url
             when 'video_thumb' then t.video_thumbnail_url
           end as path,
           t.workspace_id
      from public.testimonials t
      join public.workspaces w on w.id = t.workspace_id and w.status = 'active'
     where t.id = p_testimonial and t.visibility = 'published'
  ) x
  where public.is_workspace_path(x.path, x.workspace_id)
$$;

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
  where public.is_workspace_path(x.path, x.workspace_id)
$$;
