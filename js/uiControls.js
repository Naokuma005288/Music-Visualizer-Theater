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
  let fullscreenBtn;
  let ambientBtn;
  let currentTimeLabel;
  let durationLabel;
  let statusText;
  let fpsText;
  let visualizerContainer;
  let appRoot;
  let bgVideo;

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

    modeSelect.value = config.mode || "bars";
    themeSelect.value = config.theme || "dark";
    volumeSlider.value = config.volume != null ? config.volume : 0.8;
    sensitivitySlider.value =
      config.sensitivity != null ? config.sensitivity : 1.0;
    barCountSlider.value = config.barCount != null ? config.barCount : 64;

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
      const file = e.target.files[0];
      loadAudioFile(file);
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
          statusText.textContent = "音楽 / 動画ファイルを選択してください";
        }
      });
    });

    visualizerContainer.addEventListener("drop", (e) => {
      const file =
        e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      loadAudioFile(file);
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

    ambientBtn.addEventListener("click", () => {
      const next = !config.ambientMode;
      config.ambientMode = next;
      Config.set("ambientMode", next);
      applyAmbient(next);
      statusText.textContent = next
        ? "Ambient mode ON（マウスを動かすとUIが戻ります）"
        : "Ambient mode OFF";
    });

    fullscreenBtn.addEventListener("click", () => {
      toggleFullscreen();
    });

    AudioEngine.setOnEnded(() => {
      updatePlayButton();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && config.ambientMode) {
        config.ambientMode = false;
        Config.set("ambientMode", false);
        applyAmbient(false);
        statusText.textContent = "Ambient mode OFF";
      }
    });
  }

  function loadAudioFile(file) {
    if (!file) return;
    statusText.textContent = `読み込み中: ${file.name}`;
    AudioEngine.loadFile(file, () => {
      statusText.textContent = `再生中: ${file.name}`;
      playPauseBtn.disabled = false;
      AudioEngine.play();
      updatePlayButton();
      flashVisualizer();
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

  return {
    init
  };
})();
