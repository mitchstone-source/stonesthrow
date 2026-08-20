/* =============================================================================
   StonesThrow — Application layer
   -----------------------------------------------------------------------------
   Responsibilities (kept in clearly separated sections):
     • Router & shell
     • Homepage
     • Planning wizard (traveller / dates / preferences / accommodation / budget)
     • Search orchestration  (the "hard work" of narrowing down options)
     • Transparent scoring engine (+ adjustable priorities that re-rank)
     • Results experience (destinations, flights, stays, activities, weather)
     • Five-option comparison tool
     • Alternative dates & destinations
     • AI travel adviser (rule-based, explains trade-offs & updates results)
     • Saved holidays, sharing, export
     • Extras + a clearly-labelled demo booking flow
     • Admin / provider configuration
   All prices are INDICATIVE demo figures — see data.js.
   ========================================================================== */

const App = (function () {
  'use strict';
  const { STConfig, DESTINATIONS, AIRPORTS, SAMPLE_SEARCH, providers, fmt, milesBetween } = ST;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = id => document.getElementById(id);

  /* ------------------------------------------------------------------ state */
  const state = {
    search: null,       // collected wizard inputs
    results: null,      // orchestrated results
    priorities: defaultPriorities(),
    saved: loadSaved(),
    resultTab: 'overview',
    chat: []
  };

  function defaultPriorities() {
    return {
      price:        { label: 'Price / value',     w: 9 },
      style:        { label: 'Holiday style',      w: 8 },
      facilities:   { label: 'Facilities',         w: 8 },
      weather:      { label: 'Weather',            w: 7 },
      flights:      { label: 'Flight convenience', w: 6 },
      activities:   { label: 'Things to do',       w: 6 },
      location:     { label: 'Location',           w: 6 },
      family:       { label: 'Family suitability', w: 5 },
      accessibility:{ label: 'Accessibility',      w: 3 }
    };
  }

  /* =======================================================================
     ROUTER & SHELL
     ==================================================================== */
  const app = () => el('app');

  function go(route) {
    location.hash = route;
  }
  function router() {
    const hash = location.hash.slice(1) || '';
    // shared comparison link
    if (hash.startsWith('shared=')) {
      try {
        const data = JSON.parse(decodeURIComponent(escape(atob(hash.slice(7)))));
        hydrateSharedSearch(data);
        return;
      } catch (e) { console.warn('bad share link', e); }
    }
    if (hash === 'plan') return renderWizard();
    if (hash === 'results') return state.results ? renderResults() : renderHome();
    if (hash === 'saved') return renderSaved();
    if (hash === 'admin') return renderAdmin();
    return renderHome();
  }

  function shellChrome() {
    // header + footer injected once around #app content via wrappers already in DOM
    wireHeader();
  }

  /* =======================================================================
     HOMEPAGE
     ==================================================================== */
  function renderHome() {
    setTab(null);
    const featured = DESTINATIONS.slice(0, 8);
    app().innerHTML = `
      <section class="hero">
        <div class="hero-bg" id="heroBg">
          ${HERO_IMAGES.map((slug, idx) => `<div class="hslide ${idx===0?'active':''}" style="background-image:url('${ST.stayImgUrl(slug, 1600, 900)}')"></div>`).join('')}
          <div class="hero-overlay"></div>
        </div>
        <div class="wrap hero-inner">
          <div class="hero-badges">
            <span class="hero-badge">★ Independent & impartial</span>
            <span class="hero-badge">Compares flights, villas, hotels &amp; extras</span>
            <span class="hero-badge">Demo mode — realistic sample data</span>
          </div>
          <h1>Find the holiday that fits your family perfectly.</h1>
          <p class="sub">Tell us who you're travelling with, what you enjoy and roughly where you'd like to go.
            We'll search, compare and help you find the best holiday for your money.</p>

          <div class="searchcard" role="search">
            <label for="q">Where would you like to go, and what kind of holiday are you dreaming of?</label>
            <input id="q" class="bigfield" type="text" autocomplete="off"
              placeholder="e.g. a cheap beach holiday for a family of five, somewhere warm in Europe…"
              aria-label="Describe your ideal holiday">
            <div class="chips" aria-label="Quick ideas">
              ${['Somewhere warm in Europe','Family beach holiday with a pool','Villa with a private pool',
                 'Relaxing walking holiday with good food','Greece','Mediterranean']
                 .map(c => `<button type="button" class="chip" data-q="${c}">${c}</button>`).join('')}
            </div>
            <div class="row">
              <button class="btn btn-primary" id="startBtn" style="flex:1">Start Planning My Holiday →</button>
              <button class="btn btn-ghost" id="sampleBtn" title="Load the demo family-of-five search">Try a sample search</button>
            </div>
          </div>
        </div>
      </section>

      <section class="block">
        <div class="wrap">
          <div class="section-head">
            <div class="eyebrow">How it works</div>
            <h2>A proper travel agent — that works around you</h2>
            <p class="muted">We don't drown you in hundreds of results. We do the hard work of narrowing things down to the best five options for your budget and your priorities.</p>
          </div>
          <div class="grid grid-4 steps">
            ${[
              ['1','Tell us about your trip','Who’s travelling, ages, dates, where from and roughly where to.'],
              ['2','Share your priorities','Beach? Pool? Culture? Budget? Mark what’s essential vs nice-to-have.'],
              ['3','We search &amp; compare','Flights, accommodation, weather, activities and clever alternatives.'],
              ['4','Pick with confidence','Five best options side by side, explained in plain English.']
            ].map(s => `<div class="card card-pad"><div class="step"><div class="num">${s[0]}</div><h3>${s[1]}</h3><p class="muted small">${s[2]}</p></div></div>`).join('')}
          </div>
        </div>
      </section>

      <section class="block" style="background:var(--surface)">
        <div class="wrap">
          <div class="between">
            <div class="section-head" style="margin-bottom:0">
              <div class="eyebrow">Featured destinations</div>
              <h2>Where our travellers are heading</h2>
            </div>
            <button class="btn btn-brand" id="exploreBtn">Plan a trip →</button>
          </div>
          <div class="grid grid-4" id="destTiles" style="margin-top:1.4rem"></div>
        </div>
      </section>

      <section class="block">
        <div class="wrap split">
          <div>
            <div class="eyebrow">Example savings</div>
            <h2>Flexible dates can save you hundreds</h2>
            <p class="muted">When you tell us how flexible you are, we automatically check nearby dates and departure airports. Small changes often mean big savings for a family.</p>
            <div class="card card-pad">
              <table class="dates">
                <thead><tr><th>Dates</th><th>Total</th><th>Difference</th><th>Note</th></tr></thead>
                <tbody>
                  <tr><td>Your preferred week</td><td>£4,850</td><td>—</td><td>Your choice</td></tr>
                  <tr><td>Two days earlier</td><td>£4,420</td><td class="save">Save £430</td><td>Best value</td></tr>
                  <tr><td>Following week</td><td>£4,105</td><td class="save">Save £745</td><td class="pill pill-cheap">Cheapest</td></tr>
                </tbody>
              </table>
              <p class="small muted" style="margin:.6rem 0 0">Illustrative demo figures.</p>
            </div>
          </div>
          <div>
            <div class="eyebrow">Why StonesThrow</div>
            <h2>Why use us?</h2>
            <div class="stack">
              ${[
                ['🔎','Independent &amp; impartial','We compare across suppliers — we never just push the priciest option.'],
                ['⚖️','Best value, not just cheapest','A transparent value score weighs price, quality, weather &amp; more.'],
                ['♿','Built around your needs','Accessibility and family requirements shape the results themselves.'],
                ['💬','A real recommendation','Our adviser explains the trade-offs honestly, in plain English.']
              ].map(f => `<div class="feature card card-pad"><div class="ic">${f[0]}</div><h3>${f[1]}</h3><p class="muted small" style="margin:0">${f[2]}</p></div>`).join('')}
            </div>
          </div>
        </div>
      </section>

      <section class="block" style="background:var(--surface)">
        <div class="wrap">
          <div class="section-head"><div class="eyebrow">What travellers say</div><h2>Loved by families &amp; couples</h2>
          <p class="small muted">Demonstration testimonials shown with clearly-labelled placeholder content.</p></div>
          <div class="grid grid-3">
            ${[
              ['“Found us a villa with a pool £600 cheaper than we’d seen anywhere — and closer to the beach.”','The Prices, family of 5 · demo'],
              ['“I loved that it explained why it recommended each option. Felt like a real travel agent.”','Dan &amp; Mo · demo'],
              ['“The accessible filter actually changed the results, not just hid a few. Brilliant.”','H. Okafor · demo']
            ].map(t => `<div class="card card-pad"><div class="stars">★★★★★</div><p class="quote">${t[0]}</p><p class="small muted" style="margin:0">— ${t[1]}</p></div>`).join('')}
          </div>
        </div>
      </section>
    `;
    // hero background: gradient base (fallback) + crossfading photo slideshow
    el('heroBg').style.background = heroGradient();
    startHeroSlideshow();
    // destination tiles
    const tiles = el('destTiles');
    featured.forEach(d => tiles.appendChild(destTile(d)));
    // wire
    el('startBtn').onclick = () => startWizardFromQuery($('#q').value);
    el('exploreBtn').onclick = () => startWizardFromQuery('');
    el('sampleBtn').onclick = () => { loadSample(); };
    $$('.chip').forEach(c => c.onclick = () => { $('#q').value = c.dataset.q; $('#q').focus(); });
    $('#q').addEventListener('keydown', e => { if (e.key === 'Enter') startWizardFromQuery($('#q').value); });
    window.scrollTo(0, 0);
  }

  /* stylized gradient "photography" ------------------------------------ */
  function heroGradient() {
    return `radial-gradient(120% 90% at 75% 15%, rgba(255,255,255,.25), transparent 60%),
            linear-gradient(160deg, #0d5c6b 0%, #12768a 40%, #1f8ea3 65%, #e8a635 120%)`;
  }
  // Rotating hero photography (verified Unsplash coast/beach scenics).
  const HERO_IMAGES = [
    'photo-1507525428034-b723cf961d3e', // golden beach at sunset
    'photo-1533105079780-92b9be482077', // Aegean blue sea & white village
    'photo-1519046904884-53103b34b206', // palm-fringed turquoise beach
    'photo-1548574505-5e239809ee19',    // turquoise archipelago bay
    'photo-1509233725247-49e657c54213'  // calm turquoise cove
  ];
  let heroTimer = null;
  function startHeroSlideshow() {
    if (heroTimer) { clearInterval(heroTimer); heroTimer = null; }
    const slides = $$('#heroBg .hslide');
    if (slides.length < 2) return;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let i = 0;
    heroTimer = setInterval(() => {
      // stop if the hero has been replaced by another view
      if (!document.body.contains(slides[0])) { clearInterval(heroTimer); heroTimer = null; return; }
      slides[i].classList.remove('active');
      i = (i + 1) % slides.length;
      slides[i].classList.add('active');
    }, 5000);
  }
  function destGradientStyle(dest) {
    const [a, b] = dest.theme;
    return `background:
      radial-gradient(90% 60% at 78% 22%, rgba(255,255,255,.35), transparent 55%),
      radial-gradient(60% 40% at 20% 88%, rgba(255,255,255,.12), transparent 60%),
      linear-gradient(155deg, ${a} 0%, ${a} 42%, ${b} 100%);`;
  }
  function destTile(dest) {
    const div = document.createElement('div');
    div.className = 'desttile';
    div.setAttribute('role', 'button');
    div.setAttribute('tabindex', '0');
    div.setAttribute('aria-label', `Plan a holiday to ${dest.name}, ${dest.country}`);
    div.innerHTML = `
      <div class="ph" style="${destGradientStyle(dest)}">${sunWavesSVG()}${destPhoto(dest, 560, 420)}</div>
      <div class="cap"><h3>${dest.name}</h3><div class="m">${dest.country} · ${dest.region}</div></div>`;
    const open = () => startWizardFromQuery(dest.name);
    div.onclick = open;
    div.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } };
    return div;
  }
  function sunWavesSVG() {
    return `<svg viewBox="0 0 400 300" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true" style="position:absolute;inset:0;opacity:.9">
      <circle cx="310" cy="70" r="34" fill="rgba(255,255,255,.55)"/>
      <path d="M0,235 C60,215 120,255 200,235 C280,215 340,255 400,235 L400,300 L0,300 Z" fill="rgba(255,255,255,.16)"/>
      <path d="M0,258 C70,242 140,275 210,258 C290,240 350,275 400,258 L400,300 L0,300 Z" fill="rgba(255,255,255,.22)"/>
    </svg>`;
  }
  // Real accommodation photo layered over the gradient fallback. If the CDN image
  // fails to load, it removes itself and the gradient/waves remain visible.
  function stayPhoto(stay, w, h) {
    if (!stay || !stay.img) return '';
    const url = ST.stayImgUrl(stay.img, w || 800, h || 600);
    return `<img class="phimg" src="${url}" alt="${escapeHtml(stay.name)}" loading="lazy" onerror="this.remove()">`;
  }
  // Destination scenery photo, same gradient-fallback behaviour.
  function destPhoto(dest, w, h) {
    if (!dest || !dest.heroImg) return '';
    const url = ST.stayImgUrl(dest.heroImg, w || 800, h || 600);
    return `<img class="phimg" src="${url}" alt="${escapeHtml(dest.name)}, ${escapeHtml(dest.country)}" loading="lazy" onerror="this.remove()">`;
  }

  /* =======================================================================
     WIZARD
     ==================================================================== */
  const STYLE_OPTIONS = [
    ['beach','🏖️','Beach'], ['relaxing','😌','Relaxing &amp; peaceful'], ['adventure','🧗','Adventure'],
    ['walking','🥾','Walking &amp; hiking'], ['culture','🏛️','Culture &amp; history'], ['landmarks','📸','Monuments &amp; landmarks'],
    ['food','🍽️','Food &amp; restaurants'], ['nightlife','🍸','Nightlife'], ['family-entertainment','🎡','Family entertainment'],
    ['water-sports','🏄','Water sports'], ['nature','🦎','Nature &amp; wildlife'], ['city-break','🏙️','City break'],
    ['luxury','💎','Luxury &amp; pampering'], ['active','⚡','Active holiday'], ['winter-sun','☀️','Winter sun'],
    ['skiing','⛷️','Skiing / mountains']
  ];
  const ACCOM_OPTIONS = [
    ['hotel','🏨','Hotel'], ['resort','🌴','Resort'], ['villa','🏡','Villa'], ['apartment','🏢','Apartment'],
    ['guest-house','🛎️','Guest house'], ['bnb','🍳','B&amp;B'], ['holiday-home','🔑','Holiday home'],
    ['airbnb','🏠','Airbnb-style'], ['any','✨','Best option regardless']
  ];
  const BOARD_OPTIONS = [
    ['room-only','Room only'], ['self-catering','Self-catering'], ['bed-and-breakfast','Bed &amp; breakfast'],
    ['half-board','Half board'], ['full-board','Full board'], ['all-inclusive','All-inclusive'], ['flexible','I’m flexible']
  ];
  const FACILITIES = [
    ['pool','Swimming pool'], ['private-pool','Private pool'], ['beachfront','Beachfront'], ['walk-to-beach','Walking distance to beach'],
    ['kids-club','Kids’ club'], ['water-park','Water park'], ['air-con','Air conditioning'], ['wifi','Wi-Fi'],
    ['kitchen','Kitchen'], ['washing-machine','Washing machine'], ['parking','Parking'], ['gym','Gym'], ['spa','Spa'],
    ['adults-only','Adults-only'], ['family-rooms','Family rooms'], ['multiple-bedrooms','Multiple bedrooms'],
    ['wheelchair','Wheelchair accessible'], ['ground-floor','Ground floor'], ['lift','Lift'], ['quiet','Quiet location'],
    ['town-centre','Town / city centre'], ['restaurants-nearby','Restaurants nearby']
  ];
  const ACCESS_OPTIONS = [
    ['wheelchair','Wheelchair user'], ['step-free','Step-free / no stairs'], ['lift','Lift required'],
    ['limited-walking','Limited walking distance'], ['visual','Visual impairment'], ['hearing','Hearing impairment'],
    ['dietary','Dietary / medical needs']
  ];

  let wizStep = 0;
  const WIZ_STEPS = ['destination','travellers','departure','styles','accommodation','facilities','budget'];

  function startWizardFromQuery(q) {
    state.search = blankSearch();
    if (q && q.trim()) {
      const parsed = parseQuery(q);
      state.search.query = q.trim();
      state.search.styles = parsed.styles;
      state.search.destId = parsed.destId || null;
      state.search.region = parsed.region || null;
      state.search.destText = parsed.destText || q.trim();
      if (parsed.adults) state.search.adults = parsed.adults;
      if (parsed.childAges) state.search.childAges = parsed.childAges;
      if (parsed.accomTypes) state.search.accomTypes = parsed.accomTypes;
    }
    wizStep = 0;
    go('plan');
  }

  function blankSearch() {
    return {
      query: '', destText: '', destId: null, region: null,
      adults: 2, childAges: [], infants: 0, accessibility: [], special: '',
      originCodes: ['LGW'], radiusMiles: 0,
      date: defaultAugust(), flexibility: 3, nights: 7,
      styles: [], accomTypes: ['any'], board: 'flexible',
      facilities: {}, budget: 5000, budgetMode: 'best-value', includes: ['flights','accommodation']
    };
  }
  function defaultAugust() {
    const now = new Date();
    let y = now.getFullYear();
    const aug = new Date(y, 7, 15);
    if (aug < now) aug.setFullYear(y + 1);
    return aug;
  }

  function loadSample() {
    const s = Object.assign(blankSearch(), JSON.parse(JSON.stringify(SAMPLE_SEARCH)));
    s.date = defaultAugust();
    state.search = s;
    runSearch();
  }

  function renderWizard() {
    if (!state.search) state.search = blankSearch();
    setTab(null);
    const total = WIZ_STEPS.length;
    const segs = WIZ_STEPS.map((_, i) =>
      `<div class="seg ${i < wizStep ? 'done' : i === wizStep ? 'current' : ''}"></div>`).join('');
    app().innerHTML = `
      <div class="wrap wizard">
        <div class="progress" aria-label="Step ${wizStep + 1} of ${total}">${segs}</div>
        <div class="wizstep" id="wizBody"></div>
        <div class="wiznav">
          <button class="btn btn-ghost" id="backBtn">${wizStep === 0 ? '← Home' : '← Back'}</button>
          <button class="btn btn-primary" id="nextBtn">${wizStep === total - 1 ? 'Search holidays →' : 'Continue →'}</button>
        </div>
      </div>`;
    renderWizStep();
    el('backBtn').onclick = () => {
      collectStep();
      if (wizStep === 0) { go(''); } else { wizStep--; renderWizard(); }
    };
    el('nextBtn').onclick = () => {
      if (!collectStep(true)) return;
      if (wizStep === total - 1) { runSearch(); }
      else { wizStep++; renderWizard(); }
    };
    window.scrollTo(0, 0);
  }

  function renderWizStep() {
    const s = state.search;
    const body = el('wizBody');
    const stepName = WIZ_STEPS[wizStep];
    const heading = {
      destination: 'Where to?', travellers: 'Who’s travelling?', departure: 'Departure & dates',
      styles: 'What kind of holiday?', accommodation: 'Where would you like to stay?',
      facilities: 'What matters most?', budget: 'Budget & priorities'
    }[stepName];
    let html = `<div class="steplabel">Step ${wizStep + 1} of ${WIZ_STEPS.length}</div><h2>${heading}</h2>`;

    if (stepName === 'destination') {
      html += `
        <div class="fieldgroup">
          <label class="q" for="destText">Where would you like to go?</label>
          <div class="hint">A place, a country, a region — or just a vibe. You don't need to know exactly.</div>
          <input id="destText" type="text" value="${escapeHtml(s.destText || '')}" placeholder="e.g. Crete, Greece, Mediterranean, or “somewhere warm”">
        </div>
        <div class="fieldgroup">
          <div class="hint">Popular right now — tap to choose (you'll still see clever alternatives):</div>
          <div class="optgrid">
            ${DESTINATIONS.map(d => `<div class="opt ${s.destId===d.id?'sel':''}" data-dest="${d.id}"><span class="oi">📍</span><span class="lbl">${d.name}<br><span class="small muted">${d.country}</span></span></div>`).join('')}
          </div>
        </div>
        <div class="fieldgroup">
          <label class="q" for="query">Anything else about your ideal trip?</label>
          <textarea id="query" rows="2" placeholder="e.g. private pool, near the beach, good for teenagers…">${escapeHtml(s.query || '')}</textarea>
        </div>`;
    }

    if (stepName === 'travellers') {
      html += `
        <div class="inline">
          <div class="fieldgroup"><label class="q">Adults</label>
            <div class="stepper"><button type="button" data-step="adults" data-d="-1">−</button>
            <input id="adults" type="number" min="1" max="12" value="${s.adults}"><button type="button" data-step="adults" data-d="1">+</button></div></div>
          <div class="fieldgroup"><label class="q">Children</label>
            <div class="stepper"><button type="button" data-step="children" data-d="-1">−</button>
            <input id="children" type="number" min="0" max="10" value="${s.childAges.length}"><button type="button" data-step="children" data-d="1">+</button></div>
            <div class="hint">Ages affect flight prices &amp; room requirements.</div></div>
          <div class="fieldgroup"><label class="q">Infants (under 2)</label>
            <div class="stepper"><button type="button" data-step="infants" data-d="-1">−</button>
            <input id="infants" type="number" min="0" max="6" value="${s.infants}"><button type="button" data-step="infants" data-d="1">+</button></div></div>
        </div>
        <div class="fieldgroup" id="ageBox"><label class="q">Ages of children</label>
          <div class="hint">We use these to price flights and find the right rooms.</div>
          <div class="traveller-ages" id="ages"></div></div>
        <div class="fieldgroup"><label class="q">Accessibility or mobility requirements</label>
          <div class="hint">These genuinely shape the results — not just a filter.</div>
          <div class="optgrid">${ACCESS_OPTIONS.map(a => `<div class="opt ${s.accessibility.includes(a[0])?'sel':''}" data-acc="${a[0]}"><span class="oi">♿</span><span class="lbl">${a[1]}</span></div>`).join('')}</div></div>
        <div class="fieldgroup"><label class="q" for="special">Any other special requirements?</label>
          <textarea id="special" rows="2" placeholder="e.g. travel cot, adjoining rooms, allergy-friendly kitchen…">${escapeHtml(s.special||'')}</textarea></div>`;
    }

    if (stepName === 'departure') {
      html += `
        <div class="fieldgroup"><label class="q">Where would you like to depart from?</label>
          <div class="hint">Choose one or more airports. Prices vary a lot by airport — we'll compare them.</div>
          <div class="optgrid">${AIRPORTS.map(a => `<div class="opt ${s.originCodes.includes(a.code)?'sel':''}" data-air="${a.code}"><span class="oi">🛫</span><span class="lbl">${a.name}<br><span class="small muted">${a.code}</span></span></div>`).join('')}</div>
        </div>
        <div class="fieldgroup"><label class="q" for="radius">…or any airport within</label>
          <div class="inline"><select id="radius">
            ${[0,25,50,75,100,150].map(m => `<option value="${m}" ${s.radiusMiles===m?'selected':''}>${m===0?'Just the airports I picked':m+' miles of my first choice'}</option>`).join('')}
          </select></div></div>
        <div class="inline">
          <div class="fieldgroup"><label class="q" for="date">Ideal travel date</label>
            <input id="date" type="date" value="${toISO(s.date)}"></div>
          <div class="fieldgroup"><label class="q" for="flex">Date flexibility</label>
            <select id="flex">
              ${[[0,'Exact dates'],[1,'± 1 day'],[3,'± 3 days'],[7,'± 7 days'],[99,'Show me the cheapest dates']].map(o=>`<option value="${o[0]}" ${s.flexibility===o[0]?'selected':''}>${o[1]}</option>`).join('')}
            </select></div>
          <div class="fieldgroup"><label class="q" for="nights">How long?</label>
            <select id="nights">
              ${[3,4,5,7,10,14].map(n=>`<option value="${n}" ${s.nights===n?'selected':''}>${n} nights</option>`).join('')}
            </select></div>
        </div>`;
    }

    if (stepName === 'styles') {
      html += `<div class="hint">Pick as many as you like — this shapes both destinations and activities.</div>
        <div class="optgrid" style="margin-top:.8rem">
          ${STYLE_OPTIONS.map(o => `<div class="opt ${s.styles.includes(o[0])?'sel':''}" data-style="${o[0]}"><span class="oi">${o[1]}</span><span class="lbl">${o[2]}</span></div>`).join('')}
        </div>
        <div class="fieldgroup" style="margin-top:1.4rem"><label class="q" for="anythingElse">Anything else? Describe your ideal holiday</label>
          <textarea id="anythingElse" rows="2" placeholder="e.g. quiet walks, historic towns and good restaurants">${escapeHtml(s.styleFree||'')}</textarea></div>`;
    }

    if (stepName === 'accommodation') {
      html += `<div class="fieldgroup"><label class="q">Type of accommodation</label>
        <div class="optgrid">${ACCOM_OPTIONS.map(o=>`<div class="opt ${s.accomTypes.includes(o[0])?'sel':''}" data-accom="${o[0]}"><span class="oi">${o[1]}</span><span class="lbl">${o[2]}</span></div>`).join('')}</div></div>
        <div class="fieldgroup"><label class="q" for="board">Board basis</label>
          <select id="board">${BOARD_OPTIONS.map(o=>`<option value="${o[0]}" ${s.board===o[0]?'selected':''}>${o[1]}</option>`).join('')}</select></div>`;
    }

    if (stepName === 'facilities') {
      html += `<div class="hint">Mark how important each facility is. This drives the recommendations and the trade-offs we consider.</div>
        <div style="margin-top:1rem">
        ${FACILITIES.map(f => {
          const v = s.facilities[f[0]] || 'nice';
          return `<div class="facrow"><div><strong>${f[1]}</strong></div>
            <div class="segmented" data-fac="${f[0]}">
              ${[['essential','Essential'],['preferred','Preferred'],['nice','Nice to have'],['no','Not important']]
                .map(o=>`<button type="button" data-v="${o[0]}" class="${v===o[0]?'on':''}">${o[1]}</button>`).join('')}
            </div></div>`;
        }).join('')}
        </div>`;
    }

    if (stepName === 'budget') {
      html += `
        <div class="fieldgroup"><label class="q" for="budget">Approximate total holiday budget</label>
          <div class="hint">Drag to set your comfortable maximum. We’ll show you the best value within (and near) it.</div>
          <input id="budget" type="range" min="800" max="15000" step="100" value="${s.budget}" style="width:100%;accent-color:var(--brand)">
          <div class="between"><span class="muted small">£800</span><strong id="budgetVal" style="font-size:1.4rem">${fmt.money(s.budget)}</strong><span class="muted small">£15,000+</span></div>
        </div>
        <div class="fieldgroup"><label class="q">How should we treat your budget?</label>
          <div class="optgrid">
            ${[['cheapest','💷','Find the cheapest suitable option'],['best-value','⭐','Best value, even if not cheapest'],['max','🎯','Stay under my maximum']]
              .map(o=>`<div class="opt ${s.budgetMode===o[0]?'sel':''}" data-budgetmode="${o[0]}"><span class="oi">${o[1]}</span><span class="lbl">${o[2]}</span></div>`).join('')}
          </div></div>
        <div class="fieldgroup"><label class="q">Your budget includes…</label>
          <div class="optgrid">
            ${[['flights','✈️','Flights'],['accommodation','🏨','Accommodation'],['transfers','🚐','Transfers'],['carhire','🚗','Car hire'],['parking','🅿️','Airport parking'],['activities','🎟️','Activities']]
              .map(o=>`<div class="opt ${s.includes.includes(o[0])?'sel':''}" data-include="${o[0]}"><span class="oi">${o[1]}</span><span class="lbl">${o[2]}</span></div>`).join('')}
          </div></div>`;
    }

    body.innerHTML = html;
    wireWizStep(stepName);
  }

  function wireWizStep(stepName) {
    const s = state.search;
    // generic multi-select opt toggles
    const toggle = (sel, key, single) => $$(sel).forEach(o => o.onclick = () => {
      const val = o.dataset[key];
      if (single) { $$(sel).forEach(x => x.classList.remove('sel')); o.classList.add('sel'); }
      else { o.classList.toggle('sel'); }
    });

    if (stepName === 'destination') {
      $$('[data-dest]').forEach(o => o.onclick = () => {
        const wasSel = o.classList.contains('sel');
        $$('[data-dest]').forEach(x => x.classList.remove('sel'));
        if (!wasSel) o.classList.add('sel');
      });
    }
    if (stepName === 'travellers') {
      renderAges();
      $$('[data-step]').forEach(b => b.onclick = () => {
        const field = b.dataset.step, d = +b.dataset.d;
        if (field === 'children') {
          let n = clamp(s.childAges.length + d, 0, 10);
          if (n > s.childAges.length) s.childAges.push(8);
          else s.childAges = s.childAges.slice(0, n);
          el('children').value = n; renderAges();
        } else {
          const input = el(field === 'adults' ? 'adults' : 'infants');
          input.value = clamp((+input.value) + d, field === 'adults' ? 1 : 0, 12);
        }
      });
      el('children').addEventListener('change', () => {
        let n = clamp(+el('children').value, 0, 10);
        el('children').value = n;
        while (s.childAges.length < n) s.childAges.push(8);
        s.childAges = s.childAges.slice(0, n);
        renderAges();
      });
      $$('[data-acc]').forEach(o => o.onclick = () => o.classList.toggle('sel'));
    }
    if (stepName === 'departure') {
      $$('[data-air]').forEach(o => o.onclick = () => o.classList.toggle('sel'));
    }
    if (stepName === 'styles') { $$('[data-style]').forEach(o => o.onclick = () => o.classList.toggle('sel')); }
    if (stepName === 'accommodation') { $$('[data-accom]').forEach(o => o.onclick = () => o.classList.toggle('sel')); }
    if (stepName === 'facilities') {
      $$('[data-fac]').forEach(seg => seg.querySelectorAll('button').forEach(btn => btn.onclick = () => {
        seg.querySelectorAll('button').forEach(b => b.classList.remove('on'));
        btn.classList.add('on');
      }));
    }
    if (stepName === 'budget') {
      el('budget').addEventListener('input', e => el('budgetVal').textContent = fmt.money(+e.target.value));
      $$('[data-budgetmode]').forEach(o => o.onclick = () => { $$('[data-budgetmode]').forEach(x=>x.classList.remove('sel')); o.classList.add('sel'); });
      $$('[data-include]').forEach(o => o.onclick = () => o.classList.toggle('sel'));
    }
  }

  function renderAges() {
    const s = state.search;
    const box = el('ages');
    if (!box) return;
    if (!s.childAges.length) { box.innerHTML = `<span class="muted small">No children added.</span>`; return; }
    box.innerHTML = s.childAges.map((age, i) =>
      `<span class="age-pill">Child ${i+1}: <input type="number" min="0" max="17" value="${age}" data-agei="${i}"> yrs
        <button type="button" data-rm="${i}" aria-label="Remove child ${i+1}">✕</button></span>`).join('');
    box.querySelectorAll('[data-agei]').forEach(inp => inp.onchange = () => s.childAges[+inp.dataset.agei] = clamp(+inp.value, 0, 17));
    box.querySelectorAll('[data-rm]').forEach(btn => btn.onclick = () => {
      s.childAges.splice(+btn.dataset.rm, 1); el('children').value = s.childAges.length; renderAges();
    });
  }

  // read the current step's inputs into state.search; validate on advance
  function collectStep(validate) {
    const s = state.search;
    const stepName = WIZ_STEPS[wizStep];
    if (stepName === 'destination') {
      s.destText = el('destText') ? el('destText').value.trim() : s.destText;
      s.query = el('query') ? el('query').value.trim() : s.query;
      const sel = $('[data-dest].sel');
      s.destId = sel ? sel.dataset.dest : null;
      if (!s.destId && s.destText) { const p = parseQuery(s.destText + ' ' + s.query); s.destId = p.destId; s.region = p.region; if (p.styles.length) s.styles = Array.from(new Set(s.styles.concat(p.styles))); }
    }
    if (stepName === 'travellers') {
      s.adults = clamp(+el('adults').value, 1, 12);
      s.infants = clamp(+el('infants').value, 0, 6);
      s.accessibility = $$('[data-acc].sel').map(o => o.dataset.acc);
      s.special = el('special').value.trim();
    }
    if (stepName === 'departure') {
      s.originCodes = $$('[data-air].sel').map(o => o.dataset.air);
      s.radiusMiles = +el('radius').value;
      s.date = fromISO(el('date').value) || s.date;
      s.flexibility = +el('flex').value;
      s.nights = +el('nights').value;
      if (validate && !s.originCodes.length && !s.radiusMiles) { toast('Please choose at least one departure airport.'); return false; }
      if (!s.originCodes.length && s.radiusMiles) s.originCodes = ['LGW'];
    }
    if (stepName === 'styles') {
      s.styles = $$('[data-style].sel').map(o => o.dataset.style);
      s.styleFree = el('anythingElse') ? el('anythingElse').value.trim() : '';
      if (s.styleFree) { const p = parseQuery(s.styleFree); s.styles = Array.from(new Set(s.styles.concat(p.styles))); }
    }
    if (stepName === 'accommodation') {
      s.accomTypes = $$('[data-accom].sel').map(o => o.dataset.accom);
      if (!s.accomTypes.length) s.accomTypes = ['any'];
      s.board = el('board').value;
    }
    if (stepName === 'facilities') {
      s.facilities = {};
      $$('[data-fac]').forEach(seg => { const on = seg.querySelector('button.on'); if (on) s.facilities[seg.dataset.fac] = on.dataset.v; });
    }
    if (stepName === 'budget') {
      s.budget = +el('budget').value;
      const bm = $('[data-budgetmode].sel'); s.budgetMode = bm ? bm.dataset.budgetmode : 'best-value';
      s.includes = $$('[data-include].sel').map(o => o.dataset.include);
      if (!s.includes.length) s.includes = ['flights','accommodation'];
    }
    return true;
  }

  /* natural-language parsing of the free-text query -------------------- */
  function parseQuery(text) {
    const t = ' ' + text.toLowerCase() + ' ';
    const out = { styles: [], destId: null, region: null, destText: text.trim(), adults: null, childAges: null, accomTypes: null };
    // destination / country / region
    for (const d of DESTINATIONS) {
      if (t.includes(d.name.toLowerCase())) out.destId = d.id;
    }
    if (!out.destId) {
      for (const d of DESTINATIONS) {
        if (t.includes(d.country.toLowerCase())) { out.region = d.region; }
      }
    }
    if (t.includes('mediterranean') || t.includes('med ')) out.region = 'Mediterranean';
    if (t.includes('europe')) out.region = out.region || 'Europe';
    // styles by keyword
    const kw = {
      beach: ['beach','seaside','sea','sand'], relaxing: ['relax','peace','quiet','chill','unwind'],
      adventure: ['adventure','adrenaline'], walking: ['walk','hike','hiking','trek'],
      culture: ['culture','history','historic','museum'], food: ['food','restaurant','cuisine','foodie','eat'],
      nightlife: ['nightlife','party','bars','clubs'], 'family-entertainment': ['family','kids','children','teenager','theme park'],
      'water-sports': ['water sport','watersport','snorkel','dive','surf','kayak','jet ski'],
      nature: ['nature','wildlife','scenery'], 'city-break': ['city break','city'], luxury: ['luxury','5 star','five star','pamper','spa'],
      'winter-sun': ['winter sun','warm in winter'], skiing: ['ski','snow','mountain']
    };
    for (const [style, words] of Object.entries(kw)) if (words.some(w => t.includes(w))) out.styles.push(style);
    if (t.includes('warm') || t.includes('hot') || t.includes('sun')) { if (!out.styles.includes('beach')) out.styles.push('beach'); }
    // accommodation hints
    const at = [];
    if (t.includes('villa')) at.push('villa');
    if (t.includes('private pool')) { at.push('villa'); }
    if (t.includes('apartment')) at.push('apartment');
    if (t.includes('hotel')) at.push('hotel');
    if (t.includes('resort')) at.push('resort');
    if (at.length) out.accomTypes = Array.from(new Set(at));
    // party size — "family of five", "for 4", "couple"
    const famMatch = t.match(/family of (\w+)/);
    const numWords = { two:2, three:3, four:4, five:5, six:6, seven:7, eight:8 };
    if (famMatch) {
      const n = numWords[famMatch[1]] || parseInt(famMatch[1]);
      if (n >= 3) { out.adults = 2; out.childAges = new Array(n - 2).fill(9); }
    }
    if (t.includes('couple')) { out.adults = 2; out.childAges = []; }
    return out;
  }

  /* =======================================================================
     SEARCH ORCHESTRATION
     User requirements → analyse → search dest → flexible dates → alt airports
     → accommodation → activities → weather → alternatives → score → top 5
     ==================================================================== */
  function resolveOrigins() {
    const s = state.search;
    let codes = new Set(s.originCodes);
    if (s.radiusMiles > 0 && s.originCodes.length) {
      const first = AIRPORTS.find(a => a.code === s.originCodes[0]);
      AIRPORTS.forEach(a => { if (milesBetween(first, a) <= s.radiusMiles) codes.add(a.code); });
    }
    return AIRPORTS.filter(a => codes.has(a.code));
  }

  function candidateDestinations() {
    const s = state.search;
    // Always consider all, but keep the requested one guaranteed present.
    let list = DESTINATIONS.slice();
    // If a specific destination requested, ensure it's first; alternatives come from style/region match.
    return list;
  }

  // Build one holiday "option" for a destination given the search + chosen date/nights.
  function buildOption(dest, origins, date, nights) {
    const s = state.search;
    // Cheapest flight across chosen origins; also track best-convenience.
    let bestFlight = null, bestConvFlight = null;
    origins.forEach(o => {
      const flights = providers.flights.search({ origin: o, destination: dest, date, nights, travellers: { adults: s.adults, childAges: s.childAges, infants: s.infants } });
      flights.forEach(f => {
        f.convenience = flightConvenience(f, o, dest);
        if (!bestFlight || f.groupPrice < bestFlight.groupPrice) bestFlight = f;
        if (!bestConvFlight || f.convenience > bestConvFlight.convenience) bestConvFlight = f;
      });
    });
    if (!bestFlight) return null;

    // Accommodation matching party & preferences; choose best-scoring.
    const stays = providers.accommodation.search({ destination: dest, nights, date, travellers: { adults: s.adults, childAges: s.childAges, infants: s.infants }, board: s.board });
    if (!stays.length) return null;
    stays.forEach(st => st.matchScore = accommodationMatch(st, dest));
    const chosenStay = stays.slice().sort((a, b) => b.matchScore - a.matchScore)[0];

    const weather = providers.weather.get({ destination: dest, date });
    const activities = providers.activities.search({ destination: dest });

    // Optional extras included in the budget total
    let extras = 0;
    if (s.includes.includes('transfers')) extras += providers.transfer.search({ destination: dest, travellers: s })[0].total;
    if (s.includes.includes('carhire')) extras += Math.min(...providers.carhire.search({ destination: dest, nights }).map(c => c.total));
    if (s.includes.includes('parking') && origins.length) extras += providers.parking.search({ nights })[0].total;

    const flightCost = s.includes.includes('flights') ? bestFlight.groupPrice : bestFlight.groupPrice; // always show flights
    const total = flightCost + chosenStay.total + extras;

    const opt = {
      id: dest.id + '-' + toISO(date) + '-' + nights,
      dest, date, nights, origins,
      flight: bestFlight, bestConvFlight, stay: chosenStay, allStays: stays,
      weather, activities, extras, total,
      partySize: s.adults + s.childAges.length + s.infants
    };
    scoreOption(opt);
    labelOption(opt);
    return opt;
  }

  function runSearch() {
    setTab(null);
    // Loading experience
    const stepsUI = [
      'Understanding your requirements',
      'Searching your destination & dates',
      'Checking flexible dates for savings',
      'Comparing departure airports',
      'Finding suitable accommodation',
      'Researching things to do',
      'Analysing the weather',
      'Suggesting clever alternatives',
      'Scoring every combination',
      'Writing your recommendations'
    ];
    app().innerHTML = `<div class="wrap searching">
      <div class="spinner" aria-hidden="true"></div>
      <h2>Searching around you…</h2>
      <p class="muted">We're doing the hard work so you don't have to.</p>
      <ul class="searchlog" id="searchlog">${stepsUI.map((t,i)=>`<li data-i="${i}">${t}</li>`).join('')}</ul>
    </div>`;
    let i = 0;
    const items = $$('#searchlog li');
    const tick = () => {
      if (i > 0) items[i-1].className = 'done';
      if (i < items.length) { items[i].className = 'active'; i++; setTimeout(tick, 230); }
      else { computeResults(); history.replaceState(null, '', '#results'); renderResults(); }
    };
    tick();
  }

  function computeResults(opts) {
    const fresh = !opts || opts.fresh !== false; // fresh search reseeds chat + resets tab
    const s = state.search;
    const origins = resolveOrigins();
    const date = s.date;
    const nights = s.nights;

    // 1. Build an option per destination.
    let options = candidateDestinations()
      .map(d => buildOption(d, origins, date, nights))
      .filter(Boolean);

    // 2. Rank by weighted overall score.
    rankOptions(options);

    // 3. Determine the "chosen" destination context.
    const requested = s.destId ? options.find(o => o.dest.id === s.destId) : null;
    // Primary list for comparison = top 5 (guarantee requested included).
    let top = options.slice(0, 5);
    if (requested && !top.includes(requested)) { top = [requested].concat(top.slice(0, 4)); }

    // 4. Alternative destinations = other strong matches (exclude requested if any).
    const altBase = requested || options[0];
    const alts = options.filter(o => o !== altBase).slice(0, 5).map(o => altReason(o, altBase));

    // 5. Alternative dates for the leading option.
    const leader = requested || options[0];
    const altDates = computeAltDates(leader);

    state.results = {
      options, top, requested, leader, alts, altDates, origins,
      generatedAt: new Date()
    };
    // seed AI chat / reset tab only on a genuinely fresh search
    if (fresh) {
      state.chat = [{ who: 'ai', text: adviserOpening() }];
      state.resultTab = 'overview';
    }
  }

  /* ---- flexible-date search ---------------------------------------------- */
  function computeAltDates(leader) {
    const s = state.search;
    const base = leader.date;
    let offsets = [];
    if (s.flexibility === 99) offsets = [-14,-7,-3,-2,2,3,7,14];
    else if (s.flexibility >= 7) offsets = [-7,-3,-2,2,3,7];
    else if (s.flexibility >= 3) offsets = [-3,-2,2,3];
    else if (s.flexibility >= 1) offsets = [-1,1];
    const rows = [{ label: 'Your preferred dates', date: base, total: leader.total, diff: 0, note: 'Your choice' }];
    offsets.forEach(off => {
      const d = addDays(base, off);
      const opt = buildOption(leader.dest, leader.origins, d, leader.nights);
      if (!opt) return;
      rows.push({ label: offLabel(off), date: d, total: opt.total, diff: opt.total - leader.total, note: '' , option: opt});
    });
    // Also a longer-stay comparison (10 vs 7 etc.)
    if (leader.nights < 14) {
      const longer = leader.nights < 10 ? 10 : 14;
      const optL = buildOption(leader.dest, leader.origins, base, longer);
      if (optL) rows.push({ label: `${longer} nights (same dates)`, date: base, total: optL.total, diff: optL.total - leader.total, note: `${longer - leader.nights} extra nights`, option: optL, nights: longer });
    }
    // mark cheapest / best value
    const priced = rows.filter(r => r.diff < 0);
    if (priced.length) {
      const cheapest = priced.reduce((a, b) => a.total < b.total ? a : b);
      cheapest.cheapest = true;
    }
    return rows;
  }
  function offLabel(off) {
    const abs = Math.abs(off);
    const unit = abs === 1 ? 'day' : 'days';
    return off < 0 ? `${abs} ${unit} earlier` : `${abs} ${unit} later`;
  }

  /* ---- alternative-destination reasoning --------------------------------- */
  function altReason(o, base) {
    const reasons = [];
    const saving = base.total - o.total;
    if (saving > 150) reasons.push(`savings of around ${fmt.money(saving)}`);
    else if (saving < -150) reasons.push(`a step up in quality for about ${fmt.money(-saving)} more`);
    if (o.scores.weather > base.scores.weather + 4) reasons.push('better weather for your dates');
    if (o.flight.durationHours < base.flight.durationHours - 0.5) reasons.push(`a shorter flight (${fmt.hours(o.flight.durationHours)})`);
    if (o.scores.style >= base.scores.style) reasons.push('a similar style of holiday');
    if (o.stay.type === 'Villa' && (state.search.accomTypes.includes('villa'))) reasons.push('great villa availability');
    if (!reasons.length) reasons.push('a strong all-round match for your priorities');
    o.altReason = 'Suggested because it offers ' + reasons.slice(0, 3).join(', ') + '.';
    return o;
  }

  /* =======================================================================
     SCORING ENGINE (transparent, re-ranks when priorities change)
     ==================================================================== */
  function flightConvenience(f, origin, dest) {
    // 0..100 — shorter, direct, sensible times, closer airport, cheaper.
    let sc = 100;
    sc -= Math.min(45, (f.durationHours - 1.5) * 9);   // time penalty
    sc -= f.stops * 18;                                  // stops
    const dep = parseInt(f.depTime.slice(0, 2));
    if (dep < 6) sc -= 10; if (dep > 21) sc -= 6;        // awkward hours
    return clamp(Math.round(sc), 5, 100);
  }

  function accommodationMatch(st, dest) {
    const s = state.search;
    let sc = 50;
    // type preference
    if (!s.accomTypes.includes('any')) {
      const typeMap = { 'Villa':'villa','Hotel':'hotel','Resort':'resort','Apartment':'apartment' };
      if (s.accomTypes.includes(typeMap[st.type])) sc += 18; else sc -= 8;
    }
    // board
    if (s.board !== 'flexible' && st.board.includes(s.board)) sc += 8;
    // facilities by priority
    const weightOf = { essential: 16, preferred: 8, nice: 3, no: 0 };
    for (const [fac, pri] of Object.entries(s.facilities)) {
      const w = weightOf[pri] || 0;
      if (!w) continue;
      if (st.facilities.includes(fac)) sc += w; else if (pri === 'essential') sc -= 22;
    }
    // guest rating & value
    sc += (st.guestRating - 8) * 6;
    // accessibility hard needs
    if (s.accessibility.includes('wheelchair') && !st.facilities.includes('wheelchair')) sc -= 30;
    if ((s.accessibility.includes('step-free') || s.accessibility.includes('lift')) && !st.facilities.includes('lift') && !st.facilities.includes('ground-floor')) sc -= 14;
    return sc;
  }

  function weatherScore(w) {
    // Beach-ideal ~26-31°C, low rain. Adjust if not a beach trip.
    const s = state.search;
    let sc = 100 - Math.abs(28 - w.tempHigh) * 4 - w.rainDays * 3;
    if (!s.styles.includes('beach')) sc = 100 - Math.abs(24 - w.tempHigh) * 3 - w.rainDays * 4;
    return clamp(Math.round(sc), 20, 100);
  }

  function scoreOption(o) {
    const s = state.search;
    const st = o.stay, dest = o.dest;
    // style match: overlap of requested styles with destination tags + activity coverage
    let styleHits = 0, styleTotal = Math.max(1, s.styles.length);
    s.styles.forEach(sty => { if (dest.tags.includes(sty) || dest.activities.some(a => a.suit.includes(sty) || a.category === sty)) styleHits++; });
    const style = clamp(Math.round(40 + (styleHits / styleTotal) * 60), 20, 100);

    // facilities coverage weighted by priority
    const weightOf = { essential: 3, preferred: 2, nice: 1, no: 0 };
    let facGot = 0, facMax = 0;
    for (const [fac, pri] of Object.entries(s.facilities)) {
      const w = weightOf[pri] || 0; facMax += w;
      if (w && st.facilities.includes(fac)) facGot += w;
    }
    const facilities = facMax ? clamp(Math.round((facGot / facMax) * 100), 10, 100) : 70;

    const weather = weatherScore(o.weather);
    const flights = o.flight.convenience;

    // activities match count
    const actMatch = dest.activities.filter(a => s.styles.some(sty => a.suit.includes(sty) || a.category === sty)).length;
    const activities = clamp(40 + actMatch * 14, 30, 100);

    // location: closeness to beach/town vs preference
    let location = 70;
    if (facHas(s, 'beachfront') || facHas(s, 'walk-to-beach')) location = clamp(100 - st.beachDist * 22, 20, 100);
    if (facHas(s, 'town-centre')) location = Math.max(location, clamp(100 - st.townDist * 30, 20, 100));

    // family suitability
    const kids = s.childAges.length + s.infants;
    let family = 70;
    if (kids) {
      family = 40;
      ['kids-club','family-rooms','pool','water-park','walk-to-beach'].forEach(f => { if (st.facilities.includes(f)) family += 12; });
      if (s.childAges.some(a => a < 6) && st.facilities.includes('kids-club')) family += 8;
      family = clamp(family, 20, 100);
    }

    // accessibility
    let accessibility = 80;
    if (s.accessibility.length) {
      accessibility = 40;
      if (st.facilities.includes('wheelchair')) accessibility += 25;
      if (st.facilities.includes('lift') || st.facilities.includes('ground-floor')) accessibility += 20;
      if (o.flight.stops === 0) accessibility += 10;
      if (st.beachDist < 0.5) accessibility += 5;
      accessibility = clamp(accessibility, 15, 100);
    }

    // value/price: relative to budget & quality. Filled properly during rank (needs peers),
    // seed with budget-based figure now.
    const price = priceScore(o.total);

    o.scores = { price, style, facilities, weather, flights, activities, location, family, accessibility };
    o.subPrice = { flight: o.flight.groupPrice, stay: o.stay.total, extras: o.extras };
  }

  function priceScore(total) {
    const s = state.search;
    const b = s.budget;
    if (s.budgetMode === 'cheapest') return clamp(Math.round(100 - (total / b) * 55), 5, 100);
    // under-budget rewarded, over-budget penalised sharply
    let sc = 100 - (total / b) * 60;
    if (total > b) sc -= ((total - b) / b) * 60;
    return clamp(Math.round(sc), 5, 100);
  }

  function overallScore(o) {
    const p = state.priorities;
    let wsum = 0, acc = 0;
    for (const key of Object.keys(p)) {
      const w = p[key].w; const sc = o.scores[key];
      if (sc == null) continue;
      wsum += w; acc += w * sc;
    }
    return wsum ? Math.round(acc / wsum) : 0;
  }

  function rankOptions(options) {
    // recompute price scores relative to the cheapest peer for fairness
    const min = Math.min(...options.map(o => o.total));
    options.forEach(o => {
      // blend budget-based & peer-relative price scores
      const peer = clamp(Math.round(100 - ((o.total - min) / Math.max(1, min)) * 130), 5, 100);
      o.scores.price = Math.round((o.scores.price * 0.5) + (peer * 0.5));
      o.overall = overallScore(o);
    });
    options.sort((a, b) => b.overall - a.overall);
  }

  function facHas(s, fac) { const v = s.facilities[fac]; return v === 'essential' || v === 'preferred'; }

  /* ---- labels ------------------------------------------------------------ */
  function labelOption(o) { /* per-option labels assigned in labelSet across peers */ }
  function labelSet(options) {
    options.forEach(o => o.labels = []);
    if (!options.length) return;
    const by = (fn, label) => { const w = options.slice().sort(fn)[0]; if (w) w.labels.push(label); };
    by((a,b)=>a.total-b.total, 'Cheapest');
    by((a,b)=>b.overall-a.overall, 'Best overall value');
    by((a,b)=>b.scores.weather-a.scores.weather, 'Best weather');
    by((a,b)=>a.stay.beachDist-b.stay.beachDist, 'Best beach location');
    by((a,b)=>b.scores.family-a.scores.family, 'Best for families');
    by((a,b)=>b.stay.guestRating-a.stay.guestRating, 'Luxury pick');
    if (state.search.accessibility.length) by((a,b)=>b.scores.accessibility-a.scores.accessibility, 'Most accessible');
  }

  /* =======================================================================
     RESULTS EXPERIENCE
     ==================================================================== */
  const RESULT_TABS = [
    ['overview','Recommendation'], ['compare','Compare 5'], ['destinations','Destinations'],
    ['flights','Flights'], ['stays','Accommodation'], ['dates','Alt dates'],
    ['activities','Things to do'], ['weather','Weather'], ['priorities','Priorities'], ['adviser','Ask the adviser'], ['extras','Extras']
  ];

  function renderResults() {
    const r = state.results;
    if (!r) return renderHome();
    labelSet(r.options);
    const liveTag = STConfig.mode === 'live'
      ? '<span class="pill pill-live">LIVE PRICES</span>'
      : '<span class="pill pill-demo">DEMO DATA — indicative prices, not live</span>';
    app().innerHTML = `
      <div class="demo-banner">${STConfig.mode === 'live' ? 'Live provider mode' : 'Demonstration mode — all prices are realistic sample figures, clearly not live bookings.'}</div>
      <div class="wrap block" style="padding-top:1.4rem">
        <div class="between">
          <div>
            <div class="eyebrow">Your results ${liveTag}</div>
            <h2 style="margin:.2rem 0">${summariseSearch()}</h2>
            <p class="muted small">Searched ${r.options.length} destinations from ${r.origins.map(o=>o.code).join(', ')} · ${fmt.time ? '' : ''}${new Date(r.generatedAt).toLocaleString('en-GB')}</p>
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <button class="btn btn-ghost btn-sm" id="editSearch">✎ Edit search</button>
            <button class="btn btn-ghost btn-sm" id="shareBtn">🔗 Share</button>
            <button class="btn btn-brand btn-sm" id="saveLeadBtn">♡ Save top pick</button>
          </div>
        </div>
        <div class="result-tabs" id="resultTabs" role="tablist">
          ${RESULT_TABS.map(t=>`<button role="tab" data-tab="${t[0]}" class="${state.resultTab===t[0]?'on':''}">${t[1]}</button>`).join('')}
        </div>
        <div id="tabBody"></div>
      </div>`;
    $$('#resultTabs button').forEach(b => b.onclick = () => { state.resultTab = b.dataset.tab; renderResults(); });
    el('editSearch').onclick = () => { wizStep = 0; go('plan'); };
    el('shareBtn').onclick = shareComparison;
    el('saveLeadBtn').onclick = () => saveOption(r.leader);
    renderResultTab();
    window.scrollTo(0, 0);
  }

  function renderResultTab() {
    const body = el('tabBody');
    const map = {
      overview: tabOverview, compare: tabCompare, destinations: tabDestinations, flights: tabFlights,
      stays: tabStays, dates: tabDates, activities: tabActivities, weather: tabWeather,
      priorities: tabPriorities, adviser: tabAdviser, extras: tabExtras
    };
    (map[state.resultTab] || tabOverview)(body);
  }

  /* ---- Overview + AI recommendation -------------------------------------- */
  function tabOverview(body) {
    const r = state.results;
    const rec = r.leader;
    const cheapest = r.options.slice().sort((a,b)=>a.total-b.total)[0];
    body.innerHTML = `
      <div class="card card-pad" style="border-left:6px solid var(--accent)">
        <div class="between">
          <h3 style="margin:0">🧭 My recommendation for you</h3>
          <div class="score"><div class="dial" style="--v:${rec.overall}"><span>${rec.overall}</span></div><div class="small muted">value<br>score</div></div>
        </div>
        <p style="font-size:1.05rem">${adviserRecommendation(rec, cheapest)}</p>
        <div class="between">
          <div><strong style="font-size:1.5rem">${fmt.money(rec.total)}</strong> <span class="muted">total for your group · ${money(rec.total/rec.partySize)} pp</span></div>
          <div style="display:flex;gap:.5rem">
            <button class="btn btn-ghost btn-sm" data-open-adviser>💬 Ask why</button>
            <button class="btn btn-primary btn-sm" data-book="${rec.id}">Choose this holiday →</button>
          </div>
        </div>
      </div>

      <h3 style="margin:1.6rem 0 .6rem">Your top options</h3>
      <div class="grid grid-3">
        ${r.top.map(o => optionCard(o)).join('')}
      </div>

      <div class="divider"></div>
      <div class="between">
        <div><span class="pill pill-cheap">Cheapest ${fmt.money(cheapest.total)}</span>
        <span class="pill pill-value" style="margin-left:.4rem">Best value ${fmt.money(rec.total)}</span></div>
        <button class="btn btn-brand btn-sm" data-goto="compare">Compare all five →</button>
      </div>`;
    wireCommon(body);
  }

  function optionCard(o) {
    const labels = (o.labels||[]).slice(0,1).map(l=>`<span class="badge-label">${l}</span>`).join('');
    return `<div class="card" style="position:relative">
      ${labels}
      <div class="ph" style="height:150px;${destGradientStyle(o.dest)};position:relative;overflow:hidden">${sunWavesSVG()}${stayPhoto(o.stay, 500, 300)}</div>
      <div class="card-pad">
        <div class="between"><h3 style="margin:0">${o.dest.name}</h3><div class="score"><div class="dial" style="--v:${o.overall}"><span>${o.overall}</span></div></div></div>
        <p class="small muted" style="margin:.2rem 0 .6rem">${o.stay.name} · ${o.stay.type} · ${o.weather.tempHigh}°C</p>
        <div class="facs">${(o.labels||[]).slice(1,3).map(l=>`<span class="tag">${l}</span>`).join('')}</div>
        <div class="between" style="margin-top:.6rem">
          <strong style="font-size:1.2rem">${fmt.money(o.total)}</strong>
          <button class="btn btn-ghost btn-sm" data-detail="${o.id}">Details</button>
        </div>
      </div></div>`;
  }

  /* ---- 5-option comparison ---------------------------------------------- */
  const CMP_ROWS = [
    ['total','Total price', o => fmt.money(o.total), 'min'],
    ['pp','Price pp', o => fmt.money(o.total/o.partySize), 'min'],
    ['flights','Flights', o => `${o.flight.airline}<br><span class="small muted">${o.flight.direct?'Direct':o.flight.stops+' stop'} · ${fmt.hours(o.flight.durationHours)} · ${o.flight.from.code}</span>`, null],
    ['stay','Accommodation', o => `${o.stay.name}<br><span class="small muted">${o.stay.type}${o.stay.stars?' · '+o.stay.stars+'★':''} · ⭐${o.stay.guestRating}</span>`, null],
    ['board','Board', o => o.stay.board.map(prettyBoard).join(', '), null],
    ['travel','Travel time', o => fmt.hours(o.flight.durationHours), 'minH'],
    ['weather','Weather', o => `${o.weather.tempHigh}°C · ${o.scores.weather}/100`, 'maxScoreW'],
    ['beach','Beach', o => o.stay.beachDist + ' km', 'minBeach'],
    ['pool','Pool', o => o.stay.facilities.includes('private-pool') ? 'Private ✓' : o.stay.facilities.includes('pool') ? 'Shared ✓' : '—', null],
    ['activities','Activities', o => o.scores.activities + '/100', 'maxA'],
    ['family','Family', o => o.scores.family + '/100', 'maxF'],
    ['access','Accessibility', o => o.scores.accessibility + '/100', 'maxAcc'],
    ['overall','Overall value', o => `<strong>${o.overall}/100</strong>`, 'maxO']
  ];
  function tabCompare(body) {
    const opts = state.results.top.slice(0, 5);
    // determine winners per row
    const winners = {};
    CMP_ROWS.forEach(row => {
      const [key,,, kind] = row;
      if (!kind) return;
      let best;
      const val = {
        min: o=>o.total, minH: o=>o.flight.durationHours, minBeach: o=>o.stay.beachDist,
        maxScoreW: o=>o.scores.weather, maxA: o=>o.scores.activities, maxF: o=>o.scores.family,
        maxAcc: o=>o.scores.accessibility, maxO: o=>o.overall
      }[kind];
      const isMin = kind.startsWith('min');
      best = opts.reduce((a,b)=> (isMin ? val(a)<val(b) : val(a)>val(b)) ? a : b);
      winners[key] = best.id;
    });
    body.innerHTML = `
      <div class="between"><p class="muted">Your five best options, side by side. Toggle rows you don't care about.</p>
        <button class="btn btn-ghost btn-sm" id="resetRows">Show all rows</button></div>
      <div class="cmp-scroll"><table class="cmp"><thead><tr><th class="feature">Feature</th>
        ${opts.map(o=>`<th>${o.dest.name}<br><span class="small muted">${o.stay.type}</span><br>
          <button class="btn btn-primary btn-sm" data-book="${o.id}" style="margin-top:.4rem">Choose</button></th>`).join('')}
      </tr></thead><tbody>
        ${CMP_ROWS.map(row => `<tr data-row="${row[0]}">
          <th class="feature">${row[1]} <button class="linkbtn" data-hide="${row[0]}" title="Hide row" style="float:right;color:var(--text-soft);cursor:pointer;border:none;background:none">✕</button></th>
          ${opts.map(o=>`<td class="${winners[row[0]]===o.id?'best':''}">${winners[row[0]]===o.id?'<span class="winner">★ </span>':''}${row[2](o)}</td>`).join('')}
        </tr>`).join('')}
      </tbody></table></div>
      <p class="small muted" style="margin-top:.6rem">★ marks the best in each row. Green = leading option for that feature.</p>`;
    $$('[data-hide]').forEach(b => b.onclick = () => { const tr = body.querySelector(`tr[data-row="${b.dataset.hide}"]`); tr.classList.add('hidden-row'); });
    el('resetRows').onclick = () => $$('tr[data-row]', body).forEach(tr => tr.classList.remove('hidden-row'));
    wireCommon(body);
  }

  /* ---- Alternative destinations ----------------------------------------- */
  function tabDestinations(body) {
    const r = state.results;
    body.innerHTML = `<p class="muted">You're not limited to one place. Based on what you told us, here are destinations that might suit you even better — and why.</p>
      <div class="grid grid-2" style="margin-top:1rem">
        ${r.alts.map(o => `<div class="card">
          <div class="ph" style="height:140px;${destGradientStyle(o.dest)};position:relative;overflow:hidden">${sunWavesSVG()}${destPhoto(o.dest, 560, 300)}
            <span class="badge-label">Match ${o.overall}/100</span></div>
          <div class="card-pad">
            <div class="between"><h3 style="margin:0">${o.dest.name}, ${o.dest.country}</h3><strong>${fmt.money(o.total)}</strong></div>
            <p class="small" style="color:var(--brand-ink);font-weight:700;margin:.4rem 0">${o.altReason}</p>
            <div class="facs">
              <span class="tag">✈ ${fmt.hours(o.flight.durationHours)}</span>
              <span class="tag">☀ ${o.weather.tempHigh}°C</span>
              <span class="tag">🏨 ${o.stay.type} ⭐${o.stay.guestRating}</span>
              <span class="tag">🏖 ${o.stay.beachDist}km</span>
            </div>
            <div class="between" style="margin-top:.6rem">
              <button class="btn btn-ghost btn-sm" data-detail="${o.id}">Details</button>
              <button class="btn btn-brand btn-sm" data-make-leader="${o.dest.id}">Explore this instead →</button>
            </div>
          </div></div>`).join('')}
      </div>`;
    wireCommon(body);
    $$('[data-make-leader]').forEach(b => b.onclick = () => {
      state.search.destId = b.dataset.makeLeader; computeResults(); state.resultTab = 'overview'; renderResults();
      toast('Switched your focus destination.');
    });
  }

  /* ---- Flights ----------------------------------------------------------- */
  function tabFlights(body) {
    const r = state.results;
    // gather flights for the leader destination from all origins, plus a sort control
    const s = state.search, dest = r.leader.dest;
    let flights = [];
    r.origins.forEach(o => providers.flights.search({ origin: o, destination: dest, date: s.date, nights: s.nights, travellers: { adults: s.adults, childAges: s.childAges, infants: s.infants } })
      .forEach(f => {
        f.convenience = flightConvenience(f, o, dest);
        // price of one extra 23kg hold bag, return — scales gently with distance
        f.bagPrice = Math.round(34 + milesBetween(o, dest.airport) * 0.018);
        flights.push(f);
      }));
    const byId = {};                 // fid -> flight
    const bags = {};                 // fid -> extra hold bags chosen (persists across sorts)
    flights.forEach(f => { byId[f.id] = f; bags[f.id] = bags[f.id] || 0; });

    body.innerHTML = `
      <div class="between"><p class="muted">Flights to <strong>${dest.name}</strong> for your group of ${r.leader.partySize}. ${priceNote()}</p>
        <select id="flightSort">${[['price','Cheapest'],['value','Best value'],['duration','Shortest'],['time','Best times']].map(o=>`<option value="${o[0]}">${o[1]}</option>`).join('')}</select></div>
      <p class="small muted" style="margin:.2rem 0 0">Cabin bags are included as shown. Add 23kg hold luggage to any flight below — the price updates instantly.</p>
      <div id="flightList" class="stack" style="margin-top:1rem"></div>`;
    const list = el('flightList');

    const bagTotal = f => f.groupPrice + bags[f.id] * f.bagPrice;

    const draw = (sortKey) => {
      let sorted = flights.slice();
      if (sortKey==='price') sorted.sort((a,b)=>bagTotal(a)-bagTotal(b));
      if (sortKey==='value') sorted.sort((a,b)=>b.convenience/bagTotal(b) - a.convenience/bagTotal(a));
      if (sortKey==='duration') sorted.sort((a,b)=>a.durationHours-b.durationHours);
      if (sortKey==='time') sorted.sort((a,b)=>parseInt(a.depTime)-parseInt(b.depTime));
      list.innerHTML = sorted.slice(0,8).map(f => `<div class="card card-pad" data-fid="${f.id}">
        <div class="flight">
          <div class="legs">
            <div><div class="time">${f.depTime}</div><div class="small muted">${f.from.code}</div></div>
            <div class="path"><div>${f.direct?'Direct':f.stops+' stop'}</div><div class="line"></div><div>${fmt.hours(f.durationHours)}</div></div>
            <div><div class="time">${f.arrTime}</div><div class="small muted">${f.to.code}</div></div>
            <div style="margin-left:1rem"><strong>${f.airline}</strong><br>
              <span class="pill pill-demo">Convenience ${f.convenience}/100</span></div>
          </div>
          <div style="text-align:right"><strong style="font-size:1.3rem" data-total>${fmt.money(bagTotal(f))}</strong><br>
            <span class="small muted" data-bagnote>${bags[f.id]?('incl. '+bags[f.id]+' bag'+(bags[f.id]>1?'s':'')+' +'+fmt.money(bags[f.id]*f.bagPrice)):fmt.money(f.perAdult)+' / adult'}</span><br>
            <button class="btn btn-brand btn-sm" data-provider="View flight">View flight →</button></div>
        </div>
        <div class="lug">
          <span class="small muted">🧳 Included: ${f.baggage}</span>
          <div class="lugctl">
            <span class="small">Add 23kg hold bags</span>
            <div class="stepper stepper-sm">
              <button type="button" data-bag="-1" aria-label="Fewer hold bags">−</button>
              <span data-bags aria-live="polite">${bags[f.id]}</span>
              <button type="button" data-bag="1" aria-label="Add a hold bag">+</button>
            </div>
            <span class="small muted">${fmt.money(f.bagPrice)} per bag, return</span>
          </div>
        </div>
      </div>`).join('');
      wireProviderButtons(list);
      // wire luggage steppers
      $$('[data-fid]', list).forEach(card => {
        const f = byId[card.dataset.fid];
        card.querySelectorAll('[data-bag]').forEach(btn => btn.onclick = () => {
          bags[f.id] = clamp(bags[f.id] + (+btn.dataset.bag), 0, 6);
          card.querySelector('[data-bags]').textContent = bags[f.id];
          card.querySelector('[data-total]').textContent = fmt.money(bagTotal(f));
          card.querySelector('[data-bagnote]').textContent = bags[f.id]
            ? 'incl. ' + bags[f.id] + ' bag' + (bags[f.id]>1?'s':'') + ' +' + fmt.money(bags[f.id]*f.bagPrice)
            : fmt.money(f.perAdult) + ' / adult';
        });
      });
    };
    draw('price');
    el('flightSort').onchange = e => draw(e.target.value);
  }

  /* ---- Accommodation ----------------------------------------------------- */
  function tabStays(body) {
    const r = state.results;
    const s = state.search, dest = r.leader.dest;
    const stays = providers.accommodation.search({ destination: dest, nights: s.nights, date: s.date, travellers: { adults: s.adults, childAges: s.childAges, infants: s.infants }, board: s.board });
    stays.forEach(st => st.matchScore = accommodationMatch(st, dest));
    stays.sort((a,b)=>b.matchScore-a.matchScore);
    // labels
    const cheapest = stays.slice().sort((a,b)=>a.total-b.total)[0];
    const bestPool = stays.filter(x=>x.facilities.includes('private-pool'))[0] || stays.filter(x=>x.facilities.includes('pool'))[0];
    body.innerHTML = `<div class="between"><p class="muted">Places to stay in <strong>${dest.name}</strong> that fit your group of ${r.leader.partySize}. ${priceNote()}</p>
      <button class="btn btn-ghost btn-sm" data-make-leader-dest>Change destination in ‘Destinations’ tab</button></div>
      <div class="stack" style="margin-top:1rem">
      ${stays.map(st => {
        const lbls = [];
        if (st===stays[0]) lbls.push('Best match');
        if (st===cheapest) lbls.push('Cheapest');
        if (st===bestPool) lbls.push('Best pool');
        if (st.type==='Villa') lbls.push('Villa pick');
        return `<div class="card acc-card">
          <div class="ph" style="${destGradientStyle(dest)};overflow:hidden">${sunWavesSVG()}${stayPhoto(st, 520, 400)}${lbls[0]?`<span class="badge-label">${lbls[0]}</span>`:''}</div>
          <div class="body">
            <div class="between"><div><h3 style="margin:0">${st.name}</h3>
              <span class="small muted">${st.type}${st.stars?' · '+st.stars+'★':''} · ⭐ ${st.guestRating} guest rating · sleeps ${st.sleeps}</span></div>
              <div style="text-align:right"><strong style="font-size:1.3rem">${fmt.money(st.total)}</strong><br><span class="small muted">${st.nights} nights · ${fmt.money(st.nightly)}/night</span></div></div>
            <div class="facs">
              <span class="tag">🏖 ${st.beachDist}km to beach</span><span class="tag">🏘 ${st.townDist}km to town</span>
              ${st.board.map(b=>`<span class="tag">${prettyBoard(b)}</span>`).join('')}
              ${st.facilities.slice(0,6).map(f=>`<span class="tag">${prettyFac(f)}</span>`).join('')}
            </div>
            <div class="proscons">
              <div><ul class="pro">${st.pros.map(p=>`<li>${p}</li>`).join('')}</ul></div>
              <div><ul class="con">${st.cons.map(c=>`<li>${c}</li>`).join('')}</ul></div>
            </div>
            <p class="small muted" style="margin:.4rem 0 0">Cancellation: ${st.cancellation}. ${st===stays[0]?'':''}</p>
            <div style="margin-top:.6rem;display:flex;gap:.5rem;flex-wrap:wrap">
              ${lbls.slice(1).map(l=>`<span class="pill pill-cheap">${l}</span>`).join('')}
              <button class="btn btn-brand btn-sm" data-provider="Book this stay" style="margin-left:auto">Book this ${st.type.toLowerCase()} →</button>
            </div>
          </div></div>`;
      }).join('')}</div>`;
    wireProviderButtons(body);
  }

  /* ---- Alt dates --------------------------------------------------------- */
  function tabDates(body) {
    const r = state.results;
    const rows = r.altDates;
    if (rows.length <= 1) { body.innerHTML = `<p class="muted">You chose exact dates. Head back and allow some flexibility to unlock savings — often hundreds of pounds for a family.</p>`; return; }
    body.innerHTML = `<p class="muted">We checked nearby dates for <strong>${r.leader.dest.name}</strong>. Click a row to rebuild your results around those dates.</p>
      <div class="card card-pad" style="margin-top:1rem"><table class="dates"><thead><tr><th>Dates</th><th>Length</th><th>Total</th><th>Difference</th><th>Note</th><th></th></tr></thead><tbody>
        ${rows.map((row,i)=>`<tr>
          <td><strong>${row.label}</strong><br><span class="small muted">${fmtDate(row.date)}</span></td>
          <td>${row.nights || r.leader.nights} nights</td>
          <td>${fmt.money(row.total)}</td>
          <td>${row.diff===0?'—':row.diff<0?`<span class="save">Save ${fmt.money(-row.diff)}</span>`:`<span class="up">+${fmt.money(row.diff)}</span>`}</td>
          <td>${row.note || ''}${row.cheapest?'<span class="pill pill-cheap">Cheapest</span>':''}</td>
          <td>${i===0?'<span class="pill pill-value">Your choice</span>':`<button class="btn btn-ghost btn-sm" data-usedate="${i}">Use these →</button>`}</td>
        </tr>`).join('')}
      </tbody></table></div>`;
    $$('[data-usedate]').forEach(b => b.onclick = () => {
      const row = rows[+b.dataset.usedate];
      if (row.nights) state.search.nights = row.nights;
      state.search.date = row.date;
      computeResults(); state.resultTab='overview'; renderResults();
      toast('Rebuilt your holiday around the new dates.');
    });
  }

  /* ---- Activities -------------------------------------------------------- */
  function tabActivities(body) {
    const r = state.results;
    const s = state.search;
    const acts = r.leader.activities.slice();
    // sort by match to stated styles
    acts.forEach(a => a._match = s.styles.filter(sty => a.suit.includes(sty) || a.category===sty).length);
    acts.sort((a,b)=>b._match-a._match);
    body.innerHTML = `<p class="muted">Tailored to your interests${s.styles.length?` (${s.styles.slice(0,4).map(prettyStyle).join(', ')})`:''} in <strong>${r.leader.dest.name}</strong>.</p>
      <div class="grid grid-2" style="margin-top:1rem">
        ${acts.map(a=>`<div class="card card-pad">
          <div class="between"><h3 style="margin:0">${a.name}</h3>${a._match?`<span class="pill pill-value">Great match</span>`:''}</div>
          <p class="small" style="margin:.3rem 0">${a.desc}</p>
          <div class="facs">
            <span class="tag">📍 ${a.location}</span><span class="tag">⏱ ${a.duration}</span>
            <span class="tag">${a.price?('~'+fmt.money(a.price)+' pp'):'Free'}</span>
            ${a.suit.slice(0,3).map(su=>`<span class="tag">${prettyStyle(su)}</span>`).join('')}
          </div>
          <div style="margin-top:.5rem"><button class="btn btn-ghost btn-sm" data-provider="Book activity">Find tickets →</button></div>
        </div>`).join('')}
      </div>`;
    wireProviderButtons(body);
  }

  /* ---- Weather ----------------------------------------------------------- */
  function tabWeather(body) {
    const r = state.results;
    const dest = r.leader.dest, w = r.leader.weather, s = state.search;
    const verdict = weatherVerdict(w, r.leader.scores.weather);
    // monthly mini chart
    const months = ['J','F','M','A','M','J','J','A','S','O','N','D'];
    const maxT = Math.max(...Object.values(dest.weather).map(m=>m.tempHigh));
    body.innerHTML = `
      <div class="split">
        <div class="card card-pad">
          <div class="between"><h3 style="margin:0">${dest.name} — ${fmtMonth(s.date)}</h3>
            <div class="score"><div class="dial" style="--v:${r.leader.scores.weather}"><span>${r.leader.scores.weather}</span></div></div></div>
          <p style="font-size:1.05rem">${verdict}</p>
          <div class="grid grid-2">
            <div class="card card-pad"><div class="small muted">Typical daytime</div><strong style="font-size:1.6rem">${w.tempHigh}°C</strong></div>
            <div class="card card-pad"><div class="small muted">Sea temperature</div><strong style="font-size:1.6rem">${w.seaTemp}°C</strong></div>
            <div class="card card-pad"><div class="small muted">Rainy days / month</div><strong style="font-size:1.6rem">${w.rainDays}</strong></div>
            <div class="card card-pad"><div class="small muted">Sunshine hrs / day</div><strong style="font-size:1.6rem">${w.sunHours}</strong></div>
          </div>
        </div>
        <div class="card card-pad">
          <h3 style="margin-top:0">Temperature through the year</h3>
          <div style="display:flex;align-items:flex-end;gap:4px;height:160px">
            ${months.map((m,i)=>{const mt=dest.weather[i+1].tempHigh;const h=Math.round((mt/maxT)*140);const cur=(i+1)===(s.date.getMonth()+1);return `<div style="flex:1;text-align:center"><div title="${mt}°C" style="height:${h}px;background:${cur?'var(--accent)':'var(--teal-500)'};border-radius:4px 4px 0 0"></div><div class="small muted">${m}</div></div>`;}).join('')}
          </div>
          <p class="small muted">Coral bar = your chosen month. Indicative climate averages.</p>
        </div>
      </div>`;
  }

  /* ---- Priorities (adjust & re-rank) ------------------------------------- */
  function tabPriorities(body) {
    const p = state.priorities;
    body.innerHTML = `<p class="muted">Tell us what matters most. The results re-rank instantly.</p>
      <div class="card card-pad" style="margin-top:1rem">
        ${Object.entries(p).map(([k,v])=>`<div class="prio">
          <label for="pr_${k}">${v.label}</label>
          <input id="pr_${k}" type="range" min="0" max="10" value="${v.w}" data-prio="${k}">
          <strong id="prv_${k}">${prioWord(v.w)}</strong></div>`).join('')}
        <div style="margin-top:1rem;display:flex;gap:.5rem"><button class="btn btn-ghost btn-sm" id="resetPrio">Reset</button></div>
      </div>
      <p class="small muted" style="margin-top:.6rem">Current leader: <strong id="prioLeader">${state.results.leader.dest.name}</strong> (${state.results.leader.overall}/100)</p>`;
    const reRank = () => {
      rankOptions(state.results.options);
      const r = state.results;
      r.leader = r.requested || r.options[0];
      r.top = r.options.slice(0,5);
      if (r.requested && !r.top.includes(r.requested)) r.top = [r.requested].concat(r.top.slice(0,4));
      el('prioLeader').textContent = r.leader.dest.name + ' (' + r.leader.overall + '/100)';
    };
    $$('[data-prio]').forEach(sl => sl.oninput = () => {
      p[sl.dataset.prio].w = +sl.value;
      el('prv_'+sl.dataset.prio).textContent = prioWord(+sl.value);
      reRank();
    });
    el('resetPrio').onclick = () => { state.priorities = defaultPriorities(); reRank(); renderResults(); };
  }

  /* ---- AI adviser -------------------------------------------------------- */
  function tabAdviser(body) {
    body.innerHTML = `
      <p class="muted">Ask me anything about your options — I'll explain the trade-offs and update your results.</p>
      <div class="chat" style="margin-top:1rem">
        <div class="log" id="chatLog"></div>
        <div class="suggests" id="chatSuggests"></div>
        <form class="compose" id="chatForm">
          <input id="chatInput" type="text" placeholder="e.g. Can you find something cheaper?" autocomplete="off">
          <button class="btn btn-primary" type="submit">Send</button>
        </form>
      </div>`;
    drawChat();
    const suggests = ['Why did you recommend this?','Can you find something cheaper?','Show me options with better beaches','Can we get a villa instead?','Find somewhere warmer','Can we stay for 10 nights instead?'];
    el('chatSuggests').innerHTML = suggests.map(s=>`<button class="chip" data-sug="${s}">${s}</button>`).join('');
    $$('[data-sug]').forEach(b => b.onclick = () => handleChat(b.dataset.sug));
    el('chatForm').onsubmit = e => { e.preventDefault(); const v = el('chatInput').value.trim(); if (v) handleChat(v); el('chatInput').value=''; };
  }
  function drawChat() {
    const log = el('chatLog'); if (!log) return;
    log.innerHTML = state.chat.map(m => `<div class="msg ${m.who}">${m.text}</div>`).join('');
    log.scrollTop = log.scrollHeight;
  }

  /* ---- Extras ------------------------------------------------------------ */
  function tabExtras(body) {
    const r = state.results, s = state.search;
    const carhire = providers.carhire.search({ destination: r.leader.dest, nights: s.nights });
    const parking = providers.parking.search({ nights: s.nights });
    const transfer = providers.transfer.search({ destination: r.leader.dest, travellers: s });
    body.innerHTML = `<p class="muted">Would you like help arranging anything else for your trip to ${r.leader.dest.name}? ${priceNote()}</p>
      <div class="grid grid-2" style="margin-top:1rem">
        ${extrasCard('🚗 Car hire', carhire.map(c=>[c.cls, c.total]))}
        ${extrasCard('🅿️ Airport parking', parking.map(p=>[p.type, p.total]))}
        ${extrasCard('🚐 Resort transfers', transfer.map(t=>[t.type, t.total]))}
        ${extrasCard('🛡️ Travel insurance', [['Single trip (group)', 46],['Annual multi-trip', 89]])}
        ${extrasCard('🛎️ Airport extras', [['Airport lounge (pp)', 28],['Airport hotel + parking', 129]])}
        ${extrasCard('🎟️ Activities & tickets', r.leader.activities.slice(0,3).map(a=>[a.name, a.price||0]))}
      </div>`;
    wireProviderButtons(body);
  }
  function extrasCard(title, rows) {
    return `<div class="card card-pad"><h3 style="margin-top:0">${title}</h3>
      <table class="dates"><tbody>${rows.map(r=>`<tr><td>${r[0]}</td><td style="text-align:right">${r[1]?('from '+fmt.money(r[1])):'Free'}</td></tr>`).join('')}</tbody></table>
      <div style="margin-top:.6rem"><button class="btn btn-ghost btn-sm" data-provider="Compare ${title}">Compare &amp; add →</button></div></div>`;
  }

  /* =======================================================================
     AI ADVISER LOGIC (rule-based intent handling)
     ==================================================================== */
  function adviserOpening() {
    const r = state.results;
    return `Hi! I've compared ${r.options.length} destinations for you. My top pick is <strong>${r.leader.dest.name}</strong> at ${fmt.money(r.leader.total)}. Ask me why, or tell me what to change — cheaper, warmer, a villa, better beaches, longer stay…`;
  }
  function adviserRecommendation(rec, cheapest) {
    if (rec.id === cheapest.id) {
      return `<strong>${rec.dest.name}</strong> is both my best-value pick and the cheapest at ${fmt.money(rec.total)} — a genuinely strong all-rounder for your priorities: ${topReasons(rec)}.`;
    }
    const extra = rec.total - cheapest.total;
    return `<strong>${rec.dest.name}</strong> is my best overall recommendation. It's ${fmt.money(extra)} more than the cheapest option (${cheapest.dest.name}), but you gain ${topReasons(rec)}. Based on what you told me matters most, I think that's clearly better value — not just a bigger price tag.`;
  }
  function topReasons(o) {
    const bits = [];
    const st = o.stay;
    if (st.facilities.includes('private-pool')) bits.push('a private pool');
    else if (st.facilities.includes('pool')) bits.push('a good pool');
    if (st.beachDist < 0.4) bits.push('a beachfront setting');
    else if (st.beachDist < 1.2) bits.push('a short walk to the beach');
    if (o.flight.direct) bits.push('a direct flight');
    if (o.scores.weather >= 85) bits.push('excellent weather for your dates');
    if (o.scores.family >= 80 && state.search.childAges.length) bits.push('great family facilities');
    if (!bits.length) bits.push('a strong balance of quality and value');
    return bits.slice(0,3).join(', ');
  }

  function handleChat(text) {
    state.chat.push({ who: 'me', text: escapeHtml(text) });
    const reply = adviserRespond(text.toLowerCase());
    state.chat.push({ who: 'ai', text: reply.text });
    if (reply.rerender) { renderResults(); return; }
    drawChat();
    const inp = el('chatInput'); if (inp) inp.focus();
  }

  function adviserRespond(t) {
    const r = state.results, s = state.search;
    // cheaper
    if (/(cheap|cheaper|less|budget|save money|lower price)/.test(t)) {
      const cheapest = r.options.slice().sort((a,b)=>a.total-b.total)[0];
      r.requested = null; r.leader = cheapest; s.destId = cheapest.dest.id;
      state.priorities.price.w = Math.min(10, state.priorities.price.w + 2);
      rankOptions(r.options); refreshDerived();
      return { text: `The cheapest suitable option is <strong>${cheapest.dest.name}</strong> at ${fmt.money(cheapest.total)} — ${topReasons(cheapest)}. I've made it your focus and nudged price up your priorities. Compare the five to see the trade-offs.`, rerender: true };
    }
    // better beaches
    if (/(beach|sea|sand|coast)/.test(t)) {
      state.priorities.location.w = 10; state.priorities.style.w = Math.max(state.priorities.style.w, 8);
      s.facilities['walk-to-beach'] = 'essential';
      recomputeKeepFocus();
      const best = state.results.options.slice().sort((a,b)=>a.stay.beachDist-b.stay.beachDist)[0];
      return { text: `I've prioritised beach proximity. <strong>${best.dest.name}</strong> now stands out — its accommodation is just ${best.stay.beachDist}km from the sand. The results have re-ranked around great beaches.`, rerender: true };
    }
    // villa
    if (/villa/.test(t)) {
      s.accomTypes = ['villa']; recomputeKeepFocus();
      const villaOpt = state.results.options.find(o => o.stay.type === 'Villa') || state.results.leader;
      return { text: `Switched to villas. For example, <strong>${villaOpt.stay.name}</strong> in ${villaOpt.dest.name} (${fmt.money(villaOpt.total)}) — ${villaOpt.stay.bedrooms} bedrooms, sleeps ${villaOpt.stay.sleeps}${villaOpt.stay.facilities.includes('private-pool')?', private pool':''}. I've re-run everything for villas.`, rerender: true };
    }
    // warmer
    if (/(warm|hot|sun|heat|temperature)/.test(t)) {
      state.priorities.weather.w = 10; recomputeKeepFocus();
      const warm = state.results.options.slice().sort((a,b)=>b.weather.tempHigh-a.weather.tempHigh)[0];
      return { text: `Turned up the weight on weather. The warmest strong match is <strong>${warm.dest.name}</strong> at around ${warm.weather.tempHigh}°C for your dates. Results re-ranked for sunshine.`, rerender: true };
    }
    // longer stay / nights
    const nightsM = t.match(/(\d+)\s*night/);
    if (/(longer|more nights|extra night)/.test(t) || nightsM) {
      const n = nightsM ? clamp(parseInt(nightsM[1]), 2, 21) : (s.nights < 10 ? 10 : 14);
      const before = r.leader.total;
      s.nights = n; computeResults({ fresh: false });
      const after = state.results.leader.total;
      const diff = after - before;
      return { text: `Done — I've rebuilt everything for <strong>${n} nights</strong>. Your top pick is now ${fmt.money(after)} (${diff>=0?'+':''}${fmt.money(diff)} vs before). Often a few extra nights add surprisingly little.`, rerender: true };
    }
    // different airport
    if (/(airport|depart|fly from)/.test(t)) {
      return { text: `Tell me which airport(s) — or use <em>Edit search</em> to pick several and I'll compare fares from each. Departing midweek and from a different airport can shift a family fare by a few hundred pounds.`, rerender: false };
    }
    // similar but cheaper / alternatives
    if (/(similar|alternative|somewhere else|different place)/.test(t)) {
      const alt = r.alts[0];
      return { text: alt ? `A great similar-but-cheaper option is <strong>${alt.dest.name}</strong> — ${alt.altReason} See the <em>Destinations</em> tab to switch to it.` : `Have a look at the Destinations tab for alternatives I've lined up.`, rerender: false };
    }
    // why
    if (/(why|recommend|explain|reason)/.test(t)) {
      const cheapest = r.options.slice().sort((a,b)=>a.total-b.total)[0];
      return { text: adviserRecommendation(r.leader, cheapest) + ` Its strongest scores are ${strongScores(r.leader)}.`, rerender: false };
    }
    // fallback
    return { text: `I can help with: making it cheaper, finding warmer weather, switching to a villa, better beaches, changing the length of stay, or suggesting similar destinations. Try one of the quick suggestions above, or tell me your budget and must-haves.`, rerender: false };
  }
  function strongScores(o) {
    const entries = Object.entries(o.scores).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const map = { price:'value', style:'holiday style', facilities:'facilities', weather:'weather', flights:'flights', activities:'things to do', location:'location', family:'family suitability', accessibility:'accessibility' };
    return entries.map(e=>`${map[e[0]]} (${e[1]}/100)`).join(', ');
  }
  function recomputeKeepFocus() {
    const focusId = state.results.leader.dest.id;
    computeResults({ fresh: false });
    const keep = state.results.options.find(o=>o.dest.id===focusId);
    if (keep) { state.results.leader = keep; state.search.destId = focusId; state.results.requested = keep; refreshDerived(); }
  }
  function refreshDerived() {
    const r = state.results;
    r.top = r.options.slice(0,5);
    if (r.requested && !r.top.includes(r.requested)) r.top = [r.requested].concat(r.top.slice(0,4));
    r.leader = r.requested || r.options[0];
    r.altDates = computeAltDates(r.leader);
    const altBase = r.requested || r.options[0];
    r.alts = r.options.filter(o=>o!==altBase).slice(0,5).map(o=>altReason(o, altBase));
  }

  /* =======================================================================
     COMMON WIRING (detail modal, booking, provider buttons)
     ==================================================================== */
  function wireCommon(scope) {
    $$('[data-detail]', scope).forEach(b => b.onclick = () => openDetail(b.dataset.detail));
    $$('[data-book]', scope).forEach(b => b.onclick = () => openBooking(b.dataset.book));
    $$('[data-goto]', scope).forEach(b => b.onclick = () => { state.resultTab = b.dataset.goto; renderResults(); });
    $$('[data-open-adviser]', scope).forEach(b => b.onclick = () => { state.resultTab='adviser'; renderResults(); });
    wireProviderButtons(scope);
  }
  function wireProviderButtons(scope) {
    $$('[data-provider]', scope).forEach(b => b.onclick = () => providerHandoff(b.dataset.provider));
  }
  function providerHandoff(action) {
    openModal(`Continue to partner`, `
      <p>In a live deployment, <strong>${escapeHtml(action)}</strong> would hand you over to a legitimate booking partner via an affiliate deep link, carrying your non-sensitive search details so you don't repeat them.</p>
      <div class="card card-pad" style="background:var(--surface-2)">
        <p class="small muted" style="margin:0">No partner is connected in demo mode. Configure providers &amp; affiliate IDs in the <a href="#admin" data-close>Admin area</a>. We only pass non-sensitive parameters, and only with your consent.</p>
      </div>
      <div style="margin-top:1rem;text-align:right"><button class="btn btn-primary" data-close>Got it</button></div>`);
  }

  function openDetail(id) {
    const o = state.results.options.find(x => x.id === id) || state.results.top.find(x=>x.id===id);
    if (!o) return;
    openModal(`${o.dest.name} — ${o.stay.name}`, `
      <div class="ph" style="height:170px;border-radius:12px;${destGradientStyle(o.dest)};position:relative;margin-bottom:1rem;overflow:hidden">${sunWavesSVG()}${stayPhoto(o.stay, 720, 400)}</div>
      <div class="between"><div><strong style="font-size:1.6rem">${fmt.money(o.total)}</strong> <span class="muted">total · ${fmt.money(o.total/o.partySize)} pp</span></div>
        <div class="score"><div class="dial" style="--v:${o.overall}"><span>${o.overall}</span></div><span class="small muted">value</span></div></div>
      <table class="dates"><tbody>
        <tr><td>Flights</td><td style="text-align:right">${o.flight.airline}, ${o.flight.direct?'direct':o.flight.stops+' stop'}, ${fmt.hours(o.flight.durationHours)} — ${fmt.money(o.flight.groupPrice)}</td></tr>
        <tr><td>Accommodation</td><td style="text-align:right">${o.stay.type} · ${o.stay.nights} nights — ${fmt.money(o.stay.total)}</td></tr>
        <tr><td>Board</td><td style="text-align:right">${o.stay.board.map(prettyBoard).join(', ')}</td></tr>
        <tr><td>Beach / town</td><td style="text-align:right">${o.stay.beachDist}km / ${o.stay.townDist}km</td></tr>
        <tr><td>Weather (${fmtMonth(o.date)})</td><td style="text-align:right">${o.weather.tempHigh}°C, ${o.weather.rainDays} rainy days</td></tr>
      </tbody></table>
      <h4 style="margin:1rem 0 .3rem">Why it scores ${o.overall}/100</h4>
      ${scoreBars(o)}
      <div style="margin-top:1rem;display:flex;gap:.5rem;justify-content:flex-end">
        <button class="btn btn-ghost" data-save-opt="${o.id}">♡ Save</button>
        <button class="btn btn-primary" data-book="${o.id}">Choose this holiday →</button>
      </div>`);
    $$('[data-book]').forEach(b => b.onclick = () => { closeModal(); openBooking(b.dataset.book); });
    $$('[data-save-opt]').forEach(b => b.onclick = () => { saveOption(o); });
  }
  function scoreBars(o) {
    const map = { price:'Value', style:'Style match', facilities:'Facilities', weather:'Weather', flights:'Flights', activities:'Things to do', location:'Location', family:'Family', accessibility:'Accessibility' };
    return Object.entries(o.scores).map(([k,v])=>`<div style="display:grid;grid-template-columns:120px 1fr 40px;gap:.5rem;align-items:center;margin:.25rem 0">
      <span class="small">${map[k]}</span><div class="vbar"><i style="width:${v}%"></i></div><span class="small muted">${v}</span></div>`).join('');
  }

  /* =======================================================================
     BOOKING FLOW (clearly demo; minimal data; no payment stored)
     ==================================================================== */
  function openBooking(id) {
    const o = state.results.options.find(x=>x.id===id) || state.results.top.find(x=>x.id===id) || state.results.leader;
    openModal(`Book: ${o.dest.name}`, bookingStep1(o));
    wireBooking(o, 1);
  }
  function bookingStep1(o) {
    return `
      <div class="card card-pad" style="background:var(--surface-2)">
        <div class="between"><strong>${o.dest.name} · ${o.stay.name}</strong><strong>${fmt.money(o.total)}</strong></div>
        <div class="small muted">${o.nights} nights · ${o.flight.airline} from ${o.flight.from.code} · ${state.search.adults} adults${state.search.childAges.length?', '+state.search.childAges.length+' children':''}</div>
      </div>
      <p class="small muted" style="margin-top:.8rem">🔒 This is a <strong>demonstration</strong> booking flow. We only ask for what a booking genuinely needs, never store passport or payment details, and any real payment would be handled by a compliant third-party provider. Designed with UK GDPR in mind.</p>
      <h4 style="margin:1rem 0 .3rem">Lead traveller</h4>
      <div class="inline">
        <div><label class="small">Full legal name</label><input id="bk_name" type="text" placeholder="As on passport"></div>
        <div><label class="small">Date of birth</label><input id="bk_dob" type="date"></div>
      </div>
      <div class="inline" style="margin-top:.6rem">
        <div><label class="small">Email</label><input id="bk_email" type="text" placeholder="you@example.com"></div>
        <div><label class="small">Mobile</label><input id="bk_phone" type="text" placeholder="07…"></div>
      </div>
      <div style="margin-top:.6rem"><label class="small">Any special assistance needs for this booking?</label><input id="bk_assist" type="text" placeholder="Optional"></div>
      <label class="small" style="display:flex;gap:.5rem;align-items:flex-start;margin-top:.8rem">
        <input type="checkbox" id="bk_consent" style="width:auto;margin-top:.2rem">
        <span>I agree to StonesThrow processing these details to arrange my holiday, in line with the privacy notice. (Demo — nothing is stored or sent.)</span></label>
      <div style="margin-top:1rem;display:flex;justify-content:space-between">
        <button class="btn btn-ghost" data-close>Cancel</button>
        <button class="btn btn-primary" id="bk_next">Review &amp; continue →</button>
      </div>`;
  }
  function wireBooking(o, step) {
    if (step === 1) {
      el('bk_next').onclick = () => {
        if (!el('bk_name').value.trim() || !el('bk_email').value.trim()) { toast('Please add a name and email.'); return; }
        if (!el('bk_consent').checked) { toast('Please tick the consent box to continue.'); return; }
        const name = el('bk_name').value.trim();
        $('.modal .modal-body').innerHTML = `
          <div class="center" style="padding:1rem">
            <div style="font-size:3rem">✅</div>
            <h3>Thanks, ${escapeHtml(name.split(' ')[0])} — that's everything we need to hold this</h3>
            <p class="muted">In a live deployment we'd now hand you securely to our booking partner to confirm availability and take payment via a PCI-compliant provider. You'd see clearly that the final booking completes on the partner's site.</p>
            <div class="card card-pad" style="text-align:left;background:var(--surface-2)">
              <div class="between"><span>${o.dest.name} · ${o.stay.name}</span><strong>${fmt.money(o.total)}</strong></div>
              <div class="small muted">${o.nights} nights · ${o.flight.airline} · ${o.partySize} travellers</div>
            </div>
            <p class="small muted">No passport or payment details were collected or stored. This is demonstration mode.</p>
            <div style="display:flex;gap:.5rem;justify-content:center;margin-top:1rem">
              <button class="btn btn-ghost" data-save-opt="${o.id}">♡ Save this holiday</button>
              <button class="btn btn-primary" data-close>Done</button>
            </div>
          </div>`;
        $$('[data-close]').forEach(b => b.onclick = closeModal);
        $$('[data-save-opt]').forEach(b => b.onclick = () => saveOption(o));
      };
    }
  }

  /* =======================================================================
     SAVED HOLIDAYS, SHARING, EXPORT
     ==================================================================== */
  function loadSaved() { try { return JSON.parse(localStorage.getItem('st_saved') || '[]'); } catch(e){ return []; } }
  function persistSaved() { localStorage.setItem('st_saved', JSON.stringify(state.saved)); }
  function saveOption(o) {
    const rec = {
      id: o.id, dest: o.dest.name, country: o.dest.country, stay: o.stay.name, type: o.stay.type,
      total: o.total, nights: o.nights, date: toISO(o.date), overall: o.overall,
      party: o.partySize, theme: o.dest.theme, savedAt: Date.now(),
      search: JSON.parse(JSON.stringify(serialiseSearch()))
    };
    if (state.saved.some(x => x.id === rec.id)) { toast('Already in your saved holidays.'); return; }
    state.saved.unshift(rec); persistSaved();
    toast('Saved ♡ — find it under Saved.');
    updateSavedCount();
  }
  function updateSavedCount() { const b = el('savedCount'); if (b) b.textContent = state.saved.length ? state.saved.length : ''; }

  function renderSaved() {
    setTab('saved');
    app().innerHTML = `<div class="wrap block">
      <div class="section-head"><div class="eyebrow">Your shortlist</div><h2>Saved holidays</h2>
      <p class="muted">Compare later, share with family, or pick up where you left off.</p></div>
      ${state.saved.length ? `<div class="grid grid-3">${state.saved.map(savedCard).join('')}</div>
        <div style="margin-top:1.4rem;display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-ghost" id="shareSaved">🔗 Share my shortlist</button>
          <button class="btn btn-ghost" id="printSaved">🖨 Export / print summary</button>
          <button class="btn btn-ghost" id="clearSaved">Clear all</button></div>`
      : `<div class="card card-pad center"><p class="muted">No saved holidays yet.</p><button class="btn btn-primary" id="planNow">Start planning →</button></div>`}
    </div>`;
    $$('[data-open-saved]').forEach(b => b.onclick = () => { const s = state.saved.find(x=>x.id===b.dataset.openSaved); if (s){ hydrateSharedSearch(s.search); } });
    $$('[data-rm-saved]').forEach(b => b.onclick = () => { state.saved = state.saved.filter(x=>x.id!==b.dataset.rmSaved); persistSaved(); updateSavedCount(); renderSaved(); });
    if (el('planNow')) el('planNow').onclick = () => startWizardFromQuery('');
    if (el('clearSaved')) el('clearSaved').onclick = () => { if (confirm('Clear all saved holidays?')) { state.saved=[]; persistSaved(); updateSavedCount(); renderSaved(); } };
    if (el('shareSaved')) el('shareSaved').onclick = shareSaved;
    if (el('printSaved')) el('printSaved').onclick = printSaved;
    window.scrollTo(0,0);
  }
  function savedCard(s) {
    return `<div class="card"><div class="ph" style="height:120px;background:linear-gradient(155deg,${s.theme[0]},${s.theme[1]});position:relative">${sunWavesSVG()}</div>
      <div class="card-pad"><div class="between"><h3 style="margin:0">${s.dest}</h3><strong>${fmt.money(s.total)}</strong></div>
      <p class="small muted">${s.stay} · ${s.type} · ${s.nights} nights · ${s.party} travellers</p>
      <div style="display:flex;gap:.5rem"><button class="btn btn-ghost btn-sm" data-open-saved="${s.id}">Reopen search</button>
      <button class="btn btn-ghost btn-sm" data-rm-saved="${s.id}">Remove</button></div></div></div>`;
  }

  function serialiseSearch() {
    const s = state.search;
    return Object.assign({}, s, { date: toISO(s.date) });
  }
  function hydrateSharedSearch(data) {
    const s = Object.assign(blankSearch(), data);
    s.date = fromISO(data.date) || defaultAugust();
    state.search = s;
    computeResults();
    history.replaceState(null, '', '#results');
    renderResults();
  }
  function shareComparison() {
    const payload = btoa(unescape(encodeURIComponent(JSON.stringify(serialiseSearch()))));
    const url = location.origin + location.pathname + '#shared=' + payload;
    copy(url, 'Shareable link copied — anyone can open your exact comparison.');
  }
  function shareSaved() { shareComparison(); }
  function printSaved() {
    const w = window.open('', '_blank');
    if (!w) { toast('Please allow pop-ups to export.'); return; }
    w.document.write(`<html><head><title>StonesThrow — Saved Holidays</title>
      <style>body{font-family:system-ui;padding:32px;color:#10262e}h1{font-size:22px}table{border-collapse:collapse;width:100%;margin-top:12px}td,th{border:1px solid #ccc;padding:8px;text-align:left}</style></head><body>
      <h1>StonesThrow — Your saved holidays</h1><p>Generated ${new Date().toLocaleString('en-GB')} · Indicative demo prices.</p>
      <table><thead><tr><th>Destination</th><th>Accommodation</th><th>Nights</th><th>Travellers</th><th>Total</th></tr></thead><tbody>
      ${state.saved.map(s=>`<tr><td>${s.dest}, ${s.country}</td><td>${s.stay} (${s.type})</td><td>${s.nights}</td><td>${s.party}</td><td>${fmt.money(s.total)}</td></tr>`).join('')}
      </tbody></table></body></html>`);
    w.document.close(); w.focus(); setTimeout(()=>w.print(), 250);
  }

  /* =======================================================================
     ADMIN / PROVIDER CONFIGURATION
     ==================================================================== */
  function renderAdmin() {
    setTab('admin');
    const p = STConfig.providers;
    app().innerHTML = `<div class="wrap block">
      <div class="section-head"><div class="eyebrow">Admin</div><h2>Provider &amp; API configuration</h2>
      <p class="muted">StonesThrow uses a modular provider architecture. Each supplier implements a standard interface, so providers can be added, swapped or removed without touching the rest of the app.</p></div>

      <div class="card card-pad">
        <div class="between"><h3 style="margin:0">Data mode</h3>
          <select id="modeSel">${['demo','development','live'].map(m=>`<option value="${m}" ${STConfig.mode===m?'selected':''}>${m}</option>`).join('')}</select></div>
        <p class="small muted">Demo &amp; development modes use clearly-labelled realistic sample data. Live mode requires configured, server-side provider credentials. Prices are never presented as live unless a real provider is connected.</p>
      </div>

      <h3 style="margin:1.4rem 0 .6rem">Providers</h3>
      <div class="tablewrap"><table class="dates"><thead><tr><th>Provider</th><th>Interface</th><th>Env variable (server-side secret)</th><th>Status</th></tr></thead><tbody>
        ${Object.entries(p).map(([k,v])=>`<tr><td><strong>${v.name}</strong></td><td><code>${k}Provider.search()</code></td><td><code>${v.env}</code></td>
          <td>${v.connected?'<span class="pill pill-live">Connected</span>':'<span class="pill pill-demo">Demo adapter</span>'}</td></tr>`).join('')}
      </tbody></table></div>

      <div class="card card-pad" style="margin-top:1.4rem">
        <h3 style="margin-top:0">Affiliate attribution</h3>
        <div class="inline">
          <div><label class="small">Affiliate ID</label><input id="affId" type="text" value="${STConfig.affiliate.id}" placeholder="Set via server-side config in production"></div>
          <div style="flex:0 0 auto;align-self:end"><label class="small" style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" id="affConsent" style="width:auto" ${STConfig.affiliate.consentGiven?'checked':''}> Consent-based tracking only</label></div>
        </div>
        <p class="small muted">Affiliate deep links pass only non-sensitive search parameters, only where the user has consented and where legally appropriate.</p>
      </div>

      <div class="card card-pad" style="margin-top:1.4rem;background:var(--surface-2)">
        <h3 style="margin-top:0">Connecting real suppliers</h3>
        <ol class="small">
          <li>Implement each provider's <code>search()</code> / <code>get()</code> method against a legitimate API or affiliate feed (see <code>data.js</code>, marked <code>// &gt;&gt;&gt; INTEGRATION POINT</code>).</li>
          <li>Store credentials as server-side environment variables / secrets — never in client code.</li>
          <li>Return results in the standard shape, including a <code>meta</code> object with <code>source</code>, <code>live</code> and <code>checkedAt</code>.</li>
          <li>Set the data mode to <strong>live</strong>. The UI then labels prices as live and shows when they were last checked.</li>
        </ol>
        <p class="small muted">This build ships in demo mode with realistic sample data and does not claim live availability or booking capability.</p>
      </div>
    </div>`;
    el('modeSel').onchange = e => { STConfig.mode = e.target.value; toast('Mode set to ' + e.target.value + ' (demo build keeps sample data).'); };
    el('affId').onchange = e => STConfig.affiliate.id = e.target.value.trim();
    el('affConsent').onchange = e => STConfig.affiliate.consentGiven = e.target.checked;
    window.scrollTo(0,0);
  }

  /* =======================================================================
     MODAL / TOAST / HEADER / HELPERS
     ==================================================================== */
  function openModal(title, html) {
    closeModal();
    const back = document.createElement('div');
    back.className = 'modal-back'; back.id = 'modalBack';
    back.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="modal-head"><h3 style="margin:0">${title}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div>
      <div class="modal-body" style="padding:1.3rem">${html}</div></div>`;
    document.body.appendChild(back);
    back.addEventListener('click', e => { if (e.target === back) closeModal(); });
    $$('[data-close]', back).forEach(b => b.onclick = closeModal);
    document.addEventListener('keydown', escClose);
  }
  function escClose(e) { if (e.key === 'Escape') closeModal(); }
  function closeModal() { const m = el('modalBack'); if (m) m.remove(); document.removeEventListener('keydown', escClose); }
  function openModalLinksClose() {}

  let toastTimer;
  function toast(msg) {
    let t = el('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function copy(text, msg) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(()=>toast(msg||'Copied')).catch(()=>fallbackCopy(text,msg));
    else fallbackCopy(text, msg);
  }
  function fallbackCopy(text, msg) {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast(msg||'Copied'); } catch(e){ toast('Copy failed — here is the link: '+text); }
    ta.remove();
  }

  function wireHeader() {
    el('navToggle').onclick = () => el('navLinks').classList.toggle('open');
    el('themeToggle').onclick = () => {
      const root = document.documentElement;
      const dark = root.getAttribute('data-theme') === 'dark';
      root.setAttribute('data-theme', dark ? 'light' : 'dark');
      localStorage.setItem('st_theme', dark ? 'light' : 'dark');
    };
    el('textToggle').onclick = () => {
      const cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs-scale')) || 1;
      const next = cur >= 1.25 ? 1 : +(cur + 0.125).toFixed(3);
      document.documentElement.style.setProperty('--fs-scale', next);
      localStorage.setItem('st_fs', next);
      toast('Text size: ' + Math.round(next*100) + '%');
    };
    $$('#navLinks a').forEach(a => a.onclick = () => el('navLinks').classList.remove('open'));
    updateSavedCount();
  }
  function setTab() {}
  function summariseSearch() {
    const s = state.search;
    const who = s.childAges.length ? `Family of ${s.adults + s.childAges.length}` : (s.adults === 2 ? 'For two' : `${s.adults} adults`);
    const style = s.styles.length ? s.styles.slice(0,2).map(prettyStyle).join(' & ') : 'Your';
    return `${who} · ${style} holiday · ${s.nights} nights`;
  }
  function priceNote() {
    return STConfig.mode === 'live'
      ? `<span class="pill pill-live">Live · checked ${new Date().toLocaleTimeString('en-GB')}</span>`
      : `<span class="pill pill-demo">Indicative demo prices</span>`;
  }
  function weatherVerdict(w, score) {
    if (score >= 85) return `Excellent match for your holiday — typically ${w.tempHigh}°C with only about ${w.rainDays} rainy days and a warm ${w.seaTemp}°C sea.`;
    if (score >= 70) return `A good choice — around ${w.tempHigh}°C with roughly ${w.rainDays} rainy days. Pleasant, with the odd shower possible.`;
    return `Decent value, but expect cooler or wetter conditions than ideal (${w.tempHigh}°C, ~${w.rainDays} rainy days). Worth weighing against the savings.`;
  }
  function adviserRecommendationSafe() {}

  // pretty printers
  const prettyBoard = b => ({'room-only':'Room only','self-catering':'Self-catering','bed-and-breakfast':'B&B','half-board':'Half board','full-board':'Full board','all-inclusive':'All-inclusive'}[b] || b);
  const prettyFac = f => ({'private-pool':'Private pool','pool':'Pool','walk-to-beach':'Walk to beach','air-con':'Air-con','kids-club':'Kids’ club','water-park':'Water park','wifi':'Wi-Fi','washing-machine':'Washer','family-rooms':'Family rooms','multiple-bedrooms':'Multi-bed','town-centre':'Central','restaurants-nearby':'Restaurants','wheelchair':'Accessible','ground-floor':'Ground floor'}[f] || f.replace(/-/g,' '));
  const prettyStyle = s => ({'family-entertainment':'Family fun','water-sports':'Water sports','city-break':'City break','winter-sun':'Winter sun','landmarks':'Landmarks'}[s] || s.charAt(0).toUpperCase()+s.slice(1));
  function prioWord(w) { return ['Off','Very low','Low','Low','Moderate','Moderate','Important','Important','High','High','Essential'][w] || w; }
  const money = fmt.money;

  // small utils
  function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
  function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
  function toISO(d) { if (!d) return ''; const x = new Date(d); return x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0'); }
  function fromISO(s) { if (!s) return null; const p = s.split('-'); return new Date(+p[0], +p[1]-1, +p[2]); }
  function fmtDate(d) { return new Date(d).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' }); }
  function fmtMonth(d) { return new Date(d).toLocaleDateString('en-GB', { month:'long' }); }
  function escapeHtml(s) { return String(s||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  /* =======================================================================
     BOOT
     ==================================================================== */
  function boot() {
    // restore theme + text size
    const th = localStorage.getItem('st_theme'); if (th) document.documentElement.setAttribute('data-theme', th);
    const fs = localStorage.getItem('st_fs'); if (fs) document.documentElement.style.setProperty('--fs-scale', fs);
    shellChrome();
    window.addEventListener('hashchange', router);
    router();
  }

  return { boot, go, loadSample, _state: state };
})();

document.addEventListener('DOMContentLoaded', App.boot);
