const AudioEngine = (function () {
  let audioCtx = null;
  let analyser = null;
  let analyserConnected = false; // ★ 1回だけ destination に繋ぐ用

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

  // --- AudioContext 初期化 / 接続 ---

  function ensureContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
    }
    // ★ ここで必ずスピーカーに繋ぐ
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
    audioElement.muted = false; // 念のため
    return audioElement;
  }

  function setVideoElement(el) {
    videoElement = el;
    if (videoElement) {
      videoElement.muted = false;      // 音を出したいのでミュート解除
      videoElement.playsInline = true; // iOS向け
    }
  }

  function connectMediaElement(el) {
    if (!el) return;
    ensureContext();

    let node = mediaSourceMap.get(el);
    if (!node) {
      node = audioCtx.createMediaElementSource(el);
      mediaSourceMap.set(el, node);
      node.connect(analyser); // analyser -> destination は ensureContext() 内で1回だけ
    }
  }

  // --- A-B ループチェック ---

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

  // --- ファイル読み込み ---

  function loadFile(file, callback) {
    if (!file) return;

    const type = (file.type || "").toLowerCase();
    const name = file.name || "";
    const isVideo =
      type.startsWith("video/") || /\.(mp4|webm|mkv)$/i.test(name);

    // 以前の ObjectURL を解放
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
      // 動画として再生
      el = videoElement;
      el.classList.add("active");
    } else {
      // 音声として再生
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
    el.muted = false; // 念のためミュート解除

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

  // --- 再生制御 ---

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

  // --- 時間情報 / シーク ---

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

  // --- 音量 / 再生速度 ---

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

  // --- 解析ノード / コールバック ---

  function getAnalyser() {
    return analyser;
  }

  function setOnEnded(cb) {
    onEndedCallback = cb;
  }

  // --- A-B ループ制御 ---

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

  // --- 公開API ---

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
