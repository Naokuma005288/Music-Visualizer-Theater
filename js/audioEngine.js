const AudioEngine = (function () {
  let audioCtx = null;
  let analyser = null;
  let gainNode = null;
  let sourceNode = null;

  let mediaElement = null;
  let videoElement = null;
  let audioElement = null;

  let isPlaying = false;
  let onEnded = null;

  let userVolume = 0.8;
  let playbackRate = 1.0;

  let currentObjectURL = null;

  // A-B ループ
  let loopA = null;
  let loopB = null;
  let abLoopEnabled = false;

  const FADE_IN_SEC = 0.5;
  const FADE_OUT_SEC = 0.3;

  // HTMLMediaElement ごとに MediaElementSourceNode を 1 回だけ作って再利用する
  const mediaSourceMap = new WeakMap();

  function ensureContext() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      gainNode = audioCtx.createGain();
      gainNode.gain.value = userVolume;

      // gain -> destination & analyser
      gainNode.connect(audioCtx.destination);
      gainNode.connect(analyser);
    }
  }

  function ensureAudioElement() {
    if (!audioElement) {
      audioElement = document.createElement("audio");
      audioElement.style.display = "none";
      document.body.appendChild(audioElement);
    }
    return audioElement;
  }

  // ★ ここがエラー原因の修正ポイント
  function connectMediaElement(el) {
    if (!el) return;
    ensureContext();

    // この要素用の SourceNode がすでにあれば再利用
    let node = mediaSourceMap.get(el);
    if (!node) {
      node = audioCtx.createMediaElementSource(el); // ★ 1要素につき1回だけ
      mediaSourceMap.set(el, node);
    }

    // 別の要素用 node が前に使われていたら切り離す
    if (sourceNode && sourceNode !== node) {
      try {
        sourceNode.disconnect();
      } catch (e) {
        console.warn(e);
      }
    }

    sourceNode = node;

    // いったん全接続を外してから、gainNode にだけ接続
    try {
      sourceNode.disconnect();
    } catch (e) {
      // 既に外れている場合などのエラーは無視
    }
    sourceNode.connect(gainNode);
  }

  function setVideoElement(el) {
    videoElement = el;
  }

  function resetABLoop() {
    loopA = null;
    loopB = null;
    abLoopEnabled = false;
  }

  function loadFile(file, callback) {
    if (!file) return;

    const type = (file.type || "").toLowerCase();
    const name = file.name || "";
    const isVideo =
      type.startsWith("video/") || /\.(mp4|webm|mkv)$/i.test(name);

    // 既存の ObjectURL を解放
    if (currentObjectURL) {
      try {
        URL.revokeObjectURL(currentObjectURL);
      } catch (e) {
        console.warn(e);
      }
      currentObjectURL = null;
    }
    const url = URL.createObjectURL(file);
    currentObjectURL = url;

    ensureContext();

    let el;
    if (isVideo && videoElement) {
      el = videoElement;
      el.classList.add("active");
      el.muted = false;
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
    resetABLoop();
    isPlaying = false;

    el.pause();
    el.src = url;
    el.loop = false;
    el.playbackRate = playbackRate;
    el.currentTime = 0;

    // ★ 再生ごとに node を作り直さず、再利用
    connectMediaElement(el);

    el.onended = () => {
      isPlaying = false;
      if (onEnded) onEnded();
    };

    const onLoadedMetadata = () => {
      el.removeEventListener("loadedmetadata", onLoadedMetadata);
      if (typeof callback === "function") callback();
    };

    el.addEventListener("loadedmetadata", onLoadedMetadata);
    el.load();
  }

  function play() {
    if (!mediaElement) return;
    ensureContext();

    // 念のため、再生前にも現在の mediaElement を接続
    connectMediaElement(mediaElement);

    const resumePromise =
      audioCtx.state === "suspended" ? audioCtx.resume() : Promise.resolve();

    resumePromise
      .then(() => {
        const now = audioCtx.currentTime;
        gainNode.gain.cancelScheduledValues(now);
        const startValue = Math.max(0.0001, gainNode.gain.value);
        gainNode.gain.setValueAtTime(startValue, now);
        gainNode.gain.linearRampToValueAtTime(userVolume, now + FADE_IN_SEC);

        mediaElement.playbackRate = playbackRate;
        mediaElement.play().catch((e) => console.error(e));
        isPlaying = true;
      })
      .catch((e) => console.error(e));
  }

  function pause() {
    if (!mediaElement) {
      isPlaying = false;
      return;
    }
    if (!audioCtx) {
      mediaElement.pause();
      isPlaying = false;
      return;
    }

    const now = audioCtx.currentTime;
    const curValue = gainNode.gain.value;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(curValue, now);
    gainNode.gain.linearRampToValueAtTime(0.0001, now + FADE_OUT_SEC);

    setTimeout(() => {
      mediaElement.pause();
      isPlaying = false;
    }, (FADE_OUT_SEC * 1000) | 0);
  }

  function togglePlay() {
    if (isPlaying) pause();
    else play();
  }

  function isPlayingNow() {
    if (!mediaElement) return false;
    return isPlaying && !mediaElement.paused && !mediaElement.ended;
  }

  function getCurrentTime() {
    if (!mediaElement) return 0;
    let t = mediaElement.currentTime || 0;

    if (
      abLoopEnabled &&
      loopA != null &&
      loopB != null &&
      loopB > loopA &&
      !mediaElement.paused
    ) {
      if (t > loopB) {
        const newT = loopA + 0.02;
        mediaElement.currentTime = newT;
        t = newT;
      }
    }

    return t;
  }

  function getDuration() {
    if (!mediaElement) return 0;
    const d = mediaElement.duration;
    return isFinite(d) ? d : 0;
  }

  function seekTo(ratio) {
    if (!mediaElement) return;
    const duration = getDuration();
    if (!duration) return;

    ratio = Math.max(0, Math.min(1, ratio));
    let t = duration * ratio;

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

  function seekRelative(deltaSec) {
    if (!mediaElement) return;
    const duration = getDuration();
    if (!duration) return;

    let t = getCurrentTime() + deltaSec;
    t = Math.max(0, Math.min(duration, t));

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
    if (!audioCtx || !gainNode) return;
    const now = audioCtx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.linearRampToValueAtTime(userVolume, now + 0.12);
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
    onEnded = cb;
  }

  // A-B loop
  function setLoopPoints(a, b) {
    if (a == null && b == null) {
      loopA = null;
      loopB = null;
      return;
    }
    if (a != null && b != null && b > a) {
      loopA = a;
      loopB = b;
    } else if (a != null && (loopB == null || loopB <= a)) {
      loopA = a;
    } else if (b != null && (loopA == null || b <= loopA)) {
      loopB = b;
    }
  }

  function setABLoopEnabled(flag) {
    abLoopEnabled = !!flag;
  }

  function getLoopState() {
    return {
      a: loopA,
      b: loopB,
      enabled: abLoopEnabled
    };
  }

  return {
    setVideoElement,
    loadFile,
    play,
    pause,
    togglePlay,
    isPlaying: isPlayingNow,
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
    getLoopState
  };
})();
