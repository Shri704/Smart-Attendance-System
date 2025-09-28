FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y build-essential cmake libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY ./Backend ./Backend
COPY requirements.txt .

RUN pip install --upgrade pip
RUN pip install -r requirements.txt

EXPOSE 8080

CMD ["gunicorn", "--bind", "0.0.0.0:8080", "Backend.app:app"]
