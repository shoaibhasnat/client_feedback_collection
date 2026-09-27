-- =====================================================================
-- Testimonial Collector — core schema (Phase 1)
-- Multi-tenant: every business table carries a non-null workspace_id and
-- is protected by Row Level Security. See brief sections 7 and 10.
-- =====================================================================

-- ---------- Enums ----------------------------------------------------
create type public.workspace_status as enum ('active', 'suspended', 'deleted');
create type public.user_status as enum ('active', 'disabled');
create type public.invite_status as enum ('pending', 'accepted', 'expired', 'revoked');
create type public.client_source as enum ('upwork', 'referral', 'direct', 'other');
create type public.client_status as enum ('active', 'past', 'prospect', 'do_not_contact');
create type public.project_platform as enum ('upwork', 'direct', 'referral', 'other');
create type public.project_status as enum ('in_progress', 'completed', 'cancelled');
create type public.request_status as enum (
  'draft', 'sent', 'opened', 'in_progress', 'submitted', 'reviewed', 'published', 'private'
);
create type public.consent_level as enum ('full', 'partial', 'anonymous', 'private');
create type public.testimonial_source as enum ('form', 'upwork_review', 'manual');
create type public.approval_status as enum ('not_needed', 'pending', 'approved', 'changes_requested');
create type public.testimonial_visibility as enum ('published', 'hidden', 'private');
create type public.merge_status as enum ('pending', 'merged', 'dismissed');

-- ---------- Shared trigger -------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- =====================================================================
-- Platform tables (workspaces, users, invites, audit)
-- =====================================================================

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$'),
  status public.workspace_status not null default 'active',
  public_key text not null unique default replace(gen_random_uuid()::text, '-', ''),
  last_activity_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  email text not null,
  avatar_url text,
  is_super_admin boolean not null default false,
  status public.user_status not null default 'active',
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'owner' check (role = 'owner'),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
create index on public.workspace_members (user_id);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  status public.invite_status not null default 'pending',
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.invites (workspace_id);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles (id) on delete set null,
  workspace_id uuid references public.workspaces (id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb not null default '{}',
  ip_hash text,
  created_at timestamptz not null default now()
);
create index on public.audit_log (created_at desc);

create table public.global_settings (
  id int primary key default 1 check (id = 1),
  app_name text not null default 'Testimonial Collector',
  invite_expiry_days int not null default 7 check (invite_expiry_days between 1 and 90),
  announcement text,
  updated_at timestamptz not null default now()
);
insert into public.global_settings (id) values (1);

-- ---------- Tenancy helpers ------------------------------------------
-- SECURITY DEFINER so policies can consult membership without recursing
-- through workspace_members' own RLS.

create or replace function public.my_workspace_ids()
returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.workspace_id
  from public.workspace_members m
  join public.profiles p on p.id = m.user_id
  join public.workspaces w on w.id = m.workspace_id
  where m.user_id = auth.uid()
    and p.status = 'active'
    and w.status <> 'deleted'
$$;

create or replace function public.current_workspace_id()
returns uuid
language sql stable security definer set search_path = '' as $$
  select public.my_workspace_ids() limit 1
$$;

create or replace function public.is_member(ws uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.my_workspace_ids() w where w = ws)
$$;

-- Writes additionally require the workspace to be active (suspended = read-only).
create or replace function public.can_write(ws uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_member(ws)
     and exists (select 1 from public.workspaces w where w.id = ws and w.status = 'active')
$$;

create or replace function public.is_super_admin()
returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid() and status = 'active'),
    false)
$$;

