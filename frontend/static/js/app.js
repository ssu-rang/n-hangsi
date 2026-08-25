"use strict";
const KEY = "nhangsi-v1", seed = {
    users: [{
        id: 1,
        email: "demo@nhangsi.kr",
        password: "demo1234",
        nickname: "문장수집가",
        bio: "평범한 단어에서 특별한 문장을 찾습니다."
    }],
    session: null,
    poems: [{
        id: 1,
        word: "여름",
        lines: ["여전히 네가 웃던 골목에는", "름름한 햇살만 오래 머문다"],
        authorId: 1,
        authorName: "문장수집가",
        rating: 4.8,
        ratingCount: 23,
        createdAt: "2026-08-15",
        comments: [{id: 1, authorName: "감자전문가", content: "마지막 문장이 오래 남아요."}]
    }, {
        id: 2,
        word: "고양이",
        lines: ["고요한 오후 창가에", "양손 가득 햇빛을 모으면", "이제 네가 집사다"],
        authorId: 1,
        authorName: "문장수집가",
        rating: 4.6,
        ratingCount: 18,
        createdAt: "2026-08-14",
        comments: []
    }]
};
let state;
try {
    state = JSON.parse(localStorage.getItem(KEY)) || structuredClone(seed)
} catch {
    state = structuredClone(seed)
}
const app = document.querySelector("#app"), esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    }[c])), user = () => state.users.find(u => u.id === state.session),
    save = () => localStorage.setItem(KEY, JSON.stringify(state));

function toast(s) {
    let n = document.querySelector("#toast");
    n.textContent = s;
    n.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => n.classList.remove("show"), 2400)
}

function lines(p) {
    return p.lines.map((x, i) => `<div class="poem-line"><b>${esc([...p.word][i])}</b><span>${esc(x)}</span></div>`).join("")
}

function card(p, rank) {
    let hot = rank === 1 ? `<span class="hot-label">HOT</span>` : "",
        heading = rank ? `<span class="community-rank">#${String(rank).padStart(2, "0")}</span><div class="community-content"><div class="community-heading"><h2>${esc(p.word)}</h2>${hot}<span class="line-count">${[...p.word].length}행시</span></div>` : `<h2>${esc(p.word)}</h2>`,
        created = p.createdAt ? ` · ${esc(p.createdAt)}` : "",
        content = `${heading}${lines(p)}<div class="meta"><span>@${esc(p.authorName)} · 평점 ${p.rating.toFixed(1)} · 댓글 ${p.comments.length}${created}</span></div>${rank ? "</div>" : ""}`;
    return `<article class="card">${rank ? `<div class="card-body">${content}</div>` : content}<a class="cover" href="#/poems/${p.id}" aria-label="${esc(p.word)} 작품 보기"></a></article>`
}

function show(s) {
    app.innerHTML = s;
    scrollTo(0, 0);
    app.focus({preventScroll: true})
}

function nav() {
    document.querySelector("#auth").innerHTML = user() ? `<a href="#/profile">${esc(user().nickname)}</a><button class="link" id="logout">로그아웃</button>` : '<a class="nav-login" href="#/login">로그인</a>';
    document.querySelector("#logout")?.addEventListener("click", () => {
        state.session = null;
        save();
        location.hash = "#/";
        render()
    })
}

