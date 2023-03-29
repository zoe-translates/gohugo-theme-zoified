"use strict";
// 'Back to top' logic
const topBtn = document.querySelector('.top-of-site-link');
const topAnchor = document.getElementById('top-of-site-anchor');
if (topBtn !== null && topAnchor !== null ) {
  const intersectionObserver = new IntersectionObserver(function(entries) {
    topBtn.dataset.visible = entries[0].boundingClientRect.y < 0;
  });
  intersectionObserver.observe(topAnchor);
}

// set up keyboard cotrol of the menu toggle
const widget = document.getElementById('sidebar-toggle');
const box = document.getElementById('sidebar-checkbox');
if (widget !== null && box !== null) {
  widget.addEventListener('keydown', (e) => {
    if (e.key == 'Enter') {
      box.checked ^= 1;
    }
  });
}
