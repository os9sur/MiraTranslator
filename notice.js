// notice.js —— popup.html 与 engineSettings.html 共用

const NOTICE_DISMISSED_KEY = 'mira_notice_dismissed_v';

/**
 * @param {'popup'|'settings'} pageScope 当前调用页面
 */
async function initNoticeBar(pageScope) {
  const GITHUB_NOTICE_URL = IS_DEV ? 'https://os9sur.github.io/mira-trans/notice.json' :
    'https://os9sur.github.io/MiraTranslator/assets/notice.json';

  let noticeData = null;
  let minDays = 0;
  let openReview = false;

  try {
    const resp = await fetch(`${GITHUB_NOTICE_URL}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) return;
    const json = await resp.json();
    if (!json.enabled) return;

    minDays = json.minDays ?? 0;

    const uiLang = chrome.i18n.getUILanguage().replace('_', '-');
    const langShort = uiLang.split('-')[0];

    noticeData = json[uiLang] || json[langShort] || json['en'] || null;
    if (!noticeData) return;

    // scope 未填默认 'both'，两个页面都显示
    const scope = noticeData.scope || 'both';
    if (scope !== 'both' && scope !== pageScope) return;

    openReview = noticeData.openReview || false;
    
    if (openReview && pageScope !== 'popup') return;
  } catch (e) {
    return;
  }

  const installData = await safeGetStorage('install_time');
  const installTime = installData?.install_time || Date.now();
  const daysSinceInstall = (Date.now() - installTime) / (1000 * 60 * 60 * 24);
  if (daysSinceInstall < minDays) return;

  // targetLangs 跟当前翻译目标语言相关，只在 popup 场景下有意义
  if (pageScope === 'popup' && noticeData.targetLangs?.length) {
    const currentTargetLang = (window.currentTargetL || '').split('-')[0].toLowerCase();
    if (!noticeData.targetLangs.includes(currentTargetLang)) return;
  }

  if (!noticeData?.id || !noticeData?.title) return;

  // dismissedKey 不带 pageScope 后缀：任一页面点了"知道了"，两边都不再弹
  const dismissedKey = NOTICE_DISMISSED_KEY + noticeData.id;
  const stored = await safeGetStorage(dismissedKey);
  if (stored?.[dismissedKey]) return;

  const bar = document.getElementById('noticeBar');
  const titleEl = document.getElementById('noticeTitleClip');
  const contentEl = document.getElementById('noticeContentText');
  const gotItBtn = document.getElementById('noticeGotItBtn');
  const expandBody = document.getElementById('noticeExpandedBody');
  const chevron = document.getElementById('noticeChevron');
  const dotEl = bar?.querySelector('[style*="border-radius: 50%"]');

  if (!bar || !titleEl || !contentEl || !gotItBtn || !expandBody || !chevron) return;

  // 应用主题配色
  const theme = NOTICE_THEMES[noticeData.level] || NOTICE_THEMES.warning;
  bar.style.borderColor = theme.border;
  if (dotEl) dotEl.style.background = theme.dot;
  titleEl.style.color = theme.title;
  chevron.style.color = theme.chevron;
  gotItBtn.style.color = theme.gotItColor;
  gotItBtn.style.borderColor = theme.gotItBorder;
  gotItBtn.style.background = theme.gotItBg;
  expandBody.style.borderColor = theme.divider;
  bar.style.setProperty('--notice-glow', theme.dot);

  const styleId = 'mira-notice-pulse-style';
  let styleEl = document.getElementById(styleId);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = styleId;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    @keyframes miraBorderPulse {
      0%,100% { border-color: ${theme.pulse[0]}; }
      50%      { border-color: ${theme.pulse[1]}; }
    }
  `;

  // 填入内容：优先渲染 contentList（列表形式），否则退回纯文本 content
  titleEl.textContent = noticeData.title;
  if (Array.isArray(noticeData.contentList) && noticeData.contentList.length) {
    contentEl.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'notice-content-list';
    noticeData.contentList.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      ul.appendChild(li);
    });
    contentEl.appendChild(ul);
  } else {
    contentEl.textContent = noticeData.content || '';
  }
  gotItBtn.textContent = noticeData.gotIt || t('btnGotIt', getBrowserLang() || 'en');

  bar.style.display = 'block';
  bar.classList.add('mira-pulsing');

  // 折叠行点击：展开 / 收起
document.getElementById('noticeCollapsedRow').addEventListener('click', () => {
    const isExpanded = expandBody.classList.contains('is-expanded');
    expandBody.classList.toggle('is-expanded', !isExpanded);
    expandBody.style.display = isExpanded ? 'none' : 'flex';
    chevron.style.transform = isExpanded ? '' : 'rotate(180deg)';
    titleEl.classList.toggle('notice-title-expanded', !isExpanded);
    if (!isExpanded) bar.classList.remove('mira-pulsing');
});

  // 知道了：持久化 + 按需跳转 + 淡出
  gotItBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await safeSetStorage({ [dismissedKey]: true });

    if (noticeData.link) {
      chrome.tabs.create({ url: noticeData.link });
    } else if (openReview && pageScope === 'popup') {
      chrome.tabs.create({ url: getReviewUrl() });
    }

    bar.style.transition = 'opacity 0.3s ease';
    bar.style.opacity = '0';
    setTimeout(() => { bar.style.display = 'none'; }, 300);
  });
}