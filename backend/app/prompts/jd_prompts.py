"""JD extraction prompts."""

JD_SYSTEM_PROMPT = """
您是一个专业的职位描述(JD)分析助手。您的任务是将给定的职位描述文本转换为下面给定的 JSON 输出。
"""

JD_VALIDITY_PROMPT = """
请先判断输入内容是否为一份正常的职位描述（JD）。

判定规则：
- Yes：内容明确描述招聘岗位，包含职责、任职要求、技术栈、学历/经验要求、公司或岗位信息中的至少一部分。
- No：内容不是 JD（如简历、聊天记录、广告、小说、代码、试题答案、纯乱码等）。

输出要求：
- 仅输出 JSON，不要输出额外说明。
- 严格输出以下格式之一：
  {"isJD": "Yes"}
  {"isJD": "No"}
"""

JD_BASIC_INFO_PROMPT = """
提取如下职位基本信息到json，若某些字段不存在则输出 "" 空
{
  "jobBasicInfo": {
    "jobTitle": "", # 职位名称/岗位名称 如: 大模型工程师、算法工程师、后端开发工程师
    "jobType": "", # 工作类型 如: 全职、兼职、实习、日常实习、暑期实习 等
    "location": "", # 工作地点/城市 如: 北京市、上海市、深圳市
    "company": "", # 公司名称 如: 美团、阿里巴巴、字节跳动 若不存在则填 ""
    "department": "", # 部门名称 如: 核心本地商业-业务研发平台 若不存在则填 ""
    "updateTime": "" # 更新时间 如: 2025/11/30 保持原文格式 若不存在则填 ""
  }
}
"""

JD_REQUIREMENTS_PROMPT = """
提取如下职位要求信息到json，若某些字段不存在则输出相应的空值
{
  "requirements": {
    "degree": "", # 学历要求 如: 本科、硕士、博士、大专、不限 等
    "experience": "", # 工作经验要求 如: 不限、1-3年、3-5年、5年以上 等
    "techStack": [], # 技术栈要求 列表形式 包括编程语言、框架、工具等 如: ["Python", "PyTorch", "Transformer", "NLP","langchain"]
    "mustHave": [], # 必备条件/硬性要求 列表形式 从岗位要求中提取必须满足的条件 如: ["熟悉深度学习框架", "具有NLP相关经验"]
    "niceToHave": [], # 加分项/优先条件 列表形式 从岗位要求中提取加分/优先的条件 如: ["有大模型项目经验优先", "有论文发表优先"]
    "jobDuties": [] # 岗位职责/工作内容 列表形式 从岗位职责中提取具体工作内容 如: ["负责算法模型开发", "参与业务需求分析"]
  }
}
"""

THINK_TAG = " /no_think"
FINAL_ONLY_TAG = "\n\n重要：禁止输出推理过程、思考过程、分析步骤或中间结论。只输出最终答案，且必须严格遵守要求的 JSON 格式。"


def get_jd_prompts() -> dict[str, str]:
    """Get all prompts for JD extraction."""
    return {
        "basic_info": JD_SYSTEM_PROMPT + JD_BASIC_INFO_PROMPT + FINAL_ONLY_TAG + THINK_TAG,
        "requirements": JD_SYSTEM_PROMPT + JD_REQUIREMENTS_PROMPT + FINAL_ONLY_TAG + THINK_TAG,
    }
