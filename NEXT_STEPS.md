# What to do next

1. Copy the contents of this updated `Checker` folder into your existing local
   `Checker` project folder. Choose **Replace** when macOS asks about files with
   the same names. Keep the existing hidden `.git` folder in your original
   project.
2. Open the original `Checker` folder in VS Code.
3. Open Terminal in VS Code and run each command separately:

```bash
git add .
git commit -m "Switch to free OCR and AI detector"
git push
```

4. Return to Render and restart the Blueprint setup. The form should no longer
   ask for `ORIGINALITY_API_KEY`, `GOOGLE_APPLICATION_CREDENTIALS_JSON`, or
   `APP_ORIGIN`.
5. Confirm that `checker-api` and `checker-db` both use the **Free** plan,
   then click **Deploy Blueprint**.
6. Wait for the service to become **Live** and open its URL.

The first AI check downloads a large free model in the browser, so it can take
several minutes. Later checks on the same browser should be faster.
