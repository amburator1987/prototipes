(function () {
  'use strict';

  /* ---------- Podaci (redosled i vrednosti iz Figme, frame 6373:16934 – 10 kartica) ---------- */
  var AWARDS = [
    { icon: 'ml6',     amount: '300.00',      currency: 'RSD', product: 'Lucky Six',     badge: 'VOUCHER' },
    { icon: 'slash',   amount: 'Bez\nNagrade', currency: '',    product: '',              badge: '', noPrize: true },
    { icon: 'lotto',   amount: '300.00',      currency: 'RSD', product: 'Grčki kino',    badge: 'VOUCHER' },
    { icon: 'casino',  amount: '300.00',      currency: '',    product: 'Casino',        badge: 'FREE SPINS' },
    { icon: 'freeBet', amount: '300.00',      currency: 'RSD', product: 'Lucky Six',     badge: 'WAGER FREE BET' },
    { icon: 'Voucher', amount: '4565',        currency: '',    product: 'Lucky Six',     badge: 'WAGER VOUCHER' },
    { icon: 'freeBet', amount: '300.00',      currency: 'RSD', product: 'Svi Proizvodi', badge: 'Bruto FreeBet' },
    { icon: 'freeBet', amount: '300.00',      currency: 'RSD', product: 'Svi Proizvodi', badge: 'Neto freebet' },
    { icon: 'freeBet', amount: '300.00',      currency: 'RSD', product: 'Svi Proizvodi', badge: 'Neto freebet' },
    { icon: 'freeBet', amount: '300.00',      currency: 'RSD', product: 'Svi Proizvodi', badge: 'Neto freebet' }
  ];

  var LABEL_SPIN = 'Zavrti točak';
  var LABEL_SPINNED = 'Preuzmi nagradu';
  var LABEL_NO_PRIZE = 'U redu';       // Figma no_award (6399:9444) – sekundarno dugme
  var DURATION = 3000;          // ms – tačno 3s
  var EASE = 'cubic-bezier(0.15, 0.85, 0.25, 1)';
  var MIN_LOOPS = 3;            // najmanje punih krugova pre zaustavljanja
  var MIN_TRAVEL = 4000;        // px – minimalni put, da i mali N ima sličnu brzinu kao N=9
  var MIN_CARDS = 2;
  var MAX_CARDS = AWARDS.length;
  var MIN_CENTERED = 3;         // od 3 kartice dobitna se centrira; sa 2 ostaje levo

  /* ---------- DOM ---------- */
  var viewport = document.getElementById('viewport');
  var track = document.getElementById('track');
  var spinBtn = document.getElementById('spinBtn');
  var resetBtn = document.getElementById('resetBtn');
  var wheelDialog = document.getElementById('wheelDialog');
  var resultDialog = document.getElementById('resultDialog');
  var resultBody = document.getElementById('resultBody');
  var resultTitle = document.getElementById('resultTitle');
  var okBtn = document.getElementById('okBtn');
  var cardsSelect = document.getElementById('cardsSelect');
  var mobileSelect = document.getElementById('mobileSelect');
  var phoneEl = document.getElementById('phone');

  /* ---------- Stanje ---------- */
  var cardsCount;   // N – koliko prvih nagrada iz AWARDS je aktivno
  var order;        // niz indeksa u AWARDS, trenutni kružni redosled na točku
  var winIndex;     // indeks u AWARDS
  var phase;        // 'idle' | 'spinning' | 'spinned'
  var spinTimer = null;
  var spinToken = 0;  // poništava zakasnele callback-ove posle Reset-a

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------- Render ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // .wheelIcons (6373:6029) – svih 7 varijanti su SVG 40×40 u assets/
  var ICON_FILES = {
    slash: 'slash', lotto: 'lotto', sports: 'sports', ml6: 'ml6',
    casino: 'casino', freeBet: 'freebet', Voucher: 'voucher'
  };

  function iconHtml(type) {
    return '<img class="wicon" src="assets/' + ICON_FILES[type] + '.svg" width="40" height="40" alt="" draggable="false">';
  }

  function cardHtml(awardIdx) {
    var a = AWARDS[awardIdx];
    var currency = a.currency ? '<span class="award__currency"> ' + escapeHtml(a.currency) + '</span>' : '';
    var badge = a.badge ? '<span class="award__badge">' + escapeHtml(a.badge) + '</span>' : '';
    // .wheel_award type=no-prize (6399:9594) ima svoj krug i strelicu (#ffcdcd)
    // Glow (Ellipse 13) je uvek vidljiv i zelen; ružičasti glow-noprize tek kad no-prize dobije
    var sfx = a.noPrize ? '-noprize' : '';
    return (
      '<div class="award' + (a.noPrize ? ' award--no-prize' : '') + '" data-award="' + awardIdx + '">' +
        '<span class="award__glow" aria-hidden="true"><img src="assets/glow.svg" alt=""></span>' +
        '<div class="award__content">' +
          iconHtml(a.icon) +
          '<div class="award__text">' +
            '<div class="award__value"><span class="award__amount">' + escapeHtml(a.amount) + '</span>' + currency + '</div>' +
            '<p class="award__product">' + (a.product ? escapeHtml(a.product) : '&nbsp;') + '</p>' +
          '</div>' +
        '</div>' +
        '<span class="award__pointer" aria-hidden="true"><img src="assets/pointer' + sfx + '.svg" alt=""></span>' +
        badge +
      '</div>'
    );
  }

  function renderTrack(indices) {
    track.innerHTML = indices.map(cardHtml).join('');
  }

  function cardWidth() {
    var first = track.firstElementChild;
    return first ? first.getBoundingClientRect().width : 156;
  }

  function step() {
    // širina kartice + gap (čita se iz DOM-a da prati CSS)
    var gap = parseFloat(getComputedStyle(track).columnGap) || 8;
    return cardWidth() + gap;
  }

  function trackPadLeft() {
    return parseFloat(getComputedStyle(track).paddingLeft) || 0;
  }

  function isCentered() {
    return viewport.classList.contains('is-centered');
  }

  // scrollLeft pri kojem je kartica `index` poravnata (levo, ili u centru posle spina)
  function scrollForIndex(index) {
    if (isCentered()) {
      return trackPadLeft() + index * step() + cardWidth() / 2 - viewport.clientWidth / 2;
    }
    return index * step();
  }

  function indexForScroll(left) {
    if (isCentered()) {
      return (left + viewport.clientWidth / 2 - trackPadLeft() - cardWidth() / 2) / step();
    }
    return left / step();
  }

  /* ---------- Izbor dobitka ---------- */
  function getParam(name) {
    var m = new RegExp('[?&]' + name + '=(\\d+)').exec(window.location.search);
    return m ? parseInt(m[1], 10) : null;
  }

  // ?win=<index> je samo pomoć za testiranje: važi za PRVI spin posle učitavanja,
  // zatim se briše iz URL-a. Svaki sledeći spin je nasumičan, kao pravo izvlačenje.
  var forcedWin = getParam('win');
  if (forcedWin !== null) removeParamFromUrl('win');

  function pickWinner() {
    var i = forcedWin;
    forcedWin = null;
    if (i !== null && i >= 0 && i < cardsCount) return i;
    return Math.floor(Math.random() * cardsCount);
  }

  function removeParamFromUrl(name) {
    var parts = window.location.search.replace(/^\?/, '').split('&')
      .filter(function (p) { return p && p.indexOf(name + '=') !== 0; });
    var newSearch = parts.length ? '?' + parts.join('&') : '';
    try {
      history.replaceState(null, '', window.location.pathname + newSearch + window.location.hash);
    } catch (e) { /* file:// u nekim browserima – ignoriši, forcedWin svejedno važi samo jednom */ }
  }

  /* ---------- Broj kartica (?cards=N) ---------- */
  function readCardsFromUrl() {
    var n = getParam('cards');
    return (n !== null && n >= MIN_CARDS && n <= MAX_CARDS) ? n : MAX_CARDS;
  }

  function writeParamToUrl(name, value) {
    var search = window.location.search.replace(/^\?/, '');
    var parts = search ? search.split('&').filter(function (p) { return p && p.indexOf(name + '=') !== 0; }) : [];
    if (value !== null) parts.push(name + '=' + value);
    var newSearch = '?' + parts.join('&');
    try {
      history.replaceState(null, '', window.location.pathname + newSearch + window.location.hash);
    } catch (e) {
      // neki browseri ne dozvoljavaju replaceState na file:// – fallback reload
      window.location.search = newSearch;
    }
  }

  function setCards(n) {
    cardsCount = n;
    cardsSelect.value = String(n);
  }

  /* ---------- Mobile / Desktop (?mobile=no) ---------- */
  function readMobileFromUrl() {
    return !/[?&]mobile=no(&|$)/.test(window.location.search);
  }

  function setMobile(isMobile) {
    mobileSelect.value = isMobile ? 'yes' : 'no';
    phoneEl.classList.toggle('is-desktop', !isMobile);
  }

  /* ---------- Tok ---------- */
  function reset() {
    clearTimeout(spinTimer);
    spinToken++;
    phase = 'idle';
    winIndex = null;
    order = [];
    for (var i = 0; i < cardsCount; i++) order.push(i);

    track.style.transition = 'none';
    track.style.transform = '';
    track.style.paddingLeft = '';
    track.style.paddingRight = '';
    renderTrack(order);
    viewport.classList.remove('is-locked', 'is-centered');
    viewport.scrollLeft = 0;

    spinBtn.disabled = false;
    spinBtn.textContent = LABEL_SPIN;
    spinBtn.classList.remove('btn--secondary');
    spinBtn.classList.add('btn--primary', 'btn--lg');
    cardsSelect.disabled = false;
    mobileSelect.disabled = false;

    wheelDialog.hidden = false;
    resultDialog.hidden = true;
  }

  function spin() {
    if (phase !== 'idle') return;
    phase = 'spinning';
    spinBtn.disabled = true;
    cardsSelect.disabled = true;
    mobileSelect.disabled = true;

    winIndex = pickWinner();
    var n = order.length;
    var p = order.indexOf(winIndex);

    if (reducedMotion && reducedMotion.matches) {
      finish(p);
      return;
    }

    var startOffset = viewport.scrollLeft;
    viewport.classList.add('is-locked');

    var s = step();
    var loopWidth = n * s;
    // Broj punih krugova: bar MIN_LOOPS, i dovoljno da put bude >= MIN_TRAVEL (mali N bi inače bio spor)
    var loops = Math.max(MIN_LOOPS, Math.ceil(MIN_TRAVEL / loopWidth));
    // Kartica na koju se staje: posle `loops` punih krugova, na poziciji p
    var targetCard = loops * n + p;
    // Desno od dobitne mora biti dovoljno kartica da se popuni ceo vidljivi deo rolera
    var visibleCards = Math.ceil(viewport.clientWidth / s) + 1;
    var copies = Math.ceil((targetCard + visibleCards) / n);

    // Dupliran niz (copies × order) – traka je uvek šira od vidljivog dela
    var extended = [];
    for (var k = 0; k < copies; k++) extended = extended.concat(order);

    renderTrack(extended);
    viewport.scrollLeft = 0;
    track.style.transition = 'none';
    track.style.transform = 'translateX(' + (-startOffset) + 'px)';

    // startOffset < loopWidth (idle traka ima samo n kartica), pa je target uvek ispred.
    // 3+ kartice: točak staje sa dobitnom u centru; 2 kartice: dobitna levo (kao do sada).
    var target = targetCard * s;
    if (n >= MIN_CENTERED) {
      target = trackPadLeft() + targetCard * s + cardWidth() / 2 - viewport.clientWidth / 2;
    }

    // force reflow pa pokreni tranziciju
    void track.offsetWidth;
    var token = spinToken;
    requestAnimationFrame(function () {
      if (phase !== 'spinning' || token !== spinToken) return;
      track.style.transition = 'transform ' + DURATION + 'ms ' + EASE;
      track.style.transform = 'translateX(' + (-target) + 'px)';
      // tajmer kreće tek kad animacija stvarno krene
      spinTimer = setTimeout(function () {
        if (token === spinToken) finish(p);
      }, DURATION);
    });
  }

  function finish(p) {
    var n = order.length;
    var centered = n >= MIN_CENTERED;
    // Pozicija dobitne u novom redosledu: u sredini (ostale levo i desno) ili na početku (2 kartice).
    // Kružni redosled se čuva, pa se slika ne pomera u odnosu na kraj animacije.
    var w = centered ? Math.floor(n / 2) : 0;
    var start = ((p - w) % n + n) % n;
    order = order.slice(start).concat(order.slice(0, start));

    track.style.transition = 'none';
    track.style.transform = '';
    track.style.paddingLeft = '';
    track.style.paddingRight = '';
    renderTrack(order);
    viewport.classList.remove('is-locked');
    viewport.classList.toggle('is-centered', centered);

    if (centered) {
      // Ako sa jedne strane nema dovoljno kartica da se popuni pola rolera (npr. desktop sa 3–4),
      // dodaje se padding da dobitna ipak može biti tačno u centru.
      var s = step();
      var half = viewport.clientWidth / 2 - cardWidth() / 2;
      var basePad = trackPadLeft();
      track.style.paddingLeft = Math.max(basePad, half - w * s) + 'px';
      track.style.paddingRight = Math.max(basePad, half - (n - 1 - w) * s) + 'px';
    }
    void track.offsetWidth;
    viewport.scrollLeft = centered ? scrollForIndex(w) : 0;

    var winnerCard = track.children[w];
    var noPrize = !!AWARDS[winIndex].noPrize;
    winnerCard.classList.add('is-winner');
    if (noPrize) {
      // type=no-prize: crvena ikonica zabrane i ružičast glow umesto zelenih
      winnerCard.querySelector('.wicon').src = 'assets/slash-noprize.svg';
      winnerCard.querySelector('.award__glow img').src = 'assets/glow-noprize.svg';
    }

    phase = 'spinned';
    spinBtn.disabled = false;
    cardsSelect.disabled = false;
    mobileSelect.disabled = false;
    spinBtn.textContent = noPrize ? LABEL_NO_PRIZE : LABEL_SPINNED;
    // Figma: primarno dugme 56px (btn--lg); sekundarno "U redu" u no_award je 48px
    spinBtn.classList.toggle('btn--secondary', noPrize);
    spinBtn.classList.toggle('btn--primary', !noPrize);
    spinBtn.classList.toggle('btn--lg', !noPrize);
  }

  function showResult() {
    var a = AWARDS[winIndex];
    var value = escapeHtml(a.amount) + (a.currency ? ' ' + escapeHtml(a.currency) : '');
    resultTitle.textContent = 'Čestitamo';
    resultBody.innerHTML =
      'Osvojili ste ' + escapeHtml(a.badge) + ' (' + escapeHtml(a.product) + ') u vrednosti od ' + value +
      '. Uslove otključavanja bonusa možete pogledati na <a href="#" onclick="return false">ovom linku</a>.';
    wheelDialog.hidden = true;
    resultDialog.hidden = false;
  }

  function closeAll() {
    if (phase === 'spinning') return;
    wheelDialog.hidden = true;
    resultDialog.hidden = true;
  }

  /* ---------- Događaji ---------- */
  spinBtn.addEventListener('click', function () {
    if (phase === 'idle') spin();
    else if (phase === 'spinned') {
      // Bez nagrade: "U redu" samo zatvara dijalog, nema dijaloga sa rezultatom
      if (AWARDS[winIndex].noPrize) closeAll();
      else showResult();
    }
  });
  okBtn.addEventListener('click', closeAll);
  resetBtn.addEventListener('click', reset);
  cardsSelect.addEventListener('change', function () {
    if (phase === 'spinning') return;
    var n = parseInt(cardsSelect.value, 10);
    setCards(n);
    writeParamToUrl('cards', n);
    reset();
  });
  mobileSelect.addEventListener('change', function () {
    if (phase === 'spinning') return;
    var isMobile = mobileSelect.value === 'yes';
    setMobile(isMobile);
    writeParamToUrl('mobile', isMobile ? null : 'no');
    reset();
  });
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) {
    b.addEventListener('click', closeAll);
  });

  /* ---------- Skrol rolera mišem (pre i posle spina) ----------
     Dodir koristi nativni skrol (touch-action: pan-x). Za miš: prevlačenje + točkić. */
  function snapTo(index) {
    var max = viewport.scrollWidth - viewport.clientWidth;
    var left = Math.max(0, Math.min(max, scrollForIndex(index)));
    viewport.scrollTo({ left: left, behavior: 'smooth' });
  }

  function nearestIndex() {
    return Math.round(indexForScroll(viewport.scrollLeft));
  }

  // Prevlačenje mišem
  var drag = null;
  var snapRestoreTimer = null;

  viewport.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'mouse' || e.button !== 0 || phase === 'spinning') return;
    clearTimeout(snapRestoreTimer);
    drag = { x: e.clientX, left: viewport.scrollLeft, lastX: e.clientX, lastT: e.timeStamp, v: 0 };
    viewport.classList.add('is-dragging');
    viewport.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  viewport.addEventListener('pointermove', function (e) {
    if (!drag) return;
    viewport.scrollLeft = drag.left - (e.clientX - drag.x);
    var dt = e.timeStamp - drag.lastT;
    if (dt > 0) drag.v = (e.clientX - drag.lastX) / dt; // px/ms
    drag.lastX = e.clientX;
    drag.lastT = e.timeStamp;
  });

  function endDrag(e) {
    if (!drag) return;
    var moved = e.clientX - drag.x;
    var v = drag.v;
    drag = null;
    // brz potez = sledeća/prethodna kartica, inače najbliža
    var idx = nearestIndex();
    if (Math.abs(v) > 0.4 && Math.abs(moved) > 10) {
      idx = Math.round(indexForScroll(viewport.scrollLeft) + (v < 0 ? 0.5 : -0.5));
    }
    snapTo(idx);
    // scroll-snap vraćamo tek kad se završi glatki skrol do kartice
    snapRestoreTimer = setTimeout(function () {
      viewport.classList.remove('is-dragging');
    }, 400);
  }
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);

  // Točkić: vertikalni točkić pomera roler za jednu karticu; horizontalni (trackpad) radi nativno
  var wheelLock = false;
  viewport.addEventListener('wheel', function (e) {
    if (phase === 'spinning') { e.preventDefault(); return; }
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    if (wheelLock) return;
    wheelLock = true;
    snapTo(nearestIndex() + (e.deltaY > 0 ? 1 : -1));
    setTimeout(function () { wheelLock = false; }, 250);
  }, { passive: false });

  // Slike u karticama ne smeju da se "prevlače" kao fajl
  viewport.addEventListener('dragstart', function (e) { e.preventDefault(); });

  setMobile(readMobileFromUrl());
  setCards(readCardsFromUrl());
  reset();
})();
