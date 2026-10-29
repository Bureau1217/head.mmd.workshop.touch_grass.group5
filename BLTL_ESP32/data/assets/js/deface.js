/* BLTL — defacement.
   4 times a second, asks the ESP32 for its state (/state):
     { "charge": 0…1, "log": "1123", "potatoes": 12, ... }
   - log:      one digit per attack = its level (1, 2 or 3)
       log gets longer  → attack: a potato of the army charges, then the page changes
       log gets shorter → repair (the company undoes the last attack)
   - potatoes: number of potatoes of the army on screen (potatoarmy.js) */
(function () {
    var MESSAGES = window.BLTL_MESSAGES;

    // Attack number at which each stage starts (classes deface-1 … deface-4 on <html>)
    var STAGES = [1, 5, 9, 13];

    // Elements whose text gets replaced, one per attack, in page order
    var targets = document.querySelectorAll('h1, h2, h4, .hero p, .card p, .about p, .markets li, .btn, .phone a, .footer address');
    var photos = document.querySelectorAll('.photo img');

    var attacks = [];          // one list of undo steps per attack on the page
    var pageOpened = false;    // false while the page replays the log on opening

    // Graffiti and posters go in this layer over the whole page
    var layer = document.createElement('div');
    layer.id = 'layer';
    document.body.appendChild(layer);

    // ---------- helpers ----------

    function random(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function between(min, max) {
        return min + Math.random() * (max - min);
    }

    // Title: first part highlighted
    function headline(el, msg) {
        el.innerHTML = '<mark class="hl"></mark> ';
        el.firstChild.textContent = msg[0];
        el.append(msg[1]);
    }

    // Drop an element somewhere on the page, rotated
    function place(el) {
        // make it inside the viewport, but not too close to the edges (so it doesn't get cut off)
        el.style.left = between(0, 90) + '%';
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
        el.style.fontSize = between(5, 10) + 'rem';
        place(el);
        return function () { el.remove(); };
    }

    function poster() {
        var img = document.createElement('img');
        img.className = 'poster';
        img.src = 'assets/images/' + random(MESSAGES.posters);
        img.alt = '';
        img.style.width = between(28, 45) + '%';
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

    // ---------- events from the ESP32 ----------

    // level = 1, 2 or 3
    function attack(level) {
        var n = attacks.length + 1;    // attack number (1, 2, 3…)
        var target = n <= targets.length ? targets[n - 1] : random(targets);
        var undo = [];
        attacks.push(undo);

        // What happens to the page when the potato hits
        function hit() {
            if (attacks.indexOf(undo) < 0) return;   // already repaired before the hit

            if (n <= targets.length) undo.push(replaceText(target));
            undo.push(graffiti());

            if (level >= 2) {
                undo.push(poster());
                undo.push(swapPhoto());
            }

            if (n === STAGES[3]) undo.push(takeover());
            setStages(n);
        }

        // Old attacks replayed when the page opens: no animation
        if (!pageOpened) return hit();

        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        potatoArmy.attack(target, hit);
    }

    // The company undoes the last attack
    function repair() {
        var undo = attacks.pop();
        undo.forEach(function (step) { step(); });
        setStages(attacks.length);
    }

    function update(state) {
        var log = state.log || '';

        while (attacks.length < log.length) attack(Number(log[attacks.length]));
        while (attacks.length > log.length) repair();

        potatoArmy.setCount(state.potatoes);
        pageOpened = true;
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
