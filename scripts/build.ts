#!/usr/bin/env bun
/**
 * Build Script - 构建和发布 VS Code 扩展
 *
 * 用法:
 *   bun run build              - 编译 TypeScript 到 dist 目录
 *   bun run build --install    - 编译后本地安装插件
 *   bun run build --release    - 编译并发布到 GitHub (需要交互确认)
 */

import { rm, readdir, stat, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

// 解析命令行参数
const args = process.argv.slice(2);
const isInstall = args.includes("--install");
const isRelease = args.includes("--release");

const PROJECT_ROOT = dirname(dirname(import.meta.path));
const DIST_DIR = join(PROJECT_ROOT, "dist");
const RELEASE_DIR = join(PROJECT_ROOT, "release");

// 颜色输出
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

function log(msg: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logStep(step: string) {
  log(`\n📦 ${step}...`, "cyan");
}

function logSuccess(msg: string) {
  log(`   ✅ ${msg}`, "green");
}

function logError(msg: string) {
  log(`   ❌ ${msg}`, "red");
}

function logWarn(msg: string) {
  log(`   ⚠️  ${msg}`, "yellow");
}

// 执行命令
function execCommand(command: string, args: string[], options: { cwd?: string; silent?: boolean } = {}): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: options.cwd || PROJECT_ROOT,
      stdio: options.silent ? "pipe" : "inherit",
      shell: true,
    });

    let output = "";
    if (options.silent) {
      proc.stdout?.on("data", (data) => {
        output += data.toString();
      });
      proc.stderr?.on("data", (data) => {
        output += data.toString();
      });
    }

    proc.on("close", (code) => {
      if (output && !options.silent) {
        console.log(output);
      }
      resolve(code || 0);
    });

    proc.on("error", () => {
      resolve(1);
    });
  });
}

// 确认交互
async function confirm(message: string): Promise<boolean> {
  console.log(`\n${colors.yellow}${message}${colors.reset}`);
  console.log(`${colors.gray}请输入 y/n (yes/no): ${colors.reset}`);

  // 使用 readline 实现交互确认
  const readline = await import("node:readline/promises");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question("");
    rl.close();
    const result = answer.toLowerCase().trim();
    return result === "y" || result === "yes";
  } catch {
    rl.close();
    return false;
  }
}

// 检查是否需要安装依赖
async function needsInstall(): Promise<boolean> {
  const nodeModulesPath = join(PROJECT_ROOT, "node_modules");
  if (!existsSync(nodeModulesPath)) {
    return true;
  }
  return false;
}

// 安装依赖
async function installDependencies(): Promise<boolean> {
  logStep("安装依赖");

  const code = await execCommand("bun", ["install"]);
  
  if (code !== 0) {
    logError("安装依赖失败");
    return false;
  }

  logSuccess("依赖安装完成");
  return true;
}

// 检查是否需要编译
async function needsCompile(): Promise<boolean> {
  const distPath = join(DIST_DIR, "extension.js");
  if (!existsSync(distPath)) {
    return true;
  }

  // 检查 package.json 和源文件是否比 dist 文件新
  const srcFiles = ["src/presentation/extension.ts", "package.json"];
  
  try {
    const distStats = await stat(distPath);
    
    for (const srcFile of srcFiles) {
      const srcPath = join(PROJECT_ROOT, srcFile);
      if (existsSync(srcPath)) {
        const srcStats = await stat(srcPath);
        if (srcStats.mtime > distStats.mtime) {
          return true;
        }
      }
    }
  } catch {
    return true;
  }

  return false;
}

// 编译
async function compile(): Promise<boolean> {
  logStep("编译 TypeScript");

  const code = await execCommand("bun", ["run", "compile"]);
  
  if (code !== 0) {
    logError("编译失败");
    return false;
  }

  logSuccess("编译完成");
  return true;
}

// 打包 VSIX
async function packageVsix(): Promise<boolean> {
  logStep("打包 VSIX");

  // 清理已存在的 VSIX 文件
  log("   清理旧的 VSIX 文件...", "gray");
  try {
    const files = await readdir(PROJECT_ROOT);
    const vsixFiles = files.filter((f) => f.endsWith(".vsix"));
    for (const file of vsixFiles) {
      const filePath = join(PROJECT_ROOT, file);
      await rm(filePath, { force: true });
      log(`   已删除: ${file}`, "gray");
    }
  } catch (error) {
    logWarn("清理旧 VSIX 文件时出错");
  }

  // 运行编译（minify 版本）
  let code = await execCommand("bun", ["run", "package"]);
  
  if (code !== 0) {
    logError("编译失败");
    return false;
  }

  // 使用 vsce 打包
  code = await execCommand("bunx", [
    "@vscode/vsce",
    "package",
    "--baseImagesUrl",
    "https://raw.githubusercontent.com/deepwn/addi/refs/heads/main/",
    "--no-yarn",
    "--no-dependencies",
  ]);

  if (code !== 0) {
    logError("打包失败");
    return false;
  }

  logSuccess("打包完成");
  return true;
}

