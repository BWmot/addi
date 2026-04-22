#!/usr/bin/env bun
/**
 * Clean Script - 清理项目构建缓存和临时文件
 *
 * 用法:
 *   bun run clean          - 清理 dist 和 out 目录
 *   bun run clean --all    - 清理所有缓存包括 node_modules、.vscode-test、.vsix
 */

import { rm, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

interface CleanTarget {
  name: string;
  path: string;
  isFile?: boolean;
  pattern?: RegExp;
}

// 解析命令行参数
const args = process.argv.slice(2);
const isAll = args.includes("--all");

console.log("\n🧹 清理项目缓存和构建文件...\n");

// 需要清理的目录
const dirsToClean: CleanTarget[] = [
  { name: "dist (Bun 构建输出)", path: "dist" },
  { name: "out (TypeScript 编译输出)", path: "out" },
];

// --all 参数额外清理的内容
if (isAll) {
  dirsToClean.push(
    { name: ".vscode-test (VS Code 测试缓存)", path: ".vscode-test" },
    { name: "node_modules (依赖目录)", path: "node_modules" },
  );
}

// 需要清理的文件模式
const filesToClean: CleanTarget[] = [
  { name: "*.vsix (VS Code 扩展包)", path: ".", pattern: /\.vsix$/ },
];

// 递归获取目录大小
async function getDirSize(dirPath: string): Promise<number> {
  if (!existsSync(dirPath)) {
    return 0;
  }

  let size = 0;
  try {
    const files = await readdir(dirPath);

    for (const file of files) {
      const filePath = join(dirPath, file);
      try {
        const stats = await stat(filePath);

        if (stats.isDirectory()) {
          size += await getDirSize(filePath);
        } else {
          size += stats.size;
        }
      } catch {
        // 忽略无法访问的文件
      }
    }
  } catch {
    // 忽略无法访问的目录
  }

  return size;
}

// 清理目录
async function cleanDir(target: CleanTarget): Promise<number> {
  if (!existsSync(target.path)) {
    console.log(`⚪ ${target.name}: 未找到 (无需清理)`);
    return 0;
  }

  const size = await getDirSize(target.path);

  if (size > 0) {
    console.log(`📁 ${target.name}: ${(size / 1024 / 1024).toFixed(2)} MB`);
  } else {
    console.log(`📁 ${target.name}: (空目录)`);
  }

  try {
    await rm(target.path, { recursive: true, force: true });
    console.log(`   ✅ 已删除`);
    return size;
  } catch (e) {
    console.error(`   ❌ 删除失败: ${(e as Error).message}`);
    return 0;
  }
}

// 清理文件
async function cleanFiles(target: CleanTarget): Promise<number> {
  if (!target.pattern) {
    return 0;
  }

  let totalSize = 0;
  let found = false;

  try {
    const files = await readdir(target.path);

    for (const file of files) {
      if (target.pattern!.test(file)) {
        found = true;
        const filePath = join(target.path, file);
        const stats = await stat(filePath);
        totalSize += stats.size;
        console.log(`📄 ${file}: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

        try {
          await rm(filePath);
          console.log(`   ✅ 已删除`);
        } catch (e) {
          console.error(`   ❌ 删除失败: ${(e as Error).message}`);
        }
      }
    }
  } catch (e) {
    console.error(`   ❌ 扫描失败: ${(e as Error).message}`);
  }

  if (!found) {
    console.log(`⚪ ${target.name}: 未找到`);
  }

  return totalSize;
}

async function main() {
  let totalSize = 0;

  // 清理目录
  for (const dir of dirsToClean) {
    totalSize += await cleanDir(dir);
  }

  // 清理文件
  for (const file of filesToClean) {
    totalSize += await cleanFiles(file);
  }

  console.log(
    `\n🎉 清理完成! 释放空间: ${(totalSize / 1024 / 1024).toFixed(2)} MB`,
  );
}

main();
