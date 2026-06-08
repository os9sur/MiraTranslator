/**
 * Mira Translator
 * Copyright (C) 2026 David Bai 
 * License: AGPL-3.0 (https://github.com/os9sur)
 * Contact: mira.studio@proton.me
 */

let isLoggedIn = false;
let userData = { uid: '', name: '', email: '', balance: 0, avatar: '' };

function init() {
     applyI18n(getBrowserLang());
    const p = new URLSearchParams(window.location.search);
    const uid = p.get('uid') || '';
    isLoggedIn = !!uid;
    userData = {
        uid,
        name: p.get('name') || '',
        email: p.get('email') || '',
        balance: parseFloat(p.get('balance') || '0'),
        avatar: p.get('avatar') || ''
    };
    renderAccount();
}

function renderAccount() {
    const acct = document.getElementById('accountBox');
    const notLogged = document.getElementById('notLoggedBox');
    if (isLoggedIn) {
        acct.classList.add('show');
        notLogged.classList.remove('show');
        const initials = userData.name
            ? userData.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            : userData.email.slice(0, 2).toUpperCase();
        const av = document.getElementById('userAvatar');
        av.innerHTML = userData.avatar ? `<img src="${userData.avatar}" alt="">` : initials;
        document.getElementById('userName').textContent = userData.name || userData.email.split('@')[0];
        document.getElementById('userEmail').textContent = userData.email;
        document.getElementById('balanceVal').textContent = '$ ' + userData.balance.toFixed(2);
    } else {
        acct.classList.remove('show');
        notLogged.classList.add('show');
    }
}

function closeCurrentWindow() {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
        chrome.tabs.getCurrent((tab) => {
            if (tab && tab.id) chrome.tabs.remove(tab.id);
        });
    } else {
        window.close();
    }
}

// Plan card click
document.addEventListener('click', e => {
    const card = e.target.closest('.plan-card');
    if (!card) return;
    e.preventDefault();

    if (!isLoggedIn || !userData.uid) {
        alert(t('loginFirst') || 'Please sign in first.');
        return;
    }

    let url = card.dataset.url;
    if (url) {
        const separator = url.includes('?') ? '&' : '?';
        url = `${url}${separator}custom_id=${encodeURIComponent(userData.uid)}`;
        window.open(url, '_blank');
        closeCurrentWindow();
    }
});

document.addEventListener('DOMContentLoaded', () => {
    init();

    document.getElementById('goBack')?.addEventListener('click', () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            closeCurrentWindow();
        }
    });

    document.getElementById('triggerLogin')?.addEventListener('click', () => {
        if (window.opener) {
            window.opener.postMessage({ type: 'MIRA_TRIGGER_LOGIN' }, '*');
            closeCurrentWindow();
        } else {
            alert('请打开 Mira 插件后点击登录按钮。');
        }
    });

    document.getElementById('openSupport')?.addEventListener('click', () => {
        window.open('mailto:mira.studio@proton.me?subject=Mira Translator - Payment Issue', '_blank');
    });

    document.getElementById('openFaq')?.addEventListener('click', () => {
        window.open('https://miratranslator.com/faq', '_blank');
    });

    document.getElementById('openKofiPage')?.addEventListener('click', () => {
        window.open('https://ko-fi.com/miratranslator/shop', '_blank');
        closeCurrentWindow();
    });
});

window.addEventListener('message', e => {
    if (e.data?.type === 'MIRA_USER_INFO') {
        isLoggedIn = true;
        userData = e.data.payload;
        renderAccount();
        document.getElementById('panelKofi')?.classList.add('active');
    }
});