/* BLTL — defacement.
   Asks the ESP32 for the potato charge (/state) every second.
   /state answers { "charge": 0…1, "log": "1123" } — one digit per attack = its level.
   Each new digit in the log = one attack on the page:
     level 1   text replaced + graffiti
     level 2   + poster pasted on top, corporate photo swapped
     level 3   + potato sticker + sound

   Without ESP32: open index.html as a file, or index.html?sim
   Replay a history: index.html?sim&log=1112223333 */
(function () {
    var M = window.BLTL_MESSAGES;
    var root = document.documentElement;
    var params = new URLSearchParams(location.search);
    var SIM = location.protocol === 'file:' || params.has('sim');

    // Keep in sync with the ESP32 firmware
    var CAP = { voltsPerPotato: 0.9, resistance: 10, leak: 1, threshold: 200 };
    var LEVEL_VOLTS = [7.2, 13.5];   // level 2 from 8 potatoes, level 3 from 15

    // Attack number at which each stage starts (classes deface-1 … deface-4 on <html>)
    var STAGES = [1, 5, 9, 13];

    // Elements whose text gets replaced, one per attack, in page order
    var targets = document.querySelectorAll('h1, h2, h4, .hero p, .card p, .about p, .markets li, .btn, .phone a, .footer address');
    var photos = document.querySelectorAll('.photo img');
    var audio = new Audio();
    var applied = 0;

    var bar = document.createElement('div');
    bar.id = 'charge';
    document.body.appendChild(bar);

    var layer = document.createElement('div');
    layer.id = 'layer';
    document.body.appendChild(layer);

    function random(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function between(min, max) {
        return min + Math.random() * (max - min);
    }

    // Title: first part highlighted
    function headline(el, msg) {
        el.innerHTML = '<span class="hl"></span> ';
        el.firstChild.textContent = msg[0];
        el.append(msg[1]);
    }

    function hack(el) {
        if (el.matches('h1, h2')) headline(el, random(M.headlines));
        else if (el.matches('p, address')) el.textContent = random(M.paragraphs);
        else el.textContent = random(M.short);
        el.classList.add('hacked');
    }

    // Drop an element somewhere on the page, rotated
    function place(el) {
        el.style.left = between(0, 80) + '%';
        el.style.top = between(0, 95) + '%';
        el.style.transform = 'rotate(' + between(-15, 15) + 'deg)';
        layer.appendChild(el);
    }

    function stick(cls, text, size) {
        var el = document.createElement('span');
        el.className = cls;
        el.textContent = text;
        el.style.fontSize = size + 'rem';
        place(el);
    }

    function paste(file) {
        var img = document.createElement('img');
        img.className = 'poster';
        img.src = 'assets/images/' + file;
        img.alt = '';
        img.style.width = between(28, 46) + '%';
        place(img);
    }

    // Last stage: the potatoes take over the logo and add their manifesto
    function takeover() {
        if (document.querySelector('.manifesto')) return;
        document.querySelector('.logo_tag').textContent = M.logoTag;
        var section = document.createElement('section');
        section.className = 'manifesto';
        section.innerHTML = '<div class="inner"><h2></h2><p></p></div>';
        headline(section.querySelector('h2'), M.manifesto.title);
        section.querySelector('p').textContent = M.manifesto.text;
        document.querySelector('.header').after(section);
    }

    // n = attack number (1, 2, 3…), live = false when replaying the log on load
    function attack(n, level, live) {
        if (n <= targets.length) hack(targets[n - 1]);
        stick('tag', random(M.tags), between(8, 20));

        if (level >= 2) {
            paste(random(M.posters));
            random(photos).src = 'assets/images/' + random(M.photos);
        }

        STAGES.forEach(function (start, i) {
            root.classList.toggle('deface-' + (i + 1), n >= start);
        });
        if (n >= STAGES[3]) takeover();
    }

    function update(state) {
        var log = state.log || '';
        bar.style.width = Math.min(state.charge, 1) * 100 + '%';

        // Shorter log = reset on the ESP32: back to the clean site
        if (log.length < applied) return location.reload();

        var first = applied === 0;
        while (applied < log.length) {
            applied++;
            attack(applied, +log[applied - 1], !first);
        }
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

    // Same capacitor as the ESP32, with a slider instead of real potatoes
    function simulate() {
        var potatoes = 0;
        var charge = 0;
        var log = (params.get('log') || '').replace(/[^123]/g, '');

        var panel = document.createElement('div');
        panel.className = 'sim';
        panel.innerHTML = '<strong>SIMULATION</strong>'
            + '<label>Potatoes: <b>0</b><input type="range" min="0" max="40" value="0"></label>'
            + '<div class="sim-out"></div>'
            + '<button type="button" data-do="attack">Attack</button>'
            + '<button type="button" data-do="reset">Reset</button>';
        document.body.appendChild(panel);

        var out = panel.querySelector('.sim-out');
        panel.querySelector('input').oninput = function () {
            potatoes = +this.value;
            panel.querySelector('b').textContent = this.value;
        };
        panel.onclick = function (e) {
            var action = e.target.getAttribute('data-do');
            if (action === 'attack') discharge();
            if (action === 'reset') log = '';
        };

        function discharge() {
            charge = 0;
            log += levelFor(potatoes * CAP.voltsPerPotato);
        }

        setInterval(function () {
            var volts = potatoes * CAP.voltsPerPotato;
            var net = volts * volts / CAP.resistance - CAP.leak;
            charge = Math.max(0, charge + net * 0.1);
            if (charge >= CAP.threshold) discharge();

            out.textContent = volts.toFixed(1) + ' V · level ' + levelFor(volts) + ' · attacks: ' + log.length
                + (net > 0 ? ' · next in ' + Math.ceil((CAP.threshold - charge) / net) + ' s' : ' · no attack');
            update({ charge: charge / CAP.threshold, log: log });
        }, 100);
    }

    // Browsers only allow sound after a tap: unlock the player on the first one
    document.addEventListener('click', function () {
        audio.src = 'assets/sounds/' + M.sounds[0];
        audio.muted = true;
        audio.play().then(function () {
            audio.pause();
            audio.muted = false;
        }).catch(function () {});
    }, { once: true });

    if (SIM) simulate(); else poll();
})();
