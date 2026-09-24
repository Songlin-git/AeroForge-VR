/* Local-only enlarged research views and video visibility. No external libraries. */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Retain plain image links as the no-JavaScript fallback.
  const figureDialog = $('figureDialog');
  const figureBody = figureDialog.querySelector('.figure-dialog-body');
  $('openFigure').addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || !figureDialog.showModal) return;
    event.preventDefault();
    figureBody.classList.remove('actual-size');
    $('figureScale').textContent = 'Actual size';
    figureDialog.showModal();
    document.body.classList.add('modal-open');
  });
  $('closeFigure').addEventListener('click', () => figureDialog.close());
  $('figureScale').addEventListener('click', () => {
    const actual = figureBody.classList.toggle('actual-size');
    $('figureScale').textContent = actual ? 'Fit to window' : 'Actual size';
  });
  figureDialog.addEventListener('close', () => {
    document.body.classList.remove('modal-open');
    $('openFigure').focus({ preventScroll: true });
  });
  figureDialog.addEventListener('click', event => { if (event.target === figureDialog) figureDialog.close(); });

  // Move the same explorer into a native dialog: no duplicate canvas, listeners or data.
  const explorer = $('shapeExplorer'), expandedDialog = $('explorerDialog');
  const expandButton = $('expandExplorer');
  let placeholder = null, savedScroll = 0;
  expandButton.addEventListener('click', () => {
    if (expandedDialog.open) { expandedDialog.close(); return; }
    if (!expandedDialog.showModal) return;
    savedScroll = window.scrollY;
    placeholder = document.createElement('div');
    placeholder.style.height = explorer.getBoundingClientRect().height + 'px';
    placeholder.setAttribute('aria-hidden', 'true');
    explorer.before(placeholder);
    $('explorerDialogBody').appendChild(explorer);
    expandButton.querySelector('span').textContent = 'Close explorer';
    expandedDialog.showModal();
    document.body.classList.add('modal-open');
    window.dispatchEvent(new Event('resize'));
  });
  expandedDialog.addEventListener('close', () => {
    if (placeholder) { placeholder.replaceWith(explorer); placeholder = null; }
    expandButton.querySelector('span').textContent = 'Expand';
    document.body.classList.remove('modal-open');
    window.scrollTo({ top: savedScroll, behavior: 'instant' });
    window.dispatchEvent(new Event('resize'));
    expandButton.focus({ preventScroll: true });
  });
  expandedDialog.addEventListener('click', event => { if (event.target === expandedDialog) expandedDialog.close(); });

  // Prevent an off-screen video from continuing to consume resources. A manual pause
  // is never reversed; the native controls always remain available.
  const video = $('demoVideo');
  let pausedByVisibility = false, wasPlaying = false, internalPause = false;
  if (reduced) { video.removeAttribute('autoplay'); video.pause(); }
  video.addEventListener('play', () => { wasPlaying = true; pausedByVisibility = false; });
  video.addEventListener('pause', () => {
    if (!internalPause) { wasPlaying = false; pausedByVisibility = false; }
    internalPause = false;
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      const visible = entries[0].isIntersecting;
      if (!visible && !video.paused) {
        pausedByVisibility = true; wasPlaying = true; internalPause = true; video.pause();
      } else if (visible && pausedByVisibility && wasPlaying && !reduced) {
        pausedByVisibility = false;
        const attempt = video.play();
        if (attempt && attempt.catch) attempt.catch(() => { wasPlaying = false; });
      }
    }, { threshold: 0.02 }).observe(video);
  }
})();
