import type { PaperTarget } from "./v2-types";
import type { ConferenceRegionId } from "./v2-conference-system";

export interface ConferenceInfo {
  name: string;
  fullName: string;
  field: string;
  year: number;
  month: number;
}

export interface ConferenceLocation {
  city: string;
  country: string;
  region: ConferenceRegionId;
}

interface ConferenceDefinition {
  name: string;
  fullName?: string;
  field: string;
  alternates?: {
    odd: { name: string; fullName: string };
    even: { name: string; fullName: string };
  };
}

export const CONFERENCES: Record<number, Record<PaperTarget, ConferenceDefinition>> = {
  1: {
    A: { name: "ICLR", fullName: "International Conference on Learning Representations", field: "深度学习" },
    B: { name: "ICRA", fullName: "International Conference on Robotics and Automation", field: "机器人" },
    C: { name: "WACV", fullName: "Winter Conference on Applications of Computer Vision", field: "计算机视觉" },
  },
  2: {
    A: { name: "WWW", fullName: "The Web Conference", field: "万维网" },
    B: { name: "NAACL", fullName: "North American Chapter of ACL", field: "自然语言处理" },
    C: { name: "MMAsia", fullName: "ACM Multimedia Asia", field: "多媒体" },
  },
  3: {
    A: { name: "CVPR", fullName: "Conference on Computer Vision and Pattern Recognition", field: "计算机视觉" },
    B: { name: "CIKM", fullName: "Conference on Information and Knowledge Management", field: "信息管理" },
    C: { name: "ICDAR", fullName: "International Conference on Document Analysis and Recognition", field: "文档分析" },
  },
  4: {
    A: { name: "ACL", fullName: "Annual Meeting of the Association for Computational Linguistics", field: "自然语言处理" },
    B: { name: "ICONIP", fullName: "International Conference on Neural Information Processing", field: "神经网络" },
    C: { name: "ICPR", fullName: "International Conference on Pattern Recognition", field: "模式识别" },
  },
  5: {
    A: { name: "IJCAI", fullName: "International Joint Conference on Artificial Intelligence", field: "人工智能" },
    B: { name: "ICME", fullName: "IEEE International Conference on Multimedia and Expo", field: "多媒体" },
    C: { name: "ICIP", fullName: "IEEE International Conference on Image Processing", field: "图像处理" },
  },
  6: {
    A: { name: "ICML", fullName: "International Conference on Machine Learning", field: "机器学习" },
    B: { name: "COLT", fullName: "Conference on Learning Theory", field: "学习理论" },
    C: { name: "IJCNN", fullName: "International Joint Conference on Neural Networks", field: "神经网络" },
  },
  7: {
    A: {
      name: "ICCV/ECCV",
      field: "计算机视觉",
      alternates: {
        odd: { name: "ICCV", fullName: "International Conference on Computer Vision" },
        even: { name: "ECCV", fullName: "European Conference on Computer Vision" },
      },
    },
    B: { name: "ISCA", fullName: "Annual Conference of ISCA", field: "语音" },
    C: { name: "IROS", fullName: "IEEE/RSJ International Conference on Intelligent Robots and Systems", field: "机器人" },
  },
  8: {
    A: { name: "ACM MM", fullName: "ACM International Conference on Multimedia", field: "多媒体" },
    B: { name: "EACL", fullName: "European Chapter of ACL", field: "自然语言处理" },
    C: { name: "IJCB", fullName: "International Joint Conference on Biometrics", field: "生物识别" },
  },
  9: {
    A: { name: "NeurIPS", fullName: "Conference on Neural Information Processing Systems", field: "机器学习" },
    B: { name: "ECAI", fullName: "European Conference on Artificial Intelligence", field: "人工智能" },
    C: { name: "BMVC", fullName: "British Machine Vision Conference", field: "计算机视觉" },
  },
  10: {
    A: { name: "EMNLP", fullName: "Conference on Empirical Methods in Natural Language Processing", field: "自然语言处理" },
    B: { name: "CoNLL", fullName: "Conference on Computational Natural Language Learning", field: "自然语言" },
    C: { name: "PRCV", fullName: "Chinese Conference on Pattern Recognition and Computer Vision", field: "模式识别" },
  },
  11: {
    A: { name: "COLING", fullName: "International Conference on Computational Linguistics", field: "计算语言学" },
    B: { name: "RSS", fullName: "Robotics: Science and Systems", field: "机器人" },
    C: { name: "ACCV", fullName: "Asian Conference on Computer Vision", field: "计算机视觉" },
  },
  12: {
    A: { name: "AAAI", fullName: "AAAI Conference on Artificial Intelligence", field: "人工智能" },
    B: { name: "ICMR", fullName: "ACM International Conference on Multimedia Retrieval", field: "多媒体检索" },
    C: { name: "3DV", fullName: "International Conference on 3D Vision", field: "三维视觉" },
  },
};

