#!/usr/bin/env node

/**
 * ClawForge CLI – configure the plugin in an OpenClaw client.
 *
 * Usage:
 *   clawforge install --url <controlPlaneUrl> --org <orgId>
 *   clawforge uninstall
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { parseArgs } from "node:util";

const GLOBAL_CONFIG = path.join(os.homedir(), ".openclaw", "openclaw.json");

function readConfig(configPath) {
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return {};
  }
}

function writeConfig(configPath, config) {
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
}

function install(args) {
  const { values } = parseArgs({
    args,
    options: {
      url: { type: "string", short: "u" },
      org: { type: "string", short: "o" },
    },
    allowPositionals: false,
  });

  if (!values.url || !values.org) {
    console.error("Usage: clawforge install --url <controlPlaneUrl> --org <orgId>");
    process.exit(1);
  }

  const config = readConfig(GLOBAL_CONFIG);

  if (!config.plugins) config.plugins = {};
  if (!config.plugins.entries) config.plugins.entries = {};

  if (!config.plugins.entries.clawforge) {
    config.plugins.entries.clawforge = { enabled: true };
  }

  config.plugins.entries.clawforge.config = {
    controlPlaneUrl: values.url,
    orgId: values.org,
  };

  writeConfig(GLOBAL_CONFIG, config);
  console.log(`ClawForge plugin configured in ${GLOBAL_CONFIG}`);
  console.log(`  controlPlaneUrl: ${values.url}`);
  console.log(`  orgId: ${values.org}`);
  console.log();
  console.log("Next steps:");
  console.log("  1. Install the plugin: openclaw plugins install @openclaw/clawforge");
  console.log("  2. Start OpenClaw");
  console.log("  3. Run /clawforge-enroll <token> <email> to authenticate");
}

function uninstall() {
  const config = readConfig(GLOBAL_CONFIG);

  if (config.plugins?.entries?.clawforge) {
    delete config.plugins.entries.clawforge;
    if (Object.keys(config.plugins.entries).length === 0) delete config.plugins.entries;
    writeConfig(GLOBAL_CONFIG, config);
    console.log(`ClawForge plugin removed from ${GLOBAL_CONFIG}`);
  } else {
    console.log("ClawForge plugin not found in config.");
  }
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "install":
    install(rest);
    break;
  case "uninstall":
    uninstall();
    break;
  default:
    console.log("ClawForge CLI");
    console.log();
    console.log("Usage:");
    console.log("  clawforge install --url <controlPlaneUrl> --org <orgId>");
    console.log("  clawforge uninstall");
    if (command && command !== "help" && command !== "--help") process.exit(1);
}
