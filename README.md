# 研究生模拟器 v2.0

<div align="center">

《研究生模拟器 v2.0》开发预览版。你将按月安排研究生生活，在科研、导师关系、社交、金币与 SAN 之间做取舍。

[在线试玩](https://kw66.github.io/PhD_Simulator_V2/) ·
[作者游戏合集](https://kw66.github.io/games/) ·
[体验 V1](https://kw66.github.io/PhD_Simulator/)

</div>

<p align="center">
  <img src="./assets/readme-cover.webp" alt="研究生模拟器 v2.0 封面" width="92%">
</p>

## 项目状态

V2 使用 Vite + TypeScript 组织规则、事件、状态和界面，目前仍在持续开发。基础角色、入学前流程、固定与随机事件、月份推进、属性抵抗、待办/历史事件、游戏日志、设置和调试入口均已接入。

科研工作站已支持开启论文、想 idea、做实验、写论文、投稿、审稿结算、引用增长和论文推广；看论文、打工、休息，以及商店的购买、出售、升级和订阅操作也已接通。

人际面板的主动互动仍是禁用预览。求职和大论文事件可通过调试入口查看并结算进度，但尚未接入自然月度调度；求职 offer 记录、大论文与毕业的联动也未完成。角色成就只在开始页展示，尚无局内判定、奖励或解锁。当前没有存档功能，刷新或关闭页面会丢失本局进度。

培养期限到达后，游戏按科研分判定硕士毕业、博士毕业或延期结局；SAN、金币、导师好感或社交能力跌破零也可能提前结束本局。开发检查开关当前已启用，入学前会显示各栏目并开放部分操作，这不代表正式的解锁流程。

## 当前玩法

- 以月份为单位推进研究生阶段，先处理阻塞事件，再进入下一月。
- 在入学前流程中联系讲师、查看研究组信息并确认导师。
- 分配每月行动次数，推进论文、看论文、打工或休息，同时留意各项操作的 SAN 消耗。
- 完成投稿后等待审稿结果，查看成果与引用，并按需要购买设备、咖啡和 AI 服务。
- 处理教师节、奖学金、寒暑假、学年总结、年会等固定事件。
- 面对按规则抽取的随机事件，并观察属性抵抗、事件效果、Buff 和游戏日志。
- 通过设置中的调试工具检查属性、月份、事件链和结局边界。

## 本地运行

需要 Node.js 20.19+ 或 22.12+。

```bash
npm ci
npm run dev
```

然后打开终端显示的本地地址。也可以使用 Windows 下的 [一键启动游戏.bat](./一键启动游戏.bat)。

常用命令：

```bash
npm run typecheck
npm test
npm run build
npm run verify
```

`npm run verify` 会依次运行类型检查、完整测试和生产构建。GitHub Pages 的构建入口位于 [.github/workflows/deploy-pages.yml](./.github/workflows/deploy-pages.yml)。

## 仓库结构

| 路径 | 作用 |
| --- | --- |
| [src/core/](./src/core) | 游戏状态、数值规则、事件和调试逻辑 |
| [src/app/](./src/app) | 启动、渲染和交互绑定 |
| [src/styles/](./src/styles) | 开始页与游戏页样式 |
| [tests/](./tests) | Vitest 回归测试 |
| [docs/DEFERRED_FEATURES.md](./docs/DEFERRED_FEATURES.md) | 暂缓、删除与恢复记录 |
| [art/final_roles/set_20260329_v2/web/](./art/final_roles/set_20260329_v2/web) | 发布版本使用的角色 WebP 资源 |

## 开发约定

- `vibe/` 是 V1.5 的行为与内容参考，`vibe2/` 是当前 V2 工程。
- V2 是新开发项目，不兼容旧存档；当前状态只保存在内存中，尚未实现进度保存与恢复。
- 暂未实装的系统保留必要的展示 UI 和调试数据，但不伪造可执行的游戏动作。
- 删除或暂缓的代码、状态和测试必须同步记录在 [docs/DEFERRED_FEATURES.md](./docs/DEFERRED_FEATURES.md)。

## 开发记录

V2 延续 V1 的 AI 辅助开发方式，采用按模块拆分的 TypeScript 工程。仓库提供类型检查、自动化测试和生产构建命令，GitHub Pages 部署前会运行 `npm run verify`。本地修改后应执行相应检查，并核对受影响的事件、状态或界面。
