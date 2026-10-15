# 本地存档系统

更新：2026-10-16。本文依据当前实现，存档保存在浏览器，存档本身不需要Supabase表。全球成就统计另新增三张表与两个RPC，详见[在线统计](ONLINE_STATISTICS.md)。

## 玩家行为

- 每个角色保留一局未结算进度，角色之间互不覆盖；开始页有存档时显示“继续游戏”
- 游戏状态变更后自动保存最新进度，开始新局及进入新月份时保留月初快照，每角色最多70个月初快照，另有一份最新进度
- 设置和结局页可以读取存档；读取月初快照会删除之后的快照，以读取点开始新的时间线
- 回溯恢复完整游戏状态，包括事件幕次、论文、人际、天赋运行状态、成就证据、收集集合、待上传统计和随机游标。同样的后续操作沿用同一随机序列，刷新或读档不重新抽签
- 返回开始页和刷新保留进度。再次进入角色直接恢复，不重复记新开局，不领取经验或成就奖励
- 自然结局和主动退学均先进入可读档的结局预览；只有“结算并重开”正式领取奖励、提交本局统计并开始同角色新局
- 打开调试面板的标记随整局存档保留，读较早存档也不能清除；该局无法领取成就、经验和玩家统计奖励

## 存储结构

| 数据 | 位置 | 保存内容 |
| --- | --- | --- |
| 局内存档 | IndexedDB `phd_simulator_v2_runs` | `runs`保存各角色最新进度与月份索引；`months`保存独立的月初快照 |
| 关闭恢复日志 | localStorage `phd_simulator_v2_run_journal_v1:角色ID` | 最新状态、尚未确认写入的月初快照、回溯截断位置和清除标记 |
| 局外账号 | localStorage `phd_simulator_v2_account_v1` | 等级经验、解锁、天赋分配、成就日期及奖励、跨局集合、各角色已结算runId、待交付统计outbox |
| 统计缓存与重试队列 | localStorage `phd_simulator_v2_statistics_v1` | 每局冻结的全球统计快照、上传队列和去重回执 |
| 成就全球统计 | localStorage `phd_simulator_v2_achievement_stats_v1` | 成就结算上传队列、全部成就的十分钟聚合缓存 |

局内提交先同步写关闭恢复日志，再串行写入IndexedDB。数据库确认对应修订后才清日志；重新打开页面时先读数据库，再应用未完成日志。月初快照不可变，后续普通动作仅更新最新进度；回溯删除和索引更新处于同一个IndexedDB事务。

账号层先在内存中序列化各类记录，再用一次localStorage写入完整账号信封。正式结算将奖励、已结算runId及outbox一起写入；成功后才清除旧存档并重开。若数据库中还残留已结算runId的旧存档，启动时清理它，避免崩溃恢复后重复领奖。

写入失败会显示状态提示并保留恢复日志；`flush()`会等待已有写入，对未确认日志再重试一次，不持续空转。页面隐藏、退出和恢复网络时会尝试保存或重传。格式损坏的角色存档单独跳过，不影响其他角色；不支持的存档版本不会强行加载。

## 统计边界

会议、期刊及毕业论文结果先写入本局`pendingRunStatistics`，随存档和回溯一起恢复。自然结局、阅读结果页或返回开始页均不上传这些结果；正式“结算并重开”后才交给原有统计客户端。访问、访客和真实开局计数仍沿用自己的口径，不必等待结局。

正式结算的账号outbox先持久化，再由应用层转换为论文统计和成就统计上传队列。两者成功落盘后才确认账号outbox已交付；网络失败保留队列重试。论文仍使用现有`record_phd_simulator_v2_stats_batch`及`get_phd_simulator_v2_stats_snapshot`，以统计类型、run标识和结果指纹去重，重试沿用原UUID；论文部分无需新表。

会议、期刊和盲审全球展示数据在开局读取并按局冻结，续玩恢复原快照，不随月度推进刷新。缓存按角色保留当前局，切换其他角色不会覆盖其存档的统计快照。只有新的局才建立新的快照；访问统计不属于冻结范围。

全球成就统计已接入独立的`record_phd_simulator_v2_achievement_run`和`get_phd_simulator_v2_achievement_stats`。只提交正式结算的非调试局，包括没有新成就的空列表；相同runId只能重试同一结果，不能拼接回溯分支。分子按完成成就的匿名玩家去重，分母按正式结算过合格角色的匿名玩家去重。全部成就一次读取、缓存十分钟；无有效数据或分母为0显示“—%”。全球数据不替代本地成就奖励、完成日期或存档。

本次不包含云存档、账号登录、跨设备同步或手动导入导出。

## 模块与接口

| 模块 | 主要接口与职责 |
| --- | --- |
| `v2-run-saves.ts` | `createRunSaveRepository()`；`ready/get/list/commit/rewind/clear/flush`管理存档；`validateRunSaveRecord()`校验；IndexedDB与内存适配器支持浏览器和测试 |
| `v2-account-storage.ts` | `loadAccountProfile/saveAccountProfile`原子读写局外账号；`FinalizedRunRecord`承载已结算待上传记录 |
| `v2-game-random.ts` | 序列化seed与cursor；`withGameRandom()`推进正式操作，`withGameRandomPreview()`复制游标用于只读预览 |
| `v2-run-statistics.ts` | `collectRunStatistics()`只记录已确认的真实论文与盲审结果；`getStatisticsRunKey()`保持本局统计身份 |
| `v2-store.ts` | `ready/hasRoleSave/getRunSaves/loadRunSave/flushSaves`供界面使用；`restart-game`执行正式结算；`getFinalizedOutbox/subscribeFinalized/acknowledgeFinalizedRun`交付统计 |
| `v2-render-run-saves.ts` | 最新进度、月初存档列表、回溯提示与错误状态 |
| `v2-bootstrap.ts` | 续玩与读档交互、页面退出保存、outbox交付及统计重传 |

Repository只接受已开始或已结束的有效局，不保存开始页。使用存档API前等待`ready()`；`loadRunSave()`只在局内或结局页恢复当前角色，开始页通过`start-game`自动恢复所选角色最新进度。
