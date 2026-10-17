import "../styles/captain-tags.css";

const REWINDER_RULES = [
  { name: "属性轮回", icon: "heart-pulse", tone: "#ac7c8d", column: 1, row: 1,
    lines: ["SAN、科研、社交、导师好感及各自上限，逐项取历史较高值"] },
  { name: "天赋轮回", icon: "book-open", tone: "#788f73", column: 2, row: 1,
    lines: ["成长天赋的各项进度，逐项取历史较高值"] },
  { name: "人际轮回", icon: "users-round", tone: "#8c83a2", column: 3, row: 1,
    lines: ["导师科研经费、科研积累、职称取高，已获帽子合并", "同学、恋人整套状态保留；解除当前关系后，可勾选历史人物加入"] },
  { name: "轮回者 · 特殊", icon: "hourglass", tone: "#38577f", column: 4, row: 1,
    lines: ["每学年末与往世同学年合并，逐项取高", "各学年独立积累，正式结算后留给下一世"] },
] as const;

/** The four fixed rules use the same read-only board in the lobby and in a run. */
export function renderRewinderPreview(selectedNodeIndex = 3): string {
  const selected = Number.isInteger(selectedNodeIndex) && selectedNodeIndex >= 0 && selectedNodeIndex < REWINDER_RULES.length
    ? selectedNodeIndex : 3;
  return `<section class="lobby-profile-growth-card lobby-profile-section is-designed-growth-card captain-tags-card">
    <div class="lobby-talent-tree is-designed-tree is-captain-tag-tree is-rewinder-tree" role="group" aria-label="轮回者能力" data-active-page="0">
      <div class="lobby-talent-tree-pages"><div class="lobby-talent-tree-page is-active is-designed-page" data-tree-page="0">
        ${REWINDER_RULES.map((rule, index) => `<button class="lobby-talent-tree-node is-fixed${index === selected ? " is-selected" : ""}" type="button" data-ui-talent-tree-node="0-${index}" data-rewinder-rule="${index}" aria-label="${rule.name}" aria-pressed="${index === selected}" style="--tree-tone:${rule.tone};grid-column:${rule.column};grid-row:${rule.row}">
          <span class="lobby-talent-tree-node-ring"><i data-lucide="${rule.icon}" aria-hidden="true"></i></span>
        </button>`).join("")}
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
