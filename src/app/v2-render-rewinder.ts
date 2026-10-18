import { normalizeRewinderCycleNumber } from "../core/v2-rewinder-cycle";
import "../styles/captain-tags.css";
import "../styles/rewinder-preview.css";

const REWINDER_RULES = [
  { name: "属性轮回", icon: "heart-pulse", tone: "#ac7c8d", column: 1, row: 1,
    lines: ["8月结束时，SAN、科研、社交、导师好感及上限、金币逐项取本学年最高纪录", "重玩本学年始终使用上一学年的档案，不叠加本年成果"] },
  { name: "天赋轮回", icon: "book-open", tone: "#788f73", column: 2, row: 1,
    lines: ["成长、发表天赋和累计经历保留各项最佳，永久buff保留", "咖啡、自行车及其成长保留；其他商品、在研在投论文清除"] },
  { name: "人际轮回", icon: "users-round", tone: "#8c83a2", column: 3, row: 1,
    lines: ["归档时选择导师、恋人和至多四位同伴，整张卡片与进度一同保留", "论文成果整套选择；下学年直接使用确定的档案，不再选卡"] },
  { name: "轮回者 · 特殊", icon: "hourglass", tone: "#38577f", column: 4, row: 1,
    lines: ["每次挑战一个学年：9月开局，8月结算并归档", "可重复挑战已解锁学年，打造完美年末；毕业或中途失败不归档"] },
  { name: "局内轮回", icon: "rotate-ccw", tone: "#92774c", column: 4, row: 2,
    lines: ["可无限回退当前事件，重新选择选项", "同一选项的结果固定，不会因回退而重新随机"] },
] as const;

/** The five fixed rules use the same read-only board in the lobby and in a run. */
export function renderRewinderPreview(selectedNodeIndex = 3, cycleNumber = 1, academicYear = 1): string {
  const selected = Number.isInteger(selectedNodeIndex) && selectedNodeIndex >= 0 && selectedNodeIndex < REWINDER_RULES.length
    ? selectedNodeIndex : 3;
  const cycle = normalizeRewinderCycleNumber(cycleNumber);
  const year = Math.max(1, Math.min(6, Math.floor(academicYear) || 1));
  return `<section class="lobby-profile-growth-card lobby-profile-section is-designed-growth-card captain-tags-card rewinder-preview-card">
    <div class="lobby-talent-tree is-designed-tree is-captain-tag-tree is-rewinder-tree" role="group" aria-label="轮回者能力 · 第${cycle}次轮回" data-active-page="0" data-rewinder-cycle="${cycle}">
      <div class="lobby-talent-tree-pages"><div class="lobby-talent-tree-page is-active is-designed-page" data-tree-page="0">
        ${REWINDER_RULES.map((rule, index) => `<button class="lobby-talent-tree-node is-fixed${index === selected ? " is-selected" : ""}" type="button" data-ui-talent-tree-node="0-${index}" data-rewinder-rule="${index}" aria-label="${rule.name}" aria-pressed="${index === selected}" style="--tree-tone:${rule.tone};--rewinder-node-row:${rule.row};grid-column:${rule.column};grid-row:${rule.row}">
          <span class="lobby-talent-tree-node-ring"><i data-lucide="${rule.icon}" aria-hidden="true"></i></span>
        </button>`).join("")}
        <div class="rewinder-cycle-banner" aria-label="第${year}学年 · 第${cycle}次轮回"><span class="rewinder-cycle-seal" aria-hidden="true">${cycle}</span><span><small>第${year}学年 · 一年一生</small><strong>第${cycle}次轮回</strong></span></div>
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
