FROM python:3.11-slim
RUN apt-get update && \
    apt-get install -y build-essential cmake libboost-all-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . /app
RUN pip install --no-cache-dir -r requirements.txt

EXPOSE 5000
CMD ["gunicorn", "app:app"]