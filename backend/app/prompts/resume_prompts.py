"""Resume extraction prompts."""

SYSTEM_PROMPT = """
您是一个专业的简历分析助手。您的任务是将给定的简历文本转换为下面给定的 JSON 输出。
"""

RESUME_VALIDITY_PROMPT = """
请先判断输入内容是否为一份正常的求职简历。

判定规则：
- Yes：内容明确是个人简历，包含候选人信息，以及教育/工作/项目/技能等至少一种求职相关板块。
- No：内容不是简历（如聊天记录、广告、小说、代码、票据、合同、题目答案、纯乱码等）。

输出要求：
- 仅输出 JSON，不要输出额外说明。
- 严格输出以下格式之一：
  {"isResume": "Yes"}
  {"isResume": "No"}
"""

BASIC_INFO_PROMPT = """
提取如下信息到json ，若某些字段不存在则输出 "" 空 不允许编造信息
{
  "basicInfo": {
    "name": "", # 姓名 如: 张三
    "personalEmail": "", # 邮箱 如:610730297@qq.com
    "phoneNumber": "", #电话/手机 如:13915732235 请保留原文中的形式 保留国家码 区号括号 例如:"+1（201）706 1136"
    "age":"", # 当前年龄 int类型 如 28  若不存在 则不填 不能从出生年月推算年龄
    "born": "", # 出生日期  如 1996.11
    "gender": "", # 男/女 若不存在 则不填
    "desiredPosition": "", # 期望岗位/目标职位/求职意向 如: 算法工程师、产品经理、前端开发 等 **注意：这是岗位名称，不是地点** 若不存在则填""
    "desiredLocation": ["城市名", ...], # 意向期望目标工作地/城市 可以填写多个 如果仅存在一个 只需要填写一个   e.g: "[北京市,上海市]"  **简历中需要明确说明是期望城市** **注意：这是地点，不是岗位** 一般出现在同一行(若多个则使用"," ";" 隔开) 若不存在填 []
    "currentLocation": "城市名"  # 现居地/当前城市 xxx省xx市  **不要出现籍贯中的地址**    **不要从工作经历或任意文本中推测现居地 要写明现居地 没有则填[]**
    "placeOfOrigin": "", # 籍贯 不要和 现居地/当前城市 混淆
    "rewards": [] # 奖项/荣誉列表 列表形式 从简历中明确标注的"荣誉奖项"/"获奖经历"/"奖项"等模块提取 每一条奖项描述作为列表中的一个元素 如: ["2023年国家奖学金", "ACM-ICPC亚洲区域赛铜牌", "校级优秀毕业生"] 直接使用简历原文，不要拆分或合并，若简历中没有明确的奖项模块则填 []
  },
}
"""

WORK_EXPERIENCE_PROMPT = """{
  "workExperience": [  # 工作经历 工作经验 实习经历 等都属于工作经历 项目经历不属于工作经历
    {
      "companyName": "", # 公司名称  如阿里巴巴 若不存在 填写""(不要编造)
      "employmentPeriod": {  #  经历开始时间和结束时间
        "startDate": "",# 入职时间 开始时间 若不存在 填写""(不要编造) 格式为 %Y.%m 或 %Y 如 2024 ,2024.1
        "endDate": "" #若至今 填写  "至今"  若不存在 填写""(不要编造) 格式为 %Y.%m 或 %Y 如 2024 ,2024.1
      },
      "title": "", # 工作经历主题标题/项目式标题，优先提取该段工作经历下独立的一行主题标题，如“基于 Qwen3-14B 的垂直领域订票 Agent”；不要把公司名或职位名误填到这里。严禁编造，没有则填 ""。
      "position": "", #职位/岗位名称  如 算法工程师 TeamLeader 业务组专家 大模型实习生，遵循原文不要编造或者不要推测职位
      "internship": 0, #该段经历是否是实习 如果是实习则为1  不是实习为0
      "jobDescription": "" # 工作描述/职责描述  直接使用简历中的描述 去除不必要的换行符和空格 若不存在则填写 ""(不要编造)
      }, ...
  ]
  }
"""

