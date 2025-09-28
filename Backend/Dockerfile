# Use official Python 3.11 image
FROM python:3.11-slim

# Avoid warnings
ENV PYTHONUNBUFFERED=1

# Set working directory
WORKDIR /app

# Install system dependencies for dlib & OpenCV
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Copy project files
COPY . .

# Upgrade pip and install Python dependencies
RUN pip install --upgrade pip
RUN pip install -r requirements.txt

# Expose Flask default port
EXPOSE 5000

# Command to run app using gunicorn
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "app:app"]
