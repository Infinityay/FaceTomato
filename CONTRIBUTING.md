# Contributing to FaceTomato

感谢你愿意为 FaceTomato 做出贡献。

本项目欢迎 bug 修复、功能改进、测试补充、文档完善与体验优化。为了让协作过程更顺畅，请在提交代码前阅读本指南。

## 贡献前先了解

开始贡献前，建议先阅读以下文件：

- `README.md`
- `CLAUDE.md`
- `frontend/CLAUDE.md`
- `backend/CLAUDE.md`

如果你的改动比较大、会影响 API、数据结构、状态持久化、SSE / WebSocket 行为，建议先通过 Issue 或讨论说明背景与方案，再开始实现。

## 基本原则

- 一次贡献只解决一个明确问题
- 优先做小而聚焦的改动，避免顺手做无关重构
- 修改代码时尽量遵循现有目录结构、命名方式和实现模式
- 涉及前后端契约变更时，同时更新测试与相关文档
- 不要提交密钥、凭证、生产数据或 `.env`

## 本地开发环境

### Frontend

```bash
cd frontend
npm install
npm run dev
```

常用命令：

```bash
npm run build
npm run test
npm run test:run
```

### Backend

```bash
cd backend
uv sync
cp .env.example .env
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 6522
```

如果你的改动涉及 mock interview RAG、本地索引或相关脚本，请额外安装可选依赖：

```bash
cd backend
uv sync --extra rag
```

常用测试命令：

```bash
uv run pytest
```

## 推荐贡献流程

1. 先确认问题背景
   - 小问题可以直接修复
   - 大改动建议先开 Issue 或先说明方案
2. 从 `main` 拉出分支
3. 先写测试，再写实现（TDD）
4. 只做解决当前问题所需的最小改动
5. 本地运行相关测试并确保通过
6. 使用约定式提交（Conventional Commits）整理 commit
7. 提交 Pull Request，并清楚说明变更内容与测试结果

## TDD 要求

本项目要求采用 **TDD（Test-Driven Development）** 工作流：

1. 先写测试（RED）
2. 运行测试，确认测试先失败
3. 编写最小实现使测试通过（GREEN）
4. 在测试通过的前提下重构（REFACTOR）
5. 再次运行测试并确认行为稳定

请尽量不要先写实现再补测试，除非你修复的是纯文档问题、配置问题或无法合理先写测试的极小改动。

### 测试要求

至少确保你的改动覆盖到当前仓库已有的对应测试层级：

- **单元测试**：函数、store、service、组件
- **集成测试**：API 路由、服务协作、数据读写
- **关键流程验证**：影响核心用户流程的改动，至少补充自动化测试；如果当前仓库暂未提供合适的端到端测试基建，请在 PR 中明确写出手工验证步骤

当前仓库已提供的主要测试命令为前端 `Vitest` 与后端 `pytest`。如果后续引入覆盖率或 E2E 工具，请按仓库新增脚本与 CI 要求执行。

### 提交前至少运行什么

根据你的改动范围，至少运行对应检查：

#### 仅改前端

```bash
cd frontend
npm run test:run
npm run build
```

#### 仅改后端

```bash
cd backend
uv run pytest
```

#### 同时改前后端或改接口契约

```bash
cd frontend
npm run test:run
npm run build

cd ../backend
uv run pytest
```

如果你的改动影响以下场景，请优先补充对应测试：

- 简历解析
- JD 提取 / 匹配 / 优化
- mock interview SSE 流程
- speech status / WebSocket 转写
- 本地持久化与恢复逻辑

## Commit 规范

本项目要求遵循 **[Conventional Commits 1.0.0（中文）](https://www.conventionalcommits.org/zh-hans/v1.0.0/)**。

推荐格式：

```text
<type>(<scope>): <description>
```

常用类型：

- `feat`: 新功能
- `fix`: 缺陷修复
- `docs`: 文档修改
- `refactor`: 重构（不新增功能、不修复 bug）
- `test`: 测试相关改动
- `chore`: 杂项维护
- `build`: 构建系统或依赖变更
- `ci`: CI/CD 配置变更
- `perf`: 性能优化
- `revert`: 回滚提交

示例：

```text
feat(mock-interview): support developer trace export
fix(runtime-settings): persist canonical face-tomato storage keys
refactor(interview-rag): keep import path safe without rag extras
docs(contributing): document tdd and pr workflow
test(resume): cover jd match fallback behavior
```

### Breaking Change

如果提交包含破坏性变更，请使用以下形式之一：

```text
feat(api)!: rename mock interview session field
```

或在提交正文中加入：

```text
BREAKING CHANGE: explain what changed and how to migrate
```

## Pull Request 要求

请确保每个 PR：

- 聚焦单一主题，避免把无关改动混在一起
- 标题清晰，**建议直接使用 Conventional Commits 风格**
- 描述中说明为什么改、改了什么、如何验证
- 关联 Issue（如果有）
- 涉及 UI 的改动尽量附截图或录屏
- 涉及配置、环境变量、数据结构或迁移时明确写出影响范围

### 推荐 PR 描述模板

```md
## Summary
-
-

## Changes
-
-

## Test Plan
- [ ] frontend: npm run test:run
- [ ] frontend: npm run build
- [ ] backend: uv run pytest
- [ ] manual verification (if needed)

## Notes
-
```

## 代码与文档约定

### Frontend

- 使用 TypeScript 严格模式
- 路径别名使用 `@/`
- 页面状态与跨页恢复主要依赖 Zustand persist
- 前端持久化仅保留 canonical `face-tomato-*` key
- 修改 mock interview 恢复逻辑时，需遵循当前单一快照结构

### Backend

- 使用 FastAPI + Pydantic / pydantic-settings
- 路由位于 `app/api/routes/`
- 服务逻辑位于 `app/services/`
- RAG 相关实现需要保持 import-safe，避免默认安装环境直接崩溃

### 文档同步

出现以下情况时，请同步更新文档：

- 命令、环境变量、端口或依赖安装方式变化
- API 路由、请求参数或事件序列变化
- mock interview / speech / 持久化行为变化
- 测试命令、目录结构、关键文件入口变化

至少考虑是否需要更新：

- `README.md`
- `CLAUDE.md`
- `frontend/CLAUDE.md`
- `backend/CLAUDE.md`

## 安全与数据

- 不要提交 `.env`、密钥、token、数据库备份或真实用户数据
- 测试中优先使用脱敏样例、fixture 或最小必要数据
- 涉及第三方模型、语音服务、外部 API 时，请说明依赖前提与回退行为

## License

提交代码即表示你同意你的贡献将在本仓库当前许可证 **AGPL-3.0** 下发布。

感谢你的贡献。
