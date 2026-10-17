import "../styles/captain-tags.css";
import { CAPTAIN_PREREQUISITE_ROLE_IDS } from "../core/v2-account-role-unlocks";
import { getRoleDefinition } from "../core/v2-progression";
import { MAX_ROLE_LEVEL } from "../core/v2-role-experience";
import type { AccountProfile } from "../core/v2-types";
import type { CaptainRunState } from "../core/v2-captain-state";

const TAG_APPEARANCE = [
  { icon: "user-round", tone: "#6d9179" },
  { icon: "coins", tone: "#b18a45" },
  { icon: "brain", tone: "#7c87aa" },
  { icon: "handshake", tone: "#a56d85" },
  { icon: "graduation-cap", tone: "#a17b59" },
  { icon: "sparkles", tone: "#b59b4e" },
] as const;

// Last effects stack by tagged relationship count, not tag level.
// Research increases use the shared resistance rules; fractional accumulation is retained.
// Ordinary player actions are unavailable, but AI-assisted actions remain available.
// SAN reduction shares the season modifier's settlement layer.
// Apply each tagged member's grant in sequence, reselecting the lowest each time; ties are random.
// Chosen extra advances repeat fellow cooperation / lover monthly progress, never their whole month.
// Advisor collaboration +5 is a fixed per-guidance bonus, not monthly permanent score growth.
const TAG_EFFECTS = {
  normal: {
    lover: "各进度条上限−5/级",
    advisor: "每月项目自动推进+1/级",
    fellow: "每月行动点+0.1/级",
    additional: "使玩家SAN消耗−1",
  },
  rich: {
    lover: "每月给予玩家0.4金币/级",
    advisor: "每月科研经费+0.8/级",
    fellow: "每月自身收入+0.4金币/级",
    additional: "每月使金币最少的非富可敌国成员+5金币（玩家、导师、同学，导师按科研经费）",
  },
  genius: {
    lover: "科研能力及上限+1/级",
    advisor: "每月科研积累+0.4/级",
    fellow: "科研能力及上限+1/级",
    additional: "每月使科研最低的非院士转世成员科研+0.5（玩家、恋人、同学）",
  },
  social: {
    lover: "亲密度及上限+1/级",
    advisor: "横向项目进度条上限−5/级",
    fellow: "默契度及上限+1/级",
    additional: "每月使能力最低的非社交达人成员社交|亲密|默契+0.5（玩家、恋人、同学）",
  },
  "teacher-child": {
    lover: "协作玩家效果+20%/级",
    advisor: "纵向项目进度条上限−5/级",
    fellow: "受导师指导效果+20%/级",
    additional: "使玩家每月导师好感+0.5，导师协作分数+5",
  },
  chosen: {
    lover: "每月自动推进+0.1次/级",
    advisor: "挂名论文引用倍率+10%/级",
    fellow: "每月协作自动推进+0.1次/级",
    additional: "使同学协作进度条上限−10",
  },
} as const;

function renderTagEffects(roleId: typeof CAPTAIN_PREREQUISITE_ROLE_IDS[number]): string {
  const effects = TAG_EFFECTS[roleId as keyof typeof TAG_EFFECTS];
  return `<div class="captain-tag-effects">
    <p>恋人：${effects.lover}；导师：${effects.advisor}；同学：${effects.fellow}</p>
    <p>${effects.additional}</p>
  </div>`;
}

/** Display account-derived passive levels; never expose allocation identifiers. */
export function renderCaptainTags(roleProgress: Partial<AccountProfile["roleProgress"]> = {}, selectedNodeIndex = 0, runLevels?: CaptainRunState["levels"]): string {
  const activeIndex = Number.isInteger(selectedNodeIndex) && selectedNodeIndex >= 0
    && selectedNodeIndex <= CAPTAIN_PREREQUISITE_ROLE_IDS.length ? selectedNodeIndex : 0;
  const tags = CAPTAIN_PREREQUISITE_ROLE_IDS.map((roleId, index) => {
    const rawLevel = runLevels ? runLevels[roleId as keyof typeof runLevels] : roleProgress[roleId]?.level ?? 0;
    return { roleId, name: getRoleDefinition(roleId).name, ...TAG_APPEARANCE[index],
      level: Number.isFinite(rawLevel) ? Math.max(0, Math.min(MAX_ROLE_LEVEL, Math.floor(rawLevel))) : 0 };
  });
  return `
    <section class="lobby-profile-growth-card lobby-profile-section is-designed-growth-card captain-tags-card">
      <div class="lobby-talent-tree is-designed-tree is-captain-tag-tree" role="group" aria-label="统御者六类标签" data-active-page="0">
        <div class="lobby-talent-tree-pages">
          <div class="lobby-talent-tree-page is-active is-designed-page" data-tree-page="0">
            ${tags.map((tag, index) => `
              <button class="lobby-talent-tree-node${index === activeIndex ? " is-selected" : ""}" type="button" data-ui-talent-tree-node="0-${index}" data-tag-role-id="${tag.roleId}" data-current-level="${tag.level}" aria-label="${tag.name}标签，等级${tag.level}，跟随对应角色等级" aria-pressed="${index === activeIndex}" style="--tree-tone:${tag.tone};grid-column:${index % 3 + 1};grid-row:${Math.floor(index / 3) + 1}">
                <span class="lobby-talent-tree-node-ring"><i data-lucide="${tag.icon}" aria-hidden="true"></i></span>
                <span class="lobby-normal-tree-node-level">${tag.level}/${MAX_ROLE_LEVEL}</span>
              </button>
            `).join("")}
            <button class="lobby-talent-tree-node is-fixed captain-special-node${activeIndex === tags.length ? " is-selected" : ""}" type="button" data-ui-talent-tree-node="0-${tags.length}" data-captain-special="true" data-fixed="true" aria-label="统御者特殊规则，固定生效" aria-pressed="${activeIndex === tags.length}" style="--tree-tone:#38577f;grid-column:4;grid-row:1">
              <span class="lobby-talent-tree-node-ring"><i data-lucide="crown" aria-hidden="true"></i></span>
            </button>
            <div class="lobby-normal-tree-details" aria-live="polite">
              ${tags.map((tag, index) => `
                <div class="lobby-normal-tree-detail" data-detail-index="${index}"${index === activeIndex ? "" : " hidden"}>
                  <div class="lobby-normal-tree-detail-heading"><strong>${tag.name} Lv${tag.level}</strong></div>
                  ${renderTagEffects(tag.roleId)}
                </div>
              `).join("")}
              <div class="lobby-normal-tree-detail" data-detail-index="${tags.length}"${activeIndex === tags.length ? "" : " hidden"}>
                <div class="lobby-normal-tree-detail-heading"><strong>统御者 · 特殊</strong></div>
                <div class="captain-tag-effects">
                  <p>自身行动点为0，仍可使用AI行动；导师、恋人、同学随机获得六类标签</p>
                  <p>三个人际事件无视触发条件，且每学年第1个月必定触发</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}
