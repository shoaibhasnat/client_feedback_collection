-- =====================================================================
-- Workspace seeding, storage buckets and super-admin metadata helpers.
-- =====================================================================

-- ---------- Seed a new workspace --------------------------------------
-- Called by the server (service role) right after a workspace is created.
-- Idempotent: running it twice does nothing the second time.
create or replace function public.seed_workspace(ws uuid, owner_name text default null)
returns void
language plpgsql security definer set search_path = '' as $$
declare
  tpl uuid;
begin
  insert into public.site_settings (workspace_id, profile, theme, layout, seo, message_templates)
  values (
    ws,
    jsonb_build_object(
      'name', coalesce(owner_name, ''),
      'photo_url', null,
      'tagline', '',
      'services', '[]'::jsonb,
      'contact_links', '[]'::jsonb
    ),
    jsonb_build_object(
      'preset', 'minimal',
      'mode', 'light',
      'light', jsonb_build_object(
        'primary', '#1f4fd8', 'accent', '#0f9d7a', 'background', '#ffffff', 'surface', '#f6f7f9',
        'text', '#14171f', 'muted', '#5b6272', 'border', '#e3e6eb'),
      'dark', jsonb_build_object(
        'primary', '#7da2ff', 'accent', '#3dd6a8', 'background', '#0f1115', 'surface', '#181b21',
        'text', '#eef0f4', 'muted', '#a1a8b6', 'border', '#2a2f38'),
      'fonts', jsonb_build_object('heading', 'Inter', 'body', 'Inter', 'base_size', 16),
      'radius', 'medium', 'card_style', 'bordered', 'density', 'comfortable'
    ),
    '{}'::jsonb,
    '{}'::jsonb,
    jsonb_build_object(
      'upwork', 'Hi {client_first_name}, thanks again for working with me on {project_name}. If you have 3 minutes, I''d really value your feedback on how it went: {link}',
      'email', E'Hi {client_first_name},\n\nThank you for working with me on {project_name}. Would you share a few words about the experience? It takes about 3 minutes:\n\n{link}\n\nThank you!',
      'whatsapp', 'Hi {client_first_name}! Thanks again for {project_name}. Could you leave me a quick testimonial? {link}',
      'reminder', 'Hi {client_first_name}, just a gentle reminder about the short feedback form for {project_name}: {link} Thank you!',
      'reminder_days', 3
    )
  )
  on conflict (workspace_id) do nothing;

  if exists (select 1 from public.form_templates where workspace_id = ws) then
    return;
  end if;

  insert into public.form_templates (workspace_id, name, is_default, settings, copy)
  values (
    ws, 'Standard', true,
    jsonb_build_object(
      'rating_enabled', true,
      'video_enabled', false,
      'video_max_seconds', 90,
      'consent_options', jsonb_build_array('full', 'partial', 'anonymous', 'private'),
      'cta', jsonb_build_object('type', 'share', 'label', 'Know someone who needs this? Share my link', 'url', '')
    ),
    jsonb_build_object(
      'welcome_title', 'Hi {client_first_name}!',
      'welcome_text', 'Thanks for working with me on {project_name}. A few short questions about how it went would mean a lot.',
      'start_button', 'Let''s start',
      'next_button', 'Next',
      'back_button', 'Back',
      'submit_button', 'Submit',
      'thanks_title', 'Thank you!',
      'thanks_text', 'I really appreciate you taking the time. Your feedback helps me do better work.',
      'consent_title', 'How can I use your feedback?',
      'consent_confirm', 'I confirm my answers can be used as described above.',
      'privacy_note', 'Your contact details are private and never shown publicly. Only what you allow below may appear on my website.',
      'consent_full', 'Show my name, photo, job title, company and quote.',
      'consent_partial', 'Show my first name with my company or job title only. No photo.',
      'consent_anonymous', 'Show the quote only, attributed to a description like "Founder, e-commerce brand".',
      'consent_private', 'Keep it private. This feedback is for you only and is never published.'
    )
  )
  returning id into tpl;

  insert into public.form_items
    (workspace_id, template_id, section, key, label, helper_text, placeholder, type, required,
     visibility, maps_to_client_field, default_prefill, sort_order)
  values
    -- Guided questions
    (ws, tpl, 'question', 'situation_before', 'What was the situation or challenge before we worked together?',
      'For example: what wasn''t working, what you had tried, what it was costing you.', null, 'long_text', true,
      'public-eligible', null, 'none', 10),
    (ws, tpl, 'question', 'almost_stopped', 'What almost stopped you from hiring me, and what made you go ahead?',
      null, null, 'long_text', false, 'public-eligible', null, 'none', 20),
    (ws, tpl, 'question', 'result', 'What result or change did you get from the project?',
      'Numbers help if you have them, e.g. "sales up 30%" or "launched two weeks early".', null, 'long_text', true,
      'public-eligible', null, 'none', 30),
    (ws, tpl, 'question', 'working_with', 'What was it like working with me?',
      null, null, 'long_text', false, 'public-eligible', null, 'none', 40),
    (ws, tpl, 'question', 'recommend_to', 'Who would you recommend me to?',
      null, 'e.g. Shopify store owners who need a faster site', 'short_text', false,
      'public-eligible', null, 'none', 50),
    -- About you
    (ws, tpl, 'about', 'full_name', 'Full name', null, null, 'text', true,
      'public-eligible', 'name', 'client', 10),
    (ws, tpl, 'about', 'job_title', 'Job title', null, 'e.g. Founder', 'text', false,
      'public-eligible', 'job_title', 'client', 20),
    (ws, tpl, 'about', 'company', 'Company', null, null, 'text', false,
      'public-eligible', 'company', 'client', 30),
    (ws, tpl, 'about', 'company_website', 'Company website', null, 'https://', 'url', false,
      'public-eligible', 'website', 'client', 40),
    (ws, tpl, 'about', 'linkedin_url', 'LinkedIn URL', null, 'https://linkedin.com/in/…', 'url', false,
      'public-eligible', 'linkedin_url', 'client', 50),
    (ws, tpl, 'about', 'photo', 'Your photo', 'A square headshot works best.', null, 'image', false,
      'public-eligible', 'photo_url', 'client', 60),
    (ws, tpl, 'about', 'company_logo', 'Company logo', null, null, 'image', false,
      'public-eligible', 'logo_url', 'client', 70),
    -- Contact (always private)
    (ws, tpl, 'contact', 'email', 'Email', null, 'you@company.com', 'email', false,
      'private-only', 'email', 'client', 10),
    (ws, tpl, 'contact', 'whatsapp', 'WhatsApp / phone', null, '+1 555 000 0000', 'phone', false,
      'private-only', 'whatsapp', 'client', 20),
    (ws, tpl, 'contact', 'preferred_contact', 'Preferred contact method', null, null, 'dropdown', false,
      'private-only', 'preferred_contact', 'client', 30),
    (ws, tpl, 'contact', 'country', 'Country / time zone', null, 'e.g. Germany (CET)', 'text', false,
      'private-only', 'country', 'client', 40);

  update public.form_items
     set options = '["Email", "WhatsApp", "Phone", "Upwork", "LinkedIn"]'::jsonb
   where template_id = tpl and key = 'preferred_contact';
