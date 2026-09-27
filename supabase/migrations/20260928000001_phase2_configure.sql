-- =====================================================================
-- Phase 2 — Configure
-- * per-item prefill field choice and form presets
-- * submissions become append-only for owners (brief §2 key rule)
-- * consent enforcement and media-path checks in the database (brief §3.5)
-- * request snapshots are immutable once written (brief §3.2)
-- =====================================================================

-- ---------- Form configuration -----------------------------------------
-- Which client/project property a prefill reads from (e.g. 'company', 'custom:team_size').
alter table public.form_items add column default_prefill_field text;

-- Quick presets for the request "Customize form" step (brief §3.7), editable in settings.
alter table public.site_settings add column form_presets jsonb not null default
  '[
     {"id": "full",   "name": "Full form",                      "rating": "shown", "questions_limit": null, "sections_hidden": []},
     {"id": "quick",  "name": "Quick (rating + 2 questions)",   "rating": "shown", "questions_limit": 2,    "sections_hidden": ["about", "contact"]},
     {"id": "known",  "name": "Details already known (hide About You)", "rating": "default", "questions_limit": null, "sections_hidden": ["about"]}
   ]'::jsonb;

-- ---------- Submissions: owners may only do bookkeeping ------------------
-- Client wording, answers and consent are written only by the token form (service role).
-- Owners can mark merge status and reopen (clear submitted_at); nothing else.
revoke insert, update on public.submissions from authenticated;
grant update (merge_status, merge_resolved_at, submitted_at) on public.submissions to authenticated;

-- ---------- Request snapshots are frozen ----------------------------------
create or replace function public.freeze_request_snapshot()
returns trigger language plpgsql as $$
begin
  if new.template_snapshot is distinct from old.template_snapshot then
    raise exception 'template_snapshot is immutable once a request is created'
      using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger t_requests_snapshot_frozen
  before update on public.requests
  for each row execute function public.freeze_request_snapshot();

-- ---------- Consent rules -----------------------------------------------
-- Returns null when the display fields are within the consent level, otherwise a reason.
create or replace function public.consent_violation(
  lvl public.consent_level,
  display_name text,
  display_role text,
  display_company text,
  photo_url text,
  logo_url text
) returns text
language sql immutable as $$
  select case
    when lvl is null then null
    when lvl = 'private' then 'The client chose Private: this testimonial cannot be published.'
    when lvl = 'anonymous' and (
         coalesce(btrim(display_name), '') <> '' or coalesce(btrim(display_company), '') <> ''
         or photo_url is not null or logo_url is not null)
      then 'Anonymous consent: quote only, no name, company, photo or logo.'
    when lvl = 'partial' and (
         position(' ' in btrim(coalesce(display_name, ''))) > 0
         or (coalesce(btrim(display_role), '') <> '' and coalesce(btrim(display_company), '') <> '')
         or photo_url is not null)
      then 'Partial consent: first name plus company or job title only, no photo.'
    else null
  end
$$;

create or replace function public.enforce_testimonial_rules()
returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  reason text;
  prefix text := new.workspace_id::text || '/';
begin
  -- Consent always comes from the client's submission; the owner can't restate it.
  if new.submission_id is not null then
    select s.consent_level into new.consent_level
      from public.submissions s
     where s.id = new.submission_id and s.workspace_id = new.workspace_id;
  end if;

  -- Media must live in this workspace's storage folder (proof may also be an external link).
  if new.photo_url is not null and left(new.photo_url, length(prefix)) <> prefix then
    raise exception 'photo_url must be a file in this workspace' using errcode = 'P0001';
  end if;
  if new.logo_url is not null and left(new.logo_url, length(prefix)) <> prefix then
    raise exception 'logo_url must be a file in this workspace' using errcode = 'P0001';
  end if;
  if new.proof_url is not null and left(new.proof_url, length(prefix)) <> prefix
     and new.proof_url !~ '^https?://' then
    raise exception 'proof_url must be a file in this workspace or an http(s) link' using errcode = 'P0001';
  end if;

  if new.visibility = 'published' then
    reason := public.consent_violation(new.consent_level, new.display_name, new.display_role,
                                       new.display_company, new.photo_url, new.logo_url);
    if reason is not null then
      raise exception 'consent_violation: %', reason using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger t_testimonials_rules
  before insert or update on public.testimonials
  for each row execute function public.enforce_testimonial_rules();

-- If a client changes consent (link reopened and resubmitted), unpublish anything it no longer allows.
create or replace function public.sync_testimonial_consent()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.consent_level is distinct from old.consent_level then
    update public.testimonials t
       set visibility = case
             when t.visibility = 'published'
              and public.consent_violation(new.consent_level, t.display_name, t.display_role,
                                           t.display_company, t.photo_url, t.logo_url) is not null
             then 'hidden'::public.testimonial_visibility
             else t.visibility
           end
     where t.submission_id = new.id;
  end if;
  return new;
end $$;

create trigger t_submissions_consent_sync
  after update of consent_level on public.submissions
  for each row execute function public.sync_testimonial_consent();

-- ---------- Seed: include presets for new workspaces --------------------
-- (site_settings.form_presets has a column default, so seed_workspace needs no change.)
