# AGENTS.md

## Fastify 백엔드 개발 원칙

이 프로젝트는 **Fastify의 단순한 구조를 유지하면서 기능 중심으로 코드를 구성한다.**

특정 아키텍처 패턴을 형식적으로 구현하는 것이 목적이 아니다.

가장 중요한 원칙은 다음과 같다.

> **기능을 먼저 만들고, 복잡성이 실제로 생겼을 때만 분리한다.**

`Controller → Service → Repository` 같은 계층 구조를 기본값으로 사용하지 않는다.

작은 기능은 하나의 파일에서 요청 처리, 검증, 비즈니스 로직, DB 접근, 응답까지 처리할 수 있다.

---

# 1. 기능 중심으로 구성한다

코드는 기술적 역할보다 **기능을 기준으로 배치한다.**

다음과 같은 구조를 기본으로 사용하지 않는다.

```text
src/
├─ controllers/
├─ services/
├─ repositories/
├─ models/
└─ routes/
```

대신 기능 중심으로 구성한다.

```text
src/
├─ posts/
│  ├─ create.ts
│  ├─ get.ts
│  ├─ delete.ts
│  └─ update.ts
│
├─ comments/
├─ reports/
├─ auth/
│
├─ db/
│  └─ client.ts
│
└─ app.ts
```

프로젝트 규모가 커진다면 `features/` 아래에 기능들을 배치해도 된다.

```text
src/
├─ features/
│  ├─ posts/
│  ├─ comments/
│  └─ reports/
│
├─ shared/
└─ app.ts
```

폴더 이름 자체보다 **기능 단위로 코드가 모여 있는 것**이 중요하다.

---

# 2. 작은 기능은 하나의 파일로 유지한다

단순한 기능을 여러 계층으로 분해하지 않는다.

예를 들어 다음 흐름이 짧고 명확하다면:

```text
HTTP 요청
↓
입력 검증
↓
비즈니스 판단
↓
DB 접근
↓
응답
```

하나의 파일에서 처리할 수 있다.

```ts
export async function createPostRoute(app: FastifyInstance) {
  app.post("/posts", async (request, reply) => {
    const { content } = request.body;

    if (!content) {
      return reply.code(400).send({
        message: "content is required",
      });
    }

    const result = await app.db.query(
      `
      INSERT INTO posts (content)
      VALUES ($1)
      RETURNING id, content
      `,
      [content],
    );

    return result.rows[0];
  });
}
```

이 코드를 특별한 이유 없이 다음과 같이 분리하지 않는다.

```text
CreatePostController
↓
CreatePostService
↓
CreatePostRepository
↓
DB
```

중간 계층이 단순히 다음 함수를 호출하는 역할만 한다면 만들지 않는다.

---

# 3. Route에서 DB에 직접 접근할 수 있다

Route handler에서 직접 DB에 접근하는 것을 금지하지 않는다.

다음 구조는 정상적인 구조다.

```text
GET /posts/:id
↓
validation
↓
SQL
↓
response
```

단순 조회를 위해 반드시 Repository를 만들 필요는 없다.

```ts
app.get("/posts/:id", async (request, reply) => {
  const post = await app.db.query(
    `SELECT id, content FROM posts WHERE id = $1`,
    [request.params.id],
  );

  if (!post.rows[0]) {
    return reply.code(404).send();
  }

  return post.rows[0];
});
```

DB 접근을 분리하는 것은 다음과 같은 **실제 이유가 생겼을 때** 고려한다.

* 쿼리가 복잡해졌다.
* 같은 DB 동작을 여러 기능에서 실제로 사용한다.
* 트랜잭션 관리가 복잡해졌다.
* 별도로 테스트할 필요가 생겼다.
* DB 코드 때문에 기능의 핵심 흐름을 읽기 어려워졌다.

단순히 "DB 접근은 Repository에서 해야 한다"는 이유로 분리하지 않는다.

---

# 4. Route / Service / Repository는 필수 계층이 아니다

Fastify route가 Controller 역할을 한다는 이유로 별도의 Controller 클래스를 만들지 않는다.

