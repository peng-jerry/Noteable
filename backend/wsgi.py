"""Entry point for gunicorn (`gunicorn wsgi:app`) and the `flask` CLI."""

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(port=5000)
