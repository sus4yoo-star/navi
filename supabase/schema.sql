-- ============================================================
-- 나비 (Navi) — Supabase schema
-- 로그인 + 오늘의 브리핑 + 발송(웹푸시·이메일) 토대
-- ============================================================

-- 1) 프로필: 온보딩에서 확정한 채널 정보 + 발송 설정
create table public.profiles (
  id               uuid primary key references auth.users on delete cascade,
  email            text,
  channel_url      text,
  niche            text,
  tone             text,            -- 감성·스토리형 / 정보·하우투형 ...
  purpose          text,            -- 신규 유입 확장 / 충성팬 심화
  aspiration       text,            -- "지향" (채널이 말해주지 않는 미래 방향)
  benchmark_url    text,            -- 닮고 싶은 채널('워너비') URL
  briefing_enabled boolean default true,
  push_enabled     boolean default true,
  email_enabled    boolean default true,
  send_hour_kst    int default 7,   -- 아침 발송 시각 (KST)
  created_at       timestamptz default now()
);

-- 2) 브리핑: 매일 크론이 생성해 저장 (인앱 페이지는 여기서 읽음)
create table public.briefings (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users on delete cascade,
  for_date   date not null,
  content    jsonb not null,        -- {trends, today_pick, weekly, inspiration}
  created_at timestamptz default now(),
  unique (user_id, for_date)
);
create index on public.briefings (user_id, for_date desc);

-- 3) 웹푸시 구독 정보 (브라우저/PWA가 등록)
create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users on delete cascade,
  subscription jsonb not null,      -- PushSubscription.toJSON()
  endpoint     text unique,
  created_at   timestamptz default now()
);

-- 4) 비로그인 매거진 구독자 (홈에서 이메일+채널만 입력)
create table public.subscribers (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  channel_url   text not null,
  benchmark_url text,
  niche         text,
  created_at    timestamptz default now()
);

-- 5) 영상 깊은 분석 작업 (긴 영상은 백그라운드로 처리 → 결과를 여기 저장 후 폴링)
create table public.analyses (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'pending',  -- pending | done | error
  video_url   text,
  channel_url text,
  format      text,
  video       jsonb,
  channel     jsonb,
  result      jsonb,
  error       text,
  created_at  timestamptz default now()
);

-- ============================================================
-- Row Level Security — 각자 자기 것만
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.briefings          enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.subscribers         enable row level security;

-- 누구나 구독 신청(insert)만 가능. 읽기/수정은 service role(크론)만.
create policy "anyone can subscribe" on public.subscribers
  for insert with check (true);

alter table public.analyses enable row level security;
-- 분석 작업: 누구나 생성(insert)·결과 조회(select by id). 갱신은 service role(백그라운드)만.
create policy "anyone create analysis" on public.analyses
  for insert with check (true);
create policy "anyone read analysis" on public.analyses
  for select using (true);

create policy "own profile"  on public.profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "read own briefings" on public.briefings
  for select using (auth.uid() = user_id);

create policy "own subs" on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 신규 가입 시 프로필 자동 생성
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  return new;
end; $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 참고: 매일 크론(briefing-cron.ts)은 SERVICE ROLE 키로 접속해
--       RLS를 우회하여 모든 유저의 브리핑을 생성·삽입하고 발송함.
