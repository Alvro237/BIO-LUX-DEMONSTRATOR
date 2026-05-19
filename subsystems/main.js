/* ============================================================
   BIO-LUX · MISE UC3M
   main.js — Phases 1-5 (GLB CubeSat integration)
   - i18n EN/ES with localStorage
   - procedural starfield backdrop
   - Three.js GLB CubeSat (Draco-compressed) — drag to rotate
   - GSAP hero entrance + ScrollTrigger reveals
     (hero, problem, solution, spacecraft, phases, numbers, ...)
   ============================================================ */

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";

/* Apply the .js class to <html> as early as possible so the CSS
   can hide elements that will be animated in, avoiding FOUC. */
document.documentElement.classList.add("js");

/* ------------------------------------------------------------
   1. i18n
   ------------------------------------------------------------ */
const I18N_KEY = "biolux.lang";
const DEFAULT_LANG = "en";
let dictionary = null;
let currentLang = DEFAULT_LANG;

// Resolve i18n.json relative to main.js so subpages (e.g. /subsystems/ttc.html)
// fetch the same dictionary as the home page. In ES modules, import.meta.url
// is the canonical reference to "this file".
const I18N_URL = new URL("i18n.json", import.meta.url).href;

async function loadDictionary() {
  try {
    const res = await fetch(I18N_URL, { cache: "no-cache" });
    if (!res.ok) throw new Error(`i18n.json HTTP ${res.status}`);
    dictionary = await res.json();
  } catch (err) {
    console.error("[BIO-LUX] Failed to load i18n.json:", err);
    dictionary = { en: {}, es: {} };
  }
}

function resolvePath(obj, path) {
  return path.split(".").reduce((acc, k) => (acc != null ? acc[k] : undefined), obj);
}

function applyLang(lang) {
  if (!dictionary || !dictionary[lang]) return;
  currentLang = lang;
  document.documentElement.lang = lang;

  // text nodes
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    // Skip counters that are currently animating to avoid clobbering them
    if (el.dataset.counting === "true") return;
    const key = el.getAttribute("data-i18n");
    const val = resolvePath(dictionary[lang], key);
    if (val !== undefined) el.textContent = val;
  });

  // attribute targets, e.g. data-i18n-attr="title:hero.tag"
  document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    const spec = el.getAttribute("data-i18n-attr");
    spec.split(",").forEach((pair) => {
      const [attr, key] = pair.split(":").map((s) => s.trim());
      const val = resolvePath(dictionary[lang], key);
      if (val !== undefined && attr) el.setAttribute(attr, val);
    });
  });

  // <title> and meta description (per-page keys via data attributes on <html>)
  const titleKey = document.documentElement.dataset.metaTitleKey || "meta.title";
  const descKey  = document.documentElement.dataset.metaDescKey  || "meta.description";
  const metaTitle = resolvePath(dictionary[lang], titleKey);
  if (metaTitle) document.title = metaTitle;
  const metaDesc = resolvePath(dictionary[lang], descKey);
  if (metaDesc) {
    const mEl = document.querySelector('meta[name="description"]');
    if (mEl) mEl.setAttribute("content", metaDesc);
  }

  // update lang button to show the "other" language
  const langBtn = document.querySelector("[data-lang-toggle]");
  if (langBtn) {
    const labelEl = langBtn.querySelector("[data-lang-label]");
    if (labelEl) labelEl.textContent = lang === "en" ? "ES" : "EN";
    langBtn.setAttribute("aria-label", lang === "en" ? "Cambiar a español" : "Switch to English");
  }

  // remember
  try { localStorage.setItem(I18N_KEY, lang); } catch (_) {}
}

