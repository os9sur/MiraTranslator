/**
 * Mira Translator
 * Copyright (C) 2026 David Bai 
 * License: AGPL-3.0 (https://github.com/os9sur)
 * Contact: mira.studio@proton.me
 */

// notice.js —— popup.html 与 engineSettings.html 共用

const NOTICE_DISMISSED_KEY = 'mira_notice_dismissed_v';

/**
 * @param {'popup'|'settings'} pageScope 当前调用页面
 */
async function initNoticeBar(pageScope) {
  const GITHUB_NOTICE_URL = IS_DEV ? 'https://os9sur.github.io/mira-trans/notice.json' :
    'https://os9sur.github.io/MiraTranslator/assets/notice.json';

  let json = null;
  try {
    const resp = await fetch(`${GITHUB_NOTICE_URL}?t=${Date.now()}`, { cache: 'no-cache' });
    if (!resp.ok) return;
    json = await resp.json();
  } catch (e) {
    return;
  }

  const uiLang = chrome.i18n.getUILanguage().replace('_', '-');
  const langShort = uiLang.split('-')[0];

  const installData = await safeGetStorage('install_time');
  const installTime = installData?.install_time || Date.now();
  const daysSinceInstall = (Date.now() - installTime) / (1000 * 60 * 60 * 24);

  // 从某个区块（guide 或 notices）里取出该区块的语言数组
  // section 内部自带 enabled / minDays，不满足直接返回空数组
  function getLangList(section) {
    if (!section || section.enabled === false) return [];
    const minDays = section.minDays ?? 0;
    if (daysSinceInstall < minDays) return [];
    return section[uiLang] || section[langShort] || section['en'] || [];
  }

  function isEligible(item) {
    if (!item?.id || !item?.title) return false;
    const scope = item.scope || 'both';
    if (scope !== 'both' && scope !== pageScope) return false;
    if (pageScope === 'popup' && item.targetLangs?.length) {
      const currentTargetLang = (window.currentTargetL || '').split('-')[0].toLowerCase();
      if (!item.targetLangs.includes(currentTargetLang)) return false;
    }
    if (item.openReview && pageScope !== 'popup') return false;
    return true;
  }

function dismissedKeyOf(item) {
  const scope = item.scope || 'both';
  const suffix = scope === 'both' ? 'both' : scope;
  return `${NOTICE_DISMISSED_KEY}${item.id}_${suffix}`;
}

// 兼容旧版本：scope 为 both 的通知曾经按 popup/settings 分别存 dismiss 状态，
// 检查旧 key，命中则视为已 dismiss，并迁移到新的统一 key，避免老用户重复看到已关闭的通知
async function isDismissed(item) {
  const key = dismissedKeyOf(item);
  const stored = await safeGetStorage(key);
  if (stored?.[key]) return true;

  const scope = item.scope || 'both';
  if (scope === 'both') {
    const legacyKey = `${NOTICE_DISMISSED_KEY}${item.id}_${pageScope}`;
    const legacyStored = await safeGetStorage(legacyKey);
    if (legacyStored?.[legacyKey]) {
      // 迁移到新 key，下次两个页面都能直接命中新 key
      await safeSetStorage({ [key]: true });
      return true;
    }
  }

  return false;
}

  async function findFirstShowable(list) {
    for (const item of list) {
      if (!isEligible(item)) continue;
      if (await isDismissed(item)) continue;
      return item;
    }
    return null;
  }

  const guideList = getLangList(json.guide);
  const noticeList = getLangList(json.notices);

  // 优先级：guide 优先于 notices
  let noticeData = await findFirstShowable(guideList);
  if (!noticeData) {
    noticeData = await findFirstShowable(noticeList);
  }
  if (!noticeData) return;

  const openReview = noticeData.openReview || false;

  // ---- 渲染逻辑 ----
  const bar = document.getElementById('noticeBar');
  const titleEl = document.getElementById('noticeTitleClip');
  const contentEl = document.getElementById('noticeContentText');
  const gotItBtn = document.getElementById('noticeGotItBtn');
  const expandBody = document.getElementById('noticeExpandedBody');
  const chevron = document.getElementById('noticeChevron');
  const dotEl = bar?.querySelector('[style*="border-radius: 50%"]');

  if (!bar || !titleEl || !contentEl || !gotItBtn || !expandBody || !chevron) return;

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

  document.getElementById('noticeCollapsedRow').addEventListener('click', () => {
    const isExpanded = expandBody.classList.contains('is-expanded');
    expandBody.classList.toggle('is-expanded', !isExpanded);
    expandBody.style.display = isExpanded ? 'none' : 'flex';
    chevron.style.transform = isExpanded ? '' : 'rotate(180deg)';
    titleEl.classList.toggle('notice-title-expanded', !isExpanded);
    if (!isExpanded) bar.classList.remove('mira-pulsing');
  });

  gotItBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const key = dismissedKeyOf(noticeData);
    await safeSetStorage({ [key]: true });

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