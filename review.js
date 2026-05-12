
let clientId = 'unknown';
chrome.runtime.sendMessage({ type: 'getClientId' }, (id) => {
    if (id) clientId = id;
});


function getReviewUrl() {
    const ua = navigator.userAgent;
    if (typeof browser !== 'undefined' && /Firefox/.test(ua)) {
        return "https://addons.mozilla.org/firefox/addon/mira-translator/";
    }
    if (ua.includes("Edg/")) {
        return "https://microsoftedge.microsoft.com/addons/detail/ofhlbeoigddhlpompkgbmbdhpbffmife";
    }
    return "https://chromewebstore.google.com/detail/mira-translator-immersive/hmmllfdmkbmmfffjekhmmbhhfhhnocmn";
}

const reviewBtn = document.getElementById('reviewBtn');
reviewBtn.href = getReviewUrl();
document.getElementById('starsLink').href = getReviewUrl();

const i18n = {
    'zh-CN': {
        title: '如果 Mira 对你有帮助',
        highlight: '能否花几秒钟给我一个评分？',
        subtitle: '这是我独立开发和维护的开源项目，您的支持是我持续更新的最大动力。✨',
        btn: '去评分 ⭐'
    },
    'zh-TW': {
        title: '如果 Mira 對你有幫助',
        highlight: '能否花幾秒鐘給我一個評分？',
        subtitle: '這是我獨立開發和維護的開源專案，您的支持是我持續更新的最大動力。✨',
        btn: '去評分 ⭐'
    },
    'ja': {
        title: 'Mira がお役に立てたなら',
        highlight: '数秒で評価していただけますか？',
        subtitle: 'これは私が個人で開発・維持しているオープンソースプロジェクトです。あなたのサポートが私の更新の原動力になります。✨',
        btn: '評価する ⭐'
    },
    'ko': {
        title: 'Mira가 도움이 되셨다면',
        highlight: '몇 초만 시간을 내어 평가해 주실 수 있나요？',
        subtitle: '이것은 제가 혼자 개발하고 유지하는 오픈소스 프로젝트입니다。여러분의 응원이 제가 계속 업데이트하는 원동력이 됩니다。✨',
        btn: '평가하기 ⭐'
    },
    'en': {
        title: 'If Mira has been helpful',
        highlight: 'Could you spare a few seconds to leave a rating?',
        subtitle: 'This is an open-source project I build and maintain solo — your support is what keeps me going. ✨',
        btn: 'Rate Mira Translator ⭐'
    }
};

const uiLang = navigator.language.replace('_', '-');
const langShort = uiLang.split('-')[0];
const langMap = { 'zh': 'zh-CN' };
const _t = i18n[uiLang] || i18n[langMap[langShort]] || i18n[langShort] || i18n['en'];

document.querySelector('h1').textContent = _t.title;
document.querySelector('.subtitle').innerHTML =
    `<span class="subtitle-highlight">${_t.highlight}</span>${_t.subtitle}`;
document.getElementById('reviewBtn').textContent = _t.btn;


const startTime = Date.now();

function trackReviewClick(source) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    chrome.runtime.sendMessage({
        type: 'trackEvent',
        name: 'review_btn_clicked',
        params: {
            source,
            duration_seconds: Math.min(duration, 300),
            browser_lang: navigator.language,
        }
    });
}

reviewBtn.addEventListener('click', () => trackReviewClick('btn'));
document.getElementById('starsLink').addEventListener('click', () => trackReviewClick('stars'));

window.addEventListener('pagehide', () => {
    const duration = Math.round((Date.now() - startTime) / 1000);
    navigator.sendBeacon(
        `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
        JSON.stringify({
            client_id: clientId,
            events: [{
                name: 'review_page_closed',
                params: {
                    duration_seconds: Math.min(duration, 300),
                    browser_lang: navigator.language,
                }
            }]
        })
    );
});