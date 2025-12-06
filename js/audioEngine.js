const AudioEngine = (function () {
  let audioCtx = null;
  let analyser = null;
  let analyserConnected = false;

  let mediaElement = null;
  let audioElement = null;
  let videoElement = null;

  const mediaSourceMap = new WeakMap();

  let isPlayingFlag = false;
  let onEndedCallback = null;

  let userVolume = 0.8;
  let playbackRate = 1.0;
  let currentObjectURL = null;

  // A-B ループ
  let loopA = null;
  let loopB = null;
  let abLoopEnabled = false;

  function ensureContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
    }
    if (analyser && !analyserConnected) {
      analyser.connect(audioCtx.destination);
      analyserConnected = true;
    }
  }

  function ensureAudioElement() {
    if (!audioElement) {
      audioElement = document.createElement("audio");
      audioElement.style.display = "none";
      document.body.appendChild(audioElement);
    }
    audioElement.muted = false;
    return audioElement;
  }

  function setVideoElement(el) {
    videoElement = el;
    if (videoElement) {
      videoElement.muted = false;
      videoElement.playsInline = true;
    }
  }

  function connectMediaElement(el) {
    if (!el) return;
    ensureContext();

    let node = mediaSourceMap.get(el);
    if (!node) {
      node = audioCtx.createMediaElementSource(el);
      mediaSourceMap.set(el, node);
      node.connect(analyser);
    }
  }

  function attachLoopHandler(el) {
    if (!el) return;
    el.ontimeupdate = () => {
      if (
        abLoopEnabled &&
        loopA != null &&
        loopB != null &&
        loopB > loopA &&
        el.currentTime > loopB
      ) {
        el.currentTime = loopA + 0.05;
      }
    };
  }

  function loadFile(file, callback) {
    if (!file) return;

    const type = (file.type || "").toLowerCase();
    const name = file.name || "";
    const isVideo =
      type.startsWith("video/") || /\.(mp4|webm|mkv)$/i.test(name);

    if (currentObjectURL) {
      try {
        URL.revokeObjectURL(currentObjectURL);
      } catch (_) {}
      currentObjectURL = null;
    }

    const url = URL.createObjectURL(file);
    currentObjectURL = url;

    ensureContext();

    let el;
    if (isVideo && videoElement) {
      el = videoElement;
      el.classList.add("active");
    } else {
      el = ensureAudioElement();
      if (videoElement) {
        videoElement.pause();
        videoElement.removeAttribute("src");
        videoElement.load();
        videoElement.classList.remove("active");
      }
    }

    mediaElement = el;
    isPlayingFlag = false;

    el.pause();
    el.src = url;
    el.loop = false;
    el.currentTime = 0;
    el.playbackRate = playbackRate;
    el.volume = userVolume;
    el.muted = false;

    connectMediaElement(el);
    attachLoopHandler(el);

    el.onended = () => {
      isPlayingFlag = false;
      if (onEndedCallback) onEndedCallback();
    };

    const onLoaded = () => {
      el.removeEventListener("loadedmetadata", onLoaded);
      if (typeof callback === "function") callback();
    };

    el.addEventListener("loadedmetadata", onLoaded);
    el.load();
  }

  function play() {
    if (!mediaElement) return;
    ensureContext();
    if (audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    mediaElement
      .play()
      .then(() => {
        isPlayingFlag = true;
      })
      .catch((e) => {
        console.error("play() error:", e);
      });
  }

  function pause() {
    if (!mediaElement) return;
    mediaElement.pause();
    isPlayingFlag = false;
  }

  function togglePlay() {
    if (isPlaying()) {
      pause();
    } else {
      play();
    }
  }

  function isPlaying() {
    if (!mediaElement) return false;
    return isPlayingFlag && !mediaElement.paused && !mediaElement.ended;
  }

  function getCurrentTime() {
    if (!mediaElement) return 0;
    return mediaElement.currentTime || 0;
  }

  function getDuration() {
    if (!mediaElement) return 0;
    const d = mediaElement.duration;
    return isFinite(d) ? d : 0;
  }

  function seekTo(ratio) {
    if (!mediaElement) return;
    const dur = getDuration();
    if (!dur) return;

    ratio = Math.max(0, Math.min(1, ratio));
    let t = dur * ratio;

    if (
      abLoopEnabled &&
      loopA != null &&
      loopB != null &&
      loopB > loopA
    ) {
      if (t < loopA) t = loopA;
      if (t > loopB) t = loopB - 0.05;
    }

    mediaElement.currentTime = t;
  }

  function seekRelative(delta) {
    if (!mediaElement) return;
    const dur = getDuration();
    if (!dur) return;

    let t = mediaElement.currentTime + delta;
    t = Math.max(0, Math.min(dur, t));

    if (
      abLoopEnabled &&
      loopA != null &&
      loopB != null &&
      loopB > loopA
    ) {
      if (t < loopA) t = loopA;
      if (t > loopB) t = loopB - 0.05;
    }

    mediaElement.currentTime = t;
  }

  function setVolume(v) {
    userVolume = Math.max(0, Math.min(1, v));
    if (mediaElement) {
      mediaElement.volume = userVolume;
    }
  }

  function setPlaybackRate(rate) {
    playbackRate = rate || 1;
    if (mediaElement) {
      mediaElement.playbackRate = playbackRate;
    }
  }

  function getAnalyser() {
    return analyser;
  }

  function setOnEnded(cb) {
    onEndedCallback = cb;
  }

  function setLoopPoints(a, b) {
    if (a != null) loopA = a;
    if (b != null) loopB = b;
  }

  function setABLoopEnabled(flag) {
    abLoopEnabled = !!flag;
  }

  function getLoopState() {
    return { a: loopA, b: loopB, enabled: abLoopEnabled };
  }

  return {
    setVideoElement,
    loadFile,
    play,
    pause,
    togglePlay,
    isPlaying,
    getCurrentTime,
    getDuration,
    seekTo,
    seekRelative,
    setVolume,
    setPlaybackRate,
    getAnalyser,
    setOnEnded,
    setLoopPoints,
    setABLoopEnabled,
    getLoopState,
  };
})();
