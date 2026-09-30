-- Google登録時に、Googleの名前を表示名として使うための更新（既存のテーブルはそのまま）
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
    left(coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
      'user_' || substr(new.id::text, 1, 8)
    ), 30)
  );
  return new;
end;
$$;
