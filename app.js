/* ================= STORAGE ================= */
const STORAGE_KEY = 'airsoft_bombs_v1';

function loadBombs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  // Default bomb if nothing saved
  return [
    {
      id: 'default',
      name: 'Bombe Standard',
      time: 40,
      armMode: 'none',
      armCode: '',
      defuseMode: 'button',
      defuseCode: '',
      equationDifficulty: 'easy'
    }
  ];
}

function saveBombs(bombs) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(bombs));
}

let bombs = loadBombs();

// Seed : ajouter les bombes par défaut manquantes
const SEED_BOMBS = [
  {
    id: 'bomb-2727',
    name: 'Bombe 2727',
    time: 120,
    armMode: 'code',
    armCode: '2727',
    defuseMode: 'equation',
    defuseCode: '',
    equationDifficulty: 'hard',
    type: 'standard'
  }
];
let seeded = false;
SEED_BOMBS.forEach(seed => {
  const existing = bombs.find(b => b.id === seed.id);
  if (!existing) {
    bombs.push(seed);
    seeded = true;
  } else if (existing.name !== seed.name) {
    // Migration : renommer si le nom a changé
    existing.name = seed.name;
    seeded = true;
  }
});
if (seeded) saveBombs(bombs);

/* ================= AUDIO ================= */
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Short beep, frequency/duration adjustable
function playBeep(freq = 880, duration = 0.12, volume = 0.5) {
  const ctx = getAudioCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  osc.start(now);
  osc.stop(now + duration);
}

// Explosion: layered noise burst + low rumble
function playExplosion() {
  const ctx = getAudioCtx();
  const duration = 2.5;
  const bufferSize = ctx.sampleRate * duration;
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < bufferSize; i++) {
    // White noise with exponential decay envelope
    const t = i / ctx.sampleRate;
    const envelope = Math.exp(-t * 1.8);
    data[i] = (Math.random() * 2 - 1) * envelope;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  // Lowpass filter that sweeps to give "boom" character
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(2000, ctx.currentTime);
  filter.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + duration);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(1, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(ctx.destination);

  // Low frequency rumble oscillator
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(60, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(20, ctx.currentTime + duration);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.8, ctx.currentTime);
  oscGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
  osc.connect(oscGain);
  oscGain.connect(ctx.destination);

  noise.start();
  osc.start();
  noise.stop(ctx.currentTime + duration);
  osc.stop(ctx.currentTime + duration);
}

