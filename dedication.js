/* =========================================================
   Dedication page — ADDITIVE script (load AFTER script.js)
   - Injects its own page + overlays; nothing in index.html needs rewriting.
   - Reuses from script.js: goTo, animateEnvelopeOpen/Close, resetEnvelope,
     and the existing lightbox (.zoomable-trigger).
   - Writing / managing letters sits behind a writer password (client-side only).
   - Storage: letters -> localStorage, photos -> IndexedDB (localStorage fallback).
     Both live ONLY in this browser on this device.
   ========================================================= */
(() => {
    'use strict';

    const SELF = document.currentScript;   // used to auto-load dedication.css if it was not linked

    /* ---------------- Config ---------------- */
    const CFG = {
        TZ: 'Asia/Manila',
        OFFSET_MS: 8 * 3600 * 1000,      // Manila is UTC+8 with no daylight saving
        RELEASE_DAY: 0,                  // 0 = Sunday
        RELEASE_HOUR: 18,                // default release time: 6:00 PM Manila
        RELEASE_MINUTE: 0,
        MAX_IMG_BYTES: 10 * 1024 * 1024, // reject originals above 10 MB
        MAX_IMG_EDGE: 1600,              // photos are resized to this on save
        LS_KEY: 'dedication.letters.v1',
        LS_IMG: 'dedication.img.',
        UNLOCK_KEY: 'dedication.writer.unlocked',
        // SHA-256 of the writer password (the password itself is not stored in this file)
        WRITER_HASH: '87956d3ae9c89082996d12864c56012f3e7069cc12267cec99f030e1852fc071',
        HER: (typeof HER_NAME !== 'undefined' && HER_NAME) || 'Avee',
        YOU: (typeof YOUR_NAME !== 'undefined' && YOUR_NAME) || ''
    };
    const DESIGNS = ['Classic flap', 'Cream with a stamp', 'Layered paper', 'Sealed with a heart', 'Journal fold'];
    const STATUS_LABEL = { draft: 'Draft', scheduled: 'Scheduled', available: 'Available', early: 'Opened Early' };

    /* ---------------- Small helpers ---------------- */
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const sleep = ms => new Promise(r => setTimeout(r, reduced() ? 0 : ms));
    const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const pad = n => String(n).padStart(2, '0');
    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    const uid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'l' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    async function sha256(text) {
        const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
        return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // If the stylesheet was not linked in index.html, load it from next to this script.
    function ensureStyles() {
        try {
            if (getComputedStyle(document.documentElement).getPropertyValue('--ded-css').trim()) return;
            if (!SELF || !SELF.src) return;
            const l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = SELF.src.replace(/\.js(\?.*)?$/, '.css$1');
            document.head.append(l);
        } catch (e) { /* ignore */ }
    }

    /* ---------------- Time (Asia/Manila) ---------------- */
    const todayManila = () => new Date(Date.now() + CFG.OFFSET_MS).toISOString().slice(0, 10);
    const toInput = ts => new Date(ts + CFG.OFFSET_MS).toISOString().slice(0, 16);
    const fromInput = v => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v) ? Date.parse(v + ':00+08:00') : NaN;
    const fmtDate = iso => iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso + 'T00:00:00Z')) : '';
    const fmtShort = iso => iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(new Date(iso + 'T00:00:00Z')) : '';
    const fmtStamp = ts => new Intl.DateTimeFormat('en-US', { timeZone: CFG.TZ, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ts));

    // Upcoming Sunday (configured hour) strictly after `afterTs`; never returns an already-expired slot.
    function nextReleaseSlot(afterTs = Date.now()) {
        const m = new Date(afterTs + CFG.OFFSET_MS);
        const ahead = (CFG.RELEASE_DAY - m.getUTCDay() + 7) % 7;
        let t = Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate() + ahead, CFG.RELEASE_HOUR, CFG.RELEASE_MINUTE) - CFG.OFFSET_MS;
        if (t <= afterTs) t += 7 * 864e5;
        return t;
    }
    function countdownText(ms, withSeconds) {
        let s = Math.max(0, Math.floor(ms / 1000));
        const d = Math.floor(s / 86400); s %= 86400;
        const h = Math.floor(s / 3600); s %= 3600;
        const m = Math.floor(s / 60); s %= 60;
        const p = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
        return [d ? p(d, 'day') : null, p(h, 'hour'), p(m, 'minute'), withSeconds ? p(s, 'second') : null].filter(Boolean).join(', ');
    }
    function countdownParts(ms) {
        let s = Math.max(0, Math.floor(ms / 1000));
        const d = Math.floor(s / 86400); s %= 86400;
        const h = Math.floor(s / 3600); s %= 3600;
        const m = Math.floor(s / 60); s %= 60;
        return { d, h, m, s };
    }

    /* ---------------- Data model ---------------- */
    let letters = [];
    let images = {};      // id -> data URL (loaded from the image store)
    let dedFrom = 'main';
    let nextRelease = null;   // release time of the next scheduled letter (drives the countdown section)

    function normalize(raw) {
        if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
        const releaseAt = Number.isFinite(raw.releaseAt) ? raw.releaseAt : null;
        const week = Number.isInteger(raw.week) && raw.week > 0 ? raw.week : null;
        const now = Date.now();
        return {
            id: raw.id,
            title: String(raw.title || '').slice(0, 120),
            body: String(raw.body || ''),
            preview: String(raw.preview || '').slice(0, 160),
            written: /^\d{4}-\d{2}-\d{2}$/.test(raw.written) ? raw.written : todayManila(),
            week,
            design: Number.isInteger(raw.design) && raw.design >= 0 && raw.design < DESIGNS.length ? raw.design : 0,
            releaseAt,
            state: (raw.state === 'scheduled' && releaseAt !== null) ? 'scheduled' : 'draft',
            early: !!raw.early,
            createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : now,
            updatedAt: Number.isFinite(raw.updatedAt) ? raw.updatedAt : now
        };
    }
    function loadLetters() {
        let raw = null;
        try {
            raw = localStorage.getItem(CFG.LS_KEY);
            if (!raw) return [];
            const arr = JSON.parse(raw);
            if (!Array.isArray(arr)) throw new Error('not an array');
            const seen = new Set();
            return arr.map(normalize).filter(l => l && !seen.has(l.id) && seen.add(l.id));
        } catch (err) {
            // Keep a copy of unreadable data so it is never silently overwritten.
            try { if (raw) localStorage.setItem(CFG.LS_KEY + '.corrupt-' + Date.now(), raw); } catch (_) { /* ignore */ }
            return [];
        }
    }
    function persist() {
        try { localStorage.setItem(CFG.LS_KEY, JSON.stringify(letters)); return true; }
        catch (err) { return false; }
    }
    const find = id => letters.find(l => l.id === id);

    function statusOf(l, now = Date.now()) {
        if (l.state === 'draft') return 'draft';
        if (l.releaseAt <= now) return 'available';
        return l.early ? 'early' : 'scheduled';
    }
    const readable = st => st === 'available' || st === 'early';
    const sorted = arr => [...arr].sort((a, b) => a.written.localeCompare(b.written) || (a.week || 0) - (b.week || 0) || a.createdAt - b.createdAt);

    /* ---------------- Image store (IndexedDB, localStorage fallback) ---------------- */
    let dbPromise = null;
    const openDb = () => dbPromise || (dbPromise = new Promise((res, rej) => {
        if (!window.indexedDB) return rej(new Error('no idb'));
        const r = indexedDB.open('dedication-db', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('images');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
    }));
    async function idbWrite(fn) {
        const db = await openDb();
        return new Promise((res, rej) => {
            const t = db.transaction('images', 'readwrite');
            fn(t.objectStore('images'));
            t.oncomplete = () => res();
            t.onerror = t.onabort = () => rej(t.error);
        });
    }
    const imgStore = {
        async all() {
            const out = {};
            try {
                const db = await openDb();
                await new Promise((res, rej) => {
                    const s = db.transaction('images').objectStore('images');
                    const k = s.getAllKeys(), v = s.getAll();
                    s.transaction.oncomplete = () => { k.result.forEach((key, i) => { out[key] = v.result[i]; }); res(); };
                    s.transaction.onerror = () => rej(s.transaction.error);
                });
            } catch (e) { /* fall through to localStorage */ }
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (k && k.startsWith(CFG.LS_IMG)) out[k.slice(CFG.LS_IMG.length)] = localStorage.getItem(k);
                }
            } catch (e) { /* ignore */ }
            return out;
        },
        async set(id, data) {
            try { await idbWrite(s => s.put(data, id)); try { localStorage.removeItem(CFG.LS_IMG + id); } catch (_) { /* ignore */ } }
            catch (e) { localStorage.setItem(CFG.LS_IMG + id, data); }   // throws on quota -> caller reports it
        },
        async del(id) {
            try { await idbWrite(s => s.delete(id)); } catch (e) { /* ignore */ }
            try { localStorage.removeItem(CFG.LS_IMG + id); } catch (e) { /* ignore */ }
        }
    };

    /* ---------------- Overlay helpers ---------------- */
    function lockScroll() { document.body.style.overflow = 'hidden'; }
    function unlockScroll() { if (!$$('.overlay:not([hidden])').length) document.body.style.overflow = ''; }
    async function showOverlay(ov) {
        ov.hidden = false; lockScroll(); ov.scrollTop = 0;
        await raf2();
        ov.classList.add('is-visible');
    }
    async function hideOverlay(ov) {
        ov.classList.remove('is-visible');
        await sleep(450);
        ov.hidden = true; unlockScroll();
    }
    function trapTab(e, root) {
        const f = $$('button:not([disabled]), input:not([disabled]):not([hidden]), select:not([disabled]), textarea:not([disabled]), summary', root).filter(n => n.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    let toastTimer = 0;
    function toast(msg) {
        const t = $('#dedToast');
        t.textContent = msg; t.classList.add('is-visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('is-visible'), 3800);
    }

    /* ---------------- Writer password (client-side gate) ---------------- */
    let unlocked = false;   // memory only: every page load starts locked
    try { sessionStorage.removeItem(CFG.UNLOCK_KEY); } catch (e) { /* ignore */ }

    function syncLock() {
        const note = $('#dedLockNote'), btn = $('#dedLock');
        if (note) { note.textContent = unlocked ? 'Unlocked' : 'Locked'; note.classList.toggle('is-open', unlocked); }
        if (btn) btn.hidden = !unlocked;
    }
    function setUnlocked(v) {
        unlocked = v;
        syncLock();
    }
    let passResolve = null;
    function askPassword() {
        if (unlocked) return Promise.resolve(true);
        return new Promise(res => {
            if (passResolve) passResolve(false);
            passResolve = res;
            $('#dedPassInput').value = '';
            $('#dedPassError').textContent = '';
            showOverlay($('#dedPassOverlay')).then(() => $('#dedPassInput').focus({ preventScroll: true }));
        });
    }
    function closePass(ok) {
        const r = passResolve; passResolve = null;
        hideOverlay($('#dedPassOverlay'));
        if (r) r(ok);
    }
    async function submitPassword(e) {
        e.preventDefault();
        const input = $('#dedPassInput');
        let ok = false, unsupported = false;
        if (!(window.crypto && crypto.subtle)) unsupported = true;
        else {
            try { ok = (await sha256(input.value.trim())) === CFG.WRITER_HASH; } catch (_) { ok = false; }
        }
        if (ok) {
            setUnlocked(true);
            closePass(true);
            toast('Writer’s desk unlocked.');
        } else {
            $('#dedPassError').textContent = unsupported
                ? 'The password check needs a secure (https) page.'
                : 'That password is not right. Try again.';
            input.value = ''; input.focus();
            const f = $('#dedPassForm'); f.classList.remove('is-shaking'); void f.offsetWidth; f.classList.add('is-shaking');
        }
    }

    /* ---------------- DOM injection ---------------- */
    function injectDom() {
        const app = $('#app');
        if (!app || $('#dedView')) return;

        const view = document.createElement('section');
        view.className = 'view view-dedication'; view.id = 'dedView';
        view.dataset.view = 'dedication'; view.hidden = true;
        view.setAttribute('aria-labelledby', 'ded-title');
        view.innerHTML = `
        <div class="stage">
            <nav class="topnav" aria-label="Page navigation">
                <button type="button" class="btn btn-ghost btn-small" id="dedBack">Back</button>
                <button type="button" class="btn btn-ghost btn-small" id="dedHome">Home</button>
            </nav>
            <header class="page-head">
                <p class="label">For ${CFG.HER}</p>
                <h1 id="ded-title">Dedication</h1>
                <p class="muted">A little piece of my heart, written one week at a time.</p>
            </header>

            <div class="ded-page">
                <div class="ded-toolbar"><button type="button" class="btn btn-primary ded-btn-lg" id="dedWrite">Write a Letter</button></div>

                <section class="ded-collection" aria-labelledby="ded-collection-title">
                    <div class="ded-section-head">
                        <h2 class="ded-section-title" id="ded-collection-title">Letters</h2>
                        <span class="ded-section-note" id="dedCollectionNote"></span>
                    </div>
                    <ul class="ded-grid" id="dedGrid" aria-label="Dedication letters" hidden></ul>
                    <div class="ded-empty" id="dedEmpty">
                        <div class="ded-empty-env" aria-hidden="true"><span class="ded-empty-paper"></span><span class="ded-empty-flap"></span><span class="ded-empty-heart"></span></div>
                        <h2>No letters yet.</h2>
                        <p>Your first letter is waiting to be written.</p>
                        <button type="button" class="btn btn-primary" id="dedWriteFirst">Write the First Letter</button>
                    </div>
                </section>

                <details class="ded-manage" id="dedManage">
                    <summary>
                        <span class="ded-summary-main"><span class="ded-summary-label">Writer's desk</span><span id="dedManageCount" class="muted"></span></span>
                        <span class="ded-lock-note" id="dedLockNote">Locked</span>
                        <span class="ded-chevron" aria-hidden="true"></span>
                    </summary>
                    <div class="ded-manage-body">
                        <div class="ded-manage-inner">
                            <div id="dedManageList"></div>
                            <div class="ded-backup">
                                <p>Letters are saved in this browser only. Export a backup to keep a copy or move them to another device.</p>
                                <div class="ded-actions-row">
                                    <button type="button" class="btn btn-ghost" id="dedExport">Export Backup</button>
                                    <button type="button" class="btn btn-ghost" id="dedImport">Import Backup</button>
                                    <button type="button" class="btn btn-ghost" id="dedLock" hidden>Lock Desk</button>
                                </div>
                                <input type="file" id="dedImportFile" accept="application/json,.json" hidden>
                            </div>
                        </div>
                    </div>
                </details>

                <section class="ded-next" id="dedNext" aria-label="Next letter">
                    <span class="ded-next-art" aria-hidden="true"><b></b><i></i></span>
                    <div class="ded-next-main" id="dedNextFull" hidden>
                        <div class="ded-next-text">
                            <h2 class="ded-next-title">The next letter is waiting.</h2>
                            <p class="ded-next-letter" id="dedNextLetter"></p>
                            <p class="ded-next-when" id="dedNextWhen"></p>
                        </div>
                        <div class="ded-clock" role="timer" aria-label="Time until the next letter">
                            <div class="ded-unit"><span class="ded-num" id="dedCdD">00</span><span class="ded-unit-label">Days</span></div>
                            <div class="ded-unit"><span class="ded-num" id="dedCdH">00</span><span class="ded-unit-label">Hours</span></div>
                            <div class="ded-unit"><span class="ded-num" id="dedCdM">00</span><span class="ded-unit-label">Minutes</span></div>
                            <div class="ded-unit"><span class="ded-num" id="dedCdS">00</span><span class="ded-unit-label">Seconds</span></div>
                        </div>
                    </div>
                    <div class="ded-next-main" id="dedNextNone">
                        <div class="ded-next-text">
                            <h2 class="ded-next-title">No letter is scheduled yet.</h2>
                            <p class="ded-next-when">When you schedule one, its countdown will appear here.</p>
                        </div>
                    </div>
                </section>
            </div>
        </div>`;
        app.append(view);

        // Entry point on the Main page (below the existing "next" block)
        const mainNext = $('.view-main .next-block');
        if (mainNext) {
            const blk = document.createElement('section');
            blk.className = 'next-block ded-next-block';
            blk.setAttribute('aria-labelledby', 'ded-next-title');
            blk.innerHTML = `<h2 id="ded-next-title">Something's new.. Check it out! hehe</h2><p class="muted">Letters from my week, written just for you.</p><button type="button" class="btn btn-primary" id="toDedication">Open Dedication</button>`;
            mainNext.after(blk);
        }
        // Entry point on the Open When page (between Back and Home)
        const owNav = $('.view-openwhen .topnav');
        if (owNav) {
            const b = el('button', 'btn btn-ghost btn-small', 'Dedication');
            b.type = 'button'; b.id = 'owDedication';
            owNav.insertBefore(b, owNav.lastElementChild);
        }

        const overlays = document.createElement('div');
        overlays.innerHTML = `
        <div class="overlay ded-editor-overlay" id="dedEditorOverlay" hidden>
            <form class="modal card ded-editor" id="dedForm" role="dialog" aria-modal="true" aria-labelledby="dedEditorTitle" novalidate>
                <div class="ded-editor-head"><h2 id="dedEditorTitle">New Dedication</h2><span class="ded-pill ded-pill-new" id="dedEditorStatus">New</span></div>
                <p class="muted">Write it however it feels. Nothing is shown to anyone until you schedule it.</p>
                <div class="ded-row">
                    <label class="ded-field"><span>Title</span><input id="dedTitle" type="text" maxlength="120" autocomplete="off" placeholder="The Things I Never Said"></label>
                    <label class="ded-field ded-narrow"><span>Week (optional)</span><input id="dedWeek" type="number" min="1" max="999" inputmode="numeric"></label>
                </div>
                <div class="ded-row">
                    <label class="ded-field"><span>Date written</span><input id="dedWritten" type="date"></label>
                    <label class="ded-field"><span>Envelope style</span><select id="dedDesign"></select></label>
                </div>
                <label class="ded-field"><span>Short preview (optional)</span><input id="dedPreview" type="text" maxlength="160" autocomplete="off" placeholder="A little entry about what stayed in my mind this week..."></label>
                <label class="ded-field"><span>Your letter</span><textarea id="dedBody" placeholder="Dear love,"></textarea></label>
                <div class="ded-field">
                    <span>Photograph (optional)</span>
                    <div class="ded-photo-preview" id="dedPhotoPrev" hidden><img alt="Selected photograph preview" id="dedPhotoImg"></div>
                    <div class="ded-inline-actions">
                        <button type="button" class="btn btn-ghost" id="dedPhotoPick">Choose photo</button>
                        <button type="button" class="btn btn-ghost" id="dedPhotoRemove" hidden>Remove photo</button>
                    </div>
                    <input type="file" id="dedFile" accept="image/*" hidden>
                    <span class="ded-help">JPG, PNG or WebP, up to 10 MB. It is resized for saving; proportions are kept.</span>
                </div>
                <div class="ded-field">
                    <label for="dedRelease">Release date and time (Manila time)</label>
                    <input id="dedRelease" type="datetime-local">
                    <div class="ded-inline-actions">
                        <button type="button" class="btn btn-ghost" id="dedSetSunday">Upcoming Sunday</button>
                        <button type="button" class="btn btn-ghost" id="dedSetNow">Right now</button>
                    </div>
                    <span class="ded-help" id="dedReleaseHint"></span>
                </div>
                <p class="ded-error" id="dedFormError" role="alert" aria-live="polite"></p>
                <div class="ded-actions">
                    <button type="button" class="btn btn-ghost" id="dedCancel">Cancel</button>
                    <button type="button" class="btn btn-ghost" id="dedPreviewBtn">Preview Letter</button>
                    <button type="button" class="btn btn-ghost" id="dedSaveDraft">Save Draft</button>
                    <button type="submit" class="btn btn-primary" id="dedSaveLetter">Save Letter</button>
                </div>
            </form>
        </div>

        <div class="overlay letter-overlay" id="dedOverlay" hidden>
            <div class="private-panel" role="dialog" aria-modal="true" aria-label="Dedication letter">
                <div class="envelope-wrap" id="dedWrap">
                    <div class="env-collapse"><div class="env-clip"><div class="env-holder">
                        <div class="envelope is-static" aria-hidden="true">
                            <span class="env-back"></span><span class="env-sheet"></span><span class="env-flap"></span>
                            <span class="env-front"><span class="env-to" id="dedReadTo"></span><span class="postmark" id="dedReadStamp"></span></span>
                        </div>
                    </div></div></div>
                    <div class="letter-collapse"><div class="letter-clip">
                        <article class="letter-paper ded-paper">
                            <div class="letter-content">
                                <span class="ded-pill ded-pill-early ded-flag" id="dedReadFlag" hidden>Preview</span>
                                <header class="ded-read-head"><h2 id="dedReadTitle"></h2><p class="ded-read-meta" id="dedReadMeta"></p></header>
                                <figure class="letter-figure has-image zoomable-trigger" id="dedReadFig" hidden>
                                    <img class="letter-image" id="dedReadImg" alt="Photograph shared in this letter">
                                    <span class="zoom-hint">Click to zoom HD</span>
                                </figure>
                                <div class="ded-body" id="dedReadBody"></div>
                                <p class="ded-sign" id="dedReadSign"></p>
                            </div>
                            <div class="letter-actions">
                                <button type="button" class="btn btn-ghost" id="dedReadBack">Back to letters</button>
                                <button type="button" class="btn btn-primary" id="dedReadClose">Close letter</button>
                            </div>
                        </article>
                    </div></div>
                </div>
            </div>
        </div>

        <div class="overlay modal-overlay ded-confirm-overlay" id="dedConfirmOverlay" hidden>
            <div class="modal card" role="alertdialog" aria-modal="true" aria-labelledby="dedConfirmTitle" aria-describedby="dedConfirmText">
                <h2 id="dedConfirmTitle"></h2>
                <p class="muted" id="dedConfirmText"></p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-ghost" id="dedConfirmNo">Cancel</button>
                    <button type="button" class="btn btn-primary" id="dedConfirmYes"></button>
                </div>
            </div>
        </div>

        <div class="overlay modal-overlay ded-confirm-overlay" id="dedPassOverlay" hidden>
            <form class="modal card ded-pass-form" id="dedPassForm" role="dialog" aria-modal="true" aria-labelledby="dedPassTitle" novalidate>
                <h2 id="dedPassTitle">Only Clide'y can edit this... shh..</h2>
                <p class="muted">pwease respect hihih</p>
                <input id="dedPassInput" class="ded-pass-input" type="password" placeholder="PASSWORD" aria-label="Password" autocomplete="off" autocapitalize="off" spellcheck="false">
                <p class="ded-error" id="dedPassError" role="alert" aria-live="polite"></p>
                <div class="modal-actions">
                    <button type="button" class="btn btn-ghost" id="dedPassCancel">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="dedPassSubmit">Unlock</button>
                </div>
            </form>
        </div>
        <div class="ded-toast" id="dedToast" role="status" aria-live="polite"></div>`;
        document.body.append(...overlays.children);

        const sel = $('#dedDesign');
        DESIGNS.forEach((name, i) => { const o = el('option', null, name); o.value = String(i); sel.append(o); });
        syncLock();
    }

    /* ---------------- Rendering ---------------- */
    function excerpt(text) {
        const t = text.replace(/\s+/g, ' ').trim();
        return t.length > 120 ? t.slice(0, 117).trimEnd() + '...' : t;
    }
    function renderCard(l, now) {
        const st = statusOf(l, now);
        const li = el('li');
        const b = el('button', `ded-card ded-v${l.design} is-${st}`);
        b.type = 'button'; b.dataset.id = l.id;
        b.setAttribute('aria-label', `${l.title || 'Untitled'}, ${STATUS_LABEL[st]}`);
        b.append(el('span', 'ded-flap'), el('span', 'ded-seal'), el('span', 'ded-stamp'), el('span', 'ded-fold'));

        const body = el('span', 'ded-card-body');
        if (l.week) body.append(el('span', 'ded-kicker', `Week ${pad(l.week)}`));
        body.append(el('span', 'ded-card-title', l.title || 'Untitled'));
        body.append(el('span', 'ded-card-date', `Written ${fmtDate(l.written)}`));
        const teaser = readable(st) ? (l.preview || excerpt(l.body)) : (l.preview || 'A letter is on its way...');
        body.append(el('span', 'ded-card-excerpt', teaser));

        const foot = el('span', 'ded-card-foot');
        foot.append(el('span', `ded-pill ded-pill-${st}`, STATUS_LABEL[st]));
        if (st === 'scheduled' || st === 'early') {
            const c = el('span', 'ded-card-count', st === 'early' ? 'Early access' : countdownText(l.releaseAt - now));
            if (st === 'scheduled') c.dataset.release = String(l.releaseAt);
            foot.append(c);
        } else {
            foot.append(el('span', 'ded-card-count', `Released ${fmtShort(new Date(l.releaseAt + CFG.OFFSET_MS).toISOString().slice(0, 10))}`));
        }
        body.append(foot);
        b.append(body);
        li.append(b);
        return li;
    }
    function manageRow(l, now) {
        const st = statusOf(l, now);
        const row = el('li', 'ded-item'); row.dataset.id = l.id;
        const head = el('div', 'ded-item-head');
        const t = el('div'); t.append(el('div', 'ded-item-title', (l.week ? `Week ${pad(l.week)}: ` : '') + (l.title || 'Untitled')));
        t.append(el('div', 'ded-item-meta', `Written ${fmtDate(l.written)}` + (l.releaseAt ? ` | Releases ${fmtStamp(l.releaseAt)}` : '')));
        head.append(t, el('span', `ded-pill ded-pill-${st}`, STATUS_LABEL[st]));
        const acts = el('div', 'ded-item-actions');
        const add = (label, act, cls = 'btn btn-ghost') => { const b = el('button', cls, label); b.type = 'button'; b.dataset.act = act; acts.append(b); };
        add('Edit', 'edit'); add('Preview', 'preview');
        if (st === 'scheduled') add('Open now', 'early');
        if (st === 'early') add('Return to schedule', 'unearly');
        add('Delete', 'delete', 'btn btn-ghost ded-btn-danger');
        row.append(head, acts);
        return row;
    }
    function renderManage(now) {
        const host = $('#dedManageList'); host.replaceChildren();
        const group = (title, arr, emptyText) => {
            const g = el('div', 'ded-group'); g.append(el('h3', null, title));
            if (!arr.length) g.append(el('p', 'ded-none', emptyText));
            else { const ul = el('ul', 'ded-list'); arr.forEach(l => ul.append(manageRow(l, now))); g.append(ul); }
            host.append(g);
        };
        host.className = 'ded-groups';
        group('Drafts', sorted(letters.filter(l => l.state === 'draft')), 'No drafts.');
        group('Scheduled and released', sorted(letters.filter(l => l.state !== 'draft')), 'Nothing scheduled yet.');
        $('#dedManageCount').textContent = letters.length ? `(${letters.length})` : '';
    }

    // Countdown section — driven by the same statusOf()/releaseAt data as the cards.
    function setClock(now) {
        if (nextRelease == null) return;
        const p = countdownParts(nextRelease - now);
        $('#dedCdD').textContent = pad(p.d); $('#dedCdH').textContent = pad(p.h);
        $('#dedCdM').textContent = pad(p.m); $('#dedCdS').textContent = pad(p.s);
    }
    function updateNext(now) {
        const next = letters.filter(l => statusOf(l, now) === 'scheduled').sort((a, b) => a.releaseAt - b.releaseAt)[0];
        nextRelease = next ? next.releaseAt : null;
        $('#dedNextFull').hidden = !next;
        $('#dedNextNone').hidden = !!next;
        $('#dedNext').classList.toggle('is-none', !next);
        if (!next) return;
        $('#dedNextLetter').textContent = next.title ? `“${next.title}”` : '';
        $('#dedNextLetter').hidden = !next.title;
        $('#dedNextWhen').textContent = `Arrives ${fmtStamp(next.releaseAt)} (Manila time)`;
        setClock(now);
    }
    function refresh() {
        if (!$('#dedGrid')) return;
        const now = Date.now();
        const grid = $('#dedGrid'); grid.replaceChildren();
        const shown = sorted(letters.filter(l => l.state !== 'draft'));
        shown.forEach(l => grid.append(renderCard(l, now)));
        grid.hidden = !shown.length;
        $('#dedEmpty').hidden = !!shown.length;
        $('#dedCollectionNote').textContent = shown.length ? `${shown.length} ${shown.length === 1 ? 'letter' : 'letters'}` : '';
        updateNext(now);
        renderManage(now);
    }
    function tick() {
        if (document.hidden) return;
        const view = $('#dedView');
        if (!view || view.hidden) return;
        const now = Date.now();
        let expired = nextRelease != null && nextRelease - now <= 0;
        $$('[data-release]', view).forEach(n => {
            const ms = Number(n.dataset.release) - now;
            if (ms <= 0) expired = true;
            else n.textContent = countdownText(ms);
        });
        if (expired) refresh();   // availability is recomputed from the clock, and the next letter takes over
        else setClock(now);
    }

    /* ---------------- Writer's desk (animated details) ---------------- */
    let setDesk = () => {};
    function bindDesk() {
        const d = $('#dedManage'), s = $('summary', d), body = $('.ded-manage-body', d);
        let anim = null;
        setDesk = open => {
            if (anim) { anim.cancel(); anim = null; }
            d.classList.toggle('is-open', open);
            if (reduced() || !body.animate) { d.open = open; return; }
            const ease = 'cubic-bezier(.2,.7,.2,1)';
            if (open) {
                d.open = true;
                const h = body.scrollHeight;
                anim = body.animate([{ height: '0px', opacity: 0 }, { height: h + 'px', opacity: 1 }], { duration: 320, easing: ease });
                anim.onfinish = () => { anim = null; };
            } else {
                const h = body.offsetHeight;
                const a = anim = body.animate([{ height: h + 'px', opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 240, easing: ease });
                a.onfinish = () => { d.open = false; if (anim === a) anim = null; };
            }
        };
        s.addEventListener('click', async e => {
            e.preventDefault();
            const opening = !d.classList.contains('is-open');
            if (opening && !(await askPassword())) return;
            setDesk(opening);
        });
    }

    /* ---------------- Reader (shared opening experience) ---------------- */
    const reader = { busy: false, trigger: null };
    function fillReader(l, imgSrc, isPreview) {
        $('#dedReadTo').textContent = `For ${CFG.HER}`;
        $('#dedReadStamp').textContent = fmtShort(l.written);
        $('#dedReadTitle').textContent = l.title || 'Untitled';
        $('#dedReadMeta').textContent = [l.week ? `Week ${pad(l.week)}` : '', `Written ${fmtDate(l.written)}`].filter(Boolean).join(' | ');
        $('#dedReadFlag').hidden = !isPreview;
        const body = $('#dedReadBody'); body.replaceChildren();
        (l.body || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean).forEach(p => body.append(el('p', 'ded-para', p)));
        $('#dedReadSign').textContent = CFG.YOU ? `- ${CFG.YOU}` : '';
        const fig = $('#dedReadFig'), img = $('#dedReadImg');
        img.onerror = () => { fig.hidden = true; };
        if (imgSrc) { img.src = imgSrc; fig.hidden = false; } else { img.removeAttribute('src'); fig.hidden = true; }
        $('.ded-paper').scrollTop = 0;
    }
    async function openReader(l, { imgSrc = images[l.id], preview = false, trigger = null } = {}) {
        if (reader.busy) return;
        reader.busy = true; reader.trigger = trigger || document.activeElement;
        const ov = $('#dedOverlay'), wrap = $('#dedWrap');
        fillReader(l, imgSrc, preview);
        resetEnvelope(wrap);
        await showOverlay(ov);
        await sleep(700);
        await animateEnvelopeOpen(wrap);
        $('#dedReadClose').focus({ preventScroll: true });
        reader.busy = false;
    }
    async function closeReader() {
        const ov = $('#dedOverlay');
        if (ov.hidden || reader.busy) return;
        reader.busy = true;
        await animateEnvelopeClose($('#dedWrap'));
        ov.classList.remove('is-visible');
        await sleep(600);
        ov.hidden = true; resetEnvelope($('#dedWrap')); unlockScroll();
        reader.busy = false;
        if (reader.trigger && document.contains(reader.trigger)) reader.trigger.focus({ preventScroll: true });
    }
    async function onCardClick(card) {
        const l = find(card.dataset.id);
        if (!l || card.classList.contains('is-opening')) return;
        const st = statusOf(l);
        if (!readable(st)) {
            card.classList.remove('is-nudge'); void card.offsetWidth; card.classList.add('is-nudge');
            toast(`Not yet, my love. ${countdownText(l.releaseAt - Date.now())} to go.`);
            return;
        }
        card.classList.add('is-opening');
        await sleep(520);
        card.classList.remove('is-opening');
        openReader(l, { trigger: card });
    }

    /* ---------------- Confirm dialog ---------------- */
    let confirmResolve = null;
    function askConfirm(title, text, okLabel) {
        return new Promise(res => {
            confirmResolve = res;
            $('#dedConfirmTitle').textContent = title;
            $('#dedConfirmText').textContent = text;
            $('#dedConfirmYes').textContent = okLabel;
            showOverlay($('#dedConfirmOverlay')).then(() => $('#dedConfirmNo').focus({ preventScroll: true }));
        });
    }
    function resolveConfirm(v) {
        const r = confirmResolve; confirmResolve = null;
        hideOverlay($('#dedConfirmOverlay'));
        if (r) r(v);
    }

    /* ---------------- Editor ---------------- */
    const ed = { id: null, image: null, dirty: false, saving: false, trigger: null };
    const setErr = msg => { $('#dedFormError').textContent = msg || ''; };

    function showPhoto() {
        const prev = $('#dedPhotoPrev');
        if (ed.image) { $('#dedPhotoImg').src = ed.image; prev.hidden = false; }
        else { $('#dedPhotoImg').removeAttribute('src'); prev.hidden = true; }
        $('#dedPhotoRemove').hidden = !ed.image;
        $('#dedPhotoPick').textContent = ed.image ? 'Replace photo' : 'Choose photo';
    }
    function updateReleaseHint() {
        const v = $('#dedRelease').value;
        const hint = $('#dedReleaseHint');
        if (!v) { hint.textContent = 'Needed for Save Letter. Leave empty if this is only a draft.'; return; }
        const ts = fromInput(v);
        if (Number.isNaN(ts)) { hint.textContent = 'That date and time is not valid.'; return; }
        const diff = ts - Date.now();
        hint.textContent = diff > 0 ? `Becomes available ${fmtStamp(ts)}, in ${countdownText(diff)}.` : 'That time has already passed, so the letter will be available right away.';
    }
    function defaultRelease() {
        const base = Math.max(Date.now(), ...letters.filter(l => l.state === 'scheduled').map(l => l.releaseAt));
        return nextReleaseSlot(base);
    }
    function openEditor(id, trigger) {
        const l = id ? find(id) : null;
        ed.id = l ? l.id : null; ed.dirty = false; ed.saving = false;
        ed.trigger = trigger || document.activeElement;
        ed.image = l ? (images[l.id] || null) : null;
        $('#dedEditorTitle').textContent = l ? 'Edit Dedication' : 'New Dedication';
        const st = l ? statusOf(l) : null;
        const pill = $('#dedEditorStatus'); pill.textContent = st ? STATUS_LABEL[st] : 'New'; pill.className = `ded-pill ded-pill-${st || 'new'}`;
        $('#dedTitle').value = l ? l.title : '';
        $('#dedWeek').value = l ? (l.week || '') : String(Math.max(0, ...letters.map(x => x.week || 0)) + 1);
        $('#dedWritten').value = l ? l.written : todayManila();
        $('#dedDesign').value = String(l ? l.design : letters.length % DESIGNS.length);
        $('#dedPreview').value = l ? l.preview : '';
        $('#dedBody').value = l ? l.body : '';
        $('#dedRelease').value = l ? (l.releaseAt ? toInput(l.releaseAt) : '') : toInput(defaultRelease());
        $('#dedFile').value = '';
        setErr(''); showPhoto(); updateReleaseHint(); setBusy(false);
        showOverlay($('#dedEditorOverlay')).then(() => setTimeout(() => $('#dedTitle').focus({ preventScroll: true }), reduced() ? 0 : 200));
    }
    // Writing always goes through the password gate.
    async function guardedEditor(id, trigger) {
        if (await askPassword()) openEditor(id, trigger);
    }
    async function closeEditor() {
        await hideOverlay($('#dedEditorOverlay'));
        setUnlocked(false); setDesk(false);   // password is needed again for the next letter
        if (ed.trigger && document.contains(ed.trigger)) ed.trigger.focus({ preventScroll: true });
    }
    async function requestCloseEditor() {
        if (ed.saving) return;
        if (ed.dirty && !(await askConfirm('Discard your changes?', 'What you wrote here has not been saved yet.', 'Discard'))) return;
        if (ed.dirty) await sleep(0);
        closeEditor();
    }
    function setBusy(b) {
        ed.saving = b;
        $$('#dedForm button').forEach(x => { x.disabled = b; });
    }
    function readForm() {
        const weekRaw = $('#dedWeek').value.trim();
        const relRaw = $('#dedRelease').value;
        return {
            title: $('#dedTitle').value.trim(),
            week: weekRaw === '' ? null : Number(weekRaw),
            written: $('#dedWritten').value,
            design: Number($('#dedDesign').value) || 0,
            preview: $('#dedPreview').value.trim(),
            body: $('#dedBody').value.replace(/\s+$/, ''),
            releaseRaw: relRaw,
            releaseAt: relRaw ? fromInput(relRaw) : null
        };
    }
    function validate(d, mode) {
        if (mode === 'draft') {
            if (!d.title && !d.body) return 'Add a title or a few words before saving a draft.';
        } else {
            if (!d.title) return 'Give this letter a title.';
            if (!d.body) return 'Write something in the letter before saving it.';
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d.written)) return 'Choose the date this letter was written.';
        if (d.week !== null && (!Number.isInteger(d.week) || d.week < 1 || d.week > 999)) return 'Week must be a whole number from 1 to 999.';
        if (d.releaseRaw && Number.isNaN(d.releaseAt)) return 'Enter a valid release date and time.';
        if (mode === 'letter' && !d.releaseRaw) return 'Choose when this letter should be released.';
        return '';
    }
    async function saveFromForm(mode) {
        if (ed.saving) return;
        const d = readForm();
        const err = validate(d, mode);
        if (err) { setErr(err); return; }
        setErr(''); setBusy(true);
        const snapshot = JSON.stringify(letters);
        const prevImages = { ...images };
        try {
            const now = Date.now();
            let l = ed.id ? find(ed.id) : null;
            if (!l) { l = { id: uid(), createdAt: now, early: false }; letters.push(l); }
            const releaseChanged = l.releaseAt !== d.releaseAt;
            Object.assign(l, {
                title: d.title, body: d.body, preview: d.preview, written: d.written, week: d.week, design: d.design,
                releaseAt: d.releaseAt, state: mode === 'draft' ? 'draft' : 'scheduled', updatedAt: now
            });
            if (releaseChanged || mode === 'draft') l.early = false;

            const before = images[l.id] || null;
            if (ed.image !== before) {
                if (ed.image) { await imgStore.set(l.id, ed.image); images[l.id] = ed.image; }
                else { await imgStore.del(l.id); delete images[l.id]; }
            }
            if (!persist()) throw new Error('storage');
            ed.id = l.id;
            await closeEditorAfterSave(mode, l);
        } catch (e) {
            letters = JSON.parse(snapshot).map(normalize).filter(Boolean);
            images = prevImages;
            setErr(e && e.message === 'storage'
                ? 'This browser could not save the letter (storage may be full). Export a backup, then try again.'
                : 'The photo could not be saved (storage may be full). Try a smaller photo or remove it.');
        } finally {
            setBusy(false);
        }
    }
    async function closeEditorAfterSave(mode, l) {
        ed.dirty = false;
        refresh();
        toast(mode === 'draft' ? 'Draft saved. It stays hidden until you schedule it.'
            : statusOf(l) === 'available' ? 'Letter saved and available now.' : `Letter saved. It opens ${fmtStamp(l.releaseAt)}.`);
        await closeEditor();
    }
    function previewFromForm() {
        const d = readForm();
        if (!d.title && !d.body) { setErr('Write something first, then preview it.'); return; }
        setErr('');
        openReader({ id: 'preview', title: d.title, body: d.body, week: d.week, written: /^\d{4}-\d{2}-\d{2}$/.test(d.written) ? d.written : todayManila() },
            { imgSrc: ed.image, preview: true, trigger: $('#dedPreviewBtn') });
    }

    /* Photo selection: validate, decode, resize, keep proportions */
    function compressImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                URL.revokeObjectURL(url);
                if (!img.naturalWidth || !img.naturalHeight) return reject(new Error('empty'));
                const k = Math.min(1, CFG.MAX_IMG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
                const c = document.createElement('canvas');
                c.width = Math.max(1, Math.round(img.naturalWidth * k));
                c.height = Math.max(1, Math.round(img.naturalHeight * k));
                const ctx = c.getContext('2d');
                ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
                ctx.drawImage(img, 0, 0, c.width, c.height);
                resolve(c.toDataURL('image/jpeg', 0.86));
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
            img.src = url;
        });
    }
    async function onFileChosen(file) {
        if (!file) return;
        if (!file.type.startsWith('image/')) { setErr('Please choose an image file (JPG, PNG or WebP).'); return; }
        if (file.size > CFG.MAX_IMG_BYTES) { setErr(`That photo is ${(file.size / 1048576).toFixed(1)} MB. Please choose one under 10 MB.`); return; }
        try {
            ed.image = await compressImage(file);
            ed.dirty = true; setErr(''); showPhoto();
        } catch (e) {
            setErr('That file could not be read as a picture. Try a different photo.');
        } finally { $('#dedFile').value = ''; }
    }

    /* ---------------- Writer's desk actions ---------------- */
    async function onManageClick(e) {
        const btn = e.target.closest('button[data-act]');
        if (!btn) return;
        const row = btn.closest('.ded-item'); const l = row && find(row.dataset.id);
        if (!l) return;
        if (!(await askPassword())) return;
        switch (btn.dataset.act) {
            case 'edit': openEditor(l.id, btn); break;
            case 'preview': openReader(l, { preview: true, trigger: btn }); break;
            case 'early': l.early = true; l.updatedAt = Date.now(); persist(); refresh(); toast('Opened early. It can be read now.'); break;
            case 'unearly': l.early = false; l.updatedAt = Date.now(); persist(); refresh(); toast('Back on its original schedule.'); break;
            case 'delete': {
                const ok = await askConfirm('Delete this letter?', `"${l.title || 'Untitled'}" and its photo will be removed permanently.`, 'Delete');
                if (!ok) break;
                letters = letters.filter(x => x.id !== l.id);
                await imgStore.del(l.id); delete images[l.id];
                persist(); refresh(); toast('Letter deleted.');
                break;
            }
        }
    }

    /* ---------------- Backup (export / import) ---------------- */
    function exportData() {
        const payload = { version: 1, exportedAt: Date.now(), letters, images };
        const a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(payload)], { type: 'application/json' }));
        a.download = `dedication-backup-${todayManila()}.json`;
        document.body.append(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1500);
    }
    async function importData(file) {
        try {
            const p = JSON.parse(await file.text());
            const incoming = (Array.isArray(p.letters) ? p.letters : []).map(normalize).filter(Boolean);
            if (!incoming.length) throw new Error('empty');
            for (const n of incoming) {
                const cur = find(n.id);
                if (cur && cur.updatedAt >= n.updatedAt) continue;
                letters = letters.filter(x => x.id !== n.id); letters.push(n);
                const img = p.images && p.images[n.id];
                if (typeof img === 'string' && img.startsWith('data:image/')) { await imgStore.set(n.id, img); images[n.id] = img; }
            }
            if (!persist()) throw new Error('storage');
            refresh(); toast(`Imported ${incoming.length} letter${incoming.length === 1 ? '' : 's'}.`);
        } catch (e) { toast("That file isn't a valid Dedication backup."); }
    }

    /* ---------------- Wiring ---------------- */
    function openPage() {
        const current = $('.view.is-active');
        const from = current ? current.dataset.view : 'main';
        if (from !== 'dedication') dedFrom = from;
        refresh();
        goTo('dedication');
    }
    function bind() {
        const on = (sel, ev, fn) => { const n = $(sel); if (n) n.addEventListener(ev, fn); };
        on('#toDedication', 'click', openPage);
        on('#owDedication', 'click', openPage);
        on('#dedBack', 'click', () => goTo(dedFrom && dedFrom !== 'dedication' ? dedFrom : 'main'));
        on('#dedHome', 'click', () => goTo('main'));

        $('#dedGrid').addEventListener('click', e => { const c = e.target.closest('.ded-card'); if (c) onCardClick(c); });
        on('#dedWrite', 'click', e => guardedEditor(null, e.currentTarget));
        on('#dedWriteFirst', 'click', e => guardedEditor(null, e.currentTarget));
        on('#dedManageList', 'click', onManageClick);
        on('#dedExport', 'click', exportData);
        on('#dedImport', 'click', () => $('#dedImportFile').click());
        on('#dedImportFile', 'change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importData(f); });
        on('#dedLock', 'click', () => { setUnlocked(false); setDesk(false); toast('Writer’s desk locked.'); });
        bindDesk();

        // Password prompt
        on('#dedPassForm', 'submit', submitPassword);
        on('#dedPassCancel', 'click', () => closePass(false));

        // Editor
        const form = $('#dedForm');
        form.addEventListener('submit', e => { e.preventDefault(); saveFromForm('letter'); });
        form.addEventListener('input', () => { ed.dirty = true; });
        on('#dedRelease', 'input', updateReleaseHint);
        on('#dedSaveDraft', 'click', () => saveFromForm('draft'));
        on('#dedPreviewBtn', 'click', previewFromForm);
        on('#dedCancel', 'click', requestCloseEditor);
        on('#dedSetSunday', 'click', () => { $('#dedRelease').value = toInput(nextReleaseSlot()); ed.dirty = true; updateReleaseHint(); });
        on('#dedSetNow', 'click', () => { $('#dedRelease').value = toInput(Date.now()); ed.dirty = true; updateReleaseHint(); });
        on('#dedPhotoPick', 'click', () => $('#dedFile').click());
        on('#dedFile', 'change', e => onFileChosen(e.target.files[0]));
        on('#dedPhotoRemove', 'click', () => { ed.image = null; ed.dirty = true; showPhoto(); });

        // Reader + confirm
        on('#dedReadClose', 'click', closeReader);
        on('#dedReadBack', 'click', closeReader);
        on('#dedConfirmYes', 'click', () => resolveConfirm(true));
        on('#dedConfirmNo', 'click', () => resolveConfirm(false));

        document.addEventListener('keydown', e => {
            const lb = $('#lightboxOverlay');
            if (lb && !lb.hidden) return;   // existing lightbox owns Escape while open
            const top = ['dedPassOverlay', 'dedConfirmOverlay', 'dedOverlay', 'dedEditorOverlay'].map(id => $('#' + id)).find(o => o && !o.hidden);
            if (!top) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                if (top.id === 'dedPassOverlay') closePass(false);
                else if (top.id === 'dedConfirmOverlay') resolveConfirm(false);
                else if (top.id === 'dedOverlay') closeReader();
                else requestCloseEditor();
            } else if (e.key === 'Tab') trapTab(e, top);
        });

        // Always recompute from the real clock when the person returns to the page.
        document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
        window.addEventListener('focus', refresh);
        setInterval(tick, 1000);
    }

    /* Load letters published in letters.json (read-only, not saved to the visitor's storage) */
    async function loadPublished() {
        try {
            const r = await fetch('letters.json', { cache: 'no-store' });
            if (!r.ok) return;
            const p = await r.json();
            const incoming = (Array.isArray(p.letters) ? p.letters : []).map(normalize).filter(Boolean);
            for (const n of incoming) {
                const cur = find(n.id);
                if (cur && cur.updatedAt >= n.updatedAt) continue;
                letters = letters.filter(x => x.id !== n.id);
                letters.push(n);
                const img = p.images && p.images[n.id];
                if (typeof img === 'string' && img.startsWith('data:image/')) images[n.id] = img;
            }
        } catch (e) { /* no letters.json yet, that's fine */ }
    }

    async function init() {
        ensureStyles();
        injectDom();
        letters = loadLetters();
        bind();
        refresh();
        try { images = await imgStore.all(); } catch (e) { images = {}; }
        await loadPublished();
        refresh();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
