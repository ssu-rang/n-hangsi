# Thymeleaf + Bootstrap UI

서버 구현 없이 준비된 Thymeleaf 템플릿 모음입니다. React, Next.js, 빌드 도구가 필요하지 않습니다.

## 디렉터리

- `templates/fragments/common.html`: 공통 head, 내비게이션, footer, script
- `templates/home.html`: 홈
- `templates/poems/list.html`: 작품 목록과 검색
- `templates/poems/detail.html`: 작품 상세와 댓글
- `templates/poems/write.html`: 작품 작성
- `templates/auth/login.html`: 로그인
- `templates/users/profile.html`: 프로필
- `templates/error/404.html`: 404
- `static/css/app.css`: Bootstrap 테마 보완
- `static/js/app.js`: 글쓰기 입력 생성 등 최소 동작

## 컨트롤러 계약

| Method | URL | Template | Model |
| --- | --- | --- | --- |
| GET | `/` | `home` | `poems` |
| GET | `/poems` | `poems/list` | `poems`, `keyword` |
| GET | `/poems/{id}` | `poems/detail` | `poem`, `comments` |
| GET | `/poems/new` | `poems/write` | `poemForm` |
| POST | `/poems` | redirect | `poemForm` |
| POST | `/poems/{id}/comments` | redirect | `content` |
| GET/POST | `/login` | `auth/login` | Spring Security 기본 필드 |
| GET | `/users/{id}` | `users/profile` | `user`, `poems` |

`Poem` 화면 모델은 최소한 `id`, `word`, `lines`, `authorName`, `rating`, `ratingCount`, `commentCount`, `createdAt`을 제공해야 합니다.

## Bootstrap 수정법

화면 배치는 HTML의 Bootstrap 클래스만 고치면 됩니다. 브랜드 색상은 `static/css/app.css`의 `--bs-primary` 한 곳에서 변경합니다.

## Spring Boot 없이 화면 미리보기

`frontend` 디렉터리에서 다음 명령을 실행합니다.

```powershell
python -m http.server 5500
```

브라우저에서 `http://localhost:5500/preview.html`을 엽니다. 이 페이지는 디자인과 입력 동작을 확인하기 위한 독립 화면이며 저장 기능은 없습니다.