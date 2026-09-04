export type PaperHeatTier = "cold" | "steady" | "hot" | "frontier";

export type PaperTopicDomain = "vision" | "audio" | "language" | "machine-learning" | "robotics";

export interface GeneratedPaperTopic {
  title: string;
  topicId: string;
  topicLabel: string;
  heatMultiplier: number;
  prepublicationDecayRate: number;
}

interface PaperTopicDefinition {
  id: string;
  label: string;
  domain: PaperTopicDomain;
  techniques: readonly string[];
  goals: readonly string[];
  /** Topic attention by calendar year: 2023, 2024, ..., 2029. Null means not yet active. */
  tiers: readonly (PaperHeatTier | null)[];
}

const TOPIC_YEARS = [2023, 2024, 2025, 2026, 2027, 2028, 2029] as const;

/**
 * A compact catalog of distinct research directions. The year tiers model
 * relative attention, not whether a mature direction remains publishable.
 * Later-year entries are game extrapolations documented in
 * docs/PAPER_TOPIC_RESEARCH.md.
 */
const PAPER_TOPICS: readonly PaperTopicDefinition[] = [
  // Vision: core recognition, restoration, 3D and video
  {
    id: "image-classification",
    label: "图像分类",
    domain: "vision",
    techniques: ["Vision Transformer Backbones", "Long-Tailed Recognition", "Robust Image Classification"],
    goals: ["Reliable Visual Recognition", "Fine-Grained Classification", "Long-Tailed Category Recognition"],
    tiers: ["steady", "steady", "steady", "steady", "steady", "cold", "cold"],
  },
  {
    id: "object-detection",
    label: "目标检测",
    domain: "vision",
    techniques: ["Query-Based Object Detection", "Real-Time Detection Transformers", "Open-Vocabulary Detection"],
    goals: ["Accurate Object Localization", "Open-World Detection", "Robust Real-Time Detection"],
    tiers: ["steady", "steady", "steady", "steady", "steady", "steady", "steady"],
  },
  {
    id: "image-segmentation",
    label: "图像分割",
    domain: "vision",
    techniques: ["Promptable Segmentation", "Universal Segmentation Models", "Open-Vocabulary Mask Prediction"],
    goals: ["General-Purpose Segmentation", "Class-Agnostic Object Masks", "Fine-Grained Scene Parsing"],
    tiers: ["hot", "hot", "steady", "steady", "steady", "steady", "steady"],
  },
  {
    id: "tracking-reid",
    label: "跟踪与重识别",
    domain: "vision",
    techniques: ["Transformer Multi-Object Tracking", "Camera-Invariant Re-Identification", "Occlusion-Aware Association"],
    goals: ["Long-Term Identity Tracking", "Robust Person Retrieval", "Cross-Camera Understanding"],
    tiers: ["steady", "steady", "steady", "steady", "steady", "steady", "steady"],
  },
  {
    id: "image-restoration",
    label: "图像复原",
    domain: "vision",
    techniques: ["All-in-One Image Restoration", "Blind Image Denoising", "Real-World Super-Resolution"],
    goals: ["Recovering Degraded Images", "Realistic Sensor Noise Removal", "Faithful Detail Reconstruction"],
    tiers: ["steady", "steady", "steady", "steady", "steady", "cold", "cold"],
  },
  {
    id: "computational-imaging",
    label: "计算成像",
    domain: "vision",
    techniques: ["Neural Inverse Problems", "Computational Photography", "Physics-Aware Image Formation"],
    goals: ["Recovering Indirect Measurements", "Learned Computational Cameras", "Physics-Guided Reconstruction"],
    tiers: ["steady", "steady", "steady", "steady", "steady", "steady", "steady"],
  },
  {
    id: "medical-vision",
    label: "医学影像",
    domain: "vision",
    techniques: ["Medical Vision Foundation Models", "Weakly Supervised Diagnosis", "3D Clinical Segmentation"],
    goals: ["Reliable Clinical Image Analysis", "Data-Efficient Diagnosis", "Generalizable Medical Segmentation"],
    tiers: ["steady", "steady", "hot", "hot", "hot", "steady", "steady"],
  },
  {
    id: "remote-sensing",
    label: "遥感视觉",
    domain: "vision",
    techniques: ["Satellite Vision Transformers", "Multi-Temporal Remote Sensing", "Geospatial Foundation Models"],
    goals: ["Large-Scale Earth Observation", "Land-Cover Understanding", "Multi-Source Geospatial Reasoning"],
    tiers: ["steady", "steady", "steady", "hot", "hot", "hot", "steady"],
  },
  {
    id: "diffusion",
    label: "扩散生成",
    domain: "vision",
    techniques: ["Latent Diffusion", "Score-Based Generative Modeling", "Flow-Matching Generation"],
    goals: ["Controllable Image Generation", "High-Fidelity Visual Synthesis", "Conditional Generative Modeling"],
    tiers: ["frontier", "frontier", "hot", "steady", "cold", "cold", "cold"],
  },
  {
    id: "3d-reconstruction",
    label: "三维重建",
    domain: "vision",
    techniques: ["Neural Radiance Fields", "3D Gaussian Splatting", "Sparse-View Reconstruction"],
    goals: ["Novel View Synthesis", "Real-Time Scene Reconstruction", "Dynamic 3D Modeling"],
    tiers: ["frontier", "hot", "steady", "cold", "cold", "cold", "cold"],
  },
  {
    id: "video-understanding",
    label: "视频理解",
    domain: "vision",
    techniques: ["Long-Video Transformers", "Temporal Action Localization", "Video-Language Pretraining"],
    goals: ["Long-Horizon Video Understanding", "Fine-Grained Action Recognition", "Video Retrieval"],
    tiers: ["steady", "hot", "hot", "frontier", "frontier", "hot", "steady"],
  },
  {
    id: "video-generation",
    label: "视频生成",
    domain: "vision",
    techniques: ["Latent Video Diffusion", "Text-to-Video Generation", "Action-Conditioned Video Models"],
    goals: ["Long-Horizon Video Synthesis", "Controllable Scene Dynamics", "Consistent Video Generation"],
    tiers: ["cold", "steady", "hot", "frontier", "frontier", "hot", "steady"],
  },
  {
    id: "vision-language",
    label: "视觉语言模型",
    domain: "vision",
    techniques: ["Multimodal Instruction Tuning", "Unified Vision-Language Modeling", "Grounded Multimodal Reasoning"],
    goals: ["Open-World Visual Understanding", "Multimodal Reasoning", "Grounded Image Understanding"],
    tiers: ["hot", "frontier", "frontier", "frontier", "hot", "steady", "steady"],
  },
  {
    id: "multimodal-foundation",
    label: "多模态基础模型",
    domain: "machine-learning",
    techniques: ["Unified Multimodal Pretraining", "Any-to-Any Generation", "Cross-Modal Tokenization"],
    goals: ["Joint Image-Audio-Video Understanding", "Cross-Modal Generation", "Unified Multimodal Reasoning"],
    tiers: ["hot", "frontier", "frontier", "frontier", "hot", "steady", "steady"],
  },
  {
    id: "contrastive-learning",
    label: "视觉语言对比学习",
    domain: "vision",
    techniques: ["Contrastive Vision-Language Pretraining", "CLIP Prompt Adaptation", "Cross-Modal Retrieval"],
    goals: ["Transferable Image-Text Alignment", "Open-Vocabulary Recognition", "Zero-Shot Cross-Modal Retrieval"],
    tiers: ["hot", "hot", "steady", "steady", "steady", "cold", "cold"],
  },
  // Audio and speech
  {
    id: "speech-recognition",
    label: "语音识别",
    domain: "audio",
    techniques: ["Self-Supervised Speech Encoders", "Streaming Speech Recognition", "Multilingual ASR"],
    goals: ["Robust Speech Transcription", "Low-Resource Recognition", "Long-Form Speech Understanding"],
    tiers: ["steady", "steady", "steady", "steady", "steady", "steady", "steady"],
  },
  {
    id: "speech-enhancement",
    label: "语音增强",
    domain: "audio",
    techniques: ["Neural Speech Denoising", "Target Speaker Extraction", "Diffusion Speech Enhancement"],
    goals: ["Speech Enhancement in Noise", "Robust Far-Field Speech", "Low-Latency Audio Restoration"],
    tiers: ["steady", "steady", "steady", "steady", "steady", "steady", "steady"],
  },
  {
    id: "speech-synthesis",
    label: "语音合成",
    domain: "audio",
    techniques: ["Neural Text-to-Speech", "Expressive Speech Synthesis", "Zero-Shot Voice Cloning"],
    goals: ["Natural Controllable Speech", "Expressive Multilingual TTS", "Robust Speaker Adaptation"],
    tiers: ["steady", "hot", "hot", "hot", "hot", "steady", "steady"],
  },
  {
    id: "audio-language",
    label: "音频语言模型",
    domain: "audio",
    techniques: ["Audio-Language Pretraining", "Speech Instruction Tuning", "Audio Question Answering"],
    goals: ["General Audio Understanding", "Grounded Speech Reasoning", "Cross-Modal Audio Retrieval"],
    tiers: [null, "steady", "hot", "hot", "frontier", "hot", "steady"],
  },
  // Language and language-centered systems
  {
    id: "language-models",
    label: "大语言模型",
    domain: "language",
    techniques: ["Instruction-Tuned Language Models", "Long-Context Modeling", "Parameter-Efficient Adaptation"],
    goals: ["General Language Understanding", "Reliable Long-Context Generation", "Domain-Specific Assistance"],
    tiers: ["hot", "frontier", "frontier", "hot", "hot", "steady", "steady"],
  },
  {
    id: "code-intelligence",
    label: "代码智能",
    domain: "language",
    techniques: ["Code Language Models", "Repository-Level Program Analysis", "Execution-Guided Program Synthesis"],
    goals: ["Reliable Code Generation", "Automated Software Maintenance", "Program Reasoning and Debugging"],
    tiers: ["hot", "hot", "hot", "frontier", "hot", "steady", "steady"],
  },
  {
    id: "information-retrieval",
    label: "信息检索",
    domain: "language",
    techniques: ["Neural Dense Retrieval", "Retrieval-Augmented Generation", "Search Result Reranking"],
    goals: ["High-Recall Document Search", "Grounded Knowledge Access", "Evidence-Aware Retrieval"],
    tiers: ["steady", "hot", "hot", "hot", "steady", "steady", "steady"],
  },
  {
    id: "machine-translation",
    label: "机器翻译",
    domain: "language",
    techniques: ["Multilingual Sequence-to-Sequence Models", "Document-Level Translation", "Terminology-Constrained Decoding"],
    goals: ["High-Quality Translation", "Low-Resource Language Transfer", "Consistent Technical Translation"],
    tiers: ["steady", "steady", "steady", "steady", "steady", "steady", "steady"],
  },
  {
    id: "multilingual",
    label: "多语言与低资源",
    domain: "language",
    techniques: ["Cross-Lingual Transfer", "Low-Resource Data Augmentation", "Language-Adaptive Pretraining"],
    goals: ["Inclusive Language Technology", "Few-Shot Low-Resource NLP", "Cross-Lingual Generalization"],
    tiers: ["steady", "steady", "hot", "hot", "steady", "steady", "steady"],
  },
  {
    id: "nlp-evaluation",
    label: "语言模型评测",
    domain: "language",
    techniques: ["Instruction-Following Evaluation", "Factuality and Hallucination Tests", "Human Preference Benchmarking"],
    goals: ["Reliable Model Comparison", "Truthful Generation Measurement", "Robust Capability Evaluation"],
    tiers: ["steady", "hot", "hot", "hot", "hot", "steady", "steady"],
  },
  {
    id: "reasoning",
    label: "推理与测试时扩展",
    domain: "language",
    techniques: ["Verifier-Guided Reasoning", "Test-Time Compute Scaling", "Process-Supervised Reasoning"],
    goals: ["Reliable Multi-Step Reasoning", "Mathematical Problem Solving", "Adaptive Inference"],
    tiers: ["cold", "steady", "hot", "frontier", "frontier", "hot", "steady"],
  },
  {
    id: "agents",
    label: "智能体",
    domain: "language",
    techniques: ["Tool-Using Language Agents", "Planning and Acting", "Memory-Augmented Agents"],
    goals: ["Reliable Task Automation", "Long-Horizon Tool Use", "Interactive Problem Solving"],
    tiers: ["cold", "steady", "hot", "frontier", "frontier", "frontier", "hot"],
  },
  {
    id: "multi-agent",
    label: "多智能体协作",
    domain: "language",
    techniques: ["Cooperative Language Agents", "Multi-Agent Credit Assignment", "Emergent Agent Communication"],
    goals: ["Scalable Agent Collaboration", "Collective Problem Solving", "Decentralized Task Planning"],
    tiers: ["cold", "steady", "hot", "frontier", "hot", "frontier", "frontier"],
  },
  // General machine learning and applied AI
  {
    id: "mixture-of-experts",
    label: "混合专家模型",
    domain: "machine-learning",
    techniques: ["Sparse Mixture-of-Experts", "Expert Routing", "Load-Balanced Training"],
    goals: ["Scalable Foundation Models", "Conditional Computation", "Efficient Model Scaling"],
    tiers: ["steady", "hot", "hot", "hot", "frontier", "hot", "hot"],
  },
  {
    id: "efficient-inference",
    label: "高效推理",
    domain: "machine-learning",
    techniques: ["Low-Bit Quantization", "Speculative Decoding", "Sparse Inference"],
    goals: ["Low-Cost Model Serving", "On-Device Intelligence", "Low-Latency Inference"],
    tiers: ["steady", "hot", "hot", "hot", "hot", "frontier", "hot"],
  },
  {
    id: "model-compression",
    label: "模型轻量化",
    domain: "machine-learning",
    techniques: ["Knowledge Distillation", "Structured Pruning", "Quantization-Aware Training"],
    goals: ["Efficient Edge Intelligence", "Compact Foundation Models", "Low-Cost Deployment"],
    tiers: ["steady", "steady", "steady", "steady", "steady", "steady", "steady"],
  },
  {
    id: "recommendation-systems",
    label: "推荐系统",
    domain: "machine-learning",
    techniques: ["Sequential Recommendation", "Graph-Based Recommenders", "Generative Recommendation Models"],
    goals: ["Personalized Content Ranking", "Long-Term User Modeling", "Cold-Start Recommendation"],
    tiers: ["steady", "steady", "steady", "hot", "hot", "steady", "steady"],
  },
  {
    id: "data-centric-learning",
    label: "数据中心学习",
    domain: "machine-learning",
    techniques: ["Dataset Distillation", "Synthetic Data Generation", "Automated Data Curation"],
    goals: ["High-Quality Training Data", "Efficient Dataset Construction", "Robust Learning from Noisy Labels"],
    tiers: ["steady", "hot", "hot", "hot", "steady", "steady", "steady"],
  },
  {
    id: "continual-learning",
    label: "持续学习",
    domain: "machine-learning",
    techniques: ["Continual Representation Learning", "Catastrophic Forgetting Mitigation", "Lifelong Model Adaptation"],
    goals: ["Stable Knowledge Accumulation", "Online Task Adaptation", "Long-Term Personalized Models"],
    tiers: ["steady", "steady", "steady", "hot", "hot", "frontier", "hot"],
  },
  {
    id: "domain-generalization",
    label: "领域泛化与迁移",
    domain: "machine-learning",
    techniques: ["Domain-Invariant Representation Learning", "Test-Time Adaptation", "Source-Free Domain Transfer"],
    goals: ["Robust Cross-Domain Prediction", "Few-Shot Task Transfer", "Adaptation without Source Data"],
    tiers: ["steady", "steady", "steady", "steady", "steady", "cold", "cold"],
  },
  {
    id: "alignment",
    label: "模型对齐与安全",
    domain: "machine-learning",
    techniques: ["Preference Optimization", "Mechanistic Auditing", "Adversarial Robustness"],
    goals: ["Helpful and Safe Generation", "Interpretable Model Behavior", "Robust AI Deployment"],
    tiers: ["hot", "frontier", "hot", "hot", "steady", "steady", "steady"],
  },
  {
    id: "graph-learning",
    label: "图学习",
    domain: "machine-learning",
    techniques: ["Graph Neural Networks", "Geometric Representation Learning", "Graph Foundation Models"],
    goals: ["Relational Reasoning", "Scalable Graph Learning", "Knowledge Graph Completion"],
    tiers: ["steady", "steady", "steady", "steady", "cold", "cold", "cold"],
  },
  {
    id: "time-series",
    label: "时序预测",
    domain: "machine-learning",
    techniques: ["Temporal Transformers", "Probabilistic Forecasting", "Long-Horizon Time-Series Models"],
    goals: ["Accurate Demand Forecasting", "Uncertainty-Aware Prediction", "Long-Term Sequence Modeling"],
    tiers: ["steady", "steady", "hot", "hot", "hot", "steady", "steady"],
  },
  {
    id: "causal-learning",
    label: "因果机器学习",
    domain: "machine-learning",
    techniques: ["Causal Representation Learning", "Counterfactual Inference", "Neural Causal Discovery"],
    goals: ["Robust Out-of-Distribution Prediction", "Interpretable Decisions", "Causal Reasoning from Observations"],
    tiers: ["steady", "steady", "hot", "hot", "hot", "steady", "steady"],
  },
  {
    id: "reinforcement-learning",
    label: "强化学习",
    domain: "machine-learning",
    techniques: ["Offline Reinforcement Learning", "Hierarchical Policy Learning", "Model-Based Decision Making"],
    goals: ["Data-Efficient Control", "Robust Long-Horizon Planning", "Decision Making under Uncertainty"],
    tiers: ["steady", "steady", "hot", "hot", "hot", "steady", "steady"],
  },
  {
    id: "federated-learning",
    label: "联邦与隐私学习",
    domain: "machine-learning",
    techniques: ["Federated Representation Learning", "Privacy-Preserving Optimization", "Decentralized Training"],
    goals: ["Private Collaborative Learning", "Robust Federated Adaptation", "Communication-Efficient Training"],
    tiers: ["steady", "cold", "cold", "cold", "cold", "cold", "cold"],
  },
  {
    id: "ai-science",
    label: "科学智能",
    domain: "machine-learning",
    techniques: ["Scientific Foundation Models", "Physics-Informed Learning", "Data-Driven Discovery"],
    goals: ["Molecular Property Prediction", "Scientific Hypothesis Generation", "Accelerated Simulation"],
    tiers: ["steady", "steady", "hot", "hot", "frontier", "frontier", "hot"],
  },
  // Robotics and embodied systems
  {
    id: "robot-learning",
    label: "机器人学习与控制",
    domain: "robotics",
    techniques: ["Imitation Learning", "Dexterous Manipulation", "Sim-to-Real Policy Transfer"],
    goals: ["Generalizable Robot Control", "Data-Efficient Manipulation", "Robust Real-World Deployment"],
    tiers: ["steady", "steady", "hot", "hot", "frontier", "hot", "steady"],
  },
  {
    id: "embodied-vla",
    label: "具身智能与VLA",
    domain: "robotics",
    techniques: ["Vision-Language-Action Models", "Embodied Multimodal Policies", "Generalist Robot Learning"],
    goals: ["Open-World Robot Manipulation", "Language-Guided Control", "Generalizable Robot Skills"],
    tiers: ["cold", "steady", "frontier", "frontier", "frontier", "frontier", "hot"],
  },
  {
    id: "world-models",
    label: "世界模型",
    domain: "robotics",
    techniques: ["Generative World Models", "Latent Video Prediction", "Action-Conditioned Dynamics"],
    goals: ["Long-Horizon Environment Simulation", "Predictive World Modeling", "Planning with Learned Dynamics"],
    tiers: ["cold", "steady", "hot", "frontier", "frontier", "hot", "steady"],
  },
  {
    id: "agentic-science",
    label: "科研智能体",
    domain: "robotics",
    techniques: ["Research-Agent Collaboration", "Closed-Loop Scientific Discovery", "Verifiable Experiment Agents"],
    goals: ["Literature-to-Experiment Pipelines", "Agent-Assisted Discovery", "Reproducible Research Automation"],
    tiers: [null, null, null, "steady", "hot", "frontier", "frontier"],
  },
  {
    id: "self-supervised",
    label: "自监督表征学习",
    domain: "machine-learning",
    techniques: ["Self-Distillation", "Masked Modeling", "Vision Foundation Pretraining"],
    goals: ["Transferable Representations", "Label-Efficient Recognition", "General-Purpose Visual Features"],
    tiers: ["hot", "steady", "steady", "steady", "cold", "cold", "cold"],
  },
] as const;

