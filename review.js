// 根据浏览器判断评价链接
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
    subtitle: '能否花几秒钟给我一个评分？<br>这是我独立开发和维护的开源项目，您的支持是我持续更新的最大动力。✨',
    btn: '去评分 ⭐'
  },
  'zh-TW': {
    title: '如果 Mira 對你有幫助',
    subtitle: '能否花幾秒鐘給我一個評分？<br>這是我獨立開發和維護的開源專案，您的支持是我持續更新的最大動力。✨',
    btn: '去評分 ⭐'
  },
  'ja': {
    title: 'Mira がお役に立てたなら',
    subtitle: '数秒で評価していただけますか？<br>これは私が個人で開発・維持しているオープンソースプロジェクトです。あなたのサポートが私の更新の原動力になります。✨',
    btn: '評価する ⭐'
  },
  'ko': {
    title: 'Mira가 도움이 되셨다면',
    subtitle: '몇 초만 시간을 내어 평가해 주실 수 있나요？<br>이것은 제가 혼자 개발하고 유지하는 오픈소스 프로젝트입니다。여러분의 응원이 제가 계속 업데이트하는 원동력이 됩니다。✨',
    btn: '평가하기 ⭐'
  },
  'en': {
    title: 'If Mira has been helpful',
    subtitle: 'Could you spare a few seconds to leave a rating?<br>This is an open-source project I build and maintain solo — your support is what keeps me going. ✨',
    btn: 'Rate Mira Translator ⭐'
  }
};

const uiLang = navigator.language.replace('_', '-');
const langShort = uiLang.split('-')[0];
const t = i18n[uiLang] || i18n[langShort] || i18n['en'];

// 填入文案
document.querySelector('h1').textContent = t.title;
document.querySelector('.subtitle').innerHTML = t.subtitle;
document.getElementById('reviewBtn').innerHTML = t.btn;

