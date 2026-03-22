import { $ } from "./lib/dom";

declare const Plotly: any;

const POLL_INTERVAL_MS = 2000;

type TabId = "queue" | "entries" | "poi" | "memory" | "workers";

interface WorkerStats {
  memoryMB: number;
  cpuPercent: number;
  maxMemoryMB: number;
  avgCpuPercent: number;
}

const BACKGROUND_SERVICES = ["faces", "geolocate", "favoriteExporter", "fts"] as const;

interface StatsResponse {
  locks: string[];
  series: Record<string, { x: number; y: number }[]>;
  extraction?: { pending: number; active: number; done: number };
  workers?: Record<string, WorkerStats>;
  workersRunning?: Record<string, boolean>;
  globalQueue?: {
    pending: number;
    active: number;
    done: number;
    pendingByPriority: Array<{ priority: number; count: number; types: string }>;
  };
  dbQueue?: { pending: number; active: number };
  memory?: NodeJS.MemoryUsage;
  cpuLoad?: number;
  activity?: { lastActivityMs: number; lockCount: number };
}

function renderTabBar(activeTab: TabId, onTab: (id: TabId) => void): HTMLElement {
  const tabs: { id: TabId; label: string }[] = [
    { id: "queue", label: "Global queue" },
    { id: "workers", label: "Workers" },
    { id: "entries", label: "Entries DB" },
    { id: "poi", label: "POI DB" },
    { id: "memory", label: "Memory & CPU" },
  ];
  const bar = document.createElement("div");
  bar.className = "w3-bar w3-green w3-margin-bottom";
  for (const t of tabs) {
    const btn = document.createElement("button");
    btn.className = `w3-bar-item w3-button ${activeTab === t.id ? "w3-white" : ""}`;
    btn.textContent = t.label;
    btn.onclick = () => onTab(t.id);
    bar.appendChild(btn);
  }
  return bar;
}

function renderQueueTab(data: StatsResponse): HTMLElement {
  const div = document.createElement("div");
  const q = data.globalQueue ?? {
    pending: 0,
    active: 0,
    done: 0,
    pendingByPriority: [],
  };
  const total = q.pending + q.active;
  const dbq = data.dbQueue ?? { pending: 0, active: 0 };

  let contentsHtml = "";
  if (q.pendingByPriority.length > 0) {
    contentsHtml = `
      <h4 class="w3-padding">Contents by job type</h4>
      <table class="w3-table w3-bordered w3-striped">
        <tr><th>Priority</th><th>Job types</th><th>Count</th></tr>
        ${q.pendingByPriority
          .map(
            (p) =>
              `<tr><td>${p.priority}</td><td>${p.types}</td><td>${p.count}</td></tr>`
          )
          .join("")}
      </table>
    `;
  } else {
    contentsHtml = "<p class='w3-padding'>Queue is empty.</p>";
  }

  div.innerHTML = `
    <div class="w3-cell-row w3-padding">
      <div class="w3-cell" style="width:25%">
        <strong>Size</strong><br>
        <span class="w3-xlarge">${total}</span>
        <small class="w3-text-grey"> total (${q.active} active, ${q.pending} queued)</small>
      </div>
      <div class="w3-cell" style="width:25%">
        <strong>Done</strong><br>
        <span class="w3-xlarge">${q.done}</span>
      </div>
      <div class="w3-cell" style="width:25%">
        <strong>DB queue</strong><br>
        <span class="w3-xlarge">${dbq.pending}</span>
        <small class="w3-text-grey"> pending (${dbq.active} active)</small>
      </div>
    </div>
    ${contentsHtml}
  `;
  return div;
}

function renderDbTable(tableName: string, rows: unknown[]): string {
  if (rows.length === 0) return `<p>Table <code>${tableName}</code>: 0 rows</p>`;
  const first = rows[0] as Record<string, unknown>;
  const keys = Object.keys(first).filter((k) => !k.startsWith("_"));
  const header = keys.map((k) => `<th>${k}</th>`).join("");
  const body = rows
    .map((r) => {
      const row = r as Record<string, unknown>;
      return `<tr>${keys.map((k) => `<td>${String(row[k] ?? "")}</td>`).join("")}</tr>`;
    })
    .join("");
  return `
    <h4 class="w3-padding">${tableName}</h4>
    <div class="w3-responsive w3-margin-bottom">
      <table class="w3-table w3-bordered w3-striped w3-small">
        <thead><tr>${header}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
  `;
}

function renderEntriesTab(entriesData: Record<string, unknown[]> | null): HTMLElement {
  const div = document.createElement("div");
  if (!entriesData) {
    div.innerHTML = "<p class='w3-padding'>Loading...</p>";
    return div;
  }
  div.innerHTML = Object.entries(entriesData)
    .map(([name, rows]) => renderDbTable(name, rows))
    .join("");
  return div;
}

