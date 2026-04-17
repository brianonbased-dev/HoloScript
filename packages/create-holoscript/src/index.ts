import path from 'node:path';
import prompts from 'prompts';
import pc from 'picocolors';
import {
  TEMPLATES,
  detectPackageManager,
  installCommand,
  devCommand,
  validateProjectName,
  normalizePackageName,
  copyDir,
  writeProjectPackageJson,
  writeHoloscriptConfig,
  parseArgs,
  resolveTemplate,
  checkProjectDir,
  serveDir,
  openBrowser,
} from './scaffold.js';
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Banner ───────────────────────────────────────────────
function printBanner(): void {
  console.log();
  console.log(pc.cyan('  ╔═══════════════════════════════════════════╗'));
  console.log(
    pc.cyan('  ║') + pc.bold('     🌐 create-holoscript-app              ') + pc.cyan('║')
  );
  console.log(
    pc.cyan('  ║') + pc.dim('   The open AI-spatial reality protocol    ') + pc.cyan('║')
  );
  console.log(pc.cyan('  ╚═══════════════════════════════════════════╝'));
  console.log();
}

// ─── Main ─────────────────────────────────────────────────
async function main(): Promise<void> {
  printBanner();

  const parsed = parseArgs(process.argv);
  let { projectName } = parsed;
  const { skipPrompts, templateFlag, goMode, port } = parsed;

  // ─── Project Name ──────
  if (!projectName && !skipPrompts) {
    const res = await prompts({
      type: 'text',
      name: 'name',
      message: 'Project name:',
      initial: 'my-holoscript-app',
      validate: (v: string) => {
        const result = validateProjectName(v);
        return result === true ? true : result;
      },
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
  let template = resolveTemplate(templateFlag);

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

  const dirCheck = checkProjectDir(projectDir);
  if (!dirCheck.ok) {
    console.log(pc.red(`\n  ✗ Directory "${projectName}" already exists and is not empty.\n`));
    process.exit(1);
  }

  console.log(
    `  ${pc.green('●')} Creating ${pc.bold(projectName)} with ${pc.cyan(template.name)} template...\n`
  );

  // Resolve template directory — templates are siblings to dist/
  const templatesRoot = path.resolve(__dirname, '..', 'templates');
  const templateDir = path.join(templatesRoot, template.dir);

  if (!fs.existsSync(templateDir)) {
    console.error(pc.red(`  ✗ Template "${template.name}" not found at ${templateDir}`));
    process.exit(1);
  }

  // Copy template files
  copyDir(templateDir, projectDir);
  console.log(`  ${pc.green('✓')} Scaffolded project structure`);

  // Write package.json — use basename for the npm package name
  const pkgName = normalizePackageName(path.basename(projectDir));
  writeProjectPackageJson(projectDir, pkgName, template.name);
  console.log(`  ${pc.green('✓')} Generated package.json`);

  // Write holoscript.config.json
  writeHoloscriptConfig(projectDir);
  console.log(`  ${pc.green('✓')} Created holoscript.config.json`);

  // ─── Install Dependencies ──────
  const pm = detectPackageManager();
  const isInstant = template.name === 'instant';

  if (!isInstant && !skipPrompts) {
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

  // ─── --go mode: serve + open browser immediately ──────
  if (goMode && isInstant) {
    console.log();
    console.log(`  ${pc.blue('⧗')} Starting dev server...`);
    try {
      const { port: boundPort } = await serveDir(projectDir, port ?? 3030);
      const url = `http://localhost:${boundPort}`;
      console.log(`  ${pc.green('✓')} Serving at ${pc.bold(url)}`);
      await openBrowser(url);
      console.log();
      console.log(pc.green('  ✓ Your HoloScript scene is live.'));
      console.log();
      console.log(`  ${pc.dim('Press')} ${pc.bold('Ctrl+C')} ${pc.dim('to stop the server.')}`);
      console.log(
        `  ${pc.dim('Edit')} ${pc.bold(path.join(projectName, 'src/scene.holo'))} ${pc.dim('to change the scene.')}`
      );
      console.log();
      // Keep the process alive so the server stays up.
      process.stdin.resume();
      return;
    } catch (err) {
      console.log(
        `  ${pc.yellow('⚠')} Auto-serve failed (${(err as Error).message}) — falling back to manual steps.`
      );
      // Fall through to manual instructions below.
    }
  }

  // ─── Success ──────
  console.log();
  console.log(pc.green('  ✓ Done! Your HoloScript project is ready.'));
  console.log();
  console.log('  Next steps:');
  console.log();
  console.log(`    ${pc.cyan('cd')} ${projectName}`);

  if (isInstant) {
    console.log(`    ${pc.cyan('npx serve .')}  ${pc.dim('(or python -m http.server 8000)')}`);
    console.log();
    console.log(
      `  ${pc.dim('Open')} ${pc.bold('http://localhost:3000')} ${pc.dim('in your browser')}`
    );
    console.log();
    console.log(
      `  ${pc.dim('Tip: use')} ${pc.bold('npx create-holoscript <name> --go')} ${pc.dim('to scaffold + serve + open in one step.')}`
    );
  } else {
    if (skipPrompts) {
      console.log(`    ${pc.cyan(installCommand(pm))}`);
    }
    console.log(`    ${pc.cyan(devCommand(pm))}`);
    console.log();
    console.log(
      `  ${pc.dim('Your scene will open at')} ${pc.bold('http://localhost:5173')}`
    );
  }

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
