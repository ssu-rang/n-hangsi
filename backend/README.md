# N행시 Backend

Kotlin과 Spring Boot 기반의 백엔드 프로젝트 골격입니다. 현재는 비즈니스 기능 없이 애플리케이션 진입점과 컨텍스트 테스트만 포함합니다.

## 요구 환경

- Java 21
- 별도 Gradle 설치 불필요(Gradle Wrapper 포함)

## 실행

Windows:

```powershell
.\gradlew.bat bootRun
```

macOS/Linux:

```bash
./gradlew bootRun
```

기본 주소는 `http://localhost:8080`입니다. 아직 컨트롤러를 구현하지 않았으므로 루트 경로의 404는 정상입니다.

## 검증

```powershell
.\gradlew.bat clean test
```

## 포함된 기본 의존성

- Spring Web MVC
- Bean Validation
- Jackson Kotlin
- Kotlin Reflection
- Spring Boot Test / JUnit

프론트엔드와 구현할 API 계약은 `../frontend/BACKEND_INTEGRATION.md`를 참고하세요. 데이터베이스, 인증 및 도메인 의존성은 실제 구현 방식을 결정할 때 추가합니다.
