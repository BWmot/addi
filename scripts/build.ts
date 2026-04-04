#!/usr/bin/env bun
/**
 * Build Script - 构建和发布 VS Code 扩展
 *
 * 用法:
 *   bun run build         - 编译并打包 VSIX
 *   bun run build --release - 编译、打包并发布到 GitHub (需要交互确认)
 *
 * 本地安装: code --install-extension addi-*.vsix
 */

import { rm, readdir, stat, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

// 解析命令行参数
const args = process.argv.slice(2);
const isRelease = args.includes("--release");

const PROJECT_ROOT = dirname(dirname(import.meta.path));
const DIST_DIR = join(PROJECT_ROOT, "dist");

// GitHub API 基础配置
const GITHUB_API_BASE = "https://api.github.com";
const REPO_OWNER = "deepwn";
const REPO_NAME = "addi";

function getGitHubHeaders() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    logWarn("GITHUB_TOKEN 环境变量未设置");
  }
  // GitHub API 使用 Bearer 格式
  return {
    Authorization: token ? `Bearer ${token}` : '',
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'addi-build-script',
  };
}

// 使用 fetch 的通用请求函数
async function githubFetch<T = unknown>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T | null> {
  const url = `${GITHUB_API_BASE}${endpoint}`;
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...getGitHubHeaders(),
        ...options.headers,
      },
    });

    // 记录响应状态用于调试
    if (!response.ok) {
      const errorText = await response.text();
      logError(`GitHub API 错误: ${response.status} ${response.statusText}`);
      logError(`响应内容: ${errorText.substring(0, 200)}`);
    }

    if (response.status === 404) {
      return null;
    }

    const data = await response.json() as T;
    return data;
  } catch (error) {
    // 详细的错误信息
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`GitHub API 请求失败: ${errorMessage}`);
    logError(`请求 URL: ${url}`);
    
    // 检查是否是代理问题
    if (errorMessage.includes("Unable to connect") || errorMessage.includes("ECONNREFUSED")) {
      logWarn("无法连接到 GitHub，可能需要配置代理");
      logWarn("设置代理: $env:HTTPS_PROXY=\"http://127.0.0.1:7890\"");
    }
    
    return null;
  }
}

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
function execCommand(command: string, args: string[], options: { cwd?: string; silent?: boolean } = {}): Promise<{ code: number; output: string }> {
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
      const result = { code: code || 0, output };
      _lastCommandOutput = output; // 保存输出供后续使用
      if (output && !options.silent) {
        console.log(output);
      }
      resolve(result);
    });

    proc.on("error", () => {
      resolve({ code: 1, output: "" });
    });
  });
}

