# 🎬 NetMirror Telegram Cinema Bot

Autonomous 24/7 Telegram Bot for searching, streaming, and downloading movies & web series from NetMirror with multi-audio selection (Hindi, English, Tamil, etc.).

## 🚀 Free 24/7 Cloud Deployment (0% Local Data Usage)

### Option 1: Deploy on Render.com (Recommended - 100% Free)
1. Push this repository to your **GitHub**.
2. Go to **[Render.com](https://render.com)** and sign in with GitHub.
3. Click **New +** -> **Background Worker** (or **Web Service**).
4. Select this repository.
5. Environment: **Docker** (Uses pre-configured `Dockerfile` with FFmpeg).
6. Add Environment Variable:
   - `TELEGRAM_BOT_TOKEN`: `8376422363:AAECh6Y_RfzJ5z2xUHR4ebJbtBoWTsMMCoI`
7. Click **Create**! Your bot will run **24/7 in the cloud with gigabit download speeds**.

### Option 2: Deploy on Railway.app / Koyeb
1. Connect this repo to Railway / Koyeb.
2. Set Environment Variable `TELEGRAM_BOT_TOKEN`.
3. Deploy!

---

## 🛠️ Local Development
```bash
npm install
npm start
```
