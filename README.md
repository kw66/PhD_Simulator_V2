# 研究生模拟器 V2

<div align="center">

《研究生模拟器》的 V2 开发预览版。按月推进研究生生活，在科研、导师关系、社交、金钱与 SAN 之间做取舍。

[在线试玩](https://kw66.github.io/PhD_Simulator_V2/) ·
[作者游戏合集](https://kw66.github.io/games/) ·
[体验 V1](https://kw66.github.io/PhD_Simulator/)

</div>

<p align="center">
  <img src="./assets/readme-cover.webp" alt="研究生模拟器 V2 封面" width="92%">
</p>

## 项目状态

V2 使用 Vite + TypeScript 重新组织规则、事件、状态和界面，目前仍处于持续开发阶段。当前可完整体验的是基础角色、入学前流程、固定事件、随机事件、月份推进、属性抵抗、待办/历史事件、游戏日志、设置和调试入口。

科研工作站、成果、人际、商店、关系链、论文、求职和大论文等栏目已经保留展示界面，但其中一部分操作仍是禁用的预览状态；角色成就目前只在开始页展示，尚未接入局内判定、奖励或解锁存档。培养期限到达后会根据科研分进入硕士毕业、博士毕业或延期结局，其他毕业线路仍会继续扩展。

## 当前玩法

- 以月份为单位推进研究生阶段，先处理阻塞事件，再进入下一月。
- 在入学前流程中联系讲师、查看研究组信息并确认导师。
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
- V2 是新开发项目，不兼容旧存档；删除旧迁移分支不会影响当前玩家数据。
- 暂未实装的系统保留必要的展示 UI 和调试数据，但不伪造可执行的游戏动作。
- 删除或暂缓的代码、状态和测试必须同步记录在 [docs/DEFERRED_FEATURES.md](./docs/DEFERRED_FEATURES.md)。

## 开发记录

V2 延续 V1 的 AI 辅助开发方式，但采用按模块拆分的 TypeScript 工程。每轮功能调整后都会运行类型检查、自动化测试和生产构建，并对事件、状态、DOM 和 CSS 做定向审计。
