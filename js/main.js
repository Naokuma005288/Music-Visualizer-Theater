document.addEventListener("DOMContentLoaded", () => {
  const config = Config.load();

  const canvas = document.getElementById("visualizer");
  Visualizer.init(canvas, config);
  UIControls.init(config);
  Visualizer.start();

  const splash = document.getElementById("splash");
  const splashBtn = document.getElementById("splashStartBtn");
  const fileInput = document.getElementById("fileInput");
  const appRoot = document.querySelector(".app");

  function activateAppShell() {
    if (appRoot && !appRoot.classList.contains("app-ready")) {
      appRoot.classList.add("app-ready");
    }
  }

  function hideSplash() {
    if (splash && !splash.classList.contains("hide")) {
      splash.classList.add("hide");
      // スプラッシュが消えるタイミングでシェルをフェードイン
      activateAppShell();
    }
  }

  if (splash && splashBtn) {
    splashBtn.addEventListener("click", () => {
      hideSplash();
    });
  }

  if (splash && fileInput) {
    fileInput.addEventListener("change", () => {
      hideSplash();
    });
  }

  // 念のため、スプラッシュが存在しない場合でもシェルを有効化
  if (!splash) {
    activateAppShell();
  }
});
