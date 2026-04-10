/* ============================================================================
 * srs.js — Leitner-SM2-lite, time-gated five-box spaced repetition.
 * Exposes window.SRS with: loadDeck, saveDeck, rate, pickDue, stats,
 *                          migrateFromV1, cardKey
 * Persistence: localStorage["endo-guide.srs.v2"]
 * Also bumps a "srs:change" custom event on every write so the shared
 * site header can update its "Due" badge.
 *
 * Card state shape:
 *   {
 *     box: 0..4,              // 0 New, 1 Learning, 2 Young, 3 Mature, 4 Mastered
 *     lastReviewAt: ISOString | null,
 *     nextReviewAt: ISOString,   // card is "due" when now >= nextReviewAt
 *     reps: number,
 *     lapses: number,
 *     shaky: boolean,         // flagged by user for audit re-verification
 *     dir:  "fwd" | "rev"     // (encoded into the key, not stored here)
 *   }
 * ========================================================================= */
(function (global) {
  "use strict";

  var STORAGE_KEY = "endo-guide.srs.v2";
  var V1_KEY      = "endo-guide.study.v1";

  // Intervals keyed by box; [correct, wrong] -> [nextBox, delayMinutes]
  // "correct" means Good/Easy; "wrong" means Again; "Hard" is a separate path.
  var INTERVALS = {
    // box: { good: [nextBox, minutes], easy: [nextBox, minutes],
    //        hard: [nextBox, minutes], again: [nextBox, minutes] }
    0: { good:  [1, 60],            easy: [2, 60 * 24],
         hard:  [0, 15],            again:[0, 10] },
    1: { good:  [2, 60 * 24],       easy: [3, 60 * 24 * 3],
         hard:  [1, 60 * 6],        again:[0, 10] },
    2: { good:  [3, 60 * 24 * 3],   easy: [4, 60 * 24 * 7],
         hard:  [2, 60 * 24],       again:[1, 60] },
    3: { good:  [4, 60 * 24 * 7],   easy: [4, 60 * 24 * 14],
         hard:  [3, 60 * 24 * 2],   again:[1, 60 * 24] },
    4: { good:  [4, 60 * 24 * 21],  easy: [4, 60 * 24 * 35],
         hard:  [4, 60 * 24 * 7],   again:[2, 60 * 24] },
  };

  var BOX_NAMES = ["New", "Learning", "Young", "Mature", "Mastered"];

  function nowIso() { return new Date().toISOString(); }

  function addMinutesIso(isoOrNow, minutes) {
    var d = new Date(isoOrNow || nowIso());
    d.setTime(d.getTime() + minutes * 60 * 1000);
    return d.toISOString();
  }

  function safeParse(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  // ---------- Card key ---------------------------------------------------
  // Stable across builds: lowercased author, year, first 60 chars of finding.
  // Direction is encoded as a suffix so fwd/rev progress independently.
  function cardKey(author, year, finding, direction) {
    var a = String(author || "").toLowerCase().trim();
    var y = String(year || "").trim();
    var f = String(finding || "").slice(0, 60).toLowerCase();
    var d = direction === "rev" ? "rev" : "fwd";
    return a + "|" + y + "|" + f + "|" + d;
  }

  // ---------- Deck load / save ------------------------------------------
  function emptyDeck() {
    return {
      version: 2,
      cards: {},         // key -> CardState
      meta: {
        streak: 0,
        lastReviewAt: null,
        createdAt: nowIso(),
      },
      history: [],       // [{t, key, rating}]
    };
  }

  function loadDeck() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    var parsed = raw ? safeParse(raw) : null;
    if (parsed && parsed.version === 2 && parsed.cards) {
      if (!parsed.meta)    parsed.meta = { streak: 0, lastReviewAt: null };
      if (!parsed.history) parsed.history = [];
      return parsed;
    }
    // Try v1 migration
    var v1raw = null;
    try { v1raw = localStorage.getItem(V1_KEY); } catch (e) {}
    var v1 = v1raw ? safeParse(v1raw) : null;
    if (v1 && v1.boxes) {
      var migrated = migrateFromV1(v1);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated)); } catch (e) {}
      return migrated;
    }
    return emptyDeck();
  }

  function saveDeck(deck) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(deck));
      document.dispatchEvent(new CustomEvent("srs:change"));
    } catch (e) {}
  }

  // ---------- Migration from v1 (3-box Leitner) -------------------------
  function migrateFromV1(v1) {
    var deck = emptyDeck();
    var boxes = v1.boxes || {};
    Object.keys(boxes).forEach(function (oldKey) {
      var v1box = Number(boxes[oldKey]) || 0;
      var newBox = Math.min(2, Math.max(0, v1box)); // 0..2 maps to 0..2
      // The old key format was "author|year|finding[0..60]" — no direction.
      // Carry it forward as fwd; the new cardKey has a "|fwd" suffix.
      var key = oldKey + "|fwd";
      deck.cards[key] = {
        box: newBox,
        lastReviewAt: null,
        nextReviewAt: nowIso(), // everything shows as due
        reps: newBox,
        lapses: 0,
        shaky: false,
      };
    });
    if (Array.isArray(v1.history)) {
      deck.history = v1.history.slice(-200);
    }
    if (typeof v1.streak === "number") {
      deck.meta.streak = v1.streak;
    }
    deck.meta.migratedFromV1At = nowIso();
    return deck;
  }

  // ---------- Rating ----------------------------------------------------
  // rating: "again" | "hard" | "good" | "easy"
  function rate(deck, key, rating) {
    if (!deck.cards[key]) {
      deck.cards[key] = {
        box: 0,
        lastReviewAt: null,
        nextReviewAt: nowIso(),
        reps: 0,
        lapses: 0,
        shaky: false,
      };
    }
    var card = deck.cards[key];
    var step = INTERVALS[card.box] || INTERVALS[0];
    var entry = step[rating] || step.good;
    var nextBox = entry[0];
    var delayMin = entry[1];

    card.lastReviewAt = nowIso();
    card.nextReviewAt = addMinutesIso(null, delayMin);
    card.reps += 1;
    if (rating === "again") card.lapses += 1;
    card.box = nextBox;

    // Streak: advance if user rated something today for the first time
    var today = nowIso().slice(0, 10);
    if (deck.meta.lastReviewAt) {
      var lastDay = deck.meta.lastReviewAt.slice(0, 10);
      if (lastDay !== today) {
        // is it yesterday or a gap?
        var yesterday = new Date(Date.now() - 86400000)
          .toISOString().slice(0, 10);
        deck.meta.streak = lastDay === yesterday
          ? (deck.meta.streak || 0) + 1
          : 1;
      }
    } else {
      deck.meta.streak = 1;
    }
    deck.meta.lastReviewAt = nowIso();

    deck.history.push({
      t: Date.now(),
      key: key,
      rating: rating,
      box: nextBox,
    });
    if (deck.history.length > 500) {
      deck.history = deck.history.slice(-500);
    }
    saveDeck(deck);
    return card;
  }

  function markShaky(deck, key, shaky) {
    if (!deck.cards[key]) {
      deck.cards[key] = {
        box: 1,
        lastReviewAt: null,
        nextReviewAt: nowIso(),
        reps: 0,
        lapses: 0,
        shaky: !!shaky,
      };
    } else {
      deck.cards[key].shaky = !!shaky;
    }
    saveDeck(deck);
  }

  // ---------- Queue selection -------------------------------------------
  // candidatePool: array of { key, ...anyExtra }. Only keys in this pool
  // are considered so stale keys (old cards removed from guide) don't
  // clog the queue.
  function pickDue(deck, candidatePool, options) {
    options = options || {};
    var limit = options.limit || 1;
    var nowMs = options.now ? new Date(options.now).getTime() : Date.now();

    var poolKeys = {};
    for (var i = 0; i < candidatePool.length; i++) {
      poolKeys[candidatePool[i].key] = true;
    }

    var due = [];
    var fresh = [];
    var lapsed = [];
    var backlog = [];
    var keys = Object.keys(deck.cards);
    for (var j = 0; j < keys.length; j++) {
      var k = keys[j];
      if (!poolKeys[k]) continue;
      var c = deck.cards[k];
      var next = new Date(c.nextReviewAt || 0).getTime();
      if (next <= nowMs) {
        var overdueDays = (nowMs - next) / 86400000;
        if (overdueDays > 7) {
          lapsed.push({ key: k, overdue: overdueDays, box: c.box });
        } else {
          due.push({ key: k, overdue: overdueDays, box: c.box });
        }
      } else {
        backlog.push({ key: k, in: (next - nowMs) / 60000, box: c.box });
      }
    }
    // Fresh = pool keys we've never seen
    for (var p = 0; p < candidatePool.length; p++) {
      var pk = candidatePool[p].key;
      if (!deck.cards[pk]) fresh.push({ key: pk, box: -1 });
    }

    // Priority: lapsed first, then due by most overdue, then fresh, then
    // earliest backlog.
    lapsed.sort(function (a, b) { return b.overdue - a.overdue; });
    due.sort(function (a, b) { return b.overdue - a.overdue; });
    backlog.sort(function (a, b) { return a.in - b.in; });

    var out = [];
    function take(list) {
      for (var i = 0; i < list.length && out.length < limit; i++) {
        out.push(list[i].key);
      }
    }
    take(lapsed);
    take(due);
    take(fresh);
    if (out.length < limit) take(backlog);
    return out;
  }

  // ---------- Stats ------------------------------------------------------
  function stats(deck) {
    var now = Date.now();
    var counts = {
      total: 0, due: 0, newCount: 0,
      learning: 0, young: 0, mature: 0, mastered: 0,
      shaky: 0, lapses: 0,
    };
    var keys = Object.keys(deck.cards);
    for (var i = 0; i < keys.length; i++) {
      var c = deck.cards[keys[i]];
      counts.total += 1;
      counts.lapses += c.lapses || 0;
      if (c.shaky) counts.shaky += 1;
      var next = new Date(c.nextReviewAt || 0).getTime();
      if (next <= now) counts.due += 1;
      switch (c.box) {
        case 0: counts.newCount += 1; break;
        case 1: counts.learning += 1; break;
        case 2: counts.young    += 1; break;
        case 3: counts.mature   += 1; break;
        case 4: counts.mastered += 1; break;
      }
    }
    counts.streak = (deck.meta && deck.meta.streak) || 0;
    return counts;
  }

  // ---------- Public API ------------------------------------------------
  var SRS = {
    STORAGE_KEY: STORAGE_KEY,
    V1_KEY: V1_KEY,
    BOX_NAMES: BOX_NAMES,
    INTERVALS: INTERVALS,
    cardKey: cardKey,
    loadDeck: loadDeck,
    saveDeck: saveDeck,
    rate: rate,
    markShaky: markShaky,
    pickDue: pickDue,
    stats: stats,
    migrateFromV1: migrateFromV1,
  };

  global.SRS = SRS;
})(typeof window !== "undefined" ? window : this);