/* ================= NAVIGATION ================= */
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ================= HOME SCREEN ================= */
function renderBombList() {
  const list = document.getElementById('bomb-list');
  list.innerHTML = '';
  if (bombs.length === 0) {
    list.innerHTML = '<div class="empty-msg">Aucune bombe configurée.<br>Va dans les paramètres pour en créer une.</div>';
    return;
  }
  bombs.forEach(bomb => {
    const item = document.createElement('div');
    item.className = 'bomb-item';
    item.innerHTML = `<span>${escapeHtml(bomb.name)}</span><span class="bomb-time">${bomb.time}s</span>`;
    item.addEventListener('click', () => startArmSequence(bomb));
    list.appendChild(item);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById('btn-goto-settings').addEventListener('click', () => {
  renderBombConfigList();
  showScreen('screen-settings');
});

/* ================= ARM SEQUENCE ================= */
let currentBomb = null;
let armInput = '';

function startArmSequence(bomb) {
  currentBomb = bomb;
  if (bomb.armMode === 'code' && bomb.armCode) {
    armInput = '';
    document.getElementById('arm-bomb-name').textContent = `Armer : ${bomb.name}`;
    updateArmCodeDisplay();
    buildKeypad('arm-keypad', onArmKeyPress);
    showScreen('screen-arm');
  } else {
    // No code, arm directly
    launchBomb(bomb);
  }
}

function updateArmCodeDisplay() {
  const display = document.getElementById('arm-code-display');
  display.textContent = '•'.repeat(armInput.length).padEnd(currentBomb.armCode.length, '_');
}

function onArmKeyPress(digit) {
  if (digit === 'del') {
    armInput = armInput.slice(0, -1);
  } else if (digit === 'ok') {
    if (armInput === currentBomb.armCode) {
      launchBomb(currentBomb);
    } else {
      armInput = '';
      flashWrong('arm-code-display');
    }
  } else {
    if (armInput.length < (currentBomb.armCode.length || 4)) {
      armInput += digit;
    }
    if (armInput.length === currentBomb.armCode.length) {
      if (armInput === currentBomb.armCode) {
        setTimeout(() => launchBomb(currentBomb), 150);
      } else {
        setTimeout(() => {
          flashWrong('arm-code-display');
          armInput = '';
          updateArmCodeDisplay();
        }, 300);
      }
    }
  }
  updateArmCodeDisplay();
}

function flashWrong(elId) {
  const el = document.getElementById(elId);
  el.style.color = '#ff3b3b';
  setTimeout(() => { el.style.color = '#7fff7f'; }, 400);
}

function buildKeypad(containerId, callback) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const keys = ['1','2','3','4','5','6','7','8','9','del','0','ok'];
  keys.forEach(k => {
    const btn = document.createElement('button');
    btn.textContent = k === 'del' ? '⌫' : (k === 'ok' ? '✓' : k);
    btn.addEventListener('click', () => callback(k));
    container.appendChild(btn);
  });
}

document.getElementById('btn-arm-cancel').addEventListener('click', () => {
  currentBomb = null;
  showScreen('screen-home');
});

/* ================= ACTIVE BOMB ================= */
let countdownInterval = null;
let beepInterval = null;
let timeRemaining = 0;
let currentEquation = null;
let defuseInput = '';
let equationInput = '';
let equationsSolved = 0;
let currentBeepInterval = 1000;
let timerFlashing = false;
let equationsTotal = 1;
let captureEquationPending = false;
let captureEquationTargetState = null;

// Phases d'armement : 'time' → 'code' → 'running'
let armPhase = 'idle';
let armTimeDigits = ''; // jusqu'à 4 chiffres (MMSS)
let armCodeDigits = ''; // code saisi à l'armement
const ARM_CODE_LEN = 4;

// Bombe de Capture
let captureState = 'white'; // 'white' | 'orange' | 'blue'
let captureInput = '';

function formatArmTime(digits) {
  const padded = digits.padStart(4, '0');
  return padded.slice(0, 2) + ':' + padded.slice(2, 4);
}

function setTimerBig(big) {
  const display = document.querySelector('.bomb-display');
  if (display) display.classList.toggle('timer-big', big);
}

function setSecondaryLcd(text, color) {
  const val = document.getElementById('secondary-lcd-val');
  if (!val) return;
  // Plain text mode (OK, erreur) — pas de ghost par char
  val.innerHTML = '';
  val.textContent = text;
  val.style.color = color || '';
  val.style.textShadow = color ? '0 0 8px ' + color + 'bb' : '';
}

function launchBomb(bomb) {
  currentBomb = bomb;
  timeRemaining = 0;
  armPhase = 'time';
  armTimeDigits = '';
  armCodeDigits = '';
  defuseInput = '';

  document.getElementById('active-bomb-name').textContent = bomb.name.toUpperCase();
  setSecondaryLcd('');
  setTimerBig(true);

  if (bomb.armMode === 'code' && bomb.armCode) {
    // Bombe configurée : temps prédéfini, attente du code d'armement
    timeRemaining = bomb.time;
    document.getElementById('active-timer').textContent = 'ARMER';
    armPhase = 'armcode';
    armCodeDigits = '';
    updateConfiguredArmDisplay();
    buildImageKeypad('defuse-area', onConfiguredArmKey);
  } else {
    // Bombe libre : saisie manuelle du temps puis du code
    document.getElementById('active-timer').textContent = '00:00';
    buildImageKeypad('defuse-area', onArmTimeKey);
  }

  showScreen('screen-active');
  playBeep(880, 0.1, 0.3);
}

function onArmTimeKey(key) {
  if (key === 'del') {
    armTimeDigits = armTimeDigits.slice(0, -1);
  } else if (key === 'ok') {
    if (armTimeDigits.length === 0) return;
    const padded = armTimeDigits.padStart(4, '0');
    const mm = parseInt(padded.slice(0, 2), 10);
    const ss = parseInt(padded.slice(2, 4), 10);
    if (ss >= 60 || (mm === 0 && ss === 0)) {
      playBeep(220, 0.2, 0.5); return;
    }
    timeRemaining = mm * 60 + ss;
    updateTimerDisplay();
    // Phase code
    armPhase = 'code';
    armCodeDigits = '';
    updateArmCodeDisplay();
    buildImageKeypad('defuse-area', onArmCodeKey);
    return;
  } else {
    if (armTimeDigits.length < 4) armTimeDigits += key;
  }
  document.getElementById('active-timer').textContent = formatArmTime(armTimeDigits);
}

function updateArmCodeDisplay() {
  const val = document.getElementById('secondary-lcd-val');
  if (!val) return;
  val.style.color = '#ffff00';
  val.style.textShadow = '0 0 8px #ffff00bb';
  val.innerHTML = Array.from({ length: ARM_CODE_LEN }, (_, i) => {
    const ch = armCodeDigits[i];
    const sep = i > 0 ? '<span style="opacity:0.13"> </span>' : '';
    return sep + (ch ? '<span>' + ch + '</span>' : '<span style="opacity:0.13">8</span>');
  }).join('');
}

function onArmCodeKey(key) {
  if (key === 'del') {
    armCodeDigits = armCodeDigits.slice(0, -1);
  } else if (key === 'ok') {
    if (armCodeDigits.length === 0) return;
    startCountdownPhase(armCodeDigits);
    return;
  } else {
    if (armCodeDigits.length < ARM_CODE_LEN) armCodeDigits += key;
  }
  updateArmCodeDisplay();
}

function updateConfiguredArmDisplay() {
  const len = currentBomb.armCode.length;
  const val = document.getElementById('secondary-lcd-val');
  if (!val) return;
  val.style.color = '#ffff00';
  val.style.textShadow = '0 0 8px #ffff00bb';
  val.innerHTML = Array.from({ length: len }, (_, i) => {
    const ch = armCodeDigits[i];
    const sep = i > 0 ? '<span style="opacity:0.13"> </span>' : '';
    return sep + (ch ? '<span>' + ch + '</span>' : '<span style="opacity:0.13">8</span>');
  }).join('');
}

function onConfiguredArmKey(key) {
  if (key === 'del') {
    armCodeDigits = armCodeDigits.slice(0, -1);
  } else if (key === 'ok') {
    if (armCodeDigits === currentBomb.armCode) {
      startConfiguredCountdown();
    } else {
      playBeep(220, 0.2, 0.5);
      const lcd = document.getElementById('secondary-lcd-val');
      if (lcd) { lcd.innerHTML = ''; lcd.textContent = '*ERROR*'; lcd.style.color = '#ff3b3b'; lcd.style.textShadow = '0 0 8px #ff3b3bbb'; }
      armCodeDigits = '';
      setTimeout(() => updateConfiguredArmDisplay(), 800);
    }
    return;
  } else {
    if (armCodeDigits.length < currentBomb.armCode.length) armCodeDigits += key;
  }
  updateConfiguredArmDisplay();
}

function startConfiguredCountdown() {
  armPhase = 'running';
  defuseInput = '';

  if ((currentBomb.type || 'standard') === 'capture') {
    startCapturePhase();
    return;
  }

  buildDefuseArea(currentBomb);
  if (currentBomb.defuseMode === 'code') updateDefuseCodeDisplay(currentBomb);

  playBeep(880, 0.1, 0.5);
  startBeepLoop();
  countdownInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();
    if (timeRemaining <= 0) explode();
  }, 1000);
}

