/* =========================================================
   LDR Birthday Gift — script.js
   ========================================================= */
'use strict';

const MAIN_PASSWORD = 'OCTOBER9';

const HER_NAME = 'Avee';
const YOUR_NAME = 'Morgan';
const REPLY_EMAIL = '';          
const HER_TIMEZONE = 'Asia/Manila';
const YOUR_TIMEZONE = '';        
const HOLD_SECONDS = 3;          

const openWhenCards = {
    missMe:    { 
        password: 'imissyou',      
        title: 'Open when you miss me',            
        confirm: 'Are you sure you miss me?',
        image: 'miss.png' 
    },
    sad:       { 
        password: 'ineedyou',      
        title: 'Open when you are sad',            
        confirm: 'Are you sure you are sad?',
        image: 'cry.png' 
    },
    happy:     { 
        password: 'happyuhappyme', 
        title: 'Open when you feel happy',         
        confirm: 'Are you sure you feel happy?',
        image: 'happy.png' 
    },
    notInMood: { 
        password: 'Patience',      
        title: 'Open when you are not in the mood', 
        confirm: 'Are you sure you are not in the mood?',
        image: 'anxious.png' 
    },
    needTo:    { 
        password: 'Iloveyou',      
        title: 'Open when you need to!',           
        confirm: 'Are you sure you need to open this?',
        image: 'keepme.png' 
    }
};

const state = { introRunning: false, currentCard: null, lastTrigger: null, busy: false };

const $ = (sel, root = document) => root.querySelector(sel); const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = ms => new Promise(res => setTimeout(res, reducedMotion() ? 0 : ms));
const frame = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
const normalize = str => String(str).trim().toLowerCase();

function bindPasswordToggle(button, input) {
    button.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        input.closest('.field').classList.toggle('is-masked', !show);
        button.textContent = show ? 'Hide' : 'Show';
        button.setAttribute('aria-pressed', String(show));
        button.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
        input.focus();
    });
}

function initPasswordDots(input) {
    const field = input.closest('.field');
    const dots = document.createElement('div');
    dots.className = 'dots';
    dots.setAttribute('aria-hidden', 'true');
    input.after(dots);
    field.classList.add('is-masked');
    
    input._sync = () => {
        const n = input.value.length;
        const live = dots.querySelectorAll('i:not(.out)');
        
        if (live.length < n) {
            for (let k = live.length; k < n; k++) {
                const dot = document.createElement('i');
                dots.append(dot);
            }
        } else if (live.length > n) {
            for (let k = live.length - 1; k >= n; k--) {
                live[k].classList.add('out');
                setTimeout(() => live[k].remove(), 200);
            }
        }
    };
    input.addEventListener('input', input._sync);
}

function showError(field, errorEl, message) {
    errorEl.textContent = message;
    errorEl.classList.add('is-visible');
    field.classList.remove('is-error');
    void field.offsetWidth; 
    field.classList.add('is-error');
}
function clearError(field, errorEl) {
    field.classList.remove('is-error');
    errorEl.classList.remove('is-visible');
}

async function goTo(name) {
    const current = $('.view.is-active');
    const next = $(`.view[data-view="${name}"]`);
    if (!next || current === next) return;
    current.classList.remove('is-active');
    current.classList.add('is-leaving');
    await wait(520);
    current.hidden = true;
    current.classList.remove('is-leaving');
    next.hidden = false;
    window.scrollTo(0, 0);
    await frame();
    next.classList.add('is-active');
}

function showLogin() {
    const card = $('.login-card');
    const input = $('#loginPassword');
    const field = $('#loginField');
    const error = $('#loginError');

    bindPasswordToggle($('#loginToggle'), input);
    input.addEventListener('input', () => clearError(field, error));
    $('#loginForm').addEventListener('submit', e => { e.preventDefault(); validateMainPassword(); });

    card.addEventListener('pointermove', e => {
        if (reducedMotion() || e.pointerType !== 'mouse') return;
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - .5;
        const y = (e.clientY - r.top) / r.height - .5;
        card.style.transform = `perspective(900px) rotateY(${x * 4}deg) rotateX(${-y * 4}deg)`;
    });
    card.addEventListener('pointerleave', () => { card.style.transform = ''; });

    input.focus({ preventScroll: true });
}

