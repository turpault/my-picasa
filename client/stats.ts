import { $ } from "./lib/dom";

declare const Plotly: any;

const POLL_INTERVAL_MS = 2000;

interface StatsResponse {
  locks: string[];
  series: Record<string, { x: number; y: number }[]>;
  extraction?: { pending: number; active: number; done: number };
  cpuLoad?: number;
  activity?: { lastActivityMs: number; lockCount: number };
}

function renderServerActivity(data: StatsResponse) {
  const container = document.getElementById("server-activity");
  if (!container) return;

  const extraction = data.extraction ?? { pending: 0, active: 0, done: 0 };
  const cpuLoad = data.cpuLoad ?? 0;
  const activity = data.activity ?? { lastActivityMs: 0, lockCount: 0 };

  const pending = extraction.pending + extraction.active;
  const lastActivity = activity.lastActivityMs
    ? new Date(activity.lastActivityMs).toLocaleTimeString()
    : "—";
  const status = activity.lockCount > 0 ? "busy" : "idle";

  container.innerHTML = `
    <div class="w3-cell-row w3-padding">
      <div class="w3-cell" style="width:33%">
        <strong>Pending jobs</strong><br>
        <span class="w3-xlarge">${pending}</span>
        <small class="w3-text-grey"> (${extraction.active} active, ${extraction.pending} queued)</small>
      </div>
      <div class="w3-cell" style="width:33%">
        <strong>CPU load</strong><br>
        <span class="w3-xlarge">${cpuLoad.toFixed(1)}%</span>
      </div>
      <div class="w3-cell" style="width:33%">
        <strong>Server activity</strong><br>
        <span class="w3-xlarge">${status}</span>
        <small class="w3-text-grey"> (last: ${lastActivity}, locks: ${activity.lockCount})</small>
      </div>
    </div>
  `;
}

async function fetchStats(): Promise<StatsResponse> {
  const res = await fetch("/stats");
  return res.json();
}

async function init() {
  const container = $('<div id="server-activity" class="w3-theme-l4 w3-margin-bottom"></div>');
  document.body.appendChild(
    $(`<h3 class="w3-bar w3-green w3-padding">Server activity (live)</h3>`).get()
  );
  document.body.appendChild(container.get());

  const poll = async () => {
    try {
      const data = await fetchStats();
      renderServerActivity(data);
      return data;
    } catch (e) {
      console.error("Stats fetch failed:", e);
      return null;
    }
  };

  let data = await poll();
  setInterval(poll, POLL_INTERVAL_MS);

  if (data) {
    document.body.appendChild(
      $(`<h3 class="w3-bar w3-green w3-padding">Locks</h3>`).get()
    );
    (data.locks as string[]).forEach((lock) => {
      document.body.appendChild($(`<p>${lock}</p>`).get());
    });
    for (const index of Object.keys(data.series)) {
      document.body.appendChild(
        $(`<h3 class="w3-bar w3-green w3-padding">${index}</h3>`).get()
      );
      const e = $('<div class="series"></div');
      const pairs: { x: number; y: number }[] = data.series[index];
      const x = pairs.map((v) => new Date(v.x * 1000).toISOString());
      const y = pairs.map((v) => v.y);
      document.body.appendChild(e.get());
      Plotly.newPlot(
        e.get(),
        [{ x, y }],
        { margin: { t: 0 } }
      );
    }
  }
}

window.addEventListener("load", () => {
  init();
});
