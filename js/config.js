const Config = (function () {
  const STORAGE_KEY = "mv_config_v1";

  let config = {
    mode: "bars",
    theme: "dark",
    sensitivity: 1.0,
    barCount: 64,
    volume: 0.8,
    ambientMode: false
  };

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        config = Object.assign({}, config, parsed);
      }
    } catch (e) {
      console.warn("Config load error:", e);
    }
    return config;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (e) {
      console.warn("Config save error:", e);
    }
  }

  function set(key, value) {
    config[key] = value;
    save();
  }

  function get() {
    return config;
  }

  return {
    load,
    save,
    set,
    get
  };
})();