end $$;

revoke all on function public.seed_workspace(uuid, text) from public, anon, authenticated;

-- ---------- Super-admin metadata (counts only, never business content) --
create or replace function public.superadmin_workspace_stats()
returns table (
  workspace_id uuid,
  clients bigint,
  testimonials bigint,
  requests bigint,
  videos bigint,
  storage_bytes bigint,
  last_activity_at timestamptz
)
language sql stable security definer set search_path = '' as $$
  select w.id,
    (select count(*) from public.clients c where c.workspace_id = w.id),
    (select count(*) from public.testimonials t where t.workspace_id = w.id),
    (select count(*) from public.requests r where r.workspace_id = w.id),
    (select count(*) from public.submissions s where s.workspace_id = w.id and s.video_url is not null),
    (select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
       from storage.objects o
      where o.bucket_id = 'uploads' and (storage.foldername(o.name))[1] = w.id::text),
    (select max(a.created_at) from public.activity_log a where a.workspace_id = w.id)
  from public.workspaces w
$$;

revoke all on function public.superadmin_workspace_stats() from public, anon, authenticated;

-- ---------- Storage ---------------------------------------------------
-- Private bucket for everything uploaded in Phase 1. Objects live under
-- {workspace_id}/... and are only reachable by that workspace's owner
-- (or via short-lived signed URLs created on the server).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'])
on conflict (id) do nothing;

create policy "workspace read uploads" on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads'
    and exists (select 1 from public.my_workspace_ids() w where w::text = (storage.foldername(name))[1]));

create policy "workspace insert uploads" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads'
    and exists (select 1 from public.my_workspace_ids() w
                where w::text = (storage.foldername(name))[1] and public.can_write(w)));

create policy "workspace update uploads" on storage.objects
  for update to authenticated
  using (bucket_id = 'uploads'
    and exists (select 1 from public.my_workspace_ids() w
                where w::text = (storage.foldername(name))[1] and public.can_write(w)));

create policy "workspace delete uploads" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads'
    and exists (select 1 from public.my_workspace_ids() w
                where w::text = (storage.foldername(name))[1] and public.can_write(w)));