// 获取版本号
async function getVersion(): Promise<string> {
  const packageJsonPath = join(PROJECT_ROOT, "package.json");
  const content = await Bun.file(packageJsonPath).text();
  const pkg = JSON.parse(content);
  return pkg.version;
}

// 安装到 VS Code (本地)
async function installExtension(): Promise<boolean> {
  logStep("安装插件到 VS Code");

  // 查找最新的 vsix 文件
  const vsixFiles = await readdir(PROJECT_ROOT);
  const vsixFile = vsixFiles.find((f) => f.endsWith(".vsix"));

  if (!vsixFile) {
    logError("未找到 .vsix 文件，请先运行编译");
    return false;
  }

  const vsixPath = join(PROJECT_ROOT, vsixFile);
  log(`   安装文件: ${vsixFile}`, "gray");

  // 使用 code 命令安装
  const code = await execCommand("code", ["--install-extension", vsixPath, "--force"]);

  if (code !== 0) {
    logError("安装失败，请确保 VS Code 已安装且在 PATH 中");
    return false;
  }

  logSuccess("插件已安装");
  return true;
}

// 发布到 GitHub
async function releaseToGitHub(): Promise<boolean> {
  logStep("发布到 GitHub");

  // 检查 GITHUB_TOKEN
  if (!process.env.GITHUB_TOKEN) {
    logWarn("未设置 GITHUB_TOKEN 环境变量，跳过 GitHub 发布");
    log("请设置: export GITHUB_TOKEN='your_token_here'", "gray");
    return false;
  }

  const version = await getVersion();
  const tag = `v${version}`;
  const repoOwner = "deepwn";
  const repoName = "addi";

  log(`   版本: ${tag}`, "gray");
  log(`   仓库: ${repoOwner}/${repoName}`, "gray");

  // 确保 release 目录存在
  if (!existsSync(RELEASE_DIR)) {
    await mkdir(RELEASE_DIR, { recursive: true });
  }

  // 查找 vsix 文件
  const vsixFiles = await readdir(PROJECT_ROOT);
  const vsixFile = vsixFiles.find((f) => f.endsWith(".vsix"));

  if (!vsixFile) {
    logError("未找到 .vsix 文件");
    return false;
  }

  const vsixPath = join(PROJECT_ROOT, vsixFile);

  // 上传到 GitHub
  const apiUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/releases`;
  
  // 创建 release
  const releaseBody = JSON.stringify({
    tag_name: tag,
    target_commitish: "main",
    name: tag,
    body: `Release ${tag}`,
    draft: false,
    prerelease: false,
  });

  log("   创建 Release...", "gray");

  // 使用 curl 上传 (更简单)
  const uploadCode = await execCommand("curl", [
    "-X", "POST",
    "-H", `Authorization: token ${process.env.GITHUB_TOKEN}`,
    "-H", "Accept: application/vnd.github.v3+json",
    "-H", "Content-Type: application/json",
    "-d", releaseBody,
    apiUrl,
  ], { silent: true });

  if (uploadCode !== 0) {
    // 可能已存在，尝试获取
    log("   Release 已存在，获取现有 release...", "yellow");
  }

  // 上传 asset
  log("   上传 VSIX 文件...", "gray");
  
  // 这里简化处理 - 实际上需要获取 upload_url
  logWarn("GitHub 发布需要更完善的实现，请使用 scripts/release_github.ps1 或 .sh");
  
  return false;
}

async function main() {
  log("🚀 Addi 构建脚本", "cyan");
  log(`   项目目录: ${PROJECT_ROOT}`, "gray");

  // --release 需要确认
  if (isRelease) {
    // 非交互模式禁止发布，确保安全性
    if (!process.stdin.isTTY) {
      logError("发布操作需要在交互模式下运行，请勿在 CI/脚本中使用 --release");
      process.exit(1);
    }
    const confirmed = await confirm("确定要发布到 GitHub 吗？");
    if (!confirmed) {
      log("已取消发布", "yellow");
      return;
    }
  }

  // 检查并安装依赖
  if (await needsInstall()) {
    logStep("需要安装依赖");
    const installed = await installDependencies();
    if (!installed) {
      logError("依赖安装失败，终止构建");
      process.exit(1);
    }
  } else {
    log("   跳过依赖安装 (已有 node_modules)", "gray");
  }

  // 检查是否需要编译
  if (await needsCompile()) {
    logStep("需要编译");
    const compiled = await compile();
    if (!compiled) {
      logError("编译失败，终止构建");
      process.exit(1);
    }
  } else {
    log("   跳过编译 (已是最新)", "gray");
  }

  // 打包
  const packaged = await packageVsix();
  if (!packaged) {
    logError("打包失败");
    process.exit(1);
  }

  // --install: 本地安装
  if (isInstall) {
    const installed = await installExtension();
    if (!installed) {
      logError("安装失败");
      process.exit(1);
    }
  }

  // --release: 发布到 GitHub
  if (isRelease) {
    await releaseToGitHub();
  }

  log("\n🎉 构建完成!", "green");
}

main();
