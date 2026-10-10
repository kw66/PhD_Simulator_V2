import { getGraduationPreparationYear, prepareThesisBlindReview, THESIS_REVIEW_THRESHOLDS } from "./v2-thesis-rules";
import type { GameState, PendingEvent } from "./v2-types";

export function collectThesisEventForMonth(
  state: GameState,
  random: () => number = Math.random,
): { nextState: GameState; event: PendingEvent | null } {
  const id = `thesis-review-${state.degree}-y${state.year}`;
  if (state.phase !== "playing" || state.year !== getGraduationPreparationYear(state.degree) || state.month < 8 || state.thesis.reviewResolved
    || state.eventQueue.some((event) => event.id === id || event.id.startsWith(`${id}-`) || event.chainId === id)) {
    return { nextState: state, event: null };
  }
  const nextState = prepareThesisBlindReview(state, random);
  const review = nextState.thesis.review;
  if (!review) return { nextState, event: null };
  const thresholds = THESIS_REVIEW_THRESHOLDS[review.degree];
  const excellentTitle = review.degree === "master" ? "优秀硕士论文" : "优秀博士论文";
  const result = !review.submitted ? "未能送审" : review.passed ? "盲审通过" : "盲审未通过";
  const settlement = `机制结算\n结果：${result}${review.excellent ? `\n结果：${excellentTitle}` : ""}`;
  const delay = review.degree === "master"
    ? "若五月没有转入博士培养，六月将按本硕士培养阶段延毕处理。"
    : "六月将按本博士培养阶段延毕处理。";
  const narrative = !review.submitted
    ? `你在送审名单上没找到自己的名字，回头核对科研分，📋材料确实还没达到要求。\n\n${review.reason}${delay}你把缺项记在目录旁，📝重新安排后续工作。`
    : review.excellent
      ? `你逐份读完意见，每位评审都给出了 A。那些反复核对过的实验和论证，📄得到了共同认可。\n\n学院将这份工作评为「${excellentTitle}」。你把意见存进论文文件夹，🎓终于能安心准备接下来的毕业手续。`
      : review.passed
        ? "你打开评审文件，几份意见都在 A、B 两档。还有些表达需要打磨，📄但研究工作已经达到要求。\n\n你把修改建议列成清单，准备逐项补好，📝接着办理六月的毕业手续。"
        : `你读到评审意见中的 C 或 D，停下来对照正文。几处论证还撑不起结论，📄需要继续补充研究。\n\n${delay}你把最需要补强的部分单独列出，📝先从这里改起。`;
  const base = { source: "thesis" as const, blocking: true, deadlineMonths: 0, chainId: id };
  const resultEvent: PendingEvent = {
    ...base, id: `${id}-result`, title: "毕业论文盲审 ➜ 评审结果", stage: "result",
    description: `${narrative}\n\n${settlement}`,
    thesisReviewPresentation: {
      degree: review.degree, title: review.title,
      pointScores: review.researchPoints.map((point) => point.score),
      review: {
        ...review,
        researchPoints: review.researchPoints.map((point) => ({ ...point })),
        reports: review.reports.map((report) => ({ ...report, weights: [...report.weights] })),
      },
    },
    completionLog: `${result}${review.excellent ? `，${excellentTitle}` : ""}`,
    choices: [{ id: `${id}-confirm`, label: "确定", outcome: "收好学院通知与评审材料。", effects: { resolveThesisReview: true } }],
  };
  const requirementsEvent: PendingEvent = {
    ...base, id: `${id}-requirements`, title: "毕业论文盲审 ➜ 送审要求", stage: "act2",
    description: [
      "你核对学院的送审说明，📋把科研分与论文版本一并确认。",
      `学院要求送审时达到已确定的毕业科研分要求。${review.degree === "master" ? "硕士论文的 2 个研究点交由 3 位评审" : "博士论文的 3 个研究点交由 5 位评审"}独立评阅；评审对各研究点的侧重不同，权重合计 3，加权分四舍五入。`,
      `A ≥ ${thresholds.A}，B ≥ ${thresholds.B}，C ≥ ${thresholds.C}，其余为 D。全部 A/B 才通过，全部 A 可获评${excellentTitle}。百分制分数在对应等级内给出。`,
      "四月提交的版本和送审资格将作为本次评审依据，后续发表的论文不再补入。你把通知收好，📁六月办理本培养阶段的毕业或延毕手续。",
    ].join("\n\n"),
    choices: [{ id: `${id}-read`, label: "继续", outcome: "查看本次评审结果。", effects: { enqueueEvents: [resultEvent] } }],
  };
  return {
    nextState,
    event: {
      ...base, id, title: "毕业论文盲审", stage: "act1",
      description: `学院发来了四月毕业论文送审通知。你打开《${review.title}》，核对封面、目录和研究记录，📁把这一版另存进文件夹。\n\n办公室还要核对送审资格，你翻出科研成果清单，📋准备逐项检查。`,
      choices: [{ id: `${id}-continue`, label: "继续", outcome: "核对送审要求。", effects: { enqueueEvents: [requirementsEvent] } }],
    },
  };
}
