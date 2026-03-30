# sample_leaks_test.py
# Test file for Gitleaks custom rules
# Do NOT use real secrets. These are fake test values only.

import os

# --- Generic API key style values ---
API_KEY = "sk_test_4f9d8a7b6c5e1234567890abcdef"
SECRET_TOKEN = "ghp_1234567890abcdefghijklmnopqrstuv"
ACCESS_TOKEN = "api_9Xv3K2mP8qT7wZ1AaBbCcDdEeFf"

# --- Password-style assignments ---
password = "SuperSecretPass123!"
passwd = "MyP@ssw0rd2026"
pwd = "Winter2026Secure!"

# --- Username / userid + password combinations ---
username = "jose.george"
password_login = "AdminPass2026!"

userid = "user_48291"
passwd_db = "DbStrongPass#7788"

login = "admin@example.com"
pwd_auth = "Welcome12345!"

# --- Inline dictionary credentials ---
db_config = {
    "username": "dbadmin",
    "password": "ProdPassword!2026",
    "host": "localhost",
    "port": 5432,
}

auth_config = {
    "userid": "svc_api_user",
    "passwd": "ServicePass#999",
}

# --- Environment fallback examples ---
API_SECRET = os.getenv("API_SECRET", "fallbackSecretToken123456")
DB_PASSWORD = os.getenv("DB_PASSWORD", "LocalDbPass2026!")

# --- URL with embedded credentials ---
DATABASE_URL = "postgresql://testuser:TestPassword2026!@localhost:5432/sampledb"

# --- Strings inside functions ---
def connect():
    user = "sample_user"
    password = "ConnectPass2026!"
    print(f"Connecting as {user}")
    return True


def auth():
    login = "internal.user"
    pwd = "AuthPass!45678"
    token = "tok_live_abcdefghijklmnopqrstuvwxyz123456"
    return {"login": login, "pwd": pwd, "token": token}


if __name__ == "__main__":
    print("This file contains fake secrets for leak detection testing only.")