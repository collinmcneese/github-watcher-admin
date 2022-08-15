# GitHub Watcher for Organizations

**Notice**: The contents of this repository are meant for reference example only and should not directly be used in a production environment without additional testing and validation.

- [GitHub Watcher for Organizations](#github-watcher-for-organizations)
  - [Overview](#overview)
  - [Requirements](#requirements)
  - [Usage](#usage)
    - [Usage - Workflow Dispatch](#usage---workflow-dispatch)
      - [Components - Workflow Dispatch](#components---workflow-dispatch)
      - [Workflow Configuration - Workflow Dispatch](#workflow-configuration---workflow-dispatch)
  - [References](#references)
  - [License](#license)

## Overview

The purpose of this repository is to serve as a reference example for setting up automated validation and enforcement of GitHub Repository settings within a target Organization.

This example repository uses **Node.js** to communicate with the GitHub REST API using the [GitHub REST API client for JavaScript](https://github.com/octokit/rest.js) from [Octokit](https://github.com/octokit).

- [watcher.js](./watcher.js): Contains functional logic and module exports which are consumed by other application files to apply configuration settings across Repositories and associated Branches within an Organization.
- [github-action.js](./github-action.js): **Node.js** app file meant to use for batch processing to scan multiple repositories within an organization to verify baseline configurations are in place.  The format of this file is meant to be used as a Workflow within a GitHub Action with associated Environment variables provided from the Workflow.

## Requirements

- **Node.js**: Tested with `v16.14.2` of **Node.js** with **npm** version `8.6.0`.  Refer to the [Node.js Docs Site](https://nodejs.org/en/) for installation details.
- **GitHub Organization**:  A GitHub Organization is required to use examples within this repository.  It is strongly encouraged to use a dedicated testing organization first so that changes are not accidentally introduced into primary organizations and associated repositories.
- **Github Access**: Requires Organization Administrative rights for setting up an organization webhook.
- **GitHub Organization Webhook**:  A Webhook will be used with the GitHub organization to communicate trigger events to the Web App included with this repository.
- **GitHub App**: Communications with the GitHub REST API require authenticated access for components used with this example.  See [GitHub App Docs](https://docs.github.com/en/developers/apps/managing-github-apps) for setup.
  - GitHub App should have permissions:
    - `Repository` -> `Administration`: read/write
    - `Repository` -> `Contents`: read/write
    - `Repository` -> `Metadata`: read
    - `Organization` -> `Administration`: read

## Usage

### Usage - Workflow Dispatch

This example repository can be triggered with a [Workflow Dispatch](https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_dispatch) event to directly trigger a workflow run with parameters.

#### Components - Workflow Dispatch

- [package.json](./package.json): **Node.js** app definition and source of dependencies.
- [github-action.js](./github-action.js): Entry point for the application called by `workflow_dispatch`.
- [watcher.js](./watcher.js): Contains functions and module exports which are called from [github-action.js](./github-action.js) entry point.
- Environment Variables used:
  - `GHWATCHER_BASEURL`: Used by [watcher.js](./watcher.js), GitHub Base URL for API calls.  Defaults to `https://api.github.com`.  For a GitHub Enterprise Server(GHES) installation this would be `https://FQDN-of-GHES/api/v3`.
  - `GHWATCHER_APP_ID`: **required**, Used by [watcher.js](./watcher.js), GitHub App ID for interacting with the GitHub REST API with Octokit.
  - `GHWATCHER_APP_PEM`: **required**, Used by [watcher.js](./watcher.js), GitHub App Private Key content for interacting with the GitHub REST API with Octokit.
  - `GHWATCHER_APP_INSTALLATION_ID`: **required**, Used by [watcher.js](./watcher.js), will be used to generate a short-lived token for interacting with the GitHub REST API with Octokit.
  - `GHWATCHER_ALLOWED_ORG_LIST`: **required**, Used by [github-action.js](github-action.js) to determine if the `repository.owner.login` sent in the webhook request is matched to a valid listing of Organization names which this application is allowed to target.  Limits interactions from this application to only scan specified target Organizations which are explicitly allowed. Supports a String value either space or comma delimited.
  - `GHWATCHER_ENABLE_DEPENDABOT`: Used by [github-action.js](github-action.js) to determine if Dependabot scanning should be enabled on repositories when applying branch protection rules, enabling by setting a String value of `true`. Default value is `null`.
  - `GHWATCHER_ENFORCE_PRIVATE`: Used by [watcher.js](./watcher.js) to determine if checks/enforcement should happen for **private** repositories, setting to value of `true` to include **private** repositories.  Default value is `false`.
  - `GHWATCHER_REPO_SKIP_LIST`: Used by [watcher.js](./watcher.js) to determine if named repositories should be skipped from checks/enforcement.  Supports a String value either space or comma delimited.

#### Workflow Configuration - Workflow Dispatch

The following shows relevant configuration options which are similar to the [watcher.yml](.github/workflows/watcher.yml) workflow located in this repository.

```yaml
on:
  # Allow for manual execution
  workflow_dispatch:
  # Execute on schedule
  schedule:
    - cron:  '30 5,17 * * *'

jobs:
  watcher_exec:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        org:
          - example-org-name-1
          - example-org-name-2
        include:
          # Specify secrets for authentication to example-org-name-1
          - org: example-org-name-1
            GHWATCHER_APP_ID: GHWATCHER_APP_ID_1
            GHWATCHER_APP_PEM: GHWATCHER_APP_PEM_1
            GHWATCHER_APP_INSTALLATION_ID: GHWATCHER_APP_INSTALLATION_ID_1
          # Specify secrets for authentication to example-org-name-2
          - org: example-org-name-2
            GHWATCHER_APP_ID: GHWATCHER_APP_ID_2
            GHWATCHER_APP_PEM: GHWATCHER_APP_PEM_2
            GHWATCHER_APP_INSTALLATION_ID: GHWATCHER_APP_INSTALLATION_ID_2
    # Populate shared environment variables used by all orgs
    env:
      # Org-specific configurations can be passed as matrix-include items
      GHWATCHER_APP_ID: ${{ secrets[matrix.GHWATCHER_APP_ID] }}
      GHWATCHER_APP_PEM: ${{ secrets[matrix.GHWATCHER_APP_PEM] }}
      GHWATCHER_APP_INSTALLATION_ID: ${{ secrets[matrix.GHWATCHER_APP_INSTALLATION_ID] }}
      GHWATCHER_CHECK_ORG: ${{ matrix.org }}
      GHWATCHER_ENFORCE_PRIVATE: false
      GHWATCHER_REPO_SKIP_LIST: github-watcher-admin
      GHWATCHER_ALLOWED_ORG_LIST: ${{ matrix.org }}
      GHWATCHER_ENABLE_DEPENDABOT: true
      GHWATCHER_BASEURL: https://api.github.com
    steps:
      - uses: actions/checkout@v2
      - name: Use Node.js 16.x
        uses: actions/setup-node@v1
        with:
          node-version: 16.x
      - name: npm setup
        run: npm install
      - name: ${{ matrix.org }} - exec watcher
        run: npx node github-action.js
      - name: Summary
        run: cat ${{ matrix.org }}.md >> $GITHUB_STEP_SUMMARY

```

## References

- Uses the [GitHub REST API client for JavaScript](https://github.com/octokit/rest.js) from [Octokit](https://github.com/octokit).
- Octokit OpenAPI interactive reference page [https://octokit.github.io/rest.js/v18]

## License

```plain
The MIT License

Copyright (c) 2022-present github.com/collinmcneese

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```