function startCountdownPhase(code) {
  currentBomb = Object.assign({}, currentBomb, { defuseCode: code });
  armPhase = 'running';
  defuseInput = '';

  if ((currentBomb.type || 'standard') === 'capture') {
    startCapturePhase();
    return;
  }

  currentBomb = Object.assign({}, currentBomb, { defuseMode: 'code' });
  updateDefuseCodeDisplay(currentBomb);
  buildDefuseArea(currentBomb);

  playBeep(880, 0.1, 0.5);
  startBeepLoop();
  countdownInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();
    if (timeRemaining <= 0) explode();
  }, 1000);
}

/* ===== BOMBE DE CAPTURE ===== */
function startCapturePhase() {
  captureState = 'white';
  captureInput = '';
  setTimerBig(true);

  // Keypad remplit toute la zone de désamorçage
  const area = document.getElementById('defuse-area');
  area.innerHTML = '';
  buildImageKeypad('defuse-area', onCaptureKey);

  updateCaptureVisual();
  playBeep(880, 0.1, 0.5);
  startBeepLoop();
  countdownInterval = setInterval(() => {
    timeRemaining--;
    updateTimerDisplay();
    if (timeRemaining <= 0) captureEnd();
  }, 1000);
}

function onCaptureKey(key) {
  if (key === 'del') {
    captureInput = captureInput.slice(0, -1);
    captureInput.length === 0 ? updateCaptureVisual() : updateCaptureInputDisplay();
  } else if (key === 'ok') {
    if (captureInput === currentBomb.defuseCode) {
      const newState = (captureState === 'white' || captureState === 'blue') ? 'orange' : 'blue';
      captureInput = '';
      playBeep(880, 0.15, 0.6);
      setTimeout(() => playBeep(1100, 0.1, 0.4), 100);
      if (currentBomb.captureEquation && currentBomb.captureEquation !== 'none') {
        // Requiert une équation avant de capturer
        captureEquationPending = true;
        captureEquationTargetState = newState;
        equationsSolved = 0;
        equationsTotal = 1;
        currentEquation = generateEquation(currentBomb.captureEquation);
        equationInput = '';
        setTimerBig(false);
        showEquationInDisplay();
        setSecondaryLcd('');
        buildImageKeypad('defuse-area', onEquationKey);
      } else {
        flashCaptureChange(newState);
      }
    } else {
      playBeep(220, 0.2, 0.5);
      setSecondaryLcd('*ERROR*', '#ff3b3b');
      captureInput = '';
      setTimeout(() => updateCaptureVisual(), 800);
    }
  } else {
    if (captureInput.length < currentBomb.defuseCode.length) {
      captureInput += key;
      updateCaptureInputDisplay();
    }
  }
}

function updateCaptureInputDisplay() {
  const len = currentBomb.defuseCode.length;
  const val = document.getElementById('secondary-lcd-val');
  if (!val) return;
  val.style.color = '#ffff00';
  val.style.textShadow = '0 0 8px #ffff00bb';
  val.innerHTML = Array.from({ length: len }, (_, i) => {
    const ch = captureInput[i];
    const sep = i > 0 ? '<span style="opacity:0.13"> </span>' : '';
    return sep + (ch ? '<span>' + ch + '</span>' : '<span style="opacity:0.13">8</span>');
  }).join('');
}

