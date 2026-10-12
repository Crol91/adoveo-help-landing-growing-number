(() => {
  "use strict";

  /* ------------------------------------------------------------------------
     Konfiguration
     --------------------------------------------------------------------- */

  const HOURLY_RATE = 2500; // kr/h – ungefärligt arvode hos en jurist

  // Uppskattat antal juristtimmar per situation (illustrativt – stäm av med HELP)
  const SITUATIONS = {
    separation: { hours: 10 }, // bodelning, vårdnad, avtal
    huskop: { hours: 8 }, // t.ex. tvist om dolda fel
    arv: { hours: 6 }, // bouppteckning, arvskifte
  };

  // HELP:s månadspris. null = visa "fast månadsavgift" i stället för ett belopp.
  const MONTHLY_PRICE = null;

  const TICK_TIME = 9000; // ms tills klockan når situationens totalsumma
  const RAMP_UP = 1200; // ms – klockan accelererar mjukt i början

  const root = document.documentElement;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const format = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

  root.classList.add("js");

  /* ------------------------------------------------------------------------
     Element
     --------------------------------------------------------------------- */

  const meter = document.getElementById("meter");
  const valueEl = document.getElementById("meter-value");
  const noteEl = document.getElementById("meter-note");
  const choices = Array.from(document.querySelectorAll(".choice"));
  const labelChoose = meter.querySelector(".meter__label--choose");
  const labelRun = meter.querySelector(".meter__label--run");
  const labelDone = meter.querySelector(".meter__label--done");
  const stopBtn = document.getElementById("stop");
  const restartBtn = document.getElementById("restart");
  const cta = document.getElementById("cta");
  const announce = document.getElementById("announce");

  const state = {
    amount: 0,
    cap: 0,
    perMs: 0,
    running: false,
    frame: 0,
    lastTime: 0,
    elapsed: 0,
  };

  /* ------------------------------------------------------------------------
     Hjälpfunktioner
     --------------------------------------------------------------------- */

  const render = (value) => {
    valueEl.textContent = format.format(Math.round(value));
  };

  // Byt fotnot med en kort toning
  const setNote = (html) => {
    if (prefersReducedMotion) {
      noteEl.innerHTML = html;
      return;
    }
    noteEl.classList.add("is-fading");
    setTimeout(() => {
      noteEl.innerHTML = html;
      noteEl.classList.remove("is-fading");
    }, 200);
  };

  // Gör ett element nåbart/onåbart för tangentbord och skärmläsare
  const setReachable = (el, reachable) => {
    if (reachable) {
      el.removeAttribute("tabindex");
      el.removeAttribute("aria-hidden");
    } else {
      el.setAttribute("tabindex", "-1");
      el.setAttribute("aria-hidden", "true");
    }
  };

  const focusSoon = (el) => requestAnimationFrame(() => el.focus({ preventScroll: true }));

  // Liten haptisk "klick"-känsla på mobiler som stödjer det
  const buzz = (pattern) => {
    if (!prefersReducedMotion && navigator.vibrate) navigator.vibrate(pattern);
  };

  // Vilande läge innan ett val: "? kr" – vad kommer det kosta?
  const renderIdle = () => {
    valueEl.textContent = "?";
  };

  /* ------------------------------------------------------------------------
     Steg 2: klockan tickar
     --------------------------------------------------------------------- */

  const step = (now) => {
    if (!state.running) return;

    // Max 100 ms per bildruta – om fliken varit dold fortsätter klockan där den var
    const dt = Math.min(now - state.lastTime, 100);
    state.lastTime = now;
    state.elapsed += dt;

    const ramp = Math.min(1, state.elapsed / RAMP_UP);
    state.amount = Math.min(state.cap, state.amount + dt * state.perMs * ramp);
    render(state.amount);

    if (state.amount >= state.cap) {
      state.running = false;
      meter.classList.add("is-capped");
      return;
    }
    state.frame = requestAnimationFrame(step);
  };

  const choose = (button, fromKeyboard) => {
    const situation = SITUATIONS[button.dataset.situation];
    if (!situation || meter.classList.contains("is-running")) return;

    state.cap = situation.hours * HOURLY_RATE;
    state.perMs = state.cap / TICK_TIME;
    state.amount = 0;
    state.elapsed = 0;

    meter.classList.add("is-running");
    labelChoose.setAttribute("aria-hidden", "true");
    labelRun.removeAttribute("aria-hidden");
    choices.forEach((choice) => setReachable(choice, false));
    setReachable(stopBtn, true);

    setNote(`ca ${situation.hours} h à ${format.format(HOURLY_RATE)} kr · snabbspolat`);
    if (fromKeyboard) focusSoon(stopBtn);

    if (prefersReducedMotion) {
      // Ingen tickande animation – visa totalsumman direkt
      state.amount = state.cap;
      render(state.amount);
      meter.classList.add("is-capped");
      return;
    }

    state.running = true;
    state.lastTime = performance.now();
    state.frame = requestAnimationFrame(step);
  };

  choices.forEach((button) => {
    // detail === 0 betyder att klicket kom från tangentbordet
    button.addEventListener("click", (event) => choose(button, event.detail === 0));
  });

  /* ------------------------------------------------------------------------
     Steg 3: stoppa → räkna ned till 0 kr i timkostnad → CTA
     --------------------------------------------------------------------- */

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const finish = (fromKeyboard) => {
    state.amount = 0;
    render(0);

    meter.classList.remove("is-stopped");
    meter.classList.add("is-done");
    labelRun.setAttribute("aria-hidden", "true");
    labelDone.removeAttribute("aria-hidden");
    setReachable(cta, true);
    setReachable(restartBtn, true);
    buzz([18, 60, 18]);

    const price =
      typeof MONTHLY_PRICE === "number"
        ? `från ${format.format(MONTHLY_PRICE)} kr/mån`
        : "fast månadsavgift";
    setNote(`<b>i timkostnad</b> · ${price}`);
    announce.textContent = `Med HELP: 0 kronor i timkostnad, ${price.replace("kr/mån", "kronor i månaden")}.`;

    if (fromKeyboard) focusSoon(cta);
  };

  const stop = (fromKeyboard) => {
    if (!meter.classList.contains("is-running")) return;

    state.running = false;
    cancelAnimationFrame(state.frame);
    meter.classList.remove("is-running");
    meter.classList.add("is-stopped");
    setReachable(stopBtn, false);
    setNote("&nbsp;");
    buzz(25);

    const from = state.amount;
    if (prefersReducedMotion || from < 1) {
      finish(fromKeyboard);
      return;
    }

    // Snabb nedräkning – längre ju högre summan hunnit bli
    const duration = Math.min(1400, Math.max(700, from / 12));
    const t0 = performance.now();

    const countdown = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      render(from * (1 - easeOutCubic(t)));
      if (t < 1) requestAnimationFrame(countdown);
      else finish(fromKeyboard);
    };
    requestAnimationFrame(countdown);
  };

  stopBtn.addEventListener("click", (event) => stop(event.detail === 0));

  /* ------------------------------------------------------------------------
     Prova en annan situation
     --------------------------------------------------------------------- */

  const restart = (fromKeyboard) => {
    meter.classList.remove("is-done", "is-stopped", "is-running", "is-capped");
    labelDone.setAttribute("aria-hidden", "true");
    labelRun.setAttribute("aria-hidden", "true");
    labelChoose.removeAttribute("aria-hidden");

    setReachable(cta, false);
    setReachable(restartBtn, false);
    choices.forEach((choice) => setReachable(choice, true));

    state.amount = 0;
    renderIdle();
    setNote("&nbsp;");
    announce.textContent = "";

    if (fromKeyboard) focusSoon(choices[0]);
  };

  restartBtn.addEventListener("click", (event) => restart(event.detail === 0));

  /* ------------------------------------------------------------------------
     Start: tona in panelen när bilden laddats
     --------------------------------------------------------------------- */

  renderIdle();

  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    requestAnimationFrame(() => meter.classList.add("is-in"));
  };

  const bg = new Image();
  bg.addEventListener("load", begin);
  bg.addEventListener("error", begin);
  bg.src = "images/hero-bg.jpg";
  setTimeout(begin, 700);
})();
