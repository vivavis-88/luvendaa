/* =========================================================
   Hamburger menu: ADDITIVE script (load AFTER script.js, before jar.js)
   - Fixed hamburger button, shown once the person is past login/intro.
   - Slide-in panel with the main pages + a "Drop box" section (Jar of Reasons).
   - Uses goTo() from script.js; the jar opens through window.openJarPage (set by jar.js).
   ========================================================= */
(() => {
    'use strict';
    const SELF = document.currentScript;
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const HER = (typeof HER_NAME !== 'undefined' && HER_NAME) || 'Avee';
    const MENU_VIEWS = ['dedication', 'songs'];   // the menu shows on the Dedication and Songs pages

    // Only the Jar lives in the menu. To add more pages later, add another item here.
    const ITEMS = [
        { label: 'Dedication', desc: 'Letters from my week, just for you', view: 'dedication' },
        { label: 'Jar of Reasons', desc: 'Pull a slip and see why I love you', view: 'reasons', jar: true }
    ];

    let btn, panel, backdrop, open = false, lastView = null, busy = false;

    function ensureStyles() {
        try {
            if (getComputedStyle(document.documentElement).getPropertyValue('--menu-css').trim()) return;
            if (!SELF || !SELF.src) return;
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = SELF.src.replace(/\.js(\?.*)?$/, '.css$1');
            document.head.append(l);
        } catch (e) { /* ignore */ }
    }

    function build() {
        btn = document.createElement('button');
        btn.type = 'button'; btn.className = 'hb'; btn.id = 'hbBtn';
        btn.setAttribute('aria-label', 'Open menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'hbPanel');
        btn.innerHTML = '<span class="hb-lines" aria-hidden="true"><i></i><i></i><i></i></span>';

        backdrop = document.createElement('div');
        backdrop.className = 'hb-backdrop'; backdrop.id = 'hbBackdrop';

        panel = document.createElement('nav');
        panel.className = 'hb-panel'; panel.id = 'hbPanel';
        panel.setAttribute('aria-label', 'Site menu');

        const head = document.createElement('div');
        head.className = 'hb-head';
        head.innerHTML = `<span class="hb-kicker">For ${HER}</span><span class="hb-title">Menu</span>`;

        const ul = document.createElement('ul');
        ul.className = 'hb-list';
        let i = 0;
        ITEMS.forEach(it => {
            if (it.group) {  // optional section heading
                const g = document.createElement('li');
                g.className = 'hb-group-li'; g.style.setProperty('--i', i++);
                g.innerHTML = `<p class="hb-group">${it.group}</p>`;
                g.style.opacity = '';
                ul.append(g);
            }
            const li = document.createElement('li');
            li.style.setProperty('--i', i++);
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'hb-item'; b.dataset.view = it.view;
            b.innerHTML = `<span class="hb-label">${it.label}</span><span class="hb-desc">${it.desc}</span>`;
            b.addEventListener('click', () => go(it));
            li.append(b); ul.append(li);
        });
        panel.append(head, ul);
        document.body.append(backdrop, panel, btn);
    }

    const activeView = () => { const v = $('.view.is-active'); return v ? v.dataset.view : null; };

    function sync() {
        const v = activeView();
        if (v) lastView = v;
        const inSite = MENU_VIEWS.includes(lastView);
        // body overflow is locked while any letter / password overlay is open: tuck the button away then
        const overlayOpen = !open && $$('.overlay').some(o => !o.hidden && getComputedStyle(o).display !== 'none');
        const show = inSite && !overlayOpen;
        btn.classList.toggle('is-shown', show || open);
        if (!inSite && open) closeMenu(false);
        $$('.hb-item', panel).forEach(b => {
            if (b.dataset.view === lastView) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
        });
    }

    function openMenu() {
        if (open) return;
        open = true;
        btn.classList.add('is-open'); panel.classList.add('is-open'); backdrop.classList.add('is-open');
        btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-label', 'Close menu');
        document.documentElement.classList.add('hb-lock');
        setTimeout(() => { const f = $('.hb-item[aria-current="page"]', panel) || $('.hb-item', panel); if (f && open) f.focus({ preventScroll: true }); }, 260);
    }
    function closeMenu(restoreFocus = true) {
        if (!open) return;
        open = false;
        btn.classList.remove('is-open'); panel.classList.remove('is-open'); backdrop.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Open menu');
        document.documentElement.classList.remove('hb-lock');
        if (restoreFocus) btn.focus({ preventScroll: true });
        sync();
    }

    async function go(it) {
        if (busy) return;
        busy = true;
        closeMenu(false);
        await sleep(300);
        try {
            if (it.jar && typeof window.openJarPage === 'function') await window.openJarPage();
            else if (typeof goTo === 'function') await goTo(it.view);
        } finally { busy = false; }
    }

    function bind() {
        btn.addEventListener('click', () => (open ? closeMenu() : openMenu()));
        backdrop.addEventListener('click', () => closeMenu());
        document.addEventListener('keydown', e => {
            if (!open) return;
            if (e.key === 'Escape') { e.preventDefault(); closeMenu(); }
            else if (e.key === 'Tab') {
                const f = [btn, ...$$('.hb-item', panel)];
                const first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });
        const app = $('#app');
        const mo = new MutationObserver(sync);
        if (app) mo.observe(app, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
        mo.observe(document.body, { attributes: true, attributeFilter: ['style'] });
        $$('.overlay').forEach(o => mo.observe(o, { attributes: true, attributeFilter: ['hidden', 'class'] }));
        window.addEventListener('hb:sync', sync);   // other scripts (Songs.js) can nudge the menu after navigating
    }

    function init() {
        ensureStyles();
        if ($('#hbBtn')) return;
        build(); bind(); sync();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();