import http.server
import socketserver
import os
import sys

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

try:
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print("\n" + "="*50)
        print("🎙️  Voice UI Server is running!")
        print("👉 Click to open: http://127.0.0.1:8000 👈")
        print("="*50 + "\n")
        print("(Press CTRL+C to quit)")
        httpd.serve_forever()
except OSError as e:
    if e.errno == 98 or e.winerror == 10048:
        print(f"Port {PORT} is already in use. Please close the existing server first.")
    else:
        print(f"Failed to start server: {e}")
except KeyboardInterrupt:
    print("\nServer stopped.")
    sys.exit(0)
