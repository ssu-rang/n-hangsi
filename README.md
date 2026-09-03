# N행시

Fastify, TypeScript, Nunjucks와 Node.js 내장 SQLite로 만든 서버 렌더링 N행시 커뮤니티입니다.

주요 기능은 다음과 같습니다.

- 익명 또는 Google 로그인 사용자의 2~5행시 작성
- 작품 검색, 인기 작품, 댓글, 별점과 저장
- 작품 신고와 관리자 신고 처리
- 프로필, 저장 목록과 회원탈퇴
- 496개 단어를 중복 없이 순환하는 오늘의 단어
- 개인정보처리방침

## 요구 사항

- Node.js 22.5 이상
- 권장 버전: Node.js 24 LTS

## 로컬 실행

```powershell
npm install
npm run dev
```

기본 주소는 `http://localhost:8080`입니다. 데이터베이스는 처음 실행할 때 `data/nhangsi.sqlite`에 자동으로 생성됩니다.

프로덕션 빌드와 실행은 다음 명령을 사용합니다.

```powershell
npm start
```

이 앱은 `.env` 파일을 자동으로 읽지 않습니다. 환경변수는 셸, Railway 또는 별도의 환경변수 로더를 통해 주입해야 합니다. 개발 환경에서는 `SESSION_SECRET`이 없으면 임시 비밀값을 만들기 때문에 재시작할 때 모든 세션이 사라집니다.

## 환경변수

전체 예시는 [.env.example](.env.example)을 참고하세요.

| 변수 | 설명 |
| --- | --- |
| `PORT` | 서버 포트. 기본값은 `8080` |
| `HOST` | 바인딩 주소. 기본값은 `0.0.0.0` |
| `DATABASE_PATH` | SQLite 파일 경로 |
| `SESSION_SECRET` | 운영 환경 필수. 32자 이상이며 충분히 다양한 문자 필요 |
| `APP_BASE_URL` | 운영 환경의 HTTPS 공개 주소 |
| `ADMIN_EMAIL` | 신고 관리 권한을 부여할 Google 계정 이메일 |
| `TRUSTED_PROXIES` | 신뢰할 프록시 IP 또는 CIDR 목록 |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 클라이언트 보안 비밀 |
| `GOOGLE_REDIRECT_URI` | Google OAuth 콜백 주소 |

## Google 로그인

로그인은 Google OAuth만 지원합니다. 처음 로그인한 사용자는 Google 인증 후 서비스에서 사용할 닉네임을 설정합니다.

로컬 콜백 주소:

```text
http://localhost:8080/login/oauth2/code/google
```

운영 환경에서는 실제 HTTPS 주소를 `GOOGLE_REDIRECT_URI`와 Google Cloud Console의 승인된 리디렉션 URI에 동일하게 등록해야 합니다.

회원탈퇴는 본인 프로필의 계정 관리 영역에서 할 수 있습니다. 탈퇴하면 계정·댓글·평가·저장 기록이 삭제되며 작성한 작품은 작성자 정보가 익명화된 상태로 유지됩니다.

## 관리자

`ADMIN_EMAIL`에 등록된 Google 계정으로 로그인하면 `/admin/reports`에서 신고 목록을 확인하고 다음 작업을 할 수 있습니다.

- 신고 처리 완료 또는 기각
- 신고된 작품 삭제

관리자 권한은 서버에서 이메일과 세션을 기준으로 확인합니다.

## Railway 배포

권장 설정:

```text
Start Command: npm start
DATABASE_PATH=/data/nhangsi.sqlite
APP_BASE_URL=https://실제-공개-도메인
```

SQLite 데이터를 유지하려면 Railway Volume을 `/data`에 연결해야 합니다. SQLite 구성에서는 Replica를 1개로 유지하는 것이 안전합니다. 기본 메모리 세션 저장소를 사용하므로 재배포 또는 서버 재시작 시 사용자가 로그아웃될 수 있습니다.

배포 전에 다음 항목을 확인하세요.

- `SESSION_SECRET` 설정
- Google OAuth 운영 콜백 주소 등록
- `ADMIN_EMAIL` 설정
- Railway Volume과 `DATABASE_PATH` 연결
- HTTPS에서 로그인, 탈퇴, 작품 작성과 신고 처리 확인

## 검증

```powershell
npm test
npm run check
npm audit
```

`npm run check`는 타입 검사, 통합 테스트와 프로덕션 빌드를 차례로 실행합니다.

## 프로젝트 구조

- `src/app`: Fastify 앱 조립, 서버 진입점과 Fastify 타입 확장
- `src/auth`: Google 로그인과 닉네임 설정
- `src/poems`: 작품 라우트, 검증, 화면 변환과 오늘의 단어
- `src/reports`: 신고 및 관리자 처리
- `src/users`: 프로필, 저장 목록과 회원탈퇴
- `src/db`: SQLite 스키마와 기능별 데이터 접근
- `src/shared`: 여러 기능에서 실제로 공유하는 요청·사용자 코드
- `src/views`: Nunjucks 서버 템플릿과 개인정보처리방침
- `src/main/resources/static`: CSS, 브라우저 JavaScript와 이미지
- `test`: Fastify 통합 테스트

프로젝트의 코드 구성 원칙은 [AGENTS.md](AGENTS.md)를 따릅니다.
