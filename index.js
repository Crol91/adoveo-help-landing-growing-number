(() => {
  "use strict";

  const root = document.documentElement;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  root.classList.add("js");

  /* ------------------------------------------------------------------------
     Element
     --------------------------------------------------------------------- */

  const hero = document.querySelector(".hero");
  const card = document.querySelector(".hero-card");
  const scene = document.getElementById("scene");
  const hotspots = Array.from(document.querySelectorAll(".hotspot"));
  const outcome = document.getElementById("outcome");
  const outcomeInner = document.getElementById("outcome-inner");
  const cta = document.getElementById("cta");

  const px = (value) => parseFloat(value) || 0;

  /* ------------------------------------------------------------------------
     Bekräftelse + CTA
     --------------------------------------------------------------------- */

  const showOutcome = () => {
    if (outcome.classList.contains("is-visible")) return;

    outcome.classList.add("is-visible");
    outcome.setAttribute("aria-hidden", "false");
    cta.removeAttribute("tabindex");
    if (prefersReducedMotion) outcome.classList.add("is-open");
  };

  // När utfällningen är klar: låt knappens skugga/puls synas utanför ytan
  outcome.addEventListener("transitionend", (event) => {
    if (event.target !== outcome || event.propertyName !== "grid-template-rows") return;
    outcome.classList.toggle("is-open", outcome.classList.contains("is-visible"));
  });

  /* ------------------------------------------------------------------------
     Hotspots
     --------------------------------------------------------------------- */

  const flash = (hotspot) => {
    if (prefersReducedMotion) return;
    const el = document.createElement("span");
    el.className = "flash";
    hotspot.appendChild(el);
    el.addEventListener("animationend", () => el.remove(), { once: true });
  };

  const activate = (hotspot) => {
    if (hotspot.classList.contains("is-active")) return;

    hotspot.classList.add("is-active");
    hotspot.setAttribute("aria-pressed", "true");

    // Tänd motsvarande del av huset (fönster, tak, garage/postlåda)
    scene.classList.add(`is-${hotspot.dataset.key}`);
    if (hotspots.every((h) => h.classList.contains("is-active"))) {
      scene.classList.add("is-complete");
    }

    flash(hotspot);
    showOutcome();
  };

  hotspots.forEach((hotspot) => hotspot.addEventListener("click", () => activate(hotspot)));

  /* ------------------------------------------------------------------------
     Förankring – kortets överkant ligger still så att det växer nedåt
     --------------------------------------------------------------------- */

  const anchorCard = ({ animate = false } = {}) => {
    const heroStyle = getComputedStyle(hero);
    const cardStyle = getComputedStyle(card);
    const outcomeStyle = getComputedStyle(outcome);

    const available = hero.clientHeight - px(heroStyle.paddingTop) - px(heroStyle.paddingBottom);
    const gap = px(cardStyle.rowGap);

    // Kortets höjd utan utfällt innehåll, och med bekräftelse + CTA utfällda
    const outcomeShare = outcome.offsetHeight + gap + px(outcomeStyle.marginTop);
    const base = card.offsetHeight - outcomeShare;
    const expanded = base + gap + outcomeInner.scrollHeight;

    // Centrera det ihopfällda kortet, men aldrig så lågt att det utfällda inte ryms
    const top = Math.max(0, Math.min((available - base) / 2, available - expanded));

    if (!animate) card.style.transition = "none";
    hero.style.setProperty("--card-top", `${Math.round(top)}px`);
    hero.classList.add("is-anchored");
    if (!animate) {
      void card.offsetWidth;
      card.style.transition = "";
    }
  };

  anchorCard();

  let resizeTimer = 0;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => anchorCard({ animate: true }), 150);
  });

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => anchorCard({ animate: true }));
  }

  /* ------------------------------------------------------------------------
     Intro-animation
     --------------------------------------------------------------------- */

  const revealTargets = [".hero-card", ".hero-card__title", ".scene"]
    .map((selector) => document.querySelector(selector))
    .filter(Boolean);

  revealTargets.forEach((el, i) => {
    el.classList.add("reveal");
    el.style.setProperty("--delay", `${i * 110}ms`);

    const cleanup = (event) => {
      if (event.target !== el || event.propertyName !== "opacity") return;
      el.classList.remove("reveal", "is-visible");
      el.style.removeProperty("--delay");
      el.removeEventListener("transitionend", cleanup);
    };
    el.addEventListener("transitionend", cleanup);
  });

  // Starta när bakgrundsbilden laddats (max 600 ms väntan)
  let started = false;
  const startOnce = () => {
    if (started) return;
    started = true;
    requestAnimationFrame(() => {
      revealTargets.forEach((el) => el.classList.add("is-visible"));
    });
  };

  const bg = new Image();
  bg.addEventListener("load", startOnce);
  bg.addEventListener("error", startOnce);
  bg.src = "images/hero-bg.png";
  setTimeout(startOnce, 600);

  /* ------------------------------------------------------------------------
     CTA – ripple vid klick
     --------------------------------------------------------------------- */

  cta.addEventListener("pointerdown", (event) => {
    if (prefersReducedMotion) return;

    const rect = cta.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = document.createElement("span");

    ripple.className = "ripple";
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${event.clientX - rect.left - size / 2}px`;
    ripple.style.top = `${event.clientY - rect.top - size / 2}px`;

    cta.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
  });
})();