function renderPoiTab(poiData: Record<string, unknown[]> | null): HTMLElement {
  const div = document.createElement("div");
  if (!poiData) {
    div.innerHTML = "<p class='w3-padding'>Loading...</p>";
    return div;
  }
  div.innerHTML = Object.entries(poiData)
    .map(([name, rows]) => renderDbTable(name, rows))
    .join("");
  return div;
}

async function startWorker(serviceName: string): Promise<boolean> {
  const res = await fetch("/management/workers/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ serviceName }),
  });
  const json = await res.json();
  return json.started === true;
}

async function startAllWorkers(): Promise<void> {
  await fetch("/management/workers/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ all: true }),
  });
}

function renderWorkersTab(data: StatsResponse): HTMLElement {
  const div = document.createElement("div");
  const workers = data.workers ?? {};
  const workersRunning = data.workersRunning ?? {};
  const entries = Object.entries(workers);
  const hasAnyStats = entries.length > 0;

  const startButtonsHtml = BACKGROUND_SERVICES.map(
    (name) => {
      const running = workersRunning[name] ?? false;
      return `
        <button class="w3-button w3-small w3-green w3-margin-right w3-margin-bottom" 
          data-service="${name}" ${running ? "disabled" : ""}>
          ${running ? `${name} (running…)` : `Start ${name}`}
        </button>`;
    }
  ).join("");

  let tableHtml = "";
  if (hasAnyStats) {
    tableHtml = `
      <h4 class="w3-padding">Last run stats</h4>
      <table class="w3-table w3-bordered w3-striped">
        <thead>
          <tr>
            <th>Service</th>
            <th>Memory (MB)</th>
            <th>Max memory (MB)</th>
            <th>CPU %</th>
            <th>Avg CPU %</th>
          </tr>
        </thead>
        <tbody>
          ${entries
            .map(
              ([name, s]) =>
                `<tr>
                  <td>${name}</td>
                  <td>${s.memoryMB.toFixed(2)}</td>
                  <td>${s.maxMemoryMB.toFixed(2)}</td>
                  <td>${s.cpuPercent.toFixed(1)}</td>
                  <td>${s.avgCpuPercent.toFixed(1)}</td>
                </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  } else {
    tableHtml = "<p class='w3-padding'>No worker stats yet. Start a worker to see stats after it completes.</p>";
  }

  div.innerHTML = `
    <div class="w3-padding">
      <h4>Background workers</h4>
      <p class="w3-margin-bottom">Start workers manually:</p>
      <div class="w3-margin-bottom">
        ${startButtonsHtml}
        <button class="w3-button w3-small w3-teal w3-margin-bottom" id="start-all-workers">
          Start all
        </button>
      </div>
      ${tableHtml}
    </div>
  `;

  div.querySelectorAll("[data-service]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const name = (btn as HTMLElement).dataset.service!;
      await startWorker(name);
      // Poll will refresh the UI
    });
  });
  div.querySelector("#start-all-workers")?.addEventListener("click", () => {
    startAllWorkers();
  });

  return div;
}

function renderMemoryTab(data: StatsResponse): HTMLElement {
  const div = document.createElement("div");
  const mem = data.memory ?? {};
  const memMb = (bytes: number) => ((bytes || 0) / 1024 / 1024).toFixed(2);

  const activity = data.activity ?? { lastActivityMs: 0, lockCount: 0 };
  const lastActivity = activity.lastActivityMs
    ? new Date(activity.lastActivityMs).toLocaleTimeString()
    : "—";
  const status = activity.lockCount > 0 ? "busy" : "idle";

  div.innerHTML = `
    <div class="w3-cell-row w3-padding">
      <div class="w3-cell" style="width:20%">
        <strong>RSS</strong><br>
        <span class="w3-large">${memMb((mem as any).rss)} MB</span>
      </div>
      <div class="w3-cell" style="width:20%">
        <strong>Heap used</strong><br>
        <span class="w3-large">${memMb((mem as any).heapUsed)} MB</span>
      </div>
      <div class="w3-cell" style="width:20%">
        <strong>Heap total</strong><br>
        <span class="w3-large">${memMb((mem as any).heapTotal)} MB</span>
      </div>
      <div class="w3-cell" style="width:20%">
        <strong>CPU load</strong><br>
        <span class="w3-large">${((data.cpuLoad ?? 0).toFixed(1))}%</span>
      </div>
      <div class="w3-cell" style="width:20%">
        <strong>Server</strong><br>
        <span class="w3-large">${status}</span>
        <small class="w3-text-grey"> (last: ${lastActivity})</small>
      </div>
    </div>
    <div id="memory-series-container" class="w3-padding"></div>
    <div class="w3-padding">
      <h4>Locks</h4>
      ${(data.locks ?? []).length ? (data.locks as string[]).map((l) => `<p>${l}</p>`).join("") : "<p>None</p>"}
    </div>
  `;
  return div;
}