// 全局存储命令输出
let _lastCommandOutput = "";

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

  const result = await execCommand("bun", ["install"]);
  
  if (result.code !== 0) {
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

  const result = await execCommand("bun", ["run", "compile"]);
  
  if (result.code !== 0) {
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
  let result = await execCommand("bun", ["run", "package"]);
  
  if (result.code !== 0) {
    logError("编译失败");
    return false;
  }

  // 使用 vsce 打包
  result = await execCommand("bunx", [
    "@vscode/vsce",
    "package",
    "--baseImagesUrl",
    "https://raw.githubusercontent.com/deepwn/addi/refs/heads/main/",
    "--no-yarn",
    "--no-dependencies",
  ]);

  if (result.code !== 0) {
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

  log(`   版本: ${tag}`, "gray");
  log(`   仓库: ${REPO_OWNER}/${REPO_NAME}`, "gray");

  // 查找 vsix 文件
  const vsixFiles = await readdir(PROJECT_ROOT);
  const vsixFile = vsixFiles.find((f) => f.endsWith(".vsix"));

  if (!vsixFile) {
    logError("未找到 .vsix 文件");
    return false;
  }

  const vsixPath = join(PROJECT_ROOT, vsixFile);
  log(`   VSIX 文件: ${vsixFile}`, "gray");

  const apiUrl = `/repos/${REPO_OWNER}/${REPO_NAME}/releases`;

  // 检查 release 是否已存在
  log("   检查 release 是否存在...", "gray");
  const existingRelease = await getExistingRelease(apiUrl, tag);

  let releaseId: number;
  let uploadUrl: string;

  if (existingRelease) {
    log("   Release 已存在，更新...", "yellow");
    releaseId = existingRelease.id;
    uploadUrl = existingRelease.upload_url;
    // 删除旧的 assets
    await deleteExistingAssets(apiUrl, releaseId);
  } else {
    log("   创建新 Release...", "gray");
    const releaseResult = await createRelease(apiUrl, tag);
    if (!releaseResult) {
      logError("创建 Release 失败");
      return false;
    }
    releaseId = releaseResult.id;
    uploadUrl = releaseResult.upload_url;
  }

  // 上传 VSIX 文件
  log("   上传 VSIX 文件...", "gray");
  const uploadSuccess = await uploadAsset(uploadUrl, vsixFile, vsixPath);
  if (!uploadSuccess) {
    logError("上传 VSIX 文件失败");
    return false;
  }

  logSuccess(`发布成功: https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/${tag}`);
  return true;
}

// 获取已存在的 release
async function getExistingRelease(
  apiUrl: string,
  tag: string
): Promise<{ id: number; upload_url: string } | null> {
  interface ReleaseResponse {
    id: number;
    upload_url: string;
  }

  const data = await githubFetch<ReleaseResponse>(`${apiUrl}/tags/${tag}`);
  if (data?.id) {
    return { id: data.id, upload_url: data.upload_url };
  }
  return null;
}

// 创建新 release
async function createRelease(
  apiUrl: string,
  tag: string
): Promise<{ id: number; upload_url: string } | null> {
  const version = await getVersion();

  interface ReleaseCreateResponse {
    id: number;
    upload_url: string;
    errors?: Array<{ message: string }>;
  }

  const data = await githubFetch<ReleaseCreateResponse>(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tag_name: tag,
      target_commitish: "main",
      name: `v${version}`,
      body: `Release v${version}\n\nInstall this extension in VS Code:\n1. Download the .vsix file\n2. Run "Extensions: Install from VSIX" in VS Code`,
      draft: false,
      prerelease: false,
    }),
  });

  if (data?.id) {
    return { id: data.id, upload_url: data.upload_url };
  }
  if (data?.errors) {
    logError(`创建 Release 失败: ${JSON.stringify(data.errors)}`);
  }
  return null;
}

// 删除已存在的 assets
async function deleteExistingAssets(apiUrl: string, releaseId: number): Promise<void> {
  interface Asset {
    id: number;
    name: string;
  }

  const assets = await githubFetch<Asset[]>(`${apiUrl}/${releaseId}/assets`);
  if (assets) {
    for (const asset of assets) {
      log(`   删除旧资产: ${asset.name}`, "gray");
      await githubFetch(`${apiUrl}/${releaseId}/assets/${asset.id}`, {
        method: "DELETE",
      });
    }
  }
}

// 上传 asset (使用完整 URL，不经过 githubFetch)
async function uploadAsset(
  uploadUrl: string,
  fileName: string,
  filePath: string
): Promise<boolean> {
  // 替换模板中的 {name}
  const uploadEndpoint = uploadUrl.replace(
    "{?name,label}",
    `?name=${encodeURIComponent(fileName)}`
  );

  log(`   上传地址: ${uploadEndpoint}`, "gray");

  // 读取文件内容
  const fileContent = await readFile(filePath);

  interface AssetResponse {
    id: number;
    errors?: Array<{ message: string }>;
  }

  // 直接使用 fetch，不加 base URL
  try {
    const response = await fetch(uploadEndpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/octet-stream",
      },
      body: fileContent,
    });

    if (!response.ok) {
      const errorText = await response.text();
      logError(`上传失败: ${response.status} ${response.statusText}`);
      logError(`响应: ${errorText.substring(0, 200)}`);
      return false;
    }

    const data = await response.json() as AssetResponse;
    if (data?.id) {
      return true;
    }
    if (data?.errors) {
      logError(`上传失败: ${JSON.stringify(data.errors)}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logError(`上传请求失败: ${errorMessage}`);
    
    if (errorMessage.includes("Unable to connect") || errorMessage.includes("ECONNREFUSED")) {
      logWarn("无法连接到 GitHub，请检查网络或配置代理");
    }
  }

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

  // --release: 发布到 GitHub
  if (isRelease) {
    await releaseToGitHub();
  }

  log("\n🎉 构建完成!", "green");
}

main();
