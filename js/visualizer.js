const Visualizer = (function () {
  let canvas = null;
  let ctx = null;
  let config = null;

  let frameEl = null;
  let containerEl = null;
  let resizeObserver = null;

  let animationId = null;
  let lastTime = 0;
  let timeSec = 0;

  let fpsCallback = null;
  let beatCallback = null;

  // ビート検出用
  let energySmooth = 0;
  let energyPeak = 0;

  function init(canvasElement, configObject) {
    canvas = canvasElement;
    ctx = canvas.getContext("2d");
    config = Object.assign(
      {
        mode: "bars",
        sensitivity: 1.0,
        theme: "dark",
      },
      configObject || {}
    );

    frameEl = canvas.closest(".visualizer-frame");
    containerEl =
      (frameEl && frameEl.closest(".visualizer-container")) ||
      frameEl ||
      canvas.parentElement ||
      null;

    const target = frameEl || canvas.parentElement || canvas;
    if (window.ResizeObserver && target) {
      resizeObserver = new ResizeObserver(() => resizeCanvas());
      resizeObserver.observe(target);
    }
    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
    setTimeout(resizeCanvas, 0);
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    let dpr = window.devicePixelRatio || 1;

    // モバイルは少し軽くする
    if (window.innerWidth <= 768) {
      dpr = Math.min(dpr, 1.5);
    } else {
      dpr = Math.min(dpr, 2.0);
    }

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setMode(mode) {
    if (!config) config = {};
    config.mode = mode;
  }

  function setTheme(theme) {
    if (!config) config = {};
    config.theme = theme;
  }

  function setSensitivity(s) {
    if (!config) config = {};
    config.sensitivity = s;
  }

  function setFpsCallback(cb) {
    fpsCallback = cb;
  }

  function setBeatCallback(cb) {
    beatCallback = cb;
  }

  function start() {
    stop();
    lastTime = performance.now();
    const loop = (ts) => {
      animationId = requestAnimationFrame(loop);
      const dt = ts - lastTime;
      if (dt <= 0) return;
      lastTime = ts;
      timeSec += dt / 1000;

      if (fpsCallback) {
        fpsCallback(1000 / dt);
      }

      drawFrame();
    };
    animationId = requestAnimationFrame(loop);
  }

  function stop() {
    if (animationId) {
      cancelAnimationFrame(animationId);
      animationId = null;
    }
  }

  function drawFrame() {
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    if (!width || !height) return;

    const analyser = AudioEngine.getAnalyser();
    const theme = (config && config.theme) || "dark";

    ctx.clearRect(0, 0, width, height);

    if (!analyser) {
      drawBackground(width, height, 0, 0, theme);
      applyContainerGlow(0, theme, width, height);
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(freqData);

    // 周波数エネルギー
    let low = 0;
    let mid = 0;
    let high = 0;
    const third = Math.floor(bufferLength / 3);

    for (let i = 0; i < bufferLength; i++) {
      const v = freqData[i] / 255;
      if (i < third) low += v;
      else if (i < third * 2) mid += v;
      else high += v;
    }
    low /= third;
    mid /= third;
    high /= third;

    let energy = (low * 0.5 + mid * 0.35 + high * 0.15) || 0;
    energy = Math.min(1, Math.max(0, energy));

    energySmooth = energySmooth * 0.9 + energy * 0.1;
    energyPeak = Math.max(energyPeak * 0.92, energy);

    const sensitivity = (config && config.sensitivity) || 1.0;
    const beatThreshold = energySmooth + 0.12 / sensitivity;
    let beatLevel = 0;
    if (energy > beatThreshold) {
      beatLevel = Math.min(
        1,
        ((energy - beatThreshold) * 4 * sensitivity) || 0
      );
    }

    if (beatCallback && beatLevel > 0.4) {
      beatCallback(beatLevel);
    }

    drawBackground(width, height, energy, beatLevel, theme);
    applyContainerGlow(energy, theme, width, height);

    const mode = (config && config.mode) || "bars";

    if (mode === "wave") {
      const timeData = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(timeData);
      drawWave(timeData, width, height, theme, energy);
    } else if (mode === "circle") {
      drawCircle(freqData, width, height, theme, sensitivity, energy);
    } else {
      drawBars(freqData, width, height, theme, sensitivity, energy);
    }
  }

  function drawBackground(width, height, energy, beatLevel, theme) {
    const t = timeSec;

    const topColor =
      theme === "neon"
        ? "rgba(15, 23, 42, 0.96)"
        : "rgba(15, 23, 42, 0.98)";

    const midAlpha = 0.12 + energy * 0.24;
    const bottomAlpha = 0.25 + energy * 0.3;

    const midColor =
      theme === "neon"
        ? `rgba(56, 189, 248, ${midAlpha})`
        : `rgba(59, 130, 246, ${midAlpha})`;
    const bottomColor =
      theme === "neon"
        ? `rgba(16, 185, 129, ${bottomAlpha})`
        : `rgba(15, 118, 255, ${bottomAlpha})`;

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.45 + Math.sin(t * 0.35) * 0.05, midColor);
    grad.addColorStop(1, bottomColor);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height * 0.55;
    const baseR = Math.min(width, height) * 0.35;

    const pulseBase = 0.18 + energy * 0.4;
    const pulseBeat = beatLevel * 0.5;
    const radial = ctx.createRadialGradient(
      cx,
      cy,
      baseR * 0.15,
      cx,
      cy,
      baseR * (0.7 + pulseBase + pulseBeat * 0.25)
    );
    const glowColor =
      theme === "neon"
        ? `rgba(56, 189, 248, ${0.35 + pulseBase + pulseBeat * 0.5})`
        : `rgba(96, 165, 250, ${0.3 + pulseBase + pulseBeat * 0.45})`;

    radial.addColorStop(0, glowColor);
    radial.addColorStop(1, "transparent");

    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }

  function applyContainerGlow(energy, theme, width, height) {
    if (!containerEl) return;
    const baseBlur = Math.min(width, height) * 0.04;
    const blur = baseBlur + energy * baseBlur * 1.2;
    const alpha = 0.2 + energy * 0.6;
    const color = theme === "neon" ? "56,189,248" : "59,130,246";
    containerEl.style.boxShadow = `0 0 ${blur}px rgba(${color}, ${Math.min(
      alpha,
      0.9
    )})`;
  }

  function drawBars(freqData, width, height, theme, sensitivity, energy) {
    const barCount = 64;
    const step = Math.max(1, Math.floor(freqData.length / barCount));
    const usableWidth = width * 0.9;
    const offsetX = (width - usableWidth) / 2;
    const barWidth = (usableWidth / barCount) * 0.7;
    const gap = (usableWidth / barCount) * 0.3;

    ctx.save();
    ctx.translate(offsetX, height);
    ctx.scale(1, -1);

    ctx.shadowBlur = theme === "neon" ? 26 : 18;
    ctx.shadowColor =
      theme === "neon"
        ? "rgba(56, 189, 248, 0.9)"
        : "rgba(96, 165, 250, 0.85)";

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        const idx = i * step + j;
        if (idx >= freqData.length) break;
        sum += freqData[idx];
      }
      const value = (sum / step) * sensitivity;
      const norm = Math.min(value / 255, 1);

      const baseHeight = height * 0.72;
      const barH = (0.1 + norm * 0.9) * baseHeight;

      const x = i * (barWidth + gap);

      const hueBase = theme === "neon" ? 185 : 215;
      const hue = hueBase + i * 1.2;
      const light = 45 + norm * 25;
      const alpha = 0.35 + norm * 0.5;

      const grad = ctx.createLinearGradient(x, 0, x, barH);
      grad.addColorStop(
        0,
        `rgba(255,255,255, ${0.1 + energy * 0.2})`
      );
      grad.addColorStop(
        0.4,
        `hsla(${hue}, 95%, ${light}%, ${alpha})`
      );
      grad.addColorStop(
        1,
        `hsla(${hue + 20}, 95%, ${light - 10}%, ${alpha})`
      );

      const radius = barWidth / 2;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, barH - radius);
      ctx.quadraticCurveTo(
        x,
        barH,
        x + radius,
        barH
      );
      ctx.lineTo(x + barWidth - radius, barH);
      ctx.quadraticCurveTo(
        x + barWidth,
        barH,
        x + barWidth,
        barH - radius
      );
      ctx.lineTo(x + barWidth, 0);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
  }

  function drawCircle(freqData, width, height, theme, sensitivity, energy) {
    const barCount = 96;
    const step = Math.max(1, Math.floor(freqData.length / barCount));
    const cx = width / 2;
    const cy = height / 2;
    const baseR = Math.min(width, height) * 0.22;
    const maxExtra = Math.min(width, height) * (0.2 + energy * 0.25);

    ctx.save();
    ctx.translate(cx, cy);

    ctx.lineWidth = 2;
    ctx.shadowBlur = theme === "neon" ? 24 : 18;
    ctx.shadowColor =
      theme === "neon"
        ? "rgba(56, 189, 248, 0.9)"
        : "rgba(129, 140, 248, 0.85)";

    const orbitRadius = baseR * (1.1 + energy * 0.4);
    const t = timeSec;

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        const idx = i * step + j;
        if (idx >= freqData.length) break;
        sum += freqData[idx];
      }
      const value = (sum / step) * sensitivity;
      const norm = Math.min(value / 255, 1);
      const angle = (i / barCount) * Math.PI * 2 + t * 0.4;

      const radius = baseR + norm * maxExtra;
      const innerX = Math.cos(angle) * (baseR * 0.9);
      const innerY = Math.sin(angle) * (baseR * 0.9);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      const hueBase = theme === "neon" ? 185 : 215;
      const hue = hueBase + i * 1.5;
      const alpha = 0.3 + norm * 0.5;
      const light = 50 + norm * 20;

      ctx.strokeStyle = `hsla(${hue}, 95%, ${light}%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(x, y);
      ctx.stroke();

      if (norm > 0.45) {
        const orbR = 2 + norm * 4;
        const orbX = Math.cos(angle + t * 0.3) * orbitRadius;
        const orbY = Math.sin(angle + t * 0.3) * orbitRadius;
        ctx.fillStyle = `hsla(${hue + 10}, 98%, 60%, ${
          0.45 + norm * 0.4
        })`;
        ctx.beginPath();
        ctx.arc(orbX, orbY, orbR, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.lineWidth = 2;
    ctx.strokeStyle =
      theme === "neon"
        ? "rgba(56, 189, 248, 0.9)"
        : "rgba(148, 163, 184, 0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, baseR * 1.02, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawWave(timeData, width, height, theme, energy) {
    const len = timeData.length;
    if (!len) return;

    const midY = height / 2;
    const amp = height * (0.3 + energy * 0.3);

    ctx.save();
    ctx.lineWidth = 2;
    ctx.shadowBlur = theme === "neon" ? 24 : 18;
    ctx.shadowColor =
      theme === "neon"
        ? "rgba(56, 189, 248, 0.9)"
        : "rgba(96, 165, 250, 0.9)";

    // メインライン
    ctx.strokeStyle = "rgba(248, 250, 252, 0.96)";
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const v = (timeData[i] - 128) / 128;
      const x = (i / (len - 1)) * width;
      const y = midY + v * amp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // 残像ライン
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.5;
    const offset = 6;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const idx = Math.max(0, i - offset);
      const v = (timeData[idx] - 128) / 128;
      const x = (i / (len - 1)) * width;
      const y = midY + v * amp * 0.85;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 下側グラデーション
    const grad = ctx.createLinearGradient(0, midY, 0, height);
    grad.addColorStop(
      0,
      theme === "neon"
        ? "rgba(56, 189, 248, 0.4)"
        : "rgba(96, 165, 250, 0.35)"
    );
    grad.addColorStop(1, "rgba(15, 23, 42, 0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const v = (timeData[i] - 128) / 128;
      const x = (i / (len - 1)) * width;
      const y = midY + v * amp * 0.9;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  return {
    init,
    start,
    stop,
    setMode,
    setTheme,
    setSensitivity,
    setFpsCallback,
    setBeatCallback,
  };
})();