function updateCaptureVisual() {
  const frame = document.querySelector('.bomb-frame');
  const timer = document.getElementById('active-timer');

  frame.classList.remove('capture-white', 'capture-orange', 'capture-blue');
  frame.classList.add('capture-' + captureState);

  const colors = { white: '#ffffff', orange: '#ff8800', blue: '#4488ff' };
  const labels = { white: 'LIBRE', orange: (currentBomb && currentBomb.orangeTeamName) || 'ORANGE', blue: (currentBomb && currentBomb.blueTeamName) || 'BLEU' };
  const color = colors[captureState];

  timer.style.color = color;
  timer.style.textShadow = `0 0 10px ${color}bb`;

  setSecondaryLcd('');
  captureInput = '';
}

function flashCaptureChange(newState) {
  captureState = newState;
  const colors = { white: '#ffffff', orange: '#ff8800', blue: '#4488ff' };
  const labels = { white: 'LIBRE', orange: (currentBomb && currentBomb.orangeTeamName) || 'ORANGE', blue: (currentBomb && currentBomb.blueTeamName) || 'BLEU' };
  const color = colors[newState];

  const frame = document.querySelector('.bomb-frame');
  frame.classList.remove('capture-white', 'capture-orange', 'capture-blue');
  frame.classList.add('capture-' + newState);
  setSecondaryLcd('');

  // Overlay texte dans le LCD principal, par-dessus le timer
  const display = document.querySelector('.bomb-display');
  const overlay = document.createElement('div');
  overlay.className = 'capture-label-overlay';
  overlay.textContent = labels[newState];
  overlay.style.cssText = `
    position:absolute; inset:0; display:flex; align-items:center; justify-content:center;
    font-family:'Digital7',monospace; font-size:8vh; color:${color};
    text-shadow:0 0 20px ${color}, 0 0 6px ${color}; pointer-events:none; z-index:10;
  `;
  const timer = document.getElementById('active-timer');
  timer.style.opacity = '0';
  display.appendChild(overlay);

  // 3 clignotis du texte (~2 secondes), timer caché pendant ce temps
  let blinks = 0;
  const blinkId = setInterval(() => {
    blinks++;
    overlay.style.opacity = blinks % 2 === 0 ? '1' : '0';
    if (blinks >= 6) {
      clearInterval(blinkId);
      overlay.remove();
      timer.style.opacity = '1';
      timer.style.color = color;
      timer.style.textShadow = `0 0 10px ${color}bb`;
    }
  }, 333);
}

function captureEnd() {
  stopAllTimers();

  const labels = { white: 'NEUTRE', orange: (currentBomb && currentBomb.orangeTeamName) || 'ORANGE', blue: (currentBomb && currentBomb.blueTeamName) || 'BLEU' };
  const colors = { white: '#ffffff', orange: '#ff8800', blue: '#4488ff' };
  const color = colors[captureState];

  const timer = document.getElementById('active-timer');
  setSecondaryLcd('FIN !', color);
  timer.textContent = labels[captureState];
  timer.style.color = color;
  timer.style.textShadow = `0 0 20px ${color}`;

  playBeep(880, 0.3, 0.5);
  setTimeout(() => playBeep(1100, 0.2, 0.4), 200);

  let blinks = 0;
  const blinkId = setInterval(() => {
    blinks++;
    timer.style.opacity = blinks % 2 === 0 ? '1' : '0';
    if (blinks >= 6) {
      clearInterval(blinkId);
      resetBombCycle();
    }
  }, 400);
}

function updateTimerDisplay() {
  if (timerFlashing) return;
  const m = Math.floor(timeRemaining / 60).toString().padStart(2, '0');
  const s = (timeRemaining % 60).toString().padStart(2, '0');
  document.getElementById('active-timer').textContent = `${m}:${s}`;
}

function startBeepLoop() {
  clearTimeout(beepInterval);
  currentBeepInterval = 1000;

  function tick() {
    if (timeRemaining <= 0) return;

    let waitMS;
    if (timeRemaining > 30) {
      // Phase 1 : 1 bip/sec constant
      currentBeepInterval = 1000;
      waitMS = 1000;
    } else if (timeRemaining > 10) {
      // Phase 2 : intervalle 1000ms → 500ms linéairement sur 20s
      const progress = (30 - timeRemaining) / 20; // 0 à 1
      currentBeepInterval = Math.round(1000 - progress * 500);
      waitMS = currentBeepInterval;
    } else {
      // Phase 3 : interpolation 500ms → 25ms sur 10s
      currentBeepInterval = Math.round(25 + (timeRemaining / 10) * 475);
      waitMS = currentBeepInterval;
    }

    const freq = timeRemaining <= 5 ? 1200 : 880;
    playBeep(freq, 0.08, 0.5);
    beepInterval = setTimeout(tick, waitMS);
  }
  tick();
}

function stopAllTimers() {
  clearInterval(countdownInterval);
  clearTimeout(beepInterval);
  countdownInterval = null;
  beepInterval = null;
}

function explode() {
  stopAllTimers();
  playExplosion();

  const timer = document.getElementById('active-timer');
  setSecondaryLcd('');
  timer.textContent = '💥 BOOM 💥';
  timer.style.color = '#ff2200';
  timer.style.textShadow = '0 0 20px #ff2200, 0 0 40px #ff000088';
  timer.style.fontSize = '3.5vh';

  let blinks = 0;
  const blinkId = setInterval(() => {
    blinks++;
    timer.style.opacity = blinks % 2 === 0 ? '1' : '0';
    if (blinks >= 6) {
      clearInterval(blinkId);
      timer.style.fontSize = '';
      resetBombCycle();
    }
  }, 400);
}

