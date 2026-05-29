/**
 * Mira Translator
 * Copyright (C) 2026 David Bai (Mira Studio)
 * License: AGPL-3.0 (https://github.com/os9sur)
 * Contact: mira.studio@proton.me
 */

document.addEventListener('DOMContentLoaded', async () => {
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
  // 读取高亮开关状态
  const highlightStorage = await safeGetStorage('vocabHighlight');
  let highlightEnabled = highlightStorage?.vocabHighlight || false;

  const toggle = document.getElementById('highlightToggle');
  const thumb = document.getElementById('highlightThumb');

  const updateToggleUI = (enabled) => {
    toggle.style.background = enabled ? '#48f838' : '#334155';
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
  const targetLanguage =
    storage?.ui_language ||
    getBrowserLang() ||
    'en';
  const _t = (key) => {
    return (typeof t === 'function') ? t(key, targetLanguage) : key;
  };

  const titleSuffix = _t('wordBook', targetLanguage);
  document.title = `Mira - ${titleSuffix}`;
  const normLang = targetLanguage.replace('_', '-').toLowerCase();
  document.documentElement.lang = normLang;
  if (typeof applyI18n === 'function') {
    applyI18n(targetLanguage);
  }
  function formatDetail(dictData) {
    if (!Array.isArray(dictData) || dictData.length === 0) return "";
    return dictData.map(item => {
      const pos = localizePos(item.pos, targetLanguage) || item.pos || "";

      // 兼容 meanings（数组）和 definition（字符串）两种格式
      let meanings = "";
      if (Array.isArray(item.meanings)) {
        meanings = item.meanings.join(', ');
      } else if (item.meanings) {
        meanings = item.meanings;
      } else if (item.definition) {
        meanings = item.definition;
      }

      return `
      <div class="v-detail-line" style="margin-top: 2px; display: flex; gap: 6px;">
        <span class="v-pos" style="color: #38bdf8; font-style: italic; font-size: 11px; min-width: 30px;">${pos}</span>
        <span class="v-def" style="color: #94a3b8;">${meanings}</span>
      </div>
    `;
    }).join('');
  }

  function formatExamples(examples) {
    if (!Array.isArray(examples) || examples.length === 0) return "";
    return `
    <div class="v-examples-box" style="border-top: 1px solid #3f5374; padding-top: 6px; margin-top: 6px;">
      <div style="font-size: 10px; color: #475569; letter-spacing: 1px; margin-bottom: 6px; font-weight: bold;">EXAMPLES</div>
      ${examples.slice(0, 3).map((s, idx) => {
      const en = typeof s === 'string' ? s : (s.en || s.sentence || "");
      const cn = typeof s === 'object' ? (s.cn || s.translation || "") : "";
      const safeEn = en.replace(/'/g, '&apos;').replace(/"/g, '&quot;');
      return `
          <div style="margin-bottom: 8px; border-left: 2px solid #25cbf6ab;border-radius:2px; padding-left: 8px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <div style="font-size: 12px; font-style: italic; color: #94a3b8; line-height: 1.4;">${en}</div>
              <span class="example-speaker-btn" data-sentence="${safeEn}"
                style="cursor:pointer; color:#637793; flex-shrink:0; display:flex; transition:color 0.2s;position:relative;overflow:visible;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              </span>
            </div>
            ${cn ? `<div style="font-size: 12px; color: #7589a4; margin-top: 2px;">${cn}</div>` : ""}
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
          transText = (item.trans.basic || "") + (item.trans.detail || "") + JSON.stringify(item.trans.dictData || "");

          // 例句原文和译文
          const examples = item.trans.examples || [];
          const exampleText = examples.map(s => {
            if (typeof s === 'string') return s;
            return (s.en || s.sentence || "") + " " + (s.cn || s.translation || "");
          }).join(" ");
          transText += " " + exampleText;

        } else {
          transText = item.trans || "";
        }

        const noteMatch = (item.note || "").toLowerCase().includes(searchQuery);  //  备注
        const srcMatch = (item.src || "").toLowerCase().includes(searchQuery);    //  来源URL
        const titleMatch = (item.title || "").toLowerCase().includes(searchQuery); // 来源标题
        const contextMatch = (typeof item.trans === 'object' ? (item.trans.context || "") : "").toLowerCase().includes(searchQuery); // context
        return wordMatch || transText.toLowerCase().includes(searchQuery) || noteMatch || srcMatch || titleMatch || contextMatch;
      });
    }
    activeVocab.sort((a, b) => (b.date || 0) - (a.date || 0));
    const total = activeVocab.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const start = (currentPage - 1) * pageSize;
    const pageData = activeVocab.slice(start, start + pageSize);
    const pageInfoEl = document.getElementById('pageInfo');
    if (pageInfoEl) {
      pageInfoEl.innerText = `Page ${currentPage} / ${totalPages}`;
    }
    if (total === 0) {
      vocabBody.innerHTML = `<tr><td colspan="5" class="empty">${_t('noCollection')}</td></tr>`;
      return;
    }
    vocabBody.innerHTML = pageData.map((item) => {
      const displayWord = item.word || "";
      const safeWordForSpeech = displayWord.replace(/'/g, "\\'");
      const srcLang = item.trans?.sourceLang || "";
      const langCode = srcLang.startsWith("ja") ? "ja-JP"
        : srcLang.startsWith("zh") ? "zh-CN"
          : srcLang.startsWith("ko") ? "ko-KR"
            : "en-US";
      const phonetic = (typeof item.trans === 'object' && item.trans !== null)
        ? (item.trans.phonetic || item.trans.sourcePhonetic || "")
        : "";//音标
      const context = (typeof item.trans === 'object') ? (item.trans.context || "") : "";
      const contextTranslation = (typeof item.trans === 'object') ? (item.trans.contextTranslation || "") : "";
      const contextWord = item.word || "";

      // 高亮单词
      const highlightContext = (ctx, word) => {
        if (!ctx) return "";
        const safe = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        return ctx.replace(
          new RegExp(`(${safe})`, "gi"),
          '<span style="color:#38bdf8;font-weight:600;">$1</span>'
        );
      };
      let displayTrans = "";
      if (typeof item.trans === 'object' && item.trans !== null) {
        const { basic, dictData, detail, examples } = item.trans;
        const detailContent = dictData ? formatDetail(dictData) : (detail || "");
        const examplesContent = formatExamples(examples);
        displayTrans = `
      <div class="vocab-trans-container">
        <div class="v-basic" style="font-weight: 600; color: #e2e8f0; margin-bottom: 4px; font-size: 15px;">${basic || ''}</div>
        ${detailContent ? `<div class="v-detail-box" style="border-top: 1px solid #3f5374; padding-top: 6px; margin-top: 4px;">${detailContent}</div>` : ''}
        ${examplesContent}
      </div>
    `;
      } else {
        displayTrans = `<div class="v-basic" style="color: #e2e8f0; font-size: 15px;">${item.trans || ''}</div>`;
      }
      const dateStr = item.date ? new Date(item.date).toLocaleString() : "Unknown";
      let domain = '-';
      if (item.src) {
        try {
          const urlObj = new URL(item.src);
          const isYouTube = urlObj.hostname.includes('youtube.com');
          domain = urlObj.hostname.replace('www.', '');
          if (isYouTube) {
            const t = urlObj.searchParams.get('t');
            let timeLabel = "";
            if (t) {
              const totalSeconds = parseInt(t);
              const mins = Math.floor(totalSeconds / 60);
              const secs = totalSeconds % 60;
              timeLabel = `${mins}:${secs.toString().padStart(2, '0')}`;
            }
            domain = `
              <div class="source-wrapper">
                <a href="${item.src}" target="_blank" class="source-link" style="color: #ef4444; display: flex; align-items: center; gap: 4px;">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                  <span style="font-weight: bold; font-family: monospace;">${timeLabel || 'Play'}</span>
                </a>
                <div class="source-title" title="${item.title || ''}">${item.title || ''}</div>
              </div>
            `;
          } else {
            domain = `
        <div class="source-wrapper">
          <a href="${item.src}" target="_blank" class="source-link" style="color: #94a3b8;">🌐 ${domain}</a>
          <div class="source-title" title="${item.title || ''}">${item.title || ''}</div>
        </div>
      `;
          }
        } catch (e) {
          domain = `<a href="${item.src}" target="_blank" class="source-link">Link</a>`;
        }
      }
      return `
        <tr style="border-bottom: 1px solid #1e293b;">
          <td style="vertical-align: top; padding: 12px 16px;width: 230px; min-width: 250px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="word-text">${displayWord}</span>
            <span class="speaker-btn" data-word="${safeWordForSpeech}" data-lang="${langCode}" 
              style="cursor: pointer; color: #909fb3; display: flex; transition: color 0.2s;position:relative;overflow:visible;">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" 
                  stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
              </svg>
            </span>
          </div>
          ${phonetic ? `<div style="color: #909fb3; font-size: 12px; margin-top: 4px; font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;">[${phonetic.replace(/[\[\]]/g, '')}]</div>` : ''}
          ${context ? `
          <div style="margin-top:6px;font-size:12px;color:#798ca7;line-height:1.5;
                      border-top:2px solid #334155;padding-top:6px;font-style:italic;
                      max-width:250px;word-break:break-word;">
            <div style="display:flex;align-items:flex-start;gap:6px;">
              <div style="flex:1;">${highlightContext(context, contextWord)}</div>
              <span class="context-speaker-btn" 
                data-sentence="${context.replace(/'/g, '&apos;').replace(/"/g, '&quot;')}"
                data-lang="${langCode}"
                style="cursor:pointer;color:#64748b;flex-shrink:0;display:flex;
                      margin-top:1px;transition:color 0.2s;position:relative;overflow:visible;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              </span>
            </div>
            ${contextTranslation ? `
          <div style="font-size:12px;color:#98aac5;margin-top:3px;font-style:normal;opacity:0.8;">
            ${contextTranslation}
          </div>` : ''}
      </div>` : ''}
        </td>
          <td style="vertical-align: top; padding: 12px 16px;">${displayTrans}</td>
          <td style="vertical-align: top; padding: 8px 12px; max-width: 130px;">
          ${item.note
          ? `<span class="note-text"
                    data-id="${item.id}"
                    data-word="${displayWord}"
                    data-note="${(item.note || '').replace(/"/g, '&quot;')}"
                    style="color:#94a3b8; font-size:13px; cursor:pointer; 
                          display:block; word-break:break-word; white-space:normal;">
                ${item.note}
              </span>`
          : `<span class="note-text note-empty"
                    data-id="${item.id}"
                    data-word="${displayWord}"
                    data-note="">
                ＋ ${_t('note')}
              </span>`
        }
        </td>
          <td style="vertical-align: top; padding: 12px 16px;">
            ${domain} 
          </td>
          <td style="color: #637793; font-size: 12px; vertical-align: top; padding: 15px 16px; font-family: monospace;">
            ${dateStr}
          </td>        
          <td style="vertical-align: top; padding: 12px 16px;" id="action-cell-${item.id}">
            <button class="btn btn-danger delete-btn" data-id="${item.id}" data-word="${displayWord}">
              ${_t('delete')}
            </button>
          </td>
        </tr>
    `;
    }).join('');
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
        const lang = e.currentTarget.getAttribute('data-lang') || 'en-US';
        //logger.log('speak:', word, lang);
        speakText(word, e.currentTarget, lang);
      };
    });
    document.querySelectorAll('.context-speaker-btn').forEach(btn => {
      btn.addEventListener("mouseenter", () => {
        btn.style.color = "#38bdf8";
        btn.style.filter = "drop-shadow(0 0 4px rgba(56,189,248,0.6))";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.color = "#64748b";
        btn.style.filter = "";
      });
      btn.onclick = (e) => {
        e.stopPropagation();
        const sentence = e.currentTarget.getAttribute('data-sentence');
        const lang = e.currentTarget.getAttribute('data-lang') || 'en-US';
        btn.style.transform = "scale(0.8)";
        btn.style.color = "#38bdf8";
        btn.style.filter = "drop-shadow(0 0 6px rgba(56,189,248,0.9))";
        setTimeout(() => { btn.style.transform = "scale(1)"; }, 150);
        speakText(sentence, btn, lang);
      };
    });
    document.querySelectorAll('.example-speaker-btn').forEach(btn => {
      btn.addEventListener("mouseenter", () => {
        btn.style.color = "#38bdf8";
        btn.style.filter = "drop-shadow(0 0 4px rgba(56,189,248,0.6))";
      });
      btn.addEventListener("mouseleave", () => {
        btn.style.color = "#637793";
        btn.style.filter = "";
      });
      btn.onclick = (e) => {
        e.stopPropagation();
        const sentence = e.currentTarget.getAttribute('data-sentence');
        // 点击缩放动画
        btn.style.transform = "scale(0.8)";
        btn.style.color = "#38bdf8";
        btn.style.filter = "drop-shadow(0 0 6px rgba(56,189,248,0.9))";
        setTimeout(() => {
          btn.style.transform = "scale(1)";
        }, 150);
        speakText(sentence, btn);
      };
    });
    document.querySelectorAll('.note-text').forEach(el => {
      el.onclick = () => {
        const id = el.getAttribute('data-id');
        const word = el.getAttribute('data-word');
        const current = el.getAttribute('data-note') || '';
        const cell = el.closest('td');
        if (!cell) return;

        //最多100字符
        cell.innerHTML = `
        <textarea class="note-inp" maxlength="300"
        placeholder="${targetLanguage === 'zh-CN' ? '四级/托福/语境...' : ''}"
        style="background:#020617; 
       border: none;
       color:white; padding:4px 8px; border-radius:6px; 
       width:100%; font-size:12px; box-sizing:border-box;
       resize:none; overflow:hidden; 
       font-family: system-ui, -apple-system, sans-serif;
       outline: none;
       box-shadow: 0 0 0 1px rgba(56, 189, 248, 0.8),
                   0 0 6px rgba(56, 189, 248, 0.6),
                   0 0 12px rgba(56, 189, 248, 0.4),
                   0 0 20px rgba(56, 189, 248, 0.2),
                   0 0 35px rgba(56, 189, 248, 0.1);"
        rows="1">${current}</textarea>
      `;

        const inp = cell.querySelector('.note-inp');
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);

        // 自动撑高
        const autoResize = () => {
          inp.style.height = 'auto';
          inp.style.height = inp.scrollHeight + 'px';
        };
        autoResize();
        inp.oninput = autoResize;

        const save = async () => {
          const newNote = inp.value.trim();
          const entry = await idb.vocabulary.get(word);
          if (entry) {
            entry.note = newNote;
            entry.updated = Date.now();
            await idb.vocabulary.add(word, entry);
          }
          renderTable();
        };

        inp.onblur = save;
        inp.onkeydown = (e) => {
          if (e.key === 'Enter') inp.blur();
          if (e.key === 'Escape') renderTable();
        };
      };
    });
  }
  document.getElementById('prevPage').onclick = () => {
    if (currentPage > 1) {
      currentPage--;
      renderTable();
    }
  };
  document.getElementById('nextPage').onclick = async () => {
    const vocabulary = await idb.vocabulary.getAll();
    const activeCount = vocabulary.filter(v => !v.deleted).length;
    const totalPages = Math.ceil(activeCount / pageSize);
    if (currentPage < totalPages) {
      currentPage++;
      renderTable();
    }
  };
  const undoTimers = {};
  async function deleteWord(id, word) {
    const cell = document.getElementById(`action-cell-${id}`);
    if (!cell) return;
    const originalContent = cell.innerHTML;
    let secondsLeft = 3;
    try {
      const entry = await idb.vocabulary.get(word);
      if (entry) {
        entry.deleted = true;
        entry.updated = Date.now();
        await idb.vocabulary.add(word, entry);
      }
      const updateUndoUI = (secs) => {
        cell.innerHTML = `
    <div class="undo-container">
      <span class="delete-countdown">${secs}s</span>
      <a href="javascript:void(0)" class="undo-link">${_t('recall')}</a>
    </div>
  `;
        cell.querySelector('.undo-link').onclick = async (e) => {
          e.preventDefault();
          clearInterval(countdownInterval);
          if (undoTimers[id]) {
            clearTimeout(undoTimers[id]);
            delete undoTimers[id];
          }
          const backEntry = await idb.vocabulary.get(word);
          if (backEntry) {
            backEntry.deleted = false;
            backEntry.updated = Date.now();
            await idb.vocabulary.add(word, backEntry);
          }
          cell.innerHTML = originalContent;
          const btn = cell.querySelector('.btn-danger');
          if (btn) btn.onclick = () => deleteWord(id, word);
        };
      };
      updateUndoUI(secondsLeft);
      const countdownInterval = setInterval(() => {
        secondsLeft--;
        if (secondsLeft > 0) updateUndoUI(secondsLeft);
        else clearInterval(countdownInterval);
      }, 1000);
      undoTimers[id] = setTimeout(async () => {
        const row = cell.closest('tr');
        if (row) {
          row.classList.add('row-fade-out');
          setTimeout(() => {
            row.classList.add('row-collapse');
            setTimeout(() => {
              row.remove();
              delete undoTimers[id];
              if (Object.keys(undoTimers).length === 0) {
              }
            }, 300);
          }, 400);
        }
      }, 3500);
    } catch (err) {
      logger.error("Delete failed:", err);
      cell.innerHTML = originalContent;
    }
  }
  document.getElementById('addBtn').onclick = async () => {
    const word = wordInp.value.trim();
    const trans = transInp.value.trim();
    if (!word || !trans) return alert(_t('completeContent'));
    await idb.vocabulary.add(word, { trans: trans });
    wordInp.value = ''; transInp.value = '';
    renderTable();
  };
  // function speak(text, btnElement, lang = 'en-US') {
  //   if (!text) return;
  //   window.speechSynthesis.cancel();
  //   const msg = new SpeechSynthesisUtterance();
  //   msg.text = text;
  //   msg.lang = lang;
  //   msg.onstart = () => { if (btnElement) btnElement.classList.add('speaking'); };
  //   msg.onend = () => { if (btnElement) btnElement.classList.remove('speaking'); };
  //   msg.onerror = () => { if (btnElement) btnElement.classList.remove('speaking'); };
  //   window.speechSynthesis.speak(msg);
  // }
  document.getElementById('exportBtn').onclick = async () => {
    const vocabulary = await idb.vocabulary.getAll();
    const activeVocab = vocabulary.filter(item => !item.deleted);
    if (activeVocab.length === 0) return alert(_t('noExportWords') || "No data to export");

    // 按时间倒序排列
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
            const meanings = Array.isArray(d.meanings)
              ? d.meanings.join(' ')
              : (d.meanings || d.definition || "");
            return `${pos}${meanings}`;
          }).join(' | ');
        }
        transText = basic + (detail ? ` [${detail}]` : "");

        //  例句
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

      //  上下文
      const context = item.trans?.context || "";
      const contextTranslation = item.trans?.contextTranslation || "";
      const contextText = context
        ? (contextTranslation ? `${context} (${contextTranslation})` : context)
        : "";

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
  function appendDots() {
    const targets = ['wordInp', 'transInp'];
    targets.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.placeholder && !el.placeholder.endsWith('...')) {
        el.placeholder += '...';
      }
    });
  }
  applyI18n(targetLanguage);
  appendDots()
  renderTable();
});