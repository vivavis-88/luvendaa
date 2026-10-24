/* =========================================================
   Jar of Reasons: ADDITIVE script (load AFTER script.js and menu.js)
   - Adds the Jar page. It is opened from the hamburger menu (window.openJarPage).
   - Reasons: built-in list + optional reasons.json + ones added on this device.
   - Adding reasons sits behind the same writer password as the Writer's desk.
   ========================================================= */
(() => {
    'use strict';
    const SELF = document.currentScript;
    const WRITER_HASH = '87956d3ae9c89082996d12864c56012f3e7069cc12267cec99f030e1852fc071';
    const K_ADD = 'reasonsJar.added', K_SEEN = 'reasonsJar.seen';
    const BASE = [
"Your bossy attitude","How family oriented you are","How you talk to me about your mom and dada","Your interest in Manga/Manhwa","Your cuteness","The very first pic of you in the skirt","How you care for your friends","How you're not into videogames","How you have different hobbies","Your paintings","Your stuffed toys","Your smile (bonus: how your smile compliments your eyes)","Your meekness","Your passion for your studies","How you're considerate","Your kindness","How you treat others","You're a one call away person","How you like chess!","How you're thoughtful","Your lowkeyness","Feral.","How you enjoy sending me reels","How you're so passionate about your future","You're graceful in all aspects","How you don't tolerate shits","How eager you are to achieve things","How you're considerate to yourself","How matured you've grown","How you love your lil bro","Your taste in music (barely saw the side pero i can tell you have a good taste!)","How affectionate you are!","How you appreciate me","How you find joy in small things","How you can make rules","How you love dumplings","Your laugh","Your vulnerabilities","Your hair","Your taste in art","Your interest in reading","You match my energy","Your love.","You're cool","Your generosity","How you wrote about me","How you're expressive","How you're so full of yourself when you're with your friends","How you laugh at my certain gestures","You like my kisses (assuming yarn)","How you're low-key patient","Your accountability","How you always update me","You like ube","How you find value in things!","Your standards (sana pasok)","You like substack too","How cute you complain about things","You believe in God","How you're attentive","How you easily fall asleep","Your voice, damn it.","How you look at things differently","How we settle stuffs","How you don't give up on me","How I mean so much to you","67!! kimi, your \"I love you\"","PELOOOO (luv this word)","Kimi, I like your ponytail","Your dream to go to Japan","How you wanna get married","Your ideal marriage and plan","How you have a specific age for marriage","How you let me love you","How you respect me :))","How you're comfy with me!","How excited you are when u have chika","How you describe certain things","How you're good at visualizing..","What you've been through","Your cutie tummy","How you listen to advice!","How you easily get tampo","Your cute photos","YOUR COMFY TAKING PHOTOS!","Your idea of liking someone","Your relationship with your bro! (I like your makapelo-ness with him! makapelonessss)","How you taught me certain words that I deeply feel inlove with like JINJA","How you say you miss me","How my heart yearns for you","The idea you had of me","How you're unique itself!","Your cutie face and expression when you find something sus, funny","How you're continually growing from your shortcomings!","How you have a deep and genuine and cute relationship with your mom!","How you say \"omkii\"","How you're able to control your emotions after a short passing wind","The idea of you tease me","How you permitted me to finally say \"I love you\"","Kase you are my Langga."
    ];
    const PAPERS = [['#fff27a','#ffe44f'],['#ffc9dc','#ffadc9'],['#c9f1d6','#a9e6bd'],['#cfe6ff','#b0d4ff'],['#ffd9b3','#ffc38a']];
    const SLIPC = ['#fff3a0','#ffd0e0','#d4f3df','#d6e9ff','#ffe0c2'];
    const SPARKS = [[12, 7, 0, 6, 10], [28, 9, 2.2, 5, -12], [44, 6.5, 4.1, 7, 16], [60, 8, 1.1, 5, -8], [76, 7.5, 3.3, 6, 12], [90, 9.5, 5.2, 4, -14]];

    const $ = (s, r = document) => r.querySelector(s);
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
    const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
    const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } };
    const sha256 = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join('');

    let added = get(K_ADD, []), seen = get(K_SEEN, []), busy = false, unlocked = false, opening = false, jarFrom = 'dedication';
    const all = () => BASE.concat(added);

    function loadAssets() {
        if (!document.querySelector('link[data-jar-font]')) {
            const f = document.createElement('link'); f.rel = 'stylesheet'; f.dataset.jarFont = '1';
            f.href = 'https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&display=swap';
            document.head.append(f);
        }
        if (!getComputedStyle(document.documentElement).getPropertyValue('--jar-css').trim() && SELF && SELF.src) {
            const l = document.createElement('link'); l.rel = 'stylesheet';
            l.href = SELF.src.replace(/\.js(\?.*)?$/, '.css$1'); document.head.append(l);
        }
    }

    function inject() {
        const app = $('#app');
        if (!app || $('#jarView')) return false;

        // Jar page
        const view = document.createElement('section');
        view.className = 'view view-jar'; view.id = 'jarView'; view.dataset.view = 'reasons'; view.hidden = true;
        view.setAttribute('aria-labelledby', 'jar-title');
        const sparks = SPARKS.map(s => `<i class="jar-spark" style="--x:${s[0]}%;--t:${s[1]}s;--d:${s[2]}s;--s:${s[3]}px;--dx:${s[4]}px"></i>`).join('');
        view.innerHTML = `
        <div class="stage">
            <nav class="topnav" aria-label="Page navigation">
                <button type="button" class="btn btn-ghost btn-small" id="jarBack">Back</button>
                <button type="button" class="btn btn-ghost btn-small" id="jarHome">Home</button>
            </nav>
            <header class="page-head">
                <p class="label">For ${(typeof HER_NAME !== 'undefined' && HER_NAME) || 'Avee'}</p>
                <h1 id="jar-title">Jar of Reasons</h1>
                <p class="muted">Every slip is a reason I love you. Pull one.</p>
            </header>
            <div class="jar-stage">
                <div class="jar-scene">
                    ${sparks}
                    <button type="button" class="jar-wrap" id="jarBtn" aria-label="Pull a reason from the jar">
                        <div class="jar-glass" id="jarSlips"></div>
                        <div class="jar-label">Reasons</div>
                        <div class="jar-lid"></div>
                    </button>
                    <div class="jar-shelf" aria-hidden="true"></div>
                </div>
                <button type="button" class="btn btn-primary" id="jarPick">Pull a reason</button>
                <p class="jar-meta" id="jarMeta" role="status"></p>
            </div>
            <div class="jar-add">
                <details id="jarAddBox">
                    <summary>Add a new reason</summary>
                    <div id="jarGate">
                        <input type="password" id="jarPass" placeholder="Writer password" autocomplete="off">
                        <p class="jar-err" id="jarErr" role="alert"></p>
                        <div class="jar-row"><button type="button" class="btn btn-primary" id="jarUnlock">Unlock</button></div>
                    </div>
                    <div id="jarForm" hidden>
                        <textarea id="jarNew" maxlength="200" placeholder="Reason why I love you because..."></textarea>
                        <p class="jar-ok" id="jarOk" role="status"></p>
                        <div class="jar-row">
                            <button type="button" class="btn btn-primary" id="jarAdd">Drop it in the jar</button>
                            <button type="button" class="btn btn-ghost" id="jarExport">Export reasons.json</button>
                        </div>
                        <p class="jar-hint">New reasons are saved in this browser. To show them on her device, export the file and put reasons.json next to index.html.</p>
                    </div>
                </details>
            </div>
        </div>`;
        app.append(view);

        const ov = document.createElement('div');
        ov.className = 'jar-overlay'; ov.id = 'jarOverlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Reason');
        ov.innerHTML = `
            <div class="jar-note" id="jarNote">
                <div class="jar-note-why">Reason why I love you because:</div>
                <div class="jar-note-txt" id="jarTxt"></div>
                <div class="jar-note-heart" aria-hidden="true">&#9829;</div>
            </div>
            <div class="jar-note-actions">
                <button type="button" class="btn btn-primary" id="jarAgain">Pull another</button>
            </div>`;
        document.body.append(ov);
        return true;
    }

    function ensureLoader() {
        if ($('#jarLoader')) return;
        const d = document.createElement('div');
        d.id = 'jarLoader'; d.className = 'jar-loader'; d.setAttribute('role', 'status'); d.setAttribute('aria-live', 'polite');
        d.innerHTML = `<div class="jar-loader-in">
            <div class="jar-paper" aria-hidden="true"><i></i><i></i></div>
            <p class="jar-loader-txt">Have fun unfolding reasons!</p>
            <div class="jar-dots" aria-hidden="true"><i></i><i></i><i></i></div>
        </div>`;
        document.body.append(d);
    }

    function fillJar() {
        const j = $('#jarSlips'); if (!j) return;
        j.innerHTML = '';
        // packed full: rows of overlapping slips from just under the neck down to the base
        const n = Math.min(170, 120 + (all().length / 4 | 0));
        for (let i = 0; i < n; i++) {
            const s = document.createElement('div'); s.className = 'jar-slip';
            s.style.left = (Math.random() * 146 - 2) + 'px';
            s.style.top = (22 + (i / n) * 232 + Math.random() * 16) + 'px';
            s.style.background = SLIPC[(Math.random() * SLIPC.length) | 0];
            s.style.transform = 'rotate(' + (Math.random() * 150 - 75) + 'deg)';
            j.append(s);
        }
    }
    const setMeta = t => { const m = $('#jarMeta'); if (m) m.textContent = t || ''; };
    const noteOpen = () => $('#jarOverlay').classList.contains('is-on');
    function closeNote() { $('#jarOverlay').classList.remove('is-on'); document.body.style.overflow = ''; }

    async function pick() {
        if (busy) return; busy = true;
        setMeta('');
        const list = all(), jar = $('#jarBtn'), note = $('#jarNote');
        let pool = list.map((_, i) => i).filter(i => !seen.includes(i));
        if (!pool.length) { seen = []; pool = list.map((_, i) => i); }
        const i = pool[Math.random() * pool.length | 0];
        seen.push(i); put(K_SEEN, seen);

        if (noteOpen() && !reduced()) {
            await note.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(-30px) rotate(6deg) scale(.8)' }], { duration: 220 }).finished;
            closeNote();
        }
        if (!reduced()) {
            jar.classList.add('is-shaking'); await sleep(700); jar.classList.remove('is-shaking');
            jar.classList.add('is-open'); await sleep(250);
            const f = document.createElement('div'); f.className = 'jar-fly'; jar.append(f);
            await f.animate([
                { transform: 'translate(0,30px) rotate(0) scale(.7)', opacity: 0 },
                { transform: 'translate(0,-30px) rotate(-10deg) scale(1)', opacity: 1, offset: .35 },
                { transform: 'translate(0,-95px) rotate(14deg) scale(1.25)', opacity: 1 }
            ], { duration: 850, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' }).finished;
            f.remove();
        }
        const p = PAPERS[Math.random() * PAPERS.length | 0], t = list[i];
        note.style.setProperty('--paper', p[0]); note.style.setProperty('--paper2', p[1]);
        note.style.transform = 'rotate(' + (Math.random() * 5 - 2.5) + 'deg)';
        $('#jarTxt').textContent = /[.!?)"]$/.test(t) ? t : t + '.';
        $('#jarOverlay').classList.add('is-on'); document.body.style.overflow = 'hidden';
        $('#jarAgain').focus({ preventScroll: true });
        if (!reduced()) note.animate([
            { opacity: 0, transform: 'translateY(40px) scale(.15) rotate(25deg)' },
            { opacity: 1, transform: 'translateY(-8px) scale(1.06) rotate(-4deg)', offset: .65 },
            { opacity: 1, transform: 'translateY(0) scale(1)' }
        ], { duration: 700, easing: 'cubic-bezier(.3,1.2,.4,1)' });
        jar.classList.remove('is-open');
        if (seen.length >= list.length) setMeta('That was every single one. Happy birthday and I love you!');
        busy = false;
    }

    async function unlock() {
        const v = $('#jarPass').value;
        let ok = false;
        try { ok = (await sha256(v)) === WRITER_HASH; } catch (e) { $('#jarErr').textContent = 'This browser cannot check the password here.'; return; }
        if (!ok) { $('#jarErr').textContent = 'That is not the writer password.'; $('#jarPass').value = ''; return; }
        unlocked = true; $('#jarErr').textContent = ''; $('#jarPass').value = '';
        $('#jarGate').hidden = true; $('#jarForm').hidden = false; $('#jarNew').focus();
    }
    let okTimer = 0;
    function addReason() {
        const t = $('#jarNew').value.trim(); if (!t) return;
        added.push(t); put(K_ADD, added); $('#jarNew').value = '';
        fillJar();
        $('#jarOk').textContent = 'Dropped in the jar.';
        clearTimeout(okTimer); okTimer = setTimeout(() => { $('#jarOk').textContent = ''; }, 2200);
        if (!reduced()) $('#jarBtn').animate([{ transform: 'scale(1.06)' }, { transform: 'scale(1)' }], { duration: 450, easing: 'cubic-bezier(.3,1.5,.5,1)' });
    }
    function exportReasons() {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(all(), null, 2)], { type: 'application/json' }));
        a.download = 'reasons.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    // Go to a view through script.js's goTo(); if that fails or stalls, switch the views by hand.
    async function navTo(name) {
        const isOn = () => { const v = $('.view.is-active'); return !!v && v.dataset.view === name; };
        try {
            if (typeof window.goTo === 'function') {
                await Promise.race([Promise.resolve(window.goTo(name)), sleep(2500)]);
            }
        } catch (e) { /* fall through to manual switch */ }
        if (isOn()) return;
        const target = document.querySelector('.view[data-view="' + name + '"]');
        if (!target) return;
        document.querySelectorAll('.view').forEach(v => { v.classList.remove('is-active'); v.hidden = true; });
        target.hidden = false;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        target.classList.add('is-active');
    }

    // Opened from the hamburger menu: loading screen first, then the page.
    async function openPage() {
        if (opening) return;
        const cur = $('.view.is-active');
        if (cur && cur.dataset.view === 'reasons') return;
        if (cur) jarFrom = cur.dataset.view;
        opening = true;
        ensureLoader();
        const ld = $('#jarLoader');
        ld.classList.add('is-on');
        try {
            await sleep(reduced() ? 0 : 400);
            fillJar(); setMeta(''); closeNote();
            await navTo('reasons');
            window.scrollTo(0, 0);
            await sleep(reduced() ? 300 : 1000);
        } catch (e) { /* never leave the loader stuck */ }
        finally {
            ld.classList.remove('is-on');
            await sleep(reduced() ? 0 : 400);
            opening = false;
        }
    }
    window.openJarPage = openPage;

    function bind() {
        const on = (s, e, f) => { const n = $(s); if (n) n.addEventListener(e, f); };
        on('#jarBack', 'click', () => navTo(jarFrom && jarFrom !== 'reasons' ? jarFrom : 'dedication'));
        on('#jarHome', 'click', () => navTo('main'));
        on('#jarBtn', 'click', pick); on('#jarPick', 'click', pick); on('#jarAgain', 'click', pick);
                on('#jarOverlay', 'click', e => { if (e.target.id === 'jarOverlay') closeNote(); });
        on('#jarUnlock', 'click', unlock);
        on('#jarPass', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); unlock(); } });
        on('#jarAdd', 'click', addReason); on('#jarExport', 'click', exportReasons);
        document.addEventListener('keydown', e => { if (e.key === 'Escape' && noteOpen()) closeNote(); });
        on('#jarAddBox', 'toggle', () => { if (!$('#jarAddBox').open && !unlocked) $('#jarErr').textContent = ''; });
    }

    async function loadPublished() {
        try {
            const r = await fetch('reasons.json', { cache: 'no-store' }); if (!r.ok) return;
            const d = await r.json(), arr = Array.isArray(d) ? d : d.reasons;
            if (Array.isArray(arr) && arr.length) { BASE.length = 0; arr.forEach(x => BASE.push(String(x))); added = []; put(K_ADD, []); }
        } catch (e) { /* no reasons.json yet */ }
    }
    async function init() {
        loadAssets();
        if (!inject()) return;
        bind(); fillJar();
        await loadPublished(); fillJar();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();