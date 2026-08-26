# 프론트엔드·백엔드 통합 지침

이 프로젝트는 별도의 프론트엔드 서버를 사용하지 않습니다. Spring Boot가 Thymeleaf 템플릿을 렌더링하고 CSS, JavaScript, 이미지를 정적 리소스로 제공합니다.

## 1. 실행 구조

```text
브라우저
  ├─ GET /poems?keyword=고양이
  │    └─ Controller → Service → Repository
  │         └─ Model에 데이터 저장 → Thymeleaf 렌더링
  └─ POST /poems
       └─ Controller → 입력 검증 → Service → DB 저장
            └─ redirect:/poems/{id}
```

같은 Spring Boot 애플리케이션에서 화면과 백엔드를 제공하므로 별도의 CORS 설정은 필요하지 않습니다.

## 2. 프로젝트 구조

```text
src/main/
├─ kotlin/com/nhangsi/
│  ├─ BackendApplication.kt
│  ├─ config/
│  ├─ poem/
│  │  ├─ presentation/
│  │  ├─ application/
│  │  ├─ domain/
│  │  └─ infrastructure/
│  ├─ user/
│  └─ common/
└─ resources/
   ├─ application.yml
   ├─ templates/
   │  ├─ home.html
   │  ├─ auth/login.html
   │  ├─ error/404.html
   │  ├─ fragments/common.html
   │  ├─ poems/detail.html
   │  ├─ poems/list.html
   │  ├─ poems/write.html
   │  └─ users/profile.html
   └─ static/
      ├─ css/app.css
      ├─ js/server-app.js
      └─ images/nhangsi-logo.png
```

- 서버 화면은 `src/main/resources/templates`에서만 관리합니다.
- CSS, JavaScript, 이미지는 `src/main/resources/static`에서만 관리합니다.
- `server-app.js`에는 DOM 보조 기능만 둡니다. 데이터는 `localStorage`가 아니라 서버와 DB에서 관리합니다.
- HTML 출력에는 `th:utext` 대신 기본적으로 `th:text`를 사용합니다.

## 3. 주요 의존성

`build.gradle.kts`에는 다음 의존성을 유지합니다.

```kotlin
implementation("org.springframework.boot:spring-boot-starter-webmvc")
implementation("org.springframework.boot:spring-boot-starter-thymeleaf")
implementation("org.springframework.boot:spring-boot-starter-validation")
implementation("org.springframework.boot:spring-boot-starter-security")
implementation("org.thymeleaf.extras:thymeleaf-extras-springsecurity6")
implementation("org.springframework.boot:spring-boot-starter-data-jpa")
runtimeOnly("com.h2database:h2")
```

운영 환경에서는 H2를 운영용 데이터베이스 드라이버로 교체하고 접속 정보는 환경 변수나 외부 설정으로 주입합니다.

## 4. 화면 URL과 Model 계약

| 기능 | Method | URL | 요청값 | View 또는 처리 |
|---|---|---|---|---|
| 홈 | GET | `/` | `lines=all\|2\|3\|4\|5plus` | `home`, `poems` |
| 작품 목록·검색 | GET | `/poems` | `keyword` | `poems/list`, `poems`, `keyword` |
| 작품 상세 | GET | `/poems/{id}` | path `id` | `poems/detail`, `poem`, `comments` |
| 작품 작성 화면 | GET | `/poems/new` | 선택 `word` | `poems/write`, `poemForm` |
| 작품 등록 | POST | `/poems` | `word`, `lines[index]` | `redirect:/poems/{id}` |
| 댓글 등록 | POST | `/poems/{id}/comments` | `content` | `redirect:/poems/{id}` |
| 공개 프로필 | GET | `/users/{id}` | path `id` | `users/profile`, `user`, `poems` |
| 내 프로필 | GET | `/profile` | 인증 사용자 | 현재 사용자 프로필 |
| 로그인 화면 | GET | `/login` | 선택 `error` | `auth/login` |
| 로그인 처리 | POST | `/login` | `username`, `password` | Spring Security 처리 |
| 로그아웃 | POST | `/logout` | CSRF token | 세션 종료 후 `/` |

Controller는 템플릿에서 요구하는 Model 속성을 항상 전달합니다. 목록 값은 `null` 대신 빈 목록을 사용합니다.

## 5. View Model

영속 Entity를 템플릿에 직접 전달하지 않고 화면 전용 View Model로 변환합니다.

```kotlin
data class PoemView(
    val id: Long,
    val word: String,
    val lines: List<String>,
    val authorId: Long,
    val authorName: String,
    val rating: Double,
    val ratingCount: Long,
    val commentCount: Long,
    val createdAt: String?,
)

data class CommentView(
    val id: Long,
    val authorId: Long,
    val authorName: String,
    val content: String,
    val createdAt: String?,
)

data class UserProfileView(
    val id: Long,
    val nickname: String,
    val bio: String,
    val poemCount: Long,
    val averageRating: Double?,
    val ratingCount: Long,
)
```

