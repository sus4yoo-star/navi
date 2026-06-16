# 나비 (Navi)

매일 아침, 내 채널을 읽고 **오늘 만들 영상**을 정해주는 AI 성장 PD.
"가입할 때 채널 URL 한 번 → 그다음은 나비가 알아서."

---

## 이게 뭐로 돌아가나요
- **앱**: Next.js (Netlify에 배포)
- **로그인·데이터**: Supabase
- **매일 브리핑**: GitHub Actions (자동 실행)
- **발송**: 인앱 + 이메일(전원) + 웹푸시(설치한 사람)

---

## 시작하는 법 (Claude Code 사용)

1. 이 폴더 전체를 GitHub 레포에 올린다.
2. Claude Code를 열고 아래 문장을 그대로 붙여넣는다:

> CLAUDE.md를 읽고, 거기 "작업 체크리스트" 순서대로 Next.js(App Router·TS) + Supabase 프로젝트를 만들어줘. 이 레포의 파일들을 지정된 경로에 배치하고, ui-prototypes/ 안의 navi-analyze.jsx는 app/page.tsx로, navi-today.jsx는 app/today/page.tsx로 이식해. 비어 있는 곳(app/layout.tsx, app/onboarding/page.tsx, app/api/push/subscribe/route.ts)을 CLAUDE.md 원칙대로 채워. 절대 원칙(쉬움·자동·가짜수치 금지·디자인 토큰)을 지켜.

3. Claude Code가 나머지를 채워준다.

---

## 내가 직접 한 번 해야 하는 것 (Claude Code가 못 하는 것)

1. **VAPID 키 생성**: 터미널에 `npx web-push generate-vapid-keys` → 나온 public/private 키 보관
2. **Supabase**: 프로젝트 생성 → SQL 에디터에 `supabase/schema.sql` 붙여넣고 실행 → Authentication에서 Google·Kakao 로그인 켜기
3. **GitHub**: 레포 Settings → Secrets and variables → Actions 에 아래 "크론용" 환경변수 등록
4. **Netlify**: 이 레포 연결(연결만 하면 푸시할 때마다 자동 배포) + 아래 "앱용" 환경변수 등록
5. **아이콘**: `public/icon-192.png`, `public/icon-512.png` 넣기 (나비 날개 마크로)

---

## 환경변수

**앱용 (Netlify에 등록)**
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- NEXT_PUBLIC_VAPID_PUBLIC
- ANTHROPIC_API_KEY
- YOUTUBE_API_KEY

**크론용 (GitHub Secrets에 등록)**
- SUPABASE_URL
- SUPABASE_SERVICE_ROLE_KEY
- ANTHROPIC_API_KEY
- YOUTUBE_API_KEY
- RESEND_API_KEY
- VAPID_PUBLIC
- VAPID_PRIVATE
- SITE_URL   (예: https://navi.theamov.com)

---

## 폴더 구조
```
navi/
├─ README.md                          ← 지금 이 파일
├─ CLAUDE.md                          ← Claude Code가 읽는 빌드 명세
├─ .github/workflows/daily-briefing.yml   매일 아침 브리핑 자동 실행
├─ scripts/briefing.mjs               브리핑 엔진 (채널 새로읽기 + 생성 + 발송)
├─ supabase/schema.sql                테이블 + 보안규칙 (Supabase에 실행)
├─ lib/navi.ts                        로그인 + 프로필저장 + 푸시 + iOS감지
├─ public/manifest.json               PWA 설치 설정
├─ public/sw.js                       웹푸시 서비스워커
├─ app/api/analyze/route.ts           영상 URL → 분석 API
└─ ui-prototypes/                     화면 시안 (Claude Code가 app/으로 이식)
   ├─ navi-analyze.jsx                → app/page.tsx
   └─ navi-today.jsx                  → app/today/page.tsx
```

---
Love Creates Value · Inspired by Prayer, Powered by Love
