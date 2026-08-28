"use strict";

(() => {
    const configScript = document.currentScript;
    const projectKey = configScript?.dataset.posthogKey;
    const apiHost = configScript?.dataset.posthogHost;
    const consentKey = "nhangsi_analytics_consent";

    if (!projectKey || !apiHost) return;

    const loadPostHog = () => {
        if (document.querySelector('script[data-posthog-sdk]')) return;
        const sdk = document.createElement("script");
        sdk.src = "/js/posthog.js";
        sdk.async = true;
        sdk.dataset.posthogSdk = "";
        sdk.addEventListener("load", () => {
            window.posthog?.init(projectKey, {
                api_host: apiHost,
                autocapture: false,
                capture_pageview: true,
                capture_pageleave: true,
                capture_exceptions: false,
                disable_session_recording: true,
                disable_surveys: true,
                person_profiles: "identified_only",
                persistence: "localStorage",
                respect_dnt: true,
                ip: false,
                before_send: event => {
                    for (const property of ["$current_url", "$referrer"]) {
                        const value = event.properties?.[property];
                        if (typeof value !== "string") continue;
                        try {
                            const url = new URL(value);
                            url.search = "";
                            url.hash = "";
                            event.properties[property] = url.toString();
                        } catch {
                            delete event.properties[property];
                        }
                    }
                    return event;
                },
            });
        });
        document.head.append(sdk);
    };

    const closeBanner = banner => banner.remove();
    const showConsentBanner = () => {
        const banner = document.createElement("section");
        banner.className = "analytics-consent";
        banner.setAttribute("aria-label", "방문 분석 설정");
        banner.innerHTML = `
            <p>서비스 개선을 위해 최소한의 페이지 방문 통계를 수집할 수 있습니다. 동의 전에는 수집하지 않습니다.</p>
            <div>
                <a href="/privacy">자세히 보기</a>
                <button class="btn btn-outline-secondary btn-sm" type="button" data-analytics-deny>거부</button>
                <button class="btn btn-primary btn-sm" type="button" data-analytics-accept>동의</button>
            </div>`;
        banner.querySelector("[data-analytics-accept]")?.addEventListener("click", () => {
            localStorage.setItem(consentKey, "granted");
            closeBanner(banner);
            loadPostHog();
        });
        banner.querySelector("[data-analytics-deny]")?.addEventListener("click", () => {
            localStorage.setItem(consentKey, "denied");
            closeBanner(banner);
        });
        document.body.append(banner);
    };

    document.querySelector("[data-reset-analytics-consent]")?.addEventListener("click", () => {
        localStorage.removeItem(consentKey);
        location.reload();
    });

    const consent = localStorage.getItem(consentKey);
    if (consent === "granted") loadPostHog();
    else if (consent !== "denied") showConsentBanner();
})();
