# Free deployment

This version uses only free components and does not require Google Cloud,
Originality.ai, a payment card, or API keys.

## How it works

- Render Free Web Service runs the Python server in Docker.
- Tesseract OCR runs inside the Docker container and reads English, Russian,
  and Kazakh text locally.
- A quantized open-source AI-text classifier runs in the visitor's browser.
  The model is downloaded from Hugging Face on the first check and then cached
  by the browser. The first check can therefore take noticeably longer.
- Render Free PostgreSQL stores student profiles and saved results.
- Uploaded assignment images are processed for OCR but are not stored in the
  database.

## Deploy on Render

1. Commit and push all project files, including `Dockerfile`, `.dockerignore`,
   and the updated `render.yaml`, to GitHub.
2. In Render, open **New > Blueprint** and select the GitHub repository.
3. Keep the branch set to `main` and the Blueprint path set to `render.yaml`.
4. Confirm that both `checker-api` and `checker-db` show the **Free** plan.
5. Deploy the Blueprint. There are no secret environment values to enter.
6. Wait for both resources to show **Live**, then open the web service URL.
7. Check `https://YOUR-SERVICE.onrender.com/api/health`; it should return
   `{"status": "ok"}`.

## Local setup

Docker is the simplest local setup because it includes all three OCR languages:

```bash
docker build -t checker-free .
docker run --rm -p 8000:8000 -e PORT=8000 checker-free
```

Then open `http://127.0.0.1:8000`.

## Free-tier limitations

- A Render Free Web Service sleeps when idle, so the first request after an
  idle period can be slow.
- Render Free PostgreSQL expires after 30 days. Export important data before
  that deadline or create a replacement free database for continued demos.
- The browser downloads an approximately 181 MB quantized model the first time
  it performs AI detection.
- The classifier is an experimental screening signal. Published evaluation is
  strongest for English, Chinese, and Vietnamese. Russian and Kazakh results
  are experimental and must not be treated as proof of authorship.
- OCR works best on printed or very neat, well-lit text. Handwriting quality
  varies substantially.

Never use an AI-detector percentage as the sole basis for grading, discipline,
or an accusation of academic misconduct.

Password recovery uses SMTP in production. Configure `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM`. In local development, the reset
link is returned on the page so the flow can be tested without email.

Registration roles are assigned by the SDU address: numeric local-parts become
students, while name-based local-parts become teachers.
