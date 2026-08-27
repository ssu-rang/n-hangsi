# Fastify 백엔드 통합 안내

이 프로젝트는 Fastify가 Nunjucks 화면과 정적 리소스를 함께 제공합니다. 별도 프론트엔드 서버나 CORS 설정은 필요하지 않습니다.

## URL 계약

| 기능 | 메서드 | URL | 인증 |
|---|---|---|---|
| 홈/필터 | GET | `/`, `?lines=all\|2\|3\|4\|5` | 공개 |
| 작품 목록/검색 | GET | `/poems?keyword=` | 공개 |
| 작품 상세/작성 화면 | GET | `/poems/:id`, `/poems/new?word=` | 공개 |
| 작품 등록 | POST | `/poems` | 공개 |
| 댓글/평점/저장 | POST | `/poems/:id/comments`, `/ratings`, `/saves` | 로그인 |
| 저장 취소 | DELETE 또는 `_method=delete` POST | `/poems/:id/saves` | 로그인 |
| 프로필/저장 목록 | GET | `/users/:id`, `/profile`, `/profile/saves` | 공개/로그인 |
| 자체 로그인/가입/로그아웃 | GET/POST | `/login`, `/signup`, `/logout` | 해당 없음 |
| Google 로그인 | GET | `/oauth2/authorization/google` | 선택 설정 |

모든 상태 변경 HTML 폼은 세션에 연결된 `_csrf` 토큰을 전송합니다. 비밀번호는 BCrypt cost 12로 저장되고 세션 쿠키는 `HttpOnly`, `SameSite=Lax`이며 운영 환경에서는 `Secure`가 적용됩니다.

## 데이터

SQLite 테이블은 실행 시 자동 생성됩니다: `users`, `poems`, `comments`, `saved_poems`, `ratings`. 외래 키, 중복 저장/평가 방지 제약과 조회 인덱스가 포함되어 있습니다. 경로는 `DATABASE_PATH`로 변경할 수 있습니다.
