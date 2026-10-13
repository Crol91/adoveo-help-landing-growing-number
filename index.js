(() => {
  "use strict";

  /* ------------------------------------------------------------------------
     Konfiguration
     --------------------------------------------------------------------- */

  const HOURLY_RATE = 2500; // kr/h – ungefärligt arvode hos en jurist

  // Uppskattat antal juristtimmar per situation (illustrativt – stäm av med HELP)
  // plan = vilken betalplan som markeras "Rekommenderas för dig"
  const SITUATIONS = {
    separation: { hours: 10, plan: "familj" }, // bodelning, vårdnad, avtal
    huskop: { hours: 8, plan: "trygg" }, // t.ex. tvist om dolda fel
    arv: { hours: 6, plan: "trygg" }, // bouppteckning, arvskifte
  };

  // Betalplaner. OBS: PLATSHÅLLARE – HELP har inga publika privatplaner i dag
  // (försäkringen säljs via samarbetspartners, ca 35–49 kr/mån). Namn, priser och
  // innehåll måste tas fram tillsammans med HELP innan lansering.
  const PLANS = [
    { id: "radgivning", name: "Rådgivning", price: 49, desc: "Obegränsad juridisk rådgivning och digitala avtal." },
    { id: "trygg", name: "Trygg", price: 79, desc: "Rådgivning plus juristhjälp om det blir tvist." },
    { id: "familj", name: "Familj", price: 119, desc: "Allt i Trygg för hela hushållet – partner och barn." },
  ];
  const DEFAULT_PLAN = "trygg";

  // HELP:s månadspris. null = visa "fast månadsavgift" i stället för ett belopp.
  const MONTHLY_PRICE = null;

  // Vart formulärets uppgifter skickas (POST, JSON). null = prototypläge: inget skickas.
  const LEAD_ENDPOINT = null;

  // Löftet i bekräftelsen – stäm av med HELP att säljorganisationen klarar det
  const CALLBACK_TIME = "inom en arbetsdag";

  const TICK_TIME = 9000; // ms tills klockan når situationens totalsumma
  const RAMP_UP = 1200; // ms – klockan accelererar mjukt i början

  // Summan växer fysiskt medan den tickar och når full storlek vid den dyraste
  // situationen (billigare situationer landar mindre). Startstorleken per
  // skärmstorlek styrs av --grow-from i style.css.
  const MAX_CAP = Math.max(...Object.values(SITUATIONS).map((s) => s.hours)) * HOURLY_RATE;

  const root = document.documentElement;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const format = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });

  root.classList.add("js");

  /* ------------------------------------------------------------------------
     Element
     --------------------------------------------------------------------- */

  const meter = document.getElementById("meter");
  const valueEl = document.getElementById("meter-value");
  const amountEl = valueEl.parentElement;
  const noteEl = document.getElementById("meter-note");
  const choices = Array.from(document.querySelectorAll(".choice"));
  const labelChoose = meter.querySelector(".meter__label--choose");
  const labelRun = meter.querySelector(".meter__label--run");
  const labelDone = meter.querySelector(".meter__label--done");
  const stopBtn = document.getElementById("stop");
  const restartBtn = document.getElementById("restart");
  const cta = document.getElementById("cta");
  const announce = document.getElementById("announce");

  const views = {
    meter: document.getElementById("view-meter"),
    plans: document.getElementById("view-plans"),
    lead: document.getElementById("lead"),
    sent: document.getElementById("view-sent"),
  };
  const form = views.lead;
  const backBtn = document.getElementById("lead-back");
  const leadTitle = document.getElementById("lead-title");
  const submitBtn = form.querySelector(".lead__submit");
  const submitText = form.querySelector(".lead__submit-text");
  const formError = document.getElementById("lead-error");
  const sentTitle = document.getElementById("sent-title");

  const plansList = document.getElementById("plans-list");
  const plansTitle = document.getElementById("plans-title");

  const state = {
    situation: "",
    plan: "",
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

  // Storlek på summan: 0 = startstorlek, 1 = full storlek. Ingen storleksanimation vid reducerad rörelse.
  const setGrow = (progress) => {
    if (prefersReducedMotion) return;
    amountEl.style.setProperty("--progress", progress.toFixed(3));
  };

  const growFor = (value) => Math.min(1, value / MAX_CAP);

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
    setGrow(growFor(state.amount));

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

    state.situation = button.dataset.situation;
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

    setGrow(0);
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
    setGrow(1); // 0 kr landar i full storlek

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
      const value = from * (1 - easeOutCubic(t));
      render(value);
      setGrow(growFor(value));
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
    state.plan = ""; // ny situation → ny rekommendation
    renderIdle();
    setGrow(1);
    setNote("&nbsp;");
    announce.textContent = "";

    if (fromKeyboard) focusSoon(choices[0]);
  };

  restartBtn.addEventListener("click", (event) => restart(event.detail === 0));

  /* ------------------------------------------------------------------------
     Steg 4: "Skaffa HELP" → formulär → bekräftelse (i samma panel)
     --------------------------------------------------------------------- */

  // Byt vy – panelens höjd glider mjukt till den nya vyns höjd
  const showView = (name) => {
    const from = meter.offsetHeight;

    meter.dataset.view = name; // styr bl.a. kompaktare stilar i style.css
    Object.entries(views).forEach(([key, view]) => {
      view.hidden = key !== name;
      view.classList.toggle("is-entering", key === name && !prefersReducedMotion);
    });

    const to = meter.offsetHeight;
    if (prefersReducedMotion || from === to) return;

    meter.style.overflow = "hidden";
    meter
      .animate([{ height: `${from}px` }, { height: `${to}px` }], {
        duration: 450,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      })
      .finished.then(() => {
        meter.style.overflow = "";
      });
  };

  Object.values(views).forEach((view) =>
    view.addEventListener("animationend", (event) => {
      if (event.target === view) view.classList.remove("is-entering");
    })
  );

  /* Betalplaner ----------------------------------------------------------- */

  const planById = (id) => PLANS.find((plan) => plan.id === id);
  const planLabel = (plan) => `${plan.name} · ${format.format(plan.price)} kr/mån`;

  // Rita upp planerna med den rekommenderade först förvald
  const renderPlans = () => {
    const recommended = SITUATIONS[state.situation]?.plan || DEFAULT_PLAN;
    if (!state.plan) state.plan = recommended;

    plansList.querySelectorAll(".plan").forEach((el) => el.remove());
    PLANS.forEach((plan) => {
      const isRecommended = plan.id === recommended;
      const label = document.createElement("label");
      label.className = `plan${isRecommended ? " plan--recommended" : ""}`;
      label.innerHTML = `
        <input class="plan__radio" type="radio" name="plan" value="${plan.id}" />
        ${isRecommended ? '<span class="plan__badge">Rekommenderas för dig</span>' : ""}
        <span class="plan__top">
          <span class="plan__name">${plan.name}</span>
          <span class="plan__price"><b>${format.format(plan.price)}</b> kr/mån</span>
        </span>
        <span class="plan__desc">${plan.desc}</span>`;
      const radio = label.querySelector("input");
      radio.checked = plan.id === state.plan;
      radio.addEventListener("change", () => {
        state.plan = plan.id;
        buzz(10);
      });
      plansList.append(label);
    });
  };

  const openPlans = () => {
    renderPlans();
    showView("plans");
    focusSoon(plansTitle);
  };

  const openForm = () => {
    document.getElementById("lead-plan").textContent = planLabel(planById(state.plan));
    showView("lead");
    // Rubriken får fokus (inte namnfältet) så att mobiltangentbordet inte hoppar upp direkt
    focusSoon(leadTitle);
  };

  cta.addEventListener("click", (event) => {
    event.preventDefault(); // utan JS fungerar länken som vanligt
    openPlans();
  });

  document.getElementById("plans-next").addEventListener("click", openForm);

  document.getElementById("plans-back").addEventListener("click", () => {
    showView("meter");
    focusSoon(cta);
  });

  backBtn.addEventListener("click", () => {
    showView("plans");
    focusSoon(plansTitle);
  });

  /* Validering ------------------------------------------------------------ */

  const fields = {
    name: {
      input: form.elements.name,
      valid: (input) => input.value.trim().length >= 2,
      message: "Skriv ditt namn.",
    },
    phone: {
      input: form.elements.phone,
      // Svenskt nummer: 07x-xxx xx xx, 08-xxx xx xx, +46 7x …
      valid: (input) => /^(\+46|0046|0)\d{6,10}$/.test(input.value.replace(/[\s\-()]/g, "")),
      message: "Skriv ett svenskt telefonnummer, t.ex. 070‑123 45 67.", // bryts inte mitt i numret
    },
    consent: {
      input: form.elements.consent,
      valid: (input) => input.checked,
      message: "Kryssa i rutan så att vi får ringa dig.",
    },
  };

  let triedSubmit = false;

  const validateField = ({ input, valid, message }) => {
    const ok = valid(input);
    input.setAttribute("aria-invalid", ok ? "false" : "true");
    document.getElementById(`${input.id}-error`).textContent = ok ? "" : message;
    return ok;
  };

  // Efter första försöket rättas felen medan man skriver
  Object.values(fields).forEach((field) => {
    const event = field.input.type === "checkbox" ? "change" : "input";
    field.input.addEventListener(event, () => {
      if (triedSubmit) validateField(field);
    });
  });

  /* Skicka ---------------------------------------------------------------- */

  const sendLead = async (lead) => {
    if (!LEAD_ENDPOINT) {
      // Prototypläge: låtsas skicka
      await new Promise((resolve) => setTimeout(resolve, 900));
      console.info("[HELP] Prototypläge – lead skickades inte (LEAD_ENDPOINT saknas):", lead);
      return;
    }
    const response = await fetch(LEAD_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(lead),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
  };

  const setLoading = (loading) => {
    submitBtn.classList.toggle("is-loading", loading);
    submitBtn.setAttribute("aria-disabled", loading ? "true" : "false");
    submitText.textContent = loading ? "Skickar …" : "Ring upp mig";
  };

  const showSent = (name, phone) => {
    const firstName = name.split(/\s+/)[0];
    document.getElementById("sent-name").textContent = firstName ? `, ${firstName}` : "";
    document.getElementById("sent-phone").textContent = phone;
    document.getElementById("sent-when").textContent = CALLBACK_TIME;
    document.getElementById("sent-plan").textContent = planById(state.plan).name;
    showView("sent");
    buzz([18, 60, 18]);
    focusSoon(sentTitle);
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (submitBtn.classList.contains("is-loading")) return;

    triedSubmit = true;
    formError.textContent = "";
    const results = Object.values(fields).map((field) => validateField(field));
    const firstInvalid = Object.values(fields).find((_, i) => !results[i]);
    if (firstInvalid) {
      firstInvalid.input.focus();
      return;
    }

    const name = fields.name.input.value.trim();
    const phone = fields.phone.input.value.trim();
    const consentText = form.querySelector(".consent span").textContent.trim().replace(/\s+/g, " ");

    setLoading(true);
    try {
      await sendLead({
        name,
        phone,
        situation: state.situation,
        plan: state.plan,
        consent: true,
        consentText,
        source: "juristens-klocka",
        sentAt: new Date().toISOString(),
      });
      showSent(name, phone);
    } catch (error) {
      formError.textContent = "Något gick fel när vi skulle skicka. Försök igen om en stund.";
    } finally {
      setLoading(false);
    }
  });

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
