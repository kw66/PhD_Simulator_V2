import { normalizeRewinderCycleNumber } from "../core/v2-rewinder-cycle";
import "../styles/captain-tags.css";
import "../styles/rewinder-preview.css";

const REWINDER_RULES = [
  { name: "属性轮回", icon: "heart-pulse", tone: "#ac7c8d", column: 1, row: 1,
    lines: ["属性取本年最佳"] },
  { name: "天赋轮回", icon: "book-open", tone: "#788f73", column: 2, row: 1,
    lines: ["成长与永久效果保留"] },
  { name: "人际轮回", icon: "users-round", tone: "#8c83a2", column: 3, row: 1,
    lines: ["人际与成果随档案延续"] },
  { name: "轮回者 · 特殊", icon: "hourglass", tone: "#38577f", column: 4, row: 1,
    lines: ["逐年挑战，年末归档，承接前一年成果", "事件可回退，结果固定"] },
] as const;

/** The four fixed rules use the same read-only board in the lobby and in a run. */
export function renderRewinderPreview(selectedNodeIndex = 3, cycleNumber = 1, academicYear = 1, showCycleBanner = true): string {
  const selected = Number.isInteger(selectedNodeIndex) && selectedNodeIndex >= 0 && selectedNodeIndex < REWINDER_RULES.length
    ? selectedNodeIndex : 3;
  const cycle = normalizeRewinderCycleNumber(cycleNumber);
  const year = Math.max(1, Math.min(6, Math.floor(academicYear) || 1));
  return `<section class="lobby-profile-growth-card lobby-profile-section is-designed-growth-card captain-tags-card rewinder-preview-card${showCycleBanner ? "" : " is-setup-preview"}">
    <div class="lobby-talent-tree is-designed-tree is-captain-tag-tree is-rewinder-tree" role="group" aria-label="轮回者能力 · 第${cycle}次轮回" data-active-page="0" data-rewinder-cycle="${cycle}">
      <div class="lobby-talent-tree-pages"><div class="lobby-talent-tree-page is-active is-designed-page" data-tree-page="0">
        ${REWINDER_RULES.map((rule, index) => `<button class="lobby-talent-tree-node is-fixed${index === selected ? " is-selected" : ""}" type="button" data-ui-talent-tree-node="0-${index}" data-rewinder-rule="${index}" aria-label="${rule.name}" aria-pressed="${index === selected}" style="--tree-tone:${rule.tone};--rewinder-node-row:${rule.row};grid-column:${rule.column};grid-row:${rule.row}">
          <span class="lobby-talent-tree-node-ring"><i data-lucide="${rule.icon}" aria-hidden="true"></i></span>
        </button>`).join("")}
        ${showCycleBanner ? `<div class="rewinder-cycle-banner" aria-label="第${year}学年 · 第${cycle}次轮回"><span class="rewinder-cycle-seal" aria-hidden="true">${cycle}</span><span><small>第${year}学年 · 一年一生</small><strong>第${cycle}次轮回</strong></span></div>` : ""}
        <div class="lobby-normal-tree-details" aria-live="polite">
          ${REWINDER_RULES.map((rule, index) => `<div class="lobby-normal-tree-detail" data-detail-index="${index}"${index === selected ? "" : " hidden"}>
            <div class="lobby-normal-tree-detail-heading"><strong>${rule.name}</strong></div>
            <div class="captain-tag-effects">${rule.lines.map(line => `<p>${line}</p>`).join("")}</div>
          </div>`).join("")}
        </div>
      </div></div>
    </div>
  </section>`;
}
