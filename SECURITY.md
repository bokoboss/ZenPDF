# Security and Privacy

## Document-processing model

ZenPDF is intended to process user documents locally in the browser. Application features should not upload document contents to a server unless that behavior is explicitly introduced, clearly disclosed, and separately approved.

## Current runtime boundary

PDF processing is bundled locally in the application: `pdf-lib@1.17.1` handles
output generation and `pdfjs-dist@6.2.108` handles parsing and thumbnails inside
a Vite-bundled TypeScript module worker. The worker returns local `Blob` values;
the application owns browser Object URLs through an explicit resource registry.

Document contents therefore remain local to the user's browser during the
current PDF workflows. Tailwind CSS is compiled into the local Vite build and
the application shell has no Google Fonts or other third-party UI asset runtime
requests in the tested production preview.

## Secrets

ZenPDF currently requires no API key or application secret for its core PDF functionality.

Do not expose secrets through Vite `define`, browser environment variables, frontend source code, or committed configuration. Any future feature requiring a secret must keep that secret on a trusted server boundary and must not embed it in the client bundle.

## Dependency policy

Prefer pinned, locally installed dependencies over runtime CDN imports for security-sensitive document processing. Dependency upgrades should be validated with representative PDF fixtures before release.

## Reporting a vulnerability

Do not include private documents, credentials, or sensitive personal information in a public GitHub issue. Provide a minimal reproduction that does not contain confidential material.