다음과 같은 구조를 기계적으로 만들지 않는다.

```text
route
↓
controller
↓
service
↓
repository
↓
database
```

각 단계가 독립적인 책임을 가지고 있지 않다면 불필요한 간접 계층이다.

예를 들어 다음 코드는 피한다.

```ts
// route
return postController.getPost(id);

// controller
return postService.getPost(id);

// service
return postRepository.getPost(id);

// repository
return db.query(...);
```

기능을 이해하기 위해 호출을 계속 따라가야 하는 구조보다 직접적인 코드를 선호한다.

---

# 5. 복잡성이 생기면 기능 내부에서 분리한다

처음부터 많은 파일을 만들지 않는다.

처음에는:

```text
reports/
└─ report.ts
```

로 시작할 수 있다.

`report.ts`가 복잡해졌다면 필요한 부분만 분리한다.

```text
reports/
├─ route.ts
├─ query.ts
└─ schema.ts
```

비즈니스 로직까지 독립적으로 복잡해졌다면:

```text
reports/
├─ route.ts
├─ report.ts
├─ query.ts
├─ schema.ts
└─ report.test.ts
```

처럼 확장할 수 있다.

중요한 점은 **분리된 코드도 report 기능 내부에 존재한다는 것**이다.

프로젝트 전체를 다시 다음과 같이 나누지 않는다.

```text
routes/
services/
repositories/
schemas/
```

---

# 6. HTTP와 비즈니스 로직도 필요할 때만 분리한다

기능이 HTTP 요청에서만 사용되고 충분히 단순하다면 route handler 내부에 로직을 둘 수 있다.

하지만 같은 기능이 여러 진입점에서 사용되기 시작하면 핵심 기능을 분리한다.

예:

```text
HTTP ──────┐
Scheduler ─┼──> Report
Event ─────┘
```

이 경우:

```text
reports/
├─ route.ts
└─ report.ts
```

처럼 구성한다.

`report.ts`는 HTTP를 몰라도 동작할 수 있게 만들 수 있다.

분리 이유는 "비즈니스 로직은 Service에 있어야 하기 때문"이 아니다.

> **HTTP 외부에서도 같은 기능을 사용해야 하기 때문에 분리한다.**

---

# 7. 공통 코드는 실제로 공통일 때만 추출한다

미래에 사용할 가능성이 있다는 이유로 미리 추상화하지 않는다.

다음과 같은 코드를 성급하게 만들지 않는다.

```text
BaseService
BaseRepository
AbstractRepository
CommonHandler
CommonManager
CommonUtil
```

두 기능에 비슷한 코드가 조금 존재하는 것은 허용한다.

실제로 여러 기능에서 같은 개념이 반복될 때 공통 영역으로 이동한다.

예:

```text
src/
├─ posts/
├─ reports/
├─ comments/
│
├─ auth/
├─ db/
└─ external/
```

또는 규모가 커진 경우:

```text
src/
├─ features/
│  ├─ posts/
│  ├─ reports/
│  └─ comments/
│
├─ shared/
│  ├─ auth/
│  ├─ db/
│  ├─ security/
│  └─ external/
│
└─ app.ts
```

원칙은 다음과 같다.

> **공통일 것 같아서 추출하지 않는다. 실제로 공통이 된 뒤 추출한다.**

---

# 8. Schema는 가까이 둔다

Fastify의 request/response schema는 해당 기능과 가까운 곳에 둔다.

작은 schema라면 route와 같은 파일에 둘 수 있다.

```ts
const schema = {
  body: {
    type: "object",
    required: ["content"],
    properties: {
      content: { type: "string" },
    },
  },
};

app.post("/posts", { schema }, async (request, reply) => {
  // ...
});
```

schema가 커지거나 여러 endpoint에서 공유된다면 별도 파일로 분리한다.

```text
posts/
├─ create.ts
├─ get.ts
└─ schema.ts
```

모든 schema를 무조건 전역 `schemas/` 디렉터리에 모으지 않는다.

---

