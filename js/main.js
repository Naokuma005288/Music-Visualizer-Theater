document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");

  // Splash
  const splash = document.getElementById("splash");
  const splashBtn = document.getElementById("splashBtn");

  // Controls
  const fileInput = document.getElementById("fileInput");
  const btnPlayPause = document.getElementById("btnPlayPause");
  const btnPrev = document.getElementById("btnPrev");
  const btnNext = document.getElementById("btnNext");
  const btnPlaylistToggle = document.getElementById("btnPlaylistToggle");
  const btnPlaylistClose = document.getElementById("btnPlaylistClose");

  const playlistPanel = document.getElementById("playlistPanel");
  const playlistList = document.getElementById("playlistList");

  const seekBar = document.getElementById("seekBar");
  const currentTimeLabel = document.getElementById("currentTimeLabel");
  const durationLabel = document.getElementById("durationLabel");

  const volumeSlider = document.getElementById("volumeSlider");
  const sensitivitySlider = document.getElementById("sensitivitySlider");
  const modeSelect = document.getElementById("modeSelect");
  const rateSlider = document.getElementById("rateSlider");

  const btnSetA = document.getElementById("btnSetA");
  const btnSetB = document.getElementById("btnSetB");
  const btnToggleAB = document.getElementById("btnToggleAB");

  const themeToggle = document.getElementById("themeToggle");
  const btnAmbient = document.getElementById("btnAmbient");

  const bgVideo = document.getElementById("bgVideo");
  const canvas = document.getElementById("visualizer");
  const statusText = document.getElementById("statusText");
  const fpsText = document.getElementById("fpsText");
  const visualizerContainer = document.querySelector(".visualizer-container");

  // Visualizer設定
  const vizConfig = {
    mode: "bars",
    sensitivity: 1.0,
    barCount: 64,
    theme: "dark",
  };

  Visualizer.init(canvas, vizConfig);
  Visualizer.setFpsCallback((fps) => {
    fpsText.textContent = `FPS: ${fps.toFixed(0)}`;
  });
  Visualizer.start();

  // Audio engine に video element を教える
  AudioEngine.setVideoElement(bgVideo);

  // Splash
  splashBtn.addEventListener("click", () => {
    splash.classList.add("hide");
    setTimeout(() => {
      splash.remove();
      app.classList.add("app-ready");
    }, 550);
  });

  // プレイリスト
  const playlist = [];
  let currentIndex = -1;

  // A-BループUI側
  let loopA = null;
  let loopB = null;
  let abEnabled = false;

  // シーク中フラグ
  let isUserSeeking = false;

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }

  function updatePlayButton() {
    btnPlayPause.textContent = AudioEngine.isPlaying() ? "⏸" : "▶";
  }

  function renderPlaylist() {
    playlistList.innerHTML = "";
    playlist.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "playlist-item";
      if (index === currentIndex) li.classList.add("active");
      li.textContent = item.name;
      li.addEventListener("click", () => {
        loadTrack(index, true);
      });
      playlistList.appendChild(li);
    });
  }

  function addFilesToPlaylist(files) {
    files.forEach((file) => {
      playlist.push({
        file,
        name: file.name || "unnamed",
      });
    });
    renderPlaylist();
  }

  function loadTrack(index, autoPlay = false) {
    if (index < 0 || index >= playlist.length) return;
    currentIndex = index;
    const item = playlist[index];

    statusText.textContent = `読み込み中: ${item.name}`;
    AudioEngine.loadFile(item.file, () => {
      const dur = AudioEngine.getDuration();
      durationLabel.textContent = formatTime(dur);
      statusText.textContent = `準備完了: ${item.name}`;
      renderPlaylist();
      updatePlayButton();
      if (autoPlay) {
        playCurrent();
      }
    });
  }

  function playCurrent() {
    if (currentIndex < 0 && playlist.length > 0) {
      loadTrack(0, true);
      return;
    }
    AudioEngine.play();
    updatePlayButton();
  }

  function playNext() {
    if (!playlist.length) return;
    const nextIndex =
      currentIndex < playlist.length - 1 ? currentIndex + 1 : 0;
    loadTrack(nextIndex, true);
  }

  function playPrev() {
    if (!playlist.length) return;
    const prevIndex =
      currentIndex > 0 ? currentIndex - 1 : playlist.length - 1;
    loadTrack(prevIndex, true);
  }

  AudioEngine.setOnEnded(() => {
    if (playlist.length > 1) {
      playNext();
    } else {
      statusText.textContent = "再生終了";
      updatePlayButton();
    }
  });

  // ファイル入力
  fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    addFilesToPlaylist(files);
    if (currentIndex === -1) {
      loadTrack(0, true);
    }
    // 同じファイルを連続で選びたい場合用
    fileInput.value = "";
  });

  // D&D対応
  if (visualizerContainer) {
    ["dragenter", "dragover"].forEach((evt) => {
      visualizerContainer.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        visualizerContainer.classList.add("drag-over");
      });
    });

    ["dragleave", "dragend", "drop"].forEach((evt) => {
      visualizerContainer.addEventListener(evt, (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (evt !== "drop") {
          visualizerContainer.classList.remove("drag-over");
        }
      });
    });

    visualizerContainer.addEventListener("drop", (e) => {
      visualizerContainer.classList.remove("drag-over");
      const files = Array.from(e.dataTransfer.files || []);
      if (!files.length) return;
      addFilesToPlaylist(files);
      if (currentIndex === -1) {
        loadTrack(0, true);
      }
    });
  }

  // 再生ボタン
  btnPlayPause.addEventListener("click", () => {
    if (!playlist.length) {
      // 何もないときはファイル選択を開いても良い
      fileInput.click();
      return;
    }
    if (currentIndex === -1) {
      loadTrack(0, true);
      return;
    }
    AudioEngine.togglePlay();
    setTimeout(updatePlayButton, 60);
  });

  btnNext.addEventListener("click", () => {
    playNext();
  });

  btnPrev.addEventListener("click", () => {
    playPrev();
  });

  // シークバー
  seekBar.addEventListener("pointerdown", () => {
    isUserSeeking = true;
  });

  seekBar.addEventListener("pointerup", () => {
    isUserSeeking = false;
    const ratio = Number(seekBar.value) / 1000;
    AudioEngine.seekTo(ratio);
  });

  seekBar.addEventListener("pointerleave", () => {
    if (!isUserSeeking) return;
    isUserSeeking = false;
    const ratio = Number(seekBar.value) / 1000;
    AudioEngine.seekTo(ratio);
  });

  seekBar.addEventListener("input", () => {
    if (!isUserSeeking) return;
    const dur = AudioEngine.getDuration();
    const ratio = Number(seekBar.value) / 1000;
    const pos = dur * ratio;
    currentTimeLabel.textContent = formatTime(pos);
  });

  // 音量
  volumeSlider.addEventListener("input", () => {
    const v = Number(volumeSlider.value) / 100;
    AudioEngine.setVolume(v);
  });
  AudioEngine.setVolume(Number(volumeSlider.value) / 100);

  // 感度
  sensitivitySlider.addEventListener("input", () => {
    const val = Number(sensitivitySlider.value); // 50〜200
    const s = val / 100; // 0.5〜2.0
    vizConfig.sensitivity = s;
  });

  // モード
  modeSelect.addEventListener("change", () => {
    const mode = modeSelect.value;
    vizConfig.mode = mode;
    Visualizer.setMode(mode);
  });

  // 再生速度
  rateSlider.addEventListener("input", () => {
    const val = Number(rateSlider.value); // 50〜150
    const rate = val / 100; // 0.5〜1.5
    AudioEngine.setPlaybackRate(rate);
  });
  AudioEngine.setPlaybackRate(Number(rateSlider.value) / 100);

  // A / B / A-B ボタン
  btnSetA.addEventListener("click", () => {
    const t = AudioEngine.getCurrentTime();
    loopA = t;
    AudioEngine.setLoopPoints(loopA, loopB);
    btnSetA.classList.add("active");
    statusText.textContent = `A 点: ${formatTime(t)}`;
  });

  btnSetB.addEventListener("click", () => {
    const t = AudioEngine.getCurrentTime();
    loopB = t;
    AudioEngine.setLoopPoints(loopA, loopB);
    btnSetB.classList.add("active");
    statusText.textContent = `B 点: ${formatTime(t)}`;
  });

  btnToggleAB.addEventListener("click", () => {
    abEnabled = !abEnabled;
    AudioEngine.setABLoopEnabled(abEnabled);
    btnToggleAB.classList.toggle("active", abEnabled);
    statusText.textContent = abEnabled
      ? "A-B ループ: ON"
      : "A-B ループ: OFF";
  });

  // プレイリストパネル
  btnPlaylistToggle.addEventListener("click", () => {
    playlistPanel.classList.toggle("open");
  });

  btnPlaylistClose.addEventListener("click", () => {
    playlistPanel.classList.remove("open");
  });

  // テーマ切替
  const root = document.documentElement;
  root.dataset.theme = "dark";
  themeToggle.addEventListener("change", () => {
    const neon = themeToggle.checked;
    root.dataset.theme = neon ? "neon" : "dark";
    vizConfig.theme = neon ? "neon" : "dark";
  });

  // Ambient mode
  btnAmbient.addEventListener("click", () => {
    app.classList.toggle("ambient");
    btnAmbient.classList.toggle("active");
  });

  // 時間UI更新ループ
  function updateTimeLoop() {
    const dur = AudioEngine.getDuration();
    const cur = AudioEngine.getCurrentTime();

    if (!isUserSeeking && dur > 0) {
      const ratio = cur / dur;
      seekBar.value = String(Math.round(ratio * 1000));
    }

    currentTimeLabel.textContent = formatTime(cur);
    if (dur > 0) {
      durationLabel.textContent = formatTime(dur);
    } else {
      durationLabel.textContent = "00:00";
    }

    requestAnimationFrame(updateTimeLoop);
  }
  updateTimeLoop();
});