document.getElementById('btn-settings').addEventListener('click', openModeModal);

function openModeModal() {
  const currentType = currentBomb ? (currentBomb.type || 'standard') : 'standard';
  document.getElementById('btn-mode-standard').classList.toggle('active-mode', currentType === 'standard');
  document.getElementById('btn-mode-capture').classList.toggle('active-mode', currentType === 'capture');
  document.getElementById('mode-modal').classList.remove('hidden');
}

function closeModeModal() {
  document.getElementById('mode-modal').classList.add('hidden');
}

function selectMode(type) {
  if (!currentBomb) return;
  currentBomb = Object.assign({}, currentBomb, { type });
  const idx = bombs.findIndex(b => b.id === currentBomb.id);
  if (idx !== -1) { bombs[idx] = Object.assign({}, bombs[idx], { type }); saveBombs(bombs); }
  closeModeModal();
  // Mise à jour du nom affiché selon le mode
  const modeNames = { standard: 'BOMBE STANDARD', capture: 'BOMBE CAPTURE' };
  document.getElementById('active-bomb-name').textContent = modeNames[type] || currentBomb.name.toUpperCase();
  // Réinitialise la phase d'armement
  armPhase = 'time';
  armTimeDigits = '';
  armCodeDigits = '';
  document.getElementById('active-timer').textContent = '00:00';
  document.getElementById('active-timer').style.color = '';
  document.getElementById('active-timer').style.textShadow = '';
  setSecondaryLcd('');
  setTimerBig(true);
  const frame = document.querySelector('.bomb-frame');
  if (frame) frame.classList.remove('capture-white', 'capture-orange', 'capture-blue');
  buildImageKeypad('defuse-area', onArmTimeKey);
  playBeep(660, 0.08, 0.3);
}

document.getElementById('btn-mode-standard').addEventListener('click', () => selectMode('standard'));
document.getElementById('btn-mode-capture').addEventListener('click', () => selectMode('capture'));
document.getElementById('btn-mode-close').addEventListener('click', closeModeModal);
document.getElementById('btn-goto-config').addEventListener('click', () => {
  closeModeModal();
  stopAllTimers();
  renderBombConfigList();
  showScreen('screen-settings');
});

document.getElementById('btn-boom-back').addEventListener('click', () => {
  renderBombList();
  showScreen('screen-home');
});

document.getElementById('btn-defused-back').addEventListener('click', () => {
  renderBombList();
  showScreen('screen-home');
});

document.getElementById('btn-force-stop').addEventListener('click', () => {
  document.getElementById('mode-modal').classList.add('hidden');
  stopAllTimers();
  renderBombList();
  showScreen('screen-home');
});

/* ===== Image keypad (touches PNG) ===== */
function buildImageKeypad(containerId, callback) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  // On applique le layout grid en inline pour ne pas écraser les classes
  // de positionnement existantes (ex: defuse-area avec position:absolute)
  Object.assign(container.style, {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gridTemplateRows: 'repeat(4, 1fr)',
    columnGap: '0',
    rowGap: '0',
    alignItems: 'stretch',
    alignContent: 'stretch'
  });
  const keys = ['1','2','3','4','5','6','7','8','9','*','0','#'];
  const actionMap = { '*': 'del', '#': 'ok' };
  const imgMap    = { '*': 'Asterisk', '#': 'Hashtag' };
  keys.forEach(k => {
    const btn = document.createElement('button');
    btn.className = 'img-key-btn';
    const imgName = imgMap[k] || k;
    btn.innerHTML = `<img src="Assets/${imgName}.png" alt="${k}">`;
    const action = actionMap[k] || k;
    btn.addEventListener('click', () => {
      playBeep(660, 0.06, 0.3);
      callback(action);
    });
    container.appendChild(btn);
  });
}

/* ===== Defuse area builder ===== */
function buildDefuseArea(bomb) {
  const area = document.getElementById('defuse-area');
  area.innerHTML = '';
  defuseInput = '';
  // Reset les styles inline laissés par buildImageKeypad (grid → flex)
  area.style.display = 'flex';
  area.style.flexDirection = 'column';
  area.style.gridTemplateColumns = '';
  area.style.gridTemplateRows = '';
  area.style.columnGap = '';
  area.style.rowGap = '';
  area.style.alignItems = '';
  area.style.alignContent = '';

  if (bomb.defuseMode === 'button') {
    const btn = document.createElement('button');
    btn.className = 'btn-desamorce';
    btn.textContent = '✂ DÉSAMORCER';
    btn.addEventListener('click', () => defuseSuccess());
    area.appendChild(btn);

  } else if (bomb.defuseMode === 'code') {
    // Le code saisi s'affiche dans le secondary LCD (au-dessus) — pas besoin
    // d'un div interne qui pousserait le clavier vers le bas.
    buildImageKeypad('defuse-area', (digit) => onDefuseKeyPress(digit, bomb));
    updateDefuseCodeDisplay(bomb);

  } else if (bomb.defuseMode === 'equation') {
    equationsSolved = 0;
    equationsTotal = bomb.equationCount || 1;
    currentEquation = generateEquation(bomb.equationDifficulty);
    equationInput = '';
    setTimerBig(false);
    showEquationInDisplay();
    setSecondaryLcd('');
    buildImageKeypad('defuse-area', onEquationKey);
  }
}

