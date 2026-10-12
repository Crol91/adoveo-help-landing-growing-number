(() => {
  "use strict";

  /* ------------------------------------------------------------------------
     Konfiguration
     --------------------------------------------------------------------- */

  const HOURLY_RATE = 2500; // kr/h – ungefärligt arvode hos en jurist
  const SPEED = 120; // snabbspolning: 1 sekund på sidan = 2 minuter juristtid
  const CAP = 10000; // klockan stannar här och väntar på besökaren
  const START_DELAY = 900; // ms efter att panelen tonats in
  const RAMP_UP = 1200; // ms – klockan accelererar mjukt i början

  const KR_PER_MS = (HOURLY_RATE / 3600 / 1000) * SPEED;

  const root = document.documentElement;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const format = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

  root.classList.add("js");

  /* ------------------------------------------------------------------------
     Element
     --------------------------------------------------------------------- */

  const meter = document.getElementById("meter");
  const valueEl = document.getElementById("meter-value");
  const stopBtn = document.getElementById("stop");
  const cta = document.getElementById("cta");
  const announce = document.getElementById("announce");

  let amount = 0;
  let running = false;
  let frame = 0;
  let lastTime = 0;
  let elapsed = 0;

  const render = (value) => {
    valueEl.textContent = format.format(Math.round(value));
  };

  /* ------------------------------------------------------------------------
     Klockan tickar
     --------------------------------------------------------------------- */

  const step = (now) => {
    if (!running) return;

    // Max 100 ms per bildruta – om fliken varit dold fortsätter klockan där den var
    const dt = Math.min(now - lastTime, 100);
    lastTime = now;
    elapsed += dt;

    const ramp = Math.min(1, elapsed / RAMP_UP);
    amount = Math.min(CAP, amount + dt * KR_PER_MS * ramp);
    render(amount);

    if (amount >= CAP) {
      running = false;
      meter.classList.add("is-capped");
      return;
    }
    frame = requestAnimationFrame(step);
  };

  const start = () => {
    if (running || meter.classList.contains("is-stopped")) return;
    running = true;
    lastTime = performance.now();
    frame = requestAnimationFrame(step);
  };

  /* ------------------------------------------------------------------------
     Stoppa → räkna ned till 0 kr → visa CTA
     --------------------------------------------------------------------- */

  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

  const finish = (fromKeyboard) => {
    amount = 0;
    render(0);
    meter.classList.add("is-done");

    cta.removeAttribute("tabindex");
    cta.removeAttribute("aria-hidden");
    announce.textContent = "0 kronor. Med HELP – utan timkostnad.";

    if (fromKeyboard) cta.focus({ preventScroll: true });
  };

  const stop = (fromKeyboard) => {
    if (meter.classList.contains("is-stopped")) return;

    running = false;
    cancelAnimationFrame(frame);
    meter.classList.add("is-stopped");

    // Fokus får inte ligga kvar på en knapp som försvinner
    if (fromKeyboard) stopBtn.blur();

    const from = amount;
    if (prefersReducedMotion || from < 1) {
      finish(fromKeyboard);
      return;
    }

    // Snabb nedräkning – längre ju högre summan hunnit bli
    const duration = Math.min(1400, Math.max(700, from / 6));
    const t0 = performance.now();

    const countdown = (now) => {
      const t = Math.min(1, (now - t0) / duration);
      render(from * (1 - easeOutCubic(t)));
      if (t < 1) requestAnimationFrame(countdown);
      else finish(fromKeyboard);
    };
    requestAnimationFrame(countdown);
  };

  // detail === 0 betyder att klicket kom från tangentbordet
  stopBtn.addEventListener("click", (event) => stop(event.detail === 0));

  /* ------------------------------------------------------------------------
     Start: tona in panelen när bilden laddats, starta sedan klockan
     --------------------------------------------------------------------- */

  render(0);

  let started = false;
  const begin = () => {
    if (started) return;
    started = true;
    requestAnimationFrame(() => meter.classList.add("is-in"));
    setTimeout(start, prefersReducedMotion ? 0 : START_DELAY);
  };

  const bg = new Image();
  bg.addEventListener("load", begin);
  bg.addEventListener("error", begin);
  bg.src = "images/hero-bg.png";
  setTimeout(begin, 700);
})();
