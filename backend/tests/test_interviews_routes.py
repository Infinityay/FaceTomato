from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_get_interview_categories_includes_new_shared_categories():
    response = client.get("/api/interviews/categories")

    assert response.status_code == 200
    assert response.json() == [
        "大模型应用开发",
        "大模型算法",
        "后端开发",
        "前端开发",
        "移动端开发",
        "产品经理",
        "语音算法",
        "游戏开发",
        "搜广推算法",
        "风控算法",
    ]
