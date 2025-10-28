document.addEventListener('DOMContentLoaded', async () => {
    // Hamburger menu logic
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const mainNav = document.getElementById('main-nav');
    hamburgerBtn.addEventListener('click', () => {
        mainNav.classList.toggle('is-open');
    });

    // Fetch and display rules
    const response = await fetch('/api/rules');
    const data = await response.json();
    const rulesContent = document.getElementById('rules-content');
    rulesContent.textContent = data.rules;
});