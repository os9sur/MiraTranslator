// --- 状态与常量 ---
let currentChannel = null;
let selectedAmts = { kofi: '5', afdian: '10' };
let isLoggedIn = false;
let userData = { name: '', email: '', balance: 0, avatar: '' };
let payCode = "";

const KOFI_URL = 'https://ko-fi.com/miratranslator';
const AFDIAN_URL = 'https://afdian.com/a/miratranslator';

// --- 初始化入口 ---
async function init() {
    loadUserFromParams();
    detectChannel();
    renderAccount();

    // // 如果已登录，自动获取/生成充值码
    // if (isLoggedIn && userData.uid) {
    //     await fetchPayCode(userData.uid);
    // }
}
async function fetchPayCode(uid) {
    const codeEl = document.getElementById('displayPayCode');

    // 1. 显示加载中状态（可选，提升体验）
    codeEl.textContent = "正在生成...";
    codeEl.style.opacity = "0.5";

    try { 
        const response = await fetch('{{MIRA_WORKER_URL}}/api/generate-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ uid: uid })
        });

        const data = await response.json();

        if (data.code) {
            payCode = data.code; // 更新全局变量
            codeEl.textContent = data.code; // 更新 UI
            codeEl.style.opacity = "1";
        } else {
            throw new Error(data.error || '获取失败');
        }
    } catch (err) {
        logger.error('获取充值码失败:', err);
        codeEl.textContent = "生成失败，请刷新";
        codeEl.style.color = "#ff4d4f";
    }
}

function loadUserFromParams() {
    const p = new URLSearchParams(window.location.search);
    const uid = p.get('uid') || '';
    const email = p.get('email') || '';
    const name = p.get('name') || '';
    const balance = parseFloat(p.get('balance') || '0');
    const avatar = p.get('avatar') || '';
    
    //  优先从 URL 获取已经生成的充值码
    const urlCode = p.get('code');

    isLoggedIn = !!uid; 
    userData = { uid, name, email, balance, avatar };
    
    // 如果 URL 有码就用 URL 的，否则才显示占位符
    if (urlCode) {
        payCode = urlCode;
    } else {
        payCode = isLoggedIn ? "正在生成..." : "PAY-XXXXXX";
    }
}

function renderAccount() {
    const acctBox = document.getElementById('accountBox');
    const notLogged = document.getElementById('notLoggedBox');

    if (isLoggedIn) {
        acctBox.style.display = 'flex';
        notLogged.style.display = 'none';

        const initials = userData.name
            ? userData.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
            : userData.email.slice(0, 2).toUpperCase();

        const avatarEl = document.getElementById('userAvatar');
        if (userData.avatar) {
            avatarEl.innerHTML = `<img src="${userData.avatar}" alt="avatar" style="width:100%;height:100%;border-radius:50%;">`;
        } else {
            avatarEl.textContent = initials;
        }
        document.getElementById('userName').textContent = userData.name || userData.email.split('@')[0];
        document.getElementById('userEmail').textContent = userData.email;
        document.getElementById('balanceVal').textContent = '$ ' + userData.balance.toFixed(2);
        document.getElementById('displayPayCode').textContent = payCode;
    } else {
        acctBox.style.display = 'none';
        notLogged.style.display = 'flex';
        notLogged.classList.add('show');
    }
}

function detectChannel() {
    const lang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    const isCN = lang.startsWith('zh-cn') || lang === 'zh' || lang.startsWith('zh-hans');
    setChannel(isCN ? 'afdian' : 'kofi');
}

function setChannel(ch) {
    currentChannel = ch;
    document.getElementById('swKofi').classList.toggle('active', ch === 'kofi');
    document.getElementById('swAfdian').classList.toggle('active', ch === 'afdian');
    document.getElementById('panelKofi').classList.toggle('active', ch === 'kofi');
    document.getElementById('panelAfdian').classList.toggle('active', ch === 'afdian');
}

