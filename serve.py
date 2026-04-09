"""Minimal local preview server for endo-guide."""
import os, http.server, socketserver

PORT = 8080
DIR = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    print(f"Serving {DIR} at http://localhost:{PORT}")
    httpd.serve_forever()
