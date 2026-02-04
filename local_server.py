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
                
                # 2. Prepare Email Logic
                # Получаем данные из JSON
                name = data.get('name', 'Не указано')
                phone = data.get('phone', 'Не указано')
                plot_id = data.get('plotId', 'Не выбран')
                msg_type = data.get('type', 'Заявка')
                
                # Формируем текст письма
                subject = f"Новая заявка с сайта: {name}"
                body = f"""
                <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #ccc;">
                    <h2 style="color: #c6a87c;">Новая заявка: {msg_type}</h2>
                    <p><strong>Имя:</strong> {name}</p>
                    <p><strong>Телефон:</strong> <a href="tel:{phone}">{phone}</a></p>
                    <p><strong>Участок:</strong> {plot_id}</p>
                    <hr>
                    <p style="color: #666; font-size: 12px;">Это письмо отправлено автоматически с сайта.</p>
                </div>
                """
                
                print(f"--- NEW LEAD RECEIVED ---\nName: {name}\nPhone: {phone}\nPlot: {plot_id}\n-------------------------")
                
                # --- SMTP CONFIGURATION (ЗАПОЛНИТЕ ЭТИ ДАННЫЕ) ---
                # Для работы почты нужно указать данные вашего SMTP сервера (например, Яндекс или Гугл)
                SMTP_HOST = "smtp.yandex.ru" # или smtp.gmail.com
                SMTP_PORT = 465 # SSL
                SMTP_USER = "your_email@yandex.ru" # Ваш email (отправитель)
                SMTP_PASS = "your_password" # Пароль приложения (не от почты, а специальный!)
                TO_EMAIL = "target_email@example.com" # Куда отправлять заявки
                
                # Пытаемся отправить, если данные заполнены (простая проверка)
                if SMTP_USER != "your_email@yandex.ru" and SMTP_PASS != "your_password":
                    try:
                        import smtplib
                        import ssl
                        from email.mime.text import MIMEText
                        from email.mime.multipart import MIMEMultipart
                        
                        msg = MIMEMultipart()
                        msg["From"] = SMTP_USER
                        msg["To"] = TO_EMAIL
                        msg["Subject"] = subject
                        msg.attach(MIMEText(body, "html"))
                        
                        context = ssl.create_default_context()
                        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, context=context) as server:
                            server.login(SMTP_USER, SMTP_PASS)
                            server.sendmail(SMTP_USER, TO_EMAIL, msg.as_string())
                        print("Email sent successfully!")
                        
                    except Exception as email_err:
                        print(f"Failed to send email: {email_err}")
                        # Don't fail the request, just log error
                else:
                    print("SMTP not configured. Email skipped.")
                
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"status": "success", "message": "Request processed"}')
                
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
