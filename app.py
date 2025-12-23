import os
from flask import Flask
from dotenv       import load_dotenv
from flask_login  import UserMixin
from extensions import login_manager

# ——— Bootstrap the app ———————————————————————
load_dotenv("/home/andrewfreeman/mysite/.env")
API_KEY = os.getenv("API_KEY")

app = Flask(__name__, static_folder="static", template_folder="templates")
secret = os.getenv("SECRET_KEY")
if not secret:
    raise RuntimeError("SECRET_KEY environment variable not set")
app.config["SECRET_KEY"] = secret
# ——— Flask-Login setup ——————————————————————
login_manager.init_app(app)
login_manager.login_view = "views.login"

# ——— In-memory credential store ——————————————————
USERS = {
    "admin":    "password123",
    "operator": "operatorpass",  # ← change later for ARI?
}

class User(UserMixin):
    def __init__(self, username):
        # Flask-Login cares only about .id
        self.id = username
        self.username = username

@login_manager.user_loader
def load_user(user_id):
    if user_id in USERS:
        return User(user_id)
    return None

# ——— Register your routes —————————————————————
from views import views
app.register_blueprint(views)

if __name__ == "__main__":
    app.run(debug=True, port=8000)

