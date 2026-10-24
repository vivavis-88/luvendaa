/* Splits each intro headline into words so CSS can reveal them one by one. */
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.intro-title').forEach(el => {
        const text = el.textContent.trim();
        el.setAttribute('aria-label', text);
        el.innerHTML = text.split(/\s+/)
            .map((w, i) => `<span class="w" aria-hidden="true" style="--i:${i}">${w}</span>`)
            .join(' ');
    });
});