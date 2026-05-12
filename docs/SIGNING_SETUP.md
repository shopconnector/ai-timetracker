# Code Signing Setup — Azure Trusted Signing

> 🌐 **English only** — DevOps/build documentation. UI translations live in `apps/web/messages/`.

This guide explains how to configure Azure Trusted Signing (Artifact Signing)
to digitally sign the TimeTracker Windows installer, eliminating the
Windows SmartScreen "Unknown publisher" warning.

## Why Azure Trusted Signing?

| Feature | Azure Trusted Signing | SSL.com EV | Traditional OV |
|---|---|---|---|
| **Cost** | $9.99/month | ~$1,149/year | ~$245/year |
| **SmartScreen instant trust** | YES | No (since Aug 2024) | No |
| **Hardware token** | Not needed | Not needed (cloud HSM) | Required |
| **GitHub Actions** | Official action | Official action | Manual |

Since August 2024, Microsoft removed immediate SmartScreen trust for EV certificates.
Azure Trusted Signing is the **only** solution providing instant SmartScreen bypass.

## Prerequisites

- Azure account with pay-as-you-go subscription
- Organization registered in USA, Canada, EU, or UK
- Business with verifiable history (tax registration, domain, etc.)

## Step-by-Step Setup

### 1. Create Azure Subscription

If you don't have one: https://azure.microsoft.com/en-us/pricing/purchase-options/azure-account

### 2. Create Trusted Signing Account

1. Go to **Azure Portal** → search "Trusted Signing"
2. Click **Create**
3. Fill in:
   - **Subscription**: your pay-as-you-go
   - **Resource group**: create new (e.g., `rg-codesigning`)
   - **Account name**: e.g., `shopconnector-signing`
   - **Region**: choose nearest (e.g., `West Europe`)
   - **SKU**: Basic ($9.99/month, 5000 signs)
4. Click **Review + Create** → **Create**
5. **Note the endpoint URL** (e.g., `https://weu.codesigning.azure.net`)

### 3. Create App Registration (Service Principal)

1. Go to **Azure Portal** → **Azure Active Directory** → **App registrations**
2. Click **New registration**
   - **Name**: `timetracker-codesigning`
   - **Supported account types**: Single tenant
3. Click **Register**
4. **Note down**:
   - **Application (client) ID** → `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_TENANT_ID`
5. Go to **Certificates & secrets** → **New client secret**
   - Description: `github-actions`
   - Expires: 24 months
6. **Copy the secret VALUE** (not the ID!) → `AZURE_CLIENT_SECRET`

### 4. Assign IAM Roles

1. Go to your **Trusted Signing Account** in Azure Portal
2. Click **Access control (IAM)** → **Add role assignment**
3. Add **two roles** to your App Registration:
   - `Trusted Signing Certificate Profile Signer`
   - `Trusted Signing Identity Verifier`

### 5. Submit Identity Validation

1. In your Trusted Signing Account → **Identity validation**
2. Click **New identity validation request**
3. Choose **Public** trust model
4. Fill in your organization details:
   - Legal business name (as on tax registration)
   - Website URL
   - Business registration number
   - Country
5. Submit and **wait for approval** (1 hour to 2 weeks)

### 6. Create Certificate Profile

After identity validation is approved:

1. In your Trusted Signing Account → **Certificate profiles**
2. Click **Create**
   - **Name**: e.g., `shopconnector-public`
   - **Profile type**: Public Trust
   - **Identity validation**: select your approved validation
3. **Note the profile name** → `AZURE_CERT_PROFILE`

### 7. Configure GitHub Secrets

Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**

Add these **6 repository secrets**:

| Secret Name | Value | Example |
|---|---|---|
| `AZURE_TENANT_ID` | Azure AD tenant ID | `12345678-abcd-...` |
| `AZURE_CLIENT_ID` | App Registration client ID | `87654321-dcba-...` |
| `AZURE_CLIENT_SECRET` | App Registration secret value | `abc~XYZ123...` |
| `AZURE_SIGNING_ENDPOINT` | Trusted Signing endpoint URL | `https://weu.codesigning.azure.net` |
| `AZURE_SIGNING_ACCOUNT` | Trusted Signing account name | `shopconnector-signing` |
| `AZURE_CERT_PROFILE` | Certificate profile name | `shopconnector-public` |

### 8. Test

1. Trigger a manual workflow run:
   ```
   gh workflow run build-windows.yml
   ```
2. Check the "Sign installer with Azure Trusted Signing" step in the Actions log
3. Check the "Verify code signature" step — it should show:
   ```
   ✓ TimeTracker-Setup-x64.exe: Signed by CN=ShopConnector, O=ShopConnector
   ```
4. Download the installer and verify no SmartScreen warning appears

## Troubleshooting

### "The specified Azure Active Directory (AAD) resource was not found"
- Verify `AZURE_SIGNING_ENDPOINT` matches your account's region
- Ensure the App Registration has both IAM roles assigned

### "Certificate profile not found"
- Check `AZURE_CERT_PROFILE` matches the exact profile name
- Ensure identity validation is approved (status: "Completed")

### "Access denied"
- Verify `AZURE_CLIENT_SECRET` is the secret **value**, not the secret ID
- Check that both IAM roles are assigned to the correct App Registration

### Signing succeeds but SmartScreen still warns
- Azure Trusted Signing provides immediate trust — if you still see warnings,
  the signing might have failed silently. Check the verification step.
- Ensure you're testing with the signed .exe, not a cached unsigned version.

## Cost Summary

- **Azure subscription**: Free (pay-as-you-go, no minimum)
- **Trusted Signing Basic**: $9.99/month (~$120/year)
- **Total**: ~$120/year

## Alternative: SSL.com eSigner

If Azure Trusted Signing is not available in your region or you prefer a traditional CA:

1. Purchase OV Code Signing certificate from https://www.ssl.com ($64.50/year)
2. Subscribe to eSigner cloud signing ($20/month)
3. Replace the Azure signing step in the workflow with:

```yaml
- name: Sign with SSL.com eSigner
  uses: sslcom/esigner-codesign@master
  with:
    command: sign
    username: ${{ secrets.ES_USERNAME }}
    password: ${{ secrets.ES_PASSWORD }}
    credential_id: ${{ secrets.ES_CREDENTIAL_ID }}
    totp_secret: ${{ secrets.ES_TOTP_SECRET }}
    file_path: dist/TimeTracker-Setup-${{ steps.version.outputs.version }}-x64.exe
    malware_block: false
```

**Note**: SSL.com does NOT provide immediate SmartScreen trust.
Users will see SmartScreen warnings until enough downloads build reputation.
