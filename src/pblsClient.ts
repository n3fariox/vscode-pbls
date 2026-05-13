'use strict';

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import * as vscode from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from 'vscode-languageclient/node';
import { getApi, FileDownloader } from '@microsoft/vscode-file-downloader-api';

type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVELS: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

let client: LanguageClient | undefined;
let outputChannel: vscode.OutputChannel;
let fileDownloader: FileDownloader | undefined;
let pblsFailed: boolean = false;
let pblsFailedNotified: boolean = false;

function getLogLevel(): LogLevel {
  const config = vscode.workspace.getConfiguration('pbls');
  const level = config.get<string>('logLevel');
  if (level === 'error' || level === 'warn' || level === 'info' || level === 'debug') {
    return level;
  }
  return 'info';
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] <= LOG_LEVELS[getLogLevel()];
}

function log(level: LogLevel, message: string): void {
  if (!shouldLog(level)) return;
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('pbls');
  }
  const prefix =
    level === 'error' ? 'ERROR' : level === 'warn' ? 'WARN' : level === 'debug' ? 'DEBUG' : 'INFO';
  outputChannel.appendLine(`[${new Date().toISOString()}] [${prefix}] ${message}`);
}

function isPblsAvailable(pblsPath: string): boolean {
  try {
    fs.accessSync(pblsPath, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

interface GithubAsset {
  name: string;
  browser_download_url: string;
}

interface GithubRelease {
  tag_name: string;
  assets: GithubAsset[];
}

async function getLatestRelease(): Promise<GithubRelease | undefined> {
  return new Promise(resolve => {
    log('info', 'Fetching latest pbls release...');
    const url = 'https://api.github.com/repos/rcorre/pbls/releases/latest';
    const lib = url.startsWith('https') ? require('https') : require('http');

    const req = lib.get(url, { headers: { 'User-Agent': 'vscode-proto3' } }, (res: any) => {
      if (res.statusCode !== 200) {
        log('error', `Failed to fetch release: HTTP ${res.statusCode}`);
        resolve(undefined);
        return;
      }
      let data = '';
      res.on('data', (chunk: string) => (data += chunk));
      res.on('end', () => {
        try {
          const release = JSON.parse(data);
          log('info', `Latest release: ${release.tag_name}`);
          resolve(release);
        } catch (e) {
          log('error', `Failed to parse release response: ${e}`);
          resolve(undefined);
        }
      });
    });
    req.on('error', (err: Error) => {
      log('error', `Failed to fetch release: ${err.message}`);
      resolve(undefined);
    });
  });
}

function findAssetForPlatform(assets: GithubAsset[]): GithubAsset | undefined {
  const platform = os.platform();
  const arch = os.arch();

  let pattern: string | undefined;

  if (platform === 'linux') {
    if (arch === 'x64') pattern = 'linux.tar.xz';
    else if (arch === 'arm64') pattern = 'linux-aarch64.tar.xz';
  } else if (platform === 'darwin') {
    if (arch === 'x64') pattern = 'macos.tar.xz';
    else if (arch === 'arm64') pattern = 'macos-aarch64.tar.xz';
  } else if (platform === 'win32') {
    if (arch === 'x64') pattern = 'windows.zip';
  }

  if (!pattern) return undefined;

  return assets.find(a => a.name.endsWith(pattern!));
}

function extractTarXz(tarPath: string, destDir: string): string | undefined {
  try {
    log('info', `Extracting ${tarPath}...`);
    cp.execSync(`tar -xf "${tarPath}" -C "${destDir}"`, { stdio: 'pipe' });

    const files = fs.readdirSync(destDir);
    const binary = files.find(f => f === 'pbls' || f.startsWith('pbls-'));

    if (binary) {
      const binaryPath = path.join(destDir, binary);
      if (os.platform() !== 'win32') {
        fs.chmodSync(binaryPath, 0o755);
      }
      log('info', `Extracted to ${binaryPath}`);
      return binaryPath;
    }
    log('error', 'Could not find pbls binary in extracted files');
    return undefined;
  } catch (err) {
    log('error', `Extraction failed: ${err}`);
    return undefined;
  }
}

function extractZip(zipPath: string, destDir: string): string | undefined {
  try {
    log('info', `Extracting ${zipPath}...`);
    if (os.platform() === 'win32') {
      cp.execSync(
        `powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${destDir}' -Force"`,
        { stdio: 'pipe' }
      );
    } else {
      cp.execSync(`unzip -o "${zipPath}" -d "${destDir}"`, { stdio: 'pipe' });
    }

    const files = fs.readdirSync(destDir);
    const binary = files.find(f => f === 'pbls.exe' || f.startsWith('pbls-'));

    if (binary) {
      const binaryPath = path.join(destDir, binary);
      log('info', `Extracted to ${binaryPath}`);
      return binaryPath;
    }
    log('error', 'Could not find pbls binary in extracted files');
    return undefined;
  } catch (err) {
    log('error', `Extraction failed: ${err}`);
    return undefined;
  }
}

export async function startPblsClient(ctx: vscode.ExtensionContext): Promise<boolean> {
  if (pblsFailed) {
    if (!pblsFailedNotified) {
      log('info', 'pbls previously failed to start, not retrying');
      pblsFailedNotified = true;
    }
    return false;
  }

  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('pbls');
  }

  const config = vscode.workspace.getConfiguration('pbls');
  const customPath = config.get<string>('path');
  const isDefaultPath = !customPath || customPath === 'pbls';

  let pblsPath: string = '';

  if (!isDefaultPath) {
    pblsPath = customPath!;
    log('info', `Using custom pbls path: ${pblsPath}`);

    const exists = fs.existsSync(pblsPath);
    if (!exists) {
      log('error', `pbls not found at custom path: ${pblsPath}`);
      vscode.window.showErrorMessage(`pbls not found at "${pblsPath}".`);
      return false;
    }
    if (!isPblsAvailable(pblsPath)) {
      log('error', `pbls at custom path is broken: ${pblsPath}`);
      vscode.window.showErrorMessage(`pbls at "${pblsPath}" exists but failed to run.`);
      pblsFailed = true;
      return false;
    }
    log('info', `pbls found at custom path`);
  } else {
    if (isPblsAvailable('pbls')) {
      pblsPath = 'pbls';
      log('info', 'pbls found on PATH');
    } else {
      log('info', 'pbls not found on PATH, checking common locations...');
      log('debug', `PATH environment variable: ${process.env.PATH}`);

      // Check common installation locations
      const commonPaths = [
        path.join(os.homedir(), '.cargo', 'bin', 'pbls'),
        path.join(os.homedir(), '.local', 'bin', 'pbls'),
        '/usr/local/bin/pbls',
        '/opt/homebrew/bin/pbls',
      ];
      if (os.platform() === 'win32') {
        commonPaths.push(path.join(os.homedir(), '.cargo', 'bin', 'pbls.exe'));
      }

      let found = false;
      for (const p of commonPaths) {
        log('debug', `Checking common path: ${p}`);
        if (fs.existsSync(p)) {
          log('debug', `  File exists, checking if pbls is available...`);
          if (isPblsAvailable(p)) {
            pblsPath = p;
            log('info', `pbls found at common location: ${p}`);
            found = true;
            break;
          } else {
            log('debug', `  pbls not available at ${p}`);
          }
        } else {
          log('debug', `  File does not exist`);
        }
      }

      if (!found) {
        const binaryName = os.platform() === 'win32' ? 'pbls.exe' : 'pbls';
        const cachedPath = path.join(ctx.globalStorageUri.fsPath, binaryName);

        if (fs.existsSync(cachedPath)) {
          pblsPath = cachedPath;
          if (!isPblsAvailable(pblsPath)) {
            log('error', `Cached pbls is broken, removing: ${cachedPath}`);
            fs.unlinkSync(cachedPath);
            pblsFailed = true;
            vscode.window.showErrorMessage(
              'Cached pbls is broken. Please reload the window to download a fresh copy.'
            );
            return false;
          }
          log('info', `Using cached pbls at ${cachedPath}`);
        } else {
          log('info', 'pbls not found, attempting auto-download...');

          const release = await getLatestRelease();
          if (!release) {
            log('error', 'Failed to fetch release info');
            vscode.window.showErrorMessage('Failed to determine latest pbls version.');
            return false;
          }

          const asset = release.assets ? findAssetForPlatform(release.assets) : undefined;
          if (!asset) {
            log('error', `Unsupported platform: ${os.platform()} ${os.arch()}`);
            const result = await vscode.window.showErrorMessage(
              `pbls not found and automatic download is not supported for your platform (${os.platform()} ${os.arch()}).`,
              'Download manually'
            );
            if (result === 'Download manually') {
              await vscode.env.openExternal(
                vscode.Uri.parse('https://github.com/rcorre/pbls/releases')
              );
            }
            return false;
          }

          const download = await vscode.window.showInformationMessage(
            'pbls language server not found. Download it automatically?',
            'Yes',
            'No'
          );

          if (download !== 'Yes') {
            log('info', 'User declined auto-download');
            return false;
          }

          vscode.window.showInformationMessage('Downloading pbls...');
          log('info', `Downloading from ${asset.browser_download_url}...`);

          try {
            if (!fileDownloader) {
              fileDownloader = await getApi();
            }

            const downloadedUri = await fileDownloader.downloadFile(
              vscode.Uri.parse(asset.browser_download_url),
              asset.name,
              ctx
            );

            log('info', `Downloaded to ${downloadedUri.fsPath}`);

            let extractedPath: string | undefined;
            if (asset.name.endsWith('.tar.xz')) {
              extractedPath = extractTarXz(downloadedUri.fsPath, ctx.globalStorageUri.fsPath);
            } else if (asset.name.endsWith('.zip')) {
              extractedPath = extractZip(downloadedUri.fsPath, ctx.globalStorageUri.fsPath);
            }

            if (fs.existsSync(downloadedUri.fsPath)) {
              fs.unlinkSync(downloadedUri.fsPath);
            }

            if (!extractedPath) {
              vscode.window.showErrorMessage(
                'Failed to extract pbls. Check the pbls output channel for details.'
              );
              return false;
            }

            fs.renameSync(extractedPath, cachedPath);
            pblsPath = cachedPath;
            log('info', `pbls downloaded and extracted to ${cachedPath}`);
            vscode.window.showInformationMessage('pbls downloaded successfully.');
          } catch (err: any) {
            log('error', `Download failed: ${err.message || err}`);
            vscode.window.showErrorMessage(
              'Failed to download pbls. Check the pbls output channel for details.'
            );
            return false;
          }
        }
      }
    }
  }

  log('info', `Starting pbls language server from: ${pblsPath}`);

  // Check if protoc is available (pbls uses it for validation)
  try {
    cp.execSync('protoc --version', { stdio: 'ignore' });
    log('info', 'protoc found');
  } catch {
    log('warn', 'protoc not found - pbls validation will be limited');
    vscode.window.showWarningMessage(
      'protoc not found. Install it for full pbls validation support.'
    );
  }

  const logLevel = getLogLevel();

  const serverOptions: ServerOptions = {
    command: pblsPath,
    args: [],
    transport: TransportKind.stdio,
    options: {
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd(),
      env: {
        ...process.env,
        RUST_LOG: logLevel,
      },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: 'file', language: 'proto3' }],
    synchronize: {
      fileEvents: vscode.workspace.createFileSystemWatcher('**/*.proto'),
    },
    outputChannel: outputChannel,
  };

  client = new LanguageClient('pbls', 'Protobuf Language Server', serverOptions, clientOptions);
  ctx.subscriptions.push(client);
  try {
    await client.start();
    return true;
  } catch (err: any) {
    log('error', `Failed to start pbls: ${err.message || err}`);
    pblsFailed = true;
    client = undefined;
    return false;
  }
}

export async function stopPblsClient(): Promise<void> {
  if (client) {
    await client.stop();
    client = undefined;
  }
}

export async function restartPblsClient(ctx: vscode.ExtensionContext): Promise<void> {
  await stopPblsClient();
  pblsFailed = false;
  pblsFailedNotified = false;
  const started = await startPblsClient(ctx);
  if (!started || !client) {
    throw new Error('Failed to start pbls. Check the pbls output channel for details.');
  }
}
