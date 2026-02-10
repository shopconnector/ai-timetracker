# Releasing TimeTracker

## Quick Release (Recommended)

1. Update version in `package.json`:
   ```json
   "version": "0.2.0"
   ```

2. Commit and push:
   ```bash
   git add -A
   git commit -m "Release v0.2.0"
   git push origin main
   ```

3. Create and push tag:
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

4. GitHub Actions will automatically:
   - Build the Windows bundle
   - Create portable ZIP
   - Build installer EXE
   - Create GitHub Release with artifacts

## Manual Build (Local Testing)

### Requirements
- Windows 10/11
- PowerShell 5.1+
- Node.js 20+
- pnpm 9+
- [Inno Setup 6](https://jrsoftware.org/isinfo.php) (for installer)

### Build Steps

1. **Build the bundle:**
   ```powershell
   cd ai-timetracker
   .\scripts\windows\build-bundle.ps1
   ```

2. **Test the bundle:**
   ```powershell
   .\scripts\windows\test-bundle.ps1
   ```

3. **Create portable ZIP manually:**
   ```powershell
   Compress-Archive -Path "dist\windows\*" -DestinationPath "dist\TimeTracker-portable.zip"
   ```

4. **Build installer (requires Inno Setup):**
   ```powershell
   & "C:\Program Files (x86)\Inno Setup 6\ISCC.exe" installer\timetracker.iss
   ```

## Artifacts

After successful build/release:

| File | Description |
|------|-------------|
| `TimeTracker-Setup-x64.exe` | Windows installer (~35MB) |
| `TimeTracker-{version}-portable-x64.zip` | Portable ZIP (~35MB) |

## Version Numbering

Use semantic versioning: `MAJOR.MINOR.PATCH`

- **MAJOR:** Breaking changes
- **MINOR:** New features (backwards compatible)
- **PATCH:** Bug fixes

## Checklist Before Release

- [ ] All tests pass locally
- [ ] Version updated in `package.json`
- [ ] CHANGELOG updated (if exists)
- [ ] `pnpm build` completes without errors
- [ ] Local bundle test passes: `.\scripts\windows\test-bundle.ps1`
