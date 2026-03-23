import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import prompts from 'prompts';
import pc from 'picocolors';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Templates ────────────────────────────────────────────
interface TemplateInfo {
  name: string;
  description: string;
  dir: string;
}

const TEMPLATES: TemplateInfo[] = [
  {
    name: 'hello-world',
    description: 'Interactive scene with physics — ground, cube, glowing orb',
    dir: 'hello-world',
  },
  {
    name: 'physics-playground',
    description: 'Throwable objects, collisions, and particle effects',
    dir: 'physics-playground',
  },
  {
    name: 'interactive-gallery',
    description: 'Clickable art panels with portals and ambient audio',
    dir: 'interactive-gallery',
  },
];

// ─── Package Manager Detection ────────────────────────────
function detectPackageManager(): 'pnpm' | 'yarn' | 'npm' {
  const ua = process.env.npm_config_user_agent ?? '';
  if (ua.startsWith('pnpm')) return 'pnpm';
  if (ua.startsWith('yarn')) return 'yarn';
  return 'npm';
}

function installCommand(pm: string): string {
  return pm === 'yarn' ? 'yarn' : `${pm} install`;
}

function devCommand(pm: string): string {
  return pm === 'yarn' ? 'yarn dev' : `${pm} run dev`;
}

// ─── File Operations ──────────────────────────────────────
function copyDir(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function writeProjectPackageJson(projectDir: string, projectName: string): void {
  const pkg = {
    name: projectName,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      three: '^0.170.0',
    },
    devDependencies: {
      vite: '^6.0.0',
    },
  };
  fs.writeFileSync(
    path.join(projectDir, 'package.json'),
    JSON.stringify(pkg, null, 2) + '\n'
  );
}

// ─── Banner ───────────────────────────────────────────────
function printBanner(): void {
  console.log();
  console.log(pc.cyan('  ╔═══════════════════════════════════════════╗'));
  console.log(pc.cyan('  ║') + pc.bold('     🌐 create-holoscript-app              ') + pc.cyan('║'));
  console.log(pc.cyan('  ║') + pc.dim('   The open AI-spatial reality protocol    ') + pc.cyan('║'));
  console.log(pc.cyan('  ╚═══════════════════════════════════════════╝'));
  console.log();
}

// ─── Main ─────────────────────────────────────────────────
async function main(): Promise<void> {
  printBanner();

  const args = process.argv.slice(2);
  const flags = args.filter((a) => a.startsWith('-'));
  const positional = args.filter((a) => !a.startsWith('-'));
  const skipPrompts = flags.includes('--yes') || flags.includes('-y');
  const templateFlag = flags.find((f) => f.startsWith('--template'))
    ? args[args.indexOf('--template') + 1]
    : undefined;

  // ─── Project Name ──────
  let projectName = positional[0];

  if (!projectName && !skipPrompts) {
    const res = await prompts({
      type: 'text',
      name: 'name',
      message: 'Project name:',
      initial: 'my-holoscript-app',
      validate: (v: string) =>
        /^[a-z0-9_-]+$/i.test(v) || 'Only alphanumeric, hyphens, and underscores',
    });
    if (!res.name) {
      console.log(pc.red('\n  ✗ Cancelled.\n'));
      process.exit(1);
    }
    projectName = res.name;
  }

  if (!projectName) {
    projectName = 'my-holoscript-app';
  }

  // ─── Template Selection ──────
  let template = TEMPLATES.find((t) => t.name === templateFlag) ?? TEMPLATES[0];

  if (!templateFlag && !skipPrompts) {
    const res = await prompts({
      type: 'select',
      name: 'template',
      message: 'Choose a template:',
      choices: TEMPLATES.map((t) => ({
        title: `${pc.bold(t.name)}  ${pc.dim('—')} ${t.description}`,
        value: t.name,
      })),
      initial: 0,
    });
    if (!res.template) {
      console.log(pc.red('\n  ✗ Cancelled.\n'));
      process.exit(1);
    }
    template = TEMPLATES.find((t) => t.name === res.template)!;
  }

  // ─── Create Project ──────
  const projectDir = path.resolve(process.cwd(), projectName);

  if (fs.existsSync(projectDir)) {
    const files = fs.readdirSync(projectDir);
    if (files.length > 0) {
      console.log(pc.red(`\n  ✗ Directory "${projectName}" already exists and is not empty.\n`));
      process.exit(1);
    }
  }

  console.log(
    `  ${pc.green('●')} Creating ${pc.bold(projectName)} with ${pc.cyan(template.name)} template...\n`
  );

  // Resolve template directory — templates are siblings to dist/
  const templatesRoot = path.resolve(__dirname, '..', 'templates');
  const templateDir = path.join(templatesRoot, template.dir);

  if (!fs.existsSync(templateDir)) {
    console.error(
      pc.red(`  ✗ Template "${template.name}" not found at ${templateDir}`)
    );
    process.exit(1);
  }

  // Copy template files
  copyDir(templateDir, projectDir);
  console.log(`  ${pc.green('✓')} Scaffolded project structure`);

  // Write package.json — use basename for the npm package name
  const pkgName = path.basename(projectDir).toLowerCase().replace(/[^a-z0-9-_]/g, '-');
  writeProjectPackageJson(projectDir, pkgName);
  console.log(`  ${pc.green('✓')} Generated package.json`);

  // Write holoscript.config.json
  const config = {
    $schema: 'https://holoscript.dev/schema/config.json',
    target: 'webxr',
    entry: 'src/scene.holo',
    output: 'dist/',
  };
  fs.writeFileSync(
    path.join(projectDir, 'holoscript.config.json'),
    JSON.stringify(config, null, 2) + '\n'
  );
  console.log(`  ${pc.green('✓')} Created holoscript.config.json`);

  // ─── Install Dependencies ──────
  const pm = detectPackageManager();

  if (!skipPrompts) {
    console.log();
    console.log(`  ${pc.blue('⧗')} Installing dependencies with ${pc.bold(pm)}...`);
    try {
      execSync(installCommand(pm), {
        cwd: projectDir,
        stdio: 'pipe',
      });
      console.log(`  ${pc.green('✓')} Dependencies installed`);
    } catch {
      console.log(
        `  ${pc.yellow('⚠')} Install failed — run ${pc.bold(installCommand(pm))} manually`
      );
    }
  }

  // ─── Success ──────
  console.log();
  console.log(pc.green('  ✓ Done! Your HoloScript project is ready.'));
  console.log();
  console.log('  Next steps:');
  console.log();
  console.log(`    ${pc.cyan('cd')} ${projectName}`);
  if (skipPrompts) {
    console.log(`    ${pc.cyan(installCommand(pm))}`);
  }
  console.log(`    ${pc.cyan(devCommand(pm))}`);
  console.log();
  console.log(
    `  ${pc.dim('Your scene will open at')} ${pc.bold('http://localhost:5173')} ${pc.dim('🚀')}`
  );
  console.log();
  console.log(
    `  ${pc.dim('Edit')} ${pc.bold('src/scene.holo')} ${pc.dim('and save to see live changes.')}`
  );
  console.log();
}

main().catch((err) => {
  console.error(pc.red(`\n  ✗ ${err.message}\n`));
  process.exit(1);
});
