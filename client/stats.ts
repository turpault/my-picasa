import { $ } from "./lib/dom";

declare const Plotly: any;

const POLL_INTERVAL_MS = 2000;

type TabId =
  | "queue"
  | "entries"
  | "poi"
  | "memory"
  | "workers"
  | "rawTests"
  | "rawMetrics"
  | "rawFailures";

type RawApiKey = "foldersFts" | "mediaFts";

interface RollingMsStats {
  count: number;
  sumMs: number;
  minMs: number;
  maxMs: number;
}

interface RawFailureRow {
  t: number;
  op: RawApiKey | "unknown";
  message: string;
  httpStatus?: number;
  elapsedMs?: number;
}

function emptyRolling(): RollingMsStats {
  return { count: 0, sumMs: 0, minMs: 0, maxMs: 0 };
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
    { id: "rawTests", label: "Raw API tests" },
    { id: "rawMetrics", label: "Raw API stats" },
    { id: "rawFailures", label: "Raw API errors" },
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

  const rawRolling: Record<RawApiKey, RollingMsStats> = {
    foldersFts: emptyRolling(),
    mediaFts: emptyRolling(),
  };
  const rawFailures: RawFailureRow[] = [];
  let rawForm = { text: "", albumKey: "", albumName: "" };
  let lastRawResults: {
    foldersFts: {
      ok: boolean;
      ms: number;
      albumCount?: number;
      error?: string;
    } | null;
    mediaFts: {
      ok: boolean;
      ms: number;
      entryCount?: number;
      error?: string;
    } | null;
  } = { foldersFts: null, mediaFts: null };

  function recordRawSuccess(key: RawApiKey, ms: number) {
    const s = rawRolling[key];
    s.count += 1;
    s.sumMs += ms;
    if (s.count === 1) {
      s.minMs = ms;
      s.maxMs = ms;
    } else {
      s.minMs = Math.min(s.minMs, ms);
      s.maxMs = Math.max(s.maxMs, ms);
    }
  }

  function pushRawFailure(row: RawFailureRow) {
    rawFailures.unshift(row);
    if (rawFailures.length > 100) rawFailures.pop();
  }

  async function postRawApi(payload: {
    op: RawApiKey;
    text: string;
    albumKey?: string;
    albumName?: string;
  }) {
    const t0 = performance.now();
    let res: Response;
    try {
      res = await fetch("/stats/raw-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      const ms = performance.now() - t0;
      const msg = e instanceof Error ? e.message : String(e);
      pushRawFailure({ t: Date.now(), op: payload.op, message: msg, elapsedMs: ms });
      if (payload.op === "foldersFts") {
        lastRawResults.foldersFts = { ok: false, ms, error: msg };
      } else {
        lastRawResults.mediaFts = { ok: false, ms, error: msg };
      }
      renderActiveTab();
      return;
    }
    const ms = performance.now() - t0;
    let json: {
      ok?: boolean;
      error?: string;
      albumCount?: number;
      entryCount?: number;
    };
    try {
      json = (await res.json()) as typeof json;
    } catch {
      pushRawFailure({
        t: Date.now(),
        op: payload.op,
        message: `Response is not JSON (HTTP ${res.status})`,
        httpStatus: res.status,
        elapsedMs: ms,
      });
      if (payload.op === "foldersFts") {
        lastRawResults.foldersFts = { ok: false, ms, error: "Invalid JSON" };
      } else {
        lastRawResults.mediaFts = { ok: false, ms, error: "Invalid JSON" };
      }
      renderActiveTab();
      return;
    }
    if (res.ok && json.ok === true) {
      recordRawSuccess(payload.op, ms);
      if (payload.op === "foldersFts") {
        lastRawResults.foldersFts = {
          ok: true,
          ms,
          albumCount: json.albumCount,
        };
      } else {
        lastRawResults.mediaFts = {
          ok: true,
          ms,
          entryCount: json.entryCount,
        };
      }
    } else {
      const err = json.error ?? `HTTP ${res.status}`;
      pushRawFailure({
        t: Date.now(),
        op: payload.op,
        message: String(err),
        httpStatus: res.status,
        elapsedMs: ms,
      });
      if (payload.op === "foldersFts") {
        lastRawResults.foldersFts = { ok: false, ms, error: String(err) };
      } else {
        lastRawResults.mediaFts = { ok: false, ms, error: String(err) };
      }
    }
    renderActiveTab();
  }

  function renderRawTestsPanel(): HTMLElement {
    const div = document.createElement("div");
    div.className = "w3-padding";
    const lf = lastRawResults.foldersFts;
    const lm = lastRawResults.mediaFts;
    const foldersLine = lf
      ? lf.ok
        ? `Last: ${lf.ms.toFixed(1)} ms — ${lf.albumCount ?? 0} albums`
        : `Last: ${lf.ms.toFixed(1)} ms — failed (${lf.error ?? ""})`
      : "No run yet.";
    const mediaLine = lm
      ? lm.ok
        ? `Last: ${lm.ms.toFixed(1)} ms — ${lm.entryCount ?? 0} entries`
        : `Last: ${lm.ms.toFixed(1)} ms — failed (${lm.error ?? ""})`
      : "No run yet.";

    div.innerHTML = `
      <h4>FTS via production handlers</h4>
      <p class="w3-small w3-text-grey">Same paths as RPC: <code>folders(filters)</code> and <code>media(album, filters)</code> with <code>Filters.text</code> (full-text search).</p>
      <p>
        <label class="w3-block"><strong>Search text</strong>
          <input type="text" id="raw-fts-text" class="w3-input w3-border" style="max-width:40rem" value="${escapeAttr(rawForm.text)}" placeholder="FTS query (Filters.text)" />
        </label>
      </p>
      <p>
        <label class="w3-block"><strong>Album key</strong> (required for entries test)
          <input type="text" id="raw-album-key" class="w3-input w3-border" style="max-width:40rem" value="${escapeAttr(rawForm.albumKey)}" placeholder="e.g. folder»…" />
        </label>
      </p>
      <p>
        <label class="w3-block"><strong>Album name</strong> (optional)
          <input type="text" id="raw-album-name" class="w3-input w3-border" style="max-width:40rem" value="${escapeAttr(rawForm.albumName)}" />
        </label>
      </p>
      <p>
        <button type="button" id="raw-run-folders" class="w3-button w3-green w3-margin-right">Run albums (folders + FTS)</button>
        <button type="button" id="raw-run-media" class="w3-button w3-green w3-margin-right">Run entries (media + FTS)</button>
        <button type="button" id="raw-run-both" class="w3-button w3-teal">Run both</button>
      </p>
      <h5>Album list (folders)</h5>
      <p>${escapeHtml(foldersLine)}</p>
      <h5>Entries in album (media)</h5>
      <p>${escapeHtml(mediaLine)}</p>
    `;

    const textEl = div.querySelector("#raw-fts-text") as HTMLInputElement;
    const keyEl = div.querySelector("#raw-album-key") as HTMLInputElement;
    const nameEl = div.querySelector("#raw-album-name") as HTMLInputElement;
    const syncForm = () => {
      rawForm = { text: textEl.value, albumKey: keyEl.value, albumName: nameEl.value };
    };
    textEl.addEventListener("input", syncForm);
    keyEl.addEventListener("input", syncForm);
    nameEl.addEventListener("input", syncForm);

    div.querySelector("#raw-run-folders")?.addEventListener("click", async () => {
      syncForm();
      await postRawApi({ op: "foldersFts", text: rawForm.text });
    });
    div.querySelector("#raw-run-media")?.addEventListener("click", async () => {
      syncForm();
      if (!rawForm.albumKey.trim()) {
        alert("Album key is required for the entries test.");
        return;
      }
      await postRawApi({
        op: "mediaFts",
        text: rawForm.text,
        albumKey: rawForm.albumKey.trim(),
        albumName: rawForm.albumName.trim() || undefined,
      });
    });
    div.querySelector("#raw-run-both")?.addEventListener("click", async () => {
      syncForm();
      await postRawApi({ op: "foldersFts", text: rawForm.text });
      if (!rawForm.albumKey.trim()) {
        alert("Album key is required for the entries test; only the albums call ran.");
        return;
      }
      await postRawApi({
        op: "mediaFts",
        text: rawForm.text,
        albumKey: rawForm.albumKey.trim(),
        albumName: rawForm.albumName.trim() || undefined,
      });
    });

    return div;
  }

  function renderRawMetricsPanel(): HTMLElement {
    const div = document.createElement("div");
    div.className = "w3-padding";
    const rows = (["foldersFts", "mediaFts"] as const)
      .map((key) => {
        const s = rawRolling[key];
        const avg = s.count > 0 ? s.sumMs / s.count : 0;
        const label =
          key === "foldersFts" ? "Albums (folders + FTS)" : "Entries (media + FTS)";
        return `<tr>
        <td>${label}</td>
        <td>${s.count}</td>
        <td>${s.count ? avg.toFixed(2) : "—"}</td>
        <td>${s.count ? s.minMs.toFixed(2) : "—"}</td>
        <td>${s.count ? s.maxMs.toFixed(2) : "—"}</td>
      </tr>`;
      })
      .join("");
    div.innerHTML = `
      <h4>Raw API timing (client round-trip, ms)</h4>
      <p class="w3-small w3-text-grey">Successful calls only. Average = sum of durations / count (no per-call list stored).</p>
      <button type="button" id="raw-reset-metrics" class="w3-button w3-orange w3-margin-bottom">Reset statistics</button>
      <table class="w3-table w3-bordered w3-striped">
        <thead><tr><th>API</th><th>Calls</th><th>Avg</th><th>Min</th><th>Max</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
    div.querySelector("#raw-reset-metrics")?.addEventListener("click", () => {
      rawRolling.foldersFts = emptyRolling();
      rawRolling.mediaFts = emptyRolling();
      renderActiveTab();
    });
    return div;
  }

  function renderRawFailuresPanel(): HTMLElement {
    const div = document.createElement("div");
    div.className = "w3-padding";
    if (rawFailures.length === 0) {
      div.innerHTML = "<p>No recorded failures.</p>";
      return div;
    }
    const body = rawFailures
      .map(
        (f) =>
          `<tr><td>${escapeHtml(new Date(f.t).toLocaleString())}</td><td>${escapeHtml(f.op)}</td><td>${escapeHtml(f.message)}</td><td>${f.httpStatus ?? "—"}</td><td>${f.elapsedMs != null ? f.elapsedMs.toFixed(1) : "—"}</td></tr>`,
      )
      .join("");
    div.innerHTML = `
      <h4>Recent failures (newest first, max 100)</h4>
      <p class="w3-small w3-text-grey">Network errors, non-OK HTTP, JSON errors, and server exceptions.</p>
      <div class="w3-responsive">
        <table class="w3-table w3-bordered w3-striped w3-small">
          <thead><tr><th>Time</th><th>Op</th><th>Message</th><th>HTTP</th><th>Elapsed ms</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    `;
    return div;
  }

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
    } else if (activeTab === "rawTests") {
      container.appendChild(renderRawTestsPanel());
    } else if (activeTab === "rawMetrics") {
      container.appendChild(renderRawMetricsPanel());
    } else if (activeTab === "rawFailures") {
      container.appendChild(renderRawFailuresPanel());
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