function detectInitialLang() {
  try {
    const saved = localStorage.getItem(I18N_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch (_) {}
  return DEFAULT_LANG;
}

function initLangToggle() {
  const btn = document.querySelector("[data-lang-toggle]");
  if (!btn) return;
  btn.addEventListener("click", () => {
    applyLang(currentLang === "en" ? "es" : "en");
  });
}

/* ------------------------------------------------------------
   2. STARFIELD (canvas backdrop)
   ------------------------------------------------------------ */
function initStarfield() {
  const cv = document.getElementById("starfield");
  if (!cv) return;
  const ctx = cv.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w = 0, h = 0, stars = [];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    cv.width = w * dpr;
    cv.height = h * dpr;
    cv.style.width = w + "px";
    cv.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const density = Math.floor((w * h) / 4500);
    stars = new Array(density).fill(0).map(() => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.2 + 0.2,
      a: Math.random() * 0.6 + 0.2,
      tw: Math.random() * 0.02 + 0.004, // twinkle speed
      ph: Math.random() * Math.PI * 2,
    }));
  }

  function frame(t) {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const alpha = reduce ? s.a : s.a * (0.7 + 0.3 * Math.sin(t * s.tw + s.ph));
      ctx.beginPath();
      ctx.fillStyle = `rgba(220, 230, 255, ${alpha.toFixed(3)})`;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (!reduce) requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resize, { passive: true });
  resize();
  if (reduce) {
    // draw once
    requestAnimationFrame(frame);
  } else {
    requestAnimationFrame(frame);
  }
}

/* ------------------------------------------------------------
   3. THREE.JS CUBESAT (GLB asset, Draco-compressed)
   ------------------------------------------------------------ */
function initCubeSat() {
  const mount = document.getElementById("cubesat-viewport");
  if (!mount) return null;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* Scene */
  const scene = new THREE.Scene();
  scene.background = null;

  /* Camera */
  const aspect = (mount.clientWidth / mount.clientHeight) || 1;
  const camera = new THREE.PerspectiveCamera(35, aspect, 0.01, 100);
  camera.position.set(2.2, 1.3, 2.6);
  camera.lookAt(0, 0, 0);

  /* Renderer */
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(mount.clientWidth, mount.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  mount.appendChild(renderer.domElement);

  /* Lights — warm key, cyan rim, magenta fill, soft ambient.
     Tuned for the procedural mock; we will re-balance in B-tune
     once the real model is on screen. */
  scene.add(new THREE.AmbientLight(0xffffff, 0.38));
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(5, 6, 4);
  scene.add(key);
  const cyanRim = new THREE.DirectionalLight(0x00e5ff, 0.85);
  cyanRim.position.set(-6, 2, -3);
  scene.add(cyanRim);
  const magentaRim = new THREE.DirectionalLight(0xff2ec2, 0.45);
  magentaRim.position.set(2, -5, -4);
  scene.add(magentaRim);

  /* Sat group: we apply rotation here so the auto-rotate, drag input
     and GSAP scroll triggers all operate on a single, stable handle
     regardless of the GLB\'s own pivot. */
  const sat = new THREE.Group();
  scene.add(sat);
  // Initial isometric tilt (preserved from the procedural pose so the
  // GSAP "presentation" rotation in initScrollTriggers still lands right).
  sat.rotation.x = 0.18;
  sat.rotation.y = -0.5;

  /* GLB load with Draco decompression.
     The decoder is fetched from the same CDN as Three.js to keep
     versions in sync. dracoLoader.dispose() releases the worker
     once the model is decoded. */
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/draco/");

  const gltfLoader = new GLTFLoader();
  gltfLoader.setDRACOLoader(dracoLoader);

  // GLB lives under img/renders/ — resolved relative to main.js so it
  // works equally from /index.html and /subsystems/*.html.
  const GLB_URL = new URL("img/renders/cubesat.glb", import.meta.url).href;

  gltfLoader.load(
    GLB_URL,
    (gltf) => {
      const model = gltf.scene;

      // Auto-fit: normalise the model so its largest dimension spans
      // ~2 world units, and center its bounding box on the origin.
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetSize = 2.0;
      const scale = targetSize / maxDim;

      // Center geometry inside the model, then put it under a wrapper
      // that handles uniform scale so sat.rotation stays clean.
      model.position.sub(center);
      const wrapper = new THREE.Group();
      wrapper.add(model);
      wrapper.scale.setScalar(scale);
      sat.add(wrapper);

      // Worker no longer needed after the first decode.
      dracoLoader.dispose();
    },
    undefined,
    (err) => {
      console.error("[BIO-LUX] Failed to load CubeSat GLB:", err);
    }
  );

  /* Interaction: drag to rotate */
  let isDown = false, lastX = 0, lastY = 0;
  let autoRotate = true;

  const dom = renderer.domElement;
  function onDown(e) {
    isDown = true; autoRotate = false;
    const p = e.touches ? e.touches[0] : e;
    lastX = p.clientX; lastY = p.clientY;
  }
  function onMove(e) {
    if (!isDown) return;
    const p = e.touches ? e.touches[0] : e;
    const dx = p.clientX - lastX;
    const dy = p.clientY - lastY;
    sat.rotation.y += dx * 0.008;
    sat.rotation.x += dy * 0.006;
    sat.rotation.x = Math.max(-1.2, Math.min(1.2, sat.rotation.x));
    lastX = p.clientX; lastY = p.clientY;
  }
  function onUp() { isDown = false; }
  dom.addEventListener("mousedown", onDown);
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
  dom.addEventListener("touchstart", onDown, { passive: true });
  window.addEventListener("touchmove", onMove, { passive: true });
  window.addEventListener("touchend", onUp);

  /* Resize (also guards against zero-size mount at boot) */
  function onResize() {
    const w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return false;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    return true;
  }
  window.addEventListener("resize", onResize, { passive: true });
  if (!onResize()) {
    requestAnimationFrame(() => {
      if (!onResize()) requestAnimationFrame(onResize);
    });
  }
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => onResize());
    ro.observe(mount);
  }

  /* Animation loop */
  function loop() {
    if (autoRotate && !reduce) sat.rotation.y += 0.0035;
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();

  /* Public API consumed by GSAP ScrollTrigger hooks (unchanged) */
  return {
    sat,
    camera,
    setAutoRotate(v) { autoRotate = !!v; },
    reduce,
  };
}

