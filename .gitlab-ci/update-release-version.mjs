import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

/**
 * Script to update the release version in YEAR.DOY.INCREMENTAL format.
 */

const API_URL = process.env.CI_API_V4_URL || "https://gitlab.com/api/v4";
const DEFAULT_TOKEN =
  process.env.GITLAB_PERSONAL_ACCESS_TOKEN ||
  process.env.GITLAB_TOKEN ||
  process.env.GITLAB_ACCESS_TOKEN;
const DEFAULT_GROUP_ID = process.env.GITLAB_GROUP_ID || "amaia";
const DEFAULT_PROJECT_ID = process.env.CI_PROJECT_ID;
const DEFAULT_BRANCH = process.env.CI_DEFAULT_BRANCH || "main";
const VAR_NAME = "E3_VERSION";

async function gitlabApi(endpoint, token, options = {}) {
  const url = `${API_URL}${endpoint}`;
  const headers = {
    "PRIVATE-TOKEN": token,
    "Content-Type": "application/json",
    ...options.headers,
  };
  const response = await fetch(url, { ...options, headers });
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(
      `GitLab API error (${response.status}) at ${endpoint}: ${text}`,
    );
  }
  return response;
}

async function getGroupVariable(groupId, token, key) {
  const response = await gitlabApi(
    `/groups/${encodeURIComponent(groupId)}/variables/${key}`,
    token,
  );
  if (response.status === 404) return null;
  return await response.json();
}

async function setGroupVariable(groupId, token, key, value) {
  const existing = await getGroupVariable(groupId, token, key);
  if (existing) {
    await gitlabApi(
      `/groups/${encodeURIComponent(groupId)}/variables/${key}`,
      token,
      {
        method: "PUT",
        body: JSON.stringify({ value }),
      },
    );
  } else {
    await gitlabApi(`/groups/${encodeURIComponent(groupId)}/variables`, token, {
      method: "POST",
      body: JSON.stringify({ key, value }),
    });
  }
}

async function getLastPipelineStatus(projectId, token, branch) {
  if (!projectId) {
    console.warn("Project ID not provided, skipping pipeline status check.");
    return null;
  }
  const response = await gitlabApi(
    `/projects/${projectId}/pipelines?ref=${branch}&per_page=1`,
    token,
  );
  const pipelines = await response.json();
  return pipelines.length > 0 ? pipelines[0].status : null;
}

function getTodayVersionBase() {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now - start;
  const oneDay = 1000 * 60 * 60 * 24;
  const doy = Math.floor(diff / oneDay)
    .toString()
    .padStart(3, "0");
  return `${now.getFullYear()}.${doy}`;
}

function runGit(command) {
  const allowedCommands = ["config", "add", "commit", "push"];
  const args = command.split(/\s+/).filter(Boolean);
  if (args.length === 0) {
    throw new Error(`Empty git command`);
  }
  const gitCmd = args[0];
  if (!allowedCommands.includes(gitCmd)) {
    throw new Error(`Unsupported git command: ${gitCmd}`);
  }
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) {
    console.error(`Git command failed: git ${command}`);
    console.error(result.stderr || result.error);
    throw new Error(result.stderr || result.error);
  }
  return result.stdout.trim();
}

export async function getVersion(options = {}) {
  const {
    token = DEFAULT_TOKEN,
    groupId = DEFAULT_GROUP_ID,
    projectId = DEFAULT_PROJECT_ID,
    branch = DEFAULT_BRANCH,
    varName = VAR_NAME,
    dryRun = process.env.DRY_RUN === "true",
  } = options;

  if (!token && !process.env.TEST_MODE) {
    throw new Error("GitLab token is required.");
  }

  const todayBase = getTodayVersionBase();
  const currentVar = await getGroupVariable(groupId, token, varName);
  const currentValue = currentVar ? currentVar.value : "0000.000.0";

  const parts = currentValue.split(".");
  const currentYear = parts[0];
  const currentDoy = parts[1];
  const incremental = parts[2];
  const currentBase = `${currentYear}.${currentDoy}`;

  let nextVersion;
  if (currentBase !== todayBase) {
    console.log(
      `New day! Resetting incremental to 0. Previous: ${currentValue}, Today: ${todayBase}.0`,
    );
    nextVersion = `${todayBase}.0`;
  } else {
    const lastStatus = await getLastPipelineStatus(projectId, token, branch);
    console.log(`Same day. Last pipeline status on ${branch}: ${lastStatus}`);

    if (lastStatus === "success") {
      const nextIncremental = parseInt(incremental || "0", 10) + 1;
      nextVersion = `${todayBase}.${nextIncremental}`;
      console.log(
        `Last pipeline succeeded. Incrementing version to ${nextVersion}`,
      );
    } else {
      nextVersion = currentValue;
      console.log(
        `Last pipeline failed or is not successful (${lastStatus}). Keeping version ${nextVersion}`,
      );
    }
  }

  console.log(`Final Version: ${nextVersion}`);

  if (nextVersion !== currentValue) {
    if (!dryRun) {
      await setGroupVariable(groupId, token, varName, nextVersion);
      console.log(
        `Successfully updated GitLab Group Variable ${varName} to ${nextVersion}`,
      );

      const pkgPath = path.join(process.cwd(), "package.json");
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
          if (pkg.version !== nextVersion) {
            pkg.version = nextVersion;
            fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
            console.log(`Updated package.json version to ${nextVersion}`);

            // Git automation
            if (process.env.CI) {
              console.log(
                "CI environment detected. Automating Git commit/push...",
              );

              // Configure git if not set
              try {
                runGit(["config", "user.name"]);
              } catch {
                runGit(["config", "user.name", "bb-8"]);
              }
              try {
                runGit(["config", "user.email"]);
              } catch {
                runGit(["config", "user.email", "bb-8@hks.ar"]);
              }

              runGit(["add", "package.json"]);
              runGit([
                "commit",
                "-m",
                `🆙: update version to ${nextVersion} [skip ci]`,
              ]);

              // Push with ci.skip
              const remote = "origin";
              runGit(["push", "-o", "ci.skip", remote, `HEAD:${branch}`]);
              console.log(`Successfully pushed version update to ${branch}`);
            }
          } else {
            console.log(
              "package.json version already matches nextVersion. Skipping Git operations.",
            );
          }
        } catch (e) {
          console.warn(
            `Failed to update package.json or perform Git operations: ${e.message}`,
          );
        }
      }
    } else {
      console.log(
        `DRY_RUN enabled. Skip updating GitLab, package.json and Git.`,
      );
    }
  } else {
    console.log("No version update needed.");
  }

  return nextVersion;
}

if (
  process.argv[1] === import.meta.filename ||
  (process.argv[1] && process.argv[1].endsWith("update-release-version.mjs"))
) {
  getVersion().catch((err) => {
    console.error("Fatal error:", err.message);
    process.exit(1);
  });
}
