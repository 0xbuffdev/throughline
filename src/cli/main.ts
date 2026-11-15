#!/usr/bin/env node
import { runCli } from "./commands.js";

process.exitCode = runCli(process.argv.slice(2));
