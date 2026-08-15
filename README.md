# N행시

한국식 짧은 유머 콘텐츠를 만들고 평가하는 N행시 커뮤니티입니다.

## 프로젝트 구조

- `frontend/templates/`: Spring Boot에서 사용할 Thymeleaf 화면 템플릿
- `frontend/static/`: Bootstrap 보완 CSS와 순수 JavaScript
- `backend/`: 향후 Spring Boot 애플리케이션 위치(현재 미구현)

프론트엔드는 Next.js, React, Node.js 패키지를 사용하지 않습니다. Bootstrap 5는 CDN으로 불러옵니다.

## Spring Boot에 연결할 때

Spring Boot 프로젝트를 만든 후 다음처럼 옮기면 됩니다.

- `frontend/templates` → `src/main/resources/templates`
- `frontend/static` → `src/main/resources/static`

필요한 컨트롤러 URL과 모델 이름은 `frontend/README.md`를 참고하세요.