/* ------------------------------------------------------------
   4. HERO ENTRANCE (page load)
   ------------------------------------------------------------ */
function initHeroEntrance() {
  if (typeof gsap === "undefined") return;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce) {
    gsap.set([
      ".hero__tag", ".hero__lede", ".hero__ctas .btn",
      ".hero__scroll-hint", ".hero__corner",
      ".hero__h1 .l1", ".hero__h1 .l2", ".hero__h1 .l3",
    ], { clearProps: "all", opacity: 1 });
    return;
  }

  const tl = gsap.timeline({ defaults: { ease: "power3.out" } });

  // 1. corner brackets snap into place
  tl.to(".hero__corner", {
    opacity: 0.5,
    duration: 0.6,
    stagger: 0.08,
    ease: "expo.out",
  }, 0);

  // 2. tag line above the title
  tl.to(".hero__tag", {
    opacity: 1,
    duration: 0.8,
  }, 0.15);

  // 3. headline reveals line by line (clip-path wipe)
  tl.to(".hero__h1 .l1", {
    opacity: 1,
    clipPath: "inset(0 0% 0 0)",
    duration: 1.1,
    ease: "expo.out",
  }, 0.35);
  tl.to(".hero__h1 .l2", {
    opacity: 1,
    clipPath: "inset(0 0% 0 0)",
    duration: 1.1,
    ease: "expo.out",
  }, 0.5);
  tl.to(".hero__h1 .l3", {
    opacity: 1,
    clipPath: "inset(0 0% 0 0)",
    duration: 1.3,
    ease: "expo.out",
  }, 0.65);

  // 4. lede fade up
  tl.to(".hero__lede", {
    opacity: 1,
    duration: 0.9,
  }, 1.1);

  // 5. CTAs stagger in
  tl.to(".hero__ctas .btn", {
    opacity: 1,
    duration: 0.7,
    stagger: 0.12,
  }, 1.3);

  // 6. scroll hint at the very end
  tl.to(".hero__scroll-hint", {
    opacity: 1,
    duration: 0.7,
  }, 1.7);

  // looping float of the scroll hint
  gsap.to(".hero__scroll-hint", {
    y: 8,
    duration: 1.6,
    ease: "sine.inOut",
    yoyo: true,
    repeat: -1,
    delay: 2.6,
  });
}

