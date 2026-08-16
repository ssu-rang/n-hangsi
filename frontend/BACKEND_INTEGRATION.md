# 프론트엔드–백엔드 연동 계약

현재 프론트엔드는 localStorage를 데이터 저장소로 사용합니다. 백엔드 구현 후 app.js의 저장/조회 부분을 아래 JSON API 호출로 교체하면 됩니다.

## 공통 규칙

- 기본 경로: `/api/v1`
- 요청/응답: `application/json; charset=utf-8`
- 날짜: ISO 8601
- 인증: HttpOnly, Secure, SameSite=Lax 세션 쿠키 권장. 인증 토큰을 localStorage에 저장하지 않습니다.
- 쿠키 인증이면 CSRF 보호를 적용합니다.
- 목록은 빈 배열을 반환하고 null을 반환하지 않습니다.
- 오류 응답: `{"code":"VALIDATION_ERROR","message":"입력값을 확인해 주세요.","fieldErrors":{"word":"2~6글자로 입력해 주세요."},"traceId":"..."}`

## 엔드포인트

| Method | URL | 설명 |
|---|---|---|
| POST | `/api/v1/auth/signup` | 회원가입 후 세션 생성 |
| POST | `/api/v1/auth/login` | 로그인 |
| POST | `/api/v1/auth/logout` | 로그아웃 |
| GET | `/api/v1/auth/me` | 현재 사용자, 비로그인은 401 |
| GET | `/api/v1/poems?q=&page=0&size=20&sort=latest` | 검색/목록 |
| GET | `/api/v1/poems/{id}` | 상세 |
| POST | `/api/v1/poems` | 작품 생성 |
| DELETE | `/api/v1/poems/{id}` | 본인 작품 삭제 |
| POST | `/api/v1/poems/{id}/comments` | 댓글 생성 |
| GET | `/api/v1/users/{id}` | 공개 프로필 |
| GET | `/api/v1/users/{id}/poems?page=0&size=20` | 사용자 작품 |
| PATCH | `/api/v1/users/me` | 내 프로필 수정 |

로그인 요청은 `{"email":"a@b.com","password":"..."}`, 회원가입은 nickname을 추가합니다. 비밀번호는 응답에 절대 포함하지 않습니다.

작품 생성 요청:

```json
{"word":"여름","lines":["여전히 ...","름름한 ..."]}
```

서버도 word가 공백 없는 Unicode 2~6자인지, lines 수가 글자 수와 같은지, 각 문장이 해당 글자로 시작하는지 검증해야 합니다.

목록 응답은 `{"items":[Poem],"page":0,"size":20,"totalElements":1,"hasNext":false}` 형태로 통일합니다. Poem 필드는 id, word, lines, author{id,nickname}, rating(null 가능), ratingCount, commentCount, createdAt입니다. 댓글 생성 요청은 `{"content":"좋은 문장이네요."}`이며 201로 생성된 댓글을 반환합니다.

## 상태 코드와 화면 처리

- 400: 각 입력 아래 필드 오류 표시
- 401: 현재 경로 보관 후 로그인 이동
- 403: 권한 부족 안내
- 404: 앱 404 화면
- 409: 이메일/닉네임 중복 표시
- 429: Retry-After를 존중
- 5xx/네트워크 오류: 입력을 유지하고 재시도 안내

같은 origin이면 상대 경로를 사용합니다. 다른 origin이면 환경별 `API_BASE_URL` 하나만 주입하고 백엔드는 정확한 프론트 origin과 credentials만 CORS 허용합니다. 현재 해시 라우팅은 정적 호스팅 rewrite 없이 새로고침 가능합니다. 운영에서는 HTTPS, CSP, HSTS, 요청 크기 제한, 서버 입력 검증을 적용하세요.