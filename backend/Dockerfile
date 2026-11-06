FROM python:3.11-slim

WORKDIR /app

# Install python deps first (cached layer)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./backend/
COPY ipfs_data/ ./ipfs_data/

WORKDIR /app/backend

EXPOSE 8000

CMD ["python", "app.py"]