# 9. Type도 기능 근처에 둔다

특정 기능에서만 사용하는 TypeScript 타입은 해당 기능과 가까운 곳에 둔다.

작은 타입은 같은 파일에 선언할 수 있다.

```ts
type CreatePostBody = {
  content: string;
};
```

여러 기능에서 실제로 공유되는 타입만 공통 영역으로 이동한다.

`types/` 디렉터리를 거대한 공용 타입 저장소로 만들지 않는다.

---

# 10. Plugin은 실제 공통 인프라에 사용한다

Fastify Plugin은 다음과 같은 공통 인프라를 구성할 때 적극적으로 사용할 수 있다.

* DB 연결
* 인증
* 세션
* 로깅
* 공통 보안 설정
* 외부 서비스 클라이언트
* 공통 decorator

예:

```text
plugins/
├─ db.ts
├─ auth.ts
└─ session.ts
```

기능 하나에서만 사용하는 작은 로직을 Plugin으로 만들 필요는 없다.

Plugin 역시 추상화를 위한 추상화로 사용하지 않는다.

---

# 11. 테스트는 기능과 가까이 둔다

테스트는 기능 단위로 구성한다.

```text
posts/
├─ create.ts
├─ create.test.ts
├─ delete.ts
└─ delete.test.ts
```

또는 기능이 폴더로 확장되었다면:

```text
reports/
├─ route.ts
├─ report.ts
├─ query.ts
└─ report.test.ts
```

기능을 수정했을 때 어떤 테스트를 확인해야 하는지 쉽게 알 수 있어야 한다.

---

# 12. 위에서 아래로 읽히는 코드를 선호한다

핵심 동작은 가능한 한 코드의 위에서 아래 방향으로 읽혀야 한다.

좋은 예:

```text
입력
↓
검증
↓
인증/인가
↓
비즈니스 판단
↓
DB 변경
↓
응답
```

다음과 같이 실제 로직을 찾기 위해 여러 파일을 계속 이동해야 하는 구조는 피한다.

```text
route.ts
↓
controller.ts
↓
service.ts
↓
manager.ts
↓
repository.ts
↓
database
```

함수를 분리하더라도 주요 실행 흐름을 쉽게 파악할 수 있어야 한다.

---

# 13. AI가 수정하기 쉬운 구조를 유지한다

이 프로젝트는 AI 코딩 에이전트가 기능을 쉽게 탐색하고 안전하게 수정할 수 있어야 한다.

AI에게 다음과 같은 작업을 요청했을 때:

```text
"신고 기능에 중복 신고 방지를 추가해."
```

가능하면 AI가 다음 영역만 읽어도 기능을 이해할 수 있어야 한다.

```text
reports/
├─ report.ts
└─ report.test.ts
```

필요하다면 소수의 공통 의존성만 추가로 확인하면 되어야 한다.

이를 위해 다음을 우선한다.

* 기능 단위의 높은 응집도
* 관련 코드의 물리적 근접성
* 짧은 호출 그래프
* 작은 변경 범위
* 명시적인 의존성
* 기능별 테스트
* 불필요한 추상화 제거

목표는 파일 개수를 최소화하는 것이 아니다.

> **하나의 기능을 이해하고 수정하는 데 필요한 컨텍스트를 최소화하는 것이 목표다.**

---

# 14. 큰 파일도 방치하지 않는다

"하나의 기능은 하나의 파일"은 절대 규칙이 아니다.

다음과 같은 상황에서는 분리를 고려한다.

* 파일이 너무 커져 전체 흐름을 읽기 어렵다.
* SQL이 핵심 로직을 가린다.
* validation 자체가 복잡하다.
* 독립적인 비즈니스 규칙이 커졌다.
* 외부 API 연동이 복잡해졌다.
* 별도로 테스트할 가치가 있는 부분이 생겼다.

하지만 분리는 항상 **기능 내부에서 먼저 수행한다.**

```text
payments/
├─ route.ts
├─ payment.ts
├─ query.ts
└─ payment.test.ts
```

---

