import { $ } from "./lib/dom.js";

declare const Plotly: any;
async function init() {
  const series = await fetch('/stats').then(data => data.json());
  for(const index of Object.keys(series)) {
    document.body.appendChild($(`<h3 class="w3-bar w3-green w3-padding">${index}</h3>`).get());
    const e = $('<div class="series"></div');
    // Const TS values
    const pairs:{x:number, y:number}[] = series[index];
    const x = pairs.map(v=>(new Date(v.x*1000).toISOString()));
    const y = pairs.map(v=>v.y);
    document.body.appendChild(e.get());
    Plotly.newPlot( e.get(), [{
      x,
      y}], {
      margin: { t: 0 } } );

  }
}

window.addEventListener("load", () => {
  init();
});
