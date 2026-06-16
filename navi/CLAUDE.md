# 나비 (Navi) — 프로젝트 명세

> 이 파일을 먼저 읽고, 아래 "작업 체크리스트" 순서대로 빌드한다.

## 한 줄
나비 = 한국 크리에이터의 영상 한 편을 **채널 색깔에 맞게 재해석**하고, **플랫폼별로 전략화**해 더 멀리 퍼뜨리는 **AI 성장 PD**. 툴이 아니라 "나 대신 생각해주는 사람".

## 절대 원칙 (어기지 말 것)
1. **쉬워야 한다.** 사용자는 가입할 때 채널 URL만 넣는다. 그 외 매일 아무것도 시키지 않는다.
2. **"알아서 해준다"가 매력.** /today는 열면 브리핑이 그냥 떠 있어야 한다. 입력칸·생성 버튼 금지. (설정은 숨김)
3. **수치·트렌드는 반드시 실제 데이터(YouTube API / 웹검색)에서.** 절대 지어내지 말 것. 가짜 정밀함은 신뢰를 죽인다.
4. **모델은 `claude-sonnet-4-6`.** 분석·브리핑 호출은 서버 측에서.
5. **디자인:** 오프화이트 `#F4F5F7` + 근검정 `#15171C` + 인디고 `#4B43D6` 한 점. 데이터·라벨·타임코드는 모노. 미니멀. 클리셰·이모지 금지. 두 날개 마크.

## 스택
GitHub(소스) → **Netlify**(Next.js 앱, main 푸시 시 자동배포) / **Supabase**(Auth + Postgres + RLS) / **GitHub Actions**(매일 브리핑 크론).

## 아키텍처
- **가입(한 번):** 로그인(Google/Kakao) → 채널 URL + 첫인상 톤 확인 → `profiles` 저장.
- **매일(자동):** GitHub Actions 크론(07:00 KST) → `scripts/briefing.mjs` → 각 유저 채널을 **새로 분석**(최근 업로드·성과) + 니치 트렌드/벤치마크 → 개인화 브리핑 생성 → `briefings` 저장 → **이메일 + 웹푸시** 발송.
- **온디맨드:** 사용자가 특정 영상 URL 제출 → `/api/analyze`가 자막 추출 + 분석(쇼츠·패키징). 무거운 자막 분석은 여기서만.
- **발송:** 인앱 `/today` + 이메일 = 전원 도달. 웹푸시 = 설치한 사람 보너스(특히 iOS는 홈 화면 설치 필요).

## 디렉토리 구조 (목표)
```
navi/
├─ CLAUDE.md
├─ .github/workflows/daily-briefing.yml   # 매일 크론 → scripts/briefing.mjs
├─ scripts/briefing.mjs                    # 브리핑 엔진 (채널 새로읽기 + 생성 + 발송)
├─ supabase/schema.sql                     # 테이블 + RLS  (작성됨)
├─ lib/navi.ts                             # supabase 클라 + signIn + saveProfile + registerPush + iosNeedsInstall  (작성됨)
├─ public/
│  ├─ manifest.json                        # PWA  (작성됨)
│  ├─ sw.js                                # 웹푸시 서비스워커  (작성됨)
│  └─ icon-192.png / icon-512.png          # 아이콘 (제작 필요)
└─ app/
   ├─ layout.tsx                           # manifest 링크 + SW 등록
   ├─ page.tsx                             # 랜딩 + 온디맨드 분석  (navi.jsx 이식)
   ├─ onboarding/page.tsx                  # 로그인 + 채널 URL 한 번 저장
   ├─ today/page.tsx                       # 오늘의 브리핑  (navi-today.jsx 이식, Supabase에서 읽기)
   └─ api/
      ├─ analyze/route.ts                  # URL→분석  (작성됨)
      └─ push/subscribe/route.ts           # 푸시 구독 저장
```

## 환경변수
- 앱(Netlify): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC`, `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY`
- 크론(GitHub Secrets): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`, `YOUTUBE_API_KEY`, `RESEND_API_KEY`, `VAPID_PUBLIC`, `VAPID_PRIVATE`, `SITE_URL`
- VAPID 키: `npx web-push generate-vapid-keys` 한 번.

## 작업 체크리스트 (순서대로)
1. Next.js(App Router, TS) + Supabase 초기화. `supabase/schema.sql`을 Supabase에 적용.
2. **온보딩** `/onboarding`: `lib/navi.ts`의 `signIn`으로 로그인 → 채널 URL 입력 + 첫인상 톤 확인(navi.jsx의 detect 흐름) → `saveProfile()`로 `profiles` 저장 → `/today`로 이동.
3. **/today**: 로그인 유저의 오늘자 `briefings`를 Supabase에서 읽어 표시(navi-today.jsx 디자인). 아직 없으면 "오늘 브리핑이 곧 도착해요" 안내. **입력·생성버튼 없음.**
4. **/(홈)**: navi.jsx 이식, 온디맨드 분석은 `/api/analyze` 연결.
5. **PWA**: `app/layout.tsx`에 `manifest.json` 링크 + `sw.js` 등록. iOS는 `iosNeedsInstall()`로 감지해 "홈 화면에 추가" 안내 배너.
6. **푸시**: `/today`에서 `registerPush(NEXT_PUBLIC_VAPID_PUBLIC)` → `/api/push/subscribe`(또는 lib에서 바로 insert)로 구독 저장.
7. **크론**: `scripts/briefing.mjs` + `.github/workflows/daily-briefing.yml`. GitHub Secrets 등록. `workflow_dispatch`로 수동 1회 테스트.
8. **배포**: GitHub main 푸시 → Netlify 자동배포. (배포용 별도 Action 불필요)

## 톤 & 카피
차분하고 단정하게. 사용자에게 일을 시키지 않는다. 빈/에러 상태도 방향을 준다("곧 도착해요", "다시 받기"). 과장·이모지 금지.
