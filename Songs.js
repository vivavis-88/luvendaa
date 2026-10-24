/* =========================================================
   Songs: ADDITIVE script (load AFTER script.js and menu.js, before theme.js)
   - Search songs worldwide (Audius = FULL songs, iTunes = 30s previews)
   - Favorites (saved in this browser), plus your own MP3s in the "My songs" tab
   - One <audio> lives for the whole visit; floating "Now playing" follows you.
   ========================================================= */
(() => {
    'use strict';
    const SELF = document.currentScript;

    /* ---------- YOUR OWN MP3s (optional) ----------
       Put files in a "songs" folder next to index.html. Delete the lines to hide the tab's content. */
    const MINE = [
        // { title: 'My song', artist: 'Me', src: 'songs/my-song.mp3' },
    ].map((s, i) => ({ ...s, key: 'local:' + i, source: 'local', art: '' }));

    /* ---------- SHARED PLAYLIST ----------
       Songs saved with the Export button live in songs-library.js (loaded before this file), so everyone who
       opens your GitHub page sees them in the Playlist tab. */
    const LIB = (Array.isArray(window.SONG_LIBRARY) ? window.SONG_LIBRARY : []).filter(s => s && s.key && s.src)
        .map(s => ({ key: s.key, title: s.title || 'Untitled', artist: s.artist || '', src: s.src, art: s.art || '', source: s.source || 'youtube' }));

    /* ---------- YOUTUBE (any song, full length) ----------
       Pasting a YouTube link works with no setup. To also SEARCH YouTube, paste a YouTube Data API v3 key here
       (Google Cloud Console > enable "YouTube Data API v3" > Credentials > API key, then restrict it to your site's URL). */
    const YT_KEY = 'AIzaSyDcG87sJkPflLfxgA7NvY1ZZgEf4iWM3Hg';

    const APP_NAME = 'SongsPage';
    const K = 'songs.state2', K_MIN = 'songs.minimized', K_FAV = 'songs.favs', K_SRC = 'songs.source';
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => [...r.querySelectorAll(s)];
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } };
    const put = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } };
    const fmt = s => { s = Math.max(0, Math.floor(s || 0)); return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0'); };

    const ICON = {
        play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.4-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z"/></svg>',
        pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="4.2" height="14" rx="1.2" fill="currentColor"/><rect x="13.8" y="5" width="4.2" height="14" rx="1.2" fill="currentColor"/></svg>',
        prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="5" width="2.6" height="14" rx="1.1" fill="currentColor"/><path fill="currentColor" d="M19 6.2v11.6a.8.8 0 0 1-1.2.7l-8.6-5.8a.8.8 0 0 1 0-1.4l8.6-5.8a.8.8 0 0 1 1.2.7z"/></svg>',
        next: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="16.4" y="5" width="2.6" height="14" rx="1.1" fill="currentColor"/><path fill="currentColor" d="M5 6.2v11.6a.8.8 0 0 0 1.2.7l8.6-5.8a.8.8 0 0 0 0-1.4L6.2 5.5A.8.8 0 0 0 5 6.2z"/></svg>',
        down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.5l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.5-4.6-9.2-9.2C1.6 7.8 3.6 4.8 6.8 4.8c2 0 3.5 1.1 5.2 3 1.7-1.9 3.2-3 5.2-3 3.2 0 5.2 3 4 6.3-1.7 4.6-9.2 9.2-9.2 9.2z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>',
        heartOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.3s-7.5-4.6-9.2-9.2C1.6 7.8 3.6 4.8 6.8 4.8c2 0 3.5 1.1 5.2 3 1.7-1.9 3.2-3 5.2-3 3.2 0 5.2 3 4 6.3-1.7 4.6-9.2 9.2-9.2 9.2z" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
    };
    const EQ = '<span class="eq" aria-hidden="true"><i></i><i></i><i></i></span>';
    const DISC = '<span class="sg-disc" aria-hidden="true"></span>';

    const audio = new Audio();
    audio.preload = 'metadata';
    const saved = get(K, {});
    let favs = get(K_FAV, []);
    let cur = saved.track || null;     // current track object
    let queue = cur ? [cur] : [];                 // list that next/prev walk through
    let tab = LIB.length ? 'lib' : 'search', source = get(K_SRC, 'youtube');
    let results = [], searchMsg = '', searchCtl = null, searchTimer = 0, lastQ = '';
    let started = false, playing = false, dragging = false, opening = false, songsFrom = 'dedication', mini;
    let yt = null, ytP = null, ytLoaded = null, ytTick = 0, curName = '';

    const isFav = t => !!t && favs.some(f => f.key === t.key);
    const slim = t => ({ key: t.key, title: t.title, artist: t.artist, src: t.src, art: t.art || '', source: t.source });
    const viewList = () => tab === 'search' ? results : tab === 'favs' ? favs : tab === 'lib' ? LIB : MINE;

    /* ---------- assets ---------- */
    function loadAssets() {
        if (!getComputedStyle(document.documentElement).getPropertyValue('--songs-css').trim() && SELF && SELF.src) {
            const l = document.createElement('link'); l.rel = 'stylesheet';
            l.href = SELF.src.replace(/\.js(\?.*)?$/, '.css$1'); document.head.append(l);
        }
    }

    /* ---------- search ---------- */
    const NOTES = {
        audius: 'Full-length songs, free. Great for indie artists, remixes and new music.',
        itunes: 'Worldwide catalog (pop, K-pop, OPM, anything). Previews are 30 seconds.',
        youtube: 'Any song, full length, played through YouTube. You can also paste a YouTube link.'
    };
    const ytId = s => { const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(s); return m ? m[1] : null; };
    const unesc = s => { const t = document.createElement('textarea'); t.innerHTML = s; return t.value; };
    /* No key? Best effort: public YouTube search mirrors (they can be down or busy; pasting a link always works). */
    const YT_MIRRORS = [
        { kind: 'piped', url: 'https://pipedapi.kavin.rocks' },
        { kind: 'invidious', url: 'https://inv.nadeko.net' },
        { kind: 'invidious', url: 'https://yewtu.be' }
    ];
    async function searchYouTubeFree(q, signal) {
        for (const m of YT_MIRRORS) {
            const ctl = new AbortController(), kill = () => ctl.abort(), to = setTimeout(kill, 5000);
            signal.addEventListener('abort', kill);
            try {
                const u = m.kind === 'piped' ? m.url + '/search?filter=music_songs&q=' + encodeURIComponent(q)
                    : m.url + '/api/v1/search?type=video&q=' + encodeURIComponent(q);
                const r = await fetch(u, { signal: ctl.signal });
                if (!r.ok) continue;
                const j = await r.json();
                const out = (m.kind === 'piped' ? (j.items || []) : (Array.isArray(j) ? j : []))
                    .map(it => m.kind === 'piped'
                        ? { id: ((it.url || '').split('v=')[1] || '').split('&')[0], title: it.title, artist: it.uploaderName, art: it.thumbnail }
                        : { id: it.videoId, title: it.title, artist: it.author, art: ((it.videoThumbnails || []).find(t => t.quality === 'medium') || {}).url })
                    .filter(it => /^[\w-]{11}$/.test(it.id || '') && it.title)
                    .map(it => ({ key: 'yt:' + it.id, source: 'youtube', title: unesc(it.title), artist: (it.artist || 'YouTube').replace(/ - Topic$/, ''), src: it.id, art: it.art || '' }));
                if (out.length) return out;
            } catch (e) { if (signal.aborted) throw e; }
            finally { clearTimeout(to); signal.removeEventListener('abort', kill); }
        }
        throw new Error('nosearch');
    }
    function ytWhy(m) {
        const [, code, why] = m.split(':');
        if (/quota/i.test(why)) return 'Today\'s YouTube search limit is used up. Paste a link, or try again tomorrow.';
        if (/referer|ip/i.test(why) || code === '403') return 'YouTube refused the key (' + code + (why ? ': ' + why : '') + '). Check the key\'s website restriction matches this page\'s address, and that YouTube Data API v3 is enabled.';
        if (code === '400') return 'YouTube says the key is not valid (' + (why || '400') + '). Re-copy it into YT_KEY.';
        return 'YouTube search failed (' + code + (why ? ': ' + why : '') + ').';
    }
    async function searchYouTube(q, signal) {
        const id = ytId(q);
        if (id) {   // pasted link: look up its title through YouTube's oEmbed (no key needed)
            const r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + id), { signal });
            if (!r.ok) throw new Error('noembed');
            const j = await r.json();
            return [{ key: 'yt:' + id, source: 'youtube', title: unesc(j.title || 'YouTube song'), artist: (j.author_name || 'YouTube').replace(/ - Topic$/, ''), src: id, art: j.thumbnail_url || '' }];
        }
        if (!YT_KEY) return searchYouTubeFree(q, signal);
        const r = await fetch('https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&videoEmbeddable=true&maxResults=25&q=' + encodeURIComponent(q) + '&key=' + YT_KEY, { signal });
        if (!r.ok) {
            let why = '';
            try { const e = await r.json(); why = (e.error && (e.error.errors && e.error.errors[0] && e.error.errors[0].reason || e.error.message)) || ''; } catch (x) { /* ignore */ }
            throw new Error('yt:' + r.status + ':' + why);
        }
        const j = await r.json();
        return (j.items || []).filter(it => it.id && it.id.videoId).map(it => ({
            key: 'yt:' + it.id.videoId, source: 'youtube', title: unesc(it.snippet.title), artist: unesc(it.snippet.channelTitle).replace(/ - Topic$/, ''),
            src: it.id.videoId, art: (it.snippet.thumbnails && (it.snippet.thumbnails.medium || it.snippet.thumbnails.default) || {}).url || ''
        }));
    }
    async function searchAudius(q, signal) {
        const r = await fetch('https://api.audius.co/v1/tracks/search?limit=25&app_name=' + APP_NAME + '&query=' + encodeURIComponent(q), { signal });
        if (!r.ok) throw new Error('audius ' + r.status);
        const j = await r.json();
        return (j.data || []).filter(t => t.is_streamable !== false).map(t => ({
            key: 'audius:' + t.id, source: 'audius', title: t.title, artist: (t.user && t.user.name) || 'Unknown',
            src: 'https://api.audius.co/v1/tracks/' + t.id + '/stream?app_name=' + APP_NAME,
            art: (t.artwork && (t.artwork['150x150'] || t.artwork['480x480'])) || ''
        }));
    }
    async function searchItunes(q, signal) {
        const r = await fetch('https://itunes.apple.com/search?media=music&entity=song&limit=25&term=' + encodeURIComponent(q), { signal });
        if (!r.ok) throw new Error('itunes ' + r.status);
        const j = await r.json();
        return (j.results || []).filter(t => t.previewUrl).map(t => ({
            key: 'itunes:' + t.trackId, source: 'itunes', title: t.trackName, artist: t.artistName,
            src: t.previewUrl, art: (t.artworkUrl100 || '').replace('100x100', '200x200')
        }));
    }
    async function runSearch(q) {
        q = q.trim(); lastQ = q;
        if (searchCtl) searchCtl.abort();
        if (q.length < 2) { results = []; searchMsg = 'Type a song or artist name to search.'; renderList(); return; }
        searchCtl = new AbortController();
        searchMsg = 'Searching…'; results = []; renderList();
        try {
            const out = await (source === 'youtube' ? searchYouTube : source === 'audius' ? searchAudius : searchItunes)(q, searchCtl.signal);
            if (q !== lastQ) return;
            results = out; searchMsg = out.length ? '' : 'No results. Try another spelling, or switch the source above.';
        } catch (e) {
            if (e.name === 'AbortError') return;
            results = [];
            searchMsg = e.message.startsWith('yt:') ? ytWhy(e.message)
                : e.message === 'nosearch' ? 'YouTube search is busy right now. Try again in a moment, or paste a YouTube link.'
                : e.message === 'noembed' ? 'That video cannot be played here. Try another link or version.'
                : 'Could not search right now. Check your internet connection and try again.';
        }
        renderList();
    }

    /* ---------- markup ---------- */
    function injectView() {
        const app = $('#app');
        if (!app || $('#songsView')) return false;
        const view = document.createElement('section');
        view.className = 'view view-songs'; view.id = 'songsView'; view.dataset.view = 'songs'; view.hidden = true;
        view.setAttribute('aria-labelledby', 'songs-title');
        view.innerHTML = `
        <div class="stage">
            <nav class="topnav" aria-label="Page navigation">
                <button type="button" class="btn btn-ghost btn-small" id="songsBack">Back to Dedication</button>
                <button type="button" class="btn btn-ghost btn-small" id="songsHome">Home</button>
            </nav>
            <header class="page-head">
                <p class="label">For ${(typeof HER_NAME !== 'undefined' && HER_NAME) || 'Avee'}</p>
                <h1 id="songs-title">Songs</h1>
                <p class="muted">Search any song, heart your favorites, and keep reading. The music follows you to every page.</p>
            </header>
            <div class="sg-player sg-display" id="sgPlayer">
                <div class="sgd-row">
                    ${DISC}
                    <div class="sgd-text">
                        <span class="sgd-label">${EQ}<span class="js-state">Music</span></span>
                        <span class="sgd-title js-title"></span>
                        <span class="sgd-artist js-artist"></span>
                    </div>
                    <button type="button" class="sg-btn sg-fav js-fav" aria-label="Add to favorites"></button>
                </div>
                <div class="sgd-row sgd-ctl">
                    <button type="button" class="sg-btn js-prev" aria-label="Previous song">${ICON.prev}</button>
                    <button type="button" class="sg-btn sg-main js-play" aria-label="Play"></button>
                    <button type="button" class="sg-btn js-next" aria-label="Next song">${ICON.next}</button>
                    <span class="sg-times-inline js-cur">0:00</span>
                    <input class="sk" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek">
                    <span class="sg-times-inline js-dur">0:00</span>
                </div>
                <label class="sg-vol"><span>Volume</span><input class="sk" id="sgVol" type="range" min="0" max="100" step="1" aria-label="Volume"></label>
                <p class="sg-status" id="sgStatus" role="status"></p>
            </div>
            <div class="sg-tabs" role="tablist" aria-label="Song lists">
                <button type="button" class="sg-tab" role="tab" data-tab="search" aria-selected="false">Search</button>
                ${LIB.length ? '<button type="button" class="sg-tab" role="tab" data-tab="lib" aria-selected="false">Playlist</button>' : ''}
                <button type="button" class="sg-tab" role="tab" data-tab="favs" aria-selected="false">Favorites</button>
                ${MINE.length ? '<button type="button" class="sg-tab" role="tab" data-tab="mine" aria-selected="false">My songs</button>' : ''}
            </div>
            <div class="sg-search" id="sgSearch">
                <input class="sg-q" id="sgQ" type="search" placeholder="Search songs, or paste a YouTube link…" autocomplete="off" enterkeyhint="search" aria-label="Search songs or artists">
                <div class="sg-src" role="group" aria-label="Music source">
                    <button type="button" class="sg-chip" data-src="youtube" aria-pressed="false">Any song</button>
                    <button type="button" class="sg-chip" data-src="audius" aria-pressed="false">Indie</button>
                    <button type="button" class="sg-chip" data-src="itunes" aria-pressed="false">30s previews</button>
                </div>
            </div>
            <p class="sg-note" id="sgNote"></p>
            <div class="sg-export" id="sgExport" hidden>
                <div class="sg-export-btns">
                    <button type="button" class="sgd-browse" id="sgExpDl">Download songs-library.js</button>
                    <button type="button" class="sgd-browse" id="sgExpCopy">Copy code</button>
                </div>
                <div class="sg-export-pw" id="sgExpPw" hidden>
                    <input type="password" id="sgExpPass" placeholder="Password" autocomplete="off" aria-label="Export password">
                    <button type="button" class="sgd-browse" id="sgExpGo">Unlock</button>
                </div>
                <p class="sg-export-msg" id="sgExpMsg" role="status"></p>
            </div>
            <ol class="sg-list" id="sgList"></ol>
        </div>`;
        app.append(view);
        return true;
    }

    function injectMini() {
        mini = document.createElement('div');
        mini.className = 'np is-hidden' + (get(K_MIN, false) ? ' is-min' : '');
        mini.id = 'npMini';
        mini.innerHTML = `
        <div class="np-card" role="region" aria-label="Music player">
            <div class="np-top">
                ${DISC}
                <div class="np-text">
                    <span class="np-label">${EQ}<span>Now playing</span></span>
                    <span class="np-title js-title"></span>
                </div>
                <button type="button" class="sg-btn sg-fav js-fav" aria-label="Add to favorites"></button>
                <button type="button" class="sg-btn" id="npMin" aria-label="Minimize player">${ICON.down}</button>
            </div>
            <div class="np-bottom">
                <button type="button" class="sg-btn js-prev" aria-label="Previous song">${ICON.prev}</button>
                <button type="button" class="sg-btn sg-main js-play" aria-label="Play"></button>
                <button type="button" class="sg-btn js-next" aria-label="Next song">${ICON.next}</button>
                <input class="sk" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek">
            </div>
        </div>
        <div class="np-pill">
            <button type="button" class="np-expand" id="npExpand" aria-label="Show music player">${DISC}${EQ}</button>
            <button type="button" class="sg-btn js-play" aria-label="Play"></button>
        </div>`;
        document.body.append(mini);
    }

    /* ---------- list ---------- */
    function renderList() {
        const list = $('#sgList'); if (!list) return;
        const items = viewList();
        list.textContent = '';
        $('#sgSearch').hidden = tab !== 'search';
        $('#sgExport').hidden = tab !== 'favs';
        $('#sgNote').textContent = tab === 'search' ? (searchMsg || NOTES[source]) : '';
        if (!items.length && tab !== 'search') {
            const li = document.createElement('li'); li.className = 'sg-empty';
            li.textContent = tab === 'favs' ? 'No favorites yet. Tap the heart on any song to keep it here.' : 'No songs in this list.';
            list.append(li); render(); return;
        }
        items.forEach((s, i) => {
            const li = document.createElement('li'); li.className = 'sg-row';
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'sg-track'; b.dataset.i = i; b.dataset.key = s.key;
            b.innerHTML = '<span class="sg-mark">' + ICON.play + EQ + '</span>' + (s.art ? '<img class="sg-art" alt="" loading="lazy">' : '') + '<span class="sg-track-text"><span class="sg-track-title"></span><span class="sg-track-artist"></span></span>';
            if (s.art) $('.sg-art', b).src = s.art;
            $('.sg-track-title', b).textContent = s.title;
            $('.sg-track-artist', b).textContent = s.artist + (s.source === 'itunes' ? ' · preview' : '');
            const f = document.createElement('button');
            f.type = 'button'; f.className = 'sg-btn sg-fav'; f.dataset.i = i; f.dataset.key = s.key;
            li.append(b, f); list.append(li);
        });
        render();
    }

    /* ---------- music display on the Dedication page ---------- */
    function addDisplay() {
        const ded = $('#dedView');
        if (!ded || $('#sgDisplay', ded)) return;
        const head = $('.page-head', ded);
        if (!head) return;
        const d = document.createElement('div');
        d.className = 'sg-display'; d.id = 'sgDisplay';
        d.setAttribute('role', 'region'); d.setAttribute('aria-label', 'Music player');
        d.innerHTML = `
            <div class="sgd-row">
                ${DISC}
                <div class="sgd-text">
                    <span class="sgd-label">${EQ}<span class="js-state">Music</span></span>
                    <span class="sgd-title js-title"></span>
                    <span class="sgd-artist js-artist"></span>
                </div>
                <button type="button" class="sg-btn sg-fav js-fav" aria-label="Add to favorites"></button>
            </div>
            <div class="sgd-row sgd-ctl">
                <button type="button" class="sg-btn js-prev" aria-label="Previous song">${ICON.prev}</button>
                <button type="button" class="sg-btn sg-main js-play" aria-label="Play"></button>
                <button type="button" class="sg-btn js-next" aria-label="Next song">${ICON.next}</button>
                <span class="sg-times-inline js-cur">0:00</span>
                <input class="sk" type="range" min="0" max="1000" step="1" value="0" aria-label="Seek">
                <span class="sg-times-inline js-dur">0:00</span>
            </div>
            <button type="button" class="sgd-browse" id="sgdBrowse">Search &amp; browse songs</button>`;
        head.before(d);
        render(); progress();
    }

    /* ---------- export favorites as songs-library.js ---------- */
    const EXPORT_PASSWORD = 'AVEEBUEN';   // <- change this. Asked once before Download / Copy.
    let expOk = false, expPending = false;
    const expMsg = t => { const n = $('#sgExpMsg'); if (n) n.textContent = t; };
    function exportLib(copy) {
        if (expOk) { doExport(copy); return; }
        expPending = !!copy; expMsg('');
        $('#sgExpPw').hidden = false; $('#sgExpPass').focus();
    }
    function expUnlock() {
        const i = $('#sgExpPass');
        if (i.value !== EXPORT_PASSWORD) { expMsg('Wrong password.'); i.select(); return; }
        expOk = true; i.value = ''; $('#sgExpPw').hidden = true; expMsg('');
        doExport(expPending);
    }
    document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'sgExpPass') { e.preventDefault(); expUnlock(); } });
    function doExport(copy) {
        const add = favs.filter(f => !LIB.some(l => l.key === f.key)).reverse();
        const all = [...LIB, ...add].map(slim);
        const msg = expMsg;
        if (!all.length) { msg('Heart some songs first, then export.'); return; }
        const code = '/* Saved songs for the Songs page. Made with the Export button: upload this file next to index.html. */\nwindow.SONG_LIBRARY = ' + JSON.stringify(all, null, 2) + ';\n';
        if (copy) {
            const done = () => msg('Copied.');
            if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => msg('Could not copy. Use Download instead.'));
            else { const t = document.createElement('textarea'); t.value = code; document.body.append(t); t.select(); try { document.execCommand('copy'); done(); } catch (e) { msg('Could not copy. Use Download instead.'); } t.remove(); }
            return;
        }
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })); a.download = 'songs-library.js';
        document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
        msg('Downloaded ' + all.length + ' song' + (all.length === 1 ? '' : 's') + '.');
    }

    /* ---------- state -> UI ---------- */
    function render() {
        $$('.js-title').forEach(n => { n.textContent = cur ? cur.title : 'Nothing playing yet'; });
        $$('.js-artist').forEach(n => { n.textContent = cur ? cur.artist : 'Search for a song to start'; });
        $$('.js-state').forEach(n => { n.textContent = playing ? 'Now playing' : (cur ? 'Paused' : 'Music'); });
        $$('.js-play').forEach(b => { b.innerHTML = playing ? ICON.pause : ICON.play; b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); });
        [mini, $('#sgPlayer'), ...$$('.sg-display')].forEach(n => n && n.classList.toggle('is-playing', playing));
        $$('.sg-track').forEach(b => {
            const on = !!cur && b.dataset.key === cur.key;
            b.classList.toggle('is-current', on);
            b.classList.toggle('is-playing', on && playing);
            b.setAttribute('aria-current', on ? 'true' : 'false');
        });
        $$('.sg-fav').forEach(b => {
            const t = b.classList.contains('js-fav') ? cur : viewList()[+b.dataset.i];
            const on = isFav(t);
            b.innerHTML = on ? ICON.heartOn : ICON.heart;
            b.classList.toggle('is-fav', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
            b.setAttribute('aria-label', on ? 'Remove from favorites' : 'Add to favorites');
        });
        $$('.sg-tab').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === tab ? 'true' : 'false'));
        $$('.sg-chip').forEach(b => b.setAttribute('aria-pressed', b.dataset.src === source ? 'true' : 'false'));
    }
    function progress() {
        const d = dur(), t = pos(), ok = isFinite(d) && d > 0, v = ok ? t / d * 1000 : 0;
        if (!dragging) $$('.sk[max="1000"]').forEach(r => { r.value = v; r.style.setProperty('--p', (v / 10) + '%'); });
        $$('.js-cur').forEach(n => { n.textContent = fmt(t); });
        $$('.js-dur').forEach(n => { n.textContent = ok ? fmt(d) : '0:00'; });
    }
    const status = t => { const n = $('#sgStatus'); if (n) n.textContent = t || ''; };

    function toggleFav(t) {
        if (!t) return;
        favs = isFav(t) ? favs.filter(f => f.key !== t.key) : [slim(t), ...favs];
        put(K_FAV, favs);
        if (tab === 'favs') renderList(); else render();
    }

    /* ---------- YouTube engine (official embed player, kept hidden, audio only) ---------- */
    const isYT = t => !!t && t.source === 'youtube';
    function ytApi() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        return new Promise((res, rej) => {
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = () => { try { if (prev) prev(); } catch (e) { /* ignore */ } res(); };
            if (!$('script[data-yt-api]')) {
                const s = document.createElement('script');
                s.src = 'https://www.youtube.com/iframe_api'; s.dataset.ytApi = '1'; s.onerror = () => rej(new Error('yt api'));
                document.head.append(s);
            }
        });
    }
    function ytEnsure() {
        if (ytP) return ytP;
        ytP = ytApi().then(() => new Promise(res => {
            const host = document.createElement('div'); host.className = 'sg-yt'; host.id = 'sgYT';
            host.append(document.createElement('div')); document.body.append(host);
            yt = new window.YT.Player(host.firstElementChild, {
                width: 200, height: 200, playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0, fs: 0 },
                events: { onReady: () => { try { yt.setVolume(Math.round(audio.volume * 100)); } catch (e) { /* ignore */ } res(yt); }, onStateChange: ytState, onError: ytError }
            });
        })).catch(e => { ytP = null; throw e; });
        return ytP;
    }
    function ytPoll(on) { clearInterval(ytTick); if (on) ytTick = setInterval(progress, 250); }
    function ytState(e) {
        if (!isYT(cur) || !window.YT) return;
        const S = window.YT.PlayerState;
        if (e.data === S.PLAYING) { playing = true; started = true; status(''); ytPoll(true); render(); sync(); }
        else if (e.data === S.PAUSED) { playing = false; ytPoll(false); render(); }
        else if (e.data === S.ENDED) {
            playing = false; ytPoll(false); render();
            if (queue.length > 1) next(); else { yt.seekTo(0, true); yt.playVideo(); }
        }
        progress();
    }
    function ytError(e) {
        playing = false; ytPoll(false); render();
        status([101, 150, 153].includes(e.data) ? 'The owner of this video does not allow playing it here. Try another version.' : 'This song could not be played. Try another one.');
    }
    function ytStart() {
        const t = cur;
        status('Loading…');
        ytEnsure().then(p => {
            if (cur !== t) return;
            if (ytLoaded !== t.src) { ytLoaded = t.src; p.loadVideoById(t.src); } else p.playVideo();
        }).catch(() => status('Could not reach YouTube. Check your internet connection.'));
    }
    const pos = () => isYT(cur) ? ((yt && yt.getCurrentTime && yt.getCurrentTime()) || 0) : audio.currentTime;
    const dur = () => isYT(cur) ? ((yt && yt.getDuration && yt.getDuration()) || 0) : audio.duration;
    const seekTo = s => { if (isYT(cur)) { if (yt && yt.seekTo) yt.seekTo(s, true); } else audio.currentTime = s; };
    const pause = () => { if (isYT(cur)) { if (yt && yt.pauseVideo) yt.pauseVideo(); } else audio.pause(); };

    /* ---------- playback ---------- */
    function load(track, list, autoplay) {
        if (!track) return;
        cur = track; ytLoaded = null;
        if (list && list.length) queue = list.slice();
        if (!queue.some(q => q.key === cur.key)) queue.unshift(cur);
        if (isYT(cur)) {
            audio.pause(); playing = false; ytPoll(false);
            if (source === 'youtube' || !yt) ytEnsure().catch(() => {});
        } else {
            if (yt && yt.pauseVideo) { try { yt.pauseVideo(); } catch (e) { /* ignore */ } }
            ytPoll(false);
            audio.src = cur.src;
            audio.loop = queue.length === 1;
        }
        put(K, { track: slim(cur), v: audio.volume });
        status(''); render(); progress(); session();
        if (autoplay) play();
    }
    function step(d) {
        if (!queue.length) return;
        const i = Math.max(0, queue.findIndex(q => q.key === (cur && cur.key)));
        load(queue[(i + d + queue.length) % queue.length], null, true);
    }
    function play() {
        if (!cur) return;
        if (isYT(cur)) { ytStart(); return; }
        if (!audio.src) audio.src = cur.src;
        const p = audio.play();
        if (p && p.catch) p.catch(() => { playing = !audio.paused; render(); });
    }
    const toggle = () => { if (!cur) { openPage(); return; } playing ? pause() : play(); };
    const next = () => step(1);
    const prev = () => { if (pos() > 4) seekTo(0); else step(-1); };

    function session() {
        if (!cur || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
        navigator.mediaSession.metadata = new MediaMetadata({
            title: cur.title, artist: cur.artist, artwork: cur.art ? [{ src: cur.art, sizes: '200x200' }] : []
        });
    }
    function bindSession() {
        if (!('mediaSession' in navigator)) return;
        const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) { /* unsupported */ } };
        h('play', play); h('pause', pause); h('previoustrack', prev); h('nexttrack', next);
    }

    function bindAudio() {
        const own = f => (...a) => { if (!isYT(cur)) f(...a); };   // ignore the <audio> tag while YouTube is the engine
        audio.addEventListener('play', own(() => { playing = true; started = true; render(); sync(); }));
        audio.addEventListener('pause', own(() => { playing = false; render(); }));
        audio.addEventListener('timeupdate', own(progress));
        audio.addEventListener('loadedmetadata', own(progress));
        audio.addEventListener('durationchange', own(progress));
        audio.addEventListener('ended', own(() => { if (queue.length > 1) next(); }));
        audio.addEventListener('error', own(() => {
            playing = false; render();
            status(cur && cur.source === 'local' ? 'This song could not load. Check the file name in the songs folder.'
                : 'This song could not be played. Try another one.');
        }));
        audio.addEventListener('playing', own(() => status('')));
    }

    /* ---------- navigation (same approach as the Jar page) ---------- */
    async function navTo(name) {
        const isOn = () => { const v = $('.view.is-active'); return !!v && v.dataset.view === name; };
        try {
            if (typeof window.goTo === 'function') await Promise.race([Promise.resolve(window.goTo(name)), sleep(2500)]);
        } catch (e) { /* fall through to manual switch */ }
        if (isOn()) return;
        const target = document.querySelector('.view[data-view="' + name + '"]');
        if (!target) return;
        document.querySelectorAll('.view').forEach(v => { v.classList.remove('is-active'); v.hidden = true; });
        target.hidden = false;
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        target.classList.add('is-active');
    }
    async function openPage() {
        if (opening) return;
        const cv = $('.view.is-active');
        if (cv && cv.dataset.view === 'songs') return;
        if (cv) songsFrom = cv.dataset.view;
        opening = true;
        try { await navTo('songs'); window.scrollTo(0, 0); } finally { opening = false; }
    }
    window.openSongsPage = openPage;

    /* ---------- floating box visibility ---------- */
    function sync() {
        const cv = $('.view.is-active'), name = cv ? cv.dataset.view : '';
        if (!name) return;
        if (name !== curName) {
            curName = name;
            window.dispatchEvent(new Event('hb:sync'));
        }
        mini.classList.toggle('is-hidden', !started || name === 'login' || name === 'intro' || name === 'songs' || (name === 'dedication' && !!$('#sgDisplay')));
        const mi = $('[data-songs-item] .hb-item');
        if (mi) { if (name === 'songs') mi.setAttribute('aria-current', 'page'); else mi.removeAttribute('aria-current'); }
    }

    /* ---------- hamburger menu entry ---------- */
    function addMenuItem() {
        const list = $('.hb-list');
        if (!list || $('[data-songs-item]', list)) return;
        const li = document.createElement('li');
        li.dataset.songsItem = '1';
        li.style.setProperty('--i', list.children.length);
        li.innerHTML = '<button type="button" class="hb-item" data-view="songs"><span class="hb-label">Songs</span><span class="hb-desc">Search and play music while you read</span></button>';
        $('button', li).addEventListener('click', () => {
            const open = $('.hb.is-open'); if (open) open.click();
            openPage();
        });
        list.append(li);
        sync();
    }
    function watchMenu() {
        let queued = false;
        new MutationObserver(() => {
            if (queued) return; queued = true;
            requestAnimationFrame(() => { queued = false; addMenuItem(); addDisplay(); });
        }).observe(document.body, { childList: true, subtree: true });
        addMenuItem(); addDisplay();
    }

    /* ---------- events ---------- */
    function bind() {
        const on = (s, e, f) => { const n = $(s); if (n) n.addEventListener(e, f); };
        on('#songsBack', 'click', () => navTo('dedication'));
        on('#songsHome', 'click', () => navTo('main'));

        const q = $('#sgQ');
        q.addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => runSearch(q.value), 450); });
        q.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(searchTimer); runSearch(q.value); q.blur(); } });

        document.addEventListener('click', e => {
            const t = e.target.closest('.js-play, .js-prev, .js-next, .js-fav, .sg-fav, .sg-track, .sg-tab, .sg-chip, #sgdBrowse, #sgExpDl, #sgExpCopy, #sgExpGo, #npMin, #npExpand');
            if (!t) return;
            if (t.matches('.js-play')) toggle();
            else if (t.matches('.js-prev')) prev();
            else if (t.matches('.js-next')) next();
            else if (t.matches('#sgdBrowse')) openPage();
            else if (t.matches('#sgExpDl')) exportLib(false);
            else if (t.matches('#sgExpCopy')) exportLib(true);
            else if (t.matches('#sgExpGo')) expUnlock();
            else if (t.matches('.js-fav')) toggleFav(cur);
            else if (t.matches('.sg-fav')) toggleFav(viewList()[+t.dataset.i]);
            else if (t.matches('.sg-tab')) { tab = t.dataset.tab; renderList(); }
            else if (t.matches('.sg-chip')) { source = t.dataset.src; put(K_SRC, source); if (source === 'youtube') ytEnsure().catch(() => {}); results = []; searchMsg = ''; renderList(); if (q.value.trim().length > 1) runSearch(q.value); }
            else if (t.matches('.sg-track')) {
                const track = viewList()[+t.dataset.i];
                if (cur && track.key === cur.key) toggle(); else load(track, viewList(), true);
            }
            else { const m = t.id === 'npMin'; mini.classList.toggle('is-min', m); put(K_MIN, m); (m ? $('#npExpand') : $('#npMin')).focus({ preventScroll: true }); }
        });

        document.addEventListener('input', e => {
            const r = e.target.closest('.sk[max="1000"]'); if (!r) return;
            dragging = true; r.style.setProperty('--p', (r.value / 10) + '%');
            if (isFinite(dur())) $$('.js-cur').forEach(n => { n.textContent = fmt(r.value / 1000 * dur()); });
        });
        document.addEventListener('change', e => {
            const r = e.target.closest('.sk[max="1000"]'); if (!r) return;
            if (isFinite(dur()) && dur() > 0) seekTo(r.value / 1000 * dur());
            dragging = false; progress();
        });

        const vol = $('#sgVol');
        if (vol) {
            vol.value = Math.round(audio.volume * 100); vol.style.setProperty('--p', vol.value + '%');
            vol.addEventListener('input', () => {
                audio.volume = vol.value / 100; vol.style.setProperty('--p', vol.value + '%');
                if (yt && yt.setVolume) { try { yt.setVolume(+vol.value); } catch (e) { /* ignore */ } }
                if (cur) put(K, { track: slim(cur), v: audio.volume });
            });
        }

        const app = $('#app');
        if (app) new MutationObserver(sync).observe(app, { subtree: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    }

    function init() {
        loadAssets();
        if (typeof saved.v === 'number' && saved.v >= 0 && saved.v <= 1) audio.volume = saved.v;
        if (!injectView()) return;
        injectMini();
        bindAudio(); bindSession(); bind();
        if (cur && !isYT(cur)) { audio.src = cur.src; audio.loop = true; }
        searchMsg = 'Type a song or artist name to search.';
        renderList(); progress(); session(); sync(); watchMenu();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();