const Visualizer = (function () {
  let canvas = null;
  let ctx = null;
  let config = null;

  // コンテナ（外枠グロー用）
  let containerEl = null;

  let animationId = null;
  let freqArray = null;
  let timeArray = null;
  let smoothArray = null;

  let lastFrameTime = 0;
  let fps = 0;
  let fpsCallback = null;

  let time = 0;
  let rotation = 0;

  const ENERGY_HISTORY_SIZE = 60;
  let energyHistory = [];
  let beatState = {
    energy: 0,
    low: 0,
    mid: 0,
    high: 0,
    flash: 0,
    isBeat: false,
    lastBeatTime: 0
  };

  function init(canvasElement, configObject) {
    canvas = canvasElement;
    ctx = canvas.getContext("2d");
    config = configObject;

    // 親要素（.visualizer-container）を覚えておく
    containerEl = canvasElement.parentElement || null;

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
  }

  function resizeCanvas() {
    if (!canvas || !ctx) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function setMode(newMode) {
    if (config) {
      config.mode = newMode;
    }
  }

  function setFpsCallback(cb) {
    fpsCallback = cb;
  }

  function start() {
    if (!canvas || !ctx) return;
    stop();

    lastFrameTime = performance.now();
    const loop = (timestamp) => {
      animationId = requestAnimationFrame(loop);

      const dtMs = timestamp - lastFrameTime;
      if (dtMs <= 0) return;
      const dt = dtMs / 1000;
      lastFrameTime = timestamp;

      time += dt;
      rotation += dt * 0.35;

      const currentFps = 1 / dt;
      fps = currentFps;
      if (fpsCallback) {
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

  function clearCanvas() {
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function drawFrame() {
    if (!ctx || !canvas) return;

    const analyser = AudioEngine.getAnalyser();
    const width = canvas.width;
    const height = canvas.height;
    const theme = (config && config.theme) || "dark";

    clearCanvas();

    if (!analyser) {
      drawBackground(width, height, 0, theme, beatState);
      if (containerEl) {
        containerEl.style.boxShadow = "none";
      }
      return;
    }

    const bufferLength = analyser.frequencyBinCount;
    if (!freqArray || freqArray.length !== bufferLength) {
      freqArray = new Uint8Array(bufferLength);
      timeArray = new Uint8Array(bufferLength);
      smoothArray = new Float32Array(bufferLength);
      energyHistory = [];
      beatState.energy = 0;
      beatState.low = 0;
      beatState.mid = 0;
      beatState.high = 0;
      beatState.flash = 0;
      beatState.isBeat = false;
      beatState.lastBeatTime = 0;
    }

    analyser.getByteFrequencyData(freqArray);
    const bands = computeBands(freqArray);
    updateBeat(bands);

    const mode = (config && config.mode) || "bars";
    const sensitivity = (config && config.sensitivity) || 1.0;

    // === 外枠グロー（ビートに応じて box-shadow 強化） ===
    if (containerEl) {
      const bf = beatState.flash || 0;
      const energy = beatState.energy || 0;
      const baseBlur = Math.min(width, height) * 0.008; // 基本のぼかし量
      const blur = baseBlur + (Math.min(width, height) * 0.06) * (bf + energy * 0.7);
      const alpha = 0.15 + bf * 0.6 + energy * 0.3;

      const isNeon = theme === "neon";
      const color = isNeon
        ? "0, 229, 255"   // ネオン寄りシアン
        : "96, 165, 250"; // 青系

      containerEl.style.boxShadow = `0 0 ${blur}px rgba(${color}, ${Math.min(
        alpha,
        0.9
      )})`;
    }

    let level = 0;

    // === カメラシェイク（軽め） ===
    ctx.save();
    const beatFlash = beatState.flash || 0;
    const beatEnergy = beatState.energy || 0;
    const baseShake = Math.min(width, height) * 0.005;
    const shakeAmount = baseShake * (beatFlash * 0.8 + beatEnergy * 0.4);
    const shakeX = (Math.random() - 0.5) * shakeAmount * 2;
    const shakeY = (Math.random() - 0.5) * shakeAmount * 2;
    const maxShake = Math.min(width, height) * 0.02;
    const clampedX = Math.max(-maxShake, Math.min(maxShake, shakeX));
    const clampedY = Math.max(-maxShake, Math.min(maxShake, shakeY));
    ctx.translate(clampedX, clampedY);
    // === ここから先の描画はカメラ揺れの影響を受ける ===

    if (mode === "wave") {
      analyser.getByteTimeDomainData(timeArray);
      level = calcLevelFromTime(timeArray);
      drawBackground(width, height, level, theme, beatState);
      drawWave(timeArray, width, height, theme, beatState);
    } else {
      const smoothing = 0.75;
      for (let i = 0; i < bufferLength; i++) {
        const v = freqArray[i];
        const prev = smoothArray[i] || 0;
        smoothArray[i] = prev * smoothing + v * (1 - smoothing);
      }
      level = calcLevelFromFreq(smoothArray);
      drawBackground(width, height, level, theme, beatState);

      if (mode === "bars") {
        drawBars(smoothArray, width, height, theme, sensitivity, beatState);
      } else if (mode === "circle") {
        drawCircle(smoothArray, width, height, theme, sensitivity, beatState);
      }
    }

    ctx.restore(); // カメラ揺れここまで
  }

  function computeBands(data) {
    const n = data.length;
    if (n === 0) {
      return { low: 0, mid: 0, high: 0, energy: 0 };
    }

    const lowEnd = Math.floor(n * 0.15);
    const midEnd = Math.floor(n * 0.5);

    const lowCount = Math.max(1, lowEnd);
    const midCount = Math.max(1, midEnd - lowEnd);
    const highCount = Math.max(1, n - midEnd);

    let low = 0;
    let mid = 0;
    let high = 0;

    for (let i = 0; i < n; i++) {
      const value = data[i] / 255;
      if (i < lowEnd) {
        low += value;
      } else if (i < midEnd) {
        mid += value;
      } else {
        high += value;
      }
    }

    low /= lowCount;
    mid /= midCount;
    high /= highCount;

    const energy = Math.max(0, Math.min((low + mid + high) / 3, 1));

    return { low, mid, high, energy };
  }

  function updateBeat(bands) {
    const energy = bands.energy || 0;
    beatState.energy = energy;
    beatState.low = bands.low || 0;
    beatState.mid = bands.mid || 0;
    beatState.high = bands.high || 0;

    energyHistory.push(energy);
    if (energyHistory.length > ENERGY_HISTORY_SIZE) {
      energyHistory.shift();
    }

    if (energyHistory.length < 15) {
      beatState.isBeat = false;
      beatState.flash *= 0.9;
      if (beatState.flash < 0.01) beatState.flash = 0;
      return;
    }

    let avg = 0;
    for (let i = 0; i < energyHistory.length; i++) {
      avg += energyHistory[i];
    }
    avg /= energyHistory.length;

    let variance = 0;
    for (let i = 0; i < energyHistory.length; i++) {
      const d = energyHistory[i] - avg;
      variance += d * d;
    }
    variance /= energyHistory.length;
    const std = Math.sqrt(variance);

    const sensitivity = (config && config.sensitivity) || 1.0;
    let c = 1.35 - (sensitivity - 1.0) * 0.35;
    c = Math.max(0.6, Math.min(c, 1.6));

    const rawThreshold = avg + std * c;
    const threshold = Math.min(rawThreshold, 0.97);
    const MIN_BEAT_ENERGY = 0.12;
    const MIN_INTERVAL = 0.23;
    const now = time;

    let isBeat = false;
    if (
      energy > threshold &&
      energy > MIN_BEAT_ENERGY &&
      now - beatState.lastBeatTime > MIN_INTERVAL
    ) {
      isBeat = true;
      beatState.lastBeatTime = now;
      const strengthRaw =
        (energy - threshold) / Math.max(0.0001, 1 - threshold);
      const strength = Math.max(0, Math.min(strengthRaw * 1.4, 1));
      beatState.flash = Math.max(beatState.flash, 0.45 + strength * 0.55);
    }

    beatState.isBeat = isBeat;
    beatState.flash *= 0.88;
    if (beatState.flash < 0.01) {
      beatState.flash = 0;
    }
  }

  function calcLevelFromFreq(data) {
    const len = Math.min(64, data.length);
    if (len === 0) return 0;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += data[i];
    }
    return Math.min(sum / len / 255, 1);
  }

  function calcLevelFromTime(data) {
    const len = data.length;
    if (len === 0) return 0;
    let sum = 0;
    for (let i = 0; i < len; i++) {
      const v = Math.abs(data[i] - 128) * 2;
      sum += v;
    }
    return Math.min(sum / len / 255, 1);
  }

  function drawBackground(width, height, level, theme, beat) {
    const t = time;

    const beatEnergy = beat ? beat.energy || 0 : 0;
    const beatFlash = beat ? beat.flash || 0 : 0;

    const topColor =
      theme === "neon"
        ? "rgba(15, 23, 42, 0.92)"
        : "rgba(15, 23, 42, 0.96)";
    const midAlpha =
      0.16 + level * 0.25 + beatEnergy * 0.15 + beatFlash * 0.25;
    const bottomAlpha =
      0.22 + level * 0.3 + beatEnergy * 0.18 + beatFlash * 0.2;

    const midColor =
      theme === "neon"
        ? `rgba(56, 189, 248, ${midAlpha})`
        : `rgba(59, 130, 246, ${midAlpha})`;
    const bottomColor =
      theme === "neon"
        ? `rgba(16, 185, 129, ${bottomAlpha})`
        : `rgba(8, 47, 73, ${bottomAlpha})`;

    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, topColor);
    grad.addColorStop(0.45 + Math.sin(t * 0.5) * 0.04, midColor);
    grad.addColorStop(1, bottomColor);

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height * 0.55;
    const baseRadius = Math.min(width, height) * 0.35;
    const pulse = 0.1 + level * 0.9 + beatEnergy * 0.6 + beatFlash * 0.7;

    const radial = ctx.createRadialGradient(
      centerX,
      centerY,
      baseRadius * 0.1,
      centerX,
      centerY,
      baseRadius * (0.7 + pulse * 0.4)
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

    if (beatFlash > 0.05) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = beatFlash * 0.25;
      ctx.fillStyle =
        theme === "neon"
          ? "rgba(56, 189, 248, 0.9)"
          : "rgba(148, 163, 184, 0.9)";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = 0.24 + level * 0.2 + beatEnergy * 0.15;
    ctx.fillStyle = theme === "neon" ? "#38bdf8" : "#60a5fa";
    ctx.fillRect(0, height * 0.92, width, 1.5);
    ctx.restore();

    const beatLevel = beatEnergy;
    if (beatLevel > 0.12) {
      ctx.save();
      ctx.translate(centerX, centerY);
      const baseR = baseRadius * 0.78;
      const maxR = baseRadius * (1.1 + beatLevel * 0.8 + beatFlash * 0.6);

      for (let i = 0; i < 3; i++) {
        const k = i / 3;
        const r = baseR + (maxR - baseR) * k;
        const alpha =
          (0.18 - k * 0.06) * (0.6 + beatLevel * 0.8 + beatFlash * 0.6);

        ctx.beginPath();
        ctx.strokeStyle =
          theme === "neon"
            ? `rgba(56, 189, 248, ${alpha})`
            : `rgba(129, 140, 248, ${alpha})`;
        ctx.lineWidth = 1.2;
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  function drawBars(data, width, height, theme, sensitivity, beat) {
    const barCount = (config && config.barCount) || 64;
    const step = Math.max(1, Math.floor(data.length / barCount));

    const usableWidth = width * 0.9;
    const offsetX = (width - usableWidth) / 2;
    const barWidth = (usableWidth / barCount) * 0.7;
    const gap = (usableWidth / barCount) * 0.3;

    const beatLow = beat ? beat.low || 0 : 0;
    const beatHigh = beat ? beat.high || 0 : 0;
    const beatFlash = beat ? beat.flash || 0 : 0;

    ctx.save();
    ctx.translate(offsetX, height);
    ctx.scale(1, -1);

    ctx.shadowBlur = theme === "neon" ? 22 : 16;
    ctx.shadowColor =
      theme === "neon"
        ? "rgba(56, 189, 248, 0.9)"
        : "rgba(96, 165, 250, 0.8)";

    const baseLineY = height * 0.02;
    const dynamicGain = 1 + beatFlash * 0.5 + beatLow * 0.15;

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        const idx = i * step + j;
        if (idx >= data.length) break;
        sum += data[idx];
      }
      const value = (sum / step) * sensitivity;
      const normalized = Math.min(value / 255, 1);

      const barHeight = normalized * (height * 0.85) * dynamicGain;
      const x = i * (barWidth + gap);

      const hueBase = theme === "neon" ? 190 : 215;
      const hueBeatShift = beatHigh * 20;
      const hue = hueBase + i * 0.9 + normalized * 35 + hueBeatShift;

      const top = `hsla(${hue}, 90%, 65%, 0.95)`;
      const bottom = `hsla(${hue + 20}, 90%, 55%, 0.9)`;

      const gradient = ctx.createLinearGradient(x, baseLineY, x, barHeight);
      gradient.addColorStop(
        0,
        `rgba(255, 255, 255, ${0.1 + normalized * 0.3 + beatFlash * 0.2})`
      );
      gradient.addColorStop(0.3, top);
      gradient.addColorStop(1, bottom);

      ctx.fillStyle = gradient;
      ctx.fillRect(x, baseLineY, barWidth, barHeight);

      if (barHeight > 4) {
        ctx.fillStyle = `rgba(248, 250, 252, ${
          0.5 + normalized * 0.4 + beatFlash * 0.2
        })`;
        ctx.fillRect(x, baseLineY + barHeight - 3, barWidth, 3);
      }
    }

    ctx.globalAlpha = 0.08 + beatLow * 0.1;
    ctx.fillStyle = theme === "neon" ? "#38bdf8" : "#93c5fd";
    ctx.fillRect(0, 0, usableWidth, baseLineY * 6);
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function drawCircle(data, width, height, theme, sensitivity, beat) {
    const barCount = (config && config.barCount) || 96;
    const step = Math.max(1, Math.floor(data.length / barCount));
    const cx = width / 2;
    const cy = height / 2;
    const baseRadius = Math.min(width, height) * 0.22;
    const maxExtra = Math.min(width, height) * 0.28;

    const beatEnergy = beat ? beat.energy || 0 : 0;
    const beatFlash = beat ? beat.flash || 0 : 0;
    const isNeon = theme === "neon";

    ctx.save();
    ctx.translate(cx, cy);

    ctx.lineWidth = 2;
    ctx.shadowBlur = isNeon ? 20 : 14;
    ctx.shadowColor = isNeon
      ? "rgba(56, 189, 248, 0.9)"
      : "rgba(129, 140, 248, 0.8)";

    const extraScale = 1 + beatFlash * 0.4 + beatEnergy * 0.25;

    for (let i = 0; i < barCount; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) {
        const idx = i * step + j;
        if (idx >= data.length) break;
        sum += data[idx];
      }
      const value = (sum / step) * sensitivity;
      const normalized = Math.min(value / 255, 1);

      const angle =
        (i / barCount) * Math.PI * 2 +
        rotation +
        Math.sin(time * 0.4) * 0.05;

      const radius = (baseRadius + normalized * maxExtra) * extraScale;
      const innerX = Math.cos(angle) * (baseRadius * 0.98);
      const innerY = Math.sin(angle) * (baseRadius * 0.98);
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;

      const hueBase = isNeon ? 185 : 215;
      const hue = hueBase + i * 1.2;
      ctx.strokeStyle = `hsla(${hue}, 95%, ${
        50 + normalized * 15 + beatFlash * 20
      }%, ${0.6 + normalized * 0.3})`;

      ctx.beginPath();
      ctx.moveTo(innerX, innerY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    ctx.shadowBlur = isNeon ? 30 : 20;
    ctx.shadowColor = isNeon
      ? "rgba(56, 189, 248, 0.9)"
      : "rgba(96, 165, 250, 0.85)";
    ctx.lineWidth = 3;
    ctx.strokeStyle = isNeon
      ? "rgba(56, 189, 248, 0.85)"
      : "rgba(148, 163, 184, 0.9)";

    ctx.beginPath();
    ctx.arc(
      0,
      0,
      baseRadius * (0.94 + Math.sin(time * 0.9) * 0.03 + beatEnergy * 0.1),
      0,
      Math.PI * 2
    );
    ctx.stroke();

    ctx.lineWidth = 1.2;
    ctx.globalAlpha = 0.3 + beatFlash * 0.2;
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      baseRadius * (1.35 + Math.sin(time * 0.4) * 0.05),
      0,
      Math.PI * 2
    );
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.restore();
  }

  function drawWave(data, width, height, theme, beat) {
    const len = data.length;
    if (len === 0) return;

    const isNeon = theme === "neon";
    const beatMid = beat ? beat.mid || 0 : 0;
    const beatFlash = beat ? beat.flash || 0 : 0;

    const midY = height * (0.5 + Math.sin(time * 0.6) * 0.05);
    const mainAmp = height * (0.4 + beatFlash * 0.3 + beatMid * 0.15);
    const subAmp = height * (0.25 + beatMid * 0.1);

    ctx.save();
    ctx.lineWidth = 2.2;
    ctx.shadowBlur = isNeon ? 24 : 18;
    ctx.shadowColor = isNeon
      ? "rgba(56, 189, 248, 0.9)"
      : "rgba(96, 165, 250, 0.9)";
    ctx.strokeStyle = isNeon
      ? "rgba(244, 244, 245, 0.98)"
      : "rgba(248, 250, 252, 0.96)";

    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const value = data[i] / 255;
      const x = (i / (len - 1)) * width;
      const y = midY + (value - 0.5) * mainAmp;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    const grad = ctx.createLinearGradient(0, midY, 0, height);
    grad.addColorStop(
      0,
      isNeon
        ? `rgba(56, 189, 248, ${0.35 + beatFlash * 0.4})`
        : `rgba(96, 165, 250, ${0.32 + beatFlash * 0.35})`
    );
    grad.addColorStop(
      1,
      isNeon ? "rgba(15, 23, 42, 0.0)" : "rgba(15, 23, 42, 0.0)"
    );

    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const value = data[i] / 255;
      const x = (i / (len - 1)) * width;
      const y = midY + (value - 0.5) * (mainAmp * 0.85);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = isNeon
      ? "rgba(148, 163, 184, 0.5)"
      : "rgba(148, 163, 184, 0.4)";
    ctx.beginPath();
    for (let i = 0; i < len; i++) {
      const value = data[i] / 255;
      const x = (i / (len - 1)) * width;
      const y =
        midY +
        (value - 0.5) * subAmp +
        10 +
        Math.sin(time * 0.8 + i * 0.08) * 4 * beatFlash;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  return {
    init,
    start,
    stop,
    setMode,
    setFpsCallback
  };
})();
