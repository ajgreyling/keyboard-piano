(function () {
  var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  var audio = null;
  var master = null;
  var reverbSend = null;
  var dryGain = null;
  var reverb = null;
  var compressor = null;

  var activeNotes = {};
  var heldKeys = {};
  var touchClickGuard = false;
  var maxVoices = 10;
  var voiceOrder = [];

  var jamOn = false;
  var jamRoot = 5;
  var jamNextBeat = 0;
  var jamBeat = 0;
  var jamTimer = null;
  var jamTempo = 76;
  var lastUserTime = 0;

  var notes = [
    { key: "A", code: 65, note: "C3", freq: 130.81, color: "#ffadad", scale: 0 },
    { key: "S", code: 83, note: "D3", freq: 146.83, color: "#ffd6a5", scale: 1 },
    { key: "D", code: 68, note: "E3", freq: 164.81, color: "#fdffb6", scale: 2 },
    { key: "F", code: 70, note: "G3", freq: 196.00, color: "#caffbf", scale: 3 },
    { key: "G", code: 71, note: "A3", freq: 220.00, color: "#9bf6ff", scale: 4 },
    { key: "H", code: 72, note: "C4", freq: 261.63, color: "#a0c4ff", scale: 5 },
    { key: "J", code: 74, note: "D4", freq: 293.66, color: "#bdb2ff", scale: 6 },
    { key: "K", code: 75, note: "E4", freq: 329.63, color: "#ffc6ff", scale: 7 },
    { key: "L", code: 76, note: "G4", freq: 392.00, color: "#f4d35e", scale: 8 },
    { key: ";", code: 186, note: "A4", freq: 440.00, color: "#ee964b", scale: 9 }
  ];

  var arpPatterns = [
    [0, 2, 4, 2],
    [0, 3, 4, 2],
    [0, 2, 3, 4],
    [4, 2, 0, 2]
  ];
  var arpPatternIndex = 0;
  var arpStep = 0;

  var pianoPartials = [
    { ratio: 1, gain: 1.0, decay: 2.8 },
    { ratio: 2, gain: 0.55, decay: 2.0 },
    { ratio: 3, gain: 0.28, decay: 1.4 },
    { ratio: 4.2, gain: 0.16, decay: 1.0 },
    { ratio: 5.4, gain: 0.09, decay: 0.7 },
    { ratio: 6.8, gain: 0.05, decay: 0.5 }
  ];

  var pads = document.getElementById("pads");
  var noteTrail = document.getElementById("noteTrail");
  var startButton = document.getElementById("startButton");
  var jamButton = document.getElementById("jamButton");
  var quietButton = document.getElementById("quietButton");
  var volumeControl = document.getElementById("volume");
  var warmthControl = document.getElementById("warmth");
  var reverbControl = document.getElementById("reverb");
  var status = document.getElementById("status");
  var beatPulse = document.getElementById("beatPulse");

  function init() {
    createPads();
    bindEvents();

    if (!AudioContextCtor) {
      setStatus("This browser cannot play Web Audio. Try Firefox, Chromium, Chrome, or Safari.");
      startButton.disabled = true;
      jamButton.disabled = true;
      return;
    }

    setStatus("Press Start piano, then try A S D F G H J K L ;. Turn on Jam to keep playing.");
  }

  function createPads() {
    var i;

    for (i = 0; i < notes.length; i += 1) {
      var item = notes[i];
      var button = document.createElement("button");
      var inner = document.createElement("span");
      var key = document.createElement("span");
      var note = document.createElement("span");

      button.type = "button";
      button.className = "pad";
      button.id = "pad-" + item.code;
      button.style.backgroundColor = item.color;
      button.setAttribute("data-code", String(item.code));
      button.setAttribute("aria-label", "Play " + item.note + " with key " + item.key);

      inner.className = "pad-inner";
      key.className = "pad-key";
      note.className = "pad-note";
      key.appendChild(document.createTextNode(item.key));
      note.appendChild(document.createTextNode(item.note));
      inner.appendChild(key);
      inner.appendChild(note);
      button.appendChild(inner);
      pads.appendChild(button);
    }
  }

  function bindEvents() {
    startButton.onclick = function () {
      ensureAudio();
      playNote(notes[5], 1, "user");
      if (jamOn) {
        startJam();
      }
      setStatus("Piano is awake. Play keys or tap pads. Jam mode follows your lead.");
    };

    jamButton.onclick = function () {
      ensureAudio();
      jamOn = !jamOn;
      jamButton.className = jamOn ? "secondary-button is-on" : "secondary-button";
      jamButton.innerHTML = "";
      jamButton.appendChild(document.createTextNode(jamOn ? "Jam on" : "Jam off"));

      if (jamOn) {
        startJam();
        setStatus("Jam is on. Your notes steer the music.");
      } else {
        stopJam();
        setStatus("Jam paused. You can still play freely.");
      }
    };

    quietButton.onclick = function () {
      stopJam();
      stopAllNotes();
      setStatus("Quiet now.");
    };

    volumeControl.oninput = volumeControl.onchange = updateMasterVolume;
    warmthControl.oninput = warmthControl.onchange = function () {
      setStatus("Tone warmth set to " + warmthControl.value + ".");
    };
    reverbControl.oninput = reverbControl.onchange = updateReverbMix;

    pads.onclick = function (event) {
      if (touchClickGuard) {
        touchClickGuard = false;
        return;
      }

      var pad = findPad(event.target || event.srcElement);
      if (pad) {
        triggerPad(pad);
      }
    };

    pads.ontouchstart = function (event) {
      var pad = findPad(event.target || event.srcElement);
      if (pad) {
        touchClickGuard = true;
        triggerPad(pad);
      }
    };

    document.onkeydown = function (event) {
      var e = event || window.event;
      var code = getKeyCode(e);
      var item = findNoteByCode(code);

      if (!item || heldKeys[code]) {
        return;
      }

      heldKeys[code] = true;
      ensureAudio();
      playNote(item, 1, "user");

      if (e.preventDefault) {
        e.preventDefault();
      }
      e.returnValue = false;
    };

    document.onkeyup = function (event) {
      var e = event || window.event;
      var code = getKeyCode(e);
      heldKeys[code] = false;
    };
  }

  function findPad(element) {
    while (element && element !== pads) {
      if (hasClass(element, "pad")) {
        return element;
      }
      element = element.parentNode;
    }
    return null;
  }

  function hasClass(element, className) {
    return (" " + element.className + " ").indexOf(" " + className + " ") > -1;
  }

  function triggerPad(pad) {
    var code = parseInt(pad.getAttribute("data-code"), 10);
    var item = findNoteByCode(code);

    if (item) {
      ensureAudio();
      playNote(item, 1, "user");
    }
  }

  function getKeyCode(event) {
    if (event.keyCode) {
      return event.keyCode;
    }
    if (event.which) {
      return event.which;
    }
    return 0;
  }

  function findNoteByCode(code) {
    var i;
    for (i = 0; i < notes.length; i += 1) {
      if (notes[i].code === code) {
        return notes[i];
      }
    }
    return null;
  }

  function findNoteIndex(item) {
    var i;
    for (i = 0; i < notes.length; i += 1) {
      if (notes[i].code === item.code) {
        return i;
      }
    }
    return 5;
  }

  function steerJam(item) {
    var idx = findNoteIndex(item);
    jamRoot = idx;
    lastUserTime = nowMs();
    arpPatternIndex = (arpPatternIndex + 1) % arpPatterns.length;
    arpStep = 0;
    setStatus("Jam follows " + item.note + ". Keep exploring.");
  }

  function nowMs() {
    return new Date().getTime();
  }

  function ensureAudio() {
    if (audio || !AudioContextCtor) {
      resumeAudio();
      return;
    }

    audio = new AudioContextCtor();
    compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 18;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.18;

    dryGain = audio.createGain();
    reverbSend = audio.createGain();
    master = audio.createGain();
    reverb = audio.createConvolver();
    reverb.buffer = buildReverbImpulse(2.4, 2.2);

    dryGain.connect(compressor);
    reverbSend.connect(reverb);
    reverb.connect(compressor);
    compressor.connect(master);
    master.connect(audio.destination);

    updateMasterVolume();
    updateReverbMix();
    resumeAudio();
  }

  function buildReverbImpulse(duration, decay) {
    var rate = audio.sampleRate;
    var length = Math.floor(rate * duration);
    var impulse = audio.createBuffer(2, length, rate);
    var channel;
    var i;
    var c;

    for (c = 0; c < 2; c += 1) {
      channel = impulse.getChannelData(c);
      for (i = 0; i < length; i += 1) {
        channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }

    return impulse;
  }

  function resumeAudio() {
    if (audio && audio.resume) {
      audio.resume();
    }
  }

  function updateMasterVolume() {
    var volume = parseInt(volumeControl.value, 10) / 100;
    if (master) {
      master.gain.value = volume * 0.82;
    }
  }

  function updateReverbMix() {
    var mix = parseInt(reverbControl.value, 10) / 100;
    if (dryGain && reverbSend) {
      dryGain.gain.value = 1 - (mix * 0.35);
      reverbSend.gain.value = mix * 0.55;
    }
  }

  function playNote(item, velocity, source) {
    if (!audio || !master) {
      return;
    }

    if (source === "user") {
      steerJam(item);
      if (!jamOn) {
        jamOn = true;
        jamButton.className = "secondary-button is-on";
        jamButton.innerHTML = "";
        jamButton.appendChild(document.createTextNode("Jam on"));
        startJam();
      }
    }

    limitVoices();
    playPianoVoice(item, velocity, source || "auto");
    showPad(item);
    showBubble(item);
  }

  function playPianoVoice(item, velocity, source) {
    var now = audio.currentTime;
    var warmth = parseInt(warmthControl.value, 10) / 100;
    var voiceId = String(now) + "-" + item.code + "-" + Math.random();
    var voiceGain = audio.createGain();
    var toneFilter = audio.createBiquadFilter();
    var i;
    var partial;
    var osc;
    var partialGain;
    var release;
    var peak;
    var voice = { nodes: [], gain: voiceGain };

    toneFilter.type = "lowpass";
    toneFilter.frequency.value = 900 + (warmth * 3200);
    toneFilter.Q.value = 0.45;

    voiceGain.connect(toneFilter);
    toneFilter.connect(dryGain);
    toneFilter.connect(reverbSend);

    peak = source === "user" ? 0.42 : 0.28;
    peak *= velocity;

    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.exponentialRampToValueAtTime(peak, now + 0.008);
    voiceGain.gain.exponentialRampToValueAtTime(peak * 0.55, now + 0.12);

    release = source === "user" ? 2.4 : 1.6;
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + release);

    playHammerNoise(now, item.freq, velocity * (source === "user" ? 0.22 : 0.12), voice);

    for (i = 0; i < pianoPartials.length; i += 1) {
      partial = pianoPartials[i];
      osc = audio.createOscillator();
      partialGain = audio.createGain();
      osc.type = i < 2 ? "triangle" : "sine";
      osc.frequency.value = item.freq * partial.ratio * (1 + ((i % 2) * 0.0015));
      partialGain.gain.setValueAtTime(partial.gain * velocity * 0.14, now);
      partialGain.gain.exponentialRampToValueAtTime(0.0001, now + partial.decay);
      osc.connect(partialGain);
      partialGain.connect(voiceGain);
      osc.start(now);
      osc.stop(now + partial.decay + 0.05);
      voice.nodes.push(osc);
      voice.nodes.push(partialGain);
    }

    voice.nodes.push(toneFilter);
    activeNotes[voiceId] = voice;
    voiceOrder.push(voiceId);

    window.setTimeout(function () {
      removeVoice(voiceId);
    }, Math.ceil(release * 1000) + 120);
  }

  function playHammerNoise(start, freq, amount, voice) {
    var length = Math.floor(audio.sampleRate * 0.04);
    var buffer = audio.createBuffer(1, length, audio.sampleRate);
    var data = buffer.getChannelData(0);
    var i;
    var source;
    var filter;
    var gain;

    for (i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }

    source = audio.createBufferSource();
    filter = audio.createBiquadFilter();
    gain = audio.createGain();
    source.buffer = buffer;
    filter.type = "bandpass";
    filter.frequency.value = Math.min(4200, freq * 6);
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(amount, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.035);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(voice.gain);
    source.start(start);
    source.stop(start + 0.05);
    voice.nodes.push(source);
    voice.nodes.push(filter);
    voice.nodes.push(gain);
  }

  function playBassNote(item, velocity) {
    var now = audio.currentTime;
    var osc = audio.createOscillator();
    var gain = audio.createGain();
    var filter = audio.createBiquadFilter();

    osc.type = "sine";
    osc.frequency.value = item.freq * 0.5;
    filter.type = "lowpass";
    filter.frequency.value = 280;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18 * velocity, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dryGain);
    osc.start(now);
    osc.stop(now + 0.6);
  }

  function playBrush(velocity) {
    var now = audio.currentTime;
    var length = Math.floor(audio.sampleRate * 0.06);
    var buffer = audio.createBuffer(1, length, audio.sampleRate);
    var data = buffer.getChannelData(0);
    var i;
    var source;
    var filter;
    var gain;

    for (i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }

    source = audio.createBufferSource();
    filter = audio.createBiquadFilter();
    gain = audio.createGain();
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = 5200;
    gain.gain.setValueAtTime(0.06 * velocity, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(dryGain);
    source.start(now);
    source.stop(now + 0.07);
  }

  function limitVoices() {
    while (voiceOrder.length >= maxVoices) {
      stopVoice(voiceOrder[0]);
    }
  }

  function stopVoice(voiceId) {
    var voice = activeNotes[voiceId];
    var i;

    if (!voice) {
      removeVoice(voiceId);
      return;
    }

    try {
      voice.gain.gain.value = 0.0001;
      for (i = 0; i < voice.nodes.length; i += 1) {
        if (voice.nodes[i].stop) {
          voice.nodes[i].stop(0);
        }
      }
    } catch (ignore) {
    }

    removeVoice(voiceId);
  }

  function removeVoice(voiceId) {
    var i;
    delete activeNotes[voiceId];
    for (i = voiceOrder.length - 1; i >= 0; i -= 1) {
      if (voiceOrder[i] === voiceId) {
        voiceOrder.splice(i, 1);
      }
    }
  }

  function stopAllNotes() {
    var copy = voiceOrder.slice(0);
    var i;
    for (i = 0; i < copy.length; i += 1) {
      stopVoice(copy[i]);
    }
  }

  function showPad(item) {
    var pad = document.getElementById("pad-" + item.code);
    if (!pad) {
      return;
    }
    pad.className = "pad is-active";
    window.setTimeout(function () {
      pad.className = "pad";
    }, 140);
  }

  function showBubble(item) {
    var bubble = document.createElement("span");
    var index = findNoteIndex(item);
    var left = 6 + (index * 9.7);

    bubble.className = "bubble";
    bubble.style.left = left + "%";
    bubble.style.backgroundColor = item.color;
    noteTrail.appendChild(bubble);

    window.setTimeout(function () {
      if (bubble.parentNode) {
        bubble.parentNode.removeChild(bubble);
      }
    }, 1600);
  }

  function startJam() {
    if (!audio) {
      return;
    }

    stopJam();
    jamBeat = 0;
    jamNextBeat = audio.currentTime + 0.05;
    scheduleJam();
  }

  function stopJam() {
    if (jamTimer !== null) {
      window.clearTimeout(jamTimer);
      jamTimer = null;
    }
    if (beatPulse) {
      beatPulse.className = "beat-pulse";
    }
  }

  function scheduleJam() {
    var beatDuration = 60 / jamTempo;
    var delayMs;
    var now;

    if (!jamOn || !audio) {
      return;
    }

    now = audio.currentTime;
    while (jamNextBeat <= now + 0.12) {
      playJamBeat(jamBeat, jamNextBeat);
      jamBeat += 1;
      jamNextBeat += beatDuration;
    }

    delayMs = Math.max(20, (jamNextBeat - audio.currentTime) * 1000 - 30);
    jamTimer = window.setTimeout(scheduleJam, delayMs);
  }

  function playJamBeat(beat, time) {
    var stepInBar = beat % 8;
    var pattern = arpPatterns[arpPatternIndex];
    var arpOffset = pattern[arpStep % pattern.length];
    var arpIndex = clampIndex(jamRoot + arpOffset - 2);
    var bassIndex = clampIndex(jamRoot - 2);
    var padIndex = clampIndex(jamRoot);
    var idleBoost = nowMs() - lastUserTime > 8000;

    if (stepInBar % 2 === 0) {
      playScheduledNote(notes[arpIndex], 0.62, time);
      arpStep += 1;
    }

    if (stepInBar === 0 || stepInBar === 4) {
      playScheduledNote(notes[padIndex], 0.34, time);
      playBassAt(notes[bassIndex], 0.7, time);
    }

    if (stepInBar === 2 || stepInBar === 6) {
      playBrushAt(0.55, time);
    }

    if (idleBoost && stepInBar === 0) {
      jamRoot = clampIndex(jamRoot + (beat % 2 === 0 ? 1 : -1));
    }

    pulseBeat(stepInBar === 0);
  }

  function playScheduledNote(item, velocity, time) {
    var now = time;
    var warmth = parseInt(warmthControl.value, 10) / 100;
    var voiceGain = audio.createGain();
    var toneFilter = audio.createBiquadFilter();
    var i;
    var partial;
    var osc;
    var partialGain;

    limitVoices();
    toneFilter.type = "lowpass";
    toneFilter.frequency.value = 900 + (warmth * 3200);
    voiceGain.connect(toneFilter);
    toneFilter.connect(dryGain);
    toneFilter.connect(reverbSend);
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.exponentialRampToValueAtTime(0.24 * velocity, now + 0.01);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);

    for (i = 0; i < 4; i += 1) {
      partial = pianoPartials[i];
      osc = audio.createOscillator();
      partialGain = audio.createGain();
      osc.type = "triangle";
      osc.frequency.value = item.freq * partial.ratio;
      partialGain.gain.setValueAtTime(partial.gain * velocity * 0.1, now);
      partialGain.gain.exponentialRampToValueAtTime(0.0001, now + partial.decay * 0.7);
      osc.connect(partialGain);
      partialGain.connect(voiceGain);
      osc.start(now);
      osc.stop(now + partial.decay);
    }
  }

  function playBassAt(item, velocity, time) {
    var osc = audio.createOscillator();
    var gain = audio.createGain();
    var filter = audio.createBiquadFilter();

    osc.type = "sine";
    osc.frequency.value = item.freq * 0.5;
    filter.type = "lowpass";
    filter.frequency.value = 240;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.14 * velocity, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.5);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dryGain);
    osc.start(time);
    osc.stop(time + 0.55);
  }

  function playBrushAt(velocity, time) {
    var length = Math.floor(audio.sampleRate * 0.05);
    var buffer = audio.createBuffer(1, length, audio.sampleRate);
    var data = buffer.getChannelData(0);
    var i;
    var source;
    var filter;
    var gain;

    for (i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    }

    source = audio.createBufferSource();
    filter = audio.createBiquadFilter();
    gain = audio.createGain();
    source.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = 5000;
    gain.gain.setValueAtTime(0.045 * velocity, time);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(dryGain);
    source.start(time);
    source.stop(time + 0.06);
  }

  function clampIndex(index) {
    if (index < 0) {
      return 0;
    }
    if (index >= notes.length) {
      return notes.length - 1;
    }
    return index;
  }

  function pulseBeat(strong) {
    if (!beatPulse) {
      return;
    }
    beatPulse.className = strong ? "beat-pulse is-strong" : "beat-pulse is-soft";
    window.setTimeout(function () {
      beatPulse.className = "beat-pulse";
    }, strong ? 160 : 90);
  }

  function setStatus(message) {
    status.innerHTML = "";
    status.appendChild(document.createTextNode(message));
  }

  init();
}());
