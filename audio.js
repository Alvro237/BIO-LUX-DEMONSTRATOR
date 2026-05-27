/* ============================================================
   BIO-LUX · Background Soundtrack
   Persists playback across page navigations via localStorage.
   Cross-tab coordination via BroadcastChannel.
   Autoplay on first interaction on index.html only
   (mark <body data-audio-autoplay> to opt in).
   ============================================================ */

const AUDIO_SRC = '/docs/Soundtrack.mp4';
const STORE_KEY = 'biolux_audio';
const CHANNEL   = 'biolux_audio_bc';

/* ---------------------------------------------------------- */
/* Inject DOM                                                  */
/* ---------------------------------------------------------- */
function mount() {
  const audio     = document.createElement('audio');
  audio.id        = 'bg-audio';
  audio.loop      = true;
  audio.preload   = 'auto';
  audio.innerHTML = `<source src="${AUDIO_SRC}" type="audio/mp4">`;
  document.body.appendChild(audio);

  const btn = document.createElement('button');
  btn.id    = 'audio-toggle';
  btn.setAttribute('aria-label', 'Unmute soundtrack');
  btn.innerHTML = `
    <span class="audio-icon audio-icon--off" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
           viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="square">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <line x1="23" y1="9" x2="17" y2="15"/>
        <line x1="17" y1="9" x2="23" y2="15"/>
      </svg>
    </span>
    <span class="audio-icon audio-icon--on" aria-hidden="true">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"
           viewBox="0 0 24 24" fill="none" stroke="currentColor"
           stroke-width="2" stroke-linecap="square">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
      </svg>
    </span>
    <span class="audio-label">MUSIC</span>
  `;
  document.body.appendChild(btn);

  return { audio, btn };
}

/* ---------------------------------------------------------- */
/* Persist state to localStorage                              */
/* ---------------------------------------------------------- */
function save(audio, playing) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      playing,
      time:   audio.currentTime,
      volume: audio.volume,
    }));
  } catch (_) {}
}

function load() {
  try   { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); }
  catch { return {}; }
}

/* ---------------------------------------------------------- */
/* Update button UI                                           */
/* ---------------------------------------------------------- */
function setUI(btn, playing) {
  btn.classList.toggle('is-playing', playing);
  btn.setAttribute('aria-label', playing ? 'Mute soundtrack' : 'Unmute soundtrack');
}

/* ---------------------------------------------------------- */
/* Main init                                                  */
/* ---------------------------------------------------------- */
function init() {
  const { audio, btn } = mount();

  const bc = typeof BroadcastChannel !== 'undefined'
    ? new BroadcastChannel(CHANNEL) : null;

  // ---- Restore saved state --------------------------------
  const saved = load();
  audio.volume = saved.volume ?? 0.4;

  audio.addEventListener('loadedmetadata', () => {
    if (saved.time > 0) audio.currentTime = saved.time;
  }, { once: true });

  // ---- Cross-tab: pause this tab if another starts --------
  if (bc) {
    bc.onmessage = (e) => {
      if (e.data === 'playing') {
        audio.pause();
        setUI(btn, false);
        save(audio, false);
      }
    };
  }

  // ---- Play helper ----------------------------------------
  function play() {
    audio.play()
      .then(() => {
        setUI(btn, true);
        save(audio, true);
        if (bc) bc.postMessage('playing');
      })
      .catch(() => {
        // Browser blocked autoplay — user hasn't interacted yet
      });
  }

  // ---- Restore previous session ---------------------------
  if (saved.playing) play();

  // ---- First-interaction autoplay (index.html only) -------
  // Scroll is intentionally kept to allow cleanup but returns
  // early because it is NOT a browser-recognised activation
  // gesture for autoplay (Chrome/Firefox/Safari all block it).
  const isAutoplayPage = document.body.hasAttribute('data-audio-autoplay');

  function onFirstInteraction(e) {
    if (e.type === 'scroll') return;
    if (audio.paused) play();
    removeFirstInteractionListeners();
  }

  function removeFirstInteractionListeners() {
    document.removeEventListener('click',        onFirstInteraction);
    document.removeEventListener('keydown',      onFirstInteraction);
    document.removeEventListener('pointerdown',  onFirstInteraction);
    document.removeEventListener('scroll',       onFirstInteraction, { passive: true });
  }

  if (isAutoplayPage) {
    document.addEventListener('click',       onFirstInteraction);
    document.addEventListener('keydown',     onFirstInteraction);
    document.addEventListener('pointerdown', onFirstInteraction);
    document.addEventListener('scroll',      onFirstInteraction, { passive: true });
  }

  // ---- Manual toggle --------------------------------------
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    // Always clean up first-interaction listeners when the
    // button is clicked so they don't linger if the button
    // was the very first element the user interacted with.
    removeFirstInteractionListeners();

    if (audio.paused) {
      play();
    } else {
      audio.pause();
      setUI(btn, false);
      save(audio, false);
    }
  });

  // ---- Persist position every second + on unload ----------
  setInterval(() => { if (!audio.paused) save(audio, true); }, 1000);
  window.addEventListener('pagehide', () => save(audio, !audio.paused));
}

document.addEventListener('DOMContentLoaded', init);