// Energy Graph Scheduler Card (Custom fork)
// - English UI
// - No entity name under title
// - Graph shows current hour + 12 hours ahead
// Compatible with HACS (Lovelace card)

const EGS_CARD_TAG = "energy-graph-scheduler-card";
const EGS_EDITOR_TAG = "energy-graph-scheduler-card-editor";
const EGS_CARD_VERSION = "0.1.1";

/* ----------------- helpers ----------------- */
function egsSafeText(v) {
  return (v ?? "").toString();
}
function egsClamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
function egsAsNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function egsParseDate(v) {
  const s = egsSafeText(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}
function egsStartOfLocalHour(ts) {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

/* ----------------- data extraction ----------------- */
function egsExtractSeries(stateObj) {
  const attrs = stateObj?.attributes || {};
  const todayKeys = ["raw_today", "today", "prices", "price", "data", "values"];
  const tomorrowKeys = ["raw_tomorrow", "tomorrow"];

  let todayRaw = null;
  for (const k of todayKeys) {
    if (Array.isArray(attrs[k]) && attrs[k].length) {
      todayRaw = attrs[k];
      break;
    }
  }

  let tomorrowRaw = null;
  for (const k of tomorrowKeys) {
    if (Array.isArray(attrs[k]) && attrs[k].length) {
      tomorrowRaw = attrs[k];
      break;
    }
  }

  const raw =
    todayRaw && tomorrowRaw ? [...todayRaw, ...tomorrowRaw] : todayRaw || tomorrowRaw;

  if (!Array.isArray(raw)) return { points: [], unit: attrs.unit_of_measurement || "" };

  const points = [];
  raw.forEach((item, idx) => {
    if (typeof item === "number") {
      points.push({ ts: null, value: item, idx });
      return;
    }
    if (item && typeof item === "object") {
      let v = item.value ?? item.price ?? item.val;
      if (typeof v === "string") v = v.replace(",", ".");
      const value = egsAsNumber(v);
      if (value == null) return;

      const d =
        egsParseDate(
          item.hour ??
            item.start ??
            item.start_time ??
            item.startTime ??
            item.from ??
            item.time ??
            item.datetime
        ) ?? null;

      points.push({ ts: d ? d.getTime() : null, value, idx });
    }
  });

  return { points, unit: attrs.unit_of_measurement || "" };
}

function egsBuildTimeline(points, nowTs) {
  const hasTs = points.some(p => p.ts != null);
  if (!hasTs) return points;

  const map = new Map();
  points.forEach(p => {
    if (p.ts != null) map.set(egsStartOfLocalHour(p.ts), p.value);
  });

  const keys = [...map.keys()].sort((a, b) => a - b);
  const out = [];
  for (let t = keys[0]; t <= keys[keys.length - 1]; t += 3600000) {
    out.push({ ts: t, value: map.get(t) ?? null });
  }
  return out;
}

/* ----------------- card ----------------- */
class EnergyGraphSchedulerCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._hass = null;
    this._config = null;
  }

  static getStubConfig() {
    return {
      type: `custom:${EGS_CARD_TAG}`,
      title: "Energy Graph Scheduler",
      entity: "",
    };
  }

  setConfig(config) {
    this._config = { ...EnergyGraphSchedulerCard.getStubConfig(), ...config };
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this._render();
  }

  _render() {
    if (!this.shadowRoot || !this._config) return;

    const hass = this._hass;
    const entityId = this._config.entity;
    const stateObj = hass?.states?.[entityId];

    if (!entityId || !stateObj) {
      this.shadowRoot.innerHTML = `
        <ha-card>
          <div style="padding:12px;color:var(--secondary-text-color)">
            Select a price entity in the editor.
          </div>
        </ha-card>`;
      return;
    }

    const { points, unit } = egsExtractSeries(stateObj);
    const nowTs = Date.now();

    const fullTimeline = egsBuildTimeline(points, nowTs);

    // ---- CURRENT HOUR → +12 HOURS ----
    const nowHour = egsStartOfLocalHour(nowTs);
    let startIdx = fullTimeline.findIndex(p => p.ts >= nowHour);
    if (startIdx < 0) startIdx = 0;

    const HOURS_AHEAD = 12;
    const timeline = fullTimeline.slice(startIdx, startIdx + HOURS_AHEAD);

    const values = timeline.map(p => p.value).filter(v => Number.isFinite(v));
    const min = Math.min(...values);
    const max = Math.max(...values);
    const nowVal = timeline[0]?.value ?? null;

    this.shadowRoot.innerHTML = `
      <ha-card>
        <div style="padding:12px">
          <div style="font-size:20px;font-weight:600">
            ${egsSafeText(this._config.title)}
          </div>

          <div style="font-size:12px;color:var(--secondary-text-color);margin:6px 0">
            <span>Min: <b>${min.toFixed(3)}</b> ${unit}</span>
            &nbsp;&nbsp;
            <span>Now: <b>${nowVal?.toFixed(3) ?? "-"}</b> ${unit}</span>
            &nbsp;&nbsp;
            <span>Highest: <b>${max.toFixed(3)}</b> ${unit}</span>
          </div>

          <div style="display:flex;gap:6px;align-items:flex-end;height:120px">
            ${timeline
              .map(p => {
                const h = p.value != null
                  ? Math.round(((p.value - min) / (max - min || 1)) * 100)
                  : 0;
                return `<div style="
                  width:20px;
                  height:${h}%;
                  background:var(--primary-color);
                  opacity:${p.value === nowVal ? "1" : "0.6"};
                "></div>`;
              })
              .join("")}
          </div>
        </div>
      </ha-card>
    `;
  }
}

customElements.define(EGS_CARD_TAG, EnergyGraphSchedulerCard);

console.info(
  `%cENERGY-GRAPH-SCHEDULER-CARD ${EGS_CARD_VERSION}`,
  "color:#03a9f4;font-weight:700"
);
