# N행시

Kotlin과 Spring Boot 기반의 N행시 커뮤니티 프로젝트입니다. Spring MVC와 Thymeleaf를 사용하므로 별도의 프런트엔드 서버 없이 하나의 애플리케이션으로 실행됩니다.

## 요구 환경

- Java 21
- Gradle Wrapper 포함

## 실행

Windows:

```powershell
.\gradlew.bat bootRun
```

macOS/Linux:

```bash
./gradlew bootRun
```

기본 주소는 `http://localhost:8080`입니다.

## 테스트

```powershell
.\gradlew.bat test
```

## 프로젝트 구조

- `src/main/kotlin`: Spring Boot 애플리케이션 코드
- `src/main/resources/templates`: Thymeleaf 화면
- `src/main/resources/static`: CSS, JavaScript, 이미지
- `src/test/kotlin`: 테스트 코드