-- Create a profile row for every new auth user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, nullif(new.raw_user_meta_data ->> 'name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- Platform RLS ---------------------------------------------
alter table public.workspaces enable row level security;
alter table public.profiles enable row level security;
alter table public.workspace_members enable row level security;
alter table public.invites enable row level security;
alter table public.audit_log enable row level security;
alter table public.global_settings enable row level security;

create policy "members read own workspace" on public.workspaces
  for select to authenticated using (public.is_member(id));

create policy "read own profile" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "update own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
-- Only harmless columns are writable by the user themself.
revoke update on public.profiles from authenticated, anon;
grant update (name, avatar_url) on public.profiles to authenticated;

create policy "read own memberships" on public.workspace_members
  for select to authenticated using (user_id = auth.uid());

create policy "signed-in users read global settings" on public.global_settings
  for select to authenticated using (true);

-- invites and audit_log: no policies => only the service role can touch them.

create trigger t_workspaces_updated before update on public.workspaces
  for each row execute function public.set_updated_at();
create trigger t_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger t_invites_updated before update on public.invites
  for each row execute function public.set_updated_at();

-- =====================================================================
-- Business tables (all workspace-scoped)
-- Parents expose unique (workspace_id, id) so children can use composite
-- foreign keys: a row can never reference a parent in another workspace.
-- =====================================================================

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  name text not null check (length(name) between 1 and 200),
  company text,
  job_title text,
  photo_url text,
  logo_url text,
  emails jsonb not null default '[]',
  phone text,
  whatsapp text,
  linkedin_url text,
  website text,
  socials jsonb not null default '[]',
  country text,
  city text,
  timezone text,
  preferred_contact text,
  source public.client_source not null default 'direct',
  referred_by_client_id uuid,
  upwork_url text,
  status public.client_status not null default 'active',
  first_project_date date,
  last_project_date date,
  follow_up_date date,
  birthday date,
  custom_fields jsonb not null default '{}',
  form_defaults jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, referred_by_client_id)
    references public.clients (workspace_id, id) on delete set null (referred_by_client_id)
);
create index on public.clients (workspace_id);

create table public.client_notes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  client_id uuid not null,
  body text not null check (length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade
);
create index on public.client_notes (workspace_id);
create index on public.client_notes (client_id);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  client_id uuid not null,
  name text not null check (length(name) between 1 and 200),
  description text,
  service_type text,
  platform public.project_platform not null default 'direct',
  start_date date,
  end_date date,
  status public.project_status not null default 'completed',
  budget numeric(12, 2),
  currency text default 'USD',
  links jsonb not null default '[]',
  outcomes text,
  notes text,
  custom_fields jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade
);
create index on public.projects (workspace_id);
create index on public.projects (client_id);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  owner_type text not null check (owner_type in ('client', 'project')),
  owner_id uuid not null,
  file_url text not null,
  file_name text not null,
  mime_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.attachments (workspace_id);

create table public.form_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  settings jsonb not null default '{}',
  copy jsonb not null default '{}',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);
create index on public.form_templates (workspace_id);
create unique index form_templates_one_default
  on public.form_templates (workspace_id) where is_default and archived_at is null;

create table public.form_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  template_id uuid not null,
  section text not null check (section in ('question', 'about', 'contact')),
  key text not null check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  label text not null,
  helper_text text,
  placeholder text,
  type text not null check (type in (
    'short_text', 'long_text', 'rating_5', 'rating_10', 'single_choice', 'multiple_choice', 'yes_no',
    'text', 'email', 'phone', 'url', 'image', 'dropdown')),
  options jsonb not null default '[]',
  required boolean not null default false,
  visibility text not null default 'public-eligible' check (visibility in ('public-eligible', 'private-only')),
  maps_to_client_field text,
  default_shown boolean not null default true,
  default_prefill text not null default 'none' check (default_prefill in ('none', 'client', 'project', 'custom')),
  default_prefill_value text,
  default_prefill_locked boolean not null default false,
  sort_order int not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, key),
  foreign key (workspace_id, template_id) references public.form_templates (workspace_id, id) on delete cascade
);
create index on public.form_items (workspace_id);

create table public.requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  client_id uuid not null,
  project_id uuid,
  template_id uuid,
  template_snapshot jsonb not null,
  item_overrides jsonb not null default '{}',
  token text not null unique check (length(token) >= 22),
  personal_message text,
  status public.request_status not null default 'draft',
  expires_at timestamptz,
  sent_at timestamptz,
  opened_at timestamptz,
  started_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  revoked_at timestamptz,
  last_reminded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade,
  foreign key (workspace_id, project_id)
    references public.projects (workspace_id, id) on delete set null (project_id),
  foreign key (workspace_id, template_id)
    references public.form_templates (workspace_id, id) on delete set null (template_id)
);
create index on public.requests (workspace_id);
create index on public.requests (client_id);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  request_id uuid unique,
  rating int check (rating between 1 and 5),
  answers jsonb not null default '{}',
  about jsonb not null default '{}',
  contact jsonb not null default '{}',
  video_url text,
  video_thumbnail_url text,
  consent_level public.consent_level,
  consent_text text,
  consent_at timestamptz,
  progress_step int not null default 0,
  submitted_at timestamptz,
  merge_status public.merge_status not null default 'pending',
  merge_resolved_at timestamptz,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, request_id) references public.requests (workspace_id, id) on delete cascade
);
create index on public.submissions (workspace_id);