function showEquationInDisplay() {
  const display = document.querySelector('.bomb-display');
  display.classList.remove('timer-big');
  display.classList.add('equation-mode');
  const existing = display.querySelector('.equation-text');
  if (existing) existing.remove();
  const eq = document.createElement('div');
  eq.className = 'equation-text';
  eq.textContent = currentEquation.text;
  display.appendChild(eq);
}

function clearEquationDisplay() {
  const display = document.querySelector('.bomb-display');
  display.classList.remove('equation-mode');
  const eq = display.querySelector('.equation-text');
  if (eq) eq.remove();
}

function updateEquationAnswerLcd() {
  const val = document.getElementById('secondary-lcd-val');
  if (!val) return;
  if (equationInput === '') { setSecondaryLcd(''); return; }
  val.innerHTML = '';
  val.textContent = equationInput;
  val.style.fontFamily = "'Digital7', monospace";
  val.style.fontSize = '4.5vh';
  val.style.color = '#ffff00';
  val.style.textShadow = '0 0 8px #ffff00bb';
  val.style.letterSpacing = '4px';
}

function onEquationKey(key) {
  if (key === 'del') {
    equationInput = equationInput.slice(0, -1);
    updateEquationAnswerLcd();
  } else if (key === 'ok') {
    const answer = parseInt(equationInput, 10);
    if (!isNaN(answer) && answer === currentEquation.answer) {
      equationInput = '';
      equationsSolved++;
      if (captureEquationPending) {
        // Équation pour capture : finalise la capture
        captureEquationPending = false;
        clearEquationDisplay();
        setSecondaryLcd('');
        buildImageKeypad('defuse-area', onCaptureKey);
        flashCaptureChange(captureEquationTargetState);
      } else if (equationsSolved >= equationsTotal) {
        // Toutes les équations résolues
        clearEquationDisplay();
        defuseSuccess();
      } else {
        // Suivante — flash progression dans le timer
        flashEquationProgress(equationsSolved, equationsTotal, () => {
          currentEquation = generateEquation(currentBomb.equationDifficulty);
          showEquationInDisplay();
          setSecondaryLcd('');
          buildImageKeypad('defuse-area', onEquationKey);
        });
      }
    } else {
      playBeep(220, 0.2, 0.5);
      const val = document.getElementById('secondary-lcd-val');
      if (val) {
        val.innerHTML = '';
        val.textContent = '*ERROR*';
        val.style.fontFamily = "'Digital7', monospace";
        val.style.fontSize = '4.5vh';
        val.style.color = '#ff3b3b';
        val.style.textShadow = '0 0 8px #ff3b3bbb';
      }
      equationInput = '';
      setTimeout(() => setSecondaryLcd(''), 800);
    }
  } else if (/^\d$/.test(key)) {
    if (equationInput.length < 4) equationInput += key;
    updateEquationAnswerLcd();
  }
}

function flashEquationProgress(solved, total, callback) {
  const timer = document.getElementById('active-timer');
  timerFlashing = true;
  timer.textContent = `${solved}/${total}`;
  timer.style.color = '#4aff4a';
  timer.style.textShadow = '0 0 14px #4aff4acc';
  playBeep(880, 0.15, 0.5);
  setTimeout(() => playBeep(1100, 0.1, 0.4), 120);
  setTimeout(() => {
    timerFlashing = false;
    timer.style.color = '';
    timer.style.textShadow = '';
    if (callback) callback();
  }, 1200);
}

function updateDefuseCodeDisplay(bomb) {
  const len = bomb.defuseCode.length;
  const val = document.getElementById('secondary-lcd-val');
  if (val) {
    val.style.color = '#ffff00';
    val.style.textShadow = '0 0 8px #ffff00bb';
    val.innerHTML = Array.from({ length: len }, (_, i) => {
      const ch = defuseInput[i];
      const sep = i > 0 ? '<span style="opacity:0.13"> </span>' : '';
      if (ch) return sep + '<span>' + ch + '</span>';
      return sep + '<span style="opacity:0.13">8</span>';
    }).join('');
  }
  const display = document.getElementById('defuse-code-display');
  if (display) display.textContent = defuseInput;
}

function onDefuseKeyPress(digit, bomb) {
  if (digit === 'del') {
    defuseInput = defuseInput.slice(0, -1);
  } else if (digit === 'ok') {
    checkDefuseCode(bomb);
    return;
  } else {
    if (defuseInput.length < bomb.defuseCode.length) defuseInput += digit;
  }
  updateDefuseCodeDisplay(bomb);
}

