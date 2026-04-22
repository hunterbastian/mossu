import "./styles.css";
import { GameApp } from "./render/app/GameApp";

const container = document.querySelector<HTMLDivElement>("#app");

if (!container) {
  throw new Error("Missing #app container");
}

const game = new GameApp(container);
game.start();
