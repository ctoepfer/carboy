import { mount } from "svelte";
import "@xyflow/svelte/dist/style.css";
import "../shared/app.css";
import { renderNav } from "../shared/nav.js";
import App from "./App.svelte";

renderNav(document.getElementById("header"), "graph-svelte", 1);
mount(App, { target: document.getElementById("root") });
