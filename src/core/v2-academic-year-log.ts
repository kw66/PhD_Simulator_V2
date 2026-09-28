import { isPreEnrollmentState } from "./v2-progression";
import type { GameState } from "./v2-types";

const ACADEMIC_YEAR_MESSAGES: readonly string[] = [
  "刚入学就听师兄师姐吐槽：小同行审起稿来，对你哪里薄弱门儿清，真想卡你时一句‘创新性不足’就够了。GPT-3.5 已经能帮忙理思路、起草文字，挺新鲜；要是审稿人的脾气也能跟着升级就好了。",
  "又到九月，组里聊 GPT-4o 和 Claude 3.5 Sonnet 的时间快赶上聊课题了。AI 从帮忙起草到搭把手检查实验方案，进步真快。投稿的人也更来劲了，师兄说审稿意见里那股熟悉的 AI 味儿越来越浓，认真写的回复也不知道有没有人认真看。",
  "GPT-5、DeepSeek-R1、Kimi K2 一起上桌，想点子、跑实验、看论文都有人搭把手了，去年还觉得离谱的事，今年居然用顺手了。投稿列表越刷越长，审稿人却没见多出几双眼睛；碰上 AI 审稿，同一篇文章到底被盯住哪一项，越来越像抽签。",
  "九月一到，GPT-6-Astra 和 Claude Fable 5 又换上了新招牌，连 Gemini 3 都能帮忙省点跟人打交道的心力。AI 越来越能干，投稿也跟开了水龙头似的。有人用 AI 写，有人用 AI 审，意见写得四平八稳，细看却像没对上题；改论文之外，还得猜这回抽中了什么口味。",
  "GPT-7 配上 DeepSeek-V5，科研提速已经不只是润色几句话了，Kimi K4 连看论文都更勤快。AI 科研到处开花，投稿一茬接一茬，认真看完一篇反倒成了稀缺本事。以前怕小同行太懂、专挑软肋，现在还怕审稿压根没看懂，套段 AI 评语就给了分。",
  "第六个九月，GPT-8、Claude Fable 7 都来了。刚入学时还在感叹 AI 能写段像样的话，如今从点子到实验再到成稿，它几乎样样都能搭把手，发展快得让人有点恍惚。AI 科研的稿子满天飞，AI 审稿也越来越常见；小同行的恶意没消失，抽签般的评审又添一层。折腾这么久，还是盼着自己的工作能被一个认真读过的人看见。",
];

export function appendAcademicYearLog(state: GameState): GameState {
  if (state.phase !== "playing" || state.month !== 1 || isPreEnrollmentState(state)) return state;
  const message = ACADEMIC_YEAR_MESSAGES[state.year - 1];
  if (!message) return state;
  const id = `academic-year-${state.year}`;
  if (state.log.some((entry) => entry.id === id)) return state;
  return {
    ...state,
    log: [{ id, month: state.totalMonths, text: `第 ${state.year} 学年 · 九月开学：${message.replaceAll("；", "。")}` }, ...state.log],
  };
}
