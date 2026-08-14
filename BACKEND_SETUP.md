# Kotlin Spring Boot 연동 설정

백엔드 구현은 포함하지 않습니다. Spring Boot 서버는 `http://localhost:8080`, REST API prefix는 `/api`를 권장합니다.

- 프론트 환경변수: `NEXT_PUBLIC_API_URL=http://localhost:8080/api`
- 개발 CORS: 프론트 개발 서버 origin 허용
- JSON 응답과 ISO-8601 시간 사용
- 예상 리소스: `/poems`, `/comments`, `/ratings`, `/users`, `/auth`, `/reports`

실제 API 호출은 `lib/api`에서 mock과 교체할 수 있습니다.