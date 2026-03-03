import fs from 'fs';
import path from 'path';

interface Options {
  targetPath: string;
  recurse: boolean;
}

interface FileStats {
  file: string;
  lines: number;
  characters: number;
}

/**
 * 解析命令行参数
 */
function parseArgs(): Options {
  const args = process.argv.slice(2);
  let targetPath = './src'; // 默认路径
  let recurse = false;

  for (let i = 0; i < args.length; i++) {
    if ((args[i] === '--path' || args[i] === '-p') && i + 1 < args.length) {
      targetPath = args[++i];
    } else if (args[i] === '--recurse' || args[i] === '-r') {
      recurse = true;
    }
  }
  return { targetPath, recurse };
}

/**
 * 判断是否为目录
 */
function isDirectory(filePath: string): boolean {
  return fs.statSync(filePath).isDirectory();
}

/**
 * 递归或非递归获取所有文件路径
 */
function getFiles(dir: string, recurse: boolean): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const item of list) {
    const filePath = path.join(dir, item);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory() && recurse) {
      results = results.concat(getFiles(filePath, recurse));
    } else if (stat.isFile()) {
      results.push(filePath);
    }
  }
  return results;
}

/**
 * 统计单个文件的行数和字符数
 */
function countFileStats(filePath: string): FileStats | null {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').length;
    const characters = content.length;
    return { file: filePath, lines, characters };
  } catch (err) {
    console.error(`无法读取文件 ${filePath}: ${(err as Error).message}`);
    return null;
  }
}

function main() {
  const options = parseArgs();
  const absolutePath = path.isAbsolute(options.targetPath)
    ? options.targetPath
    : path.resolve(process.cwd(), options.targetPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`路径不存在: ${absolutePath}`);
    process.exit(1);
  }
  if (!isDirectory(absolutePath)) {
    console.error(`路径不是一个目录: ${absolutePath}`);
    process.exit(1);
  }

  const files = getFiles(absolutePath, options.recurse);
  if (files.length === 0) {
    console.log('未找到任何文件。');
    return;
  }

  const stats = files.map(countFileStats).filter((s): s is FileStats => s !== null); // 过滤掉读取失败的文件

  if (stats.length === 0) {
    console.log('没有成功读取的文件。');
    return;
  }

  // 输出表格
  console.table(stats);

  // 计算总计
  const totalFiles = stats.length;
  const totalLines = stats.reduce((acc, s) => acc + s.lines, 0);
  const totalChars = stats.reduce((acc, s) => acc + s.characters, 0);
  console.log(`\n总计: ${totalFiles} 个文件, ${totalLines} 行, ${totalChars} 字符`);
}

main();
