/* BLTL — simulator. Pretends to be the ESP32 so you can test the site on your computer.
   Only runs when index.html is opened as a file, or with ?sim at the end of the address.
   Must be loaded before deface.js.

   Buttons: add / remove a potato, plug / unplug the chain, force an attack.
   Same capacitor as BLTL_ESP32.ino: keep the settings below the same. */
(function () {
    if (location.protocol !== 'file:' && !location.search.includes('sim')) return;

    // ---------- settings (same as BLTL_ESP32.ino) ----------
    var VOLTS_PER_POTATO = 0.9;
    var CAP_RESISTANCE = 5;
    var CAP_LEAK = 1;
    var CAP_THRESHOLD = 200;
    var LEVEL_VOLTS = [7.2, 13.5];
    var PLUGGED_VOLTS = 2.8;
    var REPAIR_MS = 20000;

    // ---------- state ----------
    var potatoes = 4;       // potatoes in the chain
    var connected = true;   // is the chain plugged in?
    var charge = 0;         // 0 … CAP_THRESHOLD
    var log = '';           // one digit per attack = its level
    var lastRepair = Date.now();

    function volts() {
        return connected ? potatoes * VOLTS_PER_POTATO : 0;
    }

    function levelFor(v) {
        return v >= LEVEL_VOLTS[1] ? 3 : v >= LEVEL_VOLTS[0] ? 2 : 1;
    }

    function attack() {
        charge = 0;
        log += levelFor(volts());
    }

    // 10 times a second, like updateCapacitor() on the ESP32
    setInterval(function () {
        var v = volts();
        charge = Math.max(0, charge + (v * v / CAP_RESISTANCE - CAP_LEAK) * 0.1);
        if (charge >= CAP_THRESHOLD) attack();

        // Unplugged: the company removes the last attack every REPAIR_MS
        if (v >= PLUGGED_VOLTS) {
            lastRepair = Date.now();
        } else if (log.length > 0 && Date.now() - lastRepair >= REPAIR_MS) {
            lastRepair = Date.now();
            log = log.slice(0, -1);
        }

        info.textContent = v.toFixed(1) + ' V | ' + potatoes + ' potatoes | capacitor '
            + Math.round(100 * charge / CAP_THRESHOLD) + '% | attacks ' + log.length;
    }, 100);

    // deface.js calls fetch('/state'): answer here instead of the ESP32
    window.fetch = function () {
        var v = volts();
        var state = {
            charge: charge / CAP_THRESHOLD,
            log: log,
            volts: v,
            potatoes: Math.round(v / VOLTS_PER_POTATO),
            plugged: v >= PLUGGED_VOLTS
        };
        return Promise.resolve({ json: function () { return state; } });
    };

    // ---------- buttons ----------
    var panel = document.createElement('div');
    panel.style.cssText = 'position:fixed; z-index:200; left:10px; bottom:10px; padding:10px;'
        + 'color:#000; font:12px;';
    panel.innerHTML = '<div></div><div></div>'
        + '<button data-do="add">+ potato</button> '
        + '<button data-do="remove">- potato</button> '
        + '<button data-do="plug">unplug</button> '
        + '<button data-do="attack">attack now</button>';
    document.body.appendChild(panel);
    var info = panel.children[1];

    panel.onclick = function (e) {
        var action = e.target.getAttribute('data-do');
        if (action === 'add') potatoes++;
        if (action === 'remove') potatoes = Math.max(0, potatoes - 1);
        if (action === 'attack') attack();
        if (action === 'plug') {
            connected = !connected;
            e.target.textContent = connected ? 'unplug' : 'plug';
        }
    };
})();
