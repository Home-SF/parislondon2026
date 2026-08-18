// Highlights today's day-card on the home page with a bold "TODAY" badge.
// Matches against the visitor's local device date (YYYY-MM-DD).
(function () {
  function pad(n) { return String(n).padStart(2, '0'); }

  function todayStr() {
    var now = new Date();
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  function highlightToday() {
    var target = todayStr();
    var cards = document.querySelectorAll('.day-card[data-date]');
    cards.forEach(function (card) {
      if (card.getAttribute('data-date') === target) {
        card.classList.add('is-today');
      } else {
        card.classList.remove('is-today');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', highlightToday);
  } else {
    highlightToday();
  }
})();
