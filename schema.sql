-- Conatus v3: 認証 + ユーザーごとのデータ + 公開/非公開 (RLS)
-- Supabase の SQL Editor に丸ごと貼って Run する。
-- 注意: 既存のテーブル(テストデータ)は削除されて作り直される。

drop table if exists public.goals cascade;
drop table if exists public.logs cascade;
drop table if exists public.categories cascade;
drop table if exists public.profiles cascade;

-- ---------- テーブル ----------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 30),
  created_at timestamptz not null default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30),
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table public.logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  logged_at date not null default current_date,
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  title text not null check (char_length(title) between 1 and 200),
  target_date date,
  status text not null default 'not_started' check (status in ('not_started','in_progress','done')),
  created_at timestamptz not null default now()
);

create index on public.categories (user_id);
create index on public.logs (user_id, logged_at desc);
create index on public.logs (category_id);
create index on public.goals (user_id, target_date);

-- ---------- サインアップ時にプロフィールを自動作成 ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'user_' || substr(new.id::text, 1, 8)), 30)
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- 権限: 未ログイン(anon)には何も渡さない ----------

alter table public.profiles   enable row level security;
alter table public.categories enable row level security;
alter table public.logs       enable row level security;
alter table public.goals      enable row level security;

revoke all on public.profiles, public.categories, public.logs, public.goals from anon;
grant select, insert, update, delete on public.profiles, public.categories, public.logs, public.goals to authenticated;

-- ---------- RLS ポリシー ----------

-- profiles: 表示名は全ログインユーザーが見られる / 更新は自分のみ
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- categories: 自分のもの + 公開カテゴリは閲覧可 / 変更は自分のみ
create policy "categories_select" on public.categories
  for select to authenticated using (user_id = auth.uid() or is_public);
create policy "categories_insert_own" on public.categories
  for insert to authenticated with check (user_id = auth.uid());
create policy "categories_update_own" on public.categories
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "categories_delete_own" on public.categories
  for delete to authenticated using (user_id = auth.uid());

-- logs: 自分のもの + 公開カテゴリのログは閲覧可 / 書き込みは自分のカテゴリにのみ
create policy "logs_select" on public.logs
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.categories c where c.id = logs.category_id and c.is_public)
  );
create policy "logs_insert_own" on public.logs
  for insert to authenticated with check (
    user_id = auth.uid()
    and exists (select 1 from public.categories c where c.id = category_id and c.user_id = auth.uid())
  );
create policy "logs_update_own" on public.logs
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.categories c where c.id = category_id and c.user_id = auth.uid())
  );
create policy "logs_delete_own" on public.logs
  for delete to authenticated using (user_id = auth.uid());

-- goals: 自分のもの + 公開カテゴリに紐づく目標は閲覧可
create policy "goals_select" on public.goals
  for select to authenticated using (
    user_id = auth.uid()
    or exists (select 1 from public.categories c where c.id = goals.category_id and c.is_public)
  );
create policy "goals_insert_own" on public.goals
  for insert to authenticated with check (
    user_id = auth.uid()
    and (category_id is null or exists (select 1 from public.categories c where c.id = category_id and c.user_id = auth.uid()))
  );
create policy "goals_update_own" on public.goals
  for update to authenticated
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and (category_id is null or exists (select 1 from public.categories c where c.id = category_id and c.user_id = auth.uid()))
  );
create policy "goals_delete_own" on public.goals
  for delete to authenticated using (user_id = auth.uid());