function checkDefuseCode(bomb) {
  if (defuseInput === bomb.defuseCode) {
    defuseSuccess();
  } else {
    playBeep(220, 0.2, 0.5);
    const lcd = document.getElementById('secondary-lcd-val');
    if (lcd) {
      lcd.innerHTML = '';
      lcd.textContent = '*ERROR*';
      lcd.style.color = '#ff3b3b';
      lcd.style.textShadow = '0 0 8px #ff3b3bbb';
    }
    defuseInput = '';
    setTimeout(() => {
      updateDefuseCodeDisplay(bomb);
    }, 800);
  }
}

function defuseSuccess() {
  stopAllTimers();
  playBeep(440, 0.3, 0.4);
  setTimeout(() => playBeep(660, 0.3, 0.4), 150);

  const timer = document.getElementById('active-timer');
  setSecondaryLcd('');
  setTimerBig(false);
  timer.textContent = 'BOMB DEFUSED';
  timer.style.color = '#ff8800';
  timer.style.textShadow = '0 0 10px #ff8800bb';

  let blinks = 0;
  const blinkId = setInterval(() => {
    blinks++;
    timer.style.opacity = blinks % 2 === 0 ? '1' : '0';
    if (blinks >= 6) {
      clearInterval(blinkId);
      resetBombCycle();
    }
  }, 400);
}

function resetBombCycle() {
  armPhase = 'time';
  armTimeDigits = '';
  armCodeDigits = '';
  defuseInput = '';
  timeRemaining = 0;

  const timer = document.getElementById('active-timer');
  timer.textContent = '00:00';
  timer.style.color = '';
  timer.style.textShadow = '';
  timer.style.opacity = '1';
  timer.style.fontSize = '';

  const frame = document.querySelector('.bomb-frame');
  if (frame) frame.classList.remove('capture-white', 'capture-orange', 'capture-blue');
  captureState = 'white';
  captureInput = '';

  setSecondaryLcd('');
  buildImageKeypad('defuse-area', onArmTimeKey);
}

/* ===== Equation generator ===== */
function generateEquation(difficulty) {
  function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  if (difficulty === 'easy') {
    const a = rnd(1, 20), b = rnd(1, 20);
    const op = Math.random() < 0.5 ? '+' : '-';
    return { text: `${a} ${op} ${b} = ?`, answer: op === '+' ? a + b : a - b };
  } else if (difficulty === 'medium') {
    const a = rnd(2, 12), b = rnd(2, 12);
    return { text: `${a} × ${b} = ?`, answer: a * b };
  } else {
    const a = rnd(2, 10), b = rnd(2, 10);
    const op = Math.random() < 0.5 ? '+' : '-';
    const c = op === '-' ? rnd(1, Math.min(a * b - 1, 10)) : rnd(1, 10);
    return { text: `(${a} × ${b}) ${op} ${c} = ?`, answer: op === '+' ? (a * b) + c : (a * b) - c };
  }
}

/* ================= SETTINGS: BOMB LIST ================= */
function renderBombConfigList() {
  const list = document.getElementById('bomb-config-list');
  list.innerHTML = '';
  if (bombs.length === 0) {
    list.innerHTML = '<div class="empty-msg">Aucune bombe. Crée-en une !</div>';
    return;
  }
  const customBombs = bombs.filter(b => b.id !== 'default');
  if (customBombs.length === 0) {
    list.innerHTML = '<div class="empty-msg">Aucune bombe personnalisée. Crée-en une !</div>';
    return;
  }
  customBombs.forEach(bomb => {
    const item = document.createElement('div');
    item.className = 'bomb-config-item';

    const info = document.createElement('div');
    info.className = 'bomb-config-info';
    info.innerHTML = `<span class="bomb-config-name">${escapeHtml(bomb.name)}</span><span class="bomb-config-time">${bomb.time}s</span>`;
    info.addEventListener('click', () => launchBomb(bomb));

    const editBtn = document.createElement('button');
    editBtn.className = 'bomb-config-edit-btn';
    editBtn.textContent = '✎';
    editBtn.addEventListener('click', (e) => { e.stopPropagation(); openEditScreen(bomb); });

    item.appendChild(info);
    item.appendChild(editBtn);
    list.appendChild(item);
  });
}

document.getElementById('btn-settings-back').addEventListener('click', () => {
  const defaultBomb = bombs.find(b => (b.type || 'standard') === 'standard') || bombs[0];
  if (defaultBomb) {
    launchBomb(defaultBomb);
  } else {
    renderBombList();
    showScreen('screen-home');
  }
});

document.getElementById('btn-new-bomb').addEventListener('click', () => {
  openEditScreen(null);
});

/* ================= EDIT BOMB SCREEN ================= */
let editingBombId = null;

