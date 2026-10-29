/* BLTL — defacement.
   4 times a second, asks the ESP32 for its state (/state):
     { "charge": 0…1, "log": "1123", "potatoes": 12, "plugged": true, ... }
   - plugged:  goes from false to true → flash
   - charge:   the charge bar at the bottom of the page
   - log:      one digit per attack = its level (1, 2 or 3)
       log gets longer  → attack
       log gets shorter → repair (the company undoes the last attack)
   - potatoes: goes up → potatoAdded() */
(function () {
    var MESSAGES = window.BLTL_MESSAGES;

    // Attack number at which each stage starts (classes deface-1 … deface-4 on <html>)
    var STAGES = [1, 5, 9, 13];

    // Elements whose text gets replaced, one per attack, in page order
    var targets = document.querySelectorAll('h1, h2, h4, .hero p, .card p, .about p, .markets li, .btn, .phone a, .footer address');
    var photos = document.querySelectorAll('.photo img');

    var attacks = [];       // one list of undo steps per attack on the page
    var lastPotatoes = 0;
    var wasPlugged = true;  // no flash when the page opens

    // Graffiti and posters go in this layer over the whole page
    var layer = document.createElement('div');
    layer.id = 'layer';
    document.body.appendChild(layer);

    // Charge bar at the bottom of the page
    var gauge = document.createElement('div');
    gauge.id = 'gauge';
    gauge.innerHTML = '<div></div>';
    document.body.appendChild(gauge);

    // ---------- helpers ----------

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

    // Drop an element somewhere on the page, rotated
    function place(el) {
        el.style.left = between(0, 80) + '%';
        el.style.top = between(0, 95) + '%';
        el.style.transform = 'rotate(' + between(-15, 15) + 'deg)';
        layer.appendChild(el);
    }

    // ---------- effects (each one returns how to undo it) ----------

    function replaceText(el) {
        var oldHtml = el.innerHTML;
        if (el.matches('h1, h2')) headline(el, random(MESSAGES.headlines));
        else if (el.matches('p, address')) el.textContent = random(MESSAGES.paragraphs);
        else el.textContent = random(MESSAGES.short);
        el.classList.add('hacked');
        return function () {
            el.innerHTML = oldHtml;
            el.classList.remove('hacked');
        };
    }

    function graffiti() {
        var el = document.createElement('span');
        el.className = 'tag';
        el.textContent = random(MESSAGES.tags);
        el.style.fontSize = between(8, 20) + 'rem';
        place(el);
        return function () { el.remove(); };
    }

    function poster() {
        var img = document.createElement('img');
        img.className = 'poster';
        img.src = 'assets/images/' + random(MESSAGES.posters);
        img.alt = '';
        img.style.width = between(28, 56) + '%';
        place(img);
        return function () { img.remove(); };
    }

    function swapPhoto() {
        var img = random(photos);
        var oldSrc = img.src;
        img.src = 'assets/images/' + random(MESSAGES.photos);
        return function () { img.src = oldSrc; };
    }

    // Last stage: the potatoes take over the logo and add their manifesto
    function takeover() {
        var logoTag = document.querySelector('.logo_tag');
        var oldTag = logoTag.textContent;
        logoTag.textContent = MESSAGES.logoTag;
        var section = document.createElement('section');
        section.className = 'manifesto';
        section.innerHTML = '<div class="inner"><h2></h2><p></p></div>';
        headline(section.querySelector('h2'), MESSAGES.manifesto.title);
        section.querySelector('p').textContent = MESSAGES.manifesto.text;
        document.querySelector('.header').after(section);
        return function () {
            logoTag.textContent = oldTag;
            section.remove();
        };
    }

    function setStages(n) {
        STAGES.forEach(function (start, i) {
            document.documentElement.classList.toggle('deface-' + (i + 1), n >= start);
        });
    }

    function flash() {
        document.body.classList.add('flash');
        setTimeout(function () { document.body.classList.remove('flash'); }, 150);
    }

    // ---------- events from the ESP32 ----------

    // level = 1, 2 or 3
    function attack(level) {
        var n = attacks.length + 1;    // attack number (1, 2, 3…)
        var undo = [];

        if (n <= targets.length) undo.push(replaceText(targets[n - 1]));
        undo.push(graffiti());

        if (level >= 2) {
            undo.push(poster());
            undo.push(swapPhoto());
        }

        if (n === STAGES[3]) undo.push(takeover());

        attacks.push(undo);
        setStages(n);
    }

    // The company undoes the last attack
    function repair() {
        var undo = attacks.pop();
        undo.forEach(function (step) { step(); });
        setStages(attacks.length);
    }

    function potatoAdded(count) {
        // TODO: feedback when a potato is added
        console.log('Potato added: ' + count);
    }

    function update(state) {
        var log = state.log || '';

        while (attacks.length < log.length) attack(Number(log[attacks.length]));
        while (attacks.length > log.length) repair();

        if (state.plugged && !wasPlugged) flash();
        wasPlugged = state.plugged;

        gauge.firstChild.style.width = (state.charge * 100) + '%';

        if (state.potatoes > lastPotatoes) potatoAdded(state.potatoes);
        lastPotatoes = state.potatoes;
    }

    function poll() {
        fetch('/state', { cache: 'no-store' })
            .then(function (res) { return res.json(); })
            .then(update)
            .catch(function () {})
            .then(function () { setTimeout(poll, 250); });
    }

    poll();
})();
