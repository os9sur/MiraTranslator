document.addEventListener('DOMContentLoaded', async () => {
  const vocabBody = document.getElementById('vocabBody');
  const wordInp = document.getElementById('wordInp');
  const transInp = document.getElementById('transInp');
  const storage = await safeGetStorage('targetLanguage');
  if (storage === undefined) {
    if (typeof showUpdateNotice === 'function') showUpdateNotice();
    return; 
  }
  const targetLanguage =
    storage?.targetLanguage ||          
    navigator.language?.replace('_', '-') || 
    'en';
  const _t = (key) => {
    return (typeof t === 'function') ? t(key, targetLanguage) : key;
  };
  if (typeof applyI18n === 'function') {
    applyI18n(targetLanguage);
  }
  function formatDetail(dictData) {
    if (!Array.isArray(dictData) || dictData.length === 0) return "";
    return dictData.map(item => {
      const pos = localizePos(item.pos, targetLanguage) || item.pos || "";
      const meanings = Array.isArray(item.meanings) ? item.meanings.join(', ') : (item.meanings || "");
      return `
      <div class="v-detail-line" style="margin-top: 2px; display: flex; gap: 6px;">
        <span class="v-pos" style="color: #38bdf8; font-style: italic; font-size: 11px; min-width: 30px;">${pos}</span>
        <span class="v-def" style="color: #94a3b8;">${meanings}</span>
      </div>
    `;
    }).join('');
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
        } else {
          transText = item.trans || "";
        }
        return wordMatch || transText.toLowerCase().includes(searchQuery);
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
      let displayTrans = "";
      if (typeof item.trans === 'object' && item.trans !== null) {
        const { phonetic, basic, dictData, detail } = item.trans;
        const detailContent = dictData ? formatDetail(dictData) : (detail || "");
        displayTrans = `
        <div class="vocab-trans-container">
          ${phonetic ? `<div class="v-phonetic" style="color: #64748b; font-size: 13px; margin-bottom: 2px; font-family: monospace;">[${phonetic.replace(/[\[\]]/g, '')}]</div>` : ''}
          <div class="v-basic" style="font-weight: 500; color: #e2e8f0; margin-bottom: 4px; font-size: 15px;">${basic || ''}</div>
          ${detailContent ? `<div class="v-detail-box" style="border-top: 1px solid #3f5374; padding-top: 6px; margin-top: 4px;">${detailContent}</div>` : ''}
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
          <td style="vertical-align: top; padding: 12px 16px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="word-text">${displayWord}</span>
              <span class="speaker-btn" data-word="${safeWordForSpeech}" style="cursor: pointer; color: #64748b; display: flex; transition: color 0.2s;">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                </svg>
              </span>
            </div>
          </td>
          <td style="vertical-align: top; padding: 12px 16px;">${displayTrans}</td>
          <td style="vertical-align: top; padding: 12px 16px;">
            ${domain} 
          </td>
          <td style="color: #64748b; font-size: 12px; vertical-align: top; padding: 15px 16px; font-family: monospace;">
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
        speak(word, e.currentTarget);
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
  function speak(text, btnElement) {
    if (!text) return;
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance();
    msg.text = text;
    msg.lang = 'en-US';
    msg.onstart = () => {
      if (btnElement) btnElement.classList.add('speaking');
    };
    msg.onend = () => {
      if (btnElement) btnElement.classList.remove('speaking');
    };
    msg.onerror = () => {
      if (btnElement) btnElement.classList.remove('speaking');
    };
    window.speechSynthesis.speak(msg);
  }
  document.getElementById('exportBtn').onclick = async () => {
    const vocabulary = await idb.vocabulary.getAll();
    const activeVocab = vocabulary.filter(item => !item.deleted);
    if (activeVocab.length === 0) return alert(_t('noExportWords') || "No data to export");
    let csvContent = `\ufeff${_t('word')},${_t('meaning')},Source,URL,${_t('addTime')}\n`;
    activeVocab.forEach(item => {
      let transText = "";
      if (typeof item.trans === 'object' && item.trans !== null) {
        const basic = item.trans.basic || "";
        let detail = "";
        if (Array.isArray(item.trans.dictData)) {
          detail = item.trans.dictData.map(d => {
            const pos = d.pos ? `${d.pos} ` : "";
            const meanings = Array.isArray(d.meanings) ? d.meanings.join(' ') : d.meanings;
            return `${pos}${meanings}`;
          }).join(' | ');
        }
        transText = basic + (detail ? ` [${detail}]` : "");
      } else {
        transText = item.trans || "";
      }
      const safeWord = (item.word || "").replace(/"/g, '""');
      const safeTrans = transText.replace(/"/g, '""').replace(/\r?\n|\r/g, ' ');
      const safeTitle = (item.title || "").replace(/"/g, '""');
      const safeUrl = (item.src || "").replace(/"/g, '""');
      const time = new Date(item.date).toLocaleString().replace(/,/g, ' ');
      csvContent += `"${safeWord}","${safeTrans}","${safeTitle}","${safeUrl}","${time}"\n`;
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