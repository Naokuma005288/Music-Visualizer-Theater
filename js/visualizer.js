const Visualizer = (function () {
  let canvas = null;
  let ctx = null;
  let config = null;
  let containerEl = null;

  let animationId = null;
  let lastTime = 0;
  let timeSec = 0;
  let fpsCallback = null;

  function init(canvasElement, configObject) {
    canvas = canvasElement;
    ctx = canvas.getContext("2d");
    config = configObject || {};

    // 16:9枠を光らせる
    containerEl =
      canvasElement.closest(".visualizer-frame") ||
      canvasElement.parentElement ||
      null;

    window.addEventListener("resize", resizeCanvas);
    resizeCanvas();
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setMode(mode) {
    if (config) config.mode = mode;
  }

  function setFpsCallback(cb) {
    fpsCallback = cb;
  }

  function start() {
    stop();
    lastTime = performance.now();

    const loop = (timestamp) => {
      animationId = requestAnimationFrame(loop);
      const dt = timestamp - lastTime;
      if (dt <= 0) return;
      lastTime = timestamp;
      timeSec += dt / 1000;

      if (fpsCallback) {
        const fps = 1000 / dt;
        fpsCallback(fps);
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

    const analyser = AudioEngine.getAnalyser();
    const theme = (config && config.theme) || "dark";

    ctx.clearRect(0, 0, width, height);

    if (!analyser) {
      drawBackground(width, height, 0, theme);
      applyContainerGlow(0, theme, width, height);
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    const freqData = new Uint8Array(bufferLength);
    analyser.getByteFrequencyData(freqData);

    // エネルギー（0〜1）
    let energy = 0;
    const sampleCount = Math.min(128, bufferLength);
    for (let i = 0; i < sampleCount; i++) {
      energy += freqData[i] / 255;
    }
    energy /= sampleCount;

    drawBackground(width, height, energy, theme);
    applyContainerGlow(energy, theme, width, height);

    const mode = (config && config.mode) || "bars";
    const sensitivity = (config && config.sensitivity) || 1.0;

    if (mode === "wave") {
      const timeData = new Uint8Array(bufferLength);
      analyser.getByteTimeDomainData(timeData);
      drawWave(timeData, width, height, theme);
    } else if (mode === "circle") {
      drawCircle(freqData, width, height, theme, sensitivity);
    } else {
      drawBars(freqData, width, height, theme, sensitivity);
    }
  }

  function drawBackground(width, height, energy, theme) {
    const t = timeSec;

    const topColor =
      theme === "neon"
        ? "rgba(15, 23, 42, 0.96)"
        : "rgba(15, 23, 42, 0.98)";
    const midAlpha = 0.1 + energy * 0.25;
    const bottomAlpha = 0.25 + energy * 0.35;

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
    grad.addColorStop(0.45 + Math.sin(t * 0.4) * 0.05, midColor);
    grad.addColorStop(1, bottomColor);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height * 0.55;
    const baseR = Math.min(width, height) * 0.35;
    const pulse = 0.2 + energy * 0.8;

    const radial = ctx.createRadialGradient(
      cx,
      cy,
      baseR * 0.1,
      cx,
      cy,
      baseR * (0.7 + pulse * 0.3)
    );
    const glowColor =
      theme === "neon"
        ? `rgba(56, 189, 248, ${0.35 + pulse * 0.4})`
        : `rgba(96, 165, 250, ${0.3 + pulse * 0.4})`;

    radial.addColorStop(0, glowColor);
    radial.addColorStop(1, "transparent");

    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = radial;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
  }

  function applyContainerGlow(energy, theme, width, height) {
    if (!containerEl) return;
    const blur = Math.min(width, height) * (0.015 + energy * 0.08);
    const alpha = 0.18 + energy * 0.5;
    const color = theme === "neon" ? "0,229,255" : "96,165,250";
    containerEl.style.boxShadow = `0 0 ${blur}px rgba(${color}, ${Math.min(
      alpha,
      0.9
    )})`;
  }

  function drawBars(freqData, width, height, theme, sensitivity) {
    const barCount = 64;
    const step = Math.max(1, Math.floor(freqData.length / barCount));
    const usableWidth = width * 0.9;
    const offsetX = (width - usableWidth) / 2;
    const barWidth = (usableWidth / barCount) * 0.7;
    const gap = (usableWidth / barCount) * 0.3;

    ctx.save();
    ctx.translate(offsetX, height);
    ctx.scale(1, -1);

    ctx.shadowBlur = theme === "neon" ? 20 : 14;
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
      const barH = norm * height * 0.8;
      const x = i * (barWidth + gap);

      const hueBase = theme === "neon" ? 190 : 215;
      const hue = hueBase + i * 0.8;
      const grad = ctx.createLinearGradient(x, 0, x, barH);
      grad.addColorStop(
        0,
        `rgba(255,255,255, ${0.12 + norm * 0.3})`
      );
      grad.addColorStop(0.3, `hsla(${hue}, 95%, 65%, 0.95)`);
      grad.addColorStop(1, `hsla(${hue + 15}, 90%, 55%, 0.9)`);

      ctx.fillStyle = grad;
      ctx.fillRect(x, 0, barWidth, barH);
    }

    ctx.restore();
  }

  function drawCircle(freqData, width, height, theme, sensitivity) {
    const barCount = 96;
    const step = Math.max(1, Math.floor(freqData.length / barCount));
    const cx = width / 2;
    const cy = height / 2;
    const baseR = Math.min(width, height) * 0.22;
    const maxExtra = Math.min(width, height) * 0.28;

    ctx.save();
    ctx.translate(cx, cy);

    ctx.lineWidth = 2;
    ctx.shadowBlur = theme === "neon" ? 20 : 14;
    ctx.shadowColor =
      theme === "neon"
        ? "rgba(56, 189, 248, 0.9)"
        : "rgba(129, 140, 248, 0.85)";

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        const idx = i * step + j;
        if (idx >= freqData.length) break;
        sum += freqData[idx];
      }
      const value = (sum / step) * sensitivity;
      const norm = Math.min(value / 255, 1);
      const angle = (i / barCount) * Math.PI * 2 + timeSec * 0.3;

      const radius = baseR + norm * maxExtra;
      const innerX = Math.cos(angle) * baseR;
      const innerY = Math.sin(angle) * baseR;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      const hueBase = theme === "neon" ? 185 : 215;
      const hue = hueBase + i * 1.1;

      ctx.strokeStyle = `hsla(${hue}, 95%, ${
        50 + norm * 20
      }%, ${0.5 + norm * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(x, y);
      ctx.stroke();
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

  function drawWave(timeData, width, height, theme) {
    const len = timeData.length;
    if (!len) return;

    const midY = height / 2;
    const amp = height * 0.4;

    ctx.save();
    ctx.lineWidth = 2;
    ctx.shadowBlur = theme === "neon" ? 20 : 14;
    ctx.shadowColor =
      theme === "neon"
        ? "rgba(56, 189, 248, 0.9)"
        : "rgba(96, 165, 250, 0.9)";
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
    setFpsCallback,
  };
})();
