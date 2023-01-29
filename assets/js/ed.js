// 'Back to top' logic
function setupBackToTop() {
  const intersectionObserver = new IntersectionObserver(function(entries) {
    const topBtn = document.querySelector('.top-of-site-link');
    if (topBtn === null) return;

    topBtn.dataset.visible = entries[0].boundingClientRect.y < 0;
  });

  const topAnchor = document.querySelector('#top-of-site-anchor');
  if (topAnchor !== null) {
    intersectionObserver.observe(topAnchor);
  }
}

// set up keyboard cotrol of the menu toggle
function setupKbdMenuToggle() {
    const widget = document.getElementById('sidebar-toggle');
    const box = document.getElementById('sidebar-checkbox');
    if ((widget === null) || (box === null)) return;
    widget.addEventListener('keydown', (e) => {
	if (e.code == 'Enter') {
	    box.checked ^= 1;
	}
    });
}

// Annotation support
function setupHypothes() {
  const hypothesisContainer = document.querySelector('.hypothesis-container');
  if (hypothesisContainer !== null) {
    hypothesisContainer.addEventListener('click', e => {
      e.preventDefault();

      let script = document.createElement('script');
      script.setAttribute('src', 'https://cdn.hypothes.is/hypothesis');
      script.type = 'text/javascript';
      document.getElementsByTagName('head')[0].appendChild(script);
    });
  }

  const hypothesisLink = document.querySelector('#hypothesis-link');
  if (hypothesisLink !== null) {
    hypothesisContainer.addEventListener('click', e => e.preventDefault());
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupBackToTop();
  setupKbdMenuToggle();
  setupHypothes();
});
