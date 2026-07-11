<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Deploying the landing page

The landing page (www.fiscalmind.app) is an Azure **Static Web App** named
`fiscalmind-landing` (resource group `fiscalmind-resourcegroup`, Free tier,
eastus2, default host `thankful-hill-0ddb0570f.7.azurestaticapps.net`). It is
**not** part of the `fiscalmind-agent` Docker image — the container-app deploy
flow for `fiscalmind-web`/`fiscalmind-worker` does not touch it.

There is no CI: it's deployed manually with the SWA CLI (`provider: SwaCli`).
From `landing/`:

```powershell
npm run build   # next build with output:"export" → writes ./out

$t = az staticwebapp secrets list -n fiscalmind-landing `
       -g fiscalmind-resourcegroup --query "properties.apiKey" -o tsv
npx -y @azure/static-web-apps-cli deploy ./out --env production --deployment-token $t
```

Notes:
- `az` on the dev machine lives at
  `C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin\az.cmd` (not on PATH).
- `--env production` is required; without it the deploy goes to a preview
  environment, not www.fiscalmind.app.
- Verify by loading https://www.fiscalmind.app and checking your change is
  there (the SWA CDN can take a minute to pick it up).
