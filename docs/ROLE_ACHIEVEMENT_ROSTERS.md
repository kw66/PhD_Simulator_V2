# 全部成就清单

更新：2026-10-17。由 `getAllAchievementDefinitions()` 自动生成，共175项；十二个正位/逆位角色各有独立硕士、博士毕业成就。

- 不论选中哪个角色，开始页展示同一完整目录；卡片对象标签决定完成资格，原通用奖励仍发给全体角色
- 本地达成记录与结局统一结算已接入；同一成就可记录多个符合条件角色的首次完成日期，奖励按成就ID仅发一次
- 卡片保留条件、奖励两行；完成角色及日期在悬浮框显示，五类收集成就的悬浮框列出尚缺项目
- 结局播报本局新增的角色完成记录，使用图标与名称；未要求毕业的条件允许失败结局结算
- 经验奖励按各受奖角色结算前的经验倍率计算；同一结局新获得的倍率不追溯放大本次奖励
- 普通成就经验+5；五类跨局收集各奖励所有角色经验倍率+0.2；其他倍率及角色解锁奖励以表格为准
- 初始恢复正常等级和解锁状态：新账户仅大多数可用，等级0；测试满级、全解锁关闭
- 全球达成率已接入数据库：以所有开局玩家为分母，跨角色完成同一成就只计1人；全部成就一次读取、缓存十分钟，无有效数据或分母为0显示“—%”

运行口径与代码入口见 [成就系统规则](ACHIEVEMENT_DESIGN.md)。本表是唯一当前清单，不包含撤回的候选草案。

