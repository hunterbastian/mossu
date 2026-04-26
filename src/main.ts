import "./styles.css";
import { GameApp } from "./render/app/GameApp";

declare global {
  interface Window {
    advanceTime?: (ms: number) => void;
    render_game_to_text?: () => string;
  }
}

const container = document.querySelector<HTMLDivElement>("#app");

if (!container) {
  throw new Error("Missing #app container");
}

void GameApp.create(container)
  .then((game) => {
    window.advanceTime = (ms) => game.advanceTime(ms);
    window.render_game_to_text = () => game.renderGameToText();
    game.start();
  })
  .catch((error: unknown) => {
    console.error("Mossu failed to start.", error);
    container.textContent = "Mossu could not start. Check the browser console for details.";
  });
