import http.server
import socketserver
import os
import sys

# Allow port to be passed as argument, default 8090
PORT = 8090
if len(sys.argv) > 1:
    PORT = int(sys.argv[1])

# Serve current directory
DIRECTORY = "."

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_POST(self):
        if self.path == '/save-plots':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                
                # Validation: Ensure valid JSON
                import json
                # Just checks if it parses, we don't need the object
                json.loads(post_data)

                with open(os.path.join(DIRECTORY, 'plotsData.json'), 'wb') as f:
                    f.write(post_data)
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "success"}')
                print("Saved plotsData.json successfully")
            except Exception as e:
                print(f"Error saving: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(f'{{"status": "error", "message": "{str(e)}"}}'.encode())
        elif self.path == '/send-request':
            try:
                content_length = int(self.headers['Content-Length'])
                post_data = self.rfile.read(content_length)
                
                # Parse JSON data
                import json
                data = json.loads(post_data)
                
                # Email configuration (Dummy - requires real SMTP server)
                # Since we are local, we will simulate or try a standard send if configured.
                # For now, we will LOG it to a file AND try to print instructions.
                
                # 1. Save to local file (Backup)
                with open('requests.txt', 'a', encoding='utf-8') as f:
                    f.write(f"New Request: {data}\n")
                
                # 2. Prepare Email Logic (Placeholder for real SMTP)
                # To actually send, we need: server, port, login, password.
                # Without them, we can't send real emails from localhost easily.
                print(f"--- NEW LEAD RECEIVED ---\nName: {data.get('name')}\nPhone: {data.get('phone')}\nPlot: {data.get('plotId', 'General')}\n-------------------------")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Request saved"}')
                
            except Exception as e:
                print(f"Error processing request: {e}")
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(f'{{"status": "error", "message": "{str(e)}"}}'.encode())
        else:
            self.send_response(404)
            self.end_headers()

print(f"Starting local server at http://localhost:{PORT}")
print(f"Serving directory: {os.path.abspath(DIRECTORY)}")

# Allow address reuse to avoid "Address already in use" on restarts
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