| ID | 成就 | 对象 | 达成条件 | 奖励 |
| --- | --- | --- | --- | --- |
| normal:first-pot | 小有积蓄 | 大多数 | 金币达到30 | 经验+5，解锁富可敌国角色 |
| normal:research-start | 初窥门径 | 大多数 | 科研能力达到12 | 经验+5，解锁院士转世角色 |
| normal:favorite | 得到器重 | 大多数 | 导师好感达到12 | 经验+5，解锁导师子女角色 |
| normal:socialite | 人脉初成 | 大多数 | 社交能力达到12 | 经验+5，解锁社交达人角色 |
| normal:all-rounder | 全面发展 | 大多数 | 科研\|社交\|好感\|金币达到6 | 经验+5，解锁天选之人角色 |
| normal:chair-upgrade | 渐生惰性 | 大多数 | 获得电动按摩椅 | 经验+5，解锁怠惰·大多数角色 |
| normal:ending-master | 硕士毕业 | 大多数 | 达成硕士毕业结局 | 经验倍率+1 |
| normal:ending-phd | 博士毕业 | 大多数 | 达成博士毕业结局 | 经验倍率+1 |
| unlock:rewinder | 轮回者 | 通用 | 完成24个不同成就 | 解锁轮回者角色 |
| unlock:research-captain | 统御者 | 通用 | 解锁全部6个基础正位角色 | 解锁统御者角色 |
| normal:self-reliance-i | 笨鸟先飞 | 大多数 | 硕士期间科研达6 | 经验+5 |
| normal:self-reliance-ii | 主动破冰 | 大多数 | 硕士期间社交达6 | 经验+5 |
| normal:self-reliance-iii | 初获赏识 | 大多数 | 硕士期间导师好感达6 | 经验+5 |
| normal:self-reliance | 自立自强 | 大多数 | 硕士期间科研、社交、导师好感均达6 | 经验+5 |
| normal:truly-ordinary | 真·大多数 | 大多数 | 使用0天赋点博士毕业 | 经验倍率+1，解锁全部诅咒角色 |
| upright:breakthrough-i | 突破极限Ⅰ | 正位 | 科研\|社交\|好感任一项达25 | 经验+5 |
| global:breakthrough-ii | 突破极限Ⅱ | 通用 | 科研\|社交\|好感任一项达30 | 经验+5 |
| upright:wisdom-god-i | 智慧之神Ⅰ | 正位 | 科研达15 | 经验+5 |
| global:wisdom-god-ii | 智慧之神Ⅱ | 正位/逆位 | 科研达20 | 经验+5 |
| upright:social-butterfly-i | 交际花Ⅰ | 正位 | 社交达15 | 经验+5 |
| global:social-butterfly-ii | 交际花Ⅱ | 正位/逆位 | 社交达20 | 经验+5 |
| upright:steadfast-bond-i | 铁杆师生Ⅰ | 正位 | 导师好感达15 | 经验+5 |
| global:steadfast-bond-ii | 铁杆师生Ⅱ | 正位/逆位 | 导师好感达20 | 经验+5 |
| global:hexagon-warrior-i | 六边形战士Ⅰ | 正位/逆位 | 科研\|社交\|好感\|金币均达12 | 经验+5 |
| global:hexagon-warrior-ii | 六边形战士Ⅱ | 正位/逆位 | 科研\|社交\|好感\|金币均达20 | 经验+5 |
| global:strongest-brain | 最强大脑 | 正位/逆位 | 科研能力上限达到30 | 经验+5 |
| global:unbalanced | 严重偏科 | 正位/逆位 | 科研\|社交\|好感极差>12 | 经验+5 |
| global:overdrawn-life | 命悬一线 | 正位/逆位 | 生命上限不超过6 | 经验+5 |
| global:medical-miracle | 医学奇迹 | 正位/逆位 | 累计提升40点生命上限 | 经验+5 |
| upright:thick-health-i | 超厚血条Ⅰ | 正位 | SAN上限达到36 | 经验+5 |
| global:thick-health-ii | 超厚血条Ⅱ | 正位/逆位 | SAN上限达到60 | 经验+5 |
| upright:great-fortune-i | 家财万贯Ⅰ | 正位 | 金币达到60 | 经验+5 |
| global:great-fortune-ii | 家财万贯Ⅱ | 正位/逆位 | 金币达到200 | 经验+5 |
| global:advisor-funding-user | 经费大户 | 正位/逆位 | 硕士期间自身累计使用100导师经费 | 经验+5 |
| global:clear-minded | 人间清醒 | 正位/逆位 | 两次达到转博条件，但都拒绝了 | 经验+5 |
| global:young-genius | 天才少年 | 正位/逆位 | 转博时就达到博士毕业要求 | 经验+5 |
| global:three-a-master | 三A在手 | 正位/逆位 | 硕士期间一作发表≥3篇A类论文 | 经验+5 |
| global:collaboration-ten | 协作共赢 | 正位/逆位 | 合作发表≥10篇论文 | 经验+5 |
| global:collaboration-before-first | 协作先行 | 正位/逆位 | 先发合作论文，再发一作 | 经验+5 |
| global:excellent-master-thesis | 优秀硕士论文 | 正位/逆位 | 硕士论文盲审全部获A | 经验+5 |
| global:excellent-phd-thesis | 优秀博士论文 | 正位/逆位 | 博士论文盲审全部获A | 经验+5 |
| global:academic-star | 学术之星 | 正位/逆位 | 毕业时发表≥5篇A类论文 | 经验+5 |
| global:model-student | 三好学生 | 正位/逆位 | 连续拿到3年奖学金 | 经验+5 |
| global:paper-lover | 爱看论文 | 正位/逆位 | 看20次论文 | 经验+5 |
| global:paper-machine | 论文机器 | 正位/逆位 | 发表论文达到10篇 | 经验+5 |
| global:c-paper-king | 灌水之王 | 正位/逆位 | 硕士期间发表5篇C类论文 | 经验+5 |
| global:highbrow | 曲高和寡 | 正位/逆位 | 第一篇一作论文就是A类 | 经验+5 |
| global:best-paper | 最佳之作 | 正位/逆位 | 一作发表A类Best Paper | 经验+5 |
| global:nature-child | 自然之子 | 正位/逆位 | 一作发表NMI | 经验+5 |
| global:nature-summit | 自然之巅 | 通用 | 一作发表Nature | 经验+5 |
| global:future-academician | 未来院士 | 通用 | 发表≥2篇Nature | 经验+5 |
| global:high-score-paper-i | 高分论文Ⅰ | 正位/逆位 | 论文非协作分达100 | 经验+5 |
| global:high-score-paper-ii | 高分论文Ⅱ | 正位/逆位 | 论文非协作分达150 | 经验+5 |
| global:nobel-beginning | 诺奖之始 | 通用 | 论文总分达1000 | 经验+5 |
| global:all-publicity | 全网开花 | 正位/逆位 | 单篇一作完成全部宣传 | 经验+5 |
| global:perfect-start | 百发百中 | 正位/逆位 | 前5次投稿全部命中 | 经验+5 |
| global:double-hit | 一箭双雕 | 正位/逆位 | 在一个会议同时中至少2篇论文 | 经验+5 |
| global:author-six | 群英荟萃 | 正位/逆位 | 单篇论文作者≥6人 | 经验+5 |
| global:thousand-citations | 千引大佬 | 正位/逆位 | 总引用达到1000 | 经验+5 |
| global:ten-thousand-citations | 万引大佬 | 通用 | 总引用达到10000 | 经验+5 |
| global:cannot-be-buried | 无法埋没 | 正位/逆位 | 单篇C类论文引用超过100 | 经验+5 |
| global:air-dried | 自然风干 | 正位/逆位 | 论文三项分数均随时间衰减至1 | 经验+5 |
| global:tasteless | 食之无味 | 正位/逆位 | 一篇论文被连续拒稿3次 | 经验+5 |
| global:never-give-up | 百折不挠 | 正位/逆位 | 论文累计拒稿10次 | 经验+5 |
| global:double-trouble | 祸不单行 | 正位/逆位 | 同时遇到被抢发idea和新SOTA | 经验+5 |
| global:lucky-review | 幸运儿 | 正位/逆位 | 论文分配到3个心软审稿人 | 经验+5 |
| global:back-from-the-brink | 起死回生 | 正位/逆位 | 三位大牛审稿人均给改进 | 经验+5 |
| global:turn-the-tide | 力挽狂澜 | 正位/逆位 | 审稿总分-1时被PC捞起录用 | 经验+5 |
| global:new-love-type | 别样心动 | 正位/逆位 | 分手后交往另一类型恋人 | 经验+5 |
| global:joint-training | 另开眼界 | 正位/逆位 | 参加联培 | 经验+5 |
| global:three-internships | 职场熟客 | 正位/逆位 | 完成3段实习 | 经验+5 |
| global:learn-to-refuse | 学会拒绝 | 正位/逆位 | 导师项目\|审稿\|毕设各拒绝1次 | 经验+5 |
| global:tea-break | 我爱茶歇 | 正位/逆位 | 开会选择茶歇≥3次 | 经验+5 |
| global:funded-travel | 公费旅游 | 正位/逆位 | 开会选择旅游≥3次 | 经验+5 |
| global:valse-poster | 顺便展出 | 正位/逆位 | 在VALSE做Poster展示 | 经验+5 |
| global:reported-scholarship | 失之交臂 | 正位/逆位 | 被举报导致错失国奖 | 经验+5 |
| global:help-collector | 博闻强记 | 正位/逆位 | 阅读全部小提示 | 经验+5 |
| global:event-burst | 事件爆发 | 正位/逆位 | 某个月同时出现≥6个事件 | 经验+5 |
| global:buff-god | Buff之神 | 正位/逆位 | 同一时刻拥有≥10种Buff | 经验+5 |
| global:expanded-cohort | 大扩招 | 正位/逆位 | 人际栏集齐4个同门 | 经验+5 |
| global:balanced-company | 均衡分布 | 正位/逆位 | 人际栏集齐师兄\|师弟\|师姐\|师妹 | 经验+5 |
| global:junior-rescue | 师妹救我 | 正位/逆位 | 人际栏集齐4个师妹 | 经验+5 |
| global:top-lab | 顶尖大组 | 正位/逆位 | 3个同学科研均达12 | 经验+5 |
| global:perfect-rapport | 心有灵犀 | 正位/逆位 | 3个同学默契均达12 | 经验+5 |
| global:beloved-mentor | 吾爱吾师 | 正位/逆位 | 教师节连续赠送3次邮票 | 经验+5 |
| global:reverse-mentoring-i | 鞭策导师Ⅰ | 正位/逆位 | 导师评上三级教授 | 经验+5 |
| global:reverse-mentoring-ii | 鞭策导师Ⅱ | 正位/逆位 | 导师评上院士 | 经验+5 |
| global:horizontal-king | 横向之王 | 正位/逆位 | 完成10次横向项目 | 经验+5 |
| global:vertical-king | 纵向之王 | 正位/逆位 | 完成10次纵向项目 | 经验+5 |
| global:early-romance | 我要早恋 | 正位/逆位 | 硕士时就恋爱 | 经验+5 |
| global:shopping-spree | 为爱买单 | 正位/逆位 | 恋人购物进度条满3次 | 经验+5 |
| global:errand-runner | 被迫跑腿 | 正位/逆位 | 跑腿3次 | 经验+5 |
| global:windfall | 一夜暴富 | 正位/逆位 | 某个月收入达到100金币 | 经验+5 |
| global:ultimate-gpu-i | 顶级显卡Ⅰ | 正位/逆位 | 拥有A6000及以上的显卡 | 经验+5 |
| global:ultimate-gpu-ii | 顶级显卡Ⅱ | 正位/逆位 | 拥有B300显卡 | 经验+5 |
| global:full-gear | 整装待发 | 正位/逆位 | 集齐小电驴\|遮阳伞\|羽绒服 | 经验+5 |
| global:ai-collaboration | AI协作 | 正位/逆位 | 同时订阅3路AI，含GPT/Claude | 经验+5 |
| global:perfect-workstation | 完美工位 | 正位/逆位 | 集齐椅子\|咖啡机\|键盘\|显示器 | 经验+5 |
| global:travel-kit | 出行套装 | 正位/逆位 | 集齐小电驴\|羽绒服\|遮阳伞 | 经验+5 |
| global:ultimate-coffee | 绝世咖啡 | 正位/逆位 | 冰美式效果达到SAN+6 | 经验+5 |
| global:workaholic | 打工狂人 | 正位/逆位 | 累计打工15次 | 经验+5 |
| global:study-fatigue | 不爱学习 | 正位/逆位 | 累计触发3次厌倦学习 | 经验+5 |
| global:hyperactive-i | 我有多动症Ⅰ | 正位/逆位 | 单月行动≥3次（含AI） | 经验+5 |
| global:hyperactive-ii | 我有多动症Ⅱ | 正位/逆位 | 单月行动≥4次（含AI） | 经验+5 |
| global:deep-sleep | 睡得好香 | 正位/逆位 | 主动休息累计回复50SAN | 经验+5 |
| global:cherish-life | 爱惜生命 | 正位/逆位 | 去医院3次 | 经验+5 |
| global:cycling-prodigy | 骑行天才 | 正位/逆位 | 骑车累计增加12点SAN上限 | 经验+5 |
| global:badminton-expert | 羽球高手 | 正位/逆位 | 首次打羽球未买球拍就获胜 | 经验+5 |
| global:stay-put | 偏安一隅 | 正位/逆位 | 拒绝过实习 | 经验+5 |
| global:card-god | 赌神转世 | 正位/逆位 | 打牌累计赚取10金币 | 经验+5 |
| global:shiny-bond | 异色之缘 | 正位/逆位 | 洛克王国抓取3次异色 | 经验+5 |
| global:karaoke-king | K歌之王 | 正位/逆位 | 唱过猪猪侠\|迪迦\|神兵小将 | 经验+5 |
| global:magic-tower | 穞堵臸猭畍 | 正位/逆位 | 玩魔塔3次 | 经验+5 |
| global:terraria | 300颗够吗 | 正位/逆位 | 玩泰拉瑞亚3次 | 经验+5 |
| global:career-start | 初入职场 | 正位/逆位 | 取得任意offer | 经验+5 |
| global:career-internet | 大厂上岸 | 正位/逆位 | 取得大厂算法岗及以上offer | 经验+5 |
| global:career-state | 央企有我 | 正位/逆位 | 取得央企总部业务主管及以上offer | 经验+5 |
| global:career-civil | 金榜题名 | 正位/逆位 | 取得省直二级主任科员及以上offer | 经验+5 |
| global:career-academic | 站上讲台 | 正位/逆位 | 取得211讲师及以上offer | 经验+5 |
| global:career-apex-internet | 登峰造极·大厂 | 通用 | 取得首席科学家offer | 经验+5 |
| global:career-apex-state | 登峰造极·央企 | 通用 | 取得央企总部部门负责人offer | 经验+5 |
| global:career-apex-civil | 登峰造极·仕途 | 通用 | 取得中央部委四级调研员offer | 经验+5 |
| global:career-apex-academic | 登峰造极·学界 | 通用 | 取得世界名校长聘教授offer | 经验+5 |
| global:ending-delay | 延毕 | 正位/逆位 | 达成延毕结局 | 经验+5 |
| global:ending-overthinking | 用脑过度 | 正位/逆位 | 达成用脑过度结局 | 经验+5 |
| global:ending-burnout | 不堪重负 | 正位/逆位 | 达成不堪重负结局 | 经验+5 |
| global:ending-expelled | 逐出师门 | 正位/逆位 | 达成逐出师门结局 | 经验+5 |
| global:ending-quit | 主动退学 | 正位/逆位 | 达成主动退学结局 | 经验+5 |
| global:ending-poor | 穷困潦倒 | 正位/逆位 | 达成穷困潦倒结局 | 经验+5 |
| global:ending-lab-bankrupt | 实验室破产 | 正位/逆位 | 达成实验室破产结局 | 经验+5 |
| global:ending-isolated | 被孤立 | 正位/逆位 | 达成被孤立结局 | 经验+5 |
| global:buff-collector | Buff收集者 | 通用 | 跨局跨角色获得过所有Buff | 经验倍率+0.2 |
| global:product-collector | 商品收集者 | 通用 | 跨局跨角色获得过所有商品 | 经验倍率+0.2 |
| global:conference-collector | 会议收集者 | 通用 | 跨局跨角色中过所有会议的论文 | 经验倍率+0.2 |
| global:travel-collector | 旅行收集者 | 通用 | 跨局跨角色去过所有会议地点 | 经验倍率+0.2 |
| global:direction-collector | 方向收集者 | 通用 | 跨局跨角色发表过所有研究方向的论文 | 经验倍率+0.2 |
| global:conference-three-years | 年年赴约 | 正位/逆位 | 连续3年发表同一个会议 | 经验+5 |
| genius:ending-master | 硕士毕业 | 院士转世 | 达成硕士毕业结局 | 经验倍率+1 |
| genius:ending-phd | 博士毕业 | 院士转世 | 达成博士毕业结局 | 经验倍率+1 |
| unlock:genius-reversed | 大智若愚 | 院士转世 | 博士毕业，科研能力始终小于6 | 经验倍率+1，解锁愚钝·院士转世角色 |
| social:ending-master | 硕士毕业 | 社交达人 | 达成硕士毕业结局 | 经验倍率+1 |
| social:ending-phd | 博士毕业 | 社交达人 | 达成博士毕业结局 | 经验倍率+1 |
| unlock:social-reversed | 独来独往 | 社交达人 | 博士毕业，社交能力始终小于6 | 经验倍率+1，解锁嫉妒·社交达人角色 |
| rich:ending-master | 硕士毕业 | 富可敌国 | 达成硕士毕业结局 | 经验倍率+1 |
| rich:ending-phd | 博士毕业 | 富可敌国 | 达成博士毕业结局 | 经验倍率+1 |
| unlock:rich-reversed | 一毛不拔 | 富可敌国 | 博士毕业，累计金币花费小于10 | 经验倍率+1，解锁贪求·富可敌国角色 |
| teacher-child:ending-master | 硕士毕业 | 导师子女 | 达成硕士毕业结局 | 经验倍率+1 |
| teacher-child:ending-phd | 博士毕业 | 导师子女 | 达成博士毕业结局 | 经验倍率+1 |
| unlock:teacher-child-reversed | 不假师恩 | 导师子女 | 博士毕业，导师好感始终小于6 | 经验倍率+1，解锁玩世·导师子女角色 |
| chosen:ending-master | 硕士毕业 | 天选之人 | 达成硕士毕业结局 | 经验倍率+1 |
| chosen:ending-phd | 博士毕业 | 天选之人 | 达成博士毕业结局 | 经验倍率+1 |
| unlock:chosen-reversed | 从容不迫 | 天选之人 | 博士毕业，SAN始终高于12 | 经验倍率+1，解锁空想·天选之人角色 |
| normal-reversed:ending-master | 硕士毕业 | 怠惰·大多数 | 达成硕士毕业结局 | 经验倍率+1 |
| normal-reversed:ending-phd | 博士毕业 | 怠惰·大多数 | 达成博士毕业结局 | 经验倍率+1 |
| normal-reversed:zero-talent-master | 绝地求生·怠惰 | 怠惰·大多数 | 使用0天赋点硕士毕业 | 经验倍率+1 |
| genius-reversed:ending-master | 硕士毕业 | 愚钝·院士转世 | 达成硕士毕业结局 | 经验倍率+1 |
| genius-reversed:ending-phd | 博士毕业 | 愚钝·院士转世 | 达成博士毕业结局 | 经验倍率+1 |
| genius-reversed:zero-talent-master | 绝地求生·愚钝 | 愚钝·院士转世 | 使用0天赋点硕士毕业 | 经验倍率+1 |
| genius-reversed:break-research-curse | 拨云见日 | 愚钝·院士转世 | 实际破除学术失语诅咒 | 经验倍率+1 |
| social-reversed:ending-master | 硕士毕业 | 嫉妒·社交达人 | 达成硕士毕业结局 | 经验倍率+1 |
| social-reversed:ending-phd | 博士毕业 | 嫉妒·社交达人 | 达成博士毕业结局 | 经验倍率+1 |
| social-reversed:zero-talent-master | 绝地求生·嫉妒 | 嫉妒·社交达人 | 使用0天赋点硕士毕业 | 经验倍率+1 |
| rich-reversed:ending-master | 硕士毕业 | 贪求·富可敌国 | 达成硕士毕业结局 | 经验倍率+1 |
| rich-reversed:ending-phd | 博士毕业 | 贪求·富可敌国 | 达成博士毕业结局 | 经验倍率+1 |
| rich-reversed:zero-talent-master | 绝地求生·贪求 | 贪求·富可敌国 | 使用0天赋点硕士毕业 | 经验倍率+1 |
| teacher-child-reversed:ending-master | 硕士毕业 | 玩世·导师子女 | 达成硕士毕业结局 | 经验倍率+1 |
| teacher-child-reversed:ending-phd | 博士毕业 | 玩世·导师子女 | 达成博士毕业结局 | 经验倍率+1 |
| teacher-child-reversed:zero-talent-master | 绝地求生·玩世 | 玩世·导师子女 | 使用0天赋点硕士毕业 | 经验倍率+1 |
| chosen-reversed:ending-master | 硕士毕业 | 空想·天选之人 | 达成硕士毕业结局 | 经验倍率+1 |
| chosen-reversed:ending-phd | 博士毕业 | 空想·天选之人 | 达成博士毕业结局 | 经验倍率+1 |
| chosen-reversed:zero-talent-master | 绝地求生·空想 | 空想·天选之人 | 使用0天赋点硕士毕业 | 经验倍率+1 |
| cursed-frail:curse-hell-phd | 病入膏肓 | 体弱多病 | 地狱难度博士毕业 | 全角色天赋点+1 |
| special-finite-life:curse-hell-phd | 向死而生 | 有限人生 | 地狱难度博士毕业 | 全角色天赋点+1 |
| special-fading-genius:curse-hell-phd | 才思不灭 | 天才迟暮 | 地狱难度博士毕业 | 全角色天赋点+1 |
| cursed-debt:curse-hell-phd | 逆债而行 | 寒门负重 | 地狱难度博士毕业 | 全角色天赋点+1 |

## 跨局收集范围

| 类型 | 固定目录项数 | 口径 |
| --- | --- | --- |
| Buff | 29 | 按实际可获得的效果类型归一化，不按来源实例、数值和持续时间重复计数 |
| 商品 | 38 | 含装备各升级、咖啡、配件及6类AI；同一AI不同年份计一种 |
| 会议 | 37 | 录用过所有会议，合作论文也算；ICCV与ECCV分别计数 |
| 地点 | 42 | 实际亲自参会，含VALSE明确城市；代贴、未出发预约与“外地”占位不算 |
| 方向 | 47 | 发表过所有研究方向，合作论文也算 |

收集进度在合格结局合并到账号。收集成就完成一次后不再按后续角色重复播报或发奖；普通共享成就仍能继续记录其他角色的完成日期。
