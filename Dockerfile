# Use Python 3.11 explicitly
FROM python:3.11-slim

# Install system dependencies needed by dlib
RUN apt-get update && \
    apt-get install -y build-essential cmake libboost-all-dev && \
    rm -rf /var/lib/apt/lists/*

# Set work directory
WORKDIR /app

# Copy project files
COPY . /app

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Expose port
EXPOSE 5000

# Start your app
CMD ["gunicorn", "app:app"]