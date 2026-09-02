/**
 * Mira Translator
 * Copyright (C) 2026 David Bai
 * Licensed under a custom Source-Available License.
 * Unauthorized modification, redistribution, or rebranding is
 * prohibited. See LICENSE file or:
 * https://github.com/os9sur/MiraTranslator/blob/main/LICENSE
 * Contact: mira.studio@proton.me
 */

document.addEventListener('DOMContentLoaded', async () => {
  const highlight = (text, query) => {
    if (!query || !text) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return String(text).replace(
      new RegExp(escaped, 'gi'),
      match => `<span style="background:#00fff5;color:#000000;border-radius:3px;padding:0 3px;">${match}</span>`
    );
  };

  const style = document.createElement('style');
  style.textContent = `
    @keyframes wave-ripple {
      0%   { transform: translate(-50%,-50%) scale(0.8); opacity: 0.8; border-width: 2px; }
      100% { transform: translate(-50%,-50%) scale(2.5); opacity: 0;   border-width: 1px; }
    }
    .is-speaking {
      position: relative;
      color: #38bdf8 !important;
      filter: drop-shadow(0 0 4px rgba(56,189,248,0.8));
      overflow: visible !important;
    }
    .is-speaking::before,
    .is-speaking::after {
      content: "";
      position: absolute;
      top: 50%; left: 50%;
      transform: translate(-50%, -50%);
      width: 100%; height: 100%;
      border: 1.5px solid #38bdf8;
      border-radius: 50%;
      pointer-events: none;
    }
    .is-speaking::before { animation: wave-ripple 1s cubic-bezier(0,0,.2,1) infinite; }
    .is-speaking::after  { animation: wave-ripple 1s cubic-bezier(0,0,.2,1) infinite .5s; }
  `;
  document.head.appendChild(style);

  const vocabBody = document.getElementById('vocabBody');
  const wordInp = document.getElementById('wordInp');
  const transInp = document.getElementById('transInp');
  const storage = await safeGetStorage('ui_language');

  requestAnimationFrame(() => {
    transInp.style.height = wordInp.offsetHeight + 'px';
    transInp.style.minHeight = wordInp.offsetHeight + 'px';
  });

  transInp.addEventListener('focus', () => { transInp.rows = 4; });
  transInp.addEventListener('blur', () => { if (!transInp.value.trim()) transInp.rows = 1; });
  transInp.addEventListener('input', () => {
    transInp.style.height = 'auto';
    transInp.style.height = transInp.scrollHeight + 'px';
  });

  const highlightStorage = await safeGetStorage('vocabHighlight');
  let highlightEnabled = highlightStorage?.vocabHighlight ?? true;



  const toggle = document.getElementById('highlightToggle');
  const thumb = document.getElementById('highlightThumb');

  const updateToggleUI = (enabled) => {
    toggle.style.background = enabled ? '#48f8389a' : '#334155';
    thumb.style.left = enabled ? '18px' : '2px';
  };

  updateToggleUI(highlightEnabled);
  toggle.onclick = async () => {
    highlightEnabled = !highlightEnabled;
    updateToggleUI(highlightEnabled);
    await safeSetStorage({ vocabHighlight: highlightEnabled });
  };

  if (storage === undefined) {
    if (typeof showUpdateNotice === 'function') showUpdateNotice();
    return;
  }

  const targetLanguage = storage?.ui_language || getBrowserLang() || 'en';
  const _t = (key) => (typeof t === 'function') ? t(key, targetLanguage) : key;
  const toggleAddBoxBtn = document.getElementById('toggleAddBox');
  toggleAddBoxBtn.title = _t('manualAdd');
  const syncRes = await safeGetStorage('lastSyncTime');
  if (syncRes?.lastSyncTime) {
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = `${_t('lastSync')} ${new Date(syncRes.lastSyncTime).toLocaleString()}`;
  }
  toggleAddBoxBtn.onclick = () => {
    const box = document.getElementById('addBox');
    const btn = document.getElementById('toggleAddBox');
    const isOpen = box.style.maxHeight !== '0px' && box.style.maxHeight !== '';

    if (isOpen) {
      // 折叠
      box.style.overflow = 'hidden';
      box.style.transition = 'none';
      requestAnimationFrame(() => {
        box.style.transition = 'max-height 0.3s ease, opacity 0.25s ease, padding 0.3s ease, margin 0.3s ease';
        requestAnimationFrame(() => {
          box.style.maxHeight = '0px';
          box.style.opacity = '0';
          box.style.padding = '0';
          box.style.margin = '0';
        });
      });
      btn.classList.remove('is-open');
    } else {
      // 展开
      box.style.maxHeight = '200px';
      box.style.opacity = '1';
      box.style.padding = '';
      box.style.marginBottom = '9px';
      setTimeout(() => {
        box.style.overflow = 'visible';
        box.style.transition = 'none';
      }, 300);
      btn.classList.add('is-open');

      requestAnimationFrame(() => {
        const h = wordInp.offsetHeight;
        transInp.style.height = h + 'px';
        transInp.style.minHeight = h + 'px';
        const computed = window.getComputedStyle(wordInp);
        transInp.style.paddingTop = computed.paddingTop;
        transInp.style.paddingBottom = computed.paddingBottom;
        transInp.style.lineHeight = computed.lineHeight;
      });
    }
  };
  document.title = `Mira - ${_t('wordBook', targetLanguage)}`;
  const normLang = targetLanguage.replace('_', '-').toLowerCase();
  document.documentElement.lang = normLang;
  if (typeof applyI18n === 'function') applyI18n(targetLanguage);
  document.documentElement.style.setProperty('--label-meaning', `"${_t('meaning')}"`);
  document.documentElement.style.setProperty('--label-note', `"${_t('note')}"`);
  document.documentElement.style.setProperty('--label-source', `"${_t('source')}"`);
  document.documentElement.style.setProperty('--label-time', `"${_t('addTime')}"`);

  function formatDetail(dictData, query = "") {
    if (!Array.isArray(dictData) || dictData.length === 0) return "";
    return dictData.map(item => {
      const pos = localizePos(item.pos, targetLanguage) || item.pos || "";
      let meanings = "";
      if (Array.isArray(item.meanings)) {
        meanings = item.meanings.join(', ');
      } else if (item.meanings) {
        meanings = item.meanings;
      } else if (item.definition) {
        meanings = item.definition;
      }
      return `
  <div class="v-detail-line" dir="ltr" style="margin-top: 2px; display: flex; gap: 6px;
    ${isRTLText(meanings) ? 'flex-direction: row-reverse; text-align: right;' : ''}">
    <span class="v-pos" style="color: #38bdf8; font-style: italic; font-size: 11px; min-width: 30px;">${pos}</span>
    <span class="v-def" style="color: #94a3b8;font-size: 14px;">${query ? highlight(meanings, query) : meanings}</span>
  </div>
`;
    }).join('');
  }

  function formatExamples(examples, word, query = "") {
    if (!Array.isArray(examples) || examples.length === 0) return "";
    const highlightWord = (text, w) => {
      if (!text || !w) return text;
      const safe = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const stem = w.length > 3 ? w.replace(/[ey]$/, "").replace(/([bcdfghjklmnpqrstvwxz])\1$/, "$1") : w;
      const safeStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`\\b(${safe}[a-z]*|${safeStem}[a-z]*)\\b`, "gi");
      return text.replace(regex, '<span style="color:#38bdf8;font-weight:600;">$1</span>');
    };
    return `
  <div class="v-examples-box" style="border-top: 1px solid #3f5374; padding-top: 6px; margin-top: 6px;">
    <div style="font-size: 11px; color: #475569; letter-spacing: 1px; margin-bottom: 6px; font-weight: bold;
      ${isRTLText(examples.map(s => typeof s === 'object' ? (s.cn || '') : '').join('')) ? 'text-align: right;' : ''}">
      EXAMPLES
    </div>
    ${examples.slice(0, 3).map((s) => {
      const en = typeof s === 'string' ? s : (s.en || s.sentence || "");
      const cn = typeof s === 'object' ? (s.cn || s.translation || "") : "";
      const safeEn = en.replace(/'/g, '&apos;').replace(/"/g, '&quot;');
      return `
        <div style="margin-bottom: 8px; border-inline-start: 2px solid #25cbf6ab; border-radius:1.5px; padding-inline-start: 8px;">
          <div dir="ltr" style="display:flex; align-items:center; gap:6px;">
            <div style="font-size: 13px; font-style: italic; color: #94a3b8; line-height: 1.4; flex: 1;">
              ${query ? highlight(en, query) : highlightWord(en, word)}
            </div>
            <span class="example-speaker-btn speaker-btn-sm" data-sentence="${safeEn}"
              style="cursor:pointer; color:#637793; flex-shrink:0; display:flex; transition:color 0.2s; position:relative; overflow:visible;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </span>
          </div>
          ${cn ? `<div dir="auto" style="font-size: 13px; color: #637793; margin-top: 2px;
            ${isRTLText(cn) ? 'text-align: right;' : ''}
          ">${query ? highlight(cn, query) : cn}</div>` : ""}
        </div>`;
    }).join("")}
  </div>`;
  }

  const searchInp = document.getElementById('searchInp');
  if (searchInp) {
    searchInp.oninput = (e) => {
      searchQuery = e.target.value.toLowerCase().trim();
      currentPage = 1;
      renderTable();
    };
  }

  let currentPage = 1;
  const pageSize = 10;
  let searchQuery = "";

  async function renderTable() {
    const vocabulary = await idb.vocabulary.getAll();
    let activeVocab = vocabulary.filter(item => item && !item.deleted && item.word);

    if (searchQuery) {
      activeVocab = activeVocab.filter(item => {
        const wordMatch = item.word.toLowerCase().includes(searchQuery);
        let transText = "";
        if (typeof item.trans === 'object' && item.trans !== null) {
          transText = (item.trans.basic || "") + (item.trans.detail || "");
          const examples = item.trans.examples || [];
          const exampleText = examples.map(s => {
            if (typeof s === 'string') return s;
            return (s.en || s.sentence || "") + " " + (s.cn || s.translation || "");
          }).join(" ");
          transText += " " + exampleText;
        } else {
          transText = item.trans || "";
        }
        const dictText = (item.trans?.dictData || []).map(d => {
          const meanings = Array.isArray(d.meanings) ? d.meanings.join(' ') : (d.meanings || d.definition || '');
          return meanings;
        }).join(' ');
        const noteMatch = (item.note || "").toLowerCase().includes(searchQuery);
        const srcMatch = (item.src || "").toLowerCase().includes(searchQuery);
        const titleMatch = searchQuery.length >= 2 ? (item.title || "").toLowerCase().includes(searchQuery) : false;
        const contextMatch = (typeof item.trans === 'object' ? (item.trans.context || "") : "").toLowerCase().includes(searchQuery);
        const contextTranslationMatch = (typeof item.trans === 'object' ? (item.trans.contextTranslation || "") : "").toLowerCase().includes(searchQuery);
        return wordMatch || transText.toLowerCase().includes(searchQuery) || dictText.toLowerCase().includes(searchQuery)
          || noteMatch || srcMatch || titleMatch || contextMatch || contextTranslationMatch;
      });
    }

    if (searchQuery) {
      activeVocab.sort((a, b) => {
        const aExact = a.word.toLowerCase() === searchQuery;
        const bExact = b.word.toLowerCase() === searchQuery;
        const aStarts = a.word.toLowerCase().startsWith(searchQuery);
        const bStarts = b.word.toLowerCase().startsWith(searchQuery);
        if (aExact && !bExact) return -1;
        if (!aExact && bExact) return 1;
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return (b.date || 0) - (a.date || 0);
      });
    } else {
      activeVocab.sort((a, b) => (b.date || 0) - (a.date || 0));
    }

    const total = activeVocab.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const start = (currentPage - 1) * pageSize;
    const pageData = activeVocab.slice(start, start + pageSize);

    const pageInfoEl = document.getElementById('pageInfo');
    if (pageInfoEl) {
      pageInfoEl.innerText = _t('pagination')
        .replace('{current}', currentPage)
        .replace('{total}', totalPages);
    }

    const goInputEl = document.getElementById('jumpInp');
    if (goInputEl) goInputEl.placeholder = _t('goPlaceholder');

    if (total === 0) {
      vocabBody.innerHTML = `
  <div style="padding: 32px; text-align: center; color: #475569;"> 
    <div style="font-size: 16px; font-weight: bold; margin-bottom: 12px; color: #94a3b8;">
      ${_t('noCollection')}
    </div> 
    <div style="display: inline-block; text-align: left; font-size: 15px; line-height: 1.8; color: #64748b; white-space: pre-line;">
      ${_t('noCollectionTip')}
    </div>
  </div>
`;
      return;
    }
    const isRTLUI = document.documentElement.lang === 'ar' || document.documentElement.lang === 'fa';
    vocabBody.innerHTML = pageData.map((item) => {
      const displayWord = item.word || "";
      const displayWordHL = searchQuery ? highlight(displayWord, searchQuery) : displayWord;
      const safeWordForSpeech = displayWord.replace(/'/g, "\\'");
      const context = (typeof item.trans === 'object') ? (item.trans.context || "") : "";

      const detectLangFromContext = (ctx) => {
        if (!ctx) return null;
        if (/[\u3040-\u30FF]/.test(ctx)) return "ja-JP";
        if (/[\uAC00-\uD7AF]/.test(ctx)) return "ko-KR";
        return null;
      };
      const contextLang = detectLangFromContext(context);
      const langMap = { ja: 'ja-JP', zh: 'zh-CN', ko: 'ko-KR', fr: 'fr-FR', de: 'de-DE', es: 'es-ES', ru: 'ru-RU', en: 'en-US' };
      const detectedLang = detectSourceLang(context || item.word || "");
      const langCode = detectedLang ? (langMap[detectedLang] || null) : null;

      const phonetic = (typeof item.trans === 'object' && item.trans !== null)
        ? (item.trans.phonetic || item.trans.sourcePhonetic || "") : "";
      const contextTranslation = (typeof item.trans === 'object') ? (item.trans.contextTranslation || "") : "";
      const contextWord = item.word || "";

      const highlightContext = (ctx, word) => {
        if (!ctx) return "";
        const safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return ctx.replace(new RegExp(`(${safe})`, "gi"), '<span style="color:#38bdf8;font-weight:600;">$1</span>');
      };

      let displayTrans = "";
      if (typeof item.trans === 'object' && item.trans !== null) {
        const { basic, dictData, detail, examples } = item.trans;
        const detailContent = dictData ? formatDetail(dictData, searchQuery) : (detail || "");
        const examplesContent = formatExamples(examples, displayWord, searchQuery);
        displayTrans = `
      <div class="vocab-trans-container" dir="auto">
        <div class="v-basic" style="font-weight:500;color:#e2e8f0;margin-bottom:4px;font-size:15px;
          ${isRTLText(basic || '') ? 'text-align:right;' : ''}">
          ${searchQuery ? highlight(basic || '', searchQuery) : (basic || '')}
        </div>
        ${detailContent ? `<div class="v-detail-box" style="border-top:1px solid #3f5374;padding-top:6px;margin-top:4px;">${detailContent}</div>` : ''}
        ${examplesContent}
      </div>`;
      } else {
        displayTrans = `<div class="v-basic" style="color:#e2e8f0;font-size:15px;
          ${isRTLText(item.trans || '') ? 'text-align:right;' : ''}">${item.trans || ''}</div>`;
      }

      const dateStr = item.date ? new Date(item.date).toLocaleString('en-CA', {
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false
      }) : "Unknown";

      let domain = '-';
      if (item.src) {
        try {
          const urlObj = new URL(item.src);
          const isYouTube = urlObj.hostname.includes('youtube.com');
          domain = urlObj.hostname.replace('www.', '');
          if (isYouTube) {
            const tParam = urlObj.searchParams.get('t');
            let timeLabel = "";
            if (tParam) {
              const totalSeconds = parseInt(tParam);
              const mins = Math.floor(totalSeconds / 60);
              const secs = totalSeconds % 60;
              timeLabel = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
            const titleText = item.title || '';
            domain = `
            <div class="source-wrapper">
              <a href="${item.src}" target="_blank" class="source-link" style="color:#ef4444;display:flex;align-items:center;gap:4px;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                <span style="font-weight:bold;font-family:monospace;">${timeLabel || 'Play'}</span>
              </a>
              <div class="source-title" dir="auto" style="${isRTLText(titleText) ? 'text-align:right;' : ''}" title="${titleText}">
                ${searchQuery ? highlight(titleText, searchQuery) : titleText}
              </div>
            </div>`;
          } else {
            const titleText = item.title || '';
            domain = `
            <div class="source-wrapper">
              <a href="${item.src}" target="_blank" class="source-link" style="color:#94a3b8;">🌐 ${domain}</a>
              <div class="source-title" dir="auto" style="${isRTLText(titleText) ? 'text-align:right;' : ''}" title="${titleText}">
                ${searchQuery ? highlight(titleText, searchQuery) : titleText}
              </div>
            </div>`;
          }
        } catch (e) {
          domain = `<a href="${item.src}" target="_blank" class="source-link">Link</a>`;
        }
      }

      // ── 行模板：tr/td → div.vocab-row / div.vocab-cell ──
      return `
    <div class="vocab-row">

      <div class="vocab-cell">
        <div class="word-row" style="display:flex; align-items:flex-start; gap:8px;
  ${isRTLUI ? 'flex-direction:row-reverse;justify-content:flex-end;' : ''}">
  <span class="word-text" dir="auto">${displayWordHL}</span>
  <span class="speaker-btn speaker-btn-lg" data-word="${safeWordForSpeech}" data-lang="${langCode}"
    style="cursor:pointer; color:#909fb3; display:flex; transition:color 0.2s; position:relative; overflow:visible; flex-shrink:0; margin-top:2px;">
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    </svg>
  </span>
</div>
        ${phonetic ? `<div style="color:#909fb3;font-size:12px;margin-top:4px;font-family:Consolas,Monaco,'Andale Mono','Ubuntu Mono',monospace;">[${phonetic.replace(/[\[\]]/g, '')}]</div>` : ''}
        ${phonetic ? `<div id="kana-${item.id}" style="display:none;font-size:12px;color:#7dd3fc;margin-top:2px;"></div>` : ''}
        ${context ? `
        <div style="margin-top:6px;font-size:12px;color:#798ca7;line-height:1.5;
                    border-top:2px solid #334155;padding-top:6px;font-style:italic;
                    word-break:break-word;">
          <div style="display:flex;align-items:flex-start;gap:6px;
            ${isRTLText(context) ? 'flex-direction:row-reverse;' : ''}">
            <div style="flex:1;${isRTLText(context) ? 'text-align:right;' : ''}" dir="auto">
              ${searchQuery ? highlight(context, searchQuery) : highlightContext(context, contextWord)}
            </div>
            <span class="context-speaker-btn speaker-btn-sm"
              data-sentence="${context.replace(/'/g, '&apos;').replace(/"/g, '&quot;')}"
              data-lang="${langCode}"
              style="cursor:pointer;color:#64748b;flex-shrink:0;display:flex;margin-top:1px;transition:color 0.2s;position:relative;overflow:visible;">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </span>
          </div>
          ${contextTranslation ? `
          <div dir="auto" style="font-size:12px;color:#98aac5;margin-top:3px;font-style:normal;opacity:0.8;
            ${isRTLText(contextTranslation) ? 'text-align:right;' : ''}">
            ${searchQuery ? highlight(contextTranslation, searchQuery) : contextTranslation}
          </div>` : ''}
        </div>` : ''}
      </div>

      <div class="vocab-cell">${displayTrans}</div>

      <div class="vocab-cell">
        ${item.note
          ? `<span class="note-text" dir="auto"
                  data-id="${item.id}" data-word="${displayWord}"
                  data-note="${(item.note || '').replace(/"/g, '&quot;')}"
                  style="color:#94a3b8;font-size:13px;cursor:pointer;display:block;word-break:break-word;white-space:normal;">
              ${searchQuery ? highlight(item.note, searchQuery) : item.note}
            </span>`
          : `<span class="note-text note-empty"
                data-id="${item.id}" data-word="${displayWord}" data-note=""
                style="direction:${isRTLText(_t('note')) ? 'rtl' : 'ltr'};">
              ＋ ${_t('note')}
            </span>`
        }
      </div>

      <div class="vocab-cell">${domain}</div>

      <div class="vocab-cell" style="color:#637793;font-size:12px;font-family:monospace;" dir="ltr">
        ${dateStr}
      </div>

      <div class="vocab-cell" id="action-cell-${item.id}">
        <button class="btn btn-danger delete-btn" data-id="${item.id}" data-word="${displayWord}">
          ${_t('delete')}
        </button>
      </div>

    </div>`.trim();
    }).join('');

    // 日语假名异步填充
    pageData.forEach(item => {
      const phonetic = (typeof item.trans === 'object' && item.trans !== null)
        ? (item.trans.phonetic || item.trans.sourcePhonetic || '') : '';
      const context = (typeof item.trans === 'object') ? (item.trans.context || '') : '';
      const isJapanese = item.trans?.sourceLang === 'ja' ||
        /[\u3040-\u30FF]/.test(item.word || '') || /[\u3040-\u30FF]/.test(context || '');
      if (!phonetic || !isJapanese) return;
      const kanaEl = document.getElementById(`kana-${item.id}`);
      if (!kanaEl) return;
      getKana(phonetic).then(({ hiragana, katakana }) => {
        if (!hiragana) return;
        kanaEl.innerHTML = `
          <span style="cursor:pointer;user-select:none;" title="${_t('toggleKatakana')}"
                data-hiragana="${hiragana}" data-katakana="${katakana}" data-mode="hiragana">
            ${hiragana}
          </span>`;
        kanaEl.style.display = 'block';
        kanaEl.querySelector('span').onclick = (e) => {
          const el = e.currentTarget;
          if (el.dataset.mode === 'hiragana') { el.innerText = el.dataset.katakana; el.dataset.mode = 'katakana'; }
          else { el.innerText = el.dataset.hiragana; el.dataset.mode = 'hiragana'; }
        };
      });
    });

    document.querySelectorAll('.btn-danger').forEach(btn => {
      btn.onclick = (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        const word = e.currentTarget.getAttribute('data-word');
        deleteWord(id, word);
      };
    });

    document.querySelectorAll('.speaker-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const word = e.currentTarget.getAttribute('data-word');
        const lang = e.currentTarget.getAttribute('data-lang');
        const finalLang = (!lang || lang === 'null') ? null : lang;
        speakText(word, e.currentTarget, finalLang);
      };
    });

    document.querySelectorAll('.context-speaker-btn').forEach(btn => {
      btn.addEventListener("mouseenter", () => { btn.style.color = "#38bdf8"; btn.style.filter = "drop-shadow(0 0 4px rgba(56,189,248,0.6))"; });
      btn.addEventListener("mouseleave", () => { btn.style.color = "#64748b"; btn.style.filter = ""; });
      btn.onclick = (e) => {
        e.stopPropagation();
        const sentence = e.currentTarget.getAttribute('data-sentence');
        const lang = e.currentTarget.getAttribute('data-lang');
        const finalLang = (!lang || lang === 'null') ? null : lang;
        btn.style.transform = "scale(0.8)"; btn.style.color = "#38bdf8";
        btn.style.filter = "drop-shadow(0 0 6px rgba(56,189,248,0.9))";
        setTimeout(() => { btn.style.transform = "scale(1)"; }, 150);
        speakText(sentence, btn, null);
      };
    });

    document.querySelectorAll('.example-speaker-btn').forEach(btn => {
      btn.addEventListener("mouseenter", () => { btn.style.color = "#38bdf8"; btn.style.filter = "drop-shadow(0 0 4px rgba(56,189,248,0.6))"; });
      btn.addEventListener("mouseleave", () => { btn.style.color = "#637793"; btn.style.filter = ""; });
      btn.onclick = (e) => {
        e.stopPropagation();
        const sentence = e.currentTarget.getAttribute('data-sentence');
        btn.style.transform = "scale(0.8)"; btn.style.color = "#38bdf8";
        btn.style.filter = "drop-shadow(0 0 6px rgba(56,189,248,0.9))";
        setTimeout(() => { btn.style.transform = "scale(1)"; }, 150);
        speakText(sentence, btn);
      };
    });

    document.querySelectorAll('.note-text').forEach(el => {
      el.onclick = () => {
        const id = el.getAttribute('data-id');
        const word = el.getAttribute('data-word');
        const current = el.getAttribute('data-note') || '';
        const cell = el.closest('.vocab-cell');
        if (!cell) return;
        cell.innerHTML = `
        <textarea class="note-inp" maxlength="500" dir="auto"
          placeholder="${_t('notePlaceholder')}"
          style="background:#020617;border:none;color:white;padding:4px 8px;border-radius:6px;
          width:100%;font-size:12px;box-sizing:border-box;resize:vertical;min-height:32px;
          font-family:system-ui,-apple-system,sans-serif;outline:none;
          direction:${document.documentElement.lang === 'ar' || document.documentElement.lang === 'fa' ? 'rtl' : 'ltr'};
          text-align:${document.documentElement.lang === 'ar' || document.documentElement.lang === 'fa' ? 'right' : 'left'};
          box-shadow:0 0 0 1px rgba(56,189,248,0.8),0 0 6px rgba(56,189,248,0.6),
                     0 0 12px rgba(56,189,248,0.4),0 0 20px rgba(56,189,248,0.2),
                     0 0 35px rgba(56,189,248,0.1);"
          rows="3">${current}</textarea>`;
        const inp = cell.querySelector('.note-inp');
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
        const autoResize = () => { inp.style.height = 'auto'; inp.style.height = inp.scrollHeight + 'px'; };
        autoResize();
        inp.oninput = autoResize;
        const save = async () => {
          const newNote = inp.value.trim();
          const entry = await idb.vocabulary.get(word);
          if (entry) { entry.note = newNote; entry.updated = Date.now(); await idb.vocabulary.add(word, entry); }
          renderTable();
        };
        inp.onblur = save;
        inp.onkeydown = (e) => { if (e.key === 'Enter') inp.blur(); if (e.key === 'Escape') renderTable(); };
      };
    });
  }

  document.getElementById('prevPage').onclick = () => {
    if (currentPage > 1) { currentPage--; renderTable(); }
  };

  document.getElementById('nextPage').onclick = async () => {
    const vocabulary = await idb.vocabulary.getAll();
    const activeCount = vocabulary.filter(v => !v.deleted).length;
    const totalPages = Math.ceil(activeCount / pageSize);
    if (currentPage < totalPages) { currentPage++; renderTable(); }
  };

  document.getElementById('jumpInp').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    const vocabulary = await idb.vocabulary.getAll();
    const activeCount = vocabulary.filter(v => !v.deleted).length;
    const totalPages = Math.ceil(activeCount / pageSize) || 1;
    const val = parseInt(e.target.value);
    if (!isNaN(val) && val >= 1 && val <= totalPages) {
      currentPage = val;
      e.target.value = '';
      renderTable();
    }
  });

  const undoTimers = {};

  async function deleteWord(id, word) {
    const cell = document.getElementById(`action-cell-${id}`);
    if (!cell) return;
    const originalContent = cell.innerHTML;
    let secondsLeft = 3;
    try {
      const entry = await idb.vocabulary.get(word);
      if (entry) { entry.deleted = true; entry.updated = Date.now(); await idb.vocabulary.add(word, entry); }

      const updateUndoUI = (secs) => {
        cell.innerHTML = `
          <div class="undo-container">
            <span class="delete-countdown">${secs}s</span>
            <a href="javascript:void(0)" class="undo-link">${_t('recall')}</a>
          </div>`;
        cell.querySelector('.undo-link').onclick = async (e) => {
          e.preventDefault();
          clearInterval(countdownInterval);
          if (undoTimers[id]) { clearTimeout(undoTimers[id]); delete undoTimers[id]; }
          const backEntry = await idb.vocabulary.get(word);
          if (backEntry) { backEntry.deleted = false; backEntry.updated = Date.now(); await idb.vocabulary.add(word, backEntry); }
          cell.innerHTML = originalContent;
          const btn = cell.querySelector('.btn-danger');
          if (btn) btn.onclick = () => deleteWord(id, word);
          // 恢复高亮
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, { type: "VOCAB_ADD_HIGHLIGHT", word });
          }
        };
      };

      updateUndoUI(secondsLeft);
      const countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) updateUndoUI(secondsLeft);
        else clearInterval(countdownInterval);
      }, 1000);

      undoTimers[id] = setTimeout(async () => {
        // 通知 content script 移除高亮
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          chrome.tabs.sendMessage(tab.id, { type: "VOCAB_REMOVE_HIGHLIGHT", word });
        }
        // ── tr → .vocab-row ──
        const row = cell.closest('.vocab-row');
        if (row) {
          row.style.opacity = '0';
          row.style.transform = 'translateX(20px)';
          row.style.transition = 'opacity 0.4s ease-out, transform 0.4s ease-out';
          setTimeout(() => {
            row.style.maxHeight = row.offsetHeight + 'px';
            row.style.overflow = 'hidden';
            row.style.transition = 'max-height 0.3s ease-in-out';
            requestAnimationFrame(() => { row.style.maxHeight = '0'; });
            setTimeout(() => { row.remove(); delete undoTimers[id]; }, 300);
          }, 400);
        }
      }, 3500);
    } catch (err) {
      logger.error("Delete failed:", err);
      cell.innerHTML = originalContent;
    }
  }
  function updateNbSyncUI(btnId, active) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (!active) {
      btn.classList.remove('syncing');
      btn.disabled = false;
      return;
    }
    btn.classList.add('syncing');
    btn.disabled = true;
  }

  async function notebookSync(direction) {
    const btnId = direction === 'push' ? 'nbSyncPush' : 'nbSyncPull';
    updateNbSyncUI(btnId, true);
    try {
      const res = await chrome.runtime.sendMessage({ type: 'SYNC_DATA', direction });
      // 未配置同步方式
      if (res?.error?.includes('configure')) {
        const hint = document.getElementById('syncHint');
        if (hint) {
          hint.textContent = _t('notice.config') || 'Please configure your sync method in the main interface first.';
          hint.style.maxHeight = '20px';
          hint.style.marginBottom = '3px';
          hint.style.opacity = '1';
          setTimeout(() => {
            hint.style.opacity = '0';
            hint.style.maxHeight = '0';
            hint.style.marginBottom = '0';
          }, 3000);
        }
        updateNbSyncUI(btnId, false);
        return;
      }
      // 需要重新认证
      if (res?.error?.includes('Unauthorized') || res?.error?.includes('reauth_required')) {
        // 根据同步方式选择认证类型
        const configData = await chrome.storage.local.get('syncConfig');
        const method = configData?.syncConfig?.method;
        const authType = method === 'oneDrive' ? 'AUTH_ONEDRIVE' : 'AUTH_GOOGLE';

        const authRes = await chrome.runtime.sendMessage({ type: authType });
        if (authRes?.success) {
          // 认证成功后自动重试同步
          const retryRes = await chrome.runtime.sendMessage({ type: 'SYNC_DATA', direction });
          const scroller = document.getElementById(btnId)?.querySelector('.sync-log-scroller');
          if (scroller) {
            scroller.innerHTML = `<div style="font-size:13px;">${retryRes?.success ? '✅' : '❌'}</div>`;
          }
          if (retryRes?.success && direction === 'pull') {
            await renderTable();
          }
          setTimeout(() => {
            if (scroller) scroller.innerHTML = '';
            updateNbSyncUI(btnId, false);
          }, 2000);
          return;
        } else {
          // 认证失败，提示用户去 popup 认证
          const scroller = document.getElementById(btnId)?.querySelector('.sync-log-scroller');
          if (scroller) {
            scroller.innerHTML = `<div style="font-size:12px; color:#f87171;">请先在插件主界面完成账号授权</div>`;
          }
          setTimeout(() => {
            if (scroller) scroller.innerHTML = '';
            updateNbSyncUI(btnId, false);
          }, 3000);
          return;
        }
      }

      const scroller = document.getElementById(btnId)?.querySelector('.sync-log-scroller');
      if (scroller) {
        scroller.innerHTML = `<div style="font-size:13px;">${res?.success ? '✅' : '❌'}</div>`;
      }
      setTimeout(() => {
        if (scroller) scroller.innerHTML = '';
        updateNbSyncUI(btnId, false);
      }, 2000);

    } catch (e) {
      logger.error('[notebookSync]', e);
      updateNbSyncUI(btnId, false);
    }
  }

  document.getElementById('nbSyncPush').onclick = () => notebookSync('push');
  document.getElementById('nbSyncPull').onclick = () => notebookSync('pull');
  document.getElementById('addBtn').onclick = async () => {
    const word = wordInp.value.trim();
    const trans = transInp.value.trim();
    if (!word || !trans) return alert(_t('completeContent'));
    await idb.vocabulary.add(word, { trans });
    wordInp.value = ''; transInp.value = '';
    renderTable();
    // 添加成功后收起
    document.getElementById('addBox').style.display = 'none';
    document.getElementById('toggleAddBox').textContent = '＋';
  };

  document.getElementById('exportBtn').onclick = async () => {
    const vocabulary = await idb.vocabulary.getAll();
    const activeVocab = vocabulary.filter(item => !item.deleted);
    if (activeVocab.length === 0) return alert(_t('noExportWords') || "No data to export");
    activeVocab.sort((a, b) => (b.date || 0) - (a.date || 0));
    let csvContent = `\ufeff${_t('word')},${_t('meaning')},${_t('note')},Context,Source,URL,${_t('addTime')}\n`;
    activeVocab.forEach(item => {
      let transText = "";
      if (typeof item.trans === 'object' && item.trans !== null) {
        const basic = item.trans.basic || "";
        let detail = "";
        if (Array.isArray(item.trans.dictData)) {
          detail = item.trans.dictData.map(d => {
            const pos = d.pos ? `${d.pos} ` : "";
            const meanings = Array.isArray(d.meanings) ? d.meanings.join(' ') : (d.meanings || d.definition || "");
            return `${pos}${meanings}`;
          }).join(' | ');
        }
        transText = basic + (detail ? ` [${detail}]` : "");
        if (Array.isArray(item.trans.examples) && item.trans.examples.length > 0) {
          const exampleText = item.trans.examples.slice(0, 3).map(s => {
            const en = typeof s === 'string' ? s : (s.en || s.sentence || "");
            const cn = typeof s === 'object' ? (s.cn || s.translation || "") : "";
            return cn ? `${en} (${cn})` : en;
          }).join(' / ');
          transText += ` | Examples: ${exampleText}`;
        }
      } else {
        transText = item.trans || "";
      }
      const context = item.trans?.context || "";
      const contextTranslation = item.trans?.contextTranslation || "";
      const contextText = context ? (contextTranslation ? `${context} (${contextTranslation})` : context) : "";
      const safeWord = (item.word || "").replace(/"/g, '""');
      const safeTrans = transText.replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');
      const safeNote = (item.note || "").replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');
      const safeTitle = (item.title || "").replace(/"/g, '""');
      const safeUrl = (item.src || "").replace(/"/g, '""');
      const safeContext = contextText.replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');
      const time = new Date(item.date).toLocaleString().replace(/,/g, ' ');
      csvContent += `"${safeWord}","${safeTrans}","${safeNote}","${safeContext}","${safeTitle}","${safeUrl}","${time}"\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${_t('wordBook') || 'Vocabulary'}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.lastSyncTime) {
      renderTable();
      const el = document.getElementById('syncStatus');
      if (el) el.textContent = `${_t('lastSync') || 'Last Sync'} ${new Date(changes.lastSyncTime.newValue).toLocaleString()}`;
    }
  });

  // 鼠标手势
  let mouseGesture = { active: false, startX: 0, startY: 0 };
  let gesturePath = null, gestureArrow = null, gestureLabel = null, gestureSvg = null, gesturePoints = [];

  function createGestureOverlay() {
    gestureSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(gestureSvg.style, { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 99999 });
    gesturePath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    gesturePath.setAttribute('fill', 'none');
    gesturePath.setAttribute('stroke', '#39ff14');
    gesturePath.setAttribute('stroke-width', '2.5');
    gesturePath.setAttribute('stroke-linecap', 'round');
    gesturePath.setAttribute('stroke-linejoin', 'round');
    gesturePath.setAttribute('opacity', '0.85');
    gestureSvg.appendChild(gesturePath);
    document.body.appendChild(gestureSvg);

    gestureArrow = document.createElement('div');
    Object.assign(gestureArrow.style, { position: 'fixed', pointerEvents: 'none', zIndex: 100000, fontSize: '28px', lineHeight: 1, opacity: 0, transition: 'opacity 0.15s', filter: 'drop-shadow(0 0 6px #39ff14)', color: '#39ff14' });
    document.body.appendChild(gestureArrow);

    gestureLabel = document.createElement('div');
    Object.assign(gestureLabel.style, { position: 'fixed', pointerEvents: 'none', zIndex: 100000, fontSize: '13px', fontFamily: 'monospace', color: '#39ff14', opacity: 0, transition: 'opacity 0.15s', background: 'rgba(0,0,0,0.55)', padding: '3px 10px', borderRadius: '6px', border: '1px solid #39ff1455', letterSpacing: '0.04em', filter: 'drop-shadow(0 0 4px #39ff1488)' });
    document.body.appendChild(gestureLabel);
  }

  function removeGestureOverlay() {
    gestureSvg?.remove(); gestureArrow?.remove(); gestureLabel?.remove();
    gestureSvg = gesturePath = gestureArrow = gestureLabel = null;
    gesturePoints = [];
  }

  function updateGestureUI(curX, curY) {
    if (!gesturePath) return;
    gesturePoints.push(`${curX},${curY}`);
    gesturePath.setAttribute('points', gesturePoints.join(' '));
    const dy = curY - mouseGesture.startY;
    const dx = curX - mouseGesture.startX;
    const isVertical = Math.abs(dy) > Math.abs(dx);
    const triggered = Math.abs(dy) >= 60 && isVertical;
    if (triggered) {
      gestureArrow.textContent = dy < 0 ? '↑' : '↓';
      gestureArrow.style.opacity = '0';
      gestureArrow.style.left = `${curX + 16}px`;
      gestureArrow.style.top = `${curY - 18}px`;
      gestureLabel.textContent = dy < 0 ? '⬆ Scroll to Top of notebook' : '⬇ Scroll to Bottom of notebook';
      gestureLabel.style.opacity = '1';
      gestureLabel.style.left = `${curX + 16}px`;
      gestureLabel.style.top = `${curY + 10}px`;
    } else {
      gestureArrow.style.opacity = '0';
      gestureLabel.style.opacity = '0';
    }
  }

  //鼠标手势
  let gestureDidMove = false;

  if (!isEdgeBrowser()) {
    document.addEventListener('mousedown', (e) => {
      if (e.button !== 2) return;
      gestureDidMove = false;  // 重置
      mouseGesture.active = true;
      mouseGesture.startX = e.clientX;
      mouseGesture.startY = e.clientY;
      gesturePoints = [];
      createGestureOverlay();
      updateGestureUI(e.clientX, e.clientY);
    });

    document.addEventListener('mousemove', (e) => {
      if (!mouseGesture.active) return;
      const dy = e.clientY - mouseGesture.startY;
      const dx = e.clientX - mouseGesture.startX;
      if (Math.abs(dy) >= 10 || Math.abs(dx) >= 10) gestureDidMove = true;
      updateGestureUI(e.clientX, e.clientY);
    });

    document.addEventListener('mouseup', (e) => {
      if (!mouseGesture.active || e.button !== 2) return;
      const dy = e.clientY - mouseGesture.startY;
      const dx = e.clientX - mouseGesture.startX;
      mouseGesture.active = false;
      removeGestureOverlay();
      if (Math.abs(dy) < 60 || Math.abs(dx) > Math.abs(dy)) return;
      if (dy < 0) window.scrollTo({ top: 0, behavior: 'smooth' });
      else window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });
  }

  document.addEventListener('contextmenu', (e) => {
    if (gestureDidMove) {
      e.preventDefault();  // 拖动过就不出菜单
      gestureDidMove = false;
    }
  });

  function appendDots() {
    ['wordInp', 'transInp'].forEach(id => {
      const el = document.getElementById(id);
      if (el && el.placeholder && !el.placeholder.endsWith('...')) el.placeholder += '...';
    });
  }

  applyI18n(targetLanguage);
  appendDots();
  renderTable();
});