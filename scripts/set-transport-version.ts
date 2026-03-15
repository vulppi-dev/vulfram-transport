import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

type PackageJson = {
  name?: string;
  version?: string;
  [key: string]: unknown;
};

const TARGET_PACKAGES = [
  'transport-bun',
  'transport-napi',
  'transport-browser',
] as const;

function printUsage(): void {
  console.log(
    [
      'Usage:',
      '  bun scripts/set-transport-version.ts <version>',
      '',
      'Example:',
      '  bun scripts/set-transport-version.ts 0.18.2-alpha',
    ].join('\n'),
  );
}

function parseVersionArg(argv: string[]): string {
  const raw = argv[2]?.trim();
  if (!raw || raw === '--help' || raw === '-h') {
    printUsage();
    process.exit(raw ? 0 : 1);
  }

  if (/\s/.test(raw)) {
    throw new Error(`Invalid version "${raw}": whitespace is not allowed.`);
  }

  return raw;
}

async function updatePackageVersion(
  rootDir: string,
  packageDirName: string,
  version: string,
): Promise<void> {
  const packagePath = join(rootDir, 'packages', packageDirName, 'package.json');
  const raw = await readFile(packagePath, 'utf8');
  const pkg = JSON.parse(raw) as PackageJson;

  if (!pkg.name) {
    throw new Error(`Missing package name in ${packagePath}`);
  }

  if (pkg.name === '@vulfram/transport-types') {
    throw new Error('transport-types must not be updated by this script.');
  }

  const previous = pkg.version ?? '(undefined)';
  pkg.version = version;

  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log(`${pkg.name}: ${previous} -> ${version}`);
}

async function main(): Promise<void> {
  const version = parseVersionArg(process.argv);
  const rootDir = join(import.meta.dir, '..');

  for (const packageDirName of TARGET_PACKAGES) {
    await updatePackageVersion(rootDir, packageDirName, version);
  }

  console.log('Done.');
}

main().catch((error) => {
  console.error('[set-transport-version] Failed:', error);
  process.exitCode = 1;
});
