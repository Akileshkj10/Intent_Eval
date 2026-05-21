# Mark Pilot Deployment

## Status

Current status: **deployment guide ready; hosted URL pending**.

The codebase is ready for a controlled online Streamlit pilot, but this workspace does not contain a deployment account, public host configuration, or approved URL. Do not mark the hosted-access acceptance criterion complete until a real URL has been deployed and smoke-tested.

## Host choice

Recommended pilot host: **Streamlit Community Cloud** for the first Mark test.

Reason:

- Lowest-friction path for an existing Streamlit app.
- Supports environment secrets without committing `.env`.
- Adequate for a short internal pilot using synthetic/text input, provided no real client files are uploaded.

If Mark will upload confidential client material, use a tenant-controlled host instead, such as Azure App Service with Azure OpenAI and approved storage controls.

## Required secrets

Configure secrets in the host UI/environment settings only:

- `LLM_PROVIDER=anthropic`
- `ANTHROPIC_API_KEY`
- `EVALUATOR_MODEL` (optional; default is `claude-sonnet-4-6`)
- `IMPORTANT_EVALUATOR_MODEL` (optional; default is `claude-opus-4-7`)
- `EVALUATOR_TEMPERATURE` (optional; default is `0`)

Never commit `.env` or provider keys.

## Start command

```bash
streamlit run app/streamlit_app.py
```

## Deployment steps

1. Push the current branch to a private GitHub repository available to the deployment host.
2. Create a Streamlit app pointing at `app/streamlit_app.py`.
3. Add the required secrets in the host configuration.
4. Restrict app visibility to the pilot audience where the host supports it.
5. Share the deployed URL with Mark only after the smoke test passes.

## Data-handling warning

This pilot is for internal testing. Do not upload real client `.pptx` files unless the selected host and storage controls are approved for confidential client material. Text input and synthetic examples are preferred until D15 real-client handling is signed off.

## Smoke test checklist

- [ ] Open deployed URL.
- [ ] Generate a report from text input.
- [ ] Generate a report from `fixtures/synthetic_5map_parsed.json` upload.
- [ ] Download `report.md` and `report.json`.
- [ ] Verify `run_manifest.json` exists in run artefacts.
- [ ] Confirm no secrets appear in logs or UI.

## Smoke test evidence

Pending hosted deployment.

Record after deployment:

- URL:
- Date/time UTC:
- Tester:
- Input mode tested:
- Result:
- Notes:

## Rollback

1. Remove or disable the deployed app in the host dashboard.
2. Revoke exposed provider keys if logs or app settings may have leaked.
3. Delete pilot artefacts from the host storage.
4. Return to local-only Streamlit testing until the issue is fixed.
