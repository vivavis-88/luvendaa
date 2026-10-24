/* Adds the shared night-sky layer to the letter page and the Open When page. */
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.view-main, .view-openwhen').forEach(view => {
        const sky = document.createElement('div');
        sky.className = 'login-sky';
        sky.setAttribute('aria-hidden', 'true');
        sky.innerHTML = '<i></i><i></i><i></i><i></i><i></i><i></i>';
        view.prepend(sky);
    });
});