function openEditScreen(bomb) {
  editingBombId = bomb ? bomb.id : null;
  document.getElementById('edit-name').value = bomb ? bomb.name : '';
  document.getElementById('edit-bomb-type').value = bomb ? (bomb.type || 'standard') : 'standard';
  document.getElementById('edit-time').value = bomb ? bomb.time : 40;
  document.getElementById('edit-arm-mode').value = bomb ? bomb.armMode : 'none';
  document.getElementById('edit-arm-code').value = bomb ? bomb.armCode : '';
  document.getElementById('edit-defuse-mode').value = bomb ? bomb.defuseMode : 'button';
  document.getElementById('edit-defuse-code').value = bomb ? bomb.defuseCode : '';
  document.getElementById('edit-equation-difficulty').value = bomb ? (bomb.equationDifficulty || 'easy') : 'easy';
  document.getElementById('edit-equation-count').value = bomb ? (bomb.equationCount || 1) : 1;
  document.getElementById('edit-orange-name').value = bomb ? (bomb.orangeTeamName || '') : '';
  document.getElementById('edit-blue-name').value = bomb ? (bomb.blueTeamName || '') : '';
  document.getElementById('edit-capture-equation').value = bomb ? (bomb.captureEquation || 'none') : 'none';
  document.getElementById('btn-delete-bomb').style.display = bomb ? 'block' : 'none';
  updateEditFormVisibility();
  showScreen('screen-edit');
}

function updateEditFormVisibility() {
  const armMode = document.getElementById('edit-arm-mode').value;
  const defuseMode = document.getElementById('edit-defuse-mode').value;
  const bombType = document.getElementById('edit-bomb-type').value;
  const isCapture = bombType === 'capture';
  document.getElementById('edit-arm-code-group').style.display = (armMode === 'code') ? 'block' : 'none';
  document.getElementById('edit-defuse-mode-group').style.display = isCapture ? 'none' : 'block';
  document.getElementById('edit-defuse-code-group').style.display = (!isCapture && defuseMode === 'code') ? 'block' : 'none';
  document.getElementById('edit-equation-group').style.display = (!isCapture && defuseMode === 'equation') ? 'block' : 'none';
  document.getElementById('edit-equation-count-group').style.display = (!isCapture && defuseMode === 'equation') ? 'block' : 'none';
  document.getElementById('edit-capture-teams-group').style.display = isCapture ? 'block' : 'none';
  document.getElementById('edit-capture-equation-group').style.display = isCapture ? 'block' : 'none';
}

document.getElementById('edit-arm-mode').addEventListener('change', updateEditFormVisibility);
document.getElementById('edit-defuse-mode').addEventListener('change', updateEditFormVisibility);
document.getElementById('edit-bomb-type').addEventListener('change', updateEditFormVisibility);

document.getElementById('btn-save-bomb').addEventListener('click', () => {
  const name = document.getElementById('edit-name').value.trim() || 'Bombe sans nom';
  const time = Math.max(5, parseInt(document.getElementById('edit-time').value, 10) || 40);
  const armMode = document.getElementById('edit-arm-mode').value;
  const armCode = document.getElementById('edit-arm-code').value.trim();
  const defuseMode = document.getElementById('edit-defuse-mode').value;
  const defuseCode = document.getElementById('edit-defuse-code').value.trim();
  const equationDifficulty = document.getElementById('edit-equation-difficulty').value;
  const equationCount = Math.max(1, Math.min(10, parseInt(document.getElementById('edit-equation-count').value, 10) || 1));
  const bombType = document.getElementById('edit-bomb-type').value;
  const isCapture = bombType === 'capture';
  const orangeTeamName = document.getElementById('edit-orange-name').value.trim() || 'ORANGE';
  const blueTeamName = document.getElementById('edit-blue-name').value.trim() || 'BLEU';
  const captureEquation = document.getElementById('edit-capture-equation').value;

  if (armMode === 'code' && !/^\d{1,8}$/.test(armCode)) {
    alert("Le code d'armement doit être numérique (1 à 8 chiffres)."); return;
  }
  if (!isCapture && defuseMode === 'code' && !/^\d{1,8}$/.test(defuseCode)) {
    alert('Le code de désamorçage doit être numérique (1 à 8 chiffres).'); return;
  }

  const bombData = {
    id: editingBombId || ('bomb_' + Date.now()),
    name, type: bombType, time, armMode, armCode, defuseMode, defuseCode,
    equationDifficulty, equationCount,
    orangeTeamName, blueTeamName, captureEquation
  };

  if (editingBombId) {
    const idx = bombs.findIndex(b => b.id === editingBombId);
    if (idx !== -1) bombs[idx] = bombData;
  } else {
    bombs.push(bombData);
  }
  saveBombs(bombs);
  renderBombConfigList();
  showScreen('screen-settings');
});

document.getElementById('btn-delete-bomb').addEventListener('click', () => {
  if (!editingBombId) return;
  if (!confirm('Supprimer cette bombe ?')) return;
  bombs = bombs.filter(b => b.id !== editingBombId);
  saveBombs(bombs);
  renderBombConfigList();
  showScreen('screen-settings');
});

document.getElementById('btn-edit-cancel').addEventListener('click', () => {
  renderBombConfigList();
  showScreen('screen-settings');
});

/* ================= UNLOCK AUDIO ON FIRST INTERACTION ================= */
document.body.addEventListener('click', () => getAudioCtx(), { once: true });

/* ================= INIT ================= */
const defaultBomb = bombs.find(b => (b.type || 'standard') === 'standard') || bombs[0];
if (defaultBomb) {
  launchBomb(defaultBomb);
} else {
  renderBombList();
  showScreen('screen-home');
}
