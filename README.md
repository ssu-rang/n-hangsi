# N행시

Fastify, TypeScript와 Node.js 내장 SQLite를 사용하는 서버 렌더링 N행시 커뮤니티입니다. 기존 화면의 CSS, 이미지와 URL 계약은 그대로 유지합니다.

## 요구 사항

- Node.js 22.5 이상 (권장: Node.js 24 LTS)

## 실행

```powershell
npm install
npm start
```

기본 주소는 `http://localhost:8080`이며, 개발 중 자동 재시작은 `npm run dev`를 사용합니다. 데이터베이스는 최초 실행 시 `data/nhangsi.sqlite`에 자동 생성됩니다.

개발 환경에서는 `SESSION_SECRET`이 없으면 서버가 재시작할 때마다 임시 무작위 값을 생성하므로 `npm run dev`만으로 실행할 수 있습니다. 이 경우 재시작 시 기존 세션이 사라집니다. Railway 또는 `NODE_ENV=production` 환경에서는 최소 32자이며 서로 다른 문자를 충분히 포함한 `SESSION_SECRET`을 반드시 지정해야 합니다. 프록시 뒤에서 실행할 때는 신뢰할 프록시 IP 또는 CIDR만 `TRUSTED_PROXIES`에 쉼표로 구분해 지정합니다. 지원하는 환경 변수는 [.env.example](.env.example)을 참고하되, 앱이 `.env` 파일을 자동으로 읽지는 않으므로 실행 환경에서 주입해야 합니다.

신고 관리자는 기존 계정의 이메일을 `ADMIN_EMAIL`에 지정합니다. 해당 계정으로 로그인한 뒤 `/admin/reports`에서 신고 유지, 처리 완료, 작품 삭제를 수행할 수 있습니다.

## Google 로그인

로그인은 Google OAuth만 지원합니다. `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`를 설정하세요. 처음 로그인하는 사용자는 Google 인증 후 사이트에서 사용할 닉네임을 설정합니다. 앱은 요청의 Host/Protocol 헤더 대신 이 고정 URI를 사용합니다. Google Cloud Console에도 동일한 URI를 승인된 리디렉션 URI로 등록합니다.

```text
http://localhost:8080/login/oauth2/code/google
```

운영 환경에서는 실제 HTTPS 공개 주소를 사용하세요.

## 검증

```powershell
npm test
npm run check
```

## 구조

- `src/app`: Fastify 앱 조립, 실행 진입점과 Fastify 타입 확장
- `src/db`: SQLite 연결, 스키마와 데이터 접근
- `src/auth`, `src/poems`, `src/reports`, `src/users`: 기능별 라우트와 관련 DB 코드
- `src/shared`: 여러 기능에서 공유하는 요청 변환 코드
- `src/views`: Nunjucks 서버 템플릿
- `src/main/resources/static`: 기존 CSS, JavaScript, 이미지
- `test`: TypeScript Fastify 통합 테스트
