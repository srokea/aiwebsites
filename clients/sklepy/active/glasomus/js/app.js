function applyLang(lang) {
  const t = translations[lang];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (t[key] !== undefined) {
      el.innerHTML = t[key].replace(/\n/g, '<br>');
    }
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    if (t[key] !== undefined) el.placeholder = t[key];
  });
}

// Smooth scroll
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const target = document.querySelector(a.getAttribute('href'));
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth' }); }
  });
});

// Scrollspy: highlight the nav link for the section currently in view
const navLinks = document.querySelectorAll('.nav-link');
const navSections = Array.from(navLinks)
  .map(link => document.querySelector(link.getAttribute('href')))
  .filter(Boolean);

function updateActiveNavLink() {
  const scrollPos = window.scrollY + 130;
  let current = navSections[0];
  navSections.forEach(sec => { if (sec.offsetTop <= scrollPos) current = sec; });
  navLinks.forEach(link => {
    link.classList.toggle('active', document.querySelector(link.getAttribute('href')) === current);
  });
}

window.addEventListener('scroll', updateActiveNavLink);
updateActiveNavLink();

// Init
applyLang('pl');