# 15. 중복보다 잘못된 추상화를 더 경계한다

몇 줄의 코드가 두 곳에 반복된다는 이유만으로 즉시 공통 함수로 만들지 않는다.

서로 다른 기능이 우연히 현재 같은 코드를 사용하고 있을 수도 있다.

잘못된 공통화는 서로 독립적이어야 할 기능을 결합시킨다.

따라서:

> **작은 중복은 허용하고, 확실한 공통 개념이 발견된 뒤 추상화한다.**

DRY를 기계적으로 적용하지 않는다.

---

# 16. 아키텍처 패턴 자체를 목표로 하지 않는다

이 프로젝트의 목적은 "Vertical Slice Architecture를 완벽하게 구현하는 것"이 아니다.

Fastify 자체가 단순한 프레임워크이므로 작은 프로젝트에서는 다음 정도로 충분할 수 있다.

```text
src/
├─ posts/
├─ comments/
├─ reports/
├─ auth/
├─ db/
└─ app.ts
```

필요하지 않은 아키텍처 요소를 추가하지 않는다.

Vertical Slice는 **새로운 복잡성을 추가하기 위한 패턴이 아니라 기존 기능의 단순성을 유지하기 위한 방향성**으로 사용한다.

---

# AI 작업 지침

코드를 생성하거나 수정할 때 다음 순서를 따른다.

1. 먼저 수정 대상 기능의 파일 또는 디렉터리를 확인한다.
2. 해당 기능 내부에서 해결 가능한지 확인한다.
3. 기존 계층이나 추상화를 무조건 추가하지 않는다.
4. 단순한 기능이라면 route handler에서 직접 처리할 수 있다.
5. DB 접근을 위해 Repository를 의무적으로 생성하지 않는다.
6. Service를 의무적으로 생성하지 않는다.
7. DTO/Schema/Type을 무조건 별도 파일로 만들지 않는다.
8. 기능이 실제로 복잡해졌을 때만 분리한다.
9. 여러 기능에서 실제로 공유되는 코드만 공통 영역으로 이동한다.
10. 수정 후 해당 기능의 테스트를 작성하거나 업데이트한다.
11. 기존 기능에 미치는 영향을 확인한다.
12. 더 적은 파일과 더 짧은 호출 그래프로 같은 명확성을 얻을 수 있다면 단순한 구조를 선택한다.

AI는 기존 코드가 Layered Architecture를 사용하고 있다는 이유만으로 새로운 코드에도 같은 계층을 추가해서는 안 된다.

---

# 판단 기준

새로운 클래스, 함수, 파일 또는 계층을 만들기 전에 다음을 확인한다.

**"이것을 분리하면 실제로 이해하거나 수정하기 쉬워지는가?"**

아니라면 분리하지 않는다.

**"이 코드는 정말 여러 기능에서 공유되는가?"**

아니라면 공통 영역으로 이동하지 않는다.

**"이 계층이 독립적인 책임을 가지는가?"**

아니라면 계층을 만들지 않는다.

**"이 기능을 수정하려면 몇 개의 파일을 읽어야 하는가?"**

가능한 한 적게 유지한다.

---

# 최종 원칙

이 프로젝트에서는 다음 우선순위를 따른다.

**단순성 > 기능 응집도 > 변경 용이성 > 코드 탐색 비용 > 명확한 책임 > 재사용성 > 형식적인 아키텍처**

항상 다음 원칙을 기억한다.

> **Fastify를 복잡하게 만들지 않는다.**
>
> **기능을 중심으로 코드를 배치한다.**
>
> **작으면 한 파일에 둔다.**
>
> **커지면 그 기능 안에서 나눈다.**
>
> **DB에 직접 접근해도 된다.**
>
> **Service와 Repository는 필요할 때만 만든다.**
>
> **공통 코드는 실제로 공통이 된 뒤 추출한다.**
>
> **추상화보다 읽기 쉬운 실행 흐름을 우선한다.**
>
> **AI와 사람이 하나의 기능을 이해하기 위해 읽어야 하는 컨텍스트를 최소화한다.**
