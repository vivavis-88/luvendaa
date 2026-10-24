/* =========================================================
   Theme manager: the ONE place that knows about themes.
   Load AFTER main.js. The inline bootstrap in <head> has already set
   <html data-theme> (and data-theme-gate on a first visit) before first paint.

   - Pre-login picker (#themeGate): preview a theme live, Continue saves it.
   - In-site switcher: bottom-left button, switches instantly and saves.
   - Ambient effects (snow / embers) exist only while Winter / Sunset is active.
   - Public API: window.SiteTheme.get() / .set(id)
   ========================================================= */
(() => {
    'use strict';

    const STORAGE_KEY = 'site-theme';
    const DEFAULT_THEME = 'normal';
    const THEMES = [
        { id: 'sunset', name: 'Sunset', sub: 'Warm golden hour',  bar: '#2E1426' },
        { id: 'normal', name: 'Normal', sub: 'The original look', bar: '#021024' },
        { id: 'winter', name: 'Winter', sub: 'Frosted and calm',  bar: '#E6F1FC' }
    ];

    const root = document.documentElement;
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const isValid = id => THEMES.some(t => t.id === id);
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const wait = ms => new Promise(res => setTimeout(res, reduced() ? 0 : ms));
    const rand = (min, max) => Math.random() * (max - min) + min;

    /* ---------- storage (validated, never throws) ---------- */
    const readSaved = () => { try { const v = localStorage.getItem(STORAGE_KEY); return isValid(v) ? v : null; } catch (e) { return null; } };
    const writeSaved = id => { try { localStorage.setItem(STORAGE_KEY, id); } catch (e) { /* private mode: still works for this visit */ } };

    let current = isValid(root.getAttribute('data-theme')) ? root.getAttribute('data-theme') : DEFAULT_THEME;
    let gate, gateLeaving = false, fx, live, switcher, switcherBtn, pop;

    /* ---------- applying a theme ---------- */
    function apply(id, { persist = false, animate = true, announce = false } = {}) {
        if (!isValid(id)) id = DEFAULT_THEME;
        const changed = id !== current || root.getAttribute('data-theme') !== id;

        const run = () => {
            root.setAttribute('data-theme', id);
            current = id;
            const meta = $('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', THEMES.find(t => t.id === id).bar);
            buildFx();
            syncControls();
        };

        if (changed) {
            if (animate && !reduced() && typeof document.startViewTransition === 'function') {
                document.startViewTransition(run);
            } else if (animate && !reduced()) {
                root.classList.add('theme-switching');
                run();
                setTimeout(() => root.classList.remove('theme-switching'), 650);
            } else {
                run();
            }
            root.dispatchEvent(new CustomEvent('themechange', { detail: { theme: id } }));
            if (announce && live) live.textContent = THEMES.find(t => t.id === id).name + ' theme applied';
        }
        if (persist) writeSaved(id);
    }

    /* ---------- keep every radio control in step with the active theme ---------- */
    function syncControls() {
        $$('[data-theme-option]').forEach(el => {
            const on = el.dataset.themeOption === current;
            el.setAttribute('aria-checked', String(on));
            el.tabIndex = on ? 0 : -1;
        });
    }

    /* Radio-group behaviour: roving tabindex + arrow keys, as native radios do */
    function wireRadioGroup(group, onPick) {
        const items = () => $$('[data-theme-option]', group);
        group.addEventListener('click', e => {
            const el = e.target.closest('[data-theme-option]');
            if (el) onPick(el.dataset.themeOption);
        });
        group.addEventListener('keydown', e => {
            const list = items();
            const i = list.findIndex(el => el === document.activeElement);
            if (i < 0) return;
            let n = null;
            if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % list.length;
            else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + list.length) % list.length;
            else if (e.key === 'Home') n = 0;
            else if (e.key === 'End') n = list.length - 1;
            if (n === null) return;
            e.preventDefault();
            onPick(list[n].dataset.themeOption);
            list[n].focus({ preventScroll: true });
        });
    }

    /* ---------- ambient effects: built only for Sunset / Winter, removed otherwise ---------- */
    function buildFx() {
        if (!fx) return;
        fx.textContent = '';
        if (reduced() || (current !== 'winter' && current !== 'sunset')) return;
        const frag = document.createDocumentFragment();
        const make = (cls, props) => {
            const el = document.createElement('span');
            el.className = cls;
            Object.entries(props).forEach(([k, v]) => el.style.setProperty(k, v));
            frag.append(el);
        };
        if (current === 'winter') {
            for (let i = 0; i < 30; i++) make('flake', {
                '--x': rand(0, 100).toFixed(1) + '%', '--s': rand(3, 7).toFixed(1) + 'px',
                '--d': rand(12, 24).toFixed(1) + 's', '--dl': '-' + rand(0, 24).toFixed(1) + 's',
                '--sway': rand(-70, 70).toFixed(0) + 'px', '--o': rand(.5, .9).toFixed(2)
            });
        } else {
            for (let i = 0; i < 14; i++) make('mote', {
                '--x': rand(0, 100).toFixed(1) + '%', '--s': rand(5, 12).toFixed(1) + 'px',
                '--d': rand(20, 36).toFixed(1) + 's', '--dl': '-' + rand(0, 36).toFixed(1) + 's',
                '--sway': rand(-45, 45).toFixed(0) + 'px', '--o': rand(.25, .55).toFixed(2)
            });
        }
        fx.append(frag);
    }

    /* ---------- pre-login picker ---------- */
    function openGate() {
        const app = $('#app');
        if (app) app.setAttribute('inert', '');                 // nothing behind the picker is reachable
        const login = $('.view-login');
        if (login) login.classList.remove('is-active');         // so its entrance animation plays when revealed
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        const card = $('.theme-card[aria-checked="true"]', gate);
        if (card) card.focus({ preventScroll: true });
    }

    async function closeGate() {
        if (gateLeaving) return;
        gateLeaving = true;
        writeSaved(current);                                    // the choice is remembered from now on
        gate.classList.add('is-leaving');
        const login = $('.view-login');
        if (login) login.classList.add('is-active');            // cross-fades in under the leaving picker
        const app = $('#app');
        if (app) app.removeAttribute('inert');
        await wait(750);
        root.removeAttribute('data-theme-gate');
        gate.classList.remove('is-leaving');
        const pw = $('#loginPassword');
        if (pw) pw.focus({ preventScroll: true });
        gateLeaving = false;
    }

    function initGate() {
        gate = $('#themeGate');
        if (!gate) return;
        wireRadioGroup($('.theme-options', gate), id => apply(id, { persist: false, announce: true }));
        $('#gateContinue').addEventListener('click', closeGate);
        if (root.hasAttribute('data-theme-gate')) openGate();
    }

    /* ---------- in-site switcher ---------- */
    function initSwitcher() {
        switcher = document.createElement('div');
        switcher.className = 'theme-switcher';
        switcher.innerHTML =
            '<button type="button" class="theme-switcher-btn" id="themeSwitcherBtn" aria-label="Change theme" aria-haspopup="true" aria-expanded="false" aria-controls="themePop">' +
                '<span class="ts-icon" aria-hidden="true"></span></button>' +
            '<div class="theme-pop" id="themePop" hidden>' +
                '<p class="theme-pop-title" id="themePopTitle">Theme</p>' +
                '<div role="radiogroup" aria-labelledby="themePopTitle">' +
                THEMES.map(t =>
                    '<button type="button" class="theme-opt" role="radio" aria-checked="false" tabindex="-1" data-theme-option="' + t.id + '">' +
                        '<span class="to-dot" aria-hidden="true"></span>' +
                        '<span class="to-text"><span>' + t.name + '</span><span class="to-sub">' + t.sub + '</span></span>' +
                        '<span class="to-tick" aria-hidden="true"></span></button>').join('') +
                '</div></div>';
        document.body.append(switcher);
        switcherBtn = $('#themeSwitcherBtn');
        pop = $('#themePop');

        const isOpen = () => pop.classList.contains('is-open');
        const open = () => {
            if (isOpen()) return;
            pop.hidden = false;
            requestAnimationFrame(() => requestAnimationFrame(() => pop.classList.add('is-open')));
            switcherBtn.setAttribute('aria-expanded', 'true');
            setTimeout(() => { const o = $('.theme-opt[aria-checked="true"]', pop); if (o && isOpen()) o.focus({ preventScroll: true }); }, reduced() ? 0 : 140);
        };
        const close = (restoreFocus = false) => {
            if (!isOpen()) return;
            pop.classList.remove('is-open');
            switcherBtn.setAttribute('aria-expanded', 'false');
            setTimeout(() => { if (!isOpen()) pop.hidden = true; }, reduced() ? 0 : 320);
            if (restoreFocus) switcherBtn.focus({ preventScroll: true });
        };

        switcherBtn.addEventListener('click', () => (isOpen() ? close() : open()));
        wireRadioGroup($('[role="radiogroup"]', pop), id => apply(id, { persist: true, announce: true }));
        document.addEventListener('pointerdown', e => { if (isOpen() && !switcher.contains(e.target)) close(); });
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && isOpen()) { e.stopPropagation(); close(true); }
        }, true);
    }

    /* ---------- init ---------- */
    function init() {
        live = $('#themeLive');
        fx = document.createElement('div');
        fx.className = 'theme-fx';
        fx.id = 'themeFx';
        fx.setAttribute('aria-hidden', 'true');
        document.body.append(fx);

        initSwitcher();
        initGate();
        apply(current, { animate: false });                     // sync controls, meta colour and effects with the bootstrap
        window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', buildFx);
        window.addEventListener('storage', e => {               // another tab changed the theme
            if (e.key === STORAGE_KEY && isValid(e.newValue) && e.newValue !== current && !root.hasAttribute('data-theme-gate')) {
                apply(e.newValue, { animate: false });
            }
        });
    }

    window.SiteTheme = {
        themes: THEMES.map(t => t.id),
        get: () => current,
        set: id => apply(id, { persist: !root.hasAttribute('data-theme-gate'), announce: true })
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
