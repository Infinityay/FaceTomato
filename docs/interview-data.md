# 面经数据准备

## 说明

仓库默认**不会**提交面经题库数据，`backend/data/` 也被 `.gitignore` 忽略。

如果你希望在 FaceTomato 中看到真实的面经题库内容，可以优先从仓库 **Releases** 页面下载已准备好的数据库附件；如果下载的是压缩包，请先解压，再将其中的 `interviews.db` 放到 `backend/data/interviews.db`。你也可以自行准备原始数据并运行迁移脚本生成数据库。

如果未提供 `interviews.db`，依赖数据库的题库浏览、搜索、详情与邻近导航等能力将无法正常使用。

## 1. `backend/data/` 目录里有什么

- `backend/data/interviews.db`：SQLite 题库数据库
- `backend/data/interview_zvec/`：可选的本地检索索引目录，用于 RAG / 向量检索能力

其中，**`backend/data/interviews.db` 是查看面经题库的前置条件**。

## 2. 如何获取 `interviews.db`

你可以通过以下常见方式准备数据库：

- 从仓库 **Releases** 页面下载已发布的数据库附件；如果下载的是压缩包，请先解压，再将 `interviews.db` 放到 `backend/data/interviews.db`
- 自行准备原始 JSON 数据，并通过迁移脚本生成数据库
- 如果你已经有现成的 SQLite 数据库，也可以直接放到 `backend/data/interviews.db`

## 3. 原始数据应该如何准备

如果你选择自行生成 `interviews.db`，可以先准备原始 JSON 数据，再通过迁移脚本生成数据库。

迁移脚本当前会识别以下 **10 个领域目录名**：

```text
<your-interview-json-root>/
├── 前端开发/
├── 后端开发/
├── 移动端开发/
├── 产品经理/
├── 语音算法/
├── 大模型应用开发/
├── 大模型算法/
├── 搜广推算法/
├── 游戏开发/
└── 风控算法/
```

每个 JSON 文件表示一条面经记录，建议采用如下格式：

```json
{
  "source_id": "722526137238237184",
  "title": "数字天空UE客户端实习笔试一二面",
  "content": "拿到的唯一还算可以的offer",
  "publish_time": "2025-02-21 11:00:55",
  "category": "游戏开发",
  "source": "nowcoder",
  "company": "数字天空",
  "department": "UE客户端实习",
  "stage": "笔试+一面+二面",
  "result": "offer",
  "interview_type": "实习"
}
```

## 4. 如何生成 `interviews.db`

在准备好原始 JSON 数据后，使用仓库内脚本生成 SQLite 数据库：

```bash
cd backend
uv run python scripts/migrate_db.py --source-dir /path/to/interview_experiences
```

如果你已经有现成的 SQLite 数据库，也可以直接将它放到：

```text
backend/data/interviews.db
```

## 5. 可选：继续构建本地检索索引

当 `backend/data/interviews.db` 准备完成后，如需启用本地 RAG 检索，再继续构建 `backend/data/interview_zvec/`。

建立索引前，请先安装 `rag` 可选依赖（当前本地依赖组合面向非 Windows 平台）：

```bash
cd backend
uv sync --extra rag
uv run python scripts/build_interview_zvec_index.py
```

更多 RAG 开关、Docker 构建参数与 embedding 配置说明见：[`docs/backend/rag-config.md`](./backend/rag-config.md)
