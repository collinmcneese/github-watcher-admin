// watcher.js - Reference Example
// Contains functions to perform actions against GitHub Repositories using
//  Octokit and the GitHub REST API.
// See README.md for requirements and usage instructions.

const { Octokit } = require('@octokit/rest');
const { createAppAuth } = require('@octokit/auth-app');

const octokit = new Octokit({
  authStrategy: createAppAuth,
  baseUrl: (process.env.GHWATCHER_BASEURL || 'https://api.github.com'),
  auth: {
    appId: process.env.GHWATCHER_APP_ID,
    privateKey: process.env.GHWATCHER_APP_PEM,
    installationId: process.env.GHWATCHER_APP_INSTALLATION_ID,
  },
});

// Fetch listing of repositories for an organization
//  Returns an Array of Objects with details of repositories
async function getRepoList(orgName, repoName) {
  const { data } = await octokit.rest.repos.listForOrg({
    org: orgName,
  });

  // Filter on repoName, if present
  const return_data = repoName ? data.filter(repo => repo.name.toLowerCase() === repoName.toLowerCase()) : data;

  return return_data;
}

// Fetch listing of branches for provided repository
//  Returns an Array of Strings
async function getBranchList(repoData) {
  try {
    const { data } = await octokit.rest.repos.listBranches({
      owner: repoData.owner.login,
      repo: repoData.name,
    });

    return data;
  } catch (err) {
    console.log('%s/%s: %s', repoData.owner.login, repoData.name, err);
  }
}

// Fetch protection details of provided branch on repository
//  Returns an Object
async function getBranchProtectionDetails(repoData, branch) {
  const { data } = await octokit.rest.repos.getBranchProtection({
    owner: repoData.owner.login,
    repo: repoData.name,
    branch: branch,
  });

  return data;
}

// Creates a default branch on a repository if one is not present with a default README.md
// TODO: Allow this content to be populated from ENV variables
async function createDefaultBranch(org, repo, branch) {
  try {
    console.log('%s/%s: Creating Default Branch with README.md', org, repo);
    const readme_content = `# ${repo}
This file has been auto-generated.
Check out these helpful links for getting started with your new repository:

- [some-link](#)
- [some-other-link](#)`;
    await octokit.rest.repos.createOrUpdateFileContents({
      owner: org,
      repo: repo,
      branch: (branch || 'main'),
      path: 'README.md',
      message: 'Creates Default Branch',
      content: Buffer.from(readme_content).toString('base64'),
    });
  } catch (err) {
    console.log(err);
    return err;
  }
}

async function createNotificationIssue(org, repo, user) {
  try {
    console.log('%s/%s: Creating a notification Issue for %s', org, repo, user);
    await octokit.rest.issues.create({
      owner: org,
      repo: repo,
      title: 'watcher-bot action taken',
      body: `Hello @${user}!  This is a notification issue that the watcher-bot,
https://github.com/mydevsandbox-com/watcher , performed actions on this repository to
apply baseline configurations and branch protections for the default branch.`,
    });
  } catch (err) {
    console.log(err);
  }
}

// Enforces branch protection rules
// TODO: Allow all options to be populated from ENV variables
async function setBranchProtection(owner, repo, branch) {
  try {
    // console.log('%s/%s/%s: Updating Branch Protection', owner, repo, branch);
    const { data } = await octokit.rest.repos.updateBranchProtection({
      owner: owner,
      repo: repo,
      branch: branch,
      required_status_checks: {
        strict: true,
        checks: [],
      },
      enforce_admins: false,
      required_pull_request_reviews: {
        dismissal_restrictions: {},
        dismiss_stale_reviews: true,
        require_code_owner_reviews: true,
        required_approving_review_count: 1,
      },
      restrictions: null,
      // restrictions.users: ,
      // restrictions.teams: ,
    });

    return data;
  } catch (err) {
    console.log('%s/%s/%s: %s, %s', owner, repo, branch, err.response.status, err.response.data.message);
    return err;
  }
}

// Fetches the status of Dependabot alerting for a repository
async function getVulnerabilityAlertStatus(orgName, repoName) {
  try {
    const { status } = await octokit.rest.repos.checkVulnerabilityAlerts({
      owner: orgName,
      repo: repoName,
    });

    return status;
  } catch (err) {
  // console.log(err);
    return err;
  }
}

// Enables Dependabot alerting for a repository
async function enableVulnerabilityAlert(orgName, repoName) {
  console.log('%s/%s: Enabling Dependabot Alert Scanning', orgName, repoName);
  try {
    const { status } = await octokit.rest.repos.enableVulnerabilityAlerts({
      owner: orgName,
      repo: repoName,
    });
    return status;
  } catch (err) {
    // console.log(err);
    return err;
  }
}

// Checks to see if there is a recent history of code-scanning analysis data for the repo
async function getCodeScanningAlertStatus(orgName, repoName) {
  try {
    const { data } = await octokit.rest.codeScanning.listRecentAnalyses({
      owner: orgName,
      repo: repoName,
    });

    return data;
  } catch (err) {
    console.log('%s/%s: %s', orgName, repoName, (err.response.data.message || err));
    return [];
  }
}

// Fetches the branch protection status and settings for default (or provided) branch on
//   provided Organization(Required) and Repository(Optional)
//  Returns an Array of Objects
async function getProtectionStatus(orgName, repoName, branchName) {
  const reply = {
    organization: orgName,
    repos: [],
  };

  const repo_list = await getRepoList(orgName, repoName);

  // Iterate through all repos returned as part of an org
  for await (const repo of repo_list) {
    // Skip private repos unless GHWATCHER_ENFORCE_PRIVATE is true
    if (repo.private === true && process.env.GHWATCHER_ENFORCE_PRIVATE.match(/true/)) {
      continue;
    }

    // Skip excluded repos, if present
    const regexp_repo_name = '(^|\\s*|,)' + repo.name + '($|\\s*|,)';
    if ((process.env.GHWATCHER_REPO_SKIP_LIST).match(RegExp(regexp_repo_name))) {
      console.log('matched for SKIP_LIST to skip repo %s', repo.name);
      continue;
    }

    // Fetch status of Dependabot Vulnerability Alerts
    const vuln_alert_status = await getVulnerabilityAlertStatus(repo.owner.login, repo.name);

    // Code-Scanning Analysis Data
    const code_scanning_analysis = await getCodeScanningAlertStatus(repo.owner.login, repo.name);

    // Create an Object which will store data for this repo
    const repo_object = {
      name: repo.name,
      dependabot_vulnerability_alerts_enabled: (vuln_alert_status === 204 || false),
      code_scanning_has_data: (code_scanning_analysis.length > 0 || false),
      branches: [],
      default_branch: (repo.default_branch || null),
    };

    // Fetch a listing of branches on the repo
    // console.log('Fetching branches for %s/%s', orgName, repo.name);
    const branches = await getBranchList(repo);

    // Use the supplied branchName or the default_branch of a repo
    const branchNameToCheck = (branchName || repo.default_branch);

    for await (const branch of branches) {
      if (branchNameToCheck.toLowerCase === branch.name.toLowerCase) {
        const branch_protection_details = branch.protected ? await getBranchProtectionDetails(repo, branch.name) : {};

        const branch_reply = {
          name: branch.name,
          protected: branch.protected,
          protection: branch_protection_details,
        };

        repo_object.branches.push(branch_reply);
      }
    }

    reply.repos.push(repo_object);
  }

  return reply;
}

module.exports = {
  getProtectionStatus,
  setBranchProtection,
  enableVulnerabilityAlert,
  createDefaultBranch,
  createNotificationIssue,
};
