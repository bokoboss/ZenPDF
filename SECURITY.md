# Security and Privacy

## Document-processing model

ZenPDF is intended to process user documents locally in the browser. Application features should not upload document contents to a server unless that behavior is explicitly introduced, clearly disclosed, and separately approved.

## Current limitation

The current application still loads some application and PDF-processing dependencies from third-party CDNs at runtime. Document contents are processed client-side, but the application is not yet fully self-contained or offline-capable.

The modernization roadmap tracks migration of runtime dependencies into the local application bundle.

## Secrets

ZenPDF currently requires no API key or application secret for its core PDF functionality.

Do not expose secrets through Vite `define`, browser environment variables, frontend source code, or committed configuration. Any future feature requiring a secret must keep that secret on a trusted server boundary and must not embed it in the client bundle.

## Dependency policy

Prefer pinned, locally installed dependencies over runtime CDN imports for security-sensitive document processing. Dependency upgrades should be validated with representative PDF fixtures before release.

## Reporting a vulnerability

Do not include private documents, credentials, or sensitive personal information in a public GitHub issue. Provide a minimal reproduction that does not contain confidential material.