export const PAPER_TOPIC_CATALOG: readonly PaperTopicDefinition[] = PAPER_TOPICS;

/**
 * Twenty heat levels cover 0.50–1.50. The last step is intentionally 0.10 so
 * both endpoints are available while keeping the catalog at twenty choices.
 */
export const PAPER_HEAT_MULTIPLIERS: readonly number[] = Object.freeze([
  0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95,
  1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.5,
]);

const TITLE_TEMPLATES = [
  (technique: string, goal: string) => `${technique} for ${goal}`,
  (technique: string, goal: string) => `${goal} with ${technique}`,
  (technique: string, goal: string) => `Learning ${goal} via ${technique}`,
  (technique: string, goal: string) => `${technique}: Toward ${goal}`,
] as const;

function clampRandomRoll(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(0.999999, value));
}

function pick<T>(items: readonly T[], random: () => number): T {
  return items[Math.floor(clampRandomRoll(random()) * items.length)] ?? items[0]!;
}

function getYearIndex(calendarYear: number): number {
  const normalizedYear = Math.trunc(Number.isFinite(calendarYear) ? calendarYear : TOPIC_YEARS[0]);
  if (normalizedYear <= TOPIC_YEARS[0]) return 0;
  if (normalizedYear >= TOPIC_YEARS[TOPIC_YEARS.length - 1]) return TOPIC_YEARS.length - 1;
  return TOPIC_YEARS.indexOf(normalizedYear as typeof TOPIC_YEARS[number]);
}