create table public.testimonials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  submission_id uuid unique,
  client_id uuid,
  project_id uuid,
  source public.testimonial_source not null default 'form',
  consent_level public.consent_level,
  display_quote text,
  headline text,
  display_name text,
  display_role text,
  display_company text,
  photo_url text,
  logo_url text,
  rating int check (rating between 1 and 5),
  date date,
  video_url text,
  proof_url text,
  approval_status public.approval_status not null default 'not_needed',
  visibility public.testimonial_visibility not null default 'hidden',
  featured boolean not null default false,
  sort_order int not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, submission_id)
    references public.submissions (workspace_id, id) on delete cascade,
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade,
  foreign key (workspace_id, project_id)
    references public.projects (workspace_id, id) on delete set null (project_id)
);
create index on public.testimonials (workspace_id);
create index on public.testimonials (client_id);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  name text not null,
  color text,
  type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, name)
);

create table public.testimonial_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  testimonial_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (testimonial_id, tag_id),
  foreign key (workspace_id, testimonial_id) references public.testimonials (workspace_id, id) on delete cascade,
  foreign key (workspace_id, tag_id) references public.tags (workspace_id, id) on delete cascade
);
create index on public.testimonial_tags (workspace_id);

create table public.client_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  client_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, tag_id),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade,
  foreign key (workspace_id, tag_id) references public.tags (workspace_id, id) on delete cascade
);
create index on public.client_tags (workspace_id);

create table public.collections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  name text not null,
  slug text not null,
  intro_text text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, slug)
);

create table public.collection_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  collection_id uuid not null,
  testimonial_id uuid not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (collection_id, testimonial_id),
  foreign key (workspace_id, collection_id) references public.collections (workspace_id, id) on delete cascade,
  foreign key (workspace_id, testimonial_id) references public.testimonials (workspace_id, id) on delete cascade
);
create index on public.collection_items (workspace_id);

create table public.widgets (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  name text not null,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.widgets (workspace_id);

create table public.site_settings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  profile jsonb not null default '{}',
  theme jsonb not null default '{}',
  layout jsonb not null default '{}',
  seo jsonb not null default '{}',
  custom_css text,
  message_templates jsonb not null default '{}',
  onboarding jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.theme_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  theme jsonb not null,
  saved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.theme_versions (workspace_id);

create table public.settings_custom_fields (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  entity text not null check (entity in ('client', 'project')),
  key text not null,
  label text not null,
  type text not null check (type in ('text', 'number', 'date', 'dropdown', 'url')),
  options jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, entity, key)
);

create table public.activity_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null default public.current_workspace_id()
    references public.workspaces (id) on delete cascade,
  client_id uuid,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, client_id) references public.clients (workspace_id, id) on delete cascade
);
create index on public.activity_log (workspace_id, created_at desc);
create index on public.activity_log (client_id);

-- ---------- Uniform RLS + updated_at on every business table ---------
do $$
declare
  t text;
  business_tables text[] := array[
    'clients', 'client_notes', 'projects', 'attachments', 'form_templates', 'form_items',
    'requests', 'submissions', 'testimonials', 'tags', 'testimonial_tags', 'client_tags',
    'collections', 'collection_items', 'widgets', 'site_settings', 'theme_versions',
    'settings_custom_fields', 'activity_log'
  ];
begin
  foreach t in array business_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "ws read" on public.%I for select to authenticated using (public.is_member(workspace_id))', t);
    execute format(
      'create policy "ws insert" on public.%I for insert to authenticated with check (public.can_write(workspace_id))', t);
    execute format(
      'create policy "ws update" on public.%I for update to authenticated using (public.can_write(workspace_id)) with check (public.can_write(workspace_id))', t);
    execute format(
      'create policy "ws delete" on public.%I for delete to authenticated using (public.can_write(workspace_id))', t);
    execute format(
      'create trigger t_%s_updated before update on public.%I for each row execute function public.set_updated_at()', t, t);
    -- anon never reads business tables directly; public pages go through server code.
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- A workspace's id must never move once a row exists.
create or replace function public.forbid_workspace_change()
returns trigger language plpgsql as $$
begin
  if new.workspace_id is distinct from old.workspace_id then
    raise exception 'workspace_id is immutable';
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'clients', 'client_notes', 'projects', 'attachments', 'form_templates', 'form_items',
    'requests', 'submissions', 'testimonials', 'tags', 'testimonial_tags', 'client_tags',
    'collections', 'collection_items', 'widgets', 'site_settings', 'theme_versions',
    'settings_custom_fields', 'activity_log'
  ] loop
    execute format(
      'create trigger t_%s_ws_immutable before update on public.%I for each row execute function public.forbid_workspace_change()', t, t);
  end loop;
end $$;
