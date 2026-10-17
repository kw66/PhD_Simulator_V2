import "../styles/captain-tags.css";

const REWINDER_RULES = [
  { name: "故我常在", icon: "heart-pulse", tone: "#ac7c8d", column: 1, row: 1,
    lines: ["SAN、科研、社交、导师好感及各自上限，按对应学年分别取历史较高值", "直接恢复，不经过抵抗；不同属性可以来自不同轮回，金币不继承"] },
  { name: "日积月累", icon: "book-open", tone: "#788f73", column: 2, row: 1,
    lines: ["成长天赋逐项保留较高进度，恢复进度不补发过去的奖励", "咖啡、自行车、装备、关系和发表天赋不直接继承，永久Buff不继承"] },
  { name: "师门长青", icon: "graduation-cap", tone: "#ab915c", column: 3, row: 1,
    lines: ["导师科研经费、科研积累、职称自动取高，已获帽子合并去重", "导师身份不变；恢复记录不重发基金，不重置项目期限"] },
  { name: "故人重逢", icon: "users-round", tone: "#8c83a2", column: 1, row: 2,
    lines: ["同学、恋人先手动解除当前关系，再勾选历史人物加入空位", "人物身份、属性和成长进度整套恢复，展示前后对比；不重发旧奖励"] },
  { name: "轻装再来", icon: "backpack", tone: "#829992", column: 2, row: 2,
    lines: ["金币、商品、科研论文、已发表成果和Buff不继承", "实习次数、联培经历可以保留，正在进行的实习及临时效果不继承"] },
  { name: "轮回者 · 特殊", icon: "hourglass", tone: "#38577f", column: 4, row: 1,
    lines: ["每学年结束发动轮回，各学年独立记录；属性与成长逐项自动取高", "人际记录自动保存，历史人物按空位选择；正式结算后将本世记录留给下一世"] },
] as const;

/** Design display only; no allocations, inherited state, or yearly gameplay hooks. */
export function renderRewinderPreview(selectedNodeIndex = 5): string {
  const selected = Number.isInteger(selectedNodeIndex) && selectedNodeIndex >= 0 && selectedNodeIndex < REWINDER_RULES.length
    ? selectedNodeIndex : 5;
  return `<section class="lobby-profile-growth-card lobby-profile-section is-designed-growth-card captain-tags-card">
    <div class="lobby-talent-tree is-designed-tree is-captain-tag-tree is-rewinder-tree" role="group" aria-label="轮回者能力设计预览" data-active-page="0">
      <div class="lobby-talent-tree-pages"><div class="lobby-talent-tree-page is-active is-designed-page" data-tree-page="0">
        ${REWINDER_RULES.map((rule, index) => `<button class="lobby-talent-tree-node is-fixed${index === selected ? " is-selected" : ""}" type="button" data-ui-talent-tree-node="0-${index}" data-rewinder-rule="${index}" aria-label="${rule.name}" aria-pressed="${index === selected}" style="--tree-tone:${rule.tone};grid-column:${rule.column};grid-row:${rule.row}">
          <span class="lobby-talent-tree-node-ring"><i data-lucide="${rule.icon}" aria-hidden="true"></i></span>
        </button>`).join("")}
        <div class="lobby-normal-tree-details" aria-live="polite">
          ${REWINDER_RULES.map((rule, index) => `<div class="lobby-normal-tree-detail" data-detail-index="${index}"${index === selected ? "" : " hidden"}>
            <div class="lobby-normal-tree-detail-heading"><strong>${rule.name}（设计预览）</strong></div>
            <div class="captain-tag-effects">${rule.lines.map(line => `<p>${line}</p>`).join("")}</div>
          </div>`).join("")}
        </div>
      </div></div>
    </div>
  </section>`;
}
