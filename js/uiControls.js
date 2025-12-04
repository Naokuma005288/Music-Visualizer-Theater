const UIControls = (function () {
  let config = null;

  let fileInput;
  let playPauseBtn;
  let seekBar;
  let volumeSlider;
  let sensitivitySlider;
  let barCountSlider;
  let modeSelect;
  let themeSelect;
  let playbackRateSelect;
  let repeatModeSelect;
  let shuffleBtn;
  let setALoopBtn;
  let setBLoopBtn;
  let toggleABLoopBtn;
  let playlistToggleBtn;
  let playlistPanel;
  let playlistCloseBtn;
  let playlistList;
  let fullscreenBtn;
  let ambientBtn;
  let currentTimeLabel;
  let durationLabel;
  let statusText;
  let fpsText;
  let visualizerContainer;
  let appRoot;
  let bgVideo;

  // プレイリスト
  let playlist = [];
  let currentIndex = -1;
  let repeatMode = "all";
  let shuffle = false;

  // A-B loop (UI側でも状態保持)
  let loopA = null;
  let loopB = null;
  let abLoopEnabled = false;

  function init(configObject) {
    config = configObject;

    fileInput = document.getElementById("fileInput");
    playPauseBtn = document.getElementById("playPauseBtn");
    seekBar = document.getElementById("seekBar");
    volumeSlider = document.getElementById("volumeSlider");
    sensitivitySlider = document.getElementById("sensitivitySlider");
    barCountSlider = document.getElementById("barCountSlider");
    modeSelect = document.getElementById("modeSelect");
    themeSelect = document.getElementById("themeSelect");
    playbackRateSelect = document.getElementById("playbackRateSelect");
    repeatModeSelect = document.getElementById("repeatModeSelect");
    shuffleBtn = document.getElementById("shuffleBtn");
    setALoopBtn = document.getElementById("setALoopBtn");
    setBLoopBtn = document.getElementById("setBLoopBtn");
    toggleABLoopBtn = document.getElementById("toggleABLoopBtn");
    playlistToggleBtn = document.getElementById("playlistToggleBtn");
    playlistPanel = document.getElementById("playlistPanel");
    playlistCloseBtn = document.getElementById("playlistCloseBtn");
    playlistList = document.getElementById("playlistList");
    fullscreenBtn = document.getElementById("fullscreenBtn");
    ambientBtn = document.getElementById("ambientBtn");
    currentTimeLabel = document.getElementById("currentTime");
    durationLabel = document.getElementById("duration");
    statusText = document.getElementById("statusText");
    fpsText = document.getElementById("fpsText");
    visualizerContainer = document.getElementById("visualizerContainer");
    appRoot = document.querySelector(".app");
    bgVideo = document.getElementById("bgVideo");

    AudioEngine.setVideoElement(bgVideo);

    // 初期値
    modeSelect.value = config.mode || "bars";
    themeSelect.value = config.theme || "dark";
    volumeSlider.value =
      config.volume != null ? config.volume : 0.8;
    sensitivitySlider.value =
      config.sensitivity != null ? config.sensitivity : 1.0;
    barCountSlider.value =
      config.barCount != null ? config.barCount : 64;

    const pr = config.playbackRate != null ? config.playbackRate : 1.0;
    playbackRateSelect.value = String(pr);
    AudioEngine.setPlaybackRate(pr);

    repeatMode = config.repeatMode || "all";
    repeatModeSelect.value = repeatMode;

    shuffle = !!config.shuffle;
    if (shuffle) shuffleBtn.classList.add("active");

    applyTheme(config.theme || "dark");
    applyAmbient(!!config.ambientMode);
    AudioEngine.setVolume(parseFloat(volumeSlider.value));

    bindEvents();

    Visualizer.setFpsCallback((fps) => {
      fpsText.textContent = `FPS: ${fps.toFixed(0)}`;
    });

    requestAnimationFrame(updateLoop);
  }

  function bindEvents() {
    fileInput.addEventListener("change", (e) => {
      const files = e.target.files;
      handleFiles(files);
    });

    ["dragenter", "dragover"].forEach((type) => {
      visualizerContainer.addEventListener(type, (e) => {
        e.preventDefault();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = "copy";
        }
        visualizerContainer.classList.add("drag-over");
        statusText.textContent = "ここに音楽 / 動画ファイルをドロップ";
      });
    });

    ["dragleave", "drop"].forEach((type) => {
      visualizerContainer.addEventListener(type, (e) => {
        e.preventDefault();
        visualizerContainer.classList.remove("drag-over");
        if (type === "dragleave" && !AudioEngine.isPlaying()) {
          statusText.textContent =
            "音楽 / 動画ファイルを選択してください";
        }
      });
    });

    visualizerContainer.addEventListener("drop", (e) => {
      const files = e.dataTransfer && e.dataTransfer.files;
      handleFiles(files);
    });

    playPauseBtn.addEventListener("click", () => {
      AudioEngine.togglePlay();
      updatePlayButton();
    });

    volumeSlider.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      AudioEngine.setVolume(v);
      Config.set("volume", v);
    });

    seekBar.addEventListener("input", (e) => {
      const ratio = parseFloat(e.target.value) / 100;
      AudioEngine.seekTo(ratio);
    });

    sensitivitySlider.addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      Config.set("sensitivity", v);
      statusText.textContent = `感度: x${v.toFixed(2)}`;
      flashVisualizer();
    });

    barCountSlider.addEventListener("input", (e) => {
      const v = parseInt(e.target.value, 10);
      Config.set("barCount", v);
      statusText.textContent = `Detail: ${v} bars`;
      flashVisualizer();
    });

    modeSelect.addEventListener("change", (e) => {
      const mode = e.target.value;
      Config.set("mode", mode);
      Visualizer.setMode(mode);
      statusText.textContent = `モード: ${mode}`;
      flashVisualizer();
    });

    themeSelect.addEventListener("change", (e) => {
      const theme = e.target.value;
      Config.set("theme", theme);
      applyTheme(theme);
      statusText.textContent = `Theme: ${theme}`;
      flashVisualizer();
    });

    playbackRateSelect.addEventListener("change", (e) => {
      const rate = parseFloat(e.target.value) || 1;
      Config.set("playbackRate", rate);
      AudioEngine.setPlaybackRate(rate);
      statusText.textContent = `Speed: ${rate.toFixed(2)}x`;
    });

    repeatModeSelect.addEventListener("change", (e) => {
      repeatMode = e.target.value;
      Config.set("repeatMode", repeatMode);
      statusText.textContent = `Loop mode: ${repeatMode}`;
    });

    shuffleBtn.addEventListener("click", () => {
      shuffle = !shuffle;
      Config.set("shuffle", shuffle);
      shuffleBtn.classList.toggle("active", shuffle);
      statusText.textContent = shuffle
        ? "シャッフル再生 ON"
        : "シャッフル再生 OFF";
    });

    // A-B ループ
    setALoopBtn.addEventListener("click", () => {
      const t = AudioEngine.getCurrentTime();
      loopA = t;
      if (loopB != null && loopB <= loopA) loopB = null;
      abLoopEnabled = true;
      syncABLoopToEngine();
      updateABButtons();
      statusText.textContent = `A: ${formatTime(loopA)}`;
    });

    setBLoopBtn.addEventListener("click", () => {
      const t = AudioEngine.getCurrentTime();
      loopB = t;
      if (loopA != null && loopB <= loopA) {
        const tmp = loopA;
        loopA = loopB;
        loopB = tmp;
      }
      abLoopEnabled = true;
      syncABLoopToEngine();
      updateABButtons();
      if (loopA != null && loopB != null) {
        statusText.textContent = `A-B: ${formatTime(loopA)}〜${formatTime(
          loopB
        )}`;
      } else {
        statusText.textContent = "B 点を設定しました";
      }
    });

    toggleABLoopBtn.addEventListener("click", () => {
      abLoopEnabled = !abLoopEnabled;
      AudioEngine.setABLoopEnabled(abLoopEnabled);
      updateABButtons();
      statusText.textContent = abLoopEnabled
        ? "A-Bループ ON"
        : "A-Bループ OFF";
    });

    // プレイリスト
    playlistToggleBtn.addEventListener("click", () => {
      togglePlaylistPanel();
    });

    playlistCloseBtn.addEventListener("click", () => {
      togglePlaylistPanel(false);
    });

    fullscreenBtn.addEventListener("click", () => {
      toggleFullscreen();
    });

    ambientBtn.addEventListener("click", () => {
      const next = !config.ambientMode;
      config.ambientMode = next;
      Config.set("ambientMode", next);
      applyAmbient(next);
      statusText.textContent = next
        ? "Ambient mode ON（マウスを動かすとUIが戻ります）"
        : "Ambient mode OFF";
    });

    AudioEngine.setOnEnded(() => {
      handleTrackEnd();
    });

    window.addEventListener("keydown", (e) => {
      // 入力中はショートカット無効
      const tag = (e.target && e.target.tagName) || "";
      if (
        ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag)
      ) {
        return;
      }

      if (e.key === "Escape" && config.ambientMode) {
        config.ambientMode = false;
        Config.set("ambientMode", false);
        applyAmbient(false);
        statusText.textContent = "Ambient mode OFF";
        return;
      }

      switch (e.key) {
        case " ":
          e.preventDefault();
          AudioEngine.togglePlay();
          updatePlayButton();
          break;
        case "ArrowRight":
          e.preventDefault();
          AudioEngine.seekRelative(5);
          break;
        case "ArrowLeft":
          e.preventDefault();
          AudioEngine.seekRelative(-5);
          break;
        case "ArrowUp":
          e.preventDefault();
          adjustVolume(0.05);
          break;
        case "ArrowDown":
          e.preventDefault();
          adjustVolume(-0.05);
          break;
        case "n":
        case "N":
          e.preventDefault();
          playNext(true);
          break;
        case "p":
        case "P":
          e.preventDefault();
          playPrev(true);
          break;
        case "l":
        case "L":
          e.preventDefault();
          abLoopEnabled = !abLoopEnabled;
          AudioEngine.setABLoopEnabled(abLoopEnabled);
          updateABButtons();
          statusText.textContent = abLoopEnabled
            ? "A-Bループ ON（Lキー）"
            : "A-Bループ OFF（Lキー）";
          break;
        default:
          break;
      }
    });
  }

  function handleFiles(fileList) {
    if (!fileList || !fileList.length) return;

    const files = Array.from(fileList).filter((f) =>
      (f.type || "").startsWith("audio/") ||
      (f.type || "").startsWith("video/") ||
      /\.(mp3|wav|ogg|flac|m4a|mp4|webm)$/i.test(f.name)
    );
    if (!files.length) return;

    playlist = files.map((file, idx) => ({
      id: `${Date.now()}_${idx}`,
      file,
      name: file.name
    }));
    currentIndex = 0;

    renderPlaylist();
    loadCurrentTrack(true);
    if (!playlistPanel.classList.contains("open")) {
      togglePlaylistPanel(true);
    }
  }

  function loadCurrentTrack(autoPlay) {
    if (currentIndex < 0 || currentIndex >= playlist.length) return;
    const track = playlist[currentIndex];
    statusText.textContent = `読み込み中: ${track.name}`;
    playPauseBtn.disabled = true;

    AudioEngine.loadFile(track.file, () => {
      statusText.textContent = `再生中: ${track.name}`;
      playPauseBtn.disabled = false;

      const rate = parseFloat(playbackRateSelect.value) || 1;
      AudioEngine.setPlaybackRate(rate);

      syncABLoopToEngine();
      if (autoPlay) {
        AudioEngine.play();
      }
      updatePlayButton();
      renderPlaylist();
    });
  }

  function handleTrackEnd() {
    if (playlist.length === 0) {
      updatePlayButton();
      return;
    }

    if (repeatMode === "one") {
      loadCurrentTrack(true);
      return;
    }

    let nextIndex = currentIndex;

    if (shuffle && playlist.length > 1) {
      do {
        nextIndex = Math.floor(Math.random() * playlist.length);
      } while (nextIndex === currentIndex);
    } else {
      nextIndex = currentIndex + 1;
    }

    if (nextIndex >= playlist.length) {
      if (repeatMode === "all") {
        nextIndex = 0;
      } else {
        // そのまま止める
        statusText.textContent = "再生終了";
        updatePlayButton();
        return;
      }
    }

    currentIndex = nextIndex;
    loadCurrentTrack(true);
  }

  function playNext(manual) {
    if (playlist.length === 0) return;
    let nextIndex = currentIndex + 1;
    if (nextIndex >= playlist.length) {
      nextIndex = 0;
    }
    currentIndex = nextIndex;
    loadCurrentTrack(true);
    if (manual) {
      statusText.textContent = `次の曲へ: ${playlist[currentIndex].name}`;
    }
  }

  function playPrev(manual) {
    if (playlist.length === 0) return;
    let prevIndex = currentIndex - 1;
    if (prevIndex < 0) {
      prevIndex = playlist.length - 1;
    }
    currentIndex = prevIndex;
    loadCurrentTrack(true);
    if (manual) {
      statusText.textContent = `前の曲へ: ${playlist[currentIndex].name}`;
    }
  }

  function renderPlaylist() {
    if (!playlistList) return;
    playlistList.innerHTML = "";
    playlist.forEach((track, idx) => {
      const li = document.createElement("li");
      li.className = "playlist-item";
      if (idx === currentIndex) {
        li.classList.add("active");
      }
      li.textContent = track.name;
      li.title = track.name;
      li.addEventListener("click", () => {
        currentIndex = idx;
        loadCurrentTrack(true);
      });
      playlistList.appendChild(li);
    });
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
  }

  function applyAmbient(on) {
    if (!appRoot || !ambientBtn) return;
    if (on) {
      appRoot.classList.add("ambient");
      ambientBtn.classList.add("active");
    } else {
      appRoot.classList.remove("ambient");
      ambientBtn.classList.remove("active");
    }
  }

  function toggleFullscreen() {
    const elem = visualizerContainer;
    if (!document.fullscreenElement) {
      if (elem.requestFullscreen) {
        elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
      }
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  function togglePlaylistPanel(forceOpen) {
    if (!playlistPanel) return;
    const shouldOpen =
      typeof forceOpen === "boolean"
        ? forceOpen
        : !playlistPanel.classList.contains("open");
    playlistPanel.classList.toggle("open", shouldOpen);
  }

  function formatTime(sec) {
    if (!sec || !isFinite(sec)) return "00:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const mm = m.toString().padStart(2, "0");
    const ss = s.toString().padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function updatePlayButton() {
    if (AudioEngine.isPlaying()) {
      playPauseBtn.textContent = "⏸";
      playPauseBtn.title = "一時停止";
    } else {
      playPauseBtn.textContent = "▶";
      playPauseBtn.title = "再生";
    }
  }

  function updateLoop() {
    const currentTime = AudioEngine.getCurrentTime();
    const duration = AudioEngine.getDuration();

    currentTimeLabel.textContent = formatTime(currentTime);
    durationLabel.textContent = formatTime(duration);

    if (duration > 0) {
      const ratio = (currentTime / duration) * 100;
      if (!Number.isNaN(ratio)) {
        seekBar.value = ratio;
      }
    }

    updatePlayButton();
    requestAnimationFrame(updateLoop);
  }

  function flashVisualizer() {
    if (!visualizerContainer) return;
    visualizerContainer.classList.remove("flash");
    void visualizerContainer.offsetWidth; // reflow
    visualizerContainer.classList.add("flash");
  }

  function syncABLoopToEngine() {
    AudioEngine.setLoopPoints(loopA, loopB);
    AudioEngine.setABLoopEnabled(abLoopEnabled);
  }

  function updateABButtons() {
    setALoopBtn.classList.toggle("active", loopA != null);
    setBLoopBtn.classList.toggle("active", loopB != null);
    toggleABLoopBtn.classList.toggle("active", abLoopEnabled);
  }

  function adjustVolume(delta) {
    let v = parseFloat(volumeSlider.value) || 0;
    v = Math.max(0, Math.min(1, v + delta));
    volumeSlider.value = v.toFixed(2);
    AudioEngine.setVolume(v);
    Config.set("volume", v);
  }

  return {
    init
  };
})();
