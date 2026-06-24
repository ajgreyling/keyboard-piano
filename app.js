(function () {
  var AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  var SEMITONE = Math.pow(2, 1 / 12);

  var audio = null;
  var master = null;
  var reverbSend = null;
  var dryGain = null;
  var reverb = null;
  var compressor = null;

  var sampleBuffers = {};
  var samplesReady = false;
  var samplesLoading = false;
  var sampleFiles = ["C3", "Ds3", "Fs3", "A3", "C4", "Ds4", "Fs4", "A4"];

  var activeNotes = {};
  var heldKeys = {};
  var touchClickGuard = false;
  var maxVoices = 12;
  var voiceOrder = [];

  var jamOn = false;
  var jamRoot = 5;
  var jamNextBeat = 0;
  var jamBeat = 0;
  var jamTimer = null;
  var jamTempo = 72;

  var notes = [
    { key: "A", code: 65, note: "C3", color: "#ffadad", sample: "C3", rate: 1 },
    { key: "S", code: 83, note: "D3", color: "#ffd6a5", sample: "Ds3", rate: SEMITONE * -1 },
    { key: "D", code: 68, note: "E3", color: "#fdffb6", sample: "Fs3", rate: SEMITONE * -2 },
    { key: "F", code: 70, note: "G3", color: "#caffbf", sample: "Fs3", rate: SEMITONE },
    { key: "G", code: 71, note: "A3", color: "#9bf6ff", sample: "A3", rate: 1 },
    { key: "H", code: 72, note: "C4", color: "#a0c4ff", sample: "C4", rate: 1 },
    { key: "J", code: 74, note: "D4", color: "#bdb2ff", sample: "Ds4", rate: SEMITONE * -1 },
    { key: "K", code: 75, note: "E4", color: "#ffc6ff", sample: "Fs4", rate: SEMITONE * -2 },
    { key: "L", code: 76, note: "G4", color: "#f4d35e", sample: "Fs4", rate: SEMITONE },
    { key: ";", code: 186, note: "A4", color: "#ee964b", sample: "A4", rate: 1 }
  ];

  var arpPatterns = [
    [0, 2, 4, 2],
    [0, 3, 4, 2],
    [0, 2, 3, 4],
    [4, 2, 0, 2]
  ];
  var arpPatternIndex = 0;
  var arpStep = 0;

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

    setStatus("Loading grand piano samples...");
    preloadSamples();
  }

  function preloadSamples() {
    var pending = sampleFiles.length;
    var failed = 0;
    var i;

    if (samplesLoading || samplesReady) {
      return;
    }

    samplesLoading = true;
    ensureAudio();

    for (i = 0; i < sampleFiles.length; i += 1) {
      loadSampleFile(sampleFiles[i], function (ok) {
        pending -= 1;
        if (!ok) {
          failed += 1;
        }

        if (pending === 0) {
          samplesLoading = false;
          samplesReady = failed < sampleFiles.length;

          if (samplesReady) {
            setStatus("Grand piano ready. Press Start, then any key to steer the jam.");
          } else {
            setStatus("Could not load piano samples. Check your connection and refresh.");
            startButton.disabled = true;
          }
        }
      });
    }
  }

  function loadSampleFile(name, done) {
    var request = new XMLHttpRequest();
    request.open("GET", "samples/" + name + ".mp3", true);
    request.responseType = "arraybuffer";

    request.onload = function () {
      if (request.status < 200 || request.status >= 300 || !request.response) {
        done(false);
        return;
      }

      audio.decodeAudioData(request.response, function (buffer) {
        sampleBuffers[name] = buffer;
        done(true);
      }, function () {
        done(false);
      });
    };

    request.onerror = function () {
      done(false);
    };

    request.send();
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
      if (!samplesReady) {
        setStatus("Piano samples are still loading. One moment.");
        return;
      }

      ensureAudio();
      jamOn = true;
      jamRoot = 5;
      updateJamButton();
      startJam();
      setStatus("Jam is playing around C4. Press any key to steer a new direction.");
    };

    jamButton.onclick = function () {
      if (!samplesReady) {
        return;
      }

      ensureAudio();
      jamOn = !jamOn;
      updateJamButton();

      if (jamOn) {
        ensureJamRunning();
        setStatus("Jam is playing. Press any key to steer a new direction.");
      } else {
        stopJam();
        clearJamLead();
        setStatus("Jam paused. Press Jam on or play a key to resume.");
      }
    };

    quietButton.onclick = function () {
      jamOn = false;
      updateJamButton();
      stopJam();
      stopAllNotes();
      clearJamLead();
      setStatus("Quiet now. Press Start or any key to play again.");
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

      if (!item || heldKeys[code] || !samplesReady) {
        return;
      }

      heldKeys[code] = true;
      ensureAudio();
      playNote(item, 0.95, "user");

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

    if (item && samplesReady) {
      ensureAudio();
      playNote(item, 0.95, "user");
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
    var changed = idx !== jamRoot;

    jamRoot = idx;
    arpPatternIndex = (arpPatternIndex + 1) % arpPatterns.length;
    arpStep = 0;
    markJamLead(item);

    if (changed) {
      setStatus("Now jamming around " + item.note + ". Keeps playing until you press another key.");
    } else {
      setStatus("Still jamming around " + item.note + ". Press another key to change direction.");
    }
  }

  function updateJamButton() {
    jamButton.className = jamOn ? "secondary-button is-on" : "secondary-button";
    jamButton.innerHTML = "";
    jamButton.appendChild(document.createTextNode(jamOn ? "Jam on" : "Jam off"));
  }

  function markJamLead(item) {
    var i;
    var pad;

    for (i = 0; i < notes.length; i += 1) {
      pad = document.getElementById("pad-" + notes[i].code);
      if (pad) {
        pad.className = "pad";
      }
    }

    pad = document.getElementById("pad-" + item.code);
    if (pad) {
      pad.className = "pad is-leading";
    }
  }

  function clearJamLead() {
    var i;
    var pad;

    for (i = 0; i < notes.length; i += 1) {
      pad = document.getElementById("pad-" + notes[i].code);
      if (pad) {
        pad.className = "pad";
      }
    }
  }

  function enableJamFromUser(item) {
    jamOn = true;
    updateJamButton();
    steerJam(item);
    ensureJamRunning();
  }

  function ensureAudio() {
    if (audio || !AudioContextCtor) {
      resumeAudio();
      return;
    }

    audio = new AudioContextCtor();
    compressor = audio.createDynamicsCompressor();
    compressor.threshold.value = -22;
    compressor.knee.value = 24;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.22;

    dryGain = audio.createGain();
    reverbSend = audio.createGain();
    master = audio.createGain();
    reverb = audio.createConvolver();
    reverb.buffer = buildReverbImpulse(3.1, 2.6);

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
      master.gain.value = volume * 0.9;
    }
  }

  function updateReverbMix() {
    var mix = parseInt(reverbControl.value, 10) / 100;
    if (dryGain && reverbSend) {
      dryGain.gain.value = 1 - (mix * 0.28);
      reverbSend.gain.value = mix * 0.72;
    }
  }

  function warmthCutoff() {
    var warmth = parseInt(warmthControl.value, 10) / 100;
    return 1800 + (warmth * 5200);
  }

  function playNote(item, velocity, source) {
    if (!audio || !master || !samplesReady) {
      return;
    }

    if (source === "user") {
      enableJamFromUser(item);
    }

    limitVoices();
    playSampleVoice(item, velocity, source || "auto", audio.currentTime);
    showPad(item);
    if (source === "user") {
      showBubble(item);
    }
  }

  function playSampleVoice(item, velocity, source, when) {
    var buffer = sampleBuffers[item.sample];
    var voiceId = String(when) + "-" + item.code + "-" + Math.random();
    var sourceNode = audio.createBufferSource();
    var gain = audio.createGain();
    var filter = audio.createBiquadFilter();
    var pan = audio.createStereoPanner ? audio.createStereoPanner() : null;
    var peak;
    var duration;
    var voice;

    if (!buffer) {
      return;
    }

    sourceNode.buffer = buffer;
    sourceNode.playbackRate.value = item.rate;

    filter.type = "lowpass";
    filter.frequency.value = warmthCutoff();
    filter.Q.value = 0.35;

    peak = source === "user" ? 0.78 : 0.42;
    peak *= velocity;

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + 0.006);
    if (source === "auto") {
      gain.gain.exponentialRampToValueAtTime(peak * 0.55, when + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 2.4);
    }

    sourceNode.connect(filter);
    filter.connect(gain);

    if (pan) {
      pan.pan.value = source === "user" ? ((Math.random() * 0.3) - 0.15) : 0;
      gain.connect(pan);
      pan.connect(dryGain);
      pan.connect(reverbSend);
    } else {
      gain.connect(dryGain);
      gain.connect(reverbSend);
    }

    sourceNode.start(when);
    duration = (buffer.duration / item.rate) + 0.05;
    sourceNode.stop(when + duration);

    voice = {
      nodes: [sourceNode, filter, gain, pan],
      gain: gain,
      source: sourceNode
    };
    activeNotes[voiceId] = voice;
    voiceOrder.push(voiceId);

    window.setTimeout(function () {
      removeVoice(voiceId);
    }, Math.ceil(duration * 1000) + 80);
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
      voice.gain.gain.cancelScheduledValues(0);
      voice.gain.gain.setValueAtTime(voice.gain.gain.value, audio.currentTime);
      voice.gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.08);
      if (voice.source && voice.source.stop) {
        voice.source.stop(audio.currentTime + 0.1);
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
    var leading = jamOn && findNoteIndex(item) === jamRoot;
    if (!pad) {
      return;
    }
    pad.className = leading ? "pad is-active is-leading" : "pad is-active";
    window.setTimeout(function () {
      pad.className = leading ? "pad is-leading" : "pad";
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
    if (!audio || !samplesReady) {
      return;
    }

    stopJam();
    jamBeat = 0;
    jamNextBeat = audio.currentTime + 0.05;
    markJamLead(notes[jamRoot]);
    scheduleJam();
  }

  function ensureJamRunning() {
    if (!jamOn || !audio || !samplesReady) {
      return;
    }

    if (jamTimer === null) {
      if (jamNextBeat < audio.currentTime) {
        jamNextBeat = audio.currentTime + 0.05;
      }
      scheduleJam();
    }
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
    var stepInBar = beat % 16;
    var pattern = arpPatterns[arpPatternIndex];
    var arpOffset = pattern[arpStep % pattern.length];
    var arpIndex = clampIndex(jamRoot + arpOffset - 2);
    var padIndex = clampIndex(jamRoot);
    var bassIndex = clampIndex(jamRoot - 2);
    var fifthIndex = clampIndex(jamRoot + 2);

    if (stepInBar % 2 === 0) {
      playSampleVoice(notes[arpIndex], 0.5, "auto", time);
      arpStep += 1;
    }

    if (stepInBar === 0 || stepInBar === 8) {
      playSampleVoice(notes[padIndex], 0.36, "auto", time);
      playSampleVoice(notes[fifthIndex], 0.28, "auto", time);
      playSampleVoice(notes[bassIndex], 0.3, "auto", time);
    }

    if (stepInBar === 4 || stepInBar === 12) {
      playSampleVoice(notes[padIndex], 0.24, "auto", time);
    }

    pulseBeat(stepInBar === 0);
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