EDUCATION_PROMPT = """
{
  "education": [  #教育经历
    {
      "degreeLevel": "", #学位 本科/硕士/博士/专科/高中/初中 若不存在则填""
      "period": {  # 教育经历开始时间和结束时间 格式为 "yyyy.mm" 或 "yyyy" 如 "2021.2"
        "startDate": "", # 开始时间 格式为 %Y.%m 或 %Y 如 2024 ,2024.1
        "endDate":""  #若至今 填写  "至今"  若不存在 填写""
      },
      "school": "", #学校名称: 如厦门大学 MIT 中英文都可以
      "department": "",  # 院系/学院 (Administrative Unit): 
                        # 1. 通常以 '学院(School/College)', '系(Department)', '学部(Faculty)' 结尾。
                        # 2. 是学校的行政组织架构。
                        # 3. 示例: "计算机学院", "电子工程系", "School of Business". 
                        # 4. 若简历中未提及行政归属，仅提及专业，此处必须留空 ""。
      "major": "",  # 专业 (Field of Study): 
                        # 1. 具体的学科名称，通常不含'学院'或'系'等行政后缀。
                        # 2. 示例: "计算机科学与技术", "软件工程", "金融学", "Computer Science".
                        # 3. 【重要冲突处理】: 如果文本仅为 "计算机" 或 "经济" 等模糊词汇，无法区分是系还是专业时，优先填入本字段(major)，将department留空。
      "gpa": "", # GPA/绩点 如: 3.8/4.0 或 90/100 或 3.85 **仅当简历中明确标注GPA时才填写** 若不存在则填""
      "ranking": "", # 排名 如: 前5% 或 3/120 或 Top 10% **仅当简历中明确标注排名时才填写** 若不存在则填""
      "educationDescription": "" # 教育描述 包括这段教育经历的课程成绩、研究方向、荣誉奖项等 **不要重复填写GPA和排名** 不包含学位。直接使用简历中的描述 去除不必要的换行符和空格 不存在则填写 "" 空
    }, ...
  ]
}
"""

PROJECT_PROMPT = """
{
  "projects": [  # 项目经历 项目经验 (注意：这里只提取项目经历，不包含工作经历)
    {
      "projectName": "", # 项目名称 如: 智能客服系统 若不存在 填写""(不要编造)
      "projectPeriod": {  # 项目开始时间和结束时间
        "startDate": "", # 开始时间 若不存在 填写""(不要编造) 格式为 %Y.%m 或 %Y 如 2024, 2024.1
        "endDate": "" # 若至今 填写 "至今" 若不存在 填写""(不要编造) 格式为 %Y.%m 或 %Y 如 2024, 2024.1
      },
      "role": "", # 项目角色/职责 如: 项目负责人、核心开发、算法工程师 等 遵循原文不要编造
      "companyOrOrganization": "", # 所属公司或组织 若不存在 填写"" 如果是个人项目可以填写 "个人项目"
      "projectDescription": "" # 项目描述 包括项目背景、技术栈、个人职责、项目成果等完整信息 直接使用简历中的描述整合为一段连贯的文字 去除不必要的换行符和空格   若不存在则填写 ""
    }, ...
  ]
}
"""

ACADEMIC_ACHIEVEMENTS_PROMPT = """
{
  "academicAchievements": [  # 学术成果（论文、专利、科研项目、学术奖项等）
    {
      "type": "",  # 类型：paper(论文)/patent(专利)/award(学术奖项)/thesis(毕业论文)/grant(科研基金)/research(科研项目)
      "title": "",  # 成果标题/论文名称/专利名/项目名 若不存在填""
      "date": "",  # 时间 格式 %Y.%m  如 2023.06 若不存在填""
      "venue": "",  # 发表刊物/会议名称/颁奖机构/资助来源 若不存在填""
      "description": "",  # 简要描述（如作者排名、影响因子、项目规模等） 若不存在填""
      "status": ""  # 论文状态（仅对论文/毕业论文有效）：under_review(审稿中)/major_revision(大修)/minor_revision(小修)/accepted(已录用)/published(已发表) 若简历中未明确标注状态则填""
    }, ...
  ]
}

注意：
- 仅从简历中明确标注的"学术成果"/"科研经历"/"论文发表"/"专利"/"科研项目"/"研究经历"/"Publications"等模块提取
- 若简历中无相关模块，返回空列表 []
- 严格遵循原文，禁止编造
- status字段仅当简历中明确标注了论文状态（如"Under Review"、"已录用"、"Accepted"等）时才填写，否则留空
- 不允许和个人荣誉奖项混淆
"""

THINK_TAG = " /no_think"
FINAL_ONLY_TAG = "\n\n重要：禁止输出推理过程、思考过程、分析步骤或中间结论。只输出最终答案，且必须严格遵守要求的 JSON 格式。"


def get_prompts() -> dict[str, str]:
    """Get all prompts for resume extraction."""
    return {
        "basic_info": SYSTEM_PROMPT + BASIC_INFO_PROMPT + FINAL_ONLY_TAG + THINK_TAG,
        "work_experience": SYSTEM_PROMPT
        + WORK_EXPERIENCE_PROMPT
        + FINAL_ONLY_TAG
        + THINK_TAG,
        "education": SYSTEM_PROMPT + EDUCATION_PROMPT + FINAL_ONLY_TAG + THINK_TAG,
        "projects": SYSTEM_PROMPT + PROJECT_PROMPT + FINAL_ONLY_TAG + THINK_TAG,
        "academic_achievements": SYSTEM_PROMPT
        + ACADEMIC_ACHIEVEMENTS_PROMPT
        + FINAL_ONLY_TAG
        + THINK_TAG,
    }
