"""HTTP server for SHAP service."""

import argparse
import logging
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from functools import partial

from .service import ShapService

logger = logging.getLogger(__name__)


class ShapHandler(BaseHTTPRequestHandler):
    """HTTP request handler for SHAP service."""

    def __init__(self, shap_service: ShapService, *args, **kwargs):
        self.shap_service = shap_service
        super().__init__(*args, **kwargs)

    def log_message(self, format, *args):
        """Override to use our logger."""
        logger.debug("%s - %s", self.address_string(), format % args)

    def _send_json(self, data: dict, status: int = 200):
        """Send JSON response."""
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def _send_error(self, message: str, status: int = 400):
        """Send error response."""
        self._send_json({"error": message}, status)

    def do_OPTIONS(self):
        """Handle CORS preflight."""
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        """Handle GET requests."""
        if self.path == "/health":
            self._send_json(self.shap_service.health())
        else:
            self._send_error("Not found", 404)

    def do_POST(self):
        """Handle POST requests."""
        if self.path == "/explain":
            try:
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length)
                data = json.loads(body)

                # Validate required fields
                if "features" not in data:
                    self._send_error("features is required")
                    return

                result = self.shap_service.explain(
                    store_nbr=data.get("store_nbr", 0),
                    family=data.get("family", ""),
                    date=data.get("date", ""),
                    features=data["features"],
                )
                self._send_json(result)

            except ValueError as e:
                self._send_error(str(e))
            except Exception as e:
                logger.exception("Error in /explain")
                self._send_error(f"Internal error: {str(e)}", 500)
        else:
            self._send_error("Not found", 404)


def serve(port: int, model_path: str) -> None:
    """
    Start the HTTP server.

    Parameters
    ----------
    port : int
        Port to listen on
    model_path : str
        Path to LightGBM model file
    """
    shap_service = ShapService(model_path)

    handler = partial(ShapHandler, shap_service)
    server = HTTPServer(("0.0.0.0", port), handler)

    logger.info(f"SHAP service started on port {port}")
    logger.info(f"Model: {model_path}")
    logger.info(f"Endpoints: GET /health, POST /explain")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
        server.shutdown()


def main():
    """Entry point for mlrf-shap command."""
    parser = argparse.ArgumentParser(description="MLRF SHAP Explanation Service")
    parser.add_argument(
        "--port",
        type=int,
        default=50051,
        help="Port to listen on (default: 50051)",
    )
    parser.add_argument(
        "--model",
        type=str,
        default="/models/lightgbm_model.txt",
        help="Path to LightGBM model file",
    )
    parser.add_argument(
        "--log-level",
        type=str,
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level",
    )

    args = parser.parse_args()

    # Configure logging
    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )

    serve(args.port, args.model)


if __name__ == "__main__":
    main()