function selectAmt(ch, el, amt) {
    const container = document.getElementById(ch === 'kofi' ? 'amtsKofi' : 'amtsAfdian');
    container.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('sel'));
    el.classList.add('sel');
    selectedAmts[ch] = amt;
    document.getElementById(ch === 'kofi' ? 'customKofi' : 'customAfdian').value = '';
}

function onCustomInput(ch) {
    const input = document.getElementById(ch === 'kofi' ? 'customKofi' : 'customAfdian');
    const container = document.getElementById(ch === 'kofi' ? 'amtsKofi' : 'amtsAfdian');
    if (input.value) {
        container.querySelectorAll('.amt-btn').forEach(b => b.classList.remove('sel'));
        selectedAmts[ch] = input.value;
    }
}

function getAmount(ch) {
    const customInput = document.getElementById(ch === 'kofi' ? 'customKofi' : 'customAfdian');
    return customInput.value ? parseFloat(customInput.value) : parseFloat(selectedAmts[ch]);
}

function checkLogin() {
    if (!isLoggedIn) {
        alert('请先在插件中登录 Google 账号，再进行充值。');
        return false;
    }
    return true;
}

// --- 事件处理器 ---
function payKofi() {
    if (!checkLogin()) return;
    const amt = getAmount('kofi');
    const confirmPay = confirm(`请务必在 Ko-fi 的留言框 (Message) 中填写以下充值码，否则无法自动到账：\n\n${payCode}\n\n确认前往支付？`);
    if (confirmPay) {
        navigator.clipboard.writeText(payCode);
        const url = `${KOFI_URL}?amount=${amt}`;
        window.open(url, '_blank');
    }
}

function payAfdian() {
    if (!checkLogin()) return;
    const amt = getAmount('afdian');
    if (!amt || amt < 1) { alert('请选择或输入有效金额'); return; }
    window.open(AFDIAN_URL, '_blank');
}

// --- 事件绑定 (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => {
    // 初始化
    init();

    // 基础导航与操作
    document.getElementById('goBack').addEventListener('click', () => {
        if (window.history.length > 1) window.history.back();
        else window.close();
    });

    document.getElementById('triggerLogin').addEventListener('click', () => {
        if (window.opener) {
            window.opener.postMessage({ type: 'MIRA_TRIGGER_LOGIN' }, '*');
            window.close();
        } else {
            alert('请打开 Mira 插件后点击登录按钮。');
        }
    });

    document.getElementById('copyCode').addEventListener('click', () => {
        if (payCode && !payCode.includes('中') && !payCode.includes('失败')) {
            navigator.clipboard.writeText(payCode); 
            const btn = document.getElementById('copyCode');
            const originalText = btn.textContent;
            btn.textContent = "已复制";
            setTimeout(() => btn.textContent = originalText, 2000);
        }
    });

    // 渠道切换
    document.getElementById('swKofi').addEventListener('click', () => setChannel('kofi'));
    document.getElementById('swAfdian').addEventListener('click', () => setChannel('afdian'));

    // 金额按钮点击 (使用代理或遍历)
    document.querySelectorAll('.amt-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            const ch = this.getAttribute('data-ch');
            const amt = this.getAttribute('data-amt');
            selectAmt(ch, this, amt);
        });
    });

    // 自定义金额输入
    document.getElementById('customKofi').addEventListener('input', () => onCustomInput('kofi'));
    document.getElementById('customAfdian').addEventListener('input', () => onCustomInput('afdian'));

    // 支付按钮
    document.getElementById('btnKofi').addEventListener('click', payKofi);
    document.getElementById('btnAfdian').addEventListener('click', payAfdian);

    // 页脚链接
    document.getElementById('openSupport').addEventListener('click', () => {
        window.open('mailto:support@miratranslator.com?subject=充值问题', '_blank');
    });
    document.getElementById('openFaq').addEventListener('click', () => {
        window.open('https://miratranslator.com/faq', '_blank');
    });
    document.getElementById('openKofiPage').addEventListener('click', () => {
        window.open(KOFI_URL, '_blank');
    });
});

// 监听来自扩展的消息
window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'MIRA_USER_INFO') {
        isLoggedIn = true;
        userData = e.data.payload;
        renderAccount();
    }
});