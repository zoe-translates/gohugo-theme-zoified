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

setupBackToTop();
setupKbdMenuToggle();
