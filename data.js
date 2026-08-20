/* =============================================================================
   StonesThrow — Data & Provider Layer
   -----------------------------------------------------------------------------
   This file holds:
     1. The demo dataset (destinations, accommodation, activities, weather).
     2. The provider adapter architecture (Flight / Accommodation / Activity /
        Weather / CarHire / AirportParking / Transfer providers).
     3. A configuration surface for API keys & affiliate IDs.

   DEMO MODE: All prices produced here are clearly-labelled INDICATIVE demo
   figures generated from a deterministic model. They are NOT live prices.
   To connect real suppliers, implement the provider interfaces against a
   legitimate API/affiliate feed and switch STConfig.mode to 'live'. Integration
   points are marked with  // >>> INTEGRATION POINT
   ========================================================================== */

const ST = (function () {
  'use strict';

  /* ---------------------------------------------------------------------------
     Deterministic pseudo-random helpers — so demo prices are stable & sensible
     rather than jumping around on every render.
  --------------------------------------------------------------------------- */
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0);
  }
  function seeded(seedStr) {
    // Returns a function producing floats in [0,1) deterministically from seed.
    let s = hashString(seedStr) || 1;
    return function () {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ---------------------------------------------------------------------------
     Configuration surface. In a real deployment these come from server-side
     environment variables / secrets — NEVER hard-coded client-side. Kept here
     only so the Admin screen can show integration status in the demo.
  --------------------------------------------------------------------------- */
  const STConfig = {
    mode: 'demo', // 'demo' | 'development' | 'live'
    brand: { name: 'StonesThrow', tagline: 'The perfect holiday, a stone’s throw away.' },
    currency: 'GBP',
    // >>> INTEGRATION POINT: populate from server-side secrets, never commit real keys.
    providers: {
      flights:        { name: 'Flight search partner',        env: 'FLIGHT_API_KEY',        connected: false },
      accommodation:  { name: 'Hotel & villa partner',        env: 'STAY_API_KEY',          connected: false },
      packages:       { name: 'Package holiday partner',      env: 'PACKAGE_API_KEY',       connected: false },
      carhire:        { name: 'Car hire partner',             env: 'CARHIRE_API_KEY',       connected: false },
      parking:        { name: 'Airport parking partner',      env: 'PARKING_API_KEY',       connected: false },
      activities:     { name: 'Activities & tickets partner', env: 'ACTIVITY_API_KEY',      connected: false },
      weather:        { name: 'Weather & climate data',       env: 'WEATHER_API_KEY',       connected: false }
    },
    affiliate: { id: '', consentGiven: false }
  };

  /* ---------------------------------------------------------------------------
     UK departure airports (subset) with rough coordinates for "within X miles".
  --------------------------------------------------------------------------- */
  const AIRPORTS = [
    { code: 'LHR', name: 'London Heathrow',    lat: 51.47, lon: -0.45 },
    { code: 'LGW', name: 'London Gatwick',     lat: 51.15, lon: -0.18 },
    { code: 'STN', name: 'London Stansted',    lat: 51.88, lon:  0.24 },
    { code: 'LTN', name: 'London Luton',       lat: 51.87, lon: -0.37 },
    { code: 'BHX', name: 'Birmingham',         lat: 52.45, lon: -1.75 },
    { code: 'MAN', name: 'Manchester',         lat: 53.35, lon: -2.27 },
    { code: 'BRS', name: 'Bristol',            lat: 51.38, lon: -2.72 },
    { code: 'EDI', name: 'Edinburgh',          lat: 55.95, lon: -3.37 },
    { code: 'GLA', name: 'Glasgow',            lat: 55.87, lon: -4.43 },
    { code: 'NCL', name: 'Newcastle',          lat: 55.04, lon: -1.69 },
    { code: 'LPL', name: 'Liverpool',          lat: 53.34, lon: -2.85 },
    { code: 'EMA', name: 'East Midlands',      lat: 52.83, lon: -1.33 },
    { code: 'LBA', name: 'Leeds Bradford',     lat: 53.87, lon: -1.66 },
    { code: 'BFS', name: 'Belfast',            lat: 54.66, lon: -6.22 },
    { code: 'CWL', name: 'Cardiff',            lat: 51.40, lon: -3.34 }
  ];

  function milesBetween(a, b) {
    const toRad = d => d * Math.PI / 180;
    const R = 3958.8;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(s)));
  }

  /* ---------------------------------------------------------------------------
     Airlines used for demo flight generation.
  --------------------------------------------------------------------------- */
  const AIRLINES = [
    { name: 'AzureJet',    baggage: 'Cabin bag only',                direct: true  },
    { name: 'Meridian Air',baggage: '23kg checked + cabin',          direct: true  },
    { name: 'CoastLine',   baggage: 'Cabin bag only',                direct: false },
    { name: 'Ibermar',     baggage: '20kg checked + cabin',          direct: true  },
    { name: 'SunHopper',   baggage: 'Cabin bag only',                direct: false }
  ];

  /* ---------------------------------------------------------------------------
     THE DEMO DESTINATION DATASET
     Each destination carries: geography, tags used for style-matching, a summer
     weather profile, a set of properties, and a set of activities.
  --------------------------------------------------------------------------- */

  // helper to build a monthly weather table around a warm-climate summer peak.
  function warmProfile(peakTemp, seaPeak, rainBase) {
    const months = {};
    const shape = [0.30, 0.34, 0.45, 0.58, 0.74, 0.90, 1.00, 0.98, 0.85, 0.66, 0.46, 0.33]; // Jan..Dec
    for (let m = 1; m <= 12; m++) {
      const f = shape[m - 1];
      const temp = Math.round(10 + (peakTemp - 10) * f);
      const sea = Math.round(14 + (seaPeak - 14) * Math.max(0, f - 0.05));
      const rainDays = Math.max(1, Math.round(rainBase * (1.15 - f)));
      const sun = Math.round(5 + 8 * f);
      months[m] = { tempHigh: temp, tempLow: temp - 7, seaTemp: sea, rainDays, sunHours: sun };
    }
    return months;
  }

  const DESTINATIONS = [
    {
      id: 'crete', name: 'Crete', country: 'Greece', region: 'Mediterranean',
      airport: { code: 'HER', name: 'Heraklion', lat: 35.34, lon: 25.18 },
      theme: ['#1f7a8c', '#e8b04b'],
      tags: ['beach','relaxing','family','culture','history','water-sports','food','walking','nature'],
      blurb: 'Greece’s largest island: golden beaches, Minoan ruins, mountain villages and famously warm hospitality. Superb for families and couples alike.',
      weather: warmProfile(30, 25, 6),
      accommodation: [
        { id:'crete-villa-olive', name:'Villa Olive Grove', type:'Villa', stars:0, guestRating:9.2, beachDist:1.4, townDist:2.0, sleeps:8, bedrooms:4, board:['self-catering'], nightly:410, cancellation:'Free until 21 days before', facilities:['private-pool','wifi','kitchen','washing-machine','parking','air-con','multiple-bedrooms','quiet'], pros:['Large private pool & gardens','Great for two families','Fully equipped kitchen'], cons:['Hire car recommended','15 min drive to nearest resort'] },
        { id:'crete-hotel-marbella', name:'Marbella Family Resort', type:'Resort', stars:4, guestRating:8.6, beachDist:0.1, townDist:0.6, sleeps:6, bedrooms:2, board:['all-inclusive','half-board'], nightly:520, cancellation:'Free until 14 days before', facilities:['pool','beachfront','kids-club','water-park','wifi','air-con','family-rooms','restaurants-nearby','spa','lift'], pros:['On the beach','Kids’ club & water park','All-inclusive available'], cons:['Busy in peak season','Premium price'] },
        { id:'crete-apt-blue', name:'Blue Bay Apartments', type:'Apartment', stars:3, guestRating:8.1, beachDist:0.3, townDist:0.2, sleeps:5, bedrooms:2, board:['self-catering','bed-and-breakfast'], nightly:190, cancellation:'Free until 7 days before', facilities:['pool','wifi','kitchen','air-con','town-centre','restaurants-nearby','walk-to-beach'], pros:['Excellent value','Walk to beach & tavernas','Central location'], cons:['Smaller pool','Some street noise'] },
        { id:'crete-boutique', name:'Elounda Stone Suites', type:'Hotel', stars:5, guestRating:9.4, beachDist:0.2, townDist:1.0, sleeps:2, bedrooms:1, board:['bed-and-breakfast','half-board'], nightly:340, cancellation:'Free until 30 days before', facilities:['pool','beachfront','wifi','air-con','spa','adults-only','quiet','restaurants-nearby'], pros:['Adults-only calm','Beautiful sea views','Spa & fine dining'], cons:['Not suitable for children','Car useful for exploring'] }
      ],
      activities: [
        { name:'Elafonissi Pink Sand Beach', category:'beach', desc:'Shallow turquoise lagoon with pink-tinged sand — idyllic for young children.', location:'SW Crete', suit:['family','young-children','beach','relaxing'], price:0, duration:'Half / full day' },
        { name:'Knossos Palace', category:'history', desc:'Europe’s oldest city and the legendary labyrinth of the Minoans.', location:'Heraklion', suit:['culture','history','landmarks'], price:15, duration:'2–3 hrs' },
        { name:'Samaria Gorge Hike', category:'hiking', desc:'A dramatic 16km walk through one of Europe’s longest gorges.', location:'White Mountains', suit:['adventure','walking','active','nature'], price:8, duration:'Full day' },
        { name:'Spinalonga Boat Trip', category:'boat', desc:'Boat excursion to the former island fortress, with swimming stops.', location:'Elounda', suit:['culture','family','water-sports'], price:25, duration:'Half day' },
        { name:'Chania Old Town & Market', category:'culture', desc:'Venetian harbour, backstreets and a superb covered food market.', location:'Chania', suit:['culture','food','relaxing'], price:0, duration:'Half day' },
        { name:'Watersports at Stalis', category:'water-sports', desc:'Jet-ski, paddleboard, banana boat and windsurf hire on the beach.', location:'Stalis', suit:['water-sports','adventure','family','teenagers'], price:35, duration:'Flexible' }
      ]
    },
    {
      id: 'mallorca', name: 'Mallorca', country: 'Spain', region: 'Mediterranean',
      airport: { code: 'PMI', name: 'Palma', lat: 39.55, lon: 2.73 },
      theme: ['#2a9d8f', '#e76f51'],
      tags: ['beach','family','villa','relaxing','culture','food','walking','nightlife','water-sports','luxury'],
      blurb: 'Balearic favourite with a bit of everything: sandy family bays, dramatic Tramuntana mountains, a beautiful old capital and countless private-pool villas.',
      weather: warmProfile(31, 26, 5),
      accommodation: [
        { id:'mallorca-villa-sol', name:'Villa Sol Privado', type:'Villa', stars:0, guestRating:9.3, beachDist:2.5, townDist:1.2, sleeps:8, bedrooms:4, board:['self-catering'], nightly:445, cancellation:'Free until 30 days before', facilities:['private-pool','wifi','kitchen','washing-machine','parking','air-con','multiple-bedrooms','quiet','gym'], pros:['Huge private pool','Mountain & sea views','Ideal for two families'], cons:['Hire car essential','Premium peak pricing'] },
        { id:'mallorca-hotel-bahia', name:'Bahía Playa Hotel', type:'Hotel', stars:4, guestRating:8.7, beachDist:0.05, townDist:0.4, sleeps:5, bedrooms:2, board:['all-inclusive','half-board','bed-and-breakfast'], nightly:495, cancellation:'Free until 14 days before', facilities:['pool','beachfront','kids-club','wifi','air-con','family-rooms','restaurants-nearby','lift','spa'], pros:['Directly on the beach','Great kids’ club','Walk to resort centre'], cons:['Can get busy','Sea-view rooms cost more'] },
        { id:'mallorca-apt-port', name:'Port Marina Apartments', type:'Apartment', stars:3, guestRating:8.0, beachDist:0.4, townDist:0.1, sleeps:5, bedrooms:2, board:['self-catering'], nightly:205, cancellation:'Free until 7 days before', facilities:['pool','wifi','kitchen','air-con','town-centre','restaurants-nearby','walk-to-beach','parking'], pros:['Great value near marina','Loads of restaurants nearby','Walk everywhere'], cons:['Marina can be lively at night','Small balcony pool'] },
        { id:'mallorca-fincaluxe', name:'Finca Serena Retreat', type:'Villa', stars:0, guestRating:9.6, beachDist:12, townDist:3, sleeps:6, bedrooms:3, board:['self-catering','bed-and-breakfast'], nightly:620, cancellation:'Free until 45 days before', facilities:['private-pool','wifi','kitchen','air-con','spa','quiet','gym','parking','multiple-bedrooms'], pros:['Boutique countryside luxury','Infinity pool & spa','Total privacy'], cons:['Rural — car essential','Far from the beach'] }
      ],
      activities: [
        { name:'Palma Cathedral & Old Town', category:'culture', desc:'Soaring Gothic cathedral and a maze of tapas-filled lanes.', location:'Palma', suit:['culture','history','food','landmarks'], price:9, duration:'Half day' },
        { name:'Serra de Tramuntana Drive', category:'nature', desc:'UNESCO mountain range with hairpin roads, olive terraces and viewpoints.', location:'NW Mallorca', suit:['nature','walking','relaxing'], price:0, duration:'Full day' },
        { name:'Katmandu Park', category:'family', desc:'Family theme park with rides, mini-golf and a splash zone.', location:'Magaluf', suit:['family','young-children','family-entertainment'], price:32, duration:'Full day' },
        { name:'Sea Kayak & Snorkel Tour', category:'water-sports', desc:'Guided paddle to hidden coves with snorkelling stops.', location:'Alcúdia', suit:['water-sports','adventure','teenagers','active'], price:45, duration:'Half day' },
        { name:'Sunset Catamaran Cruise', category:'boat', desc:'Relaxed sail with swim stops, drinks and sunset views.', location:'Palma Bay', suit:['relaxing','couples','family'], price:55, duration:'3 hrs' }
      ]
    },
    {
      id: 'menorca', name: 'Menorca', country: 'Spain', region: 'Mediterranean',
      airport: { code: 'MAH', name: 'Mahón', lat: 39.86, lon: 4.22 },
      theme: ['#457b9d', '#f4a261'],
      tags: ['beach','family','relaxing','villa','walking','nature','quiet','young-children'],
      blurb: 'Mallorca’s quieter sister: a UNESCO Biosphere of calm turquoise coves, gentle family beaches and a coastal walking trail circling the whole island.',
      weather: warmProfile(30, 25, 5),
      accommodation: [
        { id:'menorca-villa-cala', name:'Villa Cala Blanca', type:'Villa', stars:0, guestRating:9.1, beachDist:0.9, townDist:1.5, sleeps:6, bedrooms:3, board:['self-catering'], nightly:355, cancellation:'Free until 21 days before', facilities:['private-pool','wifi','kitchen','washing-machine','parking','air-con','multiple-bedrooms','quiet','walk-to-beach'], pros:['Short stroll to a quiet cove','Excellent value villa','Very peaceful'], cons:['Sleepy area at night','Car recommended'] },
        { id:'menorca-hotel-sur', name:'Cala Sur Family Club', type:'Resort', stars:4, guestRating:8.5, beachDist:0.15, townDist:0.7, sleeps:6, bedrooms:2, board:['all-inclusive','half-board'], nightly:470, cancellation:'Free until 14 days before', facilities:['pool','beachfront','kids-club','water-park','wifi','air-con','family-rooms','lift'], pros:['Calm shallow beach for toddlers','Small water park','All-inclusive'], cons:['Limited nightlife nearby','Fewer flight options'] },
        { id:'menorca-apt-ciut', name:'Ciutadella Old Town Apartments', type:'Apartment', stars:3, guestRating:8.3, beachDist:1.8, townDist:0.05, sleeps:4, bedrooms:2, board:['self-catering','bed-and-breakfast'], nightly:170, cancellation:'Free until 7 days before', facilities:['wifi','kitchen','air-con','town-centre','restaurants-nearby','quiet'], pros:['Charming historic centre','Superb restaurants nearby','Great value'], cons:['No pool','Drive to the best beaches'] }
      ],
      activities: [
        { name:'Camí de Cavalls Coast Walk', category:'walking', desc:'Stages of the historic 185km trail hugging the coastline — pick an easy section.', location:'Island-wide', suit:['walking','nature','relaxing','active'], price:0, duration:'Flexible' },
        { name:'Cala Macarella', category:'beach', desc:'Postcard-perfect turquoise cove backed by pines.', location:'South coast', suit:['beach','family','relaxing','young-children'], price:0, duration:'Half / full day' },
        { name:'Naveta des Tudons', category:'history', desc:'A 3,000-year-old Bronze Age burial monument.', location:'Near Ciutadella', suit:['culture','history','landmarks'], price:5, duration:'1 hr' },
        { name:'Glass-Bottom Boat & Snorkel', category:'boat', desc:'Gentle family boat trip over clear waters with snorkel gear.', location:'Fornells', suit:['family','water-sports','young-children'], price:28, duration:'Half day' }
      ]
    },
    {
      id: 'algarve', name: 'Algarve', country: 'Portugal', region: 'Atlantic Coast',
      airport: { code: 'FAO', name: 'Faro', lat: 37.01, lon: -7.97 },
      theme: ['#e76f51', '#f6bd60'],
      tags: ['beach','family','villa','golf','relaxing','food','walking','water-sports','nightlife'],
      blurb: 'Portugal’s sun-soaked south: dramatic golden cliffs, sheltered family beaches, world-class golf and some of Europe’s best-value private-pool villas.',
      weather: warmProfile(29, 23, 4),
      accommodation: [
        { id:'algarve-villa-dourada', name:'Villa Dourada', type:'Villa', stars:0, guestRating:9.0, beachDist:1.1, townDist:1.0, sleeps:8, bedrooms:4, board:['self-catering'], nightly:335, cancellation:'Free until 21 days before', facilities:['private-pool','wifi','kitchen','washing-machine','parking','air-con','multiple-bedrooms','gym'], pros:['Fantastic-value big villa','Heated private pool','Walk to shops & beach'], cons:['Popular area — book early','Some road noise'] },
        { id:'algarve-resort-marim', name:'Marim Beach Resort', type:'Resort', stars:4, guestRating:8.6, beachDist:0.1, townDist:0.5, sleeps:5, bedrooms:2, board:['all-inclusive','half-board','bed-and-breakfast'], nightly:455, cancellation:'Free until 14 days before', facilities:['pool','beachfront','kids-club','water-park','wifi','air-con','family-rooms','restaurants-nearby','spa','lift'], pros:['Clifftop beach setting','Big pool complex','Great kids’ facilities'], cons:['Cliff steps to beach','Premium in August'] },
        { id:'algarve-apt-old', name:'Old Town Terrace Apartments', type:'Apartment', stars:3, guestRating:8.2, beachDist:0.5, townDist:0.1, sleeps:4, bedrooms:2, board:['self-catering'], nightly:165, cancellation:'Free until 7 days before', facilities:['pool','wifi','kitchen','air-con','town-centre','restaurants-nearby','walk-to-beach'], pros:['Brilliant value','Heart of the old town','Rooftop pool'], cons:['Lively bars nearby','Compact rooms'] }
      ],
      activities: [
        { name:'Benagil Sea Cave Kayak', category:'water-sports', desc:'Paddle into the famous domed sea cave with its natural skylight.', location:'Lagoa', suit:['water-sports','adventure','teenagers','active'], price:35, duration:'2 hrs' },
        { name:'Ponta da Piedade Cliff Walk', category:'walking', desc:'Boardwalk trail above golden rock stacks and hidden grottoes.', location:'Lagos', suit:['walking','nature','relaxing'], price:0, duration:'1–2 hrs' },
        { name:'Zoomarine Park', category:'family', desc:'Marine-life park with pools, shows and a splash zone.', location:'Albufeira', suit:['family','young-children','family-entertainment'], price:29, duration:'Full day' },
        { name:'Dolphin-Watching Cruise', category:'boat', desc:'Small-boat trip to spot wild dolphins off the coast.', location:'Albufeira', suit:['family','nature','relaxing'], price:38, duration:'Half day' },
        { name:'Silves Castle & Market', category:'culture', desc:'Red-sandstone Moorish castle above a riverside market town.', location:'Silves', suit:['culture','history','food'], price:6, duration:'Half day' }
      ]
    },
    {
      id: 'costa-blanca', name: 'Costa Blanca', country: 'Spain', region: 'Mediterranean',
      airport: { code: 'ALC', name: 'Alicante', lat: 38.28, lon: -0.56 },
      theme: ['#0081a7', '#fdc500'],
      tags: ['beach','family','value','nightlife','water-sports','food','relaxing','city-break'],
      blurb: 'The classic value sunshine coast: long Blue Flag beaches, a lively promenade, cheap flights from almost anywhere in the UK and family fun on tap.',
      weather: warmProfile(30, 25, 3),
      accommodation: [
        { id:'cb-hotel-levante', name:'Levante Sun Hotel', type:'Hotel', stars:4, guestRating:8.4, beachDist:0.1, townDist:0.3, sleeps:5, bedrooms:2, board:['all-inclusive','half-board','bed-and-breakfast'], nightly:395, cancellation:'Free until 14 days before', facilities:['pool','beachfront','kids-club','wifi','air-con','family-rooms','restaurants-nearby','lift','gym'], pros:['Superb value all-inclusive','Beachfront with big pool','Lots to do nearby'], cons:['Busy resort strip','High-rise setting'] },
        { id:'cb-apt-marina', name:'Marina View Apartments', type:'Apartment', stars:3, guestRating:8.0, beachDist:0.25, townDist:0.1, sleeps:5, bedrooms:2, board:['self-catering'], nightly:150, cancellation:'Free until 7 days before', facilities:['pool','wifi','kitchen','air-con','town-centre','restaurants-nearby','walk-to-beach','parking'], pros:['Cheapest sea-close option','Walk to beach & bars','Full kitchen'], cons:['Nightlife can be noisy','Basic decor'] },
        { id:'cb-villa-quiet', name:'Villa Tranquila', type:'Villa', stars:0, guestRating:8.9, beachDist:3.5, townDist:2.0, sleeps:6, bedrooms:3, board:['self-catering'], nightly:280, cancellation:'Free until 21 days before', facilities:['private-pool','wifi','kitchen','washing-machine','parking','air-con','multiple-bedrooms','quiet'], pros:['Private pool at low cost','Quiet hillside setting','Great for groups'], cons:['Car needed for beach','Away from the action'] }
      ],
      activities: [
        { name:'Terra Mítica Theme Park', category:'family', desc:'Big rollercoaster theme park themed on ancient civilisations.', location:'Benidorm', suit:['family','teenagers','family-entertainment','adventure'], price:38, duration:'Full day' },
        { name:'Guadalest Mountain Village', category:'culture', desc:'Cliff-top castle village above a turquoise reservoir.', location:'Guadalest', suit:['culture','history','walking','landmarks'], price:5, duration:'Half day' },
        { name:'Aqualandia Water Park', category:'family', desc:'One of Spain’s biggest water parks — slides for all ages.', location:'Benidorm', suit:['family','young-children','teenagers','water-sports'], price:34, duration:'Full day' },
        { name:'Tabarca Island Boat Trip', category:'boat', desc:'Ferry to a car-free island with a marine reserve for snorkelling.', location:'Alicante', suit:['family','water-sports','nature','relaxing'], price:22, duration:'Full day' }
      ]
    },
    {
      id: 'cyprus', name: 'Cyprus', country: 'Cyprus', region: 'Eastern Mediterranean',
      airport: { code: 'PFO', name: 'Paphos', lat: 34.72, lon: 32.49 },
      theme: ['#006d77', '#e29578'],
      tags: ['beach','family','relaxing','history','culture','water-sports','luxury','winter-sun'],
      blurb: 'Reliable heat well into autumn, EU-familiar comforts, ancient mosaics and long sandy beaches. A strong choice when you want a near-guarantee of sunshine.',
      weather: warmProfile(33, 27, 3),
      accommodation: [
        { id:'cyp-resort-aphrodite', name:'Aphrodite Bay Resort', type:'Resort', stars:5, guestRating:9.1, beachDist:0.05, townDist:1.5, sleeps:5, bedrooms:2, board:['all-inclusive','half-board'], nightly:560, cancellation:'Free until 21 days before', facilities:['pool','beachfront','kids-club','water-park','wifi','air-con','family-rooms','spa','lift','gym','restaurants-nearby'], pros:['Five-star beachfront','Excellent kids’ & spa facilities','Superb all-inclusive'], cons:['Premium price','Large resort'] },
        { id:'cyp-villa-golden', name:'Golden Bay Villa', type:'Villa', stars:0, guestRating:9.0, beachDist:1.6, townDist:2.2, sleeps:8, bedrooms:4, board:['self-catering'], nightly:390, cancellation:'Free until 21 days before', facilities:['private-pool','wifi','kitchen','washing-machine','parking','air-con','multiple-bedrooms','gym','quiet'], pros:['Big heated private pool','Great for larger families','Sea views'], cons:['Hire car essential','Hilly walk to shops'] },
        { id:'cyp-apt-harbour', name:'Harbour Lights Apartments', type:'Apartment', stars:3, guestRating:8.1, beachDist:0.4, townDist:0.1, sleeps:4, bedrooms:2, board:['self-catering','bed-and-breakfast'], nightly:175, cancellation:'Free until 7 days before', facilities:['pool','wifi','kitchen','air-con','town-centre','restaurants-nearby','walk-to-beach'], pros:['Good value near the harbour','Walk to tavernas','Rooftop pool'], cons:['Longer flight time','Busy in evenings'] }
      ],
      activities: [
        { name:'Paphos Archaeological Park', category:'history', desc:'UNESCO site of astonishing Roman mosaics by the harbour.', location:'Paphos', suit:['culture','history','landmarks'], price:8, duration:'Half day' },
        { name:'Blue Lagoon Boat Cruise', category:'boat', desc:'Cruise to the vivid blue waters of the Akamas peninsula for swimming.', location:'Latchi', suit:['family','water-sports','relaxing','teenagers'], price:40, duration:'Full day' },
        { name:'Adventure Water Park', category:'family', desc:'Themed water park with slides, lazy river and toddler zone.', location:'Paphos', suit:['family','young-children','teenagers','water-sports'], price:36, duration:'Full day' },
        { name:'Akamas Jeep Safari', category:'adventure', desc:'Off-road trip to sea caves, gorges and remote beaches.', location:'Akamas', suit:['adventure','active','nature','teenagers'], price:48, duration:'Full day' }
      ]
    },
    {
      id: 'costa-del-sol', name: 'Costa del Sol', country: 'Spain', region: 'Mediterranean',
      airport: { code: 'AGP', name: 'Málaga', lat: 36.68, lon: -4.50 },
      theme: ['#ee6c4d', '#f2cc8f'],
      tags: ['beach','family','value','city-break','culture','food','nightlife','relaxing'],
      blurb: 'Cheap, frequent flights, a buzzing coast and gorgeous Andalusian cities within reach. Great when flight cost and easy logistics matter most.',
      weather: warmProfile(31, 24, 3),
      accommodation: [
        { id:'cds-hotel-sol', name:'Sol y Mar Hotel', type:'Hotel', stars:4, guestRating:8.5, beachDist:0.1, townDist:0.3, sleeps:5, bedrooms:2, board:['all-inclusive','half-board','bed-and-breakfast'], nightly:410, cancellation:'Free until 14 days before', facilities:['pool','beachfront','kids-club','wifi','air-con','family-rooms','restaurants-nearby','lift','spa'], pros:['Beachfront with lovely pools','Great transport links','Family-friendly'], cons:['Busy promenade','Sea-view supplement'] },
        { id:'cds-apt-old', name:'Casco Antiguo Apartments', type:'Apartment', stars:3, guestRating:8.0, beachDist:0.6, townDist:0.05, sleeps:4, bedrooms:2, board:['self-catering'], nightly:145, cancellation:'Free until 7 days before', facilities:['pool','wifi','kitchen','air-con','town-centre','restaurants-nearby'], pros:['Best-value coast option','In the historic centre','Tapas everywhere'], cons:['Short walk to sand','Lively at night'] },
        { id:'cds-villa-mijas', name:'Villa Mijas Vista', type:'Villa', stars:0, guestRating:8.8, beachDist:4.0, townDist:2.5, sleeps:6, bedrooms:3, board:['self-catering'], nightly:300, cancellation:'Free until 21 days before', facilities:['private-pool','wifi','kitchen','washing-machine','parking','air-con','multiple-bedrooms','quiet','gym'], pros:['Panoramic hillside pool','Peaceful yet close to Malaga','Good group value'], cons:['Car essential','Winding access road'] }
      ],
      activities: [
        { name:'Alhambra Day Trip (Granada)', category:'history', desc:'The breathtaking Moorish palace-fortress — a bucket-list wonder.', location:'Granada', suit:['culture','history','landmarks'], price:18, duration:'Full day' },
        { name:'Málaga Old Town & Picasso', category:'culture', desc:'Cathedral, Roman theatre, the Picasso museum and buzzing tapas lanes.', location:'Málaga', suit:['culture','food','city-break','relaxing'], price:12, duration:'Half day' },
        { name:'Selwo Adventure Park', category:'family', desc:'Safari-style wildlife park with over 2,000 animals.', location:'Estepona', suit:['family','young-children','nature'], price:26, duration:'Full day' },
        { name:'Caminito del Rey', category:'walking', desc:'Vertiginous cliff-face walkway through a spectacular gorge.', location:'El Chorro', suit:['adventure','walking','active'], price:10, duration:'Half day' }
      ]
    },
    {
      id: 'sardinia', name: 'Sardinia', country: 'Italy', region: 'Mediterranean',
      airport: { code: 'OLB', name: 'Olbia', lat: 40.90, lon: 9.52 },
      theme: ['#118ab2', '#ffd166'],
      tags: ['beach','luxury','relaxing','villa','nature','food','couples','water-sports'],
      blurb: 'Caribbean-clear water and some of the Mediterranean’s finest beaches, wrapped in wild landscapes and outstanding Italian food. A romantic, upmarket choice.',
      weather: warmProfile(30, 25, 4),
      accommodation: [
        { id:'sar-villa-smeralda', name:'Villa Smeralda', type:'Villa', stars:0, guestRating:9.4, beachDist:0.7, townDist:2.0, sleeps:6, bedrooms:3, board:['self-catering'], nightly:520, cancellation:'Free until 30 days before', facilities:['private-pool','wifi','kitchen','washing-machine','parking','air-con','multiple-bedrooms','quiet','walk-to-beach'], pros:['Stunning coastal villa','Walk to a dream beach','Superb privacy'], cons:['Premium region','Car essential'] },
        { id:'sar-hotel-costa', name:'Costa Verde Hotel', type:'Hotel', stars:4, guestRating:8.7, beachDist:0.1, townDist:1.0, sleeps:4, bedrooms:2, board:['half-board','bed-and-breakfast'], nightly:480, cancellation:'Free until 14 days before', facilities:['pool','beachfront','wifi','air-con','family-rooms','restaurants-nearby','spa','lift'], pros:['Right on a gorgeous bay','Excellent restaurant','Relaxed elegance'], cons:['Fewer kids’ facilities','Higher-end pricing'] },
        { id:'sar-apt-olbia', name:'Olbia Centro Apartments', type:'Apartment', stars:3, guestRating:8.1, beachDist:2.5, townDist:0.1, sleeps:4, bedrooms:2, board:['self-catering'], nightly:185, cancellation:'Free until 7 days before', facilities:['wifi','kitchen','air-con','town-centre','restaurants-nearby','parking'], pros:['Good value base','Great food scene','Handy for the airport'], cons:['Not beachfront','No pool'] }
      ],
      activities: [
        { name:'La Pelosa Beach', category:'beach', desc:'Shallow, powder-white sand and impossibly clear turquoise water.', location:'Stintino', suit:['beach','relaxing','family','couples'], price:0, duration:'Half / full day' },
        { name:'La Maddalena Archipelago Cruise', category:'boat', desc:'Island-hopping boat day around protected turquoise lagoons.', location:'Palau', suit:['relaxing','water-sports','nature','couples'], price:60, duration:'Full day' },
        { name:'Cala Gonone Sea Caves', category:'nature', desc:'Boat & walk to the Bue Marino caves and hidden pebble coves.', location:'Dorgali', suit:['nature','adventure','walking'], price:30, duration:'Half day' },
        { name:'Sardinian Food & Wine Tour', category:'culture', desc:'Taste pecorino, culurgiones and Cannonau wine at a rural farm.', location:'Gallura', suit:['food','culture','relaxing','couples'], price:65, duration:'Half day' }
      ]
    }
  ];

  // Give every destination its coordinate (from its airport) for flight-time calc.
  DESTINATIONS.forEach(d => { d.lat = d.airport.lat; d.lon = d.airport.lon; });

  /* ---------------------------------------------------------------------------
     Seasonal price multiplier + day-of-week effect (for flexible-date search).
  --------------------------------------------------------------------------- */
  function seasonalMultiplier(month) {
    // Higher in July/Aug & Christmas, lower in shoulder months.
    const table = { 1:0.72, 2:0.72, 3:0.80, 4:0.92, 5:0.98, 6:1.10, 7:1.30, 8:1.38, 9:1.05, 10:0.90, 11:0.74, 12:0.95 };
    return table[month] || 1;
  }
  function dowMultiplier(date) {
    // Tue/Wed departures cheaper; Fri/Sat dearer.
    const d = date.getDay();
    return [0.99, 0.95, 0.92, 0.93, 0.97, 1.06, 1.05][d];
  }

  /* =========================================================================
     PROVIDER ADAPTERS
     Each provider exposes an async-style method returning results in a standard
     shape, plus a `meta` object stating source + whether the price is live.
     Swap these DEMO implementations for real API-backed ones to go live.
     ====================================================================== */

  function priceMeta(sourceName) {
    return {
      source: sourceName,
      live: STConfig.mode === 'live',
      priceType: STConfig.mode === 'live' ? 'live' : 'indicative',
      checkedAt: new Date().toISOString()
    };
  }

  const FlightProvider = {
    name: 'DemoFlightProvider',
    // >>> INTEGRATION POINT: replace with a real flight search API call.
    search(params) {
      // params: { origin(airport obj), destination, date(Date), nights, travellers }
      const dest = params.destination;
      const origin = params.origin;
      const miles = milesBetween(origin, dest);
      const flightHours = Math.max(1.4, miles / 480); // rough jet cruise
      const rnd = seeded(origin.code + dest.id + params.date.toDateString());
      const paxCount = params.travellers.adults + params.travellers.childAges.length +
        params.travellers.infants; // infants often reduced, handled below
      const results = AIRLINES.map((al, i) => {
        const r = seeded(origin.code + dest.id + al.name + params.date.toDateString());
        const direct = al.direct;
        const stops = direct ? 0 : 1;
        const extra = direct ? 0 : (0.6 + r() * 1.4); // added hours if indirect
        const totalHours = flightHours + extra + (stops ? 1 + r() : 0);
        const basePerAdult = (58 + miles * 0.055) * seasonalMultiplier(params.date.getMonth() + 1) *
          dowMultiplier(params.date) * (direct ? 1.12 : 0.86) * (0.9 + r() * 0.3);
        // children ~75%, infants ~12%
        const perAdult = Math.round(basePerAdult);
        const childCost = params.travellers.childAges.reduce((s, age) => s + Math.round(perAdult * (age < 2 ? 0.12 : 0.78)), 0);
        const infantCost = params.travellers.infants * Math.round(perAdult * 0.12);
        const groupPrice = perAdult * params.travellers.adults + childCost + infantCost;
        const depHour = 6 + Math.floor(r() * 12);
        const depMin = (Math.floor(r() * 4) * 15);
        return {
          id: origin.code + '-' + dest.airport.code + '-' + i,
          airline: al.name,
          from: origin, to: dest.airport,
          direct, stops,
          depTime: fmtTime(depHour, depMin),
          arrTime: fmtTime((depHour + Math.floor(totalHours)) % 24, (depMin + Math.round((totalHours % 1) * 60)) % 60),
          durationHours: totalHours,
          baggage: al.baggage,
          perAdult,
          groupPrice: Math.round(groupPrice),
          meta: priceMeta('DemoFlightProvider')
        };
      });
      return results.sort((a, b) => a.groupPrice - b.groupPrice);
    }
  };

  const AccommodationProvider = {
    name: 'DemoAccommodationProvider',
    // >>> INTEGRATION POINT: replace with real hotel/villa availability API.
    search(params) {
      // params: { destination, nights, date, travellers, board }
      const dest = params.destination;
      const sm = seasonalMultiplier(params.date.getMonth() + 1);
      const partySize = params.travellers.adults + params.travellers.childAges.length + params.travellers.infants;
      return dest.accommodation
        .filter(a => a.sleeps >= partySize) // must fit the party
        .map(a => {
          const nights = params.nights;
          const nightly = Math.round(a.nightly * sm);
          const total = nightly * nights;
          return Object.assign({}, a, {
            destinationId: dest.id,
            destinationName: dest.name,
            nights,
            nightly,
            total,
            meta: priceMeta('DemoAccommodationProvider')
          });
        });
    }
  };

  const ActivityProvider = {
    name: 'DemoActivityProvider',
    // >>> INTEGRATION POINT: replace with a real activities/tickets feed.
    search(params) {
      return params.destination.activities.map(a =>
        Object.assign({}, a, { destinationId: params.destination.id, meta: priceMeta('DemoActivityProvider') })
      );
    }
  };

  const WeatherProvider = {
    name: 'DemoWeatherProvider',
    // >>> INTEGRATION POINT: replace with a climate/forecast API.
    get(params) {
      const m = params.date.getMonth() + 1;
      const w = params.destination.weather[m];
      return Object.assign({ month: m }, w, { meta: priceMeta('DemoWeatherProvider') });
    }
  };

  const CarHireProvider = {
    name: 'DemoCarHireProvider',
    search(params) {
      const r = seeded(params.destination.id + 'car');
      const classes = [
        { cls: 'Economy (e.g. Fiat Panda)', perDay: 22 },
        { cls: 'Compact (e.g. SEAT Ibiza)', perDay: 29 },
        { cls: 'Family SUV (e.g. Nissan Qashqai)', perDay: 44 },
        { cls: '7-seater (e.g. VW Sharan)', perDay: 61 }
      ];
      return classes.map(c => ({
        provider: 'DemoCarHire',
        cls: c.cls,
        total: Math.round(c.perDay * params.nights * (0.9 + r() * 0.25)),
        perDay: c.perDay,
        meta: priceMeta('DemoCarHireProvider')
      }));
    }
  };

  const AirportParkingProvider = {
    name: 'DemoAirportParkingProvider',
    search(params) {
      const opts = [
        { type: 'Park & Ride', perDay: 8 },
        { type: 'Meet & Greet', perDay: 14 },
        { type: 'On-airport', perDay: 19 }
      ];
      return opts.map(o => ({
        provider: 'DemoParking',
        type: o.type,
        total: Math.round(o.perDay * (params.nights + 1)),
        meta: priceMeta('DemoAirportParkingProvider')
      }));
    }
  };

  const TransferProvider = {
    name: 'DemoTransferProvider',
    search(params) {
      const pax = params.travellers.adults + params.travellers.childAges.length;
      return [
        { type: 'Shared shuttle', total: Math.round(12 * pax), meta: priceMeta('DemoTransferProvider') },
        { type: 'Private transfer', total: Math.round(38 + 6 * pax), meta: priceMeta('DemoTransferProvider') }
      ];
    }
  };

  /* ---------------------------------------------------------------------------
     Small formatting helpers reused by the app layer.
  --------------------------------------------------------------------------- */
  function fmtTime(h, m) {
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  }
  function fmtHours(hrs) {
    const h = Math.floor(hrs), m = Math.round((hrs - h) * 60);
    return h + 'h ' + String(m).padStart(2, '0') + 'm';
  }
  function money(n) {
    return '£' + Math.round(n).toLocaleString('en-GB');
  }

  /* ---------------------------------------------------------------------------
     Sample search — used by the "Try a sample" button. Matches the brief's
     example family of five.
  --------------------------------------------------------------------------- */
  const SAMPLE_SEARCH = {
    query: 'A Mediterranean beach holiday for the family with a pool',
    adults: 2,
    childAges: [11, 13, 17],
    infants: 0,
    accessibility: [],
    special: '',
    originCodes: ['BHX'],
    radiusMiles: 0,
    date: null, // set to ~next August at runtime
    flexibility: 3,
    nights: 7,
    styles: ['beach', 'water-sports', 'family', 'culture'],
    accomTypes: ['villa', 'resort', 'hotel'],
    board: 'flexible',
    facilities: { 'pool': 'essential', 'walk-to-beach': 'preferred', 'wifi': 'preferred', 'air-con': 'preferred', 'kids-club': 'nice', 'family-rooms': 'preferred' },
    budget: 6000,
    budgetMode: 'best-value',
    includes: ['flights', 'accommodation']
  };

  return {
    STConfig, AIRPORTS, DESTINATIONS, AIRLINES, SAMPLE_SEARCH,
    milesBetween, seasonalMultiplier, dowMultiplier, seeded, hashString,
    providers: {
      flights: FlightProvider,
      accommodation: AccommodationProvider,
      activities: ActivityProvider,
      weather: WeatherProvider,
      carhire: CarHireProvider,
      parking: AirportParkingProvider,
      transfer: TransferProvider
    },
    fmt: { time: fmtTime, hours: fmtHours, money }
  };
})();