async function validateMainPassword() {
    const input = $('#loginPassword');
    if (normalize(input.value) === normalize(MAIN_PASSWORD)) {
        clearError($('#loginField'), $('#loginError'));
        $('#loginLine').classList.add('is-connected');   
        await wait(1200);
        input.value = '';
        if (input._sync) input._sync();
        showIntro();
    } else {
        showError($('#loginField'), $('#loginError'), "That isn't quite it. Try again.");         input.select();     } }  async function showIntro() {     if (state.introRunning) return;     state.introRunning = true;     await goTo('intro'); }  function initIntroSteps() {     $$('.intro-next').forEach(btn => {
        if (btn.id === 'introFinish') return;
        btn.addEventListener('click', async () => {
            const currentStepEl = btn.closest('.intro-step');
            const nextStepNum = btn.dataset.next;

            currentStepEl.classList.remove('is-active');
            await wait(450);
            currentStepEl.hidden = true;

            if (nextStepNum) {
                const nextStepEl = $(`.intro-step[data-step="${nextStepNum}"]`);
                nextStepEl.hidden = false;
                await frame();
                nextStepEl.classList.add('is-active');
            }
        });
    });

    $$('.device-btn').forEach(btn => {         btn.addEventListener('click', () => {             const device = btn.dataset.device;             document.documentElement.dataset.device = device;             $$
('.device-btn').forEach(b => b.setAttribute('aria-pressed', 'false'));
            btn.setAttribute('aria-pressed', 'true');
            
            const nextBtn = $('#deviceNextBtn');
            nextBtn.disabled = false;
            nextBtn.classList.add('is-ready');
        });
    });

    $('#introFinish').addEventListener('click', async () => {
        const currentStepEl = $('#introFinish').closest('.intro-step');
        currentStepEl.classList.remove('is-active');
        await wait(500);
        await goTo('main');
        $('#greetingEnvelope').focus({ preventScroll: true });
    });
}

async function animateEnvelopeOpen(wrap) {
    if (wrap.classList.contains('is-open') || wrap.dataset.animating) return;
    wrap.dataset.animating = '1';
    wrap.classList.add('is-flap-open');     
    await wait(1200);
    wrap.classList.add('is-sheet-out');     
    await wait(1400);
    wrap.classList.add('is-collapsed');     
    wrap.classList.add('is-open');          
    await wait(2200);
    delete wrap.dataset.animating;
}

async function animateEnvelopeClose(wrap) {
    if (!wrap.classList.contains('is-open') || wrap.dataset.animating) return;
    wrap.dataset.animating = '1';
    wrap.classList.remove('is-open');
    await wait(1400);
    wrap.classList.remove('is-collapsed');
    await wait(800);
    wrap.classList.remove('is-sheet-out');
    await wait(1200);
    wrap.classList.remove('is-flap-open');
    await wait(1200);
    delete wrap.dataset.animating;
}

function resetEnvelope(wrap) {
    wrap.classList.remove('is-open', 'is-collapsed', 'is-sheet-out', 'is-flap-open');
    delete wrap.dataset.animating;
}

async function openLetter() {
    const wrap = $('#greetingWrap');
    const env = $('#greetingEnvelope');
    env.disabled = true;
    env.setAttribute('aria-expanded', 'true');
    $('#letterHint').textContent = 'Read it whenever you like.';
    await animateEnvelopeOpen(wrap);
    $('#closeLetterBtn').focus({ preventScroll: true });
}

async function closeLetter() {
    const wrap = $('#greetingWrap');
    const env = $('#greetingEnvelope');
    await animateEnvelopeClose(wrap);
    env.disabled = false;
    env.setAttribute('aria-expanded', 'false');
    $('#letterHint').textContent = 'Tap the envelope to open it.';     env.focus({ preventScroll: true }); }  function initLetterImages() {     $$('.letter-image').forEach(img => {
        const figure = img.closest('.letter-figure');
        const update = ok => figure.classList.toggle('has-image', ok);
        img.addEventListener('load', () => update(true));
        img.addEventListener('error', () => update(false));
        update(Boolean(img.getAttribute('src')) && img.complete && img.naturalWidth > 0);
    });
}

function showOpenWhenSection() { goTo('openwhen'); }
function showMainSection() { goTo('main'); }

