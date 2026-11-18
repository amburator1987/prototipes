/*
 * Motion patterni iz Figme (HomeDiscovery / 1009:11386)
 * Jedan zajednički timeline: 6s, loop, ease-in-out.
 *
 *  igrač  → "breathe"  scale 1 → 0.982 → 1
 *  CTA    → "pulse"    scale 1 → 1.12  → 1
 *  karte  → "float"    translate(0,0) → (-5px,-5px) → (0,0)
 *  kocke  → "float"    translate(0,0) → (-4px,-5px) → (0,0)
 *  rulet  → "swing"    rotate 0 (hold do 6.67%) → -20° (41.67%), hold do 55%, → 0 (93.33%)
 */
(function () {
  const DURATION = 6000;
  const EASE = "ease-in-out";

  // Bazne (dizajnerske) transformacije — animacija se slaže preko njih.
  const BASE = {
    player: "matrix(-0.993043, 0.117753, 0.117753, 0.993043, 0, 0)",
    rulet: "matrix(0.87779, 0.479045, -0.479045, 0.87779, 0, 0)",
    kocke: "matrix(0.866025, 0.5, 0.5, -0.866025, 0, 0)",
  };

  const MOTIONS = [
    {
      sel: ".player",
      keyframes: [
        { offset: 0, transform: `${BASE.player} scale(1)`, easing: EASE },
        { offset: 0.5, transform: `${BASE.player} scale(0.982)`, easing: EASE },
        { offset: 1, transform: `${BASE.player} scale(1)` },
      ],
    },
    {
      sel: ".cta",
      keyframes: [
        { offset: 0, transform: "scale(1)", easing: EASE },
        { offset: 0.5, transform: "scale(1.12)", easing: EASE },
        { offset: 1, transform: "scale(1)" },
      ],
    },
    {
      sel: ".karte",
      keyframes: [
        { offset: 0, transform: "translate(0, 0)", easing: EASE },
        { offset: 0.5, transform: "translate(-5px, -5px)", easing: EASE },
        { offset: 1, transform: "translate(0, 0)" },
      ],
    },
    {
      sel: ".kocke",
      keyframes: [
        { offset: 0, transform: `translate(0, 0) ${BASE.kocke}`, easing: EASE },
        { offset: 0.5, transform: `translate(-4px, -5px) ${BASE.kocke}`, easing: EASE },
        { offset: 1, transform: `translate(0, 0) ${BASE.kocke}` },
      ],
    },
    {
      sel: ".rulet",
      keyframes: [
        { offset: 0, transform: `rotate(0deg) ${BASE.rulet}` },
        { offset: 0.06667, transform: `rotate(0deg) ${BASE.rulet}`, easing: EASE },
        { offset: 0.41667, transform: `rotate(-20deg) ${BASE.rulet}` },
        { offset: 0.55, transform: `rotate(-20deg) ${BASE.rulet}`, easing: EASE },
        { offset: 0.93333, transform: `rotate(0deg) ${BASE.rulet}` },
        { offset: 1, transform: `rotate(0deg) ${BASE.rulet}` },
      ],
    },
  ];

  function init(banner) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const anims = MOTIONS.flatMap(({ sel, keyframes }) =>
      [...banner.querySelectorAll(sel)].map((el) =>
        el.animate(keyframes, { duration: DURATION, iterations: Infinity })
      )
    );

    // Svi elementi dele isti timeline (kao Figma cohort) — pauza kad baner nije vidljiv.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([entry]) => {
        anims.forEach((a) => (entry.isIntersecting ? a.play() : a.pause()));
      }).observe(banner);
    }
  }

  document.querySelectorAll("[data-banner]").forEach(init);
})();
