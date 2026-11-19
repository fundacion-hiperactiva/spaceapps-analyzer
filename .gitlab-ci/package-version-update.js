const fs = require("fs");
const path = require("path");

// Calculate Day of Year
const now = new Date();
const start = new Date(now.getFullYear(), 0, 0);
const diff = now - start;
const oneDay = 1000 * 60 * 60 * 24;
// Pad the day with leading zeros to ensure it's always at least three digits
const day = Math.floor(diff / oneDay)
  .toString()
  .padStart(3, "0");

// Read package.json from repository root
const packageJsonPath = path.resolve(__dirname, "..", "package.json");
if (!fs.existsSync(packageJsonPath)) {
  console.error(`package.json not found at ${packageJsonPath}`);
  process.exit(1);
}
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));

// Extract version parts
const versionParts = packageJson.version.split(".");
const currentYear = now.getFullYear();
const currentDayOfYear = day;

// Expected version for today (always YEAR.DOY.0 - no incrementing)
const expectedVersion = `${currentYear}.${currentDayOfYear}.0`;

// Check if the version already matches today's expected version
if (
  versionParts.length === 3 &&
  versionParts[0] === currentYear.toString() &&
  versionParts[1] === currentDayOfYear &&
  versionParts[2] === "0"
) {
  // Version already matches YEAR.DOY.0 for today - no update needed
  console.log(`Version already up to date: ${packageJson.version}`);
  process.exit(0);
}

// Update to today's version (always .0, never increment)
packageJson.version = expectedVersion;

// Write the updated version back to package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + "\n");

console.log(`Updated version to ${packageJson.version}`);
