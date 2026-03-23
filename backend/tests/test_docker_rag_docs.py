from __future__ import annotations

from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"


def _read(relative_path: str) -> str:
    return (ROOT_DIR / relative_path).read_text(encoding="utf-8")


def test_backend_dockerfile_supports_optional_rag_install_switch():
    dockerfile = _read("backend/Dockerfile")

    assert "ARG BACKEND_INSTALL_RAG=false" in dockerfile
    assert 'if [ "$BACKEND_INSTALL_RAG" = "true" ]; then' in dockerfile
    assert 'pip install --no-cache-dir ".[rag]"' in dockerfile
    assert "pip install --no-cache-dir ." in dockerfile


def test_backend_dockerignore_excludes_local_secrets_and_data():
    dockerignore = _read("backend/.dockerignore")

    for entry in (".env", "data/", ".venv/", "__pycache__/", ".pytest_cache/"):
        assert entry in dockerignore


def test_docker_compose_forwards_backend_install_rag_build_arg():
    compose = _read("docker-compose.yml")

    assert "args:" in compose
    assert "BACKEND_INSTALL_RAG" in compose
    assert '"${BACKEND_INSTALL_RAG:-false}"' in compose


def test_readmes_document_default_and_rag_capable_docker_paths():
    for relative_path in ("README.md", "backend/docs/README.md"):
        content = _read(relative_path)

        assert "docker compose up --build -d" in content
        assert "BACKEND_INSTALL_RAG=true docker compose up --build -d" in content
        assert "MOCK_INTERVIEW_RAG=true" in content


def test_rag_docs_and_env_example_explain_build_time_vs_runtime_switches():
    documented_files = (
        "backend/.env.example",
        "backend/docs/configuration.md",
        "backend/docs/rag-config.md",
    )

    for relative_path in documented_files:
        content = _read(relative_path)

        assert "BACKEND_INSTALL_RAG" in content
        assert "MOCK_INTERVIEW_RAG" in content

    env_example = _read("backend/.env.example")
    assert "backend/.env" in env_example
