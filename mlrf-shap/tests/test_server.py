"""Tests for SHAP HTTP server."""

import json
import threading
import time
from http.server import HTTPServer
from functools import partial
from unittest.mock import MagicMock, patch
import urllib.request
import urllib.error

import pytest


@pytest.fixture
def mock_service():
    """Create a mock ShapService."""
    service = MagicMock()
    service.health.return_value = {
        "healthy": True,
        "model_path": "/models/test.txt",
        "requests_served": 5,
    }
    service.explain.return_value = {
        "base_value": 100.0,
        "features": [
            {"name": "sales_lag_1", "value": 150.0, "shap_value": 15.0, "cumulative": 115.0, "direction": "positive"},
        ],
        "prediction": 115.0,
    }
    return service


@pytest.fixture
def server(mock_service):
    """Create test HTTP server with mocked service."""
    from mlrf_shap.server import ShapHandler

    handler = partial(ShapHandler, mock_service)
    server = HTTPServer(("127.0.0.1", 0), handler)  # Port 0 = random available port
    port = server.server_address[1]

    # Start server in background thread
    thread = threading.Thread(target=server.serve_forever)
    thread.daemon = True
    thread.start()

    yield f"http://127.0.0.1:{port}"

    server.shutdown()


class TestHealthEndpoint:
    """Tests for /health endpoint."""

    def test_health_returns_200(self, server):
        """Health endpoint should return 200."""
        with urllib.request.urlopen(f"{server}/health") as response:
            assert response.status == 200

    def test_health_returns_json(self, server):
        """Health endpoint should return JSON."""
        with urllib.request.urlopen(f"{server}/health") as response:
            content_type = response.headers.get("Content-Type")
            assert "application/json" in content_type

    def test_health_content(self, server):
        """Health endpoint should return service status."""
        with urllib.request.urlopen(f"{server}/health") as response:
            data = json.loads(response.read())

        assert data["healthy"] is True
        assert data["model_path"] == "/models/test.txt"
        assert data["requests_served"] == 5


class TestExplainEndpoint:
    """Tests for /explain endpoint."""

    def test_explain_returns_200(self, server):
        """Explain endpoint should return 200 for valid request."""
        body = json.dumps({
            "store_nbr": 1,
            "family": "GROCERY I",
            "date": "2017-08-01",
            "features": [0.0] * 27,
        }).encode()

        req = urllib.request.Request(
            f"{server}/explain",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req) as response:
            assert response.status == 200

    def test_explain_response_structure(self, server):
        """Explain response should have expected structure."""
        body = json.dumps({
            "store_nbr": 1,
            "family": "GROCERY I",
            "date": "2017-08-01",
            "features": [0.0] * 27,
        }).encode()

        req = urllib.request.Request(
            f"{server}/explain",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req) as response:
            data = json.loads(response.read())

        assert "base_value" in data
        assert "features" in data
        assert "prediction" in data
        assert data["base_value"] == 100.0

    def test_explain_missing_features(self, server):
        """Explain should return 400 for missing features."""
        body = json.dumps({
            "store_nbr": 1,
            # Missing features
        }).encode()

        req = urllib.request.Request(
            f"{server}/explain",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req)
        assert exc_info.value.code == 400


class TestErrorHandling:
    """Tests for error handling."""

    def test_404_for_unknown_route(self, server):
        """Unknown routes should return 404."""
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(f"{server}/unknown")
        assert exc_info.value.code == 404

    def test_service_error_returns_500(self, server, mock_service):
        """Service errors should return 500."""
        mock_service.explain.side_effect = Exception("Model error")

        body = json.dumps({
            "store_nbr": 1,
            "family": "GROCERY I",
            "date": "2017-08-01",
            "features": [0.0] * 27,
        }).encode()

        req = urllib.request.Request(
            f"{server}/explain",
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with pytest.raises(urllib.error.HTTPError) as exc_info:
            urllib.request.urlopen(req)
        assert exc_info.value.code == 500


class TestCORS:
    """Tests for CORS support."""

    def test_cors_header_on_response(self, server):
        """Responses should include CORS header."""
        with urllib.request.urlopen(f"{server}/health") as response:
            cors_header = response.headers.get("Access-Control-Allow-Origin")
            assert cors_header == "*"
