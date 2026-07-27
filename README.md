# TAC Logistics

Import-shipment tracking platform for bringing containerized cargo into Haifa and
clearing it through PA / Israeli customs. Tracks each shipment from booking to
release, plus finance, documents, freight rates, alerts, and cashflow.

**Stack:** FastAPI + SQLAlchemy/Alembic (SQLite by default, Postgres-ready) ·
React + Vite + Tailwind · JWT auth · bilingual EN/AR.

---

## Quick start with Docker (easiest)

Requires Docker.

```bash
# 1. Create the backend env file and set a secret
cp backend/.env.example backend/.env
python3 -c "import secrets; print('SECRET_KEY=' + secrets.token_hex(32))"   # paste into backend/.env

# 2. Build and run (runs DB migrations automatically)
docker compose up --build
```

Then open http://localhost — the frontend is served by nginx and proxies `/api`
to the backend.

> The Docker image does **not** seed the admin user. After the first run, seed it:
> `docker compose exec backend python seed.py`

---

## Manual dev setup

### Backend (Python 3.11+ — 3.9 will not run this code)

```bash
cd backend
python3.12 -m venv .venv           # any Python >= 3.11
.venv/bin/pip install -r requirements.txt

cp .env.example .env               # then set SECRET_KEY (see below)
.venv/bin/alembic upgrade head     # create all tables
.venv/bin/python seed.py           # create tenant, admin user, carriers

.venv/bin/uvicorn app.main:app --port 8000 --reload
```

### Frontend (Node 20+)

```bash
cd frontend
npm install
npm run dev                        # http://localhost:5173, proxies /api to :8000
```

### Default login (from `seed.py` — change it)

```
email:    admin@tac.com
password: admin123
```

---

## Environment variables (`backend/.env`)

Copy `backend/.env.example` and fill in. Only `SECRET_KEY` is required; the rest
enable optional features and the app runs fine without them.

| Variable | Required | What it does |
|---|---|---|
| `SECRET_KEY` | **Yes** | Signs auth tokens. Generate: `python -c "import secrets; print(secrets.token_hex(32))"` |
| `DATABASE_URL` | No | Defaults to SQLite (`tac.db`). Set a Postgres URL for production. |
| `ALLOWED_ORIGINS` | No | Comma-separated frontend origins for CORS (dev default is set). |
| `TERMINAL49_API_KEY` | No | Live carrier tracking (free tier at terminal49.com). Without it, tracking is manual. |
| `EMAIL_IMAP_SERVER` / `EMAIL_ADDRESS` / `EMAIL_PASSWORD` | No | Email scanner — auto-updates ETAs from carrier emails. Gmail: `imap.gmail.com` + a 16-char App Password. |
| `SMTP_HOST` (+ optional `SMTP_*`, `DIGEST_HOUR`) | No | Daily alert-digest emails. Gmail: `smtp.gmail.com`; username/password reuse the `EMAIL_*` app password. |

---

## Notes

- **Data & secrets are not in git.** `backend/.env`, `backend/tac.db`, and
  `backend/uploads/` are gitignored. A fresh clone starts with an empty database
  (run `seed.py`). To carry existing data over, copy `tac.db` and `uploads/`
  separately.
- **Migrations:** `alembic upgrade head`. The app also auto-creates tables on
  startup for dev convenience, but Alembic is the source of truth for production.
- `requirements.txt` pins `bcrypt==4.0.1` (newer bcrypt breaks the auth library).
