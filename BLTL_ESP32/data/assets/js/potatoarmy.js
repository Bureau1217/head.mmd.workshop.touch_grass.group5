/* BLTL — the potato army. Only the animation: deface.js tells it what to do.
     potatoArmy.setCount(n)       n potatoes on screen = n potatoes in the chain
     potatoArmy.attack(el, hit)   a potato rises, charges at el, then calls hit()
   Needs matter.min.js (physics) loaded before. */
(() => {
  const { Engine, Render, Runner, Bodies, Body, Composite } = Matter;

  // ---------- settings ----------
  const SKINS = ['assets/images/potato1.png', 'assets/images/potato2.png', 'assets/images/potato3.png'];
  const POTATO_WIDTH = 200;   // on screen, the height follows the PNG
  const MAX_POTATOES = 40;   // more would slow the page down
  const RISE_HEIGHT = 220;   // how high the attacker rises before charging

  // ---------- physics world ----------
  const W = innerWidth, H = innerHeight;
  const engine = Engine.create();
  const render = Render.create({
    element: document.body, engine,
    options: { width: W, height: H, wireframes: false, background: 'transparent' }
  });
  Object.assign(render.canvas.style, {
    position: 'fixed', inset: 0, zIndex: 60, pointerEvents: 'none'
  });
  Render.run(render);
  Runner.run(Runner.create(), engine);

  // Floor and side walls (the top is open so potatoes can fall in)
  const wall = { isStatic: true, render: { visible: false } };
  Composite.add(engine.world, [
    Bodies.rectangle(W / 2, H + 25, W, 50, wall),
    Bodies.rectangle(-25, H / 2, 50, H * 2, wall),
    Bodies.rectangle(W + 25, H / 2, 50, H * 2, wall)
  ]);

  // ---------- skins: each PNG in RED_STEPS + 1 shades of red ----------
  // Drawn once at screen size and given straight to Matter (render.textures),
  // so nothing is resized or re-encoded while the animation runs.
  const skins = [];   // { height, textures: ['potato1.png#0', … '#8'] }

  async function loadSkin(src) {
    const img = new Image();
    img.src = src;
    await img.decode();
    const height = Math.round(POTATO_WIDTH * img.height / img.width);
    const textures = [];

    const canvas = document.createElement('canvas');
    canvas.width = POTATO_WIDTH;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, POTATO_WIDTH, height);
    render.textures[src + '#0'] = canvas;
    textures.push(src + '#0');

    skins.push({ height, textures });
  }

  const ready = Promise.all(SKINS.map(loadSkin))
    .catch(() => console.error('Potato army: missing PNG in ' + SKINS.join(', ')));

  // ---------- potatoes ----------
  const potatoes = [];

  function addPotato() {
    const skin = skins[Math.floor(Math.random() * skins.length)];
    const x = POTATO_WIDTH + Math.random() * (W - 2 * POTATO_WIDTH);
    const potato = Bodies.rectangle(x, -skin.height, POTATO_WIDTH, skin.height, {
      chamfer: { radius: Math.min(POTATO_WIDTH, skin.height) * 0.45, quality: 3 },   // rounded corners
      restitution: 0.3, friction: 0.6, density: 0.002,
      render: { sprite: { texture: skin.textures[0], xScale: 1, yScale: 1 } }
    });
    potato.skin = skin;
    Body.setAngle(potato, Math.random() * Math.PI);
    Body.setAngularVelocity(potato, (Math.random() - 0.5) * 0.2);
    Composite.add(engine.world, potato);
    potatoes.push(potato);
  }

  function removePotato() {
    Composite.remove(engine.world, potatoes.pop());
  }

  // Add or remove potatoes until there are n on screen
  async function setCount(n) {
    await ready;
    if (!skins.length) return;
    n = Math.min(n, MAX_POTATOES);
    while (potatoes.length < n) addPotato();
    while (potatoes.length > n) removePotato();
  }

  // ---------- animation helpers ----------
  // Calls step(k) every frame with k going from 0 to 1 in ms milliseconds
  function animate(ms, step) {
    return new Promise(done => {
      const start = performance.now();
      function frame(now) {
        const k = Math.min((now - start) / ms, 1);
        step(k);
        if (k < 1) requestAnimationFrame(frame);
        else done();
      }
      requestAnimationFrame(frame);
    });
  }

  const smooth = k => k * k * (3 - 2 * k);   // slow start, slow end
  const faster = k => k * k;                 // speeds up

  // ---------- the attack ----------
  let turn = 0;   // whose turn it is to fight

  // The potatoes take turns; one already fighting is skipped
  function nextFighter() {
    for (let i = 0; i < potatoes.length; i++) {
      const potato = potatoes[turn % potatoes.length];
      turn++;
      if (!potato.fighting) return potato;
    }
    return null;   // all are fighting (or no potatoes)
  }

  async function attack(target, hit) {
    const potato = nextFighter();
    // No potato free to fight: the attack happens without animation
    if (!potato) return hit();
    potato.fighting = true;

    // Take it out of the physics while we move it by hand
    Body.setStatic(potato, true);
    potato.isSensor = true;
    const start = { x: potato.position.x, y: potato.position.y };
    const top = { x: start.x, y: start.y - RISE_HEIGHT };

    // 1. rise slowly, wobbling and turning red
    await animate(500, k => {
      Body.setPosition(potato, {
        x: start.x + Math.sin(k * 20) * 4,
        y: start.y - RISE_HEIGHT * smooth(k)
      });
      Body.setAngle(potato, Math.sin(k * 10) * 0.2);
    });

    // 2. charge at the target
    const box = target.getBoundingClientRect();
    const goal = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    await animate(350, k => {
      Body.setPosition(potato, {
        x: top.x + (goal.x - top.x) * faster(k),
        y: top.y + (goal.y - top.y) * faster(k)
      });
    });

    // 3. hit
    hit();

    // 4. back into the physics: tumble into the pile and calm down
    Body.setStatic(potato, false);
    potato.isSensor = false;
    Body.setVelocity(potato, { x: (Math.random() - 0.5) * 8, y: -6 });
    Body.setAngularVelocity(potato, 0.3);
    potato.fighting = false;
  }

  window.potatoArmy = { setCount, attack };
})();