## 6. 작품 등록과 검증

작성 화면의 문장 입력 이름은 다음 형식을 사용합니다.

```html
<input name="lines[0]" required maxlength="80">
<input name="lines[1]" required maxlength="80">
```

`server-app.js`는 제시어의 Unicode 문자 수에 맞춰 위 입력 필드를 생성합니다. 서버는 클라이언트 검증과 관계없이 다음 규칙을 다시 검증합니다.

- 제시어 앞뒤 공백 제거 및 내부 공백 금지
- 제시어는 Unicode 문자 기준 2~6자
- 문장 수와 제시어 문자 수 일치
- 각 문장은 비어 있지 않고 최대 80자
- `lines[i]`는 제시어의 i번째 문자로 시작
- 검증 실패 시 입력값과 field error를 유지한 채 작성 화면 재표시

권장 Form 객체:

```kotlin
data class PoemCreateForm(
    @field:Size(min = 2, max = 6)
    val word: String = "",
    val lines: List<String> = emptyList(),
)
```

## 7. 댓글

댓글은 로그인한 사용자만 등록할 수 있습니다.

```kotlin
data class CommentCreateForm(
    @field:NotBlank
    @field:Size(max = 300)
    val content: String = "",
)
```

작성자 ID를 요청값으로 받지 말고 인증 세션에서 가져옵니다. 성공 후에는 PRG(Post/Redirect/Get) 방식으로 상세 화면에 redirect하여 새로고침에 의한 중복 등록을 방지합니다.

## 8. 인증과 보안

- `/`, 공개 작품·프로필, 로그인 화면, 정적 리소스는 비로그인 접근을 허용합니다.
- 작품 작성, 댓글 작성, 내 프로필은 인증이 필요합니다.
- 비밀번호는 BCrypt 등의 단방향 해시로 저장합니다.
- 비밀번호, 세션 ID, SQL, stack trace를 화면이나 응답에 노출하지 않습니다.
- 상태 변경 요청은 GET이 아닌 POST 또는 DELETE를 사용합니다.
- Thymeleaf form이 제공하는 CSRF token을 유지합니다.
- 헤더는 `sec:authorize`로 로그인 상태에 따라 로그인 또는 프로필·로그아웃 메뉴를 표시합니다.

## 9. 오류 처리

| 상태 | 서버 렌더링 처리 |
|---|---|
| 400 | form에 입력값과 field error 표시 |
| 401 | 로그인 화면으로 이동 |
| 403 | 권한 부족 화면 표시 |
| 404 | `error/404`와 실제 HTTP 404 반환 |
| 409 | 이메일·닉네임 등 중복 안내 |
| 429 | 재시도 시점 안내 |
| 5xx | 공통 오류 화면과 추적 ID 표시 |

없는 작품이나 사용자는 공통 예외로 처리합니다.

```kotlin
@ControllerAdvice
class PageExceptionHandler {
    @ExceptionHandler(ResourceNotFoundException::class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    fun notFound(): String = "error/404"
}
```

## 10. 구현 순서

1. View Model과 메모리 기반 조회 Service 구현
2. `/`, `/poems`, `/poems/{id}`, `/poems/new`, `/users/{id}` GET Controller 연결
3. 작품 작성 Form, 서버 검증, POST `/poems` 연결
4. 댓글 Form과 POST `/poems/{id}/comments` 연결
5. 사용자 Entity, Repository, 로그인·로그아웃 연결
6. 작품·댓글 Entity와 Repository 구현 후 메모리 저장소를 DB로 교체
7. 공통 예외 처리와 보안 테스트 추가

## 11. 실행과 검증

```powershell
.\gradlew.bat bootRun
```

실행 후 `http://localhost:8080`에서 화면을 확인합니다.

```powershell
.\gradlew.bat test
```

최소한 다음 시나리오를 테스트합니다.

- 빈 목록과 검색 결과 없음
- 정상·실패 작품 등록
- 비로그인 상태의 작품·댓글 POST
- 존재하지 않는 작품과 사용자에 대한 HTTP 404
- 댓글 등록 후 새로고침 시 중복 등록 방지
- 로그인 상태에 따른 헤더 변경

## 12. 완료 기준

- `/`에서 DB의 작품 목록이 표시된다.
- 검색어와 서버 검색 결과가 일치한다.
- 상세 화면에 작품과 댓글이 표시된다.
- 비로그인 작성 요청은 로그인으로 이동한다.
- 작품과 댓글 등록 결과가 DB에 저장된다.
- 없는 리소스는 전용 화면과 HTTP 404를 반환한다.
- 프리뷰용 `localStorage` 코드 없이 모든 데이터가 서버에서 제공된다.
- 루트에서 `bootRun`, `test`, `build`가 성공한다.