function openPasswordModal(key, trigger) {
    state.currentCard = key;
    state.lastTrigger = trigger;
    const overlay = $('#pwOverlay');
    const input = $('#pwInput');
    input.value = '';
    if (input._sync) input._sync();
    input.type = 'password';
    $('#pwField').classList.add('is-masked');
    $('#pwToggle').textContent = 'Show';
    $('#pwToggle').setAttribute('aria-pressed', 'false');
    clearError($('#pwField'), $('#pwError'));
    
    const cardData = openWhenCards[key];
    $('#pwHold').hidden = key !== 'notInMood';
    $('.hold-fill').style.transform = 'scaleX(0)';
    
    const confirmSection = $('#pwConfirmSection');
    const formEl = $('#pwForm');
    const titleEl = $('#pwTitle');
    const textEl = $('#pwText');
    
    if (cardData.confirm) {
        titleEl.textContent = "Quick question...";
        textEl.textContent = "Before you open this card:";
        $('#confirmQuestion').textContent = cardData.confirm;
        confirmSection.style.display = 'block';
        formEl.style.display = 'none';
    } else {
        titleEl.textContent = "This one is just for you.";
        textEl.textContent = key === 'notInMood' ? 'Enter the password, or take your time and hold the button.' : 'Enter the password to open it.';
        confirmSection.style.display = 'none';
        formEl.style.display = 'grid';
    }

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => requestAnimationFrame(() => overlay.classList.add('is-visible')));
    setTimeout(() => {
        if (cardData.confirm) {
            $('#confirmYes').focus({ preventScroll: true });
        } else {
            input.focus();
        }
    }, reducedMotion() ? 0 : 250);
}

async function closePasswordModal(restoreFocus = true) {
    const overlay = $('#pwOverlay');
    overlay.classList.remove('is-visible');
    await wait(450);
    overlay.hidden = true;
    if (!$('#privateOverlay').classList.contains('is-visible')) document.body.style.overflow = '';
    if (restoreFocus && state.lastTrigger) state.lastTrigger.focus({ preventScroll: true });
}

function validateOpenWhenPassword() {
    const card = openWhenCards[state.currentCard];
    if (!card) return;
    const input = $('#pwInput');
    if (normalize(input.value) === normalize(card.password)) {
        unlockCurrentCard();
    } else {
        showError($('#pwField'), $('#pwError'), 'Not quite. Try again.');
        input.select();
    }
}

async function unlockCurrentCard() {
    const key = state.currentCard;
    if (!key || state.unlocking) return;
    state.unlocking = true;
    clearError($('#pwField'), $('#pwError'));
    await closePasswordModal(false);
    state.unlocking = false;
    openPrivateLetter(key);
}

function bindHoldButton() {
    const btn = $('#pwHold');
    const fill = $('.hold-fill', btn);
    let start = 0, raf = 0;
    const stop = (reset = true) => { cancelAnimationFrame(raf); raf = 0; if (reset) fill.style.transform = 'scaleX(0)'; };
    const step = () => {
        const p = Math.min((performance.now() - start) / (HOLD_SECONDS * 1000), 1);
        fill.style.transform = `scaleX(${p})`;
        if (p >= 1) { stop(false); unlockCurrentCard(); } else raf = requestAnimationFrame(step);
    };
    const begin = () => { if (raf) return; start = performance.now(); raf = requestAnimationFrame(step); };
    btn.addEventListener('pointerdown', e => { e.preventDefault(); begin(); });
    ['pointerup', 'pointerleave', 'pointercancel', 'blur', 'keyup'].forEach(ev => btn.addEventListener(ev, () => stop()));
    btn.addEventListener('keydown', e => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); begin(); }
    });
}

async function openPrivateLetter(key) {
    const card = openWhenCards[key];
    const overlay = $('#privateOverlay');
    const wrap = $('#privateWrap');

    overlay.dataset.card = key;                   
    $('#privateTitle').textContent = card.title;
    $('#privateImage').src = card.image;
    initLetterImages();
    resetEnvelope(wrap);

    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    overlay.scrollTop = 0;
    await frame();
    overlay.classList.add('is-visible');          
    await wait(700);
    await animateEnvelopeOpen(wrap);              
    $('#privateClose').focus({ preventScroll: true });
}

async function closePrivateLetter() {
    const overlay = $('#privateOverlay');
    if (overlay.hidden || state.busy) return;
    state.busy = true;
    await animateEnvelopeClose($('#privateWrap'));
    overlay.classList.remove('is-visible');
    await wait(600);
    overlay.hidden = true;
    resetEnvelope($('#privateWrap'));
    document.body.style.overflow = '';
    state.busy = false;
    const trigger = $(`.env-card[data-card="${state.currentCard}"]`);
    if (trigger) trigger.focus({ preventScroll: true });
}

