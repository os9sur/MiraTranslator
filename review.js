let clientId = 'unknown';
if (chrome && chrome.runtime) {
    chrome.runtime.sendMessage({ type: 'getClientId' }, (id) => {
        if (id) clientId = id;
    });
}

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

const targetUrl = getReviewUrl();
const reviewBtn = document.getElementById('reviewBtn');
const starsLink = document.getElementById('starsLink');
reviewBtn.href = targetUrl;
starsLink.href = targetUrl;

// 星星 hover 缩放动效
starsLink.addEventListener('mouseenter', () => starsLink.style.transform = 'scale(1.05)');
starsLink.addEventListener('mouseleave', () => starsLink.style.transform = 'scale(1)');

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
        highlight: '数秒で評価をいただけないでしょうか？',
        subtitle: '個人で開発・運営しているオープンソースプロジェクトです。皆様の応援が継続の大きな力になります。✨',
        btn: '評価する ⭐'
    },
    'ko': {
        title: 'Mira가 도움이 되셨다면',
        highlight: '잠시 시간을 내어 평가해 주실 수 있나요?',
        subtitle: '제가 직접 개발하고 관리하는 오픈소스 프로젝트입니다. 여러분의 응원이 지속적인 업데이트의 큰 원동력이 됩니다.✨',
        btn: '평가하기 ⭐'
    },
    'en': {
        title: 'If Mira has been helpful',
        highlight: 'Could you spare a few seconds to leave a rating?',
        subtitle: 'This is an open-source project I develop and maintain solo — your support keeps it alive and growing. ✨',
        btn: 'Rate Mira Translator ⭐'
    }, 
    'es': {
        title: 'Si Mira te ha sido útil',
        highlight: '¿Podrías tomarte unos segundos para dejar una valoración?',
        subtitle: 'Este es un proyecto de código abierto que desarrollo y mantengo en solitario — tu apoyo es lo que me permite seguir mejorándolo. ✨',
        btn: 'Valorar Mira Translator ⭐'
    },
    'fr': {
        title: 'Si Mira vous a été utile',
        highlight: 'Pourriez-vous prendre quelques secondes pour laisser un avis ?',
        subtitle: "C'est un projet open source que je développe et maintiens seul — votre soutien me permet de continuer à le faire évoluer. ✨",
        btn: 'Noter Mira Translator ⭐'
    },
    'de': {
        title: 'Wenn Mira hilfreich war',
        highlight: 'Könnten Sie sich kurz Zeit nehmen, um eine Bewertung zu hinterlassen?',
        subtitle: 'Dies ist ein Open-Source-Projekt, das ich eigenständig entwickle und pflege — Ihre Unterstützung ist meine Motivation weiterzumachen. ✨',
        btn: 'Mira Translator bewerten ⭐'
    },
    'pt': {
        title: 'Se o Mira foi útil para você',
        highlight: 'Poderia dedicar alguns segundos para deixar uma avaliação?',
        subtitle: 'Este é um projeto de código aberto que desenvolvo e mantenho sozinho — seu apoio é o que me mantém motivado. ✨',
        btn: 'Avaliar Mira Translator ⭐'
    },
    'pt-PT': {
        title: 'Se o Mira foi útil para si',
        highlight: 'Poderia dedicar alguns segundos para deixar uma avaliação?',
        subtitle: 'Este é um projeto de código aberto que desenvolvo e mantenho sozinho — o seu apoio é o que me mantém motivado. ✨',
        btn: 'Avaliar Mira Translator ⭐'
    },
    'ru': {
        title: 'Если Mira оказался полезным',
        highlight: 'Не могли бы вы уделить несколько секунд для оценки?',
        subtitle: 'Это проект с открытым исходным кодом, который я разрабатываю и поддерживаю в одиночку — ваша поддержка очень важна для меня. ✨',
        btn: 'Оценить Mira Translator ⭐'
    },
    'ar': {
        title: 'إذا كان Mira مفيداً لك',
        highlight: 'هل يمكنك تخصيص بضع ثوانٍ لتقييمه？',
        subtitle: 'هذا مشروع مفتوح المصدر أطوره وأحافظ عليه بمفردي — دعمك هو ما يبقيني مستمراً. ✨',
        btn: 'تقييم Mira Translator ⭐'
    },
};

const uiLang = navigator.language.replace('_', '-');
const langShort = uiLang.split('-')[0];
const langMap = { 'zh': 'zh-CN', 'zh-tw': 'zh-TW', 'zh-hk': 'zh-TW' };
const _t = i18n[uiLang] || i18n[uiLang.toLowerCase()] || i18n[langMap[uiLang.toLowerCase()]] || i18n[langMap[langShort]] || i18n[langShort] || i18n['en'];

// 阿拉伯语等 RTL 核心支持逻辑
const rtlLanguages = ['ar', 'he', 'fa', 'ur'];
if (rtlLanguages.includes(langShort.toLowerCase())) {
    document.documentElement.dir = 'rtl';
    document.documentElement.lang = langShort;
} else {
    document.documentElement.lang = uiLang;
}

// 文本数据安全注入
document.getElementById('titleText').textContent = _t.title;
document.getElementById('subtitleText').innerHTML = 
    `<span class="subtitle-highlight">${_t.highlight}</span>${_t.subtitle}`;
reviewBtn.textContent = _t.btn;

// 埋点数据准备
const startTime = Date.now();
let userMeta = {};

if (chrome && chrome.storage) {
    Promise.all([
        safeGetStorage.get(['usage_count', 'active_days', 'install_time']),
    ]).then(([data]) => {
        const installTime = data?.install_time || Date.now();
        userMeta = {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            usage_count: data?.usage_count || 0,
            active_days: data?.active_days?.length || 0,
            days_since_install: Math.floor((Date.now() - installTime) / (1000 * 60 * 60 * 24)),
        };
    });
}

function trackReviewClick(source) {
    const duration = Math.round((Date.now() - startTime) / 1000);
    if (chrome && chrome.runtime) {
        chrome.runtime.sendMessage({
            type: 'trackEvent',
            name: 'review_btn_clicked',
            params: {
                source,
                duration_seconds: Math.min(duration, 300),
                browser_lang: navigator.language,
                ...userMeta,
            }
        });
    }
}

let clicked = false;
reviewBtn.addEventListener('click', () => { clicked = true; trackReviewClick('btn'); });
starsLink.addEventListener('click', () => { clicked = true; trackReviewClick('stars'); });

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
                    clicked,
                    ...userMeta, 
                }
            }]
        })
    );
});