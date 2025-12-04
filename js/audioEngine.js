const AudioEngine = (function () {
  let audioCtx = null;
  let analyser = null;
  let gainNode = null;

  let audioElement = null;        // 音楽専用
  let videoElement = null;        // 背景動画
  let audioSourceNode = null;     // audioElement 用
  let videoSourceNode = null;     // videoElement 用（再利用）

  let currentMediaElement = null; // 今再生中のメディア
  let currentObjectUrl = null;

  let isReady = false;
  let onEndedCallback = null;
  let currentVolume = 0.8;
  let usingVideo = false;

  function setVideoElement(el) {
    videoElement = el;
  }

  function initContextIfNeeded() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
  }

  function cleanup() {
    // audio用メディアを停止＆解放
    if (audioElement) {
      audioElement.pause();
      audioElement.removeAttribute("src");
      audioElement.load();
      audioElement = null;
    }

    // video（背景）の停止＆クラス解除
    if (videoElement) {
      videoElement.pause();
      videoElement.removeAttribute("src");
      videoElement.load();
      videoElement.classList.remove("active");
    }

    // ソースノードの切断
    if (audioSourceNode) {
      audioSourceNode.disconnect();
      audioSourceNode = null;
    }
    if (videoSourceNode) {
      videoSourceNode.disconnect();
    }

    // Gain / Analyser 切断
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    if (analyser) {
      analyser.disconnect();
      analyser = null;
    }

    // Blob URL解放
    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      currentObjectUrl = null;
    }

    currentMediaElement = null;
    isReady = false;
    usingVideo = false;
  }

  function setupAudioGraphFor(element, isVideo) {
    initContextIfNeeded();

    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    gainNode = audioCtx.createGain();
    gainNode.gain.value = currentVolume;

    if (isVideo) {
      if (!videoSourceNode) {
        videoSourceNode = audioCtx.createMediaElementSource(element);
      }
      videoSourceNode.disconnect();
      videoSourceNode.connect(gainNode);
    } else {
      audioSourceNode = audioCtx.createMediaElementSource(element);
      audioSourceNode.connect(gainNode);
    }

    gainNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  function loadFile(file, onReady) {
    if (!file) return;

    cleanup();

    const type = (file.type || "").toLowerCase();
    const isVideo =
      type.startsWith("video/") || /\.mp4$/i.test(file.name);
    usingVideo = isVideo;

    initContextIfNeeded();

    if (isVideo && videoElement) {
      currentMediaElement = videoElement;
      currentMediaElement.crossOrigin = "anonymous";
      currentMediaElement.loop = true;
      currentMediaElement.muted = false; // 音出す
      videoElement.classList.add("active");
    } else {
      audioElement = new Audio();
      audioElement.crossOrigin = "anonymous";
      audioElement.preload = "auto";
      currentMediaElement = audioElement;
      if (videoElement) {
        videoElement.classList.remove("active");
      }
    }

    currentObjectUrl = URL.createObjectURL(file);
    currentMediaElement.src = currentObjectUrl;

    setupAudioGraphFor(currentMediaElement, isVideo);

    currentMediaElement.oncanplay = () => {
      isReady = true;
      if (typeof onReady === "function") {
        onReady();
      }
    };

    currentMediaElement.onended = () => {
      if (typeof onEndedCallback === "function") {
        onEndedCallback();
      }
    };
  }

  function play() {
    if (!currentMediaElement || !isReady) return;
    if (audioCtx && audioCtx.state === "suspended") {
      audioCtx.resume();
    }
    currentMediaElement
      .play()
      .catch((err) => console.warn("Play error:", err));
  }

  function pause() {
    if (!currentMediaElement) return;
    currentMediaElement.pause();
  }

  function togglePlay() {
    if (!currentMediaElement || !isReady) return;
    if (currentMediaElement.paused) {
      play();
    } else {
      pause();
    }
  }

  function setVolume(v) {
    currentVolume = v;
    if (gainNode) {
      gainNode.gain.value = v;
    }
  }

  function seekTo(ratio) {
    if (!currentMediaElement || !isReady) return;
    const duration = currentMediaElement.duration;
    if (!isFinite(duration) || duration <= 0) return;
    const time = duration * Math.min(Math.max(ratio, 0), 1);
    currentMediaElement.currentTime = time;
  }

  function getCurrentTime() {
    if (!currentMediaElement || !isReady) return 0;
    return currentMediaElement.currentTime || 0;
  }

  function getDuration() {
    if (!currentMediaElement || !isReady) return 0;
    const d = currentMediaElement.duration;
    return isFinite(d) ? d : 0;
  }

  function isPlaying() {
    return !!(
      currentMediaElement &&
      !currentMediaElement.paused &&
      !currentMediaElement.ended
    );
  }

  function getAnalyser() {
    return analyser;
  }

  function setOnEnded(cb) {
    onEndedCallback = cb;
  }

  return {
    setVideoElement,
    loadFile,
    play,
    pause,
    togglePlay,
    setVolume,
    seekTo,
    getCurrentTime,
    getDuration,
    isPlaying,
    getAnalyser,
    setOnEnded
  };
})();