/* ------------------------------------------------------------
   5. SCROLL-TRIGGERED REVEALS (Phase 2)
   ------------------------------------------------------------ */
function initScrollTriggers(cubesatApi) {
  if (typeof gsap === "undefined") return;
  if (typeof ScrollTrigger === "undefined") return;
  gsap.registerPlugin(ScrollTrigger);

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    // clear all initial states; nothing animates
    gsap.set([
      ".problem .kicker", ".solution .kicker", ".spacecraft .kicker",
      ".problem .section-title", ".solution .section-title", ".spacecraft .section-title",
      ".spacecraft .section-lede",
      ".problem__text p", ".solution__intro p",
      ".payload", ".spacecraft__viewport", ".spec",
      ".phases .kicker", ".phases .section-title", ".phase",
      ".numbers .kicker", ".number",
      ".subsystems .kicker", ".subsystems .section-title", ".subsystems .section-lede", ".subsys",
      ".team .kicker", ".team .section-title", ".team .section-lede", ".member",
      ".footer__top", ".footer__bottom",
    ], { clearProps: "all", opacity: 1 });
    return;
  }

  /* ---------- PROBLEM ---------- */
  const tlProblem = gsap.timeline({
    scrollTrigger: {
      trigger: ".problem",
      start: "top 78%",
      toggleActions: "play none none none",
    },
    defaults: { ease: "power3.out" },
  });
  tlProblem
    .to(".problem .kicker", {
      opacity: 1, y: 0, duration: 0.7,
    }, 0)
    .to(".problem .section-title", {
      opacity: 1,
      clipPath: "inset(0 0% 0 0)",
      duration: 1.1,
      ease: "expo.out",
    }, 0.1)
    .to(".problem__text p", {
      opacity: 1, y: 0,
      duration: 0.8,
      stagger: 0.15,
    }, 0.5);

  /* ---------- SOLUTION ---------- */
  // Heading band
  const tlSolutionHead = gsap.timeline({
    scrollTrigger: {
      trigger: ".solution",
      start: "top 78%",
      toggleActions: "play none none none",
    },
    defaults: { ease: "power3.out" },
  });
  tlSolutionHead
    .to(".solution .kicker", {
      opacity: 1, y: 0, duration: 0.7,
    }, 0)
    .to(".solution .section-title", {
      opacity: 1,
      clipPath: "inset(0 0% 0 0)",
      duration: 1.1,
      ease: "expo.out",
    }, 0.1)
    .to(".solution__intro p", {
      opacity: 1, y: 0,
      duration: 0.8,
    }, 0.5);

  // Payload cards: separate trigger, stagger from below
  gsap.to(".payload", {
    opacity: 1,
    y: 0,
    duration: 0.85,
    stagger: 0.1,
    ease: "power3.out",
    scrollTrigger: {
      trigger: ".solution__payloads",
      start: "top 82%",
      toggleActions: "play none none none",
    },
  });

  /* ---------- SPACECRAFT ---------- */
  // Heading band
  const tlSpaceHead = gsap.timeline({
    scrollTrigger: {
      trigger: ".spacecraft",
      start: "top 75%",
      toggleActions: "play none none none",
    },
    defaults: { ease: "power3.out" },
  });
  tlSpaceHead
    .to(".spacecraft .kicker", {
      opacity: 1, y: 0, duration: 0.7,
    }, 0)
    .to(".spacecraft .section-title", {
      opacity: 1,
      clipPath: "inset(0 0% 0 0)",
      duration: 1.1,
      ease: "expo.out",
    }, 0.1)
    .to(".spacecraft .section-lede", {
      opacity: 1, y: 0,
      duration: 0.8,
    }, 0.5);

  // 3D viewport + spec cards (separate trigger so it fires when the
  // stage actually enters the screen, not when the heading does)
  const tlSpaceStage = gsap.timeline({
    scrollTrigger: {
      trigger: ".spacecraft__stage",
      start: "top 78%",
      toggleActions: "play none none none",
      onEnter: () => {
        // Bonus: when the stage appears, perform a one-time
        // "presentation" rotation of the CubeSat from a frontal
        // angle to its resting isometric pose.
        if (!cubesatApi || cubesatApi.reduce) return;
        cubesatApi.setAutoRotate(false);
        gsap.fromTo(cubesatApi.sat.rotation,
          { y: -Math.PI * 1.15 },
          {
            y: -0.5,
            duration: 2.2,
            ease: "expo.out",
            onComplete: () => cubesatApi.setAutoRotate(true),
          });
        gsap.fromTo(cubesatApi.sat.rotation,
          { x: 0.55 },
          { x: 0.18, duration: 2.2, ease: "expo.out" });
      },
    },
    defaults: { ease: "power3.out" },
  });
  tlSpaceStage
    .to(".spacecraft__viewport", {
      opacity: 1,
      scale: 1,
      duration: 1.2,
      ease: "expo.out",
    }, 0)
    .to(".spec", {
      opacity: 1,
      x: 0,
      duration: 0.7,
      stagger: 0.09,
      ease: "power3.out",
    }, 0.4);

  /* ---------- HERO PARALLAX & FADE-OUT ---------- */
  // The hero content drifts up slower than the scroll and dims as
  // the next section pushes it out. Pure cinematic feel.
  gsap.to(".hero__h1", {
    yPercent: -16,
    ease: "none",
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "bottom top",
      scrub: 0.5,
    },
  });
  gsap.to(".hero__lede, .hero__ctas, .hero__tag", {
    yPercent: -8,
    opacity: 0.2,
    ease: "none",
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "bottom 20%",
      scrub: 0.5,
    },
  });
  gsap.to(".hero__corner", {
    opacity: 0,
    ease: "none",
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "bottom 50%",
      scrub: true,
    },
  });

  /* ---------- PHASES ---------- */
  // Heading reveals on entry
  const tlPhasesHead = gsap.timeline({
    scrollTrigger: {
      trigger: ".phases",
      start: "top 78%",
      toggleActions: "play none none none",
    },
    defaults: { ease: "power3.out" },
  });
  tlPhasesHead
    .to(".phases .kicker", { opacity: 1, y: 0, duration: 0.7 }, 0)
    .to(".phases .section-title", {
      opacity: 1,
      clipPath: "inset(0 0% 0 0)",
      duration: 1.1,
      ease: "expo.out",
    }, 0.1);

  // 5 phase nodes stagger in
  gsap.to(".phase", {
    opacity: 1,
    y: 0,
    duration: 0.7,
    stagger: 0.12,
    ease: "power3.out",
    scrollTrigger: {
      trigger: ".phases__rail",
      start: "top 80%",
      toggleActions: "play none none none",
    },
  });

  // Progress line scrubs with scroll across the rail, and as it passes
  // each phase we add an `is-lit` class to fade the phase from dim to
  // bright and fill its dot.
  gsap.to(".phases__rail", {
    "--rail-progress": "92%",
    ease: "none",
    scrollTrigger: {
      trigger: ".phases__rail",
      start: "top 70%",
      end: "bottom 60%",
      scrub: 0.6,
      onUpdate: (self) => {
        const phases = document.querySelectorAll(".phase");
        const n = phases.length;
        if (!n) return;
        phases.forEach((p, i) => {
          // Position of phase i along the rail, normalised 0..1
          const threshold = n > 1 ? i / (n - 1) : 0;
          // Light up a tad before the bar mathematically reaches the dot
          // so the visual feels in sync rather than lagging.
          const lit = self.progress >= Math.max(0, threshold - 0.04);
          p.classList.toggle("is-lit", lit);
        });
      },
    },
  });

  /* ---------- KEY NUMBERS (counters from 0) ---------- */
  document.querySelectorAll(".number").forEach((card) => {
    const valueEl = card.querySelector(".number__value");
    if (!valueEl) return;
    const original = valueEl.textContent.trim();
    // Parse value respecting both EN ("8.113") and ES ("8,113") formats.
    // Heuristic: a single dot or comma followed by 1–3 digits → decimal.
    let cleaned = original.replace(/\s/g, "");
    let isDecimal = false;
    if (/^\d+[.,]\d{1,3}$/.test(cleaned)) {
      isDecimal = true;
      cleaned = cleaned.replace(",", ".");
    } else {
      cleaned = cleaned.replace(/[.,]/g, "");
    }
    // Guard: if the value is not a pure number (e.g. "500–700" range),
    // skip the counter animation but still fade-in the card so it appears.
    const isPureNumeric = /^\d+([.,]\d{1,3})?$/.test(cleaned);
    if (!isPureNumeric) {
      gsap.to(card, {
        opacity: 1, y: 0, duration: 0.8, ease: "power3.out",
        scrollTrigger: { trigger: card, start: "top 85%", toggleActions: "play none none none" },
      });
      return;
    }
    const target = parseFloat(cleaned);
    if (!isFinite(target)) return;
    const decimals = isDecimal ? (cleaned.split(".")[1] || "").length : 0;

    const counter = { v: 0 };
    valueEl.dataset.counting = "true";

    gsap.to(card, {
      opacity: 1,
      y: 0,
      duration: 0.8,
      ease: "power3.out",
      scrollTrigger: {
        trigger: card,
        start: "top 85%",
        toggleActions: "play none none none",
        onEnter: () => {
          gsap.to(counter, {
            v: target,
            duration: 1.6,
            ease: "power2.out",
            onUpdate: () => {
              let txt = counter.v.toFixed(decimals);
              if (currentLang === "es" && decimals > 0) {
                txt = txt.replace(".", ",");
              }
              valueEl.textContent = txt;
            },
            onComplete: () => {
              delete valueEl.dataset.counting;
              // Restore exact original formatting from i18n dictionary
              const key = valueEl.getAttribute("data-i18n");
              if (key && dictionary && dictionary[currentLang]) {
                const final = resolvePath(dictionary[currentLang], key);
                if (final !== undefined) valueEl.textContent = final;
              }
            },
          });
        },
      },
    });
  });

  // Numbers kicker
  gsap.to(".numbers .kicker", {
    opacity: 1, y: 0, duration: 0.7,
    ease: "power3.out",
    scrollTrigger: { trigger: ".numbers", start: "top 80%", toggleActions: "play none none none" },
  });

  /* ---------- SUBSYSTEMS ---------- */
  const tlSubsHead = gsap.timeline({
    scrollTrigger: {
      trigger: ".subsystems",
      start: "top 78%",
      toggleActions: "play none none none",
    },
    defaults: { ease: "power3.out" },
  });
  tlSubsHead
    .to(".subsystems .kicker", { opacity: 1, y: 0, duration: 0.7 }, 0)
    .to(".subsystems .section-title", {
      opacity: 1,
      clipPath: "inset(0 0% 0 0)",
      duration: 1.1,
      ease: "expo.out",
    }, 0.1)
    .to(".subsystems .section-lede", { opacity: 1, y: 0, duration: 0.8 }, 0.5);

  gsap.to(".subsys", {
    opacity: 1,
    y: 0,
    duration: 0.7,
    stagger: 0.07,
    ease: "power3.out",
    scrollTrigger: {
      trigger: ".subsys__grid",
      start: "top 82%",
      toggleActions: "play none none none",
    },
  });

  /* ---------- TEAM ---------- */
  const tlTeamHead = gsap.timeline({
    scrollTrigger: {
      trigger: ".team",
      start: "top 78%",
      toggleActions: "play none none none",
    },
    defaults: { ease: "power3.out" },
  });
  tlTeamHead
    .to(".team .kicker", { opacity: 1, y: 0, duration: 0.7 }, 0)
    .to(".team .section-title", {
      opacity: 1,
      clipPath: "inset(0 0% 0 0)",
      duration: 1.1,
      ease: "expo.out",
    }, 0.1)
    .to(".team .section-lede", { opacity: 1, y: 0, duration: 0.8 }, 0.5);

  // Photos rise like curtains with stagger
  gsap.to(".member", {
    opacity: 1,
    clipPath: "inset(0 0 0% 0)",
    duration: 1,
    stagger: 0.08,
    ease: "expo.out",
    scrollTrigger: {
      trigger: ".team__grid",
      start: "top 82%",
      toggleActions: "play none none none",
    },
  });

  /* ---------- MISSION REPORT ---------- */
  const tlReportHead = gsap.timeline({
    scrollTrigger: {
      trigger: ".report",
      start: "top 80%",
      toggleActions: "play none none none",
    },
    defaults: { ease: "power3.out" },
  });
  tlReportHead
    .to(".report .kicker",        { opacity: 1, y: 0, duration: 0.7 }, 0)
    .to(".report .section-title", { opacity: 1, y: 0, duration: 0.9 }, 0.1)
    .to(".report .section-lede",  { opacity: 1, y: 0, duration: 0.8 }, 0.35)
    .to(".report__cta-wrap",      { opacity: 1, y: 0, duration: 0.9 }, 0.55);

  /* ---------- FOOTER ---------- */
  gsap.to(".footer__top", {
    opacity: 1, y: 0, duration: 0.9,
    ease: "power3.out",
    scrollTrigger: { trigger: ".footer", start: "top 90%", toggleActions: "play none none none" },
  });
  gsap.to(".footer__bottom", {
    opacity: 1, y: 0, duration: 0.9,
    ease: "power3.out",
    scrollTrigger: { trigger: ".footer", start: "top 80%", toggleActions: "play none none none" },
  });
}

/* ------------------------------------------------------------
   6. NAV SCROLL STATE
   ------------------------------------------------------------ */
function initNavState() {
  const nav = document.querySelector(".nav");
  if (!nav) return;
  const onScroll = () => {
    nav.classList.toggle("is-scrolled", window.scrollY > 24);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ------------------------------------------------------------
   6b. NAV ARIA-CURRENT
   Highlight the nav link matching the current page (a11y +
   CSS hook for an active state on subpages).
   ------------------------------------------------------------ */
function initNavCurrent() {
  const path = window.location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav__link").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!href || href.startsWith("#")) return;
    const file = href.split("/").pop();
    if (file === path) a.setAttribute("aria-current", "page");
  });
}

/* ------------------------------------------------------------
   7. BOOTSTRAP
   ------------------------------------------------------------ */
document.addEventListener("DOMContentLoaded", async () => {
  await loadDictionary();
  applyLang(detectInitialLang());
  initLangToggle();
  initNavState();
  initNavCurrent();
  initStarfield();
  const cubesatApi = initCubeSat();
  initHeroEntrance();
  initScrollTriggers(cubesatApi);
});
