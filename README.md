# Career Copilot

Career-Copilot 是一个面向求职场景的 AI 助手，覆盖从材料准备到面试演练的完整流程：简历解析、JD 匹配分析、简历优化、面经题库检索、模拟面试与语音输入。

## 主要能力

- 简历解析：上传 PDF  / DOCX / PNG / JPG / TXT，提取结构化简历数据
- JD 匹配分析：提取 JD 结构并生成匹配评估
- 简历优化建议：支持通用优化与 JD 定向优化
- 面经题库：SQLite 分页筛选、统计、邻近导航
- 模拟面试：SSE 流式创建与对话续流，前端本地快照恢复
- 语音输入：浏览器麦克风 + 火山引擎语音转写

## 技术栈

- Frontend: React 18 + TypeScript + Vite + TailwindCSS + Zustand + Vitest
- Backend: FastAPI + Pydantic + LangChain
- Storage: SQLite + localStorage / sessionStorage + 本地 ZVEC 索引

## 环境要求

- Node.js >= 18
- npm >= 9
- Python >= 3.12, < 3.13
- uv

## 快速启动

### 1. 启动后端

```bash
cd backend
uv sync
cp .env.example .env
```

记住根据[后端配置文档](backend/docs/configuration.md)填写 `backend/.env` 后启动：

```bash
uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 6522
```

后端接口文档：`http://127.0.0.1:6522/docs`

### 2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认地址：`http://127.0.0.1:5569`

## Docker 启动

首次使用前，先准备后端环境变量：

```bash
cp backend/.env.example backend/.env
```

然后在项目根目录启动：

```bash
docker compose up --build
```

启动后：

- 前端：`http://127.0.0.1:5569`
- 后端：`http://127.0.0.1:6522`
- 后端文档：`http://127.0.0.1:6522/docs`




### 后端配置文档

详细的后端 `.env`、RAG、配置说明在：

- `backend/docs/README.md`
- `backend/docs/configuration.md`
- `backend/docs/rag-config.md`

推荐先看：`backend/docs/configuration.md`


## 项目结构

```text
Career-Copilot/
├── frontend/
├── backend/
│   ├── app/
│   ├── data/
│   ├── docs/
│   ├── tests/
│   └── .env.example
├── CLAUDE.md
└── README.md
```