export function getPaperHeatTier(heatMultiplier: number): PaperHeatTier {
  if (heatMultiplier <= 0.75) return "cold";
  if (heatMultiplier <= 1) return "steady";
  if (heatMultiplier <= 1.25) return "hot";
  return "frontier";
}

export function getPaperHeatTierLabel(heatMultiplier: number): string {
  const tier = getPaperHeatTier(heatMultiplier);
  if (tier === "cold") return "冷门";
  if (tier === "steady") return "常规";
  if (tier === "hot") return "热门";
  return "风口";
}

export function generatePaperTopic(
  calendarYear: number,
  random: () => number = Math.random,
): GeneratedPaperTopic {
  const heatMultiplier = pick(PAPER_HEAT_MULTIPLIERS, random);
  const prepublicationDecayRate = Number((heatMultiplier * 0.1).toFixed(3));
  const tier = getPaperHeatTier(heatMultiplier);
  const yearIndex = getYearIndex(calendarYear);
  const activeTopics = PAPER_TOPICS.filter((topic) => topic.tiers[yearIndex] !== null);
  const topicPool = activeTopics.filter((topic) => topic.tiers[yearIndex] === tier);
  const topic = pick(topicPool.length > 0 ? topicPool : activeTopics, random);
  const technique = pick(topic.techniques, random);
  const goal = pick(topic.goals, random);
  const title = pick(TITLE_TEMPLATES, random)(technique, goal);

  return {
    title,
    topicId: topic.id,
    topicLabel: topic.label,
    heatMultiplier,
    prepublicationDecayRate,
  };
}
