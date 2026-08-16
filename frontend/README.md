# N행시 프론트엔드

외부 CDN이나 빌드 도구 없이 동작하는 반응형 단일 페이지 앱입니다. 로그인, 회원가입, 검색, 상세, 작품 작성, 댓글, 프로필, 404 흐름을 포함합니다. 현재 데이터는 브라우저 localStorage에 저장됩니다.

```powershell
cd frontend
python -m http.server 5500
```

브라우저에서 http://localhost:5500/preview.html 을 엽니다. 체험 계정은 demo@nhangsi.kr / demo1234 입니다.

실제 백엔드 구현 시 BACKEND_INTEGRATION.md의 계약을 사용하세요. 기존 templates 폴더는 Thymeleaf 참고본이며 독립 실행 앱의 진입점은 preview.html입니다.