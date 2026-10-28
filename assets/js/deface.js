/* BLTL — defacement.
   Asks the ESP32 for the potato charge (/state) every second and plays an attack
   each time the virtual supercapacitor discharges.

   The strength of an attack depends on the potatoes at that moment, each level
   keeping the previous ones:
     level 1 (few potatoes)   text replaced + graffiti
     level 2 (more)           + poster pasted on top, corporate photo swapped
     level 3 (a lot)          + potato sticker + sound
   Each attack adds `level` elements to the page. Too many elements: the server
   crashes, then restarts clean.

   Simulation without ESP32: open index.html as a file, or index.html?sim
   Replay a given history for testing: index.html?sim&log=1112223333 (one digit = one attack and its level) */
(function () {
    var M = window.BLTL_MESSAGES;
    var root = document.documentElement;
    var params = new URLSearchParams(location.search);
    var SIM = location.protocol === 'file:' || params.has('sim');

    // Keep in sync with esp32/bltl_portal/bltl_portal.ino
    var CAP = { voltsPerPotato: 0.9, resistance: 10, leak: 1, threshold: 200 };
    var LEVEL_VOLTS = [7.2, 13.5];          // level 2 from 8 potatoes, level 3 from 15
    var CRASH = { elements: 40, seconds: 30 };

    // Attack number at which each stage starts (deface-1 … deface-4)
    var STAGES = [1, 5, 9, 13];

    var TARGETS = 'h1, h2, h4, .hero p, .card p, .about p, .markets li, .btn, .phone a, .footer address';
    var IMAGES = 'assets/images/';
    var SOUNDS = 'assets/sounds/';

    var applied = 0;
    var elements = 0;
    var targets = [];
    var photos = [];
    var audio = new Audio();
    var bar;
    var layer;

    // Seeded random: every visitor sees exactly the same damage for the same attack
    function rng(seed) {
        return function () {
            seed = seed + 0x6D2B79F5 | 0;
            var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
            t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
            return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
    }

    function shuffle(list, r) {
        for (var i = list.length - 1; i > 0; i--) {
            var j = Math.floor(r() * (i + 1));
            var tmp = list[i];
            list[i] = list[j];
            list[j] = tmp;
        }
        return list;
    }

    function pick(list, n) {
        return list[n % list.length];
    }

    function headline(el, msg) {
        var hl = document.createElement('span');
        hl.className = 'hl';
        hl.textContent = msg[0];
        el.textContent = ' ' + msg[1];
        el.insertBefore(hl, el.firstChild);
    }

    // Replace the text of one element with a message
    function hack(el, n) {
        if (el.matches('h1, h2')) {
            headline(el, pick(M.headlines, n));
        } else if (el.matches('p, address')) {
            el.textContent = pick(M.paragraphs, n);
        } else {
            el.textContent = pick(M.short, n);
        }
        el.classList.add('hacked');
    }

    // Put an element somewhere on the page, rotated, in the layer above everything
    function place(el, r) {
        el.style.left = (r() * 80) + '%';
        el.style.top = (r() * 95) + '%';
        el.style.transform = 'rotate(' + (r() * 30 - 15) + 'deg)';
        layer.appendChild(el);
    }

    function stick(cls, text, size, r) {
        var el = document.createElement('span');
        el.className = cls;
        el.textContent = text;
        el.style.fontSize = size + 'rem';
        place(el, r);
    }

    function paste(file, r) {
        var img = document.createElement('img');
        img.className = 'poster';
        img.src = IMAGES + file;
        img.alt = '';
        img.style.width = (28 + r() * 18) + '%';
        place(img, r);
    }

    // Browsers only allow sound after a tap: unlock the player on the first one
    function unlockAudio() {
        audio.src = SOUNDS + M.sounds[0];
        audio.muted = true;
        var p = audio.play();
        if (p) p.then(function () { audio.pause(); audio.muted = false; }).catch(function () {});
        ['click', 'touchend', 'keydown'].forEach(function (type) {
            document.removeEventListener(type, unlockAudio);
        });
    }

    function play(file) {
        audio.src = SOUNDS + file;
        audio.muted = false;
        var p = audio.play();
        if (p) p.catch(function () {}); // no tap yet: silent attack
    }

    function takeover() {
        if (document.querySelector('.manifesto')) return;
        document.querySelector('.logo_tag').textContent = M.logoTag;

        var section = document.createElement('section');
        var inner = document.createElement('div');
        var h2 = document.createElement('h2');
        var p = document.createElement('p');
        section.className = 'manifesto';
        inner.className = 'inner';
        headline(h2, M.manifesto.title);
        p.textContent = M.manifesto.text;
        inner.appendChild(h2);
        inner.appendChild(p);
        section.appendChild(inner);
        document.querySelector('.header').after(section);
    }

    function zap() {
        root.classList.remove('zap');
        void root.offsetWidth;
        root.classList.add('zap');
        setTimeout(function () { root.classList.remove('zap'); }, 700);
    }

    function attack(n, level, live) {
        var r = rng(n * 7919);

        // Level 1: text
        hack(targets[(n - 1) % targets.length], n);
        stick('tag', pick(M.tags, n), 1.5 + r() * 3, r);

        // Level 2: images
        if (level >= 2) {
            paste(pick(M.posters, n), r);
            pick(photos, n).src = IMAGES + pick(M.photos, n);
        }

        // Level 3: sound
        if (level >= 3) {
            stick('sticker', '🥔', 2 + r() * 4, r);
            if (live) play(pick(M.sounds, n));
        }

        elements += level;
        for (var i = 0; i < STAGES.length; i++) {
            root.classList.toggle('deface-' + (i + 1), n >= STAGES[i]);
        }
        if (n >= STAGES[3]) takeover();
        root.classList.toggle('overload', elements >= CRASH.elements * 0.75);
        if (live) zap();
    }

    function crash() {
        if (document.querySelector('.crash')) return;
        audio.pause();
        var screen = document.createElement('div');
        screen.className = 'crash';
        document.body.appendChild(screen);
        M.crash.forEach(function (line, i) {
            setTimeout(function () {
                var p = document.createElement('p');
                p.textContent = line;
                screen.appendChild(p);
            }, i * 400);
        });
    }

    // state = { charge (0…1), log ("1123": one digit per attack = its level), crash }
    function update(state) {
        var log = state.log || '';
        bar.style.width = Math.min(state.charge, 1) * 100 + '%';

        if (log.length < applied) {
            location.reload(); // after a crash or a reset: back to the clean site
            return;
        }
        var first = applied === 0;
        while (applied < log.length) {
            applied++;
            attack(applied, +log[applied - 1], !first && applied === log.length);
        }
        if (state.crash) crash();
    }

    function poll() {
        fetch('/state', { cache: 'no-store' })
            .then(function (res) { return res.json(); })
            .then(update)
            .catch(function () {})
            .then(function () { setTimeout(poll, 1000); });
    }

    function levelFor(volts) {
        return volts >= LEVEL_VOLTS[1] ? 3 : volts >= LEVEL_VOLTS[0] ? 2 : 1;
    }

    function countElements(log) {
        return log.split('').reduce(function (sum, level) { return sum + +level; }, 0);
    }

    // Same model as the ESP32, with a slider instead of real potatoes
    function simulate() {
        var NAMES = ['', 'text', 'images', 'sound'];
        var sim = { potatoes: 0, charge: 0, log: (params.get('log') || '').replace(/[^123]/g, ''), crashUntil: 0 };
        if (countElements(sim.log) >= CRASH.elements) sim.crashUntil = Date.now() + CRASH.seconds * 1000;

        var panel = document.createElement('div');
        panel.className = 'sim';
        panel.innerHTML = '<strong>SIMULATION</strong>'
            + '<label>Potatoes: <b class="sim-n">0</b><input type="range" min="0" max="40" value="0"></label>'
            + '<div class="sim-out"></div>'
            + '<button type="button" data-do="attack">Attack</button>'
            + '<button type="button" data-do="reset">Reset</button>';
        document.body.appendChild(panel);

        var out = panel.querySelector('.sim-out');
        panel.querySelector('input').oninput = function () {
            sim.potatoes = +this.value;
            panel.querySelector('.sim-n').textContent = this.value;
        };
        panel.onclick = function (e) {
            var action = e.target.getAttribute('data-do');
            if (action === 'attack' && !sim.crashUntil) discharge();
            if (action === 'reset') {
                sim.log = '';
                sim.crashUntil = 0;
            }
        };

        function discharge() {
            sim.charge = 0;
            sim.log += levelFor(sim.potatoes * CAP.voltsPerPotato);
            if (countElements(sim.log) >= CRASH.elements) sim.crashUntil = Date.now() + CRASH.seconds * 1000;
        }

        setInterval(function () {
            var volts = sim.potatoes * CAP.voltsPerPotato;
            var power = volts * volts / CAP.resistance;
            var net = power - CAP.leak;

            if (sim.crashUntil && Date.now() > sim.crashUntil) {
                sim.log = '';
                sim.crashUntil = 0;
            }
            if (!sim.crashUntil) {
                sim.charge = Math.max(0, sim.charge + net * 0.1);
                if (sim.charge >= CAP.threshold) discharge();
            }

            out.textContent = volts.toFixed(1) + ' V · level: ' + NAMES[levelFor(volts)]
                + ' · elements: ' + countElements(sim.log) + '/' + CRASH.elements
                + (sim.crashUntil ? ' · CRASHED'
                    : net > 0 ? ' · next in ' + Math.ceil((CAP.threshold - sim.charge) / net) + ' s' : ' · no attack');
            update({ charge: sim.charge / CAP.threshold, log: sim.log, crash: !!sim.crashUntil });
        }, 100);
    }

    targets = shuffle(Array.prototype.slice.call(document.querySelectorAll(TARGETS)), rng(1));
    photos = Array.prototype.slice.call(document.querySelectorAll('.photo img'));
    bar = document.createElement('div');
    bar.id = 'charge';
    document.body.appendChild(bar);
    layer = document.createElement('div');
    layer.id = 'layer';
    document.body.appendChild(layer);
    ['click', 'touchend', 'keydown'].forEach(function (type) {
        document.addEventListener(type, unlockAudio);
    });

    if (SIM) simulate(); else poll();
})();