function initLightbox() {
    const lightbox = $('#lightboxOverlay');
    const lightboxImg = $('#lightboxImg');
    const closeBtn = $('#lightboxClose');

    document.addEventListener('click', e => {
        const trigger = e.target.closest('.zoomable-trigger');
        if (trigger) {
            const img = trigger.querySelector('img');
            if (img && img.src) {
                lightboxImg.src = img.src;
                lightbox.hidden = false;
                requestAnimationFrame(() => lightbox.classList.add('is-visible'));
            }
        }
    });

    const closeLightbox = () => {
        lightbox.classList.remove('is-visible');
        setTimeout(() => { lightbox.hidden = true; lightboxImg.src = ''; }, 300);
    };

    closeBtn.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', e => { if (e.target === lightbox) closeLightbox(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !lightbox.hidden) closeLightbox(); });
}

function bindEvents() {
    initIntroSteps();
    
    document.addEventListener('keydown', e => {
        const introActive = $('.view[data-view="intro"]').classList.contains('is-active');
        if (e.key === 'Enter' && introActive) {
            e.preventDefault();
            const activeStep = $('.intro-step.is-active');
            const nextBtn = activeStep ? activeStep.querySelector('.intro-next') : null;
            if (nextBtn && !nextBtn.hidden && !nextBtn.disabled) nextBtn.click();
        }
        if (e.key === 'Escape') {
            if (!$('#lightboxOverlay').hidden) return;
            if (!$('#pwOverlay').hidden) closePasswordModal();
            else if (!$('#privateOverlay').hidden) closePrivateLetter();
        }
    });

    $('#greetingEnvelope').addEventListener('click', openLetter);
    $('#closeLetterBtn').addEventListener('click', closeLetter);
    $('#toOpenWhen').addEventListener('click', showOpenWhenSection);

    $('#owBack').addEventListener('click', showMainSection);
    $('#owHome').addEventListener('click', showMainSection);      $$('.env-card').forEach(btn => btn.addEventListener('click', () => {
        openPasswordModal(btn.dataset.card, btn);
    }));
    
    bindHoldButton();

    $('#confirmYes').addEventListener('click', () => {
        $('#pwConfirmSection').style.display = 'none';
        $('#pwForm').style.display = 'grid';
        $('#pwTitle').textContent = "This one is just for you.";
        $('#pwText').textContent = state.currentCard === 'notInMood' ? 'Enter the password, or take your time and hold the button.' : 'Enter the password to open it.';
        $('#pwInput').focus();
    });
    
    $('#confirmNo').addEventListener('click', () => {
        closePasswordModal();
    });

    const pwInput = $('#pwInput');
    bindPasswordToggle($('#pwToggle'), pwInput);
    pwInput.addEventListener('input', () => clearError($('#pwField'), $('#pwError')));
    $('#pwForm').addEventListener('submit', e => { e.preventDefault(); validateOpenWhenPassword(); });
    $('#pwCancel').addEventListener('click', () => closePasswordModal());
    $('#pwOverlay').addEventListener('click', e => { if (e.target.id === 'pwOverlay') closePasswordModal(); });

    $('#privateClose').addEventListener('click', closePrivateLetter);
    $('#privateBack').addEventListener('click', closePrivateLetter);
    $('#privateOverlay').addEventListener('click', e => { if (e.target.id === 'privateOverlay') closePrivateLetter(); });
}

function setSky() {
    const h = new Date().getHours();
    document.documentElement.dataset.sky = h >= 5 && h < 9 ? 'dawn' : h >= 9 && h < 17 ? 'day' : h >= 17 && h < 20 ? 'dusk' : 'night';
}

function updateClocks() {
    const el = $('#clocks');
    if (!HER_TIMEZONE || !YOUR_TIMEZONE) { el.hidden = true; return; }
    const fmt = tz => new Intl.DateTimeFormat([], { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date());
    el.textContent = `${HER_NAME} ${fmt(HER_TIMEZONE)}, ${YOUR_NAME} ${fmt(YOUR_TIMEZONE)}`;
    el.hidden = false;
}

function initPointerEffects() {
    if (reducedMotion()) return;
    $$('.btn-primary').forEach(btn => {
        btn.addEventListener('pointermove', e => {
            if (e.pointerType !== 'mouse') return;
            const r = btn.getBoundingClientRect();
            btn.style.translate = `${(e.clientX - r.left - r.width / 2) * .08}px ${(e.clientY - r.top - r.height / 2) * .12}px`;
        });
        btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    $$('.field input').forEach(initPasswordDots);
    setSky();
    updateClocks();
    setInterval(() => { setSky(); updateClocks(); }, 30000);
    initLetterImages();
    initLightbox();
    bindEvents();
    initPointerEffects();
    showLogin();
});