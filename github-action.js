// github-action.js - Reference Example
// Meant to be run as a workflow within GitHub Actions to run batch scanning/enforcement
//  of configuration settings for multiple repositories within an organization.
// See README.md for requirements and usage instructions.

const watcher = require('./watcher');
const fs = require('fs');

if (process.env.GHWATCHER_ALLOWED_ORG_LIST === (null || undefined)) {
  throw new Error('Could not determine ALLOWED_ORG_LIST. Environment variable GHWATCHER_ALLOWED_ORG_LIST must be set for valid target organization name(s).');
};

if (
  process.env.GHWATCHER_CHECK_ORG &&
  (process.env.GHWATCHER_ALLOWED_ORG_LIST).match(RegExp('(^|\\s*|,)' + process.env.GHWATCHER_CHECK_ORG + '($|\\s*|,)'))) {
  watcher.getProtectionStatus(process.env.GHWATCHER_CHECK_ORG, process.env.GHWATCHER_CHECK_REPO, process.env.GHWATCHER_CHECK_BRANCH).then(
    async(response) => {
      for await (const repo of response.repos) {
        if (repo.branches.length === 0) {
          await watcher.createDefaultBranch(response.organization, repo.name).then(repo.branches.push({name: 'main'}));
        }
        for (const branch of repo.branches){
          if (
            branch.name === repo.default_branch
            && branch.protected !== true
          ) {
            console.log('Applying Branch Protection rules for %s/%s', repo.name, branch.name);
            await watcher.setBranchProtection(response.organization, repo.name, branch.name);
          };
          // Apply rules if some settings are out of sync
          if (
            branch.name === repo.default_branch
            && branch.protected === true
            && (branch.protection.required_pull_request_reviews.required_approving_review_count < 1
            || branch.protection.required_pull_request_reviews.require_code_owner_reviews !== true)
          ) {
            console.log('Processing sync updates for %s/%s', repo.name, branch.name);
            await watcher.setBranchProtection(response.organization, repo.name, branch.name);
          };

          if (
            (process.env.GHWATCHER_ENABLE_DEPENDABOT &&
              process.env.GHWATCHER_ENABLE_DEPENDABOT.match(/true/)) &&
            repo.dependabot_vulnerability_alerts_enabled !== true) {
            await watcher.enableVulnerabilityAlert(response.organization, repo.name);
          };
        }
      };
    }).then(
    async() => {
      const final_response = await watcher.getProtectionStatus(process.env.GHWATCHER_CHECK_ORG, process.env.GHWATCHER_CHECK_REPO, process.env.GHWATCHER_CHECK_BRANCH);
      console.log(JSON.stringify(final_response, null, 2));

      let outObject = {};
      outObject[final_response.organization] = {};
      outObject[final_response.organization]['repos'] = [];

      for (const repo of final_response.repos) {
        for (const branch of repo.branches) {
          if (branch.name === repo.default_branch) {
            const obj = {
              repo_name: repo.name,
              dependabot_vulnerability_alerts_enabled: repo.dependabot_vulnerability_alerts_enabled,
              default_branch: branch.name,
              branch_protected: branch.protected,
              required_pull_request_reviews: branch.protected ? branch.protection.required_pull_request_reviews.required_approving_review_count : '-',
              require_code_owner_reviews: branch.protected ? branch.protection.required_pull_request_reviews.require_code_owner_reviews : '-',
              required_signatures: branch.protected ? branch.protection.required_signatures.enabled : '-',
              enforce_admins: branch.protected ? branch.protection.enforce_admins.enabled : '-',
              required_linear_history: branch.protected ? branch.protection.required_linear_history.enabled : '-',
              allow_force_pushes: branch.protected ? branch.protection.allow_force_pushes.enabled : '-',
              allow_deletions: branch.protected ? branch.protection.allow_deletions.enabled : '-',
              block_creations: branch.protected ? branch.protection.block_creations.enabled : '-',
              required_conversation_resolution: branch.protected ? branch.protection.required_conversation_resolution.enabled : '-',
            };

            outObject[final_response.organization]['repos'].push(obj);
          }
        }
      }

      // Create markdown table output from an array of flat objects
      function markdownSummary() {
        let outFileContent = '';
        outFileContent += (`# ${final_response.organization} Details:\n`);

        // Build header row from keys of first object in array
        for (const header of Object.keys(outObject[final_response.organization]['repos'][0])) {
          outFileContent += `| ${header.replace(/\_/g, ' ')} `;
        }
        outFileContent += '|\n'; // Complete header row

        // Header divider row - Center content
        outFileContent += '| :-: '.repeat(Object.keys(outObject[final_response.organization]['repos'][0]).length);
        outFileContent += '|\n'; // Complete header divider row


        for (const repo of outObject[final_response.organization]['repos']) {
          let repoContent = '';
          for (const [key, value] of Object.entries(repo)) { // eslint-disable-line no-unused-vars
            repoContent += `| ${value === true ? ':white_check_mark:' : value} `;
          }
          outFileContent += `${repoContent}|\n`; // Complete content row
        }

        return outFileContent;
      }

      const markdownContent = markdownSummary();

      console.log(`writing file to ${process.env.GHWATCHER_CHECK_ORG}.md`);
      fs.appendFileSync(`./${process.env.GHWATCHER_CHECK_ORG}.md`, markdownContent);

      return final_response;
    },
  );


} else {
  throw new Error('Could not determine ORG to check -- ENV variable GHWATCHER_CHECK_ORG not set.');
};
