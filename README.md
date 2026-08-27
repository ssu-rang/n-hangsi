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

모든 환경에서 최소 32자이며 서로 다른 문자를 충분히 포함한 임의 값으로 `SESSION_SECRET`을 반드시 지정하세요. 프록시 뒤에서 실행할 때는 신뢰할 프록시 IP 또는 CIDR만 `TRUSTED_PROXIES`에 쉼표로 구분해 지정합니다. 지원하는 환경 변수는 [.env.example](.env.example)을 참고하되, 앱이 `.env` 파일을 자동으로 읽지는 않으므로 실행 환경에서 주입해야 합니다.

로컬 회원가입의 이메일 인증을 사용하려면 `APP_BASE_URL`과 `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`을 설정하세요. 인증 링크는 30분 동안 유효하며 링크 확인 후 계정이 생성됩니다.

신고 관리자는 기존 계정의 이메일을 `ADMIN_EMAIL`에 지정합니다. 해당 계정으로 로그인한 뒤 `/admin/reports`에서 신고 유지, 처리 완료, 작품 삭제를 수행할 수 있습니다.

## Google 로그인 (선택)

`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`를 함께 설정하면 로그인 화면에 Google 버튼이 나타납니다. 앱은 요청의 Host/Protocol 헤더 대신 이 고정 URI를 사용합니다. Google Cloud Console에도 동일한 URI를 승인된 리디렉션 URI로 등록합니다.

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

- `src/app.ts`: Fastify 앱 조립, 공통 플러그인 및 보안 훅
- `src/db.ts`: SQLite 스키마
- `src/repository.ts`: 데이터 조회/저장 계층과 도메인 타입
- `src/server.ts`: 서버 실행 진입점
- `src/routes`: 작품, 사용자, 인증 라우트
- `src/request.ts`: 요청 데이터 변환 도우미
- `src/validation.ts`: 작품과 회원가입 입력 검증
- `src/types.ts`: 앱 공통 타입과 Fastify 타입 확장
- `src/views`: Nunjucks 서버 템플릿
- `src/main/resources/static`: 기존 CSS, JavaScript, 이미지
- `test`: TypeScript Fastify 통합 테스트
