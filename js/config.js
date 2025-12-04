const Config = (function () {
  const KEY = "auroraVisualizerConfig_v23";

  const defaults = {
    mode: "bars",
    theme: "dark",
    sensitivity: 1.0,
    barCount: 64,
    volume: 0.8,
    ambientMode: false,
    playbackRate: 1.0,
    repeatMode: "all",
    shuffle: false
  };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { ...defaults };
      const parsed = JSON.parse(raw);
      return { ...defaults, ...parsed };
    } catch (e) {
      console.error("Config load failed:", e);
      return { ...defaults };
    }
  }

  function save(cfg) {
    try {
      localStorage.setItem(KEY, JSON.stringify(cfg));
    } catch (e) {
      console.error("Config save failed:", e);
    }
  }

  function set(key, value) {
    const cfg = load();
    cfg[key] = value;
    save(cfg);
  }

  return {
    load,
    set
  };
})();
