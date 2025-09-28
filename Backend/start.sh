#!/usr/bin/env bash
# Activate virtualenv if needed
# source venv/bin/activate

# Run your Flask app
gunicorn --bind 0.0.0.0:8080 app:app