export const CONFERENCE_LOCATIONS: ConferenceLocation[] = [
  { city: "旧金山", country: "美国", region: "west" },
  { city: "西雅图", country: "美国", region: "west" },
  { city: "新奥尔良", country: "美国", region: "west" },
  { city: "温哥华", country: "加拿大", region: "west" },
  { city: "蒙特利尔", country: "加拿大", region: "west" },
  { city: "纽约", country: "美国", region: "west" },
  { city: "迈阿密", country: "美国", region: "west" },
  { city: "檀香山", country: "美国", region: "west" },
  { city: "圣地亚哥", country: "美国", region: "west" },
  { city: "波士顿", country: "美国", region: "west" },
  { city: "洛杉矶", country: "美国", region: "west" },
  { city: "多伦多", country: "加拿大", region: "west" },
  { city: "巴塞罗那", country: "西班牙", region: "west" },
  { city: "维也纳", country: "奥地利", region: "west" },
  { city: "阿姆斯特丹", country: "荷兰", region: "west" },
  { city: "巴黎", country: "法国", region: "west" },
  { city: "慕尼黑", country: "德国", region: "west" },
  { city: "伦敦", country: "英国", region: "west" },
  { city: "佛罗伦萨", country: "意大利", region: "west" },
  { city: "都柏林", country: "爱尔兰", region: "west" },
  { city: "斯德哥尔摩", country: "瑞典", region: "west" },
  { city: "苏黎世", country: "瑞士", region: "west" },
  { city: "爱丁堡", country: "英国", region: "west" },
  { city: "米兰", country: "意大利", region: "west" },
  { city: "新加坡", country: "新加坡", region: "asia" },
  { city: "东京", country: "日本", region: "asia" },
  { city: "首尔", country: "韩国", region: "asia" },
  { city: "悉尼", country: "澳大利亚", region: "asia" },
  { city: "墨尔本", country: "澳大利亚", region: "asia" },
  { city: "曼谷", country: "泰国", region: "asia" },
  { city: "京都", country: "日本", region: "asia" },
  { city: "香港", country: "中国", region: "domestic" },
  { city: "北京", country: "中国", region: "domestic" },
  { city: "上海", country: "中国", region: "domestic" },
  { city: "台北", country: "中国", region: "domestic" },
  { city: "深圳", country: "中国", region: "domestic" },
  { city: "杭州", country: "中国", region: "domestic" },
  { city: "南京", country: "中国", region: "domestic" },
  { city: "广州", country: "中国", region: "domestic" },
];

export const MAINLAND_LOCATIONS = CONFERENCE_LOCATIONS.filter(
  (location) => location.region === "domestic" && location.city !== "香港" && location.city !== "台北",
);

export const MAINLAND_ONLY_CONFERENCES: Partial<Record<number, PaperTarget[]>> = {
  10: ["C"],
};