const view = {
    home(q) {
        let promptWord = "파란하늘",
            promptExample = {
                word: promptWord,
                lines: ["파도처럼 설레는 마음으로", "란초꽃보다 환하게 웃고", "하루의 걱정은 잠시 내려놓고", "늘 새로운 문장을 써 내려간다"],
                authorName: "문장수집가",
                rating: 4.8
            },
            promptPoems = state.poems.filter(p => p.word === promptWord),
            visiblePromptPoems = promptPoems.length ? promptPoems : [promptExample],
            recommended = visiblePromptPoems[0], lineFilter = q?.get("lines") || "all",
            matchesLines = p => {
                let count = [...p.word].length;
                if (lineFilter === "all") return true;
                if (lineFilter === "5plus") return count >= 5;
                return count === +lineFilter
            },
            popular = state.poems.slice(-2).reverse().filter(matchesLines),
            lineItems = [["all", "전체"], ["2", "2행시"], ["3", "3행시"], ["4", "4행시"], ["5plus", "5행시 이상"]]
                .map(([value, label]) => `<a class="${lineFilter === value ? "is-active" : ""}" href="${value === "all" ? "#/" : `#/?lines=${value}`}"${lineFilter === value ? ' aria-current="page"' : ""}>${label}</a>`).join(""),
            trendingFeed = popular.map((p, i) => `<div class="trending-item">${card(p, i + 1)}</div>`).join("");
        show(`<div class="home-layout"><aside class="category-sidebar" aria-label="N행시 카테고리"><h2>카테고리</h2><div class="filter-group"><h3>행 수</h3><nav>${lineItems}</nav></div><div class="filter-group difficulty-filter"><h3>난이도</h3><nav aria-label="난이도 필터 준비 중"><span class="is-active" aria-disabled="true">전체</span><span aria-disabled="true">쉬움</span><span aria-disabled="true">보통</span><span aria-disabled="true">어려움</span></nav></div><div class="sidebar-ad" aria-label="가상 광고"><span>ADVERTISEMENT</span><strong>오늘 쓴 한 줄이<br>내일의 굿즈로</strong><small>가상 광고 영역</small></div><div class="sidebar-ad" aria-label="가상 광고"><span>ADVERTISEMENT</span><strong>오늘 쓴 한 줄이<br>내일의 굿즈로</strong><small>가상 광고 영역</small></div></aside><div class="main-content"><section class="daily-overview"><div class="daily-prompt"><div class="daily-prompt-label">오늘의 제시어</div><h1>파란하늘</h1><p>오늘의 단어로 N행시를 지어보세요.</p><a class="button inverse" href="#/write?word=파란하늘">N행시 쓰기</a></div><div class="daily-recommendation"><p class="prompt-work-count">${visiblePromptPoems.length}개의 작품이 올라왔어요.</p>${recommended ? `<div class="featured-work"><div class="featured-work-label">가장 인기 있는 작품</div>${lines(recommended)}<div class="meta recommendation-meta">@${esc(recommended.authorName)} · ★ ${recommended.rating.toFixed(1)}</div></div>` : '<p class="muted featured-work-empty">아직 등록된 작품이 없습니다.</p>'}<a class="prompt-work-link" href="#/poems?q=${encodeURIComponent(promptWord)}">${promptWord} 작품 더 보기 →</a></div></section><div class="section-head home-section-head"><h1>지금 인기 있는 N행시</h1><a href="#/poems">전체 보기 →</a></div>${popular.length ? `<div class="trending-grid">${trendingFeed}<aside class="feed-ad" aria-label="가상 광고"><span>ADVERTISEMENT</span><strong>YOUR AD<br>COULD BE<br>HERE</strong><small>가상 광고 영역</small></aside></div>` : '<p class="empty">조건에 맞는 작품이 없습니다.</p>'}</div></div>`)
    },
    poems(q) {
        let k = (q.get("q") || "").toLowerCase(),
            items = state.poems.filter(p => (p.word + p.lines.join("") + p.authorName).toLowerCase().includes(k));
        show(`<section class="page-head"><div class="eyebrow">EXPLORE</div><h1>마음에 드는 문장 찾기</h1><p>단어, 문장, 작가 이름으로 검색해 보세요.</p></section><form id="search" class="search explore-search"><input name="q" aria-label="검색어" value="${esc(q.get("q") || "")}" placeholder="단어 또는 내용 검색"><button class="button">검색</button></form>${items.length ? `<div class="grid explore-grid">${items.map(card).join("")}</div>` : '<div class="empty"><h2>검색 결과가 없습니다</h2><a class="button" href="#/write">첫 작품 쓰기</a></div>'}`);
        document.querySelector("#search").onsubmit = e => {
            e.preventDefault();
            location.hash = "#/poems?q=" + encodeURIComponent(new FormData(e.target).get("q"))
        }
    },
    detail(id) {
        let p = state.poems.find(x => x.id === +id);
        if (!p) return view.notFound();
        show(`<article class="card detail"><h1>${esc(p.word)}</h1><a class="author" href="#/users/${p.authorId}"><span class="avatar">${esc(p.authorName[0])}</span><span><b>${esc(p.authorName)}</b><small>${p.createdAt}</small></span></a><div class="detail-lines">${lines(p)}</div><div class="meta">★ ${p.rating.toFixed(1)} · 평가 ${p.ratingCount} · 댓글 ${p.comments.length}</div></article><section class="card comments"><h2>댓글 ${p.comments.length}</h2><form id="comment" class="comment-form"><textarea name="content" required maxlength="300" aria-label="댓글" placeholder="따뜻한 의견을 남겨주세요"></textarea><button class="button">등록</button></form>${p.comments.length ? p.comments.map(c => `<div class="comment"><b>${esc(c.authorName)}</b><p>${esc(c.content)}</p></div>`).join("") : '<p class="muted">첫 댓글을 남겨보세요.</p>'}</section>`);
        document.querySelector("#comment").onsubmit = e => {
            e.preventDefault();
            if (!user()) return login();
            let c = new FormData(e.target).get("content").trim();
            p.comments.push({id: Date.now(), authorName: user().nickname, content: c});
            save();
            view.detail(id)
        }
    },
    write(q) {
        if (!user()) return login();
        show(`<section class="page-head"><div class="eyebrow">CREATE</div><h1>한 글자씩 이어볼까요?</h1><p>2~6글자 제시어를 입력하세요.</p></section><form class="card form-card write-card" id="write"><label>제시어<input id="word" name="word" minlength="2" maxlength="6" required value="${esc(q.get("word") || "")}"></label><p id="hint" class="muted"></p><div id="fields"></div><div class="actions right"><a class="button secondary" href="#/">취소</a><button class="button">등록</button></div></form>`);
        let w = document.querySelector("#word"), f = document.querySelector("#fields"), draw = () => {
            w.value = [...w.value.replace(/\s/g, "")].slice(0, 6).join("");
            document.querySelector("#hint").textContent = w.value ? `${[...w.value].length}행시를 작성합니다.` : "제시어를 입력하세요.";
            f.innerHTML = [...w.value].map((x, i) => `<label class="line-input"><b>${esc(x)}</b><input name="l${i}" required maxlength="80" placeholder="${esc(x)}(으)로 시작하는 문장"></label>`).join("")
        };
        w.oninput = draw;
        draw();
        document.querySelector("#write").onsubmit = e => {
            e.preventDefault();
            let d = new FormData(e.target), letters = [...w.value], ls = letters.map((_, i) => d.get("l" + i).trim());
            if (ls.some((x, i) => !x.startsWith(letters[i]))) return toast("각 문장은 해당 글자로 시작해야 합니다.");
            let p = {
                id: Math.max(0, ...state.poems.map(x => x.id)) + 1,
                word: w.value,
                lines: ls,
                authorId: user().id,
                authorName: user().nickname,
                rating: 0,
                ratingCount: 0,
                createdAt: new Date().toISOString().slice(0, 10),
                comments: []
            };
            state.poems.push(p);
            save();
            location.hash = "#/poems/" + p.id
        }
    },
    login() {
        show(`<section class="card auth-card"><a class="brand" href="#/"><i>N</i>N행시</a><div class="eyebrow">WELCOME BACK</div><h1>다시 만나 반가워요</h1><form id="login"><label>이메일<input name="email" type="email" required autocomplete="username"></label><label>비밀번호<input name="password" type="password" minlength="8" required autocomplete="current-password"></label><p class="form-error" id="error"></p><button class="button wide">로그인</button></form><p class="center">처음이신가요? <a href="#/signup">회원가입</a></p><p class="demo center">demo@nhangsi.kr / demo1234</p></section>`);
        document.querySelector("#login").onsubmit = e => {
            e.preventDefault();
            let d = new FormData(e.target),
                u = state.users.find(x => x.email === d.get("email") && x.password === d.get("password"));
            if (!u) return document.querySelector("#error").textContent = "이메일 또는 비밀번호를 확인하세요.";
            state.session = u.id;
            save();
            location.hash = "#/"
        }
    },
    signup() {
        show(`<section class="card auth-card"><h1>회원가입</h1><form id="signup"><label>닉네임<input name="nickname" minlength="2" required></label><label>이메일<input name="email" type="email" required></label><label>비밀번호<input name="password" type="password" minlength="8" required></label><p class="form-error" id="error"></p><button class="button wide">가입하기</button></form><p class="center"><a href="#/login">로그인으로</a></p></section>`);
        document.querySelector("#signup").onsubmit = e => {
            e.preventDefault();
            let d = new FormData(e.target), email = d.get("email").trim().toLowerCase();
            if (state.users.some(x => x.email === email)) return document.querySelector("#error").textContent = "이미 가입된 이메일입니다.";
            let u = {id: Date.now(), email, password: d.get("password"), nickname: d.get("nickname").trim(), bio: ""};
            state.users.push(u);
            state.session = u.id;
            save();
            location.hash = "#/"
        }
    },
    profile(id) {
        let u = id ? state.users.find(x => x.id === +id) : user();
        if (!u) return id ? view.notFound() : login();
        let ps = state.poems.filter(p => p.authorId === u.id);
        show(`<section class="profile"><span class="avatar large">${esc(u.nickname[0])}</span><div><div class="eyebrow">PROFILE</div><h1>${esc(u.nickname)}</h1><p class="muted">${esc(u.bio || "아직 소개가 없습니다.")}</p></div></section><div class="stats"><div><b>${ps.length}</b><span>작성 작품</span></div><div><b>${ps.length ? (ps.reduce((n, p) => n + p.rating, 0) / ps.length).toFixed(1) : "-"}</b><span>평균 별점</span></div><div><b>${ps.reduce((n, p) => n + p.ratingCount, 0)}</b><span>받은 평가</span></div></div><div class="section-head"><h2>작성한 N행시</h2></div>${ps.length ? `<div class="grid">${ps.map(card).join("")}</div>` : '<div class="empty">아직 작성한 작품이 없습니다.</div>'}`)
    },
    notFound() {
        show('<div class="empty"><div class="error-code">404</div><h1>페이지를 찾을 수 없습니다</h1><a class="button" href="#/">홈으로</a></div>')
    }
};

function login() {
    toast("로그인이 필요한 기능입니다.");
    location.hash = "#/login"
}

function render() {
    nav();
    let raw = location.hash.slice(1) || "/", [path, query = ""] = raw.split("?"), q = new URLSearchParams(query),
        p = path.split("/").filter(Boolean);
    document.body.classList.toggle("home-page", path === "/");
    if (path === "/") view.home(q); else if (path === "/poems") view.poems(q); else if (p[0] === "poems" && p[1]) view.detail(p[1]); else if (path === "/write") view.write(q); else if (path === "/login") view.login(); else if (path === "/signup") view.signup(); else if (path === "/profile") view.profile(); else if (p[0] === "users") view.profile(p[1]); else view.notFound();
    document.querySelector("#nav").classList.remove("open")
}

document.querySelector("#menu").onclick = e => {
    let n = document.querySelector("#nav"), o = n.classList.toggle("open");
    e.currentTarget.setAttribute("aria-expanded", o)
};
addEventListener("hashchange", render);
addEventListener("DOMContentLoaded", render);
