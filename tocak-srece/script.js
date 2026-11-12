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
  var MIN_TRAVEL = 4000;        // px – minimalni put kursora (3+ kartice)
  var TWO_CARDS_HOPS = 11;      // 2 kartice: broj prelazaka isticanja levo-desno pre zaustavljanja
  var W2_TURNS = 4;             // wheel2: najmanje punih okreta prstena
  var W2_EASE = 'cubic-bezier(0.15, 0.85, 0.25, 1)';
  var W2_LABEL_SPIN = 'spin';
  var W2_LABEL_DONE = 'ok';
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
  var designSelect = document.getElementById('designSelect');
  var wheel2Dialog = document.getElementById('wheel2Dialog');
  var ring = document.getElementById('ring');
  var hubBtn = document.getElementById('hubBtn');
  var hubLabel = document.getElementById('hubLabel');
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

  /* ---------- Dizajn: wheel1 (roler) / wheel2 (kružni točak) (?wheel=2) ---------- */
  var design = 1;

  function readDesignFromUrl() {
    return getParam('wheel') === 2 ? 2 : 1;
  }

  function setDesign(d) {
    design = d;
    designSelect.value = String(d);
  }

  function setControlsDisabled(disabled) {
    cardsSelect.disabled = disabled;
    mobileSelect.disabled = disabled;
    designSelect.disabled = disabled;
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
    activeCard = null;
    viewport.classList.remove('is-locked', 'is-centered');
    viewport.scrollLeft = 0;

    spinBtn.disabled = false;
    spinBtn.textContent = LABEL_SPIN;
    spinBtn.classList.remove('btn--secondary');
    spinBtn.classList.add('btn--primary', 'btn--lg');
    setControlsDisabled(false);

    resetWheel2();

    wheelDialog.hidden = design !== 1;
    wheel2Dialog.hidden = design !== 2;
    resultDialog.hidden = true;
  }

  function spin() {
    if (phase !== 'idle') return;
    phase = 'spinning';
    spinBtn.disabled = true;
    setControlsDisabled(true);

    winIndex = pickWinner();
    var n = order.length;
    var w = order.indexOf(winIndex);   // pozicija dobitne – kartice se nikad ne dupliraju niti premeštaju

    if (reducedMotion && reducedMotion.matches) {
      finish(w);
      return;
    }

    /* Animacija koristi SAMO stvarne kartice. "Kursor" (u = indeks kartice, može biti decimalan)
       ide levo-desno po kartikama i odbija se od krajeva, usporava i staje na dobitnoj.
       3+ kartice: traka se pomera tako da je kursor u centru rolera (na krajevima ostaje prazan prostor).
       2 kartice: traka stoji, samo isticanje skače između kartica. */
    var centered = n >= MIN_CENTERED;
    var s = step();
    var cw = cardWidth();
    var vw = viewport.clientWidth;
    var pad = trackPadLeft();
    var L = n - 1;
    var startScroll = viewport.scrollLeft;

    viewport.classList.add('is-locked');
    track.style.transition = 'none';
    if (centered) {
      // skrol prebacujemo u transform da bi kursor mogao da centrira i krajnje kartice
      viewport.scrollLeft = 0;
      track.style.transform = 'translateX(' + (-startScroll) + 'px)';
    }

    function offsetFor(u) { return pad + u * s + cw / 2 - vw / 2; }

    var u0 = centered ? Math.min(L, (startScroll + vw / 2 - pad - cw / 2) / s) : 0;
    var minTravel = centered ? Math.max(MIN_TRAVEL / s, 3 * n) : TWO_CARDS_HOPS;
    var uEnd = landingPoint(u0 + minTravel, w, L);

    var token = spinToken;
    var t0 = null;
    function frame(now) {
      if (phase !== 'spinning' || token !== spinToken) return;
      if (t0 === null) t0 = now;
      var t = Math.min(1, (now - t0) / DURATION);
      var eased = 1 - Math.pow(1 - t, 4);           // ease-out (brzo pa sve sporije)
      var u = bounce(u0 + (uEnd - u0) * eased, L);
      if (centered) track.style.transform = 'translateX(' + (-offsetFor(u)) + 'px)';
      setActive(Math.round(u));
      if (t < 1) requestAnimationFrame(frame);
      else finish(w);
    }
    requestAnimationFrame(frame);
  }

  // Put "razvijen" u pravu liniju → pozicija na kartama: prvo desno do kraja, pa odbijanje levo-desno
  function bounce(x, L) {
    if (x <= L) return x;
    var t = (x - L) % (2 * L);
    return t < L ? L - t : t - L;
  }

  // Najmanja tačka na razvijenom putu >= minX u kojoj kursor staje tačno na kartici w
  function landingPoint(minX, w, L) {
    if (w >= minX) return w;
    for (var k = 0; ; k++) {
      var back = L + 2 * L * k + (L - w);     // na putu ulevo
      if (back >= minX) return back;
      var fwd = L + 2 * L * k + L + w;        // na putu udesno
      if (fwd >= minX) return fwd;
    }
  }

  var activeCard = null;
  function setActive(i) {
    var el = track.children[Math.max(0, Math.min(track.children.length - 1, i))] || null;
    if (el === activeCard) return;
    if (activeCard) activeCard.classList.remove('is-active');
    if (el) el.classList.add('is-active');
    activeCard = el;
  }

  function finish(w) {
    var n = order.length;
    var centered = n >= MIN_CENTERED;

    if (activeCard) activeCard.classList.remove('is-active');
    activeCard = null;

    track.style.transition = 'none';
    track.style.transform = '';
    track.style.paddingLeft = '';
    track.style.paddingRight = '';
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
    setControlsDisabled(false);
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
    wheel2Dialog.hidden = true;
    resultDialog.hidden = false;
  }

  function closeAll() {
    if (phase === 'spinning') return;
    wheelDialog.hidden = true;
    wheel2Dialog.hidden = true;
    resultDialog.hidden = true;
  }

  /* ---------- Wheel 2: kružni točak ----------
     Svaka stvarna kartica ima svoje mesto na krugu (360°/N). Okreće se ceo prsten
     i staje tako da je dobitna kartica gore, ispod strelice u centru. Bez kopija kartica. */
  var ringAngle = 0;

  function resetWheel2() {
    ringAngle = 0;
    ring.style.transition = 'none';
    ring.style.transform = 'rotate(0deg)';
    var n = cardsCount;
    var html = '';
    for (var i = 0; i < n; i++) {
      html += '<div class="w2-slot" style="--a:' + (i * 360 / n) + 'deg">' + cardHtml(i) + '</div>';
    }
    ring.innerHTML = html;
    hubBtn.disabled = false;
    hubLabel.textContent = W2_LABEL_SPIN;
    hubBtn.setAttribute('aria-label', 'Zavrti točak');
  }

  function spin2() {
    if (phase !== 'idle') return;
    phase = 'spinning';
    hubBtn.disabled = true;
    setControlsDisabled(true);

    winIndex = pickWinner();
    var n = cardsCount;
    // Okret u smeru kazaljke: kartica na uglu a dolazi gore kad je ugao prstena ≡ -a (mod 360)
    var a = winIndex * 360 / n;
    var target = ringAngle + W2_TURNS * 360 + ((((-a - ringAngle) % 360) + 360) % 360);

    if (reducedMotion && reducedMotion.matches) {
      ringAngle = target;
      ring.style.transition = 'none';
      ring.style.transform = 'rotate(' + target + 'deg)';
      finish2();
      return;
    }

    var token = spinToken;
    void ring.offsetWidth;
    requestAnimationFrame(function () {
      if (phase !== 'spinning' || token !== spinToken) return;
      ringAngle = target;
      ring.style.transition = 'transform ' + DURATION + 'ms ' + W2_EASE;
      ring.style.transform = 'rotate(' + target + 'deg)';
      spinTimer = setTimeout(function () {
        if (token === spinToken) finish2();
      }, DURATION);
    });
  }

  function finish2() {
    var card = ring.children[winIndex].firstElementChild;
    var noPrize = !!AWARDS[winIndex].noPrize;
    card.classList.add('is-winner');
    if (noPrize) {
      card.querySelector('.wicon').src = 'assets/slash-noprize.svg';
      card.querySelector('.award__glow img').src = 'assets/glow-noprize.svg';
    }
    phase = 'spinned';
    hubBtn.disabled = false;
    hubLabel.textContent = W2_LABEL_DONE;
    hubBtn.setAttribute('aria-label', noPrize ? 'U redu' : 'Preuzmi nagradu');
    setControlsDisabled(false);
  }

  hubBtn.addEventListener('click', function () {
    if (phase === 'idle') spin2();
    else if (phase === 'spinned') {
      // isto kao wheel1: bez nagrade samo zatvara, inače dijalog sa rezultatom
      if (AWARDS[winIndex].noPrize) closeAll();
      else showResult();
    }
  });

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
  designSelect.addEventListener('change', function () {
    if (phase === 'spinning') return;
    var d = designSelect.value === '2' ? 2 : 1;
    setDesign(d);
    writeParamToUrl('wheel', d === 2 ? 2 : null);
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
  setDesign(readDesignFromUrl());
  setCards(readCardsFromUrl());
  reset();
})();
