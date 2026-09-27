-- =====================================================================
-- Phase 4a — Video testimonials, client approval of edited quotes
-- =====================================================================

-- ---------- Storage: accept video (brief §3.4: default max 100 MB) --------
update storage.buckets
   set file_size_limit = 104857600,
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
         'video/webm', 'video/mp4', 'video/quicktime'
       ]
 where id = 'uploads';

-- ---------- Testimonials: video thumbnail + approval flow -----------------
alter table public.testimonials
  add column video_thumbnail_url text,
  add column approval_token_hash text unique,
  add column approval_requested_at timestamptz,
  add column approval_responded_at timestamptz,
  add column approval_quote text,
  add column approval_comment text;

-- ---------- Consent now also covers video --------------------------------
-- A video shows the client's face and voice, so it is only publishable with Full consent.
create or replace function public.enforce_testimonial_rules()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  reason text;
  prefix text := new.workspace_id::text || '/';
begin
  if new.submission_id is not null then
    select s.consent_level into new.consent_level
      from public.submissions s
     where s.id = new.submission_id and s.workspace_id = new.workspace_id;
  end if;

  if new.photo_url is not null and left(new.photo_url, length(prefix)) <> prefix then
    raise exception 'photo_url must be a file in this workspace' using errcode = 'P0001';
  end if;
  if new.logo_url is not null and left(new.logo_url, length(prefix)) <> prefix then
    raise exception 'logo_url must be a file in this workspace' using errcode = 'P0001';
  end if;
  if new.video_url is not null and left(new.video_url, length(prefix)) <> prefix then
    raise exception 'video_url must be a file in this workspace' using errcode = 'P0001';
  end if;
  if new.video_thumbnail_url is not null and left(new.video_thumbnail_url, length(prefix)) <> prefix then
    raise exception 'video_thumbnail_url must be a file in this workspace' using errcode = 'P0001';
  end if;
  if new.proof_url is not null and left(new.proof_url, length(prefix)) <> prefix
     and new.proof_url !~ '^https?://' then
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

create or replace function public.sync_testimonial_consent()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.consent_level is distinct from old.consent_level then
    update public.testimonials t
       set visibility = case
             when t.visibility = 'published'
              and (public.consent_violation(new.consent_level, t.display_name, t.display_role,
                                            t.display_company, t.photo_url, t.logo_url) is not null
                   or (t.video_url is not null and new.consent_level in ('partial', 'anonymous', 'private')))
             then 'hidden'::public.testimonial_visibility
             else t.visibility
           end
     where t.submission_id = new.id;
  end if;
  return new;
end $$;

-- ---------- Public API: expose video presence ----------------------------
drop function public.public_testimonials(uuid);
create function public.public_testimonials(p_workspace uuid)
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
  has_video boolean,
  has_video_thumb boolean,
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
         t.video_url is not null,
         t.video_thumbnail_url is not null,
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
   order by t.featured desc, (t.video_url is not null) desc, t.sort_order asc,
            coalesce(t.date, t.published_at::date) desc nulls last, t.created_at desc
$$;
revoke all on function public.public_testimonials(uuid) from public;
grant execute on function public.public_testimonials(uuid) to anon, authenticated, service_role;

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
  where left(x.path, 37) = x.workspace_id::text || '/'
$$;