async function fetchStats(includeSeries: boolean): Promise<StatsResponse> {
  const q = includeSeries ? "" : "?series=0";
  const res = await fetch(`/stats${q}`);
  return res.json();
}

async function fetchEntriesDb(): Promise<Record<string, unknown[]>> {
  const res = await fetch("/stats/db/entries?limit=200");
  return res.json();
}

async function fetchPoiDb(): Promise<Record<string, unknown[]>> {
  const res = await fetch("/stats/db/poi?limit=200");
  return res.json();
}

async function init() {
  let activeTab: TabId = "queue";
  let statsData: StatsResponse | null = null;
  let entriesData: Record<string, unknown[]> | null = null;
  let poiData: Record<string, unknown[]> | null = null;

  const tabContent = document.createElement("div");
  tabContent.id = "tab-content";
  tabContent.className = "w3-theme-l4 w3-padding";

  const poll = async () => {
    try {
      const data = await fetchStats(activeTab === "memory");
      statsData = data;
      if (activeTab === "queue" || activeTab === "memory" || activeTab === "workers") {
        renderActiveTab();
      }
      return data;
    } catch (e) {
      console.error("Stats fetch failed:", e);
      return null;
    }
  };

  function purgePlotlyCharts(container: HTMLElement) {
    const Plotly = (window as unknown as { Plotly?: { purge: (el: Element) => void } }).Plotly;
    if (!Plotly?.purge) return;
    for (const el of container.querySelectorAll("#memory-series-container > div")) {
      try {
        Plotly.purge(el);
      } catch {
        /* ignore */
      }
    }
  }

  function renderActiveTab() {
    const container = document.getElementById("tab-content");
    if (!container) return;
    purgePlotlyCharts(container);
    container.innerHTML = "";
    if (activeTab === "queue" && statsData) {
      container.appendChild(renderQueueTab(statsData));
    } else if (activeTab === "queue") {
      container.innerHTML = "<p class='w3-padding'>Loading stats…</p>";
    } else if (activeTab === "workers" && statsData) {
      container.appendChild(renderWorkersTab(statsData));
    } else if (activeTab === "workers") {
      container.innerHTML = "<p class='w3-padding'>Loading stats…</p>";
    } else if (activeTab === "entries") {
      container.appendChild(renderEntriesTab(entriesData));
    } else if (activeTab === "poi") {
      container.appendChild(renderPoiTab(poiData));
    } else if (activeTab === "memory" && statsData) {
      container.appendChild(renderMemoryTab(statsData));
      // Render series charts after DOM is ready
      setTimeout(() => renderSeriesCharts(statsData!), 0);
    } else if (activeTab === "memory") {
      container.innerHTML = "<p class='w3-padding'>Loading stats…</p>";
    }
  }

  function renderSeriesCharts(data: StatsResponse) {
    const container = document.getElementById("memory-series-container");
    if (!container || !data.series) return;
    for (const [index, pairs] of Object.entries(data.series)) {
      const chartDiv = document.createElement("div");
      chartDiv.className = "series";
      container.appendChild(chartDiv);
      const x = (pairs as { x: number; y: number }[]).map(
        (v) => new Date(v.x * 1000).toISOString()
      );
      const y = (pairs as { x: number; y: number }[]).map((v) => v.y);
      Plotly.newPlot(chartDiv, [{ x, y }], { margin: { t: 0 } });
    }
  }

  function setTab(id: TabId) {
    activeTab = id;
    const bar = document.getElementById("tab-bar");
    if (bar) {
      bar.innerHTML = "";
      bar.appendChild(renderTabBar(activeTab, setTab));
    }
    if (id === "entries" && !entriesData) {
      fetchEntriesDb().then((d) => {
        entriesData = d;
        renderActiveTab();
      });
    } else if (id === "poi" && !poiData) {
      fetchPoiDb().then((d) => {
        poiData = d;
        renderActiveTab();
      });
    }
    if (id === "memory") {
      void fetchStats(true).then((d) => {
        statsData = d;
        if (activeTab === "memory") renderActiveTab();
      });
    }
    renderActiveTab();
  }

  document.body.appendChild(
    $('<h3 class="w3-bar w3-green w3-padding">Management</h3>').get()
  );
  const tabBar = document.createElement("div");
  tabBar.id = "tab-bar";
  tabBar.appendChild(renderTabBar(activeTab, setTab));
  document.body.appendChild(tabBar);
  document.body.appendChild(tabContent);

  let data = await poll();
  setInterval(poll, POLL_INTERVAL_MS);

  renderActiveTab();
}

window.addEventListener("load", () => {
  init();
});
