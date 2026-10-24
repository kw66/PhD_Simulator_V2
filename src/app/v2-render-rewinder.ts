import { normalizeRewinderCycleNumber } from "../core/v2-rewinder-cycle";
import { getRoleChibiPortraitUrl } from "./v2-role-portrait-assets";
import "../styles/captain-tags.css";
import "../styles/rewinder-preview.css";

const REWINDER_RULE_LINES = [
  "属性轮回：属性取本年最佳",
  "天赋轮回：成长与永久效果保留",
  "人际轮回：人际与成果随档案延续",
  "每次挑战一个学年，8月归档，9月承接上一年成果",
] as const;

export interface RewinderYearSelection {
  availableYears?: readonly number[];
  hasRoleSave?: boolean;
  statusByYear?: readonly string[];
}

/** The rewinder uses six year nodes, matching the captain's six-role board. */
export function renderRewinderPreview(
  selectedNodeIndex = 0,
  cycleNumber = 1,
  academicYear = 1,
  showCycleBanner = true,
  yearSelection?: RewinderYearSelection,
): string {
  const cycle = normalizeRewinderCycleNumber(cycleNumber);
  const selectedYear = Math.max(1, Math.min(6, Math.floor(academicYear) || 1));
  const selected = Number.isInteger(selectedNodeIndex) && selectedNodeIndex >= 0 && selectedNodeIndex <= 6
    ? selectedNodeIndex : selectedYear - 1;
  const availableYears = new Set(yearSelection?.availableYears ?? []);
  const selectable = yearSelection !== undefined;
  const roleChibi = getRoleChibiPortraitUrl("rewinder");
  const yearNodes = Array.from({ length: 6 }, (_, index) => index + 1);

  return `<section class="lobby-profile-growth-card lobby-profile-section is-designed-growth-card captain-tags-card rewinder-preview-card${showCycleBanner ? "" : " is-setup-preview"}">
    <div class="lobby-talent-tree is-designed-tree is-captain-tag-tree is-rewinder-tree" role="group" aria-label="轮回者能力 · 第${cycle}次轮回" data-active-page="0" data-rewinder-cycle="${cycle}">
      <div class="lobby-talent-tree-pages"><div class="lobby-talent-tree-page is-active is-designed-page" data-tree-page="0">
        ${yearNodes.map((year, index) => {
          const isAvailable = !selectable || availableYears.has(year);
          const isDisabled = selectable && (Boolean(yearSelection?.hasRoleSave) || !isAvailable);
          const status = yearSelection?.hasRoleSave ? "请先完成当前学年"
            : yearSelection?.statusByYear?.[year - 1] ?? (!isAvailable ? `完成第${year - 1}学年归档后解锁` : "可挑战");
          return `<button class="lobby-talent-tree-node is-fixed rewinder-year-node${index === selected ? " is-selected" : ""}" type="button" data-ui-talent-tree-node="0-${index}" data-rewinder-year="${year}"${selectable ? ` data-ui-rewinder-start-year="${year}"` : ""} aria-label="轮回者，第${year}学年${isDisabled ? `，${status}` : ""}" aria-pressed="${index === selected}"${isDisabled ? ` disabled title="${status}"` : ""} style="--tree-tone:#38577f;grid-column:${index % 3 + 1};grid-row:${Math.floor(index / 3) + 1}">
            <span class="lobby-talent-tree-node-ring special-role-avatar-ring"><img class="special-role-avatar" src="${roleChibi}" alt="" aria-hidden="true"></span>
            <span class="rewinder-year-node-label">第${year}学年</span>
          </button>`;
        }).join("")}
        <button class="lobby-talent-tree-node is-fixed rewinder-special-node${selected === 6 ? " is-selected" : ""}" type="button" data-ui-talent-tree-node="0-6" data-rewinder-special="true" aria-label="轮回者特殊规则" aria-pressed="${selected === 6}" style="--tree-tone:#38577f;grid-column:4;grid-row:1">
          <span class="lobby-talent-tree-node-ring"><i data-lucide="hourglass" aria-hidden="true"></i></span>
        </button>
        <div class="lobby-normal-tree-details" aria-live="polite">
          ${yearNodes.map((year, index) => {
            const status = yearSelection?.hasRoleSave ? "请先完成当前学年"
              : yearSelection?.statusByYear?.[year - 1] ?? (yearSelection ? availableYears.has(year) ? "可挑战" : "未解锁" : year === selectedYear ? "本局学年" : "学年档案");
            return `<div class="lobby-normal-tree-detail" data-detail-index="${index}"${index === selected ? "" : " hidden"}>
              <div class="lobby-normal-tree-detail-heading"><strong>轮回者 · 第${year}学年</strong></div>
              <div class="captain-tag-effects"><p>${status}</p></div>
            </div>`;
          }).join("")}
          <div class="lobby-normal-tree-detail" data-detail-index="6"${selected === 6 ? "" : " hidden"}>
            <div class="lobby-normal-tree-detail-heading"><strong>轮回者 · 特殊</strong></div>
            <div class="captain-tag-effects"><p>第${cycle}次轮回 · 第${selectedYear}学年</p>${REWINDER_RULE_LINES.map(line => `<p>${line}</p>`).join("")}</div>
          </div>
        </div>
      </div></div>
    </div>
  </section>`;
}
