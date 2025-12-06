document.addEventListener("DOMContentLoaded", () => {
  const app = document.getElementById("app");

  // Splash
  const splash = document.getElementById("splash");
  const splashBtn = document.getElementById("splashBtn");
  const splashTip = document.getElementById("splashTip");

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
  const frameEl = document.querySelector(".visualizer-frame");

  const presetButtons = document.querySelectorAll(".preset-btn");
  const btnXFade = document.getElementById("btnXFade");

  const root = document.documentElement;

  // Storage keys
  const SETTINGS_KEY = "ovp-settings";
  const PRESETS_KEY = "ovp-scene-presets";

  // ---- 設定の保存/復元 ----
  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      if (!raw) return {};
      return JSON.parse(raw) || {};
    } catch (e) {
      return {};
    }
  }

  function saveSettings(partial) {
    try {
      const current = loadSettings();
      const next = Object.assign({}, current, partial);
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (e) {
      // ignore
    }
  }

  function loadPresets() {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (!raw) return [];
      const data = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data;
    } catch (e) {
      return [];
    }
  }

  function savePresets() {
    try {
      localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    } catch (e) {
      // ignore
    }
  }

  // ---- Visualizer 設定 ----
  const vizConfig = {
    mode: "bars",
    sensitivity: 1.0,
    theme: "dark",
  };

  Visualizer.init(canvas, vizConfig);
  Visualizer.setFpsCallback((fps) => {
    fpsText.textContent = `FPS: ${fps.toFixed(0)}`;
  });

  let beatTimeoutId = null;
  Visualizer.setBeatCallback((level) => {
    if (!frameEl) return;
    if (level < 0.5) return;
    frameEl.classList.add("viz-beat");
    if (beatTimeoutId) clearTimeout(beatTimeoutId);
    beatTimeoutId = setTimeout(() => {
      frameEl.classList.remove("viz-beat");
    }, 140);
  });

  Visualizer.start();
  AudioEngine.setVideoElement(bgVideo);

  // ---- Splash Tips ----
  const tips = [
    "Tip: A-Bループで好きな区間だけリピートできます。",
    "Tip: Sensを上げるとビジュアライザーが派手になります。",
    "Tip: Modeを変えるとBars / Circle / Waveを切り替えできます。",
    "Tip: Neonテーマで雰囲気がガラッと変わります。",
    "Tip: 設定はブラウザに保存されます。次回起動時もそのまま。",
  ];
  if (splashTip) {
    const tip = tips[Math.floor(Math.random() * tips.length)];
    splashTip.textContent = tip;
  }

  splashBtn.addEventListener("click", () => {
    splash.classList.add("hide");
    setTimeout(() => {
      splash.remove();
      app.classList.add("app-ready");
    }, 550);
  });

  // ---- プレイリスト関連 ----
  const playlist = [];
  let currentIndex = -1;

  // A-Bループ
  let loopA = null;
  let loopB = null;
  let abEnabled = false;

  // シーク操作中フラグ
  let isUserSeeking = false;

  // クロスフェード
  let crossfadeEnabled = false;
  let isCrossfading = false;
  const CROSSFADE_DURATION = 1200; // ms

  // ユーザー指定の基準音量
  let baseVolume = Number(volumeSlider.value) / 100;

  // プリセット
  let presets = loadPresets();

  // スワイプ検出用
  let pointerStartX = null;
  let pointerStartY = null;
  let pointerStartTime = null;

  // ---- ユーティリティ ----
  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }

  function renderPlaylist() {
    playlistList.innerHTML = "";
    playlist.forEach((item, index) => {
      const li = document.createElement("li");
      li.className = "playlist-item";
      if (index === currentIndex) li.classList.add("active");
      li.title = item.name;

      const iconSpan = document.createElement("span");
      iconSpan.className = "playlist-icon";
      iconSpan.textContent = item.isVideo ? "🎬" : "🎵";

      const nameSpan = document.createElement("span");
      nameSpan.className = "playlist-name";
      nameSpan.textContent = item.name;

      li.appendChild(iconSpan);
      li.appendChild(nameSpan);

      li.addEventListener("click", () => {
        playTrackWithOptionalCrossfade(index);
      });

      playlistList.appendChild(li);
    });
  }

  function addFilesToPlaylist(files) {
    files.forEach((file) => {
      const type = (file.type || "").toLowerCase();
      const name = file.name || "unnamed";
      const isVideo =
        type.startsWith("video/") || /\.(mp4|webm|mkv)$/i.test(name);
      playlist.push({ file, name, isVideo });
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
      if (autoPlay) {
        AudioEngine.play();
      }
    });
  }

  function playCurrent() {
    if (currentIndex < 0 && playlist.length > 0) {
      loadTrack(0, true);
      return;
    }
    AudioEngine.play();
  }

  function playNext() {
    if (!playlist.length) return;
    const nextIndex =
      currentIndex < playlist.length - 1 ? currentIndex + 1 : 0;
    playTrackWithOptionalCrossfade(nextIndex);
  }

  function playPrev() {
    if (!playlist.length) return;
    const prevIndex =
      currentIndex > 0 ? currentIndex - 1 : playlist.length - 1;
    playTrackWithOptionalCrossfade(prevIndex);
  }

  AudioEngine.setOnEnded(() => {
    if (playlist.length > 1) {
      const nextIndex =
        currentIndex < playlist.length - 1 ? currentIndex + 1 : 0;
      loadTrack(nextIndex, true);
    } else {
      statusText.textContent = "再生終了";
    }
  });

  // ---- クロスフェード ----
  function fadeVolume(from, to, duration, onDone) {
    const start = performance.now();
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const v = from + (to - from) * t;
      AudioEngine.setVolume(v);
      volumeSlider.value = Math.round(v * 100);
      if (t < 1) {
        requestAnimationFrame(step);
      } else if (onDone) {
        onDone();
      }
    }
    requestAnimationFrame(step);
  }

  function playTrackWithOptionalCrossfade(index) {
    if (index < 0 || index >= playlist.length) return;

    if (!crossfadeEnabled || !AudioEngine.isPlaying()) {
      loadTrack(index, true);
      return;
    }

    if (isCrossfading) return;
    isCrossfading = true;

    const fromVolume = Number(volumeSlider.value) / 100;

    // フェードアウト
    fadeVolume(fromVolume, 0, CROSSFADE_DURATION / 2, () => {
      // 曲切り替え
      loadTrack(index, true);
      AudioEngine.setVolume(0);
      volumeSlider.value = 0;

      // フェードイン
      fadeVolume(0, baseVolume, CROSSFADE_DURATION / 2, () => {
        volumeSlider.value = Math.round(baseVolume * 100);
        isCrossfading = false;
      });
    });
  }

  // ---- プリセット ----
  function updatePresetButtons() {
    presetButtons.forEach((btn) => {
      const idx = Number(btn.dataset.preset);
      const p = presets[idx];
      if (p) {
        btn.textContent = p.name || `P${idx + 1}`;
        btn.classList.add("has-preset");
      } else {
        btn.textContent = `P${idx + 1}`;
        btn.classList.remove("has-preset");
      }
    });
  }

  function applyPreset(p) {
    if (!p) return;

    const theme = p.theme || "dark";
    root.dataset.theme = theme;
    themeToggle.checked = theme === "neon";
    vizConfig.theme = theme;
    Visualizer.setTheme(theme);

    if (p.mode) {
      modeSelect.value = p.mode;
      vizConfig.mode = p.mode;
      Visualizer.setMode(p.mode);
    }

    if (typeof p.sensitivity === "number") {
      const sens = p.sensitivity;
      vizConfig.sensitivity = sens;
      Visualizer.setSensitivity(sens);
      sensitivitySlider.value = Math.round(sens * 100);
    }

    if (typeof p.rate === "number") {
      const rate = p.rate;
      rateSlider.value = Math.round(rate * 100);
      AudioEngine.setPlaybackRate(rate);
    }

    if (typeof p.volume === "number") {
      baseVolume = p.volume;
      volumeSlider.value = Math.round(p.volume * 100);
      AudioEngine.setVolume(p.volume);
    }

    const ambient = !!p.ambient;
    app.classList.toggle("ambient", ambient);
    btnAmbient.classList.toggle("active", ambient);

    saveSettings({
      theme,
      mode: vizConfig.mode,
      sensitivity: vizConfig.sensitivity,
      rate: Number(rateSlider.value) / 100,
      volume: baseVolume,
      ambient,
    });

    statusText.textContent = `プリセット適用: ${p.name || ""}`;
  }

  presetButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number(btn.dataset.preset);
      const existing = presets[idx] || null;
      const isSave = e.shiftKey || !existing;

      if (isSave) {
        const defaultName = existing?.name || `Scene ${idx + 1}`;
        const name =
          prompt(`プリセット P${idx + 1} の名前`, defaultName) ||
          `P${idx + 1}`;

        const ambient = app.classList.contains("ambient");
        const theme = root.dataset.theme || "dark";
        const mode = modeSelect.value;
        const sens = vizConfig.sensitivity;
        const rate = Number(rateSlider.value) / 100;
        const volume = baseVolume;

        presets[idx] = {
          name,
          theme,
          mode,
          sensitivity: sens,
          rate,
          volume,
          ambient,
        };
        savePresets();
        updatePresetButtons();
        statusText.textContent = `プリセット保存: ${name}`;
      } else {
        applyPreset(presets[idx]);
      }
    });
  });

  updatePresetButtons();

  // ---- ファイル入力 / D&D ----
  fileInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    addFilesToPlaylist(files);
    if (currentIndex === -1) {
      loadTrack(0, true);
    }
    fileInput.value = "";
  });

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

  // ---- 再生ボタン ----
  btnPlayPause.addEventListener("click", () => {
    if (!playlist.length) {
      fileInput.click();
      return;
    }
    if (currentIndex === -1) {
      loadTrack(0, true);
      return;
    }
    AudioEngine.togglePlay();
  });

  btnNext.addEventListener("click", () => {
    playNext();
  });

  btnPrev.addEventListener("click", () => {
    playPrev();
  });

  // ---- シークバー ----
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

  // ---- 音量 ----
  volumeSlider.addEventListener("input", () => {
    baseVolume = Number(volumeSlider.value) / 100;
    AudioEngine.setVolume(baseVolume);
    saveSettings({ volume: baseVolume });
  });
  AudioEngine.setVolume(baseVolume);

  // ---- 感度 ----
  sensitivitySlider.addEventListener("input", () => {
    const val = Number(sensitivitySlider.value); // 50〜200
    const s = val / 100; // 0.5〜2.0
    vizConfig.sensitivity = s;
    Visualizer.setSensitivity(s);
    saveSettings({ sensitivity: s });
  });

  // ---- モード ----
  modeSelect.addEventListener("change", () => {
    const mode = modeSelect.value;
    vizConfig.mode = mode;
    Visualizer.setMode(mode);
    saveSettings({ mode });
  });

  // ---- 再生速度 ----
  rateSlider.addEventListener("input", () => {
    const val = Number(rateSlider.value); // 50〜150
    const rate = val / 100; // 0.5〜1.5
    AudioEngine.setPlaybackRate(rate);
    saveSettings({ rate });
  });
  AudioEngine.setPlaybackRate(Number(rateSlider.value) / 100);

  // ---- A / B / A-B ----
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

  // ---- プレイリストパネル ----
  // 右側常駐だけど、ボタンは一応生かしておく（挙動はほぼ変わらない）
  btnPlaylistToggle.addEventListener("click", () => {
    playlistPanel.classList.toggle("open");
  });

  btnPlaylistClose.addEventListener("click", () => {
    playlistPanel.classList.remove("open");
  });

  // ---- テーマ切替 ----
  root.dataset.theme = "dark";
  themeToggle.addEventListener("change", () => {
    const neon = themeToggle.checked;
    const theme = neon ? "neon" : "dark";
    root.dataset.theme = theme;
    vizConfig.theme = theme;
    Visualizer.setTheme(theme);
    saveSettings({ theme });
  });

  // ---- Ambient ----
  btnAmbient.addEventListener("click", () => {
    const active = !app.classList.contains("ambient");
    app.classList.toggle("ambient", active);
    btnAmbient.classList.toggle("active", active);
    saveSettings({ ambient: active });
  });

  // ---- クロスフェードボタン ----
  btnXFade.addEventListener("click", () => {
    crossfadeEnabled = !crossfadeEnabled;
    btnXFade.classList.toggle("active", crossfadeEnabled);
    saveSettings({ crossfade: crossfadeEnabled });
    statusText.textContent = crossfadeEnabled
      ? "クロスフェード: ON"
      : "クロスフェード: OFF";
  });

  // ---- フレームタップ＆スワイプ ----
  function handleFrameTap() {
    if (!playlist.length) {
      fileInput.click();
      return;
    }
    if (currentIndex === -1) {
      loadTrack(0, true);
      return;
    }
    AudioEngine.togglePlay();
  }

  if (frameEl) {
    frameEl.addEventListener("pointerdown", (e) => {
      pointerStartX = e.clientX;
      pointerStartY = e.clientY;
      pointerStartTime = performance.now();
    });

    frameEl.addEventListener("pointerup", (e) => {
      if (pointerStartX == null || pointerStartY == null) {
        handleFrameTap();
        return;
      }
      const dx = e.clientX - pointerStartX;
      const dy = e.clientY - pointerStartY;
      const dt = performance.now() - pointerStartTime;

      const absX = Math.abs(dx);
      const absY = Math.abs(dy);
      const SWIPE_DIST = 60;
      const SWIPE_TIME = 700;

      if (dt < SWIPE_TIME && absX > SWIPE_DIST && absX > absY) {
        if (dx < 0) {
          // 左スワイプ → 次
          playNext();
        } else {
          // 右スワイプ → 前
          playPrev();
        }
      } else {
        handleFrameTap();
      }

      pointerStartX = pointerStartY = pointerStartTime = null;
    });

    frameEl.addEventListener("pointercancel", () => {
      pointerStartX = pointerStartY = pointerStartTime = null;
    });
  }

  // ---- 設定の復元 ----
  (function applySettingsFromStorage() {
    const s = loadSettings();

    if (typeof s.theme === "string") {
      const neon = s.theme === "neon";
      themeToggle.checked = neon;
      root.dataset.theme = s.theme;
      vizConfig.theme = s.theme;
      Visualizer.setTheme(s.theme);
    }

    if (typeof s.mode === "string") {
      modeSelect.value = s.mode;
      vizConfig.mode = s.mode;
      Visualizer.setMode(s.mode);
    }

    if (typeof s.volume === "number") {
      const v = Math.max(0, Math.min(1, s.volume));
      baseVolume = v;
      volumeSlider.value = Math.round(v * 100);
      AudioEngine.setVolume(v);
    }

    if (typeof s.rate === "number") {
      const r = Math.max(0.5, Math.min(1.5, s.rate));
      rateSlider.value = Math.round(r * 100);
      AudioEngine.setPlaybackRate(r);
    }

    if (typeof s.sensitivity === "number") {
      const ss = Math.max(0.5, Math.min(2.0, s.sensitivity));
      sensitivitySlider.value = Math.round(ss * 100);
      vizConfig.sensitivity = ss;
      Visualizer.setSensitivity(ss);
    }

    if (typeof s.ambient === "boolean") {
      app.classList.toggle("ambient", s.ambient);
      btnAmbient.classList.toggle("active", s.ambient);
    }

    if (typeof s.crossfade === "boolean") {
      crossfadeEnabled = s.crossfade;
      btnXFade.classList.toggle("active", crossfadeEnabled);
    }
  })();

  // プリセット読み直し＆ボタン更新
  presets = loadPresets();
  updatePresetButtons();

  // ---- 時間＆再生状態 UI 更新 ----
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

    const playing = AudioEngine.isPlaying();
    app.classList.toggle("playing", playing);
    btnPlayPause.textContent = playing ? "⏸" : "▶";

    requestAnimationFrame(updateTimeLoop);
  }
  updateTimeLoop();
});